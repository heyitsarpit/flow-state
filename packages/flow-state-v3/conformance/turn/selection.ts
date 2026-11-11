import { Option } from "effect";
import { Address, Fact, oracle, type Violation, violation } from "../dsl/oracle.ts";
import { Input, Phase, TABLE } from "./phases.ts";
import {
  type Handlers,
  type Machines,
  type Possible,
  possible,
  type Route,
} from "../fixtures/handlers.ts";
import { type ActorRef, type Delivered, Observation, type Turn, type TurnPart } from "../port.ts";

type Actor = {
  readonly phase: Phase;
  readonly driven: ReadonlyArray<string>;
  readonly entry: number;
};

/**
 * The Activation that owns a call (Turn R20): the state its transition names and which entry of
 * that state it was; the root's never ends.
 */
type Owner = { readonly state: string; readonly entry: number };

const ROOT: Owner = { state: "(root)", entry: 0 };

type State = {
  readonly machines: Machines;
  readonly actors: ReadonlyMap<string, Actor>;
  readonly owning: ReadonlyMap<string, Owner>;
  readonly owners: ReadonlyMap<string, Owner>;
  readonly restored: ReadonlySet<string>;
  readonly latest: ReadonlyMap<string, string>;
};

const keyOf = (actor: ActorRef) => `${actor.machine} ${actor.id}`;

const FRESH: Actor = { phase: Phase.Fresh(), driven: [], entry: 0 };

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

type Judged = {
  readonly to: Option.Option<string>;
  readonly found: ReadonlyArray<string>;
  readonly match: Option.Option<Possible>;
  readonly from: string;
};

const name = (turn: Turn) => `${turn.actor.machine} ${turn.actor.id} ran ${turn.event}`;

/**
 * Judges one turn's header against the handler table from the leaf the suite carried (or, when
 * it carried none, the leaf the turn reports): the alternative the actor's root ran is one Turn I2
 * allows,
 * and the turn ends at that alternative's leaf.
 */
/**
 * A late ending's turn that ran an alternative of the leaf, which only a current one may reach
 * (Turn I26). A current ending that skips a passing leaf alternative breaks I2, not I26.
 */
const lateRanLeaf = (
  handlers: Handlers,
  from: string,
  turn: Turn,
  route: Route,
  ran: Option.Option<TurnPart>,
) =>
  Option.filter(
    ran,
    (part) =>
      route === "late" &&
      !possible(handlers, from, turn.event, "late").alternatives.some((a) => a.at === part.at) &&
      possible(handlers, from, turn.event, "current").alternatives.some((a) => a.at === part.at),
  ).pipe(
    Option.map(
      (part) =>
        `Turn I26: ${name(turn)} at ${from} by ${part.at}, routed from the active leaf, but its owner Activation has ended, so it is routed from the root, as late`,
    ),
  );

// RETURN_TYPE: each branch builds one judgement; the branches infer different shapes.
const judgeTurn = (machines: Machines, phase: Phase, turn: Turn, route: Route): Judged => {
  const handlers = machines[turn.actor.machine];

  if (handlers === undefined)
    return { to: Option.none(), found: [], match: Option.none(), from: turn.from };

  const anchored = Phase.$is("Live")(phase) ? Option.some(phase.state) : Option.none();
  const from = Option.getOrElse(anchored, () => turn.from);

  const wrongFrom = Option.match(anchored, {
    onNone: () => [],
    onSome: (state) =>
      state === turn.from
        ? []
        : [`Turn I2: ${name(turn)} from ${turn.from}, but the actor was at ${state}`],
  });

  const allowed = possible(handlers, from, turn.event, route);
  const ran = turn.parts.find((p) => p.part.length === 0 && p.definition === turn.actor.machine);
  const ats = allowed.alternatives.map((a) => a.at).join(", ");

  const misrouted = lateRanLeaf(handlers, from, turn, route, Option.fromUndefinedOr(ran));

  if (Option.isSome(misrouted))
    return {
      to: Option.none(),
      found: [...wrongFrom, misrouted.value],
      match: Option.none(),
      from,
    };

  if (allowed.alternatives.length === 0)
    return {
      to: Option.some(from),
      found: [
        ...wrongFrom,
        `Turn I2: ${name(turn)} at ${from}, which no alternative handles (it is Unhandled or Denied)`,
      ],
      match: Option.none(),
      from,
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
      match: Option.none(),
      from,
    };

  if (match.to !== turn.to)
    return {
      to: Option.some(match.to),
      found: [
        ...wrongFrom,
        `Turn I2: ${name(turn)} at ${from} by ${match.at}, which ends at ${match.to}, but the turn says ${turn.to}`,
      ],
      match: Option.some(match),
      from,
    };

  return { to: Option.some(match.to), found: wrongFrom, match: Option.some(match), from };
};

const heardBy = (actor: ActorRef, event: string, step: ReadonlyArray<Fact>) =>
  step.flatMap((fact) =>
    Fact.$is("Reported")(fact) &&
    Observation.$is("Delivered")(fact.observation) &&
    fact.observation.event === event &&
    Option.match(fact.observation.actor, {
      onNone: () => true,
      onSome: (to) => keyOf(to) === keyOf(actor),
    })
      ? [fact.observation]
      : [],
  );

const attemptKey = (operation: string, attempt: string) => `${operation} ${attempt}`;

/**
 * How a delivered ending is routed (Turn R20), from the owner the suite recorded at its mint: an
 * unknown { Restored }, an owner the suite did not see, or an actor whose leaf it does not know
 * gives `either`.
 */
// RETURN_TYPE: the Route union; the branches infer three literals.
const routeOf = (state: State, actor: Actor, delivered: Delivered): Route => {
  if (Option.isNone(delivered.attempt) || !Phase.$is("Live")(actor.phase)) return "either";

  const key = attemptKey(delivered.operation, delivered.attempt.value);
  const owner = state.owners.get(key);

  if (state.restored.has(key)) return "current";

  if (owner === undefined) return "either";

  const alive =
    owner.state === ROOT.state ||
    (actor.phase.state === owner.state && actor.entry === owner.entry);

  return alive ? "current" : "late";
};

const onTurn = (state: State, turn: Turn, step: ReadonlyArray<Fact>) => {
  const now = actorIn(state, turn.actor);
  const handlers = state.machines[turn.actor.machine];
  const driven = now.driven.includes(turn.event);
  const [delivered] = heardBy(turn.actor, turn.event, step);
  const heard = !driven && delivered !== undefined;
  const route = !driven && delivered !== undefined ? routeOf(state, now, delivered) : "current";

  const admitted =
    driven || heard || handlers === undefined || handlers.scheduled.includes(turn.event);

  const unadmitted = admitted
    ? []
    : [
        `Turn I2: ${name(turn)}, an event the suite never sent it, no ending delivered and no schedule sends`,
      ];

  const judged = judgeTurn(state.machines, now.phase, turn, route);
  const entry = Option.exists(judged.match, (m) => m.enters) ? now.entry + 1 : now.entry;

  const owner = Option.match(judged.match, {
    onNone: () => ROOT,
    onSome: (m) => {
      if (m.enters) return { state: m.to, entry };

      return m.atRoot ? ROOT : { state: judged.from, entry };
    },
  });

  const owned = {
    ...state,
    owning: new Map([...state.owning, [keyOf(turn.actor), owner]]),
    owners: new Map([
      ...state.owners,
      ...turn.members.flatMap((m) => {
        const attempt = state.latest.get(`${keyOf(turn.actor)} ${m.operation}`);

        return m.kind === "retry" && attempt !== undefined
          ? [[attemptKey(m.operation, attempt), owner] as const]
          : [];
      }),
    ]),
  };

  const next = moved(
    withActor(owned, turn.actor, {
      ...now,
      driven: withoutOne(now.driven, turn.event),
      entry,
    }),
    turn.actor,
    Input.Turned({ to: judged.to }),
  );

  const anchored = Observation.Turn({
    ...turn,
    from: Phase.$is("Live")(now.phase) ? now.phase.state : turn.from,
    to: Option.getOrElse(judged.to, () => turn.to),
  });

  return [
    next,
    [...unadmitted, ...judged.found].map(violation),
    Fact.Reported({ observation: anchored }),
  ] as const;
};

const minted = (state: State, operation: string, attempt: string, actor: Option.Option<ActorRef>) =>
  Option.match(
    Option.flatMap(actor, (a) => Option.fromUndefinedOr(state.owning.get(keyOf(a)))),
    {
      onNone: () => state,
      onSome: (owner) => ({
        ...state,
        owners: new Map([...state.owners, [attemptKey(operation, attempt), owner]]),
        latest: new Map([
          ...state.latest,
          ...Option.toArray(actor).map((a) => [`${keyOf(a)} ${operation}`, attempt] as const),
        ]),
      }),
    },
  );

const initialOf = (state: State, actor: ActorRef) =>
  Option.fromUndefinedOr(state.machines[actor.machine]?.initial);

type Stepped = readonly [State, ReadonlyArray<Violation>, Fact];

const reloaded = (state: State) => ({
  ...state,
  actors: new Map(
    [...state.actors].map(([key, a]) => [
      key,
      { ...a, phase: TABLE[a.phase._tag].Reloaded(Input.Reloaded(), a.phase), driven: [] },
    ]),
  ),
});

const drove = (state: State, actor: ActorRef, event: string) => {
  const now = actorIn(state, actor);

  return withActor(state, actor, { ...now, driven: [...now.driven, event] });
};

const uncredited = (state: State, actor: ActorRef) =>
  withActor(state, actor, { ...actorIn(state, actor), driven: [] });

const deliveredTo = (step: ReadonlyArray<Fact>, event: string) =>
  step.flatMap((fact) =>
    Fact.$is("Reported")(fact) &&
    Observation.$is("Delivered")(fact.observation) &&
    fact.observation.event === event &&
    Option.isSome(fact.observation.actor)
      ? [fact.observation]
      : [],
  );

/**
 * The actor an `Unhandled` or `Denied` of `event` is about: the one an ending of that event was
 * delivered to in this step, else the one actor holding a driven credit for it; `None` when the
 * suite cannot tell.
 */
const refusing = (state: State, event: string, step: ReadonlyArray<Fact>) => {
  const delivered = deliveredTo(step, event);
  const [first] = delivered;

  if (first !== undefined)
    return delivered.every(
      (d) =>
        Option.getOrNull(d.actor) !== null &&
        keyOf(Option.getOrThrow(d.actor)) === keyOf(Option.getOrThrow(first.actor)),
    )
      ? Option.some({ actor: Option.getOrThrow(first.actor), heard: Option.some(first) })
      : Option.none();

  const holders = [...state.actors].filter(([, a]) => a.driven.includes(event));
  const [only, ...more] = holders;

  if (only === undefined || more.length > 0) return Option.none();

  const [key] = only;
  const [machine = "", id = ""] = key.split(" ");

  return Option.some({ actor: { machine, id }, heard: Option.none<Delivered>() });
};

// RETURN_TYPE: a tuple; inference would widen it to an array.
const refused = (
  state: State,
  event: string,
  tag: "Unhandled" | "Denied",
  step: ReadonlyArray<Fact>,
): readonly [State, ReadonlyArray<string>] =>
  Option.match(refusing(state, event, step), {
    onNone: () => [state, []],
    onSome: ({ actor, heard }) => {
      const now = actorIn(state, actor);
      const handlers = state.machines[actor.machine];
      const next = withActor(state, actor, { ...now, driven: withoutOne(now.driven, event) });

      const route = Option.match(heard, {
        onNone: () => "current" as const,
        onSome: (d) => routeOf(state, now, d),
      });

      const lateMayDeny = tag === "Denied" && route !== "current";

      if (handlers === undefined || lateMayDeny || !Phase.$is("Live")(now.phase)) return [next, []];

      const leaf = now.phase.state;
      const allowed = possible(handlers, leaf, event, route);

      return [
        next,
        allowed.handled
          ? [
              `Turn I2: ${actor.machine} ${actor.id}'s ${event} was reported ${tag} at ${leaf}, where ${allowed.alternatives.at(-1)?.at ?? "an alternative"} is selected for certain`,
            ]
          : [],
      ];
    },
  });

// RETURN_TYPE: every branch gives the next state, its violations and the fact as judged.
const onFact = (state: State, fact: Fact, step: ReadonlyArray<Fact>): Stepped => {
  // RETURN_TYPE: a tuple; inference would widen it to an array.
  const keep = (next: State): Stepped => [next, [], fact];

  // RETURN_TYPE: a tuple; inference would widen it to an array.
  const judgedRefusal = ([next, found]: readonly [State, ReadonlyArray<string>]): Stepped => [
    next,
    found.map(violation),
    fact,
  ];

  return Fact.$match(fact, {
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
    Drove: ({ actor, event, to }) =>
      keep(Address.$is("Root")(to) ? drove(state, actor, event) : state),
    Reported: ({ observation }) =>
      Observation.$match(observation, {
        Turn: (turn) => onTurn(state, turn, step),
        Unhandled: ({ event }) => judgedRefusal(refused(state, event, "Unhandled", step)),
        Denied: ({ event }) => judgedRefusal(refused(state, event, "Denied", step)),
        Minted: ({ operation, attempt, actor }) => keep(minted(state, operation, attempt, actor)),
        Sent: () => keep(state),
        Ended: ({ operation, attempt, channel, reason }) =>
          keep(
            Option.match(attempt, {
              onNone: () => state,
              onSome: (id) =>
                channel === "unknown" && reason === "Restored"
                  ? { ...state, restored: new Set([...state.restored, attemptKey(operation, id)]) }
                  : state,
            }),
          ),
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
};

/**
 * Turn selection and late routing (Turn I2, I26): every turn the runtime reports ran an alternative the handler table
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
 * - A delivered ending's route (Turn R20, I26) comes from its owner, recorded at its mint or at a
 *   retry from the alternative that ran (the state it enters, a new Activation per entry, else the
 *   node holding it): current while that Activation lives, else late, walking the root alone. An
 *   unknown { Restored }, an owner the suite did not see, or an unanchored actor allows either.
 * - The reported `to` is judged, never trusted: the carried leaf is the selected alternative's
 *   (only an unanchored actor's reported `from` is taken, once).
 * - Driven events are credited to the actor until a turn of it runs them, an `Unhandled` or
 *   `Denied` of that event is reported while exactly one actor holds its credit, or the actor is
 *   disposed, forgotten or reloaded.
 *
 * - An `Unhandled` or `Denied` names no actor: it is judged for the actor an ending of its event
 *   was delivered to in that step, else the one actor holding a driven credit for it, and it
 *   breaks I2 when that actor's leaf selects an alternative for certain. A late ending may still
 *   be Denied: a late turn may not leave live work (R21, I27, not judged yet).
 *
 * **Gotchas**
 *
 * - An `Unhandled` or `Denied` the suite cannot attribute is not judged; nor are part-level
 *   alternatives.
 */
export const selection = oracle<State>({
  name: "selection",
  guarantee: ["Turn I2", "Turn I26"],
  start: (_reference, _graphs, machines) => anchorOf(machines),
  step: (state, step) => {
    const judged = judgedStep(state, step);

    return [judged.state, judged.violations];
  },
});

/**
 * What the `selection` oracle carries between steps: each actor's leaf and its driven events,
 * over the case's handler tables.
 */
export type Anchor = State;

/**
 * The {@link Anchor} a case starts from.
 */
// RETURN_TYPE: the Anchor contract; inference would type the empty Map's entries as never.
export const anchorOf = (machines: Machines): Anchor => ({
  machines,
  actors: new Map(),
  owning: new Map(),
  owners: new Map(),
  restored: new Set(),
  latest: new Map(),
});

/**
 * An {@link Anchor} with one actor live at `leaf` and holding a driven credit for each of
 * `driven`, as the suite would carry it.
 *
 * **When to use**
 *
 * The lifecycle's perturbation test starts a reference turn from it, so a perturbed header is
 * judged against the leaf the suite owns.
 */
// RETURN_TYPE: the Anchor contract; the phase union is narrowed to Live without it.
export const anchorAt = (
  machines: Machines,
  actor: ActorRef,
  leaf: string,
  driven: ReadonlyArray<string>,
): Anchor => ({
  machines,
  actors: new Map([[keyOf(actor), { phase: Phase.Live({ state: leaf }), driven, entry: 0 }]]),
  owning: new Map(),
  owners: new Map(),
  restored: new Set(),
  latest: new Map(),
});

/**
 * One step judged by Turn I2: the next anchor, every violation, and the step's facts with each
 * `Turn` header as judged (`from` the leaf the suite carried, `to` the selected alternative's leaf,
 * the reported values only where the table could not tell).
 *
 * **When to use**
 *
 * The Case passes the judged facts to the lifecycle, so a row is chosen from a header Turn I2
 * judged, never from the runtime's word alone; the `selection` oracle reports the violations.
 */
export const judgedStep = (state: Anchor, step: ReadonlyArray<Fact>) =>
  step.reduce<{
    readonly state: Anchor;
    readonly violations: ReadonlyArray<Violation>;
    readonly facts: ReadonlyArray<Fact>;
  }>(
    (judged, fact) => {
      const [next, found, seen] = onFact(judged.state, fact, step);

      return {
        state: next,
        violations: [...judged.violations, ...found],
        facts: [...judged.facts, seen],
      };
    },
    { state, violations: [], facts: [] },
  );
