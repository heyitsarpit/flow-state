import { Data, Option } from "effect";
import { FLOW_DECLINES } from "../fixtures/reference.ts";
import { type ActorRef, sameActor } from "../port.ts";
import {
  type ActorRecord,
  addressable,
  type AttemptLife,
  type GoneWhy,
  isHead,
  type LaneId,
  Life,
  type Model,
  Move,
  Obligation,
  Phase,
  type Refusal,
  sameLane,
} from "./lifecycle-model.ts";
import { Outcome, type Promotion, type Row, type Rules, rules } from "./lifecycle-rules.ts";

const wl = (n: number) => `WriteLanes I${n}` as const;

const owes = (model: Model, attempt: string) =>
  model.obligations.filter((o) => o._tag !== "AwaitLetGo" && o.attempt === attempt);

const owed = <T extends Obligation["_tag"]>(model: Model, attempt: string, tag: T) =>
  owes(model, attempt).filter(Obligation.$is(tag));

const isFlowDecline = (reason: string) => FLOW_DECLINES.some((d) => d === reason);

const rowOf = (move: Move) =>
  Move.$match(move, {
    Send: () => "Send" as const,
    End: ({ channel, reason }) => {
      if (channel === "unknown") return "EndUnknown" as const;

      return channel === "failure" && isFlowDecline(reason)
        ? ("EndNotSent" as const)
        : ("EndDefinite" as const);
    },
    Evidence: ({ kind }) => kind,
    Reload: () => "Reload" as const,
    BootSettles: () => "BootSettles" as const,
    DisposalStarts: () => "DisposalStarts" as const,
    RuntimeDisposed: () => "RuntimeDisposed" as const,
    StepEnds: () => "StepEnds" as const,
  });

const endingsOf = (model: Model, attempt: string) =>
  model.endings.filter((e) => Option.contains(e.attempt, attempt));

const laneMates = (model: Model, life: AttemptLife) =>
  model.attempts.filter((a) => sameLane(a.lane, life.lane));

const cancelAllInOrder = (model: Model, life: AttemptLife) => {
  const earlier = laneMates(model, life).slice(
    0,
    laneMates(model, life).findIndex((a) => a.id === life.id),
  );

  return !earlier.some(
    (a) =>
      a.phase._tag === "Queued" &&
      owed(model, a.id, "Await").some((o) => o.report === "NotSentCancelled"),
  );
};

const queuedNotSent = (model: Model, life: AttemptLife, reason: string) => {
  const cancelAll = owed(model, life.id, "Await").some((o) => o.report === "NotSentCancelled");

  if (reason === "Cancelled" && cancelAll)
    return cancelAllInOrder(model, life) ? "cancelAll" : "cancelAllOutOfOrder";

  return reason === "Disposed" && model.mode === "disposing" ? "disposed" : "other";
};

const unsentNotSent = (model: Model, life: AttemptLife, reason: string) => {
  const pending = owed(model, life.id, "PendingCancel").length > 0;

  if (pending && (reason === "Cancelled" || reason === "StorageRefused")) return "pendingCancel";

  if (reason === "StorageRefused") return "storageRefused";

  return reason === "Disposed" && model.mode === "disposing" ? "disposed" : "other";
};

const goneEnd = (model: Model, life: AttemptLife, why: GoneWhy, ends: string) => {
  if (why === "evidence" && endingsOf(model, life.id).length === 0) return "evidenceFirst";

  if (owed(model, life.id, "PendingCancel").some((o) => o.ends === ends)) return "pendingCancel";

  return "other";
};

const notSentGuard = (model: Model, life: AttemptLife, reason: string) =>
  Phase.$match(life.phase, {
    Queued: () => queuedNotSent(model, life, reason),
    Unsent: () => unsentNotSent(model, life, reason),
    Restoring: ({ head }) => {
      if (head) return "other";

      if (reason === "Restored") return "restored";
      const pending = owed(model, life.id, "PendingCancel").length > 0;

      return reason === "Cancelled" && pending ? "pendingCancel" : "other";
    },
    Gone: ({ why }) => goneEnd(model, life, why, "NotSent"),
    Resending: () => "always",
    OnWire: () => "always",
    Interrupted: () => "always",
    Held: () => "always",
  });

const actorOf = (model: Model, actor: ActorRef) =>
  model.actors.find((a) => sameActor(a.actor, actor));

const heldRestore = (model: Model, life: AttemptLife, reason: string) => {
  if (reason !== "Restored") return "other";
  const incarnation = actorOf(model, life.lane.actor)?.incarnation;

  return owed(model, life.id, "AwaitRestore").some((o) => o.incarnation === incarnation)
    ? "owedRestore"
    : "unowedRestore";
};

const onWireUnknown = (model: Model, reason: string, retained: boolean) => {
  if (reason === "Disposed") return model.mode === "disposing" ? "disposed" : "disposedRunning";

  return retained ? "retained" : "released";
};

const unknownGuard = (model: Model, life: AttemptLife, reason: string, retained: boolean) =>
  Phase.$match(life.phase, {
    Resending: () => (reason === "StorageRefused" ? "storageRefused" : "other"),
    OnWire: () => onWireUnknown(model, reason, retained),
    Interrupted: () => {
      if (reason === "Cancelled") return "cancelled";

      return reason === "Disposed" && model.mode === "disposing" ? "disposed" : "other";
    },
    Held: () => heldRestore(model, life, reason),
    Restoring: ({ head }) => (head && reason === "Restored" ? "headRestored" : "other"),
    Gone: ({ why }) =>
      why === "settledInDisposal" && reason === "Restored"
        ? "restoredAfterDisposal"
        : goneEnd(model, life, why, "UnknownCancelled"),
    Queued: () => "always",
    Unsent: () => "always",
  });

const awaited = (model: Model, life: AttemptLife, report: "Released" | "Superseded") =>
  owed(model, life.id, "Await").some((o) => o.report === report) ||
  (report === "Released" && model.releasing.some((l) => sameLane(l, life.lane)))
    ? "awaited"
    : "none";

const evidenceGuard = (model: Model, life: AttemptLife, kind: "Released" | "Superseded") => {
  if (kind === "Superseded")
    return life.phase._tag === "Queued" || life.phase._tag === "Unsent"
      ? awaited(model, life, kind)
      : "always";

  if (life.phase._tag === "Gone") return life.phase.why === "evidence" ? "evidence" : "other";

  return life.phase._tag === "Resending" || life.phase._tag === "Held"
    ? awaited(model, life, kind)
    : "always";
};

const guardOf = (model: Model, life: AttemptLife, move: Move) =>
  Move.$match(move, {
    Send: () => {
      if (life.phase._tag !== "Unsent") return "always";

      return owed(model, life.id, "PendingCancel").length > 0 ? "cancelPending" : "open";
    },
    End: ({ channel, reason, retained }) => {
      if (channel === "unknown") return unknownGuard(model, life, reason, retained);

      if (channel === "failure" && isFlowDecline(reason)) return notSentGuard(model, life, reason);

      return life.phase._tag === "OnWire" ? model.mode : "always";
    },
    Evidence: ({ kind }) => evidenceGuard(model, life, kind),
    StepEnds: ({ unstoppable }) =>
      life.phase._tag === "Interrupted"
        ? unstoppableGuard(unstoppable, life.lane.operation)
        : "always",
    Reload: () => "always",
    BootSettles: () => "always",
    DisposalStarts: () => "always",
    RuntimeDisposed: () => "always",
  });

const unstoppableGuard = (unstoppable: ReadonlyArray<string>, operation: string) =>
  unstoppable.includes(operation) ? "unstoppable" : "stoppable";

const without = (model: Model, drop: (o: Obligation) => boolean) => ({
  ...model,
  obligations: model.obligations.filter((o) => !drop(o)),
});

const ownedBy = (attempt: string) => (o: Obligation) =>
  o._tag !== "AwaitLetGo" && o.attempt === attempt;

const discharge = (model: Model, attempt: string, guard: string, move: Move) => {
  const mine = ownedBy(attempt);

  if (guard === "pendingCancel")
    return without(model, (o) => mine(o) && o._tag === "PendingCancel");

  if (guard === "cancelAll" || guard === "awaited")
    return without(model, (o) => mine(o) && o._tag === "Await");

  if (guard === "owedRestore") return without(model, (o) => mine(o) && o._tag === "AwaitRestore");

  if (guard === "released" && Move.$is("End")(move))
    return {
      ...model,
      obligations: [...model.obligations, Obligation.Await({ attempt, report: "Released" })],
    };

  return model;
};

const evidenceOnly = (model: Model, life: AttemptLife) =>
  (life.phase._tag === "Gone" && life.phase.why === "evidence") ||
  model.releasing.some((l) => sameLane(l, life.lane));

const decided = (model: Model, life: AttemptLife, move: Move) => {
  if (!Move.$is("End")(move)) return model;

  const ending = {
    attempt: Option.some(life.id),
    operation: life.lane.operation,
    actor: life.lane.actor,
    channel: move.channel,
    reason: move.reason,
    incarnation: actorOf(model, life.lane.actor)?.incarnation ?? 0,
    inDisposal: model.mode === "disposing",
    life: evidenceOnly(model, life) ? Life.Evidence() : Life.Owed(),
  };

  return { ...model, endings: [...model.endings, ending] };
};

const setPhase = (model: Model, attempt: string, phase: Phase) => ({
  ...model,
  attempts: model.attempts.map((a) => (a.id === attempt ? { ...a, phase } : a)),
});

/**
 * The lane's promotion after its head left, by a {@link Promotion} rule.
 */
export const promote = (model: Model, lane: LaneId, rule: Promotion) => {
  const mates = model.attempts.filter((a) => sameLane(a.lane, lane));

  if (rule === "never" || mates.some((a) => addressable(a.phase))) return model;
  const queued = mates.filter((a) => a.phase._tag === "Queued");

  const chosen = {
    firstFree: queued.find((a) => owes(model, a.id).length === 0),
    first: queued[0],
    second: queued[1],
  }[rule];

  return chosen === undefined ? model : setPhase(model, chosen.id, Phase.Unsent());
};

const describe = (life: AttemptLife, move: Move) =>
  `${life.lane.operation} ${life.id} (${life.phase._tag}) got ${rowOf(move)}${Move.$is("End")(move) ? ` ${move.channel} ${move.reason}` : ""}`;

/**
 * The cell of Table A a move reaches for one Attempt: its row, the Attempt's phase and the guard's
 * value.
 */
export const cellOf = (model: Model, life: AttemptLife, move: Move) => ({
  row: rowOf(move),
  phase: life.phase._tag,
  guard: guardOf(model, life, move),
});

const applyOne = (model: Model, life: AttemptLife, move: Move, given: Rules) => {
  const { row, phase: at, guard } = cellOf(model, life, move);
  const outcome = given.tableA[row][at][guard];

  if (outcome === undefined) throw new MissingCell({ row, phase: at, guard });

  return Outcome.$match(outcome, {
    Refuse: ({ invariant }) => stepOf(model, [{ invariant, text: describe(life, move) }]),
    Stay: () => stepOf(decided(discharge(model, life.id, guard, move), life, move)),
    Move: ({ to: phase }) => {
      const moved = setPhase(
        decided(discharge(model, life.id, guard, move), life, move),
        life.id,
        phase,
      );

      return stepOf(promote(moved, life.lane, given.promotion));
    },
  });
};

/**
 * One fold result: the next model and the refusals found.
 */
export type Step = readonly [Model, ReadonlyArray<Refusal>];

// RETURN_TYPE: the fold's result is the named tuple; a literal would infer as an array.
const stepOf = (model: Model, refusals: ReadonlyArray<Refusal> = []): Step => [model, refusals];

/**
 * A guard value Table A has no cell for: a suite defect.
 */
export class MissingCell extends Data.TaggedError("MissingCell")<{
  readonly row: Row;
  readonly phase: string;
  readonly guard: string;
}> {}

const attemptOfMove = (move: Move) =>
  Move.$is("Send")(move) || Move.$is("End")(move) || Move.$is("Evidence")(move)
    ? Option.some(move.attempt)
    : Option.none();

const modeAfter = (model: Model, move: Move) => {
  if (Move.$is("DisposalStarts")(move)) return { ...model, mode: "disposing" as const };

  if (Move.$is("Reload")(move))
    return { ...model, mode: "running" as const, afterDisposal: model.mode === "disposing" };

  return model;
};

/**
 * Applies one {@link Move} to the lifecycle by Table A: an Attempt's move to its own Attempt, any
 * other to every Attempt in mint order. A refused move leaves the model where it was.
 *
 * **Gotchas**
 *
 * - A move naming an Attempt the lifecycle never minted is refused as WriteLanes I1.
 * - The model's mode moves after the cells, so a reload's cells see the mode it ends.
 */
export const advance = (model: Model, move: Move, given: Rules = rules) => {
  const named = attemptOfMove(move);

  if (Option.isSome(named)) {
    const life = model.attempts.find((a) => a.id === named.value);

    if (life === undefined)
      return stepOf(model, [{ invariant: wl(1), text: `${named.value} was never minted` }]);

    return applyOne(model, life, move, given);
  }

  const [after, found] = model.attempts.reduce<Step>(
    ([m, refusals], { id }) => {
      const life = m.attempts.find((a) => a.id === id);

      if (life === undefined) return [m, refusals];
      const [next, more] = applyOne(m, life, move, given);

      return stepOf(next, [...refusals, ...more]);
    },
    [model, []],
  );

  return stepOf(modeAfter(after, move), found);
};

/**
 * The obligations due at an instant: each unmet one is refused with its Invariant and dropped.
 */
export const due = (model: Model, instant: "TurnCloses" | "StepEnds", given: Rules = rules) => {
  const deadlineOf = (o: Obligation) =>
    Obligation.$match(o, {
      Await: ({ report }) => given.deadlines.Await[report],
      PendingCancel: () => given.deadlines.PendingCancel,
      AwaitRestore: ({ cause }) => given.deadlines.AwaitRestore[cause],
      AwaitLetGo: () => given.deadlines.AwaitLetGo,
    });

  const late = model.obligations.filter((o) => deadlineOf(o).by === instant);

  return stepOf(
    without(model, (o) => late.includes(o)),
    late.map((o) => ({
      invariant: deadlineOf(o).invariant,
      text: `${o._tag} ${o._tag === "AwaitLetGo" ? `ending ${o.ending}` : o.attempt} was not met by ${instant}`,
    })),
  );
};

/**
 * Begins an incarnation of `actor`: its ordinal moves on, and each Held head of its lanes owes its
 * restore ending to this incarnation, for a cause read from the actor's record.
 *
 * **Gotchas**
 *
 * - Only Held heads owe a restore: a never-sent or on-wire Attempt cannot show one.
 */
export const incarnate = (model: Model, actor: ActorRef) => {
  const known = actorOf(model, actor);
  const incarnation = (known?.incarnation ?? 0) + 1;
  const cause = causeOf(model, known?.record ?? "bound");

  const owing = model.attempts.filter(
    (a) => sameActor(a.lane.actor, actor) && a.phase._tag === "Held" && isHead(model, a),
  );

  return {
    ...model,
    actors: [
      ...model.actors.filter((a) => !sameActor(a.actor, actor)),
      { actor, record: "bound" as const, incarnation },
    ],
    obligations: [
      ...model.obligations,
      ...owing.map((a) => Obligation.AwaitRestore({ attempt: a.id, incarnation, cause })),
    ],
  };
};

const causeOf = (model: Model, record: ActorRecord) => {
  if (record === "disposeActor" || record === "forget") return record;

  return model.afterDisposal ? "runtimeDisposal" : "plain";
};
