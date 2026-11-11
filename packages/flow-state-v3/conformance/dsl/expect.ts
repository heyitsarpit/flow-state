import { Option } from "effect";
import { type ActorRef, sameActor } from "../port.ts";
import type { Answer, Request } from "../world/network.ts";
import type { Purpose } from "../world/storage.ts";
import { endingOf } from "./domain.ts";
import { due } from "./lifecycle.ts";
import { booted, landed, rolledBack, unlanded, wrote } from "./lifecycle-capture.ts";
import { apply } from "./lifecycle-fold.ts";
import {
  ActorMove,
  type Input,
  type LaneId,
  LaneMove,
  type Model,
  Move,
  Phase,
  type Refusal,
} from "./lifecycle-model.ts";
import { type Known, operationOf, type Predicted } from "./lifecycle-owed.ts";
import type { Rules } from "./lifecycle-rules.ts";
import { holdUse, SuiteFact } from "./facts.ts";

/**
 * One move the step applied: the model it applied to, and the refusals its cell (or a deadline it
 * reached) gave.
 */
export type Applied = {
  readonly move: Input;
  readonly on: Model;
  readonly refusals: ReadonlyArray<Refusal>;
};

/**
 * One step of the lifecycle: the model before and after it, and every move applied, in order.
 */
export type LifeStep = {
  readonly before: Model;
  readonly after: Model;
  readonly applied: ReadonlyArray<Applied>;
};

/**
 * The expect half's state through one step (Conformance R19, R20): the lifecycle, the moves applied
 * so far, and what the step's suite facts gave: the uses and incarnations it anchored, the sends
 * its server saw, the purposes of its batches, its predicted turns and its answers. `least` is the
 * model before the step's second turn, the least a batch the step wrote holds (design B4).
 *
 * **Gotchas**
 *
 * - Nothing here reads a report. The compare half (`dsl/compare.ts`) matches each report to a move
 *   this module allows, and the step applies it here by the tables.
 */
export type Walk = {
  readonly model: Model;
  readonly applied: ReadonlyArray<Applied>;
  readonly reloaded: boolean;
  readonly used: ReadonlyArray<ActorRef>;
  readonly incarnated: ReadonlyArray<ActorRef>;
  readonly incarnationsHeard: ReadonlyArray<ActorRef>;
  readonly ends: ReadonlyArray<ActorRef>;
  readonly endsHeard: ReadonlyArray<ActorRef>;
  readonly leaves: ReadonlyMap<string, string>;
  readonly writes: number;
  readonly stirred: boolean;
  readonly planned: number;
  readonly captureMs: number;
  readonly dirtyEnds: ReadonlyArray<ActorRef>;
  readonly captured: boolean;
  readonly unsent: ReadonlyArray<string>;
  readonly purposes: ReadonlyArray<Purpose>;
  readonly turns: ReadonlyArray<Predicted>;
  readonly requests: ReadonlyArray<Request>;
  readonly answers: ReadonlyArray<{ readonly request: Request; readonly answer: Answer }>;
  readonly unmatched: ReadonlyArray<Refusal>;
  readonly seen: number;
  readonly least: Option.Option<Model>;
};

/**
 * Whether a fixture of the case declares `operation` as a write.
 */
export const isWrite = (known: Known, operation: string) =>
  Object.values(known.reference).some((operations) => Object.hasOwn(operations, operation));

/**
 * Applies one move by the tables and records it with its refusals.
 */
export const pushed = (walk: Walk, move: Input, given: Rules) => {
  const [model, refusals] = apply(walk.model, move, given);

  return { ...walk, model, applied: [...walk.applied, { move, on: walk.model, refusals }] };
};

/**
 * Logs an Attempt that just ended, or left as evidence, as unsaved until a landed capture holds it,
 * unless the move was refused.
 */
export const unsaved = (walk: Walk, attempt: string) =>
  (walk.applied.at(-1)?.refusals.length ?? 0) > 0
    ? walk
    : { ...walk, model: { ...walk.model, ended: [...walk.model.ended, attempt] } };

/**
 * Closes the open turn, if one is open.
 */
export const closedTurn = (walk: Walk, given: Rules) =>
  Option.isSome(walk.model.turn) ? pushed(walk, LaneMove.TurnCloses(), given) : walk;

/**
 * The ending the suite's own answer gives an Attempt (WriteLanes R2, R3): its channel, and its
 * reason where the answer fixes one, when the server answered the Attempt's request in this step.
 * None otherwise (a decline, a cancel or an interrupted call, a bound, a restore, an answer of an
 * earlier step): the report is matched against the table there.
 */
export const answeredEnding = (known: Known, lane: LaneId, walk: Walk, attempt: string) =>
  Option.flatMap(
    Option.fromUndefinedOr(walk.answers.findLast((a) => Option.contains(a.request.key, attempt))),
    (a) =>
      Option.flatMap(operationOf(known, lane.actor, lane.operation), (o) =>
        endingOf(o, walk.requests, a.request, a.answer),
      ),
  );

const ADOPTABLE: ReadonlyArray<string> = ["grace", "disposeActor", "forget"];

const recordOf = (model: Model, actor: ActorRef) =>
  model.actors.find((a) => a.actor.machine === actor.machine && a.actor.id === actor.id)?.record;

/**
 * Whether `actor` has a live incarnation.
 */
export const isLive = (model: Model, actor: ActorRef) =>
  model.live.some((l) => sameActor(l.actor, actor));

/**
 * Whether the suite holds a use of `actor`.
 */
export const holds = (model: Model, actor: ActorRef) =>
  model.held.some(([a]) => sameActor(a, actor));

/**
 * Opens an incarnation of `actor` (Actors R6, R9): an adoption when its record is unbound or in
 * its grace, else a fresh one, counted free from now; its record may be new, so it may be unwritten.
 */
export const opened = (walk: Walk, actor: ActorRef, given: Rules, woken = false) => {
  const record = recordOf(walk.model, actor);

  const move =
    record !== undefined && ADOPTABLE.includes(record)
      ? ActorMove.Adopt({ actor })
      : ActorMove.Incarnated({ actor });

  const next = pushed(walk, move, given);

  return {
    ...next,
    model: {
      ...next.model,
      live: [
        ...next.model.live,
        {
          actor,
          free: Option.some(0),
          upper: 0,
          woken,
          dirty: Option.none(),
          unwritten: Option.some(next.model.clock),
        },
      ],
    },
    incarnated: [...next.incarnated, actor],
  };
};

/**
 * Ends `actor`'s incarnation (Actors R8): its record waits out the grace, unbound.
 */
export const finished = (walk: Walk, actor: ActorRef, given: Rules) => {
  const next = pushed(walk, ActorMove.Finished({ actor }), given);

  return {
    ...next,
    model: { ...next.model, live: next.model.live.filter((l) => !sameActor(l.actor, actor)) },
  };
};

/**
 * An `Ensured` owes `actor` an incarnation when it has none (Actors R6, R9), while the Runtime
 * runs. A send may reach a disposed or forgotten identity, so a `Drove` only allows one.
 */
const used = (walk: Walk, actor: ActorRef, given: Rules) => {
  const marked = { ...walk, used: [...walk.used, actor] };

  return walk.model.mode === "running" && !isLive(walk.model, actor)
    ? opened(marked, actor, given)
    : marked;
};

const ENDED_LIVES: ReadonlyArray<string> = ["Closed", "Refused", "Evidence"];

/**
 * Whether the suite knows `actor` is free while the clock moves (Actors R7): opened by its own
 * ensure, no use held, every
 * Attempt of its lanes gone and every ending of them settled, its record encodable, the Runtime
 * running, and no schedule at its leaf that could fire first.
 */
const surelyFree = (walk: Walk, known: Known, actor: ActorRef) => {
  const { model } = walk;
  const leaf = walk.leaves.get(`${actor.machine} ${actor.id}`);
  const woken = model.live.some((l) => sameActor(l.actor, actor) && l.woken);
  const timed = known.timed[actor.machine] ?? [];

  return (
    model.mode === "running" &&
    !woken &&
    !model.unencodable &&
    !holds(model, actor) &&
    leaf !== undefined &&
    !timed.includes(leaf) &&
    model.attempts.every((a) => !sameActor(a.lane.actor, actor) || Phase.$is("Gone")(a.phase)) &&
    model.endings.every((e) => !sameActor(e.actor, actor) || ENDED_LIVES.includes(e.life._tag))
  );
};

/**
 * Actors R8's grace, on the Runtime Clock the suite drives.
 */
export const GRACE_MS = 100;

/**
 * The clock moved `ms`: each live actor the suite knows is free counts it, and one free for the
 * whole grace owes its end in this step (Actors R8, I10, I37); any other's free time is unknown.
 */
const aged = (walk: Walk, known: Known, ms: number, given: Rules) =>
  walk.model.live.reduce<Walk>(
    (w, l) => {
      const free = surelyFree(w, known, l.actor)
        ? Option.map(l.free, (n) => n + ms)
        : Option.none<number>();

      if (Option.exists(free, (n) => n >= GRACE_MS))
        return {
          ...finished(w, l.actor, given),
          ends: [...w.ends, l.actor],
          dirtyEnds: Option.isSome(l.dirty) ? [...w.dirtyEnds, l.actor] : w.dirtyEnds,
        };

      return {
        ...w,
        model: {
          ...w.model,
          live: w.model.live.map((x) =>
            sameActor(x.actor, l.actor) ? { ...x, free, upper: x.upper + ms } : x,
          ),
        },
      };
    },
    { ...walk, model: { ...walk.model, clock: walk.model.clock + ms } },
  );

/**
 * Any suite fact but the clock's restarts every live actor's count: what it changed is judged at
 * the next `Advanced`.
 */
const restarted = (walk: Walk) => ({
  ...walk,
  model: {
    ...walk.model,
    live: walk.model.live.map((l) => ({ ...l, free: Option.some(0) })),
  },
});

/**
 * The step's predicted turns changed records: a turn surely changing one (its alternative updates
 * memory or moves the leaf) leaves it `dirty`, and any turn but one surely changing nothing leaves
 * it `unwritten`, from now.
 */
export const changed = (walk: Walk, turns: ReadonlyArray<Predicted>) => ({
  ...walk,
  model: {
    ...walk.model,
    live: walk.model.live.map((l) => {
      const mine = turns.filter((t) => sameActor(t.actor, l.actor));
      const now = Option.some(walk.model.clock);
      const sure = mine.some((t) => Option.contains(t.changes, true));
      const maybe = mine.some((t) => !Option.contains(t.changes, false));

      return {
        ...l,
        dirty: sure ? Option.orElse(l.dirty, () => now) : l.dirty,
        unwritten: maybe ? Option.orElse(l.unwritten, () => now) : l.unwritten,
      };
    }),
  },
});

/**
 * A batch was written: no record is surely dirty any more (the batch may hold it), and one that
 * may be is written once its capture was due by now (WriteAhead R10).
 */
const written = (model: Model, captureMs: number) => ({
  ...model,
  live: model.live.map((l) => ({
    ...l,
    dirty: Option.none<number>(),
    unwritten: Option.filter(l.unwritten, (since) => since + captureMs > model.clock),
  })),
});

/**
 * A use of `actor` was attached or released: it was not free until now.
 */
const unfreed = (walk: Walk, actor: ActorRef) => ({
  ...walk,
  model: {
    ...walk.model,
    live: walk.model.live.map((l) => (sameActor(l.actor, actor) ? { ...l, upper: 0 } : l)),
  },
});

const removed = (walk: Walk, move: Input, given: Rules) => {
  const next = pushed(walk, move, given);
  const actor = "actor" in move ? move.actor : undefined;

  return {
    ...next,
    model: {
      ...next.model,
      live: next.model.live.filter((l) => actor === undefined || !sameActor(l.actor, actor)),
    },
  };
};

const holding = (walk: Walk, fact: SuiteFact) => ({
  ...walk,
  model: { ...walk.model, held: holdUse(walk.model.held, fact) },
});

/**
 * Applies one suite fact: what the suite drove and what its world saw, with a batch's purpose, a
 * runtime answer taken as a stated limit.
 */
export const onSuiteFact = (walk: Walk, fact: SuiteFact, known: Known, given: Rules) => {
  if (SuiteFact.$is("Advanced")(fact)) return aged(walk, known, fact.ms, given);

  const counted = {
    ...walk,
    writes: walk.writes + (SuiteFact.$is("Wrote")(fact) ? 1 : 0),
    stirred: walk.stirred || !CLOCK_ONLY.includes(fact._tag),
  };

  return suiteMoved(QUIET_FACTS.includes(fact._tag) ? counted : restarted(counted), fact, given);
};

const QUIET_FACTS: ReadonlyArray<string> = ["Stepped", "Read"];

/**
 * The suite facts of a step that only moved the clock: in such a step a record is written only by
 * an actor's end (Actors R8) or the Runtime's disposal.
 */
const CLOCK_ONLY: ReadonlyArray<string> = ["Stepped", "Advanced", "Wrote", "Read"];

const suiteMoved = (walk: Walk, fact: SuiteFact, given: Rules) =>
  SuiteFact.$match(fact, {
    Reloaded: ({ release }) => {
      const closed = closedTurn({ ...walk, model: { ...walk.model, release } }, given);
      const reloaded = pushed({ ...closed, model: rolledBack(closed.model) }, Move.Reload(), given);

      return {
        ...reloaded,
        model: booted({ ...unlanded(reloaded.model), held: [], live: [] }),
        reloaded: true,
      };
    },
    DisposingRuntime: () => pushed(walk, Move.DisposalStarts(), given),
    Disposed: ({ actor }) => removed(holding(walk, fact), ActorMove.Disposed({ actor }), given),
    Forgot: ({ actor }) => removed(holding(walk, fact), ActorMove.Forgot({ actor }), given),
    Ensured: ({ actor }) => used(unfreed(holding(walk, fact), actor), actor, given),
    Drove: ({ actor }) => ({ ...walk, used: [...walk.used, actor] }),
    Unstoppable: ({ operation }) =>
      walk.model.unstoppable.includes(operation)
        ? walk
        : {
            ...walk,
            model: { ...walk.model, unstoppable: [...walk.model.unstoppable, operation] },
          },
    Landed: () => ({ ...walk, model: landed(walk.model) }),
    Wrote: () => {
      const model = wrote(
        walk.model,
        Option.getOrElse(walk.least, () => walk.model),
        walk.purposes[0] ?? "capture",
      );

      const due = model.live.some((l) =>
        Option.exists(l.unwritten, (since) => since + walk.captureMs <= model.clock),
      );

      return {
        ...walk,
        model: written(model, walk.captureMs),
        purposes: walk.purposes.slice(1),
        captured: walk.captured || due,
      };
    },
    Dropped: () => ({ ...walk, model: { ...walk.model, pending: Option.none() } }),
    Released: ({ actor }) => unfreed(holding(walk, fact), actor),
    Stepped: () => walk,
    Requested: () => walk,
    Answered: () => walk,
    Advanced: () => walk,
    Read: () => walk,
  });

/**
 * The incarnations and ends the step owed that the runtime never reported (Actors R6, R9, I37).
 */
const unheard = (walk: Walk) => [
  ...walk.incarnated
    .filter((a) => !walk.incarnationsHeard.some((h) => sameActor(h, a)))
    .map((a) => ({
      invariant: "Actors I14" as const,
      text: `${a.machine} ${a.id} was used with no live incarnation, but none was reported`,
    })),
  ...walk.ends
    .filter((a) => !walk.endsHeard.some((h) => sameActor(h, a)))
    .map((a) => ({
      invariant: "Actors I37" as const,
      text: `${a.machine} ${a.id} was free for the whole grace, but its end was not reported`,
    })),
  ...walk.dirtyEnds.slice(0, walk.writes === 0 ? walk.dirtyEnds.length : 0).map((a) => ({
    invariant: "Actors I37" as const,
    text: `${a.machine} ${a.id} ended with its record dirty, but no record was written at its end (R8, orchestrator's decision on review B1)`,
  })),
  ...usedWrite(walk),
];

/**
 * A record written in a step that only moved the clock, with no turn, no end owed, every live
 * actor used or free for less than the grace, and no capture due for a record that may be dirty
 * (WriteAhead R10): only an end could write it, and no actor may end (Actors R8, I10).
 */
const usedWrite = (walk: Walk) =>
  walk.writes > 0 &&
  !walk.stirred &&
  walk.planned === 0 &&
  walk.ends.length === 0 &&
  walk.model.mode === "running" &&
  walk.model.live.length > 0 &&
  !walk.captured &&
  walk.model.live.every((l) => holds(walk.model, l.actor) || l.upper < GRACE_MS)
    ? [
        {
          invariant: "Actors I10" as const,
          text: "a record was written in a step that only moved the clock while no live actor could end: an end before its time",
        },
      ]
    : [];

/**
 * Applies the Attempts a landed batch acknowledges: a runtime answer taken as a stated limit, since
 * the store cannot read Attempt ids without a codec.
 */
export const acknowledged = (walk: Walk, attempts: ReadonlyArray<string>) => ({
  ...walk,
  model: { ...walk.model, acknowledged: [...walk.model.acknowledged, ...attempts] },
});

/**
 * The step's end: the turn closes, a reload's boot settles, every Attempt and ending sees
 * `StepEnds`, and the obligations due by then are refused on that move, with every report the step
 * matched to no item (Conformance R19, design N1).
 */
export const ended = (walk: Walk, given: Rules) => {
  const closed = closedTurn(walk, given);
  const settled = closed.reloaded ? pushed(closed, Move.BootSettles(), given) : closed;

  const stepped = pushed(settled, Move.StepEnds({ unstoppable: settled.model.unstoppable }), given);

  const [model, late] = due(stepped.model, "StepEnds", given);
  const before = stepped.applied.slice(0, -1);

  const last = stepped.applied.slice(-1).map((a) => ({
    ...a,
    refusals: [...a.refusals, ...walk.unmatched, ...late, ...unheard(walk)],
  }));

  return { ...stepped, model, applied: [...before, ...last] };
};
