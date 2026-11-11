import { Data, Option } from "effect";
import { Fact, oracle, type Violation, violation } from "../dsl/oracle.ts";
import { type Machines, possible } from "../fixtures/handlers.ts";
import { type ActorRef, Observation, type Turn } from "../port.ts";

/**
 * Where one actor's leaf stands for the suite: never created or forgotten (`Fresh`), disposed with
 * its record kept (`Stored`), live at a leaf the suite carried from facts it owns (`Live`), or
 * live at a leaf the suite cannot know until its next turn (`Unanchored`: restored after a reload
 * or a use of a disposed actor, or after a turn the table could not judge).
 */
type Phase = Data.TaggedEnum<{
  Fresh: {};
  Stored: {};
  Live: { state: string };
  Unanchored: {};
}>;

const Phase = Data.taggedEnum<Phase>();

/**
 * What moves a phase: the suite attached a use, disposed or forgot the actor, or reloaded the
 * page; or the runtime reported a turn, whose leaf the table judged (`to`, `None` when it could
 * not be told).
 */
type Input = Data.TaggedEnum<{
  Ensured: { initial: string };
  Disposed: {};
  Forgot: {};
  Reloaded: {};
  Turned: { to: Option.Option<string> };
}>;

const Input = Data.taggedEnum<Input>();

const carried = (to: Option.Option<string>) =>
  Option.match(to, {
    onNone: () => Phase.Unanchored(),
    onSome: (state) => Phase.Live({ state }),
  });

/**
 * The one transition table: each phase's next phase for each input.
 */
const TABLE: {
  readonly [P in Phase["_tag"]]: {
    readonly [I in Input["_tag"]]: (input: Input, phase: Phase) => Phase;
  };
} = {
  Fresh: {
    Ensured: (input) =>
      Input.$is("Ensured")(input) ? Phase.Live({ state: input.initial }) : Phase.Unanchored(),
    Disposed: () => Phase.Fresh(),
    Forgot: () => Phase.Fresh(),
    Reloaded: () => Phase.Fresh(),
    Turned: (input) => (Input.$is("Turned")(input) ? carried(input.to) : Phase.Unanchored()),
  },
  Stored: {
    Ensured: () => Phase.Unanchored(),
    Disposed: () => Phase.Stored(),
    Forgot: () => Phase.Fresh(),
    Reloaded: () => Phase.Stored(),
    Turned: (input) => (Input.$is("Turned")(input) ? carried(input.to) : Phase.Unanchored()),
  },
  Live: {
    Ensured: (_input, phase) => phase,
    Disposed: () => Phase.Stored(),
    Forgot: () => Phase.Fresh(),
    Reloaded: () => Phase.Stored(),
    Turned: (input) => (Input.$is("Turned")(input) ? carried(input.to) : Phase.Unanchored()),
  },
  Unanchored: {
    Ensured: () => Phase.Unanchored(),
    Disposed: () => Phase.Stored(),
    Forgot: () => Phase.Fresh(),
    Reloaded: () => Phase.Stored(),
    Turned: (input) => (Input.$is("Turned")(input) ? carried(input.to) : Phase.Unanchored()),
  },
};

type Actor = {
  readonly phase: Phase;
  readonly driven: ReadonlyArray<string>;
};

type State = {
  readonly machines: Machines;
  readonly actors: ReadonlyMap<string, Actor>;
};

const keyOf = (actor: ActorRef) => `${actor.machine} ${actor.id}`;

const FRESH: Actor = { phase: Phase.Fresh(), driven: [] };

const actorIn = (state: State, actor: ActorRef) => state.actors.get(keyOf(actor)) ?? FRESH;

const withActor = (state: State, actor: ActorRef, next: Actor) => ({
  ...state,
  actors: new Map([...state.actors, [keyOf(actor), next]]),
});

const moved = (state: State, actor: ActorRef, input: Input) => {
  const now = actorIn(state, actor);

  return withActor(state, actor, {
    ...now,
    phase: TABLE[now.phase._tag][input._tag](input, now.phase),
  });
};

const withoutOne = (events: ReadonlyArray<string>, event: string) => {
  const at = events.indexOf(event);

  return at < 0 ? events : [...events.slice(0, at), ...events.slice(at + 1)];
};

type Judged = { readonly to: Option.Option<string>; readonly found: ReadonlyArray<string> };

const name = (turn: Turn) => `${turn.actor.machine} ${turn.actor.id} ran ${turn.event}`;

/**
 * Judges one turn's header against the handler table from the leaf the suite carried (or, when
 * it carried none, the leaf the turn reports): the alternative the actor's root ran is one Turn I2
 * allows,
 * and the turn ends at that alternative's leaf.
 */
// RETURN_TYPE: each branch builds one judgement; the branches infer different shapes.
const judgeTurn = (machines: Machines, phase: Phase, turn: Turn, heard: boolean): Judged => {
  const handlers = machines[turn.actor.machine];

  if (handlers === undefined) return { to: Option.none(), found: [] };

  const anchored = Phase.$is("Live")(phase) ? Option.some(phase.state) : Option.none();
  const from = Option.getOrElse(anchored, () => turn.from);

  const wrongFrom = Option.match(anchored, {
    onNone: () => [],
    onSome: (state) =>
      state === turn.from
        ? []
        : [`Turn I2: ${name(turn)} from ${turn.from}, but the actor was at ${state}`],
  });

  const allowed = possible(handlers, from, turn.event, heard);
  const ran = turn.parts.find((p) => p.part.length === 0 && p.definition === turn.actor.machine);
  const ats = allowed.alternatives.map((a) => a.at).join(", ");

  if (allowed.alternatives.length === 0)
    return {
      to: Option.some(from),
      found: [
        ...wrongFrom,
        `Turn I2: ${name(turn)} at ${from}, which no alternative handles (it is Unhandled or Denied)`,
      ],
    };

  const chosen = allowed.alternatives.filter((a) =>
    ran === undefined ? a.to === turn.to : a.at === ran.at,
  );

  const [only] = allowed.alternatives;
  const fallback = allowed.alternatives.length === 1 && only !== undefined ? [only.to] : [];
  const [match] = chosen;

  if (match === undefined)
    return {
      to: Option.fromUndefinedOr(fallback[0]),
      found: [
        ...wrongFrom,
        `Turn I2: ${name(turn)} at ${from} by ${ran?.at ?? "(no root part)"}, not one of the alternatives selection allows (${ats})`,
      ],
    };

  if (match.to !== turn.to)
    return {
      to: Option.some(match.to),
      found: [
        ...wrongFrom,
        `Turn I2: ${name(turn)} at ${from} by ${match.at}, which ends at ${match.to}, but the turn says ${turn.to}`,
      ],
    };

  return { to: Option.some(match.to), found: wrongFrom };
};

const heardBy = (turn: Turn, step: ReadonlyArray<Fact>) =>
  step.some(
    (fact) =>
      Fact.$is("Reported")(fact) &&
      Observation.$is("Delivered")(fact.observation) &&
      fact.observation.event === turn.event &&
      Option.match(fact.observation.actor, {
        onNone: () => true,
        onSome: (actor) => keyOf(actor) === keyOf(turn.actor),
      }),
  );

const onTurn = (state: State, turn: Turn, step: ReadonlyArray<Fact>) => {
  const now = actorIn(state, turn.actor);
  const handlers = state.machines[turn.actor.machine];
  const driven = now.driven.includes(turn.event);
  const heard = !driven && heardBy(turn, step);

  const admitted =
    driven || heard || handlers === undefined || handlers.scheduled.includes(turn.event);

  const unadmitted = admitted
    ? []
    : [
        `Turn I2: ${name(turn)}, an event the suite never sent it, no ending delivered and no schedule sends`,
      ];

  const judged = judgeTurn(state.machines, now.phase, turn, heard);

  const next = moved(
    withActor(state, turn.actor, { ...now, driven: withoutOne(now.driven, turn.event) }),
    turn.actor,
    Input.Turned({ to: judged.to }),
  );

  return [next, [...unadmitted, ...judged.found].map(violation)] as const;
};

const initialOf = (state: State, actor: ActorRef) =>
  Option.fromUndefinedOr(state.machines[actor.machine]?.initial);

type Stepped = readonly [State, ReadonlyArray<Violation>];

// RETURN_TYPE: a tuple; inference would widen it to an array.
const keep = (state: State): Stepped => [state, []];

const reloaded = (state: State) => ({
  ...state,
  actors: new Map(
    [...state.actors].map(([key, a]) => [
      key,
      { phase: TABLE[a.phase._tag].Reloaded(Input.Reloaded(), a.phase), driven: [] },
    ]),
  ),
});

const drove = (state: State, actor: ActorRef, event: string) => {
  const now = actorIn(state, actor);

  return withActor(state, actor, { ...now, driven: [...now.driven, event] });
};

const uncredited = (state: State, actor: ActorRef) =>
  withActor(state, actor, { ...actorIn(state, actor), driven: [] });

const refused = (state: State, event: string) => {
  const holders = [...state.actors].filter(([, a]) => a.driven.includes(event));
  const [only, ...more] = holders;

  if (only === undefined || more.length > 0) return state;

  const [key, a] = only;

  return {
    ...state,
    actors: new Map([...state.actors, [key, { ...a, driven: withoutOne(a.driven, event) }]]),
  };
};

// RETURN_TYPE: every branch gives the next state and its violations; inference widens the tuples.
const onFact = (state: State, fact: Fact, step: ReadonlyArray<Fact>): Stepped =>
  Fact.$match(fact, {
    Ensured: ({ actor }) =>
      keep(
        Option.match(initialOf(state, actor), {
          onNone: () => state,
          onSome: (initial) => moved(state, actor, Input.Ensured({ initial })),
        }),
      ),
    Disposed: ({ actor }) => keep(moved(uncredited(state, actor), actor, Input.Disposed())),
    Forgot: ({ actor }) => keep(moved(uncredited(state, actor), actor, Input.Forgot())),
    Reloaded: () => keep(reloaded(state)),
    Drove: ({ actor, event }) => keep(drove(state, actor, event)),
    Reported: ({ observation }) =>
      Observation.$match(observation, {
        Turn: (turn) => onTurn(state, turn, step),
        Unhandled: ({ event }) => keep(refused(state, event)),
        Denied: ({ event }) => keep(refused(state, event)),
        Minted: () => keep(state),
        Sent: () => keep(state),
        Ended: () => keep(state),
        Delivered: () => keep(state),
        Parked: () => keep(state),
        Unparked: () => keep(state),
        Recorded: () => keep(state),
        Evidence: () => keep(state),
        Issue: () => keep(state),
        Incarnated: () => keep(state),
        Finished: () => keep(state),
        RuntimeDisposed: () => keep(state),
      }),
    Stepped: () => keep(state),
    Requested: () => keep(state),
    Answered: () => keep(state),
    Released: () => keep(state),
    DisposingRuntime: () => keep(state),
    Unstoppable: () => keep(state),
    Acknowledged: () => keep(state),
    Advanced: () => keep(state),
    Read: () => keep(state),
  });

/**
 * Turn selection (Turn I2): every turn the runtime reports ran an alternative the handler table
 * allows for its event at the actor's leaf, and ended at that alternative's leaf.
 *
 * **Details**
 *
 * - The leaf is the suite's own: the fixture's initial leaf on a fresh actor's first use, then
 *   each judged turn's leaf. After a reload, or a use of a disposed actor, the leaf is restored
 *   from a record the suite does not read, so the next turn's reported `from` is taken once.
 * - A turn's event must be one the suite sent that actor, an ending delivered to it in that step,
 *   or one its schedules send.
 * - Guards the suite does not compute (memory, payload, lane reads) make each guarded alternative
 *   possible up to the first unguarded one; state-token guards are computed from the leaf.
 * - A delivered ending may be late (Turn R19, R20): its owner's Activation may be gone, so the
 *   root's alternatives are allowed beside the leaf's. Whether it is late is `late-routing`'s.
 * - The reported `to` is judged, never trusted: the carried leaf is the selected alternative's
 *   (only an unanchored actor's reported `from` is taken, once).
 * - Driven events are credited to the actor until a turn of it runs them, an `Unhandled` or
 *   `Denied` of that event is reported while exactly one actor holds its credit, or the actor is
 *   disposed, forgotten or reloaded.
 *
 * **Gotchas**
 *
 * - `Unhandled` and `Denied` name no actor, so an event that should have run a turn and is
 *   reported unhandled is not judged here; nor are part-level alternatives.
 */
export const selection = oracle<State>({
  name: "selection",
  guarantee: ["Turn I2"],
  start: (_reference, _graphs, machines) => ({ machines, actors: new Map() }),
  step: (state, step) =>
    step.reduce<Stepped>(
      ([current, found], fact) => {
        const [next, more] = onFact(current, fact, step);

        return [next, [...found, ...more]];
      },
      [state, []],
    ),
});
