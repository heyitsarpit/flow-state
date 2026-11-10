import { Option } from "effect";
import type { OperationReference, Reference } from "../fixtures/reference.ts";
import type { ActorRef } from "../port.ts";

/**
 * Where an Attempt stands in its lane, as the oracle models it.
 */
export type Phase = "queued" | "waiting" | "wire" | "held" | "replaced";

/**
 * One Attempt of a lane and its phase.
 */
export type Tracked = { readonly id: string; readonly phase: Phase };

/**
 * One modelled lane: its actor, operation, policy and Attempts in mint order.
 */
export type Lane = {
  readonly actor: ActorRef;
  readonly operation: string;
  readonly policy: OperationReference;
  readonly attempts: ReadonlyArray<Tracked>;
};

/**
 * A cancel the suite drove on a head, and the head's history then.
 */
export type Cancelled = { readonly id: string; readonly from: "waiting" | "wire" };

/**
 * The oracle's model of every lane in a case.
 */
export type Model = {
  readonly lanes: Map<string, Lane>;
  readonly laneOf: Map<string, string>;
  readonly cancelled: Map<string, Cancelled>;
  readonly unstoppable: Set<string>;
  readonly heldAt: Map<string, number>;
  readonly drivenTurns: Array<{ readonly actor: ActorRef; readonly step: number }>;
};

/**
 * The queue bound of each policy (WriteLanes R6, R7).
 */
export const BOUND = { reject: 0, latest: 1, serialize: 64, cancel: 0 } as const;

/**
 * The phases of an addressable Attempt: the one retry and cancel name.
 */
export const ADDRESSABLE: ReadonlyArray<Phase> = ["waiting", "wire", "held"];

/**
 * The key of an actor's operation's lane in the model.
 */
export const laneKey = (actor: ActorRef, operation: string) =>
  `${actor.machine}/${actor.id} ${operation}`;

/**
 * Whether an Attempt is addressable.
 */
export const addressable = (attempt: Tracked) => ADDRESSABLE.includes(attempt.phase);

/**
 * The lane's addressable Attempt, if any.
 */
export const headOf = (lane: Lane) => Option.fromUndefinedOr(lane.attempts.find(addressable));

/**
 * The lane's queued Attempts, in mint order.
 */
export const queuedOf = (lane: Lane) => lane.attempts.filter((a) => a.phase === "queued");

/**
 * Whether an operation is an unkeyed write: one lane per actor.
 */
export const unkeyed = (operation: OperationReference) =>
  operation.attempts && operation.keyFields.length === 0;

/**
 * The reference of an actor's unkeyed write, if the case runs one.
 */
export const writeOf = (reference: Reference, actor: ActorRef, operation: string) =>
  Option.filter(Option.fromUndefinedOr(reference[actor.machine]?.[operation]), unkeyed);

/**
 * The lane with one Attempt moved to a phase.
 */
export const withPhase = (lane: Lane, id: string, phase: Phase) => ({
  ...lane,
  attempts: lane.attempts.map((a) => (a.id === id ? { id, phase } : a)),
});

/**
 * The lane with its first queued Attempt promoted when it has no head.
 */
export const promoted = (lane: Lane) => {
  if (Option.isSome(headOf(lane))) return lane;
  const [next] = queuedOf(lane);

  return next === undefined ? lane : withPhase(lane, next.id, "waiting");
};

/**
 * The lane without one Attempt, promoting the queue.
 */
export const without = (lane: Lane, id: string) =>
  promoted({ ...lane, attempts: lane.attempts.filter((a) => a.id !== id) });

/**
 * An Attempt's phase in a lane.
 */
export const phaseIn = (lane: Lane, id: string) =>
  Option.fromUndefinedOr(lane.attempts.find((a) => a.id === id)?.phase);

/**
 * The lane an Attempt was minted into, with its key.
 */
export const laneOfAttempt = (model: Model, id: string) =>
  Option.flatMap(Option.fromUndefinedOr(model.laneOf.get(id)), (key) =>
    Option.map(Option.fromUndefinedOr(model.lanes.get(key)), (lane) => [key, lane] as const),
  );

/**
 * An empty model.
 */
// RETURN_TYPE: the Model record; inference would widen its empty collections.
export const fresh = (): Model => ({
  lanes: new Map(),
  laneOf: new Map(),
  cancelled: new Map(),
  unstoppable: new Set(),
  heldAt: new Map(),
  drivenTurns: [],
});

/**
 * The model after a reload: every lane emptied, pending cancels dropped.
 */
export const forget = (model: Model) => {
  for (const [key, lane] of model.lanes) model.lanes.set(key, { ...lane, attempts: [] });
  model.cancelled.clear();
};
