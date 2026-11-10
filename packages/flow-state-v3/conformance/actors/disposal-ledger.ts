import { Option, Predicate } from "effect";
import { Fact, holdUse } from "../dsl/oracle.ts";
import { operationNamed, type Reference } from "../fixtures/reference.ts";
import {
  type ActorRef,
  type Channel,
  type Json,
  Observation,
  sameActor,
  sameJson,
  type Use,
} from "../port.ts";
import { type Answer, type Request, RequestPhase } from "../world/network.ts";

/**
 * Where a write's Attempt stands, as the suite's facts show it: minted and never sent, sent with
 * no answer yet, answered unknown (or StillUnknown), or settled (a definite answer, an ending
 * before any send, a cancel the suite drove, or the runtime's release).
 *
 * **Gotchas**
 *
 * - `Settled` is terminal: nothing the ledger learns moves an Attempt out of it.
 */
export type Phase = "Minted" | "Sent" | "Unsure" | "Settled";

/**
 * One write lane: its owner, operation, and the values of its key fields in their declared order.
 */
export type LaneId = {
  readonly owner: ActorRef;
  readonly operation: string;
  readonly key: ReadonlyArray<Json>;
};

/**
 * Whether two {@link LaneId}s name the same lane; key values compare as JSON values.
 */
export const sameLane = (a: LaneId, b: LaneId) =>
  sameActor(a.owner, b.owner) && a.operation === b.operation && sameJson(a.key, b.key);

/**
 * One Attempt of a write the ledger follows.
 */
export type Attempt = {
  readonly owner: ActorRef;
  readonly operation: string;
  readonly phase: Phase;
};

/**
 * An Attempt by its id, as the disposal checks hold it.
 */
export type Owed = { readonly id: string; readonly attempt: Attempt };

/**
 * The Attempts of a case's writes and each lane's newest sent one, learned fact by fact.
 *
 * **Details**
 *
 * - `heads`: per lane, the Attempt the server received last.
 * - `uses`: the uses the suite holds.
 */
export type Ledger = {
  readonly attempts: Map<string, Attempt>;
  readonly heads: Array<{ readonly lane: LaneId; readonly id: string }>;
  readonly uses: Array<readonly [ActorRef, Use]>;
};

/**
 * An empty ledger.
 */
// RETURN_TYPE: the Ledger record; inference would widen its empty collections.
export const freshLedger = (): Ledger => ({ attempts: new Map(), heads: [], uses: [] });

const keyFieldsOf = (input: Json, fields: ReadonlyArray<string>) =>
  fields.map((field) =>
    Predicate.isObjectKeyword(input) && !Array.isArray(input)
      ? (Object.entries(input).find(([key]) => key === field)?.[1] ?? null)
      : null,
  );

/**
 * The lane a write's input or key names: its key fields' values, by the fixture's reference.
 */
export const laneOf = (owner: ActorRef, reference: Reference, operation: string, key: Json) => {
  const fields = Option.match(operationNamed(reference, operation), {
    onNone: () => [],
    onSome: (o) => o.keyFields,
  });

  return { owner, operation, key: keyFieldsOf(key, fields) };
};

/**
 * The lane whose newest sent Attempt is `id`, if any.
 */
export const laneOfHead = (ledger: Ledger, id: string) =>
  Option.fromUndefinedOr(ledger.heads.find((h) => h.id === id)?.lane);

const ON_SENT: Readonly<Record<Phase, Phase>> = {
  Minted: "Sent",
  Sent: "Unsure",
  Unsure: "Unsure",
  Settled: "Settled",
};

const ON_ANSWER: Readonly<Record<Phase, Readonly<Record<Channel, Phase>>>> = {
  Minted: { success: "Minted", failure: "Minted", unknown: "Minted" },
  Sent: { success: "Settled", failure: "Settled", unknown: "Unsure" },
  Unsure: { success: "Settled", failure: "Unsure", unknown: "Unsure" },
  Settled: { success: "Settled", failure: "Settled", unknown: "Settled" },
};

const ON_ENDED: Readonly<Record<Phase, Phase>> = {
  Minted: "Settled",
  Sent: "Sent",
  Unsure: "Unsure",
  Settled: "Settled",
};

const move = (ledger: Ledger, id: string, next: (was: Phase) => Phase) => {
  const was = ledger.attempts.get(id);

  if (was !== undefined) ledger.attempts.set(id, { ...was, phase: next(was.phase) });
};

const answered = (ledger: Ledger, reference: Reference, request: Request, answer: Answer) => {
  for (const id of Option.toArray(request.key))
    move(ledger, id, (was) => {
      const channel = Option.match(operationNamed(reference, request.operation), {
        onNone: () => "unknown" as const,
        onSome: (o) => o.classify(answer, was === "Unsure"),
      });

      return ON_ANSWER[was][channel];
    });
};

const sent = (ledger: Ledger, reference: Reference, request: Request) => {
  const id = Option.getOrUndefined(request.key);
  const attempt = id === undefined ? undefined : ledger.attempts.get(id);

  if (id === undefined || attempt === undefined) return;

  move(ledger, id, (was) => ON_SENT[was]);
  const lane = laneOf(attempt.owner, reference, request.operation, request.input);
  const at = ledger.heads.findIndex((h) => sameLane(h.lane, lane));

  ledger.heads.splice(at < 0 ? ledger.heads.length : at, at < 0 ? 0 : 1, { lane, id });

  if (RequestPhase.$is("Answered")(request.phase))
    answered(ledger, reference, request, request.phase.answer);
};

const cancelled = (ledger: Ledger, reference: Reference, actor: ActorRef, event: string) => {
  for (const { id } of ledger.heads) {
    const attempt = ledger.attempts.get(id);

    const cancels =
      attempt !== undefined &&
      sameActor(attempt.owner, actor) &&
      Option.exists(operationNamed(reference, attempt.operation), (o) =>
        Object.hasOwn(o.cancels, event),
      );

    if (cancels) move(ledger, id, () => "Settled");
  }
};

const minted = (ledger: Ledger, reference: Reference, observation: Observation) => {
  if (!Observation.$is("Minted")(observation) || Option.isNone(observation.actor)) return;
  const write = Option.exists(operationNamed(reference, observation.operation), (o) => o.attempts);

  if (write && !ledger.attempts.has(observation.attempt))
    ledger.attempts.set(observation.attempt, {
      owner: observation.actor.value,
      operation: observation.operation,
      phase: "Minted",
    });
};

const used = (ledger: Ledger, owner: ActorRef) => ledger.uses.some(([a]) => sameActor(a, owner));

const claimed = (ledger: Ledger, id: string, kind: string) => {
  const owner = ledger.attempts.get(id)?.owner;

  if (kind === "Superseded") return ledger.attempts.get(id)?.phase === "Minted";

  return kind === "Released" && owner !== undefined && used(ledger, owner);
};

const reportedOn = (ledger: Ledger, reference: Reference, observation: Observation) => {
  minted(ledger, reference, observation);

  if (Observation.$is("Ended")(observation))
    for (const id of Option.toArray(observation.attempt)) move(ledger, id, (was) => ON_ENDED[was]);

  if (Observation.$is("Evidence")(observation))
    for (const id of Option.toArray(observation.attempt))
      if (claimed(ledger, id, observation.kind)) move(ledger, id, () => "Settled");
};

const reloaded = (ledger: Ledger) => {
  for (const [id, attempt] of ledger.attempts) {
    if (attempt.phase === "Minted") ledger.attempts.delete(id);

    if (attempt.phase === "Sent") ledger.attempts.set(id, { ...attempt, phase: "Unsure" });
  }
};

const nothing = () => {};

/**
 * Teaches the ledger one fact of the timeline.
 *
 * **Details**
 *
 * - A request the server received sends its Attempt and makes it its lane's head; an answer on a
 *   live page moves it by the channel its commit gives that answer.
 * - A runtime's `Minted` adds an Attempt; an `Ended` before any send settles it; `Superseded`
 *   evidence settles one never sent (only a queued commit or a never-sent head is replaced), and so
 *   does `Released` while the suite holds a use of its actor, whose
 *   handler may cancel (the runtime's claim). An actor with no use runs no handler, so a release
 *   then settles nothing.
 * - An event the suite sent that the reference says cancels the operation settles its heads.
 * - A reload drops never-sent Attempts (they died with the page) and holds a call that was on
 *   the wire, since its page is gone.
 */
export const learn = (ledger: Ledger, reference: Reference, fact: Fact) => {
  ledger.uses.splice(0, ledger.uses.length, ...holdUse(ledger.uses, fact));

  Fact.$match(fact, {
    Stepped: nothing,
    Requested: ({ request }) => sent(ledger, reference, request),
    Answered: ({ request, answer }) => {
      if (!RequestPhase.$is("Orphaned")(request.phase))
        answered(ledger, reference, request, answer);
    },
    Reported: ({ observation }) => reportedOn(ledger, reference, observation),
    Reloaded: () => reloaded(ledger),
    Disposed: nothing,
    Forgot: nothing,
    Ensured: nothing,
    Released: nothing,
    DisposingRuntime: nothing,
    Drove: ({ actor, event }) => cancelled(ledger, reference, actor, event),
    Unstoppable: nothing,
    Advanced: nothing,
    Read: nothing,
  });
};

/**
 * The lane heads that are Held or on the wire.
 */
export const openHeads = (ledger: Ledger) =>
  ledger.heads.flatMap(({ id }) => {
    const attempt = ledger.attempts.get(id);

    return attempt !== undefined && (attempt.phase === "Sent" || attempt.phase === "Unsure")
      ? [{ id, attempt }]
      : [];
  });

/**
 * A name for an Attempt in a violation: its operation, id and owner.
 */
export const named = ({ id, attempt }: Owed) =>
  `${attempt.operation} ${id} of ${attempt.owner.machine}/${attempt.owner.id}`;
