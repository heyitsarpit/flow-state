import { Option } from "effect";
import { type ActorRef, sameActor } from "../port.ts";
import { advance, incarnate } from "./lifecycle.ts";
import { applyLane } from "./lifecycle-lanes.ts";
import { applyLives, applyLife } from "./lifecycle-lives.ts";
import {
  ActorMove,
  type ActorRecord,
  type Input,
  LaneMove,
  LifeMove,
  type Model,
  Move,
  type Refusal,
} from "./lifecycle-model.ts";
import { type Rules, rules } from "./lifecycle-rules.ts";

/**
 * One fold result of any lifecycle move: the next model and the refusals found.
 */
export type Folded = readonly [Model, ReadonlyArray<Refusal>];

// RETURN_TYPE: the fold's result is the named tuple; a literal would infer as an array.
const appliedOf = (model: Model, refusals: ReadonlyArray<Refusal> = []): Folded => [
  model,
  refusals,
];

const recorded = (model: Model, actor: ActorRef, record: ActorRecord) => {
  return {
    ...model,
    actors: [...model.actors.filter((a) => !sameActor(a.actor, actor)), { actor, record }],
  };
};

const actorMoved = (model: Model, move: ActorMove, given: Rules) =>
  ActorMove.$match(move, {
    Incarnated: ({ actor }) =>
      applyLives(incarnate(model, actor), "Opens", Option.some(actor), given),
    Adopt: ({ actor }) => applyLives(incarnate(model, actor), "Opens", Option.some(actor), given),
    Finished: ({ actor }) => appliedOf(recorded(model, actor, "grace")),
    Disposed: ({ actor }) => appliedOf(recorded(model, actor, "disposeActor")),
    Forgot: ({ actor }) => appliedOf(recorded(model, actor, "forget")),
  });

const livesRow = (move: Move) => {
  if (Move.$is("StepEnds")(move)) return Option.some("StepEnds" as const);

  if (Move.$is("Reload")(move)) return Option.some("Reload" as const);

  return Move.$is("DisposalStarts")(move) ? Option.some("DisposalStarts" as const) : Option.none();
};

const attemptMoved = (model: Model, move: Move, given: Rules) => {
  const [after, found] = advance(model, move, given);
  const row = livesRow(move);

  if (Option.isNone(row)) return appliedOf(after, found);
  const [lived, more] = applyLives(after, row.value, Option.none(), given);

  return appliedOf(lived, [...found, ...more]);
};

const LANE_TAGS: ReadonlyArray<string> = ["Turn", "Minted", "Declined", "TurnCloses"];

const LIFE_TAGS: ReadonlyArray<string> = [
  "Delivered",
  "Refused",
  "Heard",
  "Parked",
  "Unparked",
  "Recorded",
];

const ACTOR_TAGS: ReadonlyArray<string> = ["Incarnated", "Adopt", "Finished", "Disposed", "Forgot"];

// RETURN_TYPE: a type predicate narrows the move's family; it cannot be inferred.
const isLaneMove = (input: Input): input is LaneMove => LANE_TAGS.includes(input._tag);

// RETURN_TYPE: a type predicate narrows the move's family; it cannot be inferred.
const isLifeMove = (input: Input): input is LifeMove => LIFE_TAGS.includes(input._tag);

// RETURN_TYPE: a type predicate narrows the move's family; it cannot be inferred.
const isActorMove = (input: Input): input is ActorMove => ACTOR_TAGS.includes(input._tag);

/**
 * Applies any lifecycle move: an Attempt's by Table A (with its row of Table C for the instants
 * every ending sees), a lane member's by Table B, an ending's by Table C, or an actor's.
 *
 * **Details**
 *
 * - `Incarnated` and `Adopt` begin an incarnation: its Held heads owe their restore ending, and
 *   its endings see `Opens`.
 * - `Finished`, `Disposed` and `Forgot` set the actor's record, which names why it is unbound.
 *
 * **Gotchas**
 *
 * - Every move is taken as anchored: the caller turns facts into moves, closes the turn at the
 *   next delivery, turn or reload and at the step's end, and gives `Incarnated` only after a suite
 *   use of that actor and `Adopt` only for an unbound one.
 */
export const apply = (model: Model, input: Input, given: Rules = rules) => {
  if (isLaneMove(input)) return applyLane(model, input, given);

  if (isLifeMove(input)) return applyLife(model, input, given);

  return isActorMove(input) ? actorMoved(model, input, given) : attemptMoved(model, input, given);
};

/**
 * Constructors for every lifecycle move, by family.
 */
export const moves = { Move, LaneMove, LifeMove, ActorMove };
