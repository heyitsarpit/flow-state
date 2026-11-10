import { Option } from "effect";
import { endingOf, type LaneId, laneOf, sameLane } from "../dsl/domain.ts";
import { Fact, holdUse } from "../dsl/oracle.ts";
import { operationNamed, type Reference } from "../fixtures/reference.ts";
import { type ActorRef, type EvidenceKind, Observation, sameActor, type Use } from "../port.ts";
import { type Answer, type Request, RequestPhase } from "../world/network.ts";

type Open = "Minted" | "OnWire" | "ReWire" | "Held";

type Settled = "Answered" | "EndedUnsent" | "Cancelled" | "Claimed";

type Phase = Open | Settled;

type Move =
  | "sent"
  | "success"
  | "failure"
  | "unknown"
  | "endedDefinite"
  | "endedUnknown"
  | "cancel"
  | "superseded"
  | "released"
  | "reload";

const CLAIMS: Readonly<Partial<Record<EvidenceKind, Move>>> = {
  Superseded: "superseded",
  Released: "released",
};

const stays = (phase: Settled) => ({
  sent: phase,
  success: phase,
  failure: phase,
  unknown: phase,
  endedDefinite: phase,
  endedUnknown: phase,
  cancel: phase,
  superseded: phase,
  released: phase,
  reload: phase,
});

const TABLE: Readonly<Record<Phase, Readonly<Record<Move, Phase | "Gone">>>> = {
  Minted: {
    sent: "OnWire",
    success: "Minted",
    failure: "Minted",
    unknown: "Minted",
    endedDefinite: "EndedUnsent",
    endedUnknown: "EndedUnsent",
    cancel: "Cancelled",
    superseded: "Claimed",
    released: "Claimed",
    reload: "Gone",
  },
  OnWire: {
    sent: "ReWire",
    success: "Answered",
    failure: "Answered",
    unknown: "Held",
    endedDefinite: "OnWire",
    endedUnknown: "Held",
    cancel: "OnWire",
    superseded: "OnWire",
    released: "Claimed",
    reload: "Held",
  },
  ReWire: {
    sent: "ReWire",
    success: "Answered",
    failure: "Held",
    unknown: "Held",
    endedDefinite: "ReWire",
    endedUnknown: "Held",
    cancel: "ReWire",
    superseded: "ReWire",
    released: "Claimed",
    reload: "Held",
  },
  Held: {
    sent: "ReWire",
    success: "Answered",
    failure: "Held",
    unknown: "Held",
    endedDefinite: "Held",
    endedUnknown: "Held",
    cancel: "Cancelled",
    superseded: "Held",
    released: "Claimed",
    reload: "Held",
  },
  Answered: stays("Answered"),
  EndedUnsent: stays("EndedUnsent"),
  Cancelled: stays("Cancelled"),
  Claimed: stays("Claimed"),
};

/**
 * One Attempt of a write the ledger follows, and where it stands.
 *
 * **Details**
 *
 * - Open: `Minted` (never sent), `OnWire` (first send, no answer), `ReWire` (a re-send, no answer),
 *   `Held` (an unknown answer or ending, or a call cut off by a reload).
 * - Settled, by cause: `Answered` (a definite answer), `EndedUnsent` (an ending before any send),
 *   `Cancelled` (a cancel the suite drove on a waiting or Held head), `Claimed` (the runtime's
 *   `Superseded` or `Released` evidence).
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
  readonly attempts: ReadonlyMap<string, Attempt>;
  readonly heads: ReadonlyArray<{ readonly lane: LaneId; readonly id: string }>;
  readonly uses: ReadonlyArray<readonly [ActorRef, Use]>;
};

/**
 * An empty ledger.
 */
export const freshLedger: Ledger = { attempts: new Map(), heads: [], uses: [] };

/**
 * The lane whose newest sent Attempt is `id`, if any.
 */
export const laneOfHead = (ledger: Ledger, id: string) =>
  Option.fromUndefinedOr(ledger.heads.find((h) => h.id === id)?.lane);

/**
 * Whether the ledger holds `id` as Held: an unknown seen, with no settlement since.
 */
export const isHeld = (ledger: Ledger, id: string) => ledger.attempts.get(id)?.phase === "Held";

/**
 * Whether the ledger holds `id` as settled by a definite answer.
 */
export const isAnswered = (ledger: Ledger, id: string) =>
  ledger.attempts.get(id)?.phase === "Answered";

// RETURN_TYPE: a reducer's step; `reduce` needs the accumulator's declared type.
const move = (ledger: Ledger, id: string, by: Move): Ledger => {
  const was = ledger.attempts.get(id);

  if (was === undefined) return ledger;
  const next = TABLE[was.phase][by];
  const attempts = new Map(ledger.attempts);

  if (next === "Gone") attempts.delete(id);
  else attempts.set(id, { ...was, phase: next });

  return { ...ledger, attempts };
};

const moveAll = (ledger: Ledger, ids: ReadonlyArray<string>, by: Move) =>
  ids.reduce((l, id) => move(l, id, by), ledger);

type Heard = {
  readonly reference: Reference;
  readonly requests: ReadonlyArray<Request>;
  readonly request: Request;
  readonly answer: Answer;
};

const answered = (ledger: Ledger, { reference, requests, request, answer }: Heard) => {
  const ending = Option.flatMap(operationNamed(reference, request.operation), (o) =>
    endingOf(o, requests, request, answer),
  );

  if (Option.isNone(ending) || Option.isNone(request.key)) return ledger;

  return move(ledger, request.key.value, ending.value.channel);
};

const sent = (
  ledger: Ledger,
  reference: Reference,
  request: Request,
  requests: ReadonlyArray<Request>,
) => {
  const id = Option.getOrUndefined(request.key);
  const attempt = id === undefined ? undefined : ledger.attempts.get(id);

  if (id === undefined || attempt === undefined) return ledger;
  const lane = laneOf(attempt.owner, reference, request.operation, request.input);

  const heads = [...ledger.heads.filter((h) => !sameLane(h.lane, lane)), { lane, id }];
  const moved = { ...move(ledger, id, "sent"), heads };

  return RequestPhase.$is("Answered")(request.phase)
    ? answered(moved, { reference, requests, request, answer: request.phase.answer })
    : moved;
};

const cancelled = (ledger: Ledger, reference: Reference, actor: ActorRef, event: string) => {
  const cancels = ledger.heads.flatMap(({ id }) => {
    const attempt = ledger.attempts.get(id);

    const named =
      attempt !== undefined &&
      sameActor(attempt.owner, actor) &&
      Option.exists(operationNamed(reference, attempt.operation), (o) =>
        Object.hasOwn(o.cancels, event),
      );

    return named ? [id] : [];
  });

  return moveAll(ledger, cancels, "cancel");
};

const minted = (ledger: Ledger, reference: Reference, observation: Observation) => {
  if (!Observation.$is("Minted")(observation) || Option.isNone(observation.actor)) return ledger;
  const write = Option.isSome(operationNamed(reference, observation.operation));

  if (!write || ledger.attempts.has(observation.attempt)) return ledger;

  const attempt = {
    owner: observation.actor.value,
    operation: observation.operation,
    phase: "Minted" as const,
  };

  return { ...ledger, attempts: new Map(ledger.attempts).set(observation.attempt, attempt) };
};

const reportedOn = (ledger: Ledger, reference: Reference, observation: Observation) =>
  Observation.$match(observation, {
    Minted: () => minted(ledger, reference, observation),
    Ended: ({ attempt, channel }) =>
      moveAll(
        ledger,
        Option.toArray(attempt),
        channel === "unknown" ? "endedUnknown" : "endedDefinite",
      ),
    Evidence: ({ attempt, kind }) =>
      Option.match(Option.fromUndefinedOr(CLAIMS[kind]), {
        onNone: () => ledger,
        onSome: (by) => moveAll(ledger, Option.toArray(attempt), by),
      }),
    Turn: () => ledger,
    Sent: () => ledger,
    Delivered: () => ledger,
    Parked: () => ledger,
    Unparked: () => ledger,
    Recorded: () => ledger,
    Unhandled: () => ledger,
    Denied: () => ledger,
    Issue: () => ledger,
    RuntimeDisposed: () => ledger,
  });

/**
 * Teaches the ledger one fact of the timeline and returns the ledger after it.
 *
 * **Details**
 *
 * Every phase change goes through one table keyed by (phase, move):
 *
 * - a request the server received sends its Attempt and makes it its lane's head; an answer on a
 *   live page moves it by the ending its commit gives that answer (a `Never` answer moves nothing);
 * - a runtime's `Minted` adds an Attempt; an `Ended` before any send settles it, and an unknown
 *   `Ended` of a call on the wire holds it (a cancelled call is retained);
 * - `Superseded` settles only a never-sent Attempt; `Released` settles any open one (whether the
 *   release was anchored is `lane-queue`'s to judge);
 * - an event the suite sent that the reference says cancels the operation settles a waiting or
 *   Held head; a head on the wire follows its ending;
 * - a reload drops never-sent Attempts (they died with the page) and holds a call that was on the
 *   wire, since its page is gone.
 */
// RETURN_TYPE: every branch returns the ledger; the callers thread it as their state's field.
export const learn = (
  ledger: Ledger,
  reference: Reference,
  fact: Fact,
  requests: ReadonlyArray<Request>,
): Ledger => {
  const held = { ...ledger, uses: holdUse(ledger.uses, fact) };

  return Fact.$match(fact, {
    Stepped: () => held,
    Requested: ({ request }) => sent(held, reference, request, requests),
    Answered: ({ request, answer }) =>
      RequestPhase.$is("Orphaned")(request.phase)
        ? held
        : answered(held, { reference, requests, request, answer }),
    Reported: ({ observation }) => reportedOn(held, reference, observation),
    Reloaded: () => moveAll(held, [...held.attempts.keys()], "reload"),
    Disposed: () => held,
    Forgot: () => held,
    Ensured: () => held,
    Released: () => held,
    DisposingRuntime: () => held,
    Drove: ({ actor, event }) => cancelled(held, reference, actor, event),
    Unstoppable: () => held,
    Advanced: () => held,
    Read: () => held,
  });
};

const HEAD_OPEN: ReadonlyArray<Phase> = ["OnWire", "ReWire", "Held"];

/**
 * The lane heads that are Held or on the wire.
 */
export const openHeads = (ledger: Ledger) =>
  ledger.heads.flatMap(({ id }) => {
    const attempt = ledger.attempts.get(id);

    return attempt !== undefined && HEAD_OPEN.includes(attempt.phase) ? [{ id, attempt }] : [];
  });

/**
 * The Attempts minted and never sent.
 */
export const unsent = (ledger: Ledger) =>
  [...ledger.attempts].flatMap(([id, attempt]) =>
    attempt.phase === "Minted" ? [{ id, attempt }] : [],
  );

/**
 * Whether an open head is a first send on the wire.
 */
export const onFirstSend = ({ attempt }: Owed) => attempt.phase === "OnWire";

/**
 * A name for an Attempt in a violation: its operation, id and owner.
 */
export const named = ({ id, attempt }: Owed) =>
  `${attempt.operation} ${id} of ${attempt.owner.machine}/${attempt.owner.id}`;
