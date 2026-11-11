import { Option } from "effect";
import type { ActorRef } from "../port.ts";
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

const ensured = (walk: Walk, actor: ActorRef, given: Rules) => {
  const used = { ...walk, used: [...walk.used, actor] };
  const record = recordOf(walk.model, actor);

  return record !== undefined && ADOPTABLE.includes(record)
    ? {
        ...pushed(used, ActorMove.Adopt({ actor }), given),
        incarnated: [...walk.incarnated, actor],
      }
    : used;
};

const holding = (walk: Walk, fact: SuiteFact) => ({
  ...walk,
  model: { ...walk.model, held: holdUse(walk.model.held, fact) },
});

/**
 * Applies one suite fact: what the suite drove, what its world saw, and the runtime answers a
 * `limits.ts` row admits (a batch's purpose, the Attempts it acknowledges).
 */
export const onSuiteFact = (walk: Walk, fact: SuiteFact, given: Rules) =>
  SuiteFact.$match(fact, {
    Reloaded: ({ release }) => {
      const closed = closedTurn({ ...walk, model: { ...walk.model, release } }, given);
      const reloaded = pushed({ ...closed, model: rolledBack(closed.model) }, Move.Reload(), given);

      return {
        ...reloaded,
        model: booted({ ...unlanded(reloaded.model), held: [] }),
        reloaded: true,
      };
    },
    DisposingRuntime: () => pushed(walk, Move.DisposalStarts(), given),
    Disposed: ({ actor }) => pushed(holding(walk, fact), ActorMove.Disposed({ actor }), given),
    Forgot: ({ actor }) => pushed(holding(walk, fact), ActorMove.Forgot({ actor }), given),
    Ensured: ({ actor }) => ensured(holding(walk, fact), actor, given),
    Drove: ({ actor }) => ({ ...walk, used: [...walk.used, actor] }),
    Unstoppable: ({ operation }) =>
      walk.model.unstoppable.includes(operation)
        ? walk
        : {
            ...walk,
            model: { ...walk.model, unstoppable: [...walk.model.unstoppable, operation] },
          },
    Landed: () => ({ ...walk, model: landed(walk.model) }),
    Wrote: () => ({
      ...walk,
      model: wrote(
        walk.model,
        Option.getOrElse(walk.least, () => walk.model),
        walk.purposes[0] ?? "capture",
      ),
      purposes: walk.purposes.slice(1),
    }),
    Dropped: () => ({ ...walk, model: { ...walk.model, pending: Option.none() } }),
    Released: () => holding(walk, fact),
    Stepped: () => walk,
    Requested: () => walk,
    Answered: () => walk,
    Advanced: () => walk,
    Read: () => walk,
  });

/**
 * Applies the Attempts a landed batch acknowledges: a runtime answer `limits.ts` admits, since the
 * store cannot read Attempt ids without a codec.
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

  const last = stepped.applied
    .slice(-1)
    .map((a) => ({ ...a, refusals: [...a.refusals, ...walk.unmatched, ...late] }));

  return { ...stepped, model, applied: [...before, ...last] };
};
