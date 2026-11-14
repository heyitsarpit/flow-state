import { Data, Option } from "effect";
import { Fact, isRuntimeFact, oracle, violation } from "../dsl/oracle.ts";
import { Address, holdUse } from "../dsl/facts.ts";
import type { Handlers, Schedule } from "../fixtures/handlers.ts";
import { armedBy, enteredBy } from "./arming.ts";
import { type ActorRef, Observation, sameActor, type Turn, type Use } from "../port.ts";
import { type Anchor, anchorOf, judgedStep } from "./selection.ts";

type Armed = {
  readonly state: string;
  readonly schedule: Schedule;
  readonly at: number;
  readonly step: number;
  readonly due: Option.Option<number>;
};

/**
 * What the suite knows of one actor's armed schedules: the armings it carried (`Known`), or none
 * it can tell (`Unknown`: after a reload or an incarnation's end, a record's timers come back
 * unseen, until a turn enters a state again).
 */
type Arming = Data.TaggedEnum<{
  Known: { armed: ReadonlyArray<Armed> };
  Unknown: {};
}>;

const Arming = Data.taggedEnum<Arming>();

type State = {
  readonly anchor: Anchor;
  readonly after: Anchor;
  readonly disposing: boolean;
  readonly clock: number;
  readonly step: number;
  readonly uses: ReadonlyArray<readonly [ActorRef, Use]>;
  readonly actors: ReadonlyMap<string, Arming>;
};

type Walk = { readonly state: State; readonly found: ReadonlyArray<string> };

const keyOf = (actor: ActorRef) => `${actor.machine} ${actor.id}`;

const name = (turn: Turn) => `${turn.actor.machine} ${turn.actor.id} ran ${turn.event}`;

// RETURN_TYPE: the oracle's State contract; inference would widen the Map's entries.
const withArming = (state: State, key: string, arming: Arming): State => ({
  ...state,
  actors: new Map([...state.actors, [key, arming]]),
});

// RETURN_TYPE: the oracle's State contract; inference would widen the Map's entries.
const forgotten = (state: State, key: string): State => ({
  ...state,
  actors: new Map([...state.actors].filter(([k]) => k !== key)),
});

// RETURN_TYPE: the oracle's State contract; inference would widen the Map's entries.
const reloaded = (state: State): State => ({
  ...state,
  actors: new Map([...state.actors.keys()].map((k) => [k, Arming.Unknown()])),
});

const armedOf = (state: State, key: string) => {
  const arming = state.actors.get(key);

  return arming !== undefined && Arming.$is("Known")(arming) ? arming.armed : [];
};

const wasSent = (step: ReadonlyArray<Fact>, turn: Turn) =>
  step.some(
    (fact) =>
      (Fact.$is("Drove")(fact) &&
        sameActor(fact.actor, turn.actor) &&
        Address.$is("Root")(fact.to) &&
        fact.event === turn.event) ||
      (Fact.$is("Reported")(fact) &&
        Observation.$is("Delivered")(fact.observation) &&
        fact.observation.event === turn.event &&
        Option.exists(fact.observation.actor, (a) => sameActor(a, turn.actor))),
  );

const firing = (handlers: Handlers, turn: Turn, step: ReadonlyArray<Fact>) =>
  !wasSent(step, turn) &&
  Object.values<ReadonlyArray<Schedule> | undefined>(handlers.schedules).some((list) =>
    (list ?? []).some((s) => s.send === turn.event),
  );

const judgeFiring = (state: State, turn: Turn, clockAfter: number) => {
  const key = keyOf(turn.actor);
  const used = state.uses.some(([a]) => sameActor(a, turn.actor));

  const unused = used
    ? []
    : [`Turn I23: ${name(turn)}, sent by its schedule while the actor was not Used`];

  if (Option.exists(Option.fromUndefinedOr(state.actors.get(key)), Arming.$is("Unknown")))
    return { armed: Option.none<Armed>(), found: unused };

  const armed = armedOf(state, key).find(
    (a) => a.state === turn.from && a.schedule.send === turn.event,
  );

  if (armed === undefined)
    return {
      armed: Option.none<Armed>(),
      found: [
        ...unused,
        `Turn I20: ${name(turn)} at ${turn.from}, where no schedule of its live Activation is armed to send it: the firing of an earlier arming or an ended Activation`,
      ],
    };

  const sameStep = armed.step === state.step;
  const { due } = armed;

  const tooSoon = Option.match(due, {
    onNone: () => false,
    onSome: (at) => clockAfter < at,
  });

  const where = sameStep ? ", in this step" : "";

  const invariant = Option.isNone(armed.schedule.delayMs) ? "Turn I12" : "Turn I21";

  const timing = tooSoon
    ? [
        `${invariant}: ${name(turn)}, the firing of ${armed.schedule.id}, at ${clockAfter} ms, before the delay of its arming (at ${armed.at} ms or later${where}) passed`,
      ]
    : [];

  return { armed: Option.some(armed), found: [...unused, ...timing] };
};

const armedAfter = (state: State, handlers: Handlers, turn: Turn, fired: Option.Option<Armed>) => {
  const key = keyOf(turn.actor);
  const before = armedOf(state, key).filter((a) => !Option.exists(fired, (f) => f === a));

  const fields = Option.flatMap(
    Option.fromUndefinedOr(state.after.actors.get(key)),
    (a) => a.fields,
  );

  const dueOf = (schedule: Schedule) =>
    Option.orElse(
      Option.map(schedule.delayMs, (ms) => state.clock + ms),
      () =>
        Option.flatMap(Option.fromUndefinedOr(handlers.folds.delays[schedule.id]), (delay) =>
          Option.map(
            Option.flatMap(fields, (f) => delay(f)),
            (ms) => state.clock + ms,
          ),
        ),
    );

  const armed = armedBy(handlers, turn).map(([at, schedule]) => ({
    state: at,
    schedule,
    at: state.clock,
    step: state.step,
    due: dueOf(schedule),
  }));

  if (enteredBy(handlers, turn)) return armed;

  return [...before.filter((a) => !armed.some((r) => r.schedule.id === a.schedule.id)), ...armed];
};

/**
 * Each schedule whose delay memory computes, armed for a used actor, that was due by `clock` and
 * has not fired (Turn I12: its delay is read from the After memory).
 */
const overdue = (state: State, clock: number) =>
  (state.disposing ? [] : [...state.actors]).flatMap(([key, arming]) =>
    Arming.$is("Known")(arming) && state.uses.some(([a]) => keyOf(a) === key)
      ? arming.armed
          .filter(
            (a) => Option.isNone(a.schedule.delayMs) && Option.exists(a.due, (due) => due <= clock),
          )
          .map(
            (a) =>
              `Turn I12: ${key}'s ${a.schedule.id} at ${a.state}, armed at ${a.at} ms with the delay its After memory gives, was due by ${Option.getOrElse(a.due, () => 0)} ms but had not fired at ${clock} ms`,
          )
      : [],
  );

// RETURN_TYPE: the fold's Walk contract, shared by every branch.
const onTurn = (walk: Walk, turn: Turn, step: ReadonlyArray<Fact>, clockAfter: number): Walk => {
  const handlers = walk.state.anchor.machines[turn.actor.machine];

  if (handlers === undefined) return walk;

  const key = keyOf(turn.actor);

  const judged = firing(handlers, turn, step)
    ? judgeFiring(walk.state, turn, clockAfter)
    : { armed: Option.none<Armed>(), found: [] };

  const armed = armedAfter(walk.state, handlers, turn, judged.armed);
  const was = walk.state.actors.get(key);
  const unknown = was !== undefined && Arming.$is("Unknown")(was) && !enteredBy(handlers, turn);
  const next = withArming(walk.state, key, unknown ? Arming.Unknown() : Arming.Known({ armed }));

  return { state: next, found: [...walk.found, ...judged.found] };
};

// RETURN_TYPE: the fold's Walk contract, shared by every branch.
const onFact = (walk: Walk, fact: Fact, step: ReadonlyArray<Fact>, clockAfter: number): Walk => {
  const state = {
    ...walk.state,
    uses: isRuntimeFact(fact) ? walk.state.uses : holdUse(walk.state.uses, fact),
  };

  const kept = { ...walk, state };

  if (Fact.$is("Reloaded")(fact))
    return { ...walk, state: { ...reloaded(state), disposing: false } };

  if (Fact.$is("DisposingRuntime")(fact)) return { ...walk, state: { ...state, disposing: true } };

  if (Fact.$is("Disposed")(fact) || Fact.$is("Forgot")(fact))
    return { ...walk, state: forgotten(state, keyOf(fact.actor)) };

  if (!Fact.$is("Reported")(fact)) return kept;

  const o = fact.observation;

  if (Observation.$is("Finished")(o))
    return { ...walk, state: withArming(state, keyOf(o.actor), Arming.Unknown()) };

  return Observation.$is("Turn")(o) ? onTurn(kept, o, step, clockAfter) : kept;
};

/**
 * Schedule firings (Turn I20, I21, I23): a schedule's firing comes from its live Activation's
 * latest arming, after the turn that armed it, and only while its actor is used.
 *
 * **Details**
 *
 * - The suite owns the clock (the sum of its `Advanced` steps), the uses (its `Ensured`,
 *   `Released`, `Disposed` and `Forgot` facts) and each actor's leaf (the `selection` oracle's
 *   judged headers). A state's schedules come from the handler table.
 * - A turn that enters a state arms that state's entry schedules at the step's start time; a turn
 *   that stays re-arms the schedules whose `armOn` lists its event; leaving a state stops its
 *   schedules; a Duration's firing ends its arming.
 * - A firing is a turn of an event a schedule sends that the suite did not drive and no ending
 *   delivered in that step. It must find its schedule armed at its leaf, with its delay passed by
 *   the end of the firing's step (an arming's time is its step's start, a lower bound). A
 *   firing with no armed schedule at its leaf breaks I20; one before its arming's delay could
 *   have passed breaks I21 (the first firing comes after the arming turn by its delay, R14, R15).
 *
 * **Gotchas**
 *
 * - After a reload or an incarnation's end (`Finished`; a persisted record keeps its timers) an
 *   actor's armings are unknown until a turn enters a state again; until then its firings are
 *   judged only for use. Overdue firings on resume (I22) are the cases' (`TURN-03/unused`).
 * - A firing names no arming id on the Port: one of a superseded arming is caught only when it
 *   lands before the latest arming's delay, or at a leaf with no armed schedule.
 * - A delay a function of memory computes (WAITING's `retry`) is the fixture's delay fold over the
 *   memory at the arming step's end (Turn I12: a schedule reads the After memory), counted, like
 *   a fixed delay, from the step's start: the earliest the arming turn ran, so a firing in the same
 *   step is too soon only when it comes before that. A used actor's
 *   such schedule still armed at the step's end once its due time passed, or firing before it,
 *   breaks I12.
 * - An initial state's schedules are not armed by a turn; no fixture's initial state has one.
 */
export const schedules = oracle<State>({
  name: "schedules",
  guarantee: ["Turn I12", "Turn I20", "Turn I21", "Turn I23"],
  start: (reference, _graphs, machines, rows) => ({
    anchor: anchorOf(machines, reference, rows),
    after: anchorOf(machines, reference, rows),
    disposing: false,
    clock: 0,
    step: 0,
    uses: [],
    actors: new Map(),
  }),
  step: (state, step) => {
    const judged = judgedStep(state.anchor, step);
    const advanced = step.reduce((ms, f) => (Fact.$is("Advanced")(f) ? ms + f.ms : ms), 0);
    const clockAfter = state.clock + advanced;
    const counted = { ...state, step: state.step + 1, after: judged.state };

    const walked = judged.facts.reduce<Walk>((walk, fact) => onFact(walk, fact, step, clockAfter), {
      state: counted,
      found: [],
    });

    return [
      { ...walked.state, anchor: judged.state, clock: clockAfter },
      [...new Set([...walked.found, ...overdue(walked.state, clockAfter)])].map((s) =>
        violation(s),
      ),
    ];
  },
});
