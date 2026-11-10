import { Option, Predicate } from "effect";
import { Fact, type Facts, type Oracle, steps, usesHeld } from "../dsl/oracle.ts";
import { operationNamed, type Reference } from "../fixtures/reference.ts";
import { type ActorRef, type Json, Observation, sameActor } from "../port.ts";
import { type Answer, type Request, RequestPhase } from "../world/network.ts";

type Phase = "Minted" | "Sent" | "Unsure" | "Settled";

type Attempt = { readonly owner: ActorRef; readonly operation: string; readonly phase: Phase };

type Owed = { readonly id: string; readonly attempt: Attempt };

type Life =
  | { readonly _tag: "Live" }
  | {
      readonly _tag: "Disposing";
      readonly since: string;
      readonly held: ReadonlyArray<Owed>;
      readonly unsent: ReadonlyArray<Owed>;
      readonly ended: Set<string>;
    };

type Ledger = {
  readonly attempts: Map<string, Attempt>;
  readonly heads: Map<string, string>;
};

const fieldsOf = (input: Json, fields: ReadonlyArray<string>) =>
  fields.map((field) =>
    Predicate.isObjectKeyword(input)
      ? (Object.entries(input).find(([key]) => key === field)?.[1] ?? null)
      : null,
  );

const laneOf = (owner: ActorRef, reference: Reference, request: Request) => {
  const fields = Option.match(operationNamed(reference, request.operation), {
    onNone: () => [],
    onSome: (o) => o.keyFields,
  });

  return JSON.stringify([
    owner.machine,
    owner.id,
    request.operation,
    fieldsOf(request.input, fields),
  ]);
};

const move = (ledger: Ledger, id: string, phase: (was: Phase) => Phase) => {
  const was = ledger.attempts.get(id);

  if (was !== undefined) ledger.attempts.set(id, { ...was, phase: phase(was.phase) });
};

const answered = (ledger: Ledger, reference: Reference, request: Request, answer: Answer) => {
  for (const id of Option.toArray(request.key))
    move(ledger, id, (was) => {
      const channel = Option.match(operationNamed(reference, request.operation), {
        onNone: () => "unknown",
        onSome: (o) => o.classify(answer, was === "Unsure"),
      });

      if (channel === "success") return "Settled";

      return channel === "failure" && was !== "Unsure" ? "Settled" : "Unsure";
    });
};

const resent = (was: Phase) => {
  if (was === "Minted") return "Sent";

  return was === "Sent" ? "Unsure" : was;
};

const sent = (ledger: Ledger, reference: Reference, request: Request) => {
  const id = Option.getOrUndefined(request.key);
  const attempt = id === undefined ? undefined : ledger.attempts.get(id);

  if (id === undefined || attempt === undefined) return;

  move(ledger, id, resent);
  ledger.heads.set(laneOf(attempt.owner, reference, request), id);

  if (RequestPhase.$is("Answered")(request.phase))
    answered(ledger, reference, request, request.phase.answer);
};

const cancelled = (ledger: Ledger, reference: Reference, actor: ActorRef, event: string) => {
  for (const id of ledger.heads.values()) {
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

const reportedOn = (ledger: Ledger, reference: Reference, observation: Observation) => {
  minted(ledger, reference, observation);

  if (Observation.$is("Ended")(observation))
    for (const id of Option.toArray(observation.attempt))
      move(ledger, id, (was) => (was === "Minted" ? "Settled" : was));

  const released =
    Observation.$is("Evidence")(observation) &&
    (observation.kind === "Released" || observation.kind === "Superseded");

  if (released)
    for (const id of Option.toArray(observation.attempt)) move(ledger, id, () => "Settled");
};

const learn = (ledger: Ledger, reference: Reference, fact: Fact) => {
  if (Fact.$is("Reported")(fact)) reportedOn(ledger, reference, fact.observation);

  const heard = Fact.$is("Answered")(fact) && !RequestPhase.$is("Orphaned")(fact.request.phase);

  if (heard) answered(ledger, reference, fact.request, fact.answer);

  if (Fact.$is("Drove")(fact)) cancelled(ledger, reference, fact.actor, fact.event);

  if (Fact.$is("Requested")(fact)) sent(ledger, reference, fact.request);

  if (Fact.$is("Reloaded")(fact))
    for (const [id, attempt] of ledger.attempts)
      if (attempt.phase === "Minted") ledger.attempts.delete(id);
};

// RETURN_TYPE: the Life union; inference would give the Disposing member alone.
const disposing = (ledger: Ledger, since: string): Life => {
  const heads = new Set(ledger.heads.values());
  const open = [...ledger.attempts].map(([id, attempt]) => ({ id, attempt }));

  return {
    _tag: "Disposing",
    since,
    held: open.filter(
      (o) => heads.has(o.id) && (o.attempt.phase === "Sent" || o.attempt.phase === "Unsure"),
    ),
    unsent: open.filter((o) => o.attempt.phase === "Minted"),
    ended: new Set(),
  };
};

const named = ({ id, attempt }: Owed) =>
  `${attempt.operation} ${id} of ${attempt.owner.machine}/${attempt.owner.id}`;

const deliveredAfter = (facts: ReadonlyArray<Fact>, { id, attempt }: Owed) =>
  facts.some(
    (fact) =>
      Fact.$is("Reported")(fact) &&
      Observation.$is("Delivered")(fact.observation) &&
      fact.observation.operation === attempt.operation &&
      Option.contains(fact.observation.attempt, id),
  );

const survived = (
  life: Extract<Life, { readonly _tag: "Disposing" }>,
  before: ReadonlyArray<Fact>,
  after: ReadonlyArray<Fact>,
) => {
  const back = usesHeld(before);
  const attached = (o: Owed) => back.some(([actor]) => sameActor(actor, o.attempt.owner));

  const dropped = life.held
    .filter((o) => attached(o) && !deliveredAfter(after, o))
    .map(
      (o) =>
        `Actors I29: ${named(o)} was Held or on the wire when the Runtime's disposal began (at "${life.since}"); the next boot re-attached its actor and delivered no ending of it (Restore I6), so its lane did not survive the disposal`,
    );

  const vanished = life.unsent
    .filter((o) => !life.ended.has(o.id))
    .map(
      (o) =>
        `Actors I29: ${named(o)} was minted and never sent when the Runtime's disposal began (at "${life.since}"), and the disposal reported no ending of it; a never-sent commit ends NotSent { Disposed } (Actors R22)`,
    );

  return [...vanished, ...dropped];
};

const invoked = (request: Request) =>
  `Actors I30: the server received a ${request.operation} request${Option.match(request.key, { onNone: () => "", onSome: (k) => ` (${k})` })} after the Runtime's disposal began; nothing is invoked from its start`;

const stepName = (step: ReadonlyArray<Fact>) => {
  const [first] = step;

  return first !== undefined && Fact.$is("Stepped")(first) ? first.what : "";
};

const endedIn = (life: Life, fact: Fact) => {
  if (life._tag === "Live" || !Fact.$is("Reported")(fact)) return;
  const observation = fact.observation;

  if (Observation.$is("Ended")(observation))
    for (const id of Option.toArray(observation.attempt)) life.ended.add(id);
};

// RETURN_TYPE: the Ledger record; inference would widen its empty collections.
const fresh = (): Ledger => ({ attempts: new Map(), heads: new Map() });

const judge = (facts: Facts) => {
  const ledger = fresh();
  let life: Life = { _tag: "Live" };

  return steps(facts.timeline).flatMap((step) => {
    const reload = step.findIndex(Fact.$is("Reloaded"));

    return step.flatMap((fact) => {
      endedIn(life, fact);
      learn(ledger, facts.reference, fact);

      if (Fact.$is("DisposingRuntime")(fact) && life._tag === "Live")
        life = disposing(ledger, stepName(step));

      if (life._tag === "Live") return [];

      if (Fact.$is("Requested")(fact)) return [invoked(fact.request)];

      if (!Fact.$is("Reloaded")(fact)) return [];
      const before = facts.timeline.slice(0, facts.timeline.indexOf(fact));
      const judged = survived(life, before, step.slice(reload));
      life = { _tag: "Live" };

      return judged;
    });
  });
};

/**
 * Runtime disposal keeps every lane that is not Idle and invokes nothing from its start.
 *
 * **Details**
 *
 * - Nothing invoked: from the start of the Runtime's disposal to the next reload, the suite's
 *   server receives no request, write or read. A request the next boot makes is not counted.
 * - A Held lane kept: a lane whose newest Attempt the server received, with no definite answer
 *   (none yet, one its commit takes as unknown, or a definite failure after an unknown, which is
 *   StillUnknown), no cancel the suite drove since and no `Released` evidence for it, is Held or
 *   on the wire when the disposal starts. At the next boot, each such lane whose actor the reload
 *   re-attaches must deliver an ending of that Attempt: unknown { Restored }, or the ending the
 *   disposal parked in its place (Restore I6).
 * - A queued commit kept: an Attempt minted and never sent when the disposal starts, with no
 *   ending yet, must end (NotSent { Disposed }) before the next reload.
 *
 * **Gotchas**
 *
 * - Anchored to the suite's facts: its server's requests and answers, the fixtures' references
 *   (how a commit classifies an answer, its key fields, the events that cancel it), and the uses
 *   the suite holds. The rest are the runtime's reports: who committed an Attempt and that it was
 *   minted (`Minted`), that a never-sent one ended (`Ended`), and that a boot delivered an ending
 *   (`Delivered`); a recorded ending does not count as delivered, since Restore I6 delivers.
 * - An answer to a dead page's request reaches no caller, so it decides nothing here. A never-sent
 *   commit dies with its page at a reload; one the disk kept ends again at the boot, by report.
 * - A lane whose actor the suite released or disposed before the reload is not re-attached, so it
 *   is not observed; disposeActor's half of the rule is not judged here.
 * - A handler's own cancel (one not on an event the suite drove, such as Pay's on `IntentRead`
 *   in UNSURE) is known only from the runtime's `Released` evidence, and a superseded commit from
 *   its `Superseded` evidence, as `lane-queue` takes them. This is lenient: a runtime that claims
 *   a release it did not make, then drops the lane, is not caught here.
 * - A reload with no disposal before it judges nothing here; what a plain reload restores is the
 *   restore oracle's.
 */
export const disposal: Oracle = {
  name: "disposal",
  guarantee: "Actors I29 (Runtime disposal), I30",
  check: judge,
};
