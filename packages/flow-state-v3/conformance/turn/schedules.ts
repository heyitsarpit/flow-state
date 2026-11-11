import { Option } from "effect";
import { Fact, holdUse, oracle, violation } from "../dsl/oracle.ts";
import { type Handlers, possible, type Schedule } from "../fixtures/handlers.ts";
import { type ActorRef, Observation, sameActor, type Turn, type Use } from "../port.ts";
import { type Anchor, anchorOf, judgedStep } from "./selection.ts";

type Armed = {
  readonly state: string;
  readonly schedule: Schedule;
  readonly at: number;
  readonly step: number;
};

type State = {
  readonly anchor: Anchor;
  readonly clock: number;
  readonly step: number;
  readonly uses: ReadonlyArray<readonly [ActorRef, Use]>;
  readonly armed: ReadonlyMap<string, ReadonlyArray<Armed>>;
  readonly unknown: ReadonlySet<string>;
};

type Walk = { readonly state: State; readonly found: ReadonlyArray<string> };

const keyOf = (actor: ActorRef) => `${actor.machine} ${actor.id}`;

const name = (turn: Turn) => `${turn.actor.machine} ${turn.actor.id} ran ${turn.event}`;

// RETURN_TYPE: the oracle's State contract; inference would widen the Maps' entries.
const withArmed = (state: State, key: string, armed: ReadonlyArray<Armed>): State => ({
  ...state,
  armed: new Map([...state.armed, [key, armed]]),
});

// RETURN_TYPE: the oracle's State contract; inference would widen the Maps' entries.
const forgotten = (state: State, key: string): State => ({
  ...state,
  armed: new Map([...state.armed].filter(([k]) => k !== key)),
  unknown: new Set([...state.unknown].filter((k) => k !== key)),
});

// RETURN_TYPE: the oracle's State contract; an empty Map infers entries of never.
const reloaded = (state: State): State => ({
  ...state,
  armed: new Map(),
  unknown: new Set([...state.unknown, ...state.armed.keys()]),
});

const wasSent = (step: ReadonlyArray<Fact>, turn: Turn) =>
  step.some(
    (fact) =>
      (Fact.$is("Drove")(fact) && sameActor(fact.actor, turn.actor) && fact.event === turn.event) ||
      (Fact.$is("Reported")(fact) &&
        Observation.$is("Delivered")(fact.observation) &&
        fact.observation.event === turn.event),
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

  if (state.unknown.has(key)) return { armed: Option.none<Armed>(), found: unused };

  const armed = (state.armed.get(key) ?? []).find(
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
  const due = Option.map(armed.schedule.delayMs, (ms) => armed.at + ms);

  const tooSoon = Option.match(due, {
    onNone: () => sameStep && clockAfter === armed.at,
    onSome: (at) => clockAfter < at,
  });

  const where = sameStep ? ", in this step" : "";

  const timing = tooSoon
    ? [
        `Turn I21: ${name(turn)}, the firing of ${armed.schedule.id}, at ${clockAfter} ms, before the delay of its arming (at ${armed.at} ms or later${where}) passed`,
      ]
    : [];

  return { armed: Option.some(armed), found: [...unused, ...timing] };
};

const armedAfter = (state: State, handlers: Handlers, turn: Turn, fired: Option.Option<Armed>) => {
  const key = keyOf(turn.actor);
  const before = (state.armed.get(key) ?? []).filter((a) => !Option.exists(fired, (f) => f === a));
  const ran = turn.parts.find((p) => p.part.length === 0 && p.definition === turn.actor.machine);

  const enters = possible(handlers, turn.from, turn.event, "either").alternatives.some(
    (a) => a.at === ran?.at && a.enters,
  );

  const armedAt = (state_: string, which: (s: Schedule) => boolean) =>
    (handlers.schedules[state_] ?? [])
      .filter(which)
      .map((schedule) => ({ state: state_, schedule, at: state.clock, step: state.step }));

  if (enters) return armedAt(turn.to, (s) => s.entry);

  const rearmed = armedAt(turn.from, (s) => s.armOn.includes(turn.event));

  return [
    ...before.filter((a) => !rearmed.some((r) => r.schedule.id === a.schedule.id)),
    ...rearmed,
  ];
};

// RETURN_TYPE: the fold's Walk contract, shared by every branch.
const onTurn = (walk: Walk, turn: Turn, step: ReadonlyArray<Fact>, clockAfter: number): Walk => {
  const handlers = walk.state.anchor.machines[turn.actor.machine];

  if (handlers === undefined) return walk;

  const key = keyOf(turn.actor);

  const judged = firing(handlers, turn, step)
    ? judgeFiring(walk.state, turn, clockAfter)
    : { armed: Option.none<Armed>(), found: [] };

  const armed = armedAfter(walk.state, handlers, turn, judged.armed);
  const next = withArmed(walk.state, key, armed);

  const known = armed.some((a) => a.step === walk.state.step)
    ? { ...next, unknown: new Set([...next.unknown].filter((k) => k !== key)) }
    : next;

  return { state: known, found: [...walk.found, ...judged.found] };
};

// RETURN_TYPE: the fold's Walk contract, shared by every branch.
const onFact = (walk: Walk, fact: Fact, step: ReadonlyArray<Fact>, clockAfter: number): Walk => {
  const state = { ...walk.state, uses: holdUse(walk.state.uses, fact) };
  const kept = { ...walk, state };

  if (Fact.$is("Reloaded")(fact)) return { ...walk, state: reloaded(state) };

  if (Fact.$is("Disposed")(fact) || Fact.$is("Forgot")(fact))
    return { ...walk, state: forgotten(state, keyOf(fact.actor)) };

  if (!Fact.$is("Reported")(fact)) return kept;

  const o = fact.observation;

  if (Observation.$is("Finished")(o)) return { ...walk, state: forgotten(state, keyOf(o.actor)) };

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
 * - After a reload an actor's armings are unknown (the record may lag its last turn) until a turn
 *   arms its schedules again; its firings are judged only for use. Overdue firings on resume
 *   (I22) are not judged.
 * - A delay a function of memory computes (WAITING's `retry`) is not checked for time.
 * - An initial state's schedules are not armed by a turn; no fixture's initial state has one.
 */
export const schedules = oracle<State>({
  name: "schedules",
  guarantee: ["Turn I20", "Turn I21", "Turn I23"],
  start: (_reference, _graphs, machines) => ({
    anchor: anchorOf(machines),
    clock: 0,
    step: 0,
    uses: [],
    armed: new Map(),
    unknown: new Set(),
  }),
  step: (state, step) => {
    const judged = judgedStep(state.anchor, step);
    const advanced = step.reduce((ms, f) => (Fact.$is("Advanced")(f) ? ms + f.ms : ms), 0);
    const clockAfter = state.clock + advanced;
    const counted = { ...state, step: state.step + 1 };

    const walked = judged.facts.reduce<Walk>((walk, fact) => onFact(walk, fact, step, clockAfter), {
      state: counted,
      found: [],
    });

    return [
      { ...walked.state, anchor: judged.state, clock: clockAfter },
      [...new Set(walked.found)].map(violation),
    ];
  },
});
