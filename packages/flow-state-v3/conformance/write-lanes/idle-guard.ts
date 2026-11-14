import { Option } from "effect";
import type { LifeStep } from "../dsl/expect.ts";
import { Fact, oracle, violation } from "../dsl/oracle.ts";
import { type Machines, possible } from "../fixtures/handlers.ts";
import { type Json, MemberTarget, Observation, sameActor, sameJson, type Turn } from "../port.ts";

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

/**
 * The key of the lane the guarded alternative's own commit named, when it ran one: the lane its
 * `idle(k)` reads (WriteLanes I13 is per lane).
 */
const committedKey = (turn: Turn, operation: string) =>
  Option.fromUndefinedOr(
    turn.members.flatMap((m) =>
      m.operation === operation && m.kind === "commit" && MemberTarget.$is("Key")(m.target)
        ? [m.target.key]
        : [],
    )[0],
  );

const idleIn = (lives: LifeStep, turn: Turn, operation: string, key: Option.Option<Json>) =>
  !lives.before.attempts.some(
    (a) =>
      sameActor(a.lane.actor, turn.actor) &&
      a.lane.operation === operation &&
      a.phase._tag !== "Gone" &&
      Option.match(key, {
        onNone: () => true,
        onSome: (k) => Option.exists(a.lane.key, (l) => sameJson(l, k)),
      }),
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

  const name = `${turn.actor.machine} ${turn.actor.id} ran ${turn.event}`;

  if (ranAt === guardedAt && !idleIn(lives, turn, operation, committedKey(turn, operation)))
    return [
      `WriteLanes I13: ${name} by ${guarded.at}, whose idle(${operation}) passed over a lane that is not Idle`,
    ];

  if (ranAt > guardedAt && idleIn(lives, turn, operation, Option.none()))
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
 *   lanes moved within the step). Kept endings are not read.
 * - The guard's key is read from the guarded alternative's own commit, when it ran one (S10's
 *   `idle(repo)` then `commit(repo)`); otherwise the lane is the actor's whole operation, as Pay's
 *   one intent is. Passing the guard over is judged only when every lane of the operation is
 *   Idle, since its key is then idle whatever it is.
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
      .map((s) => violation(s)),
  ],
});
