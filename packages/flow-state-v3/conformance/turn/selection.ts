import { Option } from "effect";
import { Address, Fact, oracle, type Violation, violation } from "../dsl/oracle.ts";
import {
  actorIn,
  current,
  ended,
  keyOf,
  minted,
  moved,
  pendingOf,
  reowned,
  ROOT,
  routeOf,
  sent,
  type State,
  withActor,
  withoutOne,
} from "./anchor.ts";
import { Input, leafOf, Phase, TABLE } from "./phases.ts";
import {
  type Handlers,
  type Machines,
  type Possible,
  partsOnly,
  possible,
  type Route,
  scheduledEvents,
} from "../fixtures/handlers.ts";
import {
  type ActorRef,
  type Delivered,
  MemberTarget,
  Observation,
  sameJson,
  type Turn,
  type TurnPart,
} from "../port.ts";

type Judged = {
  readonly to: Option.Option<string>;
  readonly found: ReadonlyArray<string>;
  readonly match: Option.Option<Possible>;
  readonly from: string;
};

const name = (turn: Turn) => `${turn.actor.machine} ${turn.actor.id} ran ${turn.event}`;

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

/**
 * A part-only turn leaves the root's leaf where it was; one that says otherwise breaks Turn I2.
 */
const partLeft = (turn: Turn, from: string) =>
  turn.to === from
    ? []
    : [
        `Turn I2: ${name(turn)} at ${from} in a part alone, which leaves the leaf, but the turn says ${turn.to}`,
      ];

/**
 * Judges one turn's header against the handler table from the leaf the suite carried (or, when it
 * carried none, the leaf the turn reports): the alternative the actor's root ran is one Turn I2 and
 * I26 allow on its route, and the turn ends at that alternative's leaf.
 */
// RETURN_TYPE: each branch builds one judgement; the branches infer different shapes.
const judgeTurn = (machines: Machines, phase: Phase, turn: Turn, route: Route): Judged => {
  const handlers = machines[turn.actor.machine];

  if (handlers === undefined)
    return { to: Option.none(), found: [], match: Option.none(), from: turn.from };

  const anchored = leafOf(phase);
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

  if (
    ran === undefined &&
    allowed.alternatives.length === 0 &&
    partsOnly(handlers, turn.event, turn.parts)
  )
    return {
      to: Option.some(from),
      found: [...wrongFrom, ...partLeft(turn, from)],
      match: Option.none(),
      from,
    };

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

  const [only] = allowed.alternatives;
  const fallback = allowed.alternatives.length === 1 && only !== undefined ? [only.to] : [];

  if (ran === undefined)
    return {
      to: Option.fromUndefinedOr(fallback[0]),
      found: [
        ...wrongFrom,
        `Turn I2: ${name(turn)} at ${from} and reported no part of its root, so no selected alternative (${ats}) can be told`,
      ],
      match: Option.none(),
      from,
    };

  const match = allowed.alternatives.find((a) => a.at === ran.at);

  if (match === undefined)
    return {
      to: Option.fromUndefinedOr(fallback[0]),
      found: [
        ...wrongFrom,
        `Turn I2: ${name(turn)} at ${from} by ${ran.at}, not one of the alternatives selection allows (${ats})`,
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

/**
 * A late turn that exits the active leaf's Activation while it owns pending work (Turn I27).
 */
const lateLeftWork = (
  state: State,
  now: ReturnType<typeof actorIn>,
  turn: Turn,
  route: Route,
  judged: Judged,
) => {
  const leaf = leafOf(now.phase);

  if (route !== "late" || Option.isNone(leaf) || !Option.exists(judged.match, (m) => m.enters))
    return [];

  const pending = pendingOf(state, turn.actor, { state: leaf.value, entry: now.entry });

  return pending.length === 0
    ? []
    : [
        `Turn I27: ${name(turn)}, a late turn, and left ${leaf.value}, whose Activation owns pending work (${pending.map((c) => `${c.operation} ${c.attempt}`).join(", ")})`,
      ];
};

/**
 * The driven credit of an event the suite sent to a part: it admits only a turn that ran no root
 * part.
 */
const partCredit = (event: string) => `part ${event}`;

const heardBy = (actor: ActorRef, event: string, step: ReadonlyArray<Fact>) =>
  step.flatMap((fact) =>
    Fact.$is("Reported")(fact) &&
    Observation.$is("Delivered")(fact.observation) &&
    fact.observation.event === event &&
    Option.exists(fact.observation.actor, (to) => keyOf(to) === keyOf(actor))
      ? [fact.observation]
      : [],
  );

const onTurn = (state: State, turn: Turn, step: ReadonlyArray<Fact>) => {
  const now = actorIn(state, turn.actor);
  const handlers = state.machines[turn.actor.machine];

  const rootRan = turn.parts.some(
    (p) => p.part.length === 0 && p.definition === turn.actor.machine,
  );

  const credit = rootRan || turn.parts.length === 0 ? turn.event : partCredit(turn.event);
  const driven = now.driven.includes(credit);
  const [delivered] = heardBy(turn.actor, turn.event, step);
  const heard = !driven && delivered !== undefined;
  const route = !driven && delivered !== undefined ? routeOf(state, now, delivered) : "current";

  const admitted =
    driven || heard || handlers === undefined || scheduledEvents(handlers).includes(turn.event);

  const unadmitted = admitted
    ? []
    : [
        `Turn I2: ${name(turn)}, an event the suite never sent it, no ending delivered and no schedule sends`,
      ];

  const judged = judgeTurn(state.machines, now.phase, turn, route);
  const leftWork = lateLeftWork(state, now, turn, route, judged);
  const entry = Option.exists(judged.match, (m) => m.enters) ? now.entry + 1 : now.entry;

  const owner = Option.match(judged.match, {
    onNone: () => ROOT,
    onSome: (m) => {
      if (m.enters) return { state: m.to, entry };

      return m.atRoot ? ROOT : { state: judged.from, entry };
    },
  });

  const owning = { ...state, owning: new Map([...state.owning, [keyOf(turn.actor), owner]]) };

  const owned = turn.members
    .filter((m) => m.kind === "retry")
    .reduce<State>(
      (acc, m) =>
        reowned(
          acc,
          turn.actor,
          m.operation,
          (c) =>
            MemberTarget.$match(m.target, {
              Key: ({ key }) => Option.exists(c.key, (k) => sameJson(k, key)),
              Only: () => true,
              Every: () => true,
              Nothing: () => false,
            }),
          owner,
        ),
      owning,
    );

  const next = moved(
    withActor(owned, turn.actor, {
      ...now,
      driven: withoutOne(now.driven, credit),
      entry,
    }),
    turn.actor,
    Input.Turned({ to: judged.to }),
  );

  const anchored = Observation.Turn({
    ...turn,
    from: Option.getOrElse(leafOf(now.phase), () => turn.from),
    to: Option.getOrElse(judged.to, () => turn.to),
  });

  return [
    next,
    [...unadmitted, ...judged.found, ...leftWork].map(violation),
    Fact.Reported({ observation: anchored }),
  ] as const;
};

const initialOf = (state: State, actor: ActorRef) =>
  Option.fromUndefinedOr(state.machines[actor.machine]?.initial);

type Stepped = readonly [State, ReadonlyArray<Violation>, Fact];

const reloaded = (state: State) => ({
  ...state,
  actors: new Map(
    [...state.actors].map(([key, a]) => [
      key,
      {
        ...a,
        phase: TABLE[a.phase._tag].Reloaded(Input.Reloaded(), a.phase),
        driven: [],
        entry: a.entry + 1,
      },
    ]),
  ),
});

const drove = (state: State, actor: ActorRef, event: string) => {
  const now = actorIn(state, actor);

  return withActor(state, actor, { ...now, driven: [...now.driven, event] });
};

const uncredited = (state: State, actor: ActorRef) => {
  const now = actorIn(state, actor);

  return withActor(state, actor, { ...now, driven: [], entry: now.entry + 1 });
};

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

      const carried = leafOf(now.phase);

      if (handlers === undefined || lateMayDeny || Option.isNone(carried)) return [next, []];

      const leaf = carried.value;
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
      keep(drove(state, actor, Address.$is("Root")(to) ? event : partCredit(event))),
    Reported: ({ observation }) =>
      Observation.$match(observation, {
        Turn: (turn) => onTurn(state, turn, step),
        Unhandled: ({ event }) => judgedRefusal(refused(state, event, "Unhandled", step)),
        Denied: ({ event }) => judgedRefusal(refused(state, event, "Denied", step)),
        Minted: ({ operation, attempt, actor, key }) =>
          keep(minted(state, operation, attempt, actor, key)),
        Sent: ({ operation, attempt }) => keep(sent(state, operation, attempt)),
        Ended: ({ operation, attempt, channel, reason }) =>
          keep(ended(state, operation, attempt, channel, reason, step)),
        Delivered: () => keep(state),
        Parked: () => keep(state),
        Unparked: ({ operation, attempt }) => keep(current(state, operation, attempt, step)),
        Recorded: () => keep(state),
        Evidence: () => keep(state),
        Issue: () => keep(state),
        Incarnated: () => keep(state),
        Finished: () => keep(state),
        RuntimeDisposed: () => keep(state),
        Published: () => keep(state),
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
 *   unknown { Restored } or an adopted ending is current (in a step with a reload or an attach);
 *   an owner the suite did not see (a read's, a part's), or an unanchored actor, allows either.
 * - The reported `to` is judged, never trusted: the carried leaf is the selected alternative's
 *   (only an unanchored actor's reported `from` is taken, once). A turn with no root part breaks
 *   I2 unless the root and leaf have no alternative for its event and every part it ran is one its
 *   table's `parts` names for it (it stays at the leaf, and must say so); part-level selection
 *   order is not judged, and a part-addressed `Unhandled` is judged against the root's table.
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
  guarantee: ["Turn I2", "Turn I26", "Turn I27"],
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
  calls: new Map(),
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
  calls: new Map(),
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
