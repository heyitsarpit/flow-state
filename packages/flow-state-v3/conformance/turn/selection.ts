import { Option } from "effect";
import { GRACE_MS } from "../dsl/expect.ts";
import type { Predicted } from "../dsl/lifecycle-owed.ts";
import { Fact, oracle, type Violation, violation } from "../dsl/oracle.ts";
import { Address } from "../dsl/facts.ts";
import {
  actorIn,
  current,
  ended,
  keyOf,
  minted,
  moved,
  reloaded,
  landed,
  wrote,
  dropped,
  anchorOf,
  idled,
  used,
  answered,
  reowned,
  requested,
  returned,
  ROOT,
  unbound,
  UNKNOWN_LEAF,
  routeOf,
  sent,
  type State,
  storedAfter,
  withActor,
  withoutOne,
} from "./anchor.ts";
import { judgeTurn, name, PENDING_RESET, selectedParts } from "./judge.ts";
import {
  answeredRequest,
  attachingKind,
  closed,
  keysOf,
  machineOfCall,
  mintOwed,
  retriesOwed,
  settledBy,
} from "./credits.ts";
import { lateLeftWork } from "./late.ts";
import {
  changeOf,
  decideFor,
  foldedAfter,
  keysFor,
  labelsFor,
  undecidedGuards,
} from "./predict.ts";
import { undecidedDelays } from "./arming.ts";
import { Input, leafOf, Phase } from "./phases.ts";
import { type Labels, noFolds } from "../fixtures/folds.ts";
import { possible, scheduledEvents } from "../fixtures/handlers.ts";
import { type ActorRef, type Delivered, Observation, type Turn } from "../port.ts";

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

  const selected = selectedParts(turn);
  const rootRan = selected.some((p) => p.part.length === 0 && p.definition === turn.actor.machine);
  const credit = rootRan || selected.length === 0 ? turn.event : partCredit(turn.event);
  const driven = now.driven.some((c) => c.event === credit);
  const [delivered] = heardBy(turn.actor, turn.event, step);
  const heard = !driven && delivered !== undefined;

  const route =
    !driven && delivered !== undefined
      ? routeOf(state, now, delivered, attachingKind(step) !== "none")
      : "current";

  const told = step.reduce(
    (s, f) =>
      Fact.$is("Answered")(f) ? answered(s, f.request.operation, f.request.key, f.labels) : s,
    state,
  );

  const labels = labelsFor(told, now, credit, driven, Option.fromUndefinedOr(delivered));
  const folds = handlers?.folds ?? noFolds;
  const decide = decideFor(folds, now.fields, labels);

  const admitted =
    driven ||
    heard ||
    handlers === undefined ||
    scheduledEvents(handlers).includes(turn.event) ||
    (turn.event === PENDING_RESET && selected.length === 0);

  const unadmitted = admitted
    ? []
    : [
        `Turn I2: ${name(turn)}, an event the suite never sent it, no ending delivered and no schedule sends`,
      ];

  const judged = judgeTurn(state.machines, now.phase, turn, route, decide, now.allowed);

  const ran = Option.map(judged.match, (m) => m.at);
  const fields = foldedAfter(folds, now.fields, ran, labels);

  const leftWork = lateLeftWork(
    state,
    now,
    turn,
    route,
    Option.exists(judged.match, (m) => m.enters),
    Option.fromUndefinedOr(delivered),
  );

  const entry = Option.exists(judged.match, (m) => m.enters) ? now.entry + 1 : now.entry;

  const owner = Option.match(judged.match, {
    onNone: () => ROOT,
    onSome: (m) => {
      if (m.enters) return { state: m.to, entry };

      return m.atRoot ? ROOT : { state: judged.from, entry };
    },
  });

  const owning = {
    ...state,
    owning: new Map([...state.owning, [keyOf(turn.actor), owner]]),
    undecided: [
      ...state.undecided,
      ...undecidedGuards(state.machines, turn, judged.from, route, decide),
    ],
  };

  const keys = keysOf(turn, now.fields, keysFor(folds, fields, labels, ran));

  const owned = retriesOwed(state, {
    actor: turn.actor,
    event: turn.event,
    from: judged.from,
    to: Option.getOrElse(judged.to, () => turn.to),
    at: Option.map(judged.match, (m) => m.at),
    keys,
    delivered: Option.fromUndefinedOr(delivered),
  }).reduce<State>((acc, r) => reowned(acc, turn.actor, r.operation, r.matches, owner), owning);

  const next = moved(
    withActor(owned, turn.actor, {
      ...now,
      driven: withoutOne(now.driven, credit),
      entry,
      turns: now.turns + 1,
      fields,
      trail: [...now.trail, Option.getOrElse(judged.to, () => UNKNOWN_LEAF)],
      stored: storedAfter(now, judged.from),
      allowed: [],
    }),
    turn.actor,
    Input.Turned({ to: judged.to }),
  );

  const anchored = Observation.Turn({
    ...turn,
    from: judged.from,
    to: Option.getOrElse(judged.to, () => turn.to),
  });

  const predicted: Predicted = {
    actor: turn.actor,
    event: turn.event,
    from: anchored.from,
    to: anchored.to,
    at: Option.map(judged.match, (m) => m.at),
    keys,
    encodable: labels["encodable"] !== false,
    changes: Option.flatMap(judged.match, (m) =>
      changeOf(m.to !== judged.from, m.updates, now.fields, fields),
    ),
  };

  return [
    next,
    [...unadmitted, ...judged.found, ...leftWork].map((s) => violation(s)),
    Fact.Reported({ observation: anchored }),
    Option.some(predicted),
  ] as const;
};

/**
 * Whether the suite booted a page or attached a use in this step.
 */
const attaching = (step: ReadonlyArray<Fact>) => attachingKind(step) !== "none";

const isTurn = (fact: Fact) =>
  Fact.$is("Reported")(fact) && Observation.$is("Turn")(fact.observation);

const initialOf = (state: State, actor: ActorRef) =>
  Option.fromUndefinedOr(state.machines[actor.machine]?.initial);

/**
 * A fresh actor starts with its fixture's initial folded fields; any other keeps its own.
 */
const folded = (state: State, actor: ActorRef) => {
  const now = actorIn(state, actor);
  const folds = state.machines[actor.machine]?.folds;

  return Phase.$is("Fresh")(now.phase) && folds !== undefined
    ? withActor(state, actor, { ...now, fields: Option.some(folds.initial) })
    : state;
};

type Stepped = readonly [State, ReadonlyArray<Violation>, Fact, Option.Option<Predicted>];

const purposeOf = (step: ReadonlyArray<Fact>, wrote: Extract<Fact, { readonly _tag: "Wrote" }>) => {
  const nth = step.filter(Fact.$is("Wrote")).indexOf(wrote);

  return step.filter(Fact.$is("Purposed"))[nth]?.purpose ?? "capture";
};

const drove = (state: State, actor: ActorRef, event: string, labels: Labels) => {
  const now = actorIn(state, actor);

  return withActor(state, actor, { ...now, driven: [...now.driven, { event, labels }] });
};

/**
 * An actor whose record the suite removed (disposeActor or forget, Actors R20, R21): its credits
 * go, and its next ensure starts from the fixture's initial fields. The removal is a write: until a
 * batch holding it lands, a kill restores the record and its saved fields.
 */
const uncredited = (state: State, actor: ActorRef) => {
  const now = actorIn(state, actor);

  const initial = Option.map(
    Option.fromUndefinedOr(state.machines[actor.machine]),
    (h) => h.folds.initial,
  );

  return withActor(state, actor, { ...now, driven: [], entry: now.entry + 1, fields: initial });
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

  const holders = [...state.actors].filter(([, a]) => a.driven.some((c) => c.event === event));
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
const onFact = (
  state: State,
  fact: Fact,
  step: ReadonlyArray<Fact>,
  least: State,
  open: Option.Option<Predicted>,
): Stepped => {
  // RETURN_TYPE: a tuple; inference would widen it to an array.
  const keep = (next: State): Stepped => [next, [], fact, Option.none()];

  // RETURN_TYPE: a tuple; inference would widen it to an array.
  const judgedRefusal = ([next, found]: readonly [State, ReadonlyArray<string>]): Stepped => [
    next,
    found.map((s) => violation(s)),
    fact,
    Option.none(),
  ];

  return Fact.$match(fact, {
    Ensured: ({ actor }) =>
      keep(
        Option.match(initialOf(state, actor), {
          onNone: () => used(state, actor, 1),
          onSome: (initial) =>
            moved(
              used(folded(returned(state, actor, GRACE_MS), actor), actor, 1),
              actor,
              Input.Ensured({ initial }),
            ),
        }),
      ),
    Disposed: ({ actor }) =>
      keep(moved(unbound(uncredited(state, actor), actor), actor, Input.Disposed())),
    Forgot: ({ actor }) =>
      keep(
        moved(
          unbound(uncredited(state, actor), actor),
          actor,
          state.disposing ? Input.Disposed() : Input.Forgot(),
        ),
      ),
    Reloaded: () => keep(reloaded(state)),
    Drove: ({ actor, event, to, labels }) =>
      keep(drove(state, actor, Address.$is("Root")(to) ? event : partCredit(event), labels)),
    Reported: ({ observation }) =>
      Observation.$match(observation, {
        Turn: (turn) => onTurn(state, turn, step),
        Unhandled: ({ event }) => judgedRefusal(refused(state, event, "Unhandled", step)),
        Denied: ({ event }) => judgedRefusal(refused(state, event, "Denied", step)),
        Minted: ({ operation, attempt, actor }) => {
          const owed = mintOwed(open, actor);

          return keep(
            minted(
              state,
              operation,
              attempt,
              Option.map(owed, (t) => t.actor),
              Option.flatMap(owed, (t) => Option.fromUndefinedOr(t.keys[operation])),
            ),
          );
        },
        Sent: ({ operation, attempt }) =>
          keep(
            step.some((f) => Fact.$is("Requested")(f) && Option.contains(f.request.key, attempt))
              ? sent(state, operation, attempt)
              : state,
          ),
        Ended: ({ operation, attempt }) =>
          keep(
            ended(
              state,
              operation,
              attempt,
              settledBy(state, step, machineOfCall(state, operation, attempt), attempt),
              attachingKind(step),
            ),
          ),
        Delivered: () => keep(state),
        Parked: () => keep(state),
        Unparked: ({ operation, attempt }) =>
          keep(current(state, operation, attempt, attaching(step))),
        Recorded: () => keep(state),
        Evidence: () => keep(state),
        Issue: () => keep(state),
        Incarnated: () => keep(state),
        Finished: () => keep(state),
        Published: () => keep(state),
      }),
    Stepped: () => keep(state),
    Requested: ({ request }) => keep(requested(state, request)),
    Answered: ({ request, answer, labels }) =>
      keep(
        requested(
          answered(state, request.operation, request.key, labels),
          answeredRequest(request, answer),
        ),
      ),
    Released: ({ actor }) => keep(used(state, actor, -1)),
    DisposingRuntime: () => keep({ ...state, disposing: true }),
    Unstoppable: () => keep(state),
    Landed: () => keep(landed(state)),
    Acknowledges: () => keep(state),
    Wrote: (w) => keep(wrote(state, least, purposeOf(step, w))),
    Purposed: () => keep(state),
    Dropped: () => keep(dropped(state)),
    Advanced: ({ ms }) => keep(idled(state, ms, GRACE_MS)),
    Read: () => keep(state),
    RowRead: () => keep(state),
    Disposal: () => keep(state),
  });
};

/**
 * Turn selection and late routing (Turn I2, I26): every turn the runtime reports ran an alternative the handler table
 * allows for its event at the actor's leaf, and ended at that alternative's leaf.
 *
 * **Details**
 *
 * - The leaf is the suite's own: the fixture's initial leaf on a fresh actor's first use, then
 *   each judged turn's leaf. After a kill that may lose turns, the next turn's reported `from`
 *   must be one of the leaves those turns reached (`allowed`); after a use of a disposed actor it
 *   is taken once.
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
 *   disposed, forgotten or reloaded; a credit a live actor still holds at the step's end breaks
 *   R2 (`closed`).
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
  guarantee: ["Turn I2", "Turn I5", "Turn I26", "Turn I27"],
  start: (reference, _graphs, machines, rows) => anchorOf(machines, reference, rows),
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

export { anchorAt, anchorOf } from "./anchor.ts";

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
export const judgedStep = (state: Anchor, step: ReadonlyArray<Fact>) => {
  const judged = closed(walked(state, step), step);
  const delays = undecidedDelays(judged.state, judged.facts);

  return {
    ...judged,
    state: { ...judged.state, undecided: [...judged.state.undecided, ...delays] },
  };
};

const walked = (state: Anchor, step: ReadonlyArray<Fact>) =>
  step.reduce<{
    readonly state: Anchor;
    readonly violations: ReadonlyArray<Violation>;
    readonly facts: ReadonlyArray<Fact>;
    readonly turns: ReadonlyArray<Predicted>;
    readonly least: Option.Option<Anchor>;
  }>(
    (judged, fact) => {
      const second = isTurn(fact) && judged.turns.length === 1 && Option.isNone(judged.least);
      const least = second ? Option.some(judged.state) : judged.least;

      const [next, found, seen, predicted] = onFact(
        judged.state,
        fact,
        step,
        Option.getOrElse(least, () => judged.state),
        Option.fromUndefinedOr(judged.turns.at(-1)),
      );

      return {
        state: next,
        violations: [...judged.violations, ...found],
        facts: [...judged.facts, seen],
        turns: [...judged.turns, ...Option.toArray(predicted)],
        least,
      };
    },
    { state, violations: [], facts: [], turns: [], least: Option.none() },
  );
