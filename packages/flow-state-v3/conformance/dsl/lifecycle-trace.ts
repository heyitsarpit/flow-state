import { Option } from "effect";
import type { ActorRef } from "../port.ts";
import { type AttemptLife, empty, type Model, Move, Obligation, Phase } from "./lifecycle-model.ts";
import type { InvariantId } from "./oracle.ts";

/**
 * One step of a {@link Trace}: a lifecycle move, or an instant at which obligations are due.
 */
export type TraceStep = Move | { readonly due: "TurnCloses" | "StepEnds" };

/**
 * A lifecycle trace written from the Spec: a starting model, its steps, and what each step must
 * refuse and where every Attempt must end.
 *
 * **Details**
 *
 * - `cites`: the Spec rule and the design's cell the expectation comes from.
 * - `refusals`: per step, the Invariants refused, in order.
 * - `phases`: every Attempt's phase at the end, by id.
 * - `owed`: how many obligations remain at the end.
 */
export type Trace = {
  readonly name: string;
  readonly cites: string;
  readonly start: Model;
  readonly steps: ReadonlyArray<TraceStep>;
  readonly refusals: ReadonlyArray<ReadonlyArray<InvariantId>>;
  readonly phases: Readonly<Record<string, Phase>>;
  readonly owed: number;
};

const shopper: ActorRef = { machine: "Checkout/Pay", id: "shopper-1" };

const laneNamed = (name: string) => ({
  actor: shopper,
  operation: "pay",
  key: Option.some(name),
});

const lane = (name: string, ...attempts: ReadonlyArray<readonly [string, Phase]>) =>
  attempts.map(([id, phase]) => ({ id, lane: laneNamed(name), phase }));

const model = (
  attempts: ReadonlyArray<AttemptLife>,
  more: Partial<Omit<Model, "attempts">> = {},
) => ({
  ...empty,
  actors: [{ actor: shopper, record: "bound" as const, incarnation: 1 }],
  ...more,
  attempts,
});

const Q = Phase.Queued();
const U = Phase.Unsent();
const RS = Phase.Resending();
const W = Phase.OnWire();
const I = Phase.Interrupted();
const H = Phase.Held();
const RT = Phase.Restoring({ head: true });
const RF = Phase.Restoring({ head: false });
const GC = Phase.Gone({ why: "closed" });
const GE = Phase.Gone({ why: "evidence" });
const GS = Phase.Gone({ why: "settledInDisposal" });

const wl = (n: number) => `WriteLanes I${n}` as const;
const actors = (n: number) => `Actors I${n}` as const;

const end = (attempt: string, channel: "success" | "failure" | "unknown", reason: string) =>
  Move.End({ attempt, channel, reason, retained: true });

const pending = (attempt: string, ends: "NotSent" | "UnknownCancelled" = "NotSent") =>
  Obligation.PendingCancel({ attempt, ends });

const awaiting = (attempt: string, report: "Released" | "Superseded" | "NotSentCancelled") =>
  Obligation.Await({ attempt, report });

type Case = {
  readonly name: string;
  readonly cites: string;
  readonly start: Model;
  readonly move: TraceStep;
  readonly refused: ReadonlyArray<InvariantId>;
  readonly phases: Readonly<Record<string, Phase>>;
};

const one = (c: Case, owed = c.start.obligations.length) => ({
  name: c.name,
  cites: c.cites,
  start: c.start,
  steps: [c.move],
  refusals: [c.refused],
  phases: c.phases,
  owed,
});

const headed = (phase: Phase) => model(lane("A", ["s", phase], ["w", Q]));

const behindHeld = (more: Partial<Omit<Model, "attempts">> = {}) =>
  model(lane("A", ["h", H], ["s", Q]), more);

const goneBeside = (why: Phase, more: Partial<Omit<Model, "attempts">> = {}) =>
  model(lane("A", ["s", why], ["n", U]), more);

const phased = (rows: ReadonlyArray<readonly [string, Phase]>) => rows;

const started = (rows: ReadonlyArray<readonly [string, Model, Readonly<Record<string, Phase>>]>) =>
  rows;

const definite = (attempt: string) => end(attempt, "success", "success");
const notSent = (attempt: string, why: string) => end(attempt, "failure", why);

const unknown = (attempt: string, reason: string, retained = true) =>
  Move.End({ attempt, channel: "unknown", reason, retained });

const released = (attempt: string) => Move.Evidence({ attempt, kind: "Released" });
const superseded = (attempt: string) => Move.Evidence({ attempt, kind: "Superseded" });

/**
 * The phases a trace names, by short name: `Q` Queued, `U` Unsent, `RS` Resending, `W` OnWire,
 * `I` Interrupted, `H` Held, `RT` and `RF` Restoring (head or not), `GC`, `GE` and `GS` Gone
 * (closed, evidence, settled in disposal).
 */
export const at = { Q, U, RS, W, I, H, RT, RF, GC, GE, GS };

/**
 * The builders a trace is written with: lanes and models of the one test actor, moves,
 * obligations, Invariant names, and `one`, a trace of one move.
 */
export const build = {
  shopper,
  laneNamed,
  lane,
  model,
  wl,
  actors,
  end,
  pending,
  awaiting,
  one,
  headed,
  behindHeld,
  goneBeside,
  phased,
  started,
  definite,
  notSent,
  unknown,
  released,
  superseded,
};
