import { Option } from "effect";
import type { LifeStep } from "../dsl/lifecycle-step.ts";
import { Fact, oracle, violation } from "../dsl/oracle.ts";
import { type Machines, possible } from "../fixtures/handlers.ts";
import { Observation, sameActor, type Turn } from "../port.ts";

type State = { readonly machines: Machines };

const touched = (step: ReadonlyArray<Fact>, before: number, operation: string) =>
  step
    .slice(0, before)
    .some(
      (fact) =>
        Fact.$is("Reported")(fact) &&
        (Observation.$is("Minted")(fact.observation) ||
          Observation.$is("Sent")(fact.observation) ||
          Observation.$is("Ended")(fact.observation)) &&
        fact.observation.operation === operation,
    );

const idleIn = (lives: LifeStep, turn: Turn, operation: string) =>
  !lives.before.attempts.some(
    (a) =>
      sameActor(a.lane.actor, turn.actor) &&
      a.lane.operation === operation &&
      a.phase._tag !== "Gone",
  );

const judged = (
  state: State,
  lives: LifeStep,
  step: ReadonlyArray<Fact>,
  at: number,
  turn: Turn,
) => {
  const handlers = state.machines[turn.actor.machine];
  const ran = turn.parts.find((p) => p.part.length === 0 && p.definition === turn.actor.machine);

  if (handlers === undefined || ran === undefined) return [];

  const walk = possible(handlers, turn.from, turn.event, "current").alternatives;
  const guardedAt = walk.findIndex((a) => Option.isSome(a.idle));
  const guarded = walk[guardedAt];
  const ranAt = walk.findIndex((a) => a.at === ran.at);

  if (guarded === undefined || ranAt < 0 || Option.isNone(guarded.idle)) return [];

  const operation = guarded.idle.value;

  if (touched(step, at, operation)) return [];

  const idle = idleIn(lives, turn, operation);
  const name = `${turn.actor.machine} ${turn.actor.id} ran ${turn.event}`;

  if (ranAt === guardedAt && !idle)
    return [
      `WriteLanes I13: ${name} by ${guarded.at}, whose idle(${operation}) passed over a lane that is not Idle`,
    ];

  if (ranAt > guardedAt && idle)
    return [
      `WriteLanes I13: ${name} by ${ran.at}, past ${guarded.at}, whose idle(${operation}) holds: every lane is Idle`,
    ];

  return [];
};

/**
 * `idle` guards (WriteLanes I13): an alternative guarded by `idle(k)` is taken iff every lane of
 * its operation is Idle.
 *
 * **Details**
 *
 * - The handler table marks the alternatives an `idle` guard holds (`idleOn`), with no other
 *   guard. For a turn whose walk reaches one, the lanes are read from the Case's lifecycle at the
 *   step's start: Idle when no Attempt of that actor and operation is in any phase but `Gone`.
 * - Taking the guarded alternative over a lane that is not Idle breaks I13, and so does passing it
 *   over for a later one while the lanes are Idle.
 *
 * **Gotchas**
 *
 * - A turn after a mint, send or ending of that operation earlier in its step is not judged (the
 *   lanes moved within the step). Kept endings and keys are not read: the lane is the actor's
 *   whole operation, as Pay's one intent is.
 */
export const idleGuard = oracle<State>({
  name: "idle-guard",
  guarantee: ["WriteLanes I13"],
  start: (_reference, _graphs, machines) => ({ machines }),
  step: (state, step, _requests, lives) => [
    state,
    step
      .flatMap((fact, at) =>
        Fact.$is("Reported")(fact) && Observation.$is("Turn")(fact.observation)
          ? judged(state, lives, step, at, fact.observation)
          : [],
      )
      .map(violation),
  ],
});
