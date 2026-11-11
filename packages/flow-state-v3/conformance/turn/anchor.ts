import { Data, Option } from "effect";
import type { Folded, Labels } from "../fixtures/folds.ts";
import type { Machines, Route } from "../fixtures/handlers.ts";
import type { ActorRef, Channel, Json } from "../port.ts";
import type { Request } from "../world/network.ts";
import type { Purpose } from "../world/storage.ts";
import type { Reference, Rows } from "../fixtures/reference.ts";
import { Input, leafOf, Phase, TABLE } from "./phases.ts";

/**
 * What a batch holds of one actor: how many of its turns, and its folded fields after them.
 */
export type Kept = { readonly turns: number; readonly fields: Option.Option<Folded> };

/**
 * One event the suite sent an actor and no turn has run yet, with its payload's labels.
 */
export type Credit = { readonly event: string; readonly labels: Labels };

export type Actor = {
  readonly phase: Phase;
  readonly driven: ReadonlyArray<Credit>;
  readonly entry: number;
  readonly turns: number;
  readonly fields: Option.Option<Folded>;
  readonly saved: Kept;
  readonly pending: Option.Option<Kept>;
  readonly trail: ReadonlyArray<string>;
  readonly allowed: ReadonlyArray<string>;
  readonly removed: boolean;
};

/**
 * The Activation that owns a call (Turn R20): the state its transition names and which entry of
 * that state it was; the root's never ends.
 */
export type Owner = { readonly state: string; readonly entry: number };

export const ROOT: Owner = { state: "(root)", entry: 0 };

/**
 * Where a call stands for routing (Turn R20, R21): waiting or on the wire (`Open`, pending work),
 * kept by an unknown ending (`Held`, not pending work), or ended definitely (`Ended`).
 */
export type CallPhase = Data.TaggedEnum<{ Open: {}; Held: {}; Ended: {} }>;

export const CallPhase = Data.taggedEnum<CallPhase>();

/**
 * One call the suite saw minted, or restored: its actor, operation, Attempt and key, the
 * Activation that owns it (`None` for a call restored from an earlier page), its phase, and
 * whether its ending is current whatever its owner (an unknown { Restored } or an adoption).
 * Calls keep mint order, so a retry re-owns its lane's oldest open head.
 */
export type Call = {
  readonly actor: string;
  readonly operation: string;
  readonly attempt: string;
  readonly key: Option.Option<Json>;
  readonly owner: Option.Option<Owner>;
  readonly phase: CallPhase;
  readonly current: boolean;
  readonly either: boolean;
  readonly booted: boolean;
};

export type State = {
  readonly machines: Machines;
  readonly answers: ReadonlyMap<string, Labels>;
  readonly actors: ReadonlyMap<string, Actor>;
  readonly owning: ReadonlyMap<string, Owner>;
  readonly calls: ReadonlyMap<string, Call>;
  readonly disposing: boolean;
  readonly reference: Reference;
  readonly rows: Rows;
  readonly requests: ReadonlyArray<Request>;
};

export const keyOf = (actor: ActorRef) => `${actor.machine} ${actor.id}`;

/**
 * Each anchored actor's leaf, by {@link keyOf}: what its schedules may fire from while the suite
 * advances the clock.
 */
// RETURN_TYPE: a read-only map, so a reader cannot change the anchor's leaves.
export const leavesOf = (state: State): ReadonlyMap<string, string> =>
  new Map(
    [...state.actors].flatMap(([key, a]) =>
      Option.toArray(leafOf(a.phase)).map((leaf) => [key, leaf] as const),
    ),
  );

export const FRESH: Actor = {
  phase: Phase.Fresh(),
  driven: [],
  entry: 0,
  turns: 0,
  fields: Option.none(),
  saved: { turns: 0, fields: Option.none() },
  pending: Option.none(),
  trail: [],
  allowed: [],
  removed: false,
};

export const actorIn = (state: State, actor: ActorRef) => state.actors.get(keyOf(actor)) ?? FRESH;

export const withActor = (state: State, actor: ActorRef, next: Actor) => ({
  ...state,
  actors: new Map([...state.actors, [keyOf(actor), next]]),
});

export const moved = (state: State, actor: ActorRef, input: Input) => {
  const now = actorIn(state, actor);

  return withActor(state, actor, {
    ...now,
    phase: TABLE[now.phase._tag][input._tag](input, now.phase),
  });
};

export const withoutOne = (credits: ReadonlyArray<Credit>, event: string) => {
  const at = credits.findIndex((c) => c.event === event);

  return at < 0 ? credits : [...credits.slice(0, at), ...credits.slice(at + 1)];
};

/**
 * The labels of the first credit for `event`, none when the actor holds none.
 */
export const creditLabels = (credits: ReadonlyArray<Credit>, event: string) =>
  credits.find((c) => c.event === event)?.labels ?? {};

export const attemptKey = (operation: string, attempt: string) => `${operation} ${attempt}`;

const withCall = (state: State, call: Call) => ({
  ...state,
  calls: new Map([...state.calls, [attemptKey(call.operation, call.attempt), call]]),
});

/**
 * A call the suite knows, or one it first meets restored from an earlier page (no owner, Held).
 */
// RETURN_TYPE: the Call contract; the default's phase would infer as one variant.
const callOf = (state: State, operation: string, attempt: string): Call =>
  state.calls.get(attemptKey(operation, attempt)) ?? {
    actor: "",
    operation,
    attempt,
    key: Option.none(),
    owner: Option.none(),
    phase: CallPhase.Held(),
    current: false,
    either: false,
    booted: true,
  };

/**
 * Re-owns the oldest call of `actor`'s `operation` that has no definite ending and matches
 * `matches` (a retry re-owns its lane's head, Turn R20).
 */
export const reowned = (
  state: State,
  actor: ActorRef,
  operation: string,
  matches: (call: Call) => boolean,
  owner: Owner,
) => {
  const head = [...state.calls.values()].find(
    (c) =>
      c.actor === keyOf(actor) &&
      c.operation === operation &&
      !CallPhase.$is("Ended")(c.phase) &&
      matches(c),
  );

  return head === undefined ? state : withCall(state, { ...head, owner: Option.some(owner) });
};

/**
 * How a delivered ending is routed (Turn R20), from the owner the suite recorded at its mint or
 * retry: an unknown { Restored } or an adopted ending is current; an owner the suite did not see,
 * or an actor whose leaf it does not know, gives `either`.
 */
// RETURN_TYPE: the Route union; the branches infer three literals.
export const routeOf = (
  state: State,
  actor: Actor,
  delivered: { readonly operation: string; readonly attempt: Option.Option<string> },
): Route => {
  if (Option.isNone(delivered.attempt)) return "either";

  const call = state.calls.get(attemptKey(delivered.operation, delivered.attempt.value));
  const owner = call === undefined ? undefined : Option.getOrUndefined(call.owner);
  const leaf = leafOf(actor.phase);

  if (call?.either === true) return "either";

  if (call?.current === true) return "current";

  if (owner === undefined || Option.isNone(leaf) || !Phase.$is("Live")(actor.phase))
    return "either";

  const alive =
    owner.state === ROOT.state || (leaf.value === owner.state && actor.entry === owner.entry);

  return alive ? "current" : "late";
};

export const minted = (
  state: State,
  operation: string,
  attempt: string,
  actor: Option.Option<ActorRef>,
  key: Option.Option<Json>,
) =>
  Option.match(
    Option.flatMap(actor, (a) => Option.fromUndefinedOr(state.owning.get(keyOf(a)))),
    {
      onNone: () => state,
      onSome: (owner) =>
        withCall(state, {
          actor: Option.match(actor, { onNone: () => "", onSome: keyOf }),
          operation,
          attempt,
          key,
          owner: Option.some(owner),
          phase: CallPhase.Open(),
          current: false,
          either: false,
          booted: false,
        }),
    },
  );

/**
 * An adopted ending (its `Unparked`) is current whatever its owner (R20), but only in a step where
 * the suite booted a page or attached a use (`attaching`), the only steps an adoption can come
 * in, and only for a call the suite saw end (not `Open`); an `Unparked` of a call the suite never
 * saw changes nothing, so its delivery routes `either`.
 */
export const current = (
  state: State,
  operation: string,
  attempt: Option.Option<string>,
  attaching: boolean,
) =>
  Option.match(
    Option.filter(
      Option.flatMap(attempt, (id) =>
        Option.fromUndefinedOr(state.calls.get(attemptKey(operation, id))),
      ),
      (call) => attaching && !CallPhase.$is("Open")(call.phase),
    ),
    { onNone: () => state, onSome: (call) => withCall(state, { ...call, current: true }) },
  );

const moveCall = (state: State, operation: string, attempt: string, phase: CallPhase) => {
  const call = state.calls.get(attemptKey(operation, attempt));

  return call === undefined ? state : withCall(state, { ...call, phase });
};

/**
 * A call sent again: a Held head re-sent by its retry is in flight once more. The caller moves it
 * only when the step's server log received that Attempt; the `Sent` report gives only the moment.
 */
export const sent = (state: State, operation: string, attempt: string) =>
  moveCall(state, operation, attempt, CallPhase.Open());

/**
 * The calls an Activation owns that are pending work (Turn R21): open, not Held by an unknown
 * ending since their last send.
 */
export const pendingOf = (state: State, actor: ActorRef, owner: Owner) =>
  [...state.calls.values()].filter(
    (c) =>
      c.actor === keyOf(actor) &&
      CallPhase.$is("Open")(c.phase) &&
      Option.exists(c.owner, (by) => by.state === owner.state && by.entry === owner.entry),
  );

/**
 * Whether a step boots a page (`boot`), attaches a use (`attach`), sends an event (`send`: it may
 * wake an identity that ended, whose Held call's restore then arrives), or none of these.
 */
export type Attaching = "boot" | "attach" | "send" | "none";

/**
 * An ending of a call: one the suite's server answered (in any step) settles as that answer
 * classifies (`settled`): an unknown keeps the call Held, any other ends it. One the server never
 * answered (a cancel, a decline, a restore, a bound) leaves the call Held, whatever its reported
 * channel, so a retry may re-own it (it delivers nothing more once ended). A step that both boots
 * and attaches counts as a boot. In a
 * boot's step, such an ending of a call the page held before the kill is its restore, current
 * whatever its owner (Turn R20); so is one, in a step that attaches a use, of a call whose actor
 * the suite disposed or forgot (its adoption's restore). Any other in an attaching step routes
 * `either` (design section 3).
 */
export const ended = (
  state: State,
  operation: string,
  attempt: Option.Option<string>,
  settled: Option.Option<Channel>,
  attaching: Attaching,
) => {
  if (Option.isNone(attempt)) return state;
  const call = callOf(state, operation, attempt.value);

  return Option.match(settled, {
    onSome: (channel) =>
      moveCall(
        state,
        operation,
        attempt.value,
        channel === "unknown" ? CallPhase.Held() : CallPhase.Ended(),
      ),
    onNone: () =>
      withCall(state, {
        ...call,
        phase: CallPhase.Held(),
        current: call.current || (attaching !== "none" && call.booted),
        either:
          call.either ||
          (!call.current &&
            !call.booted &&
            (attaching === "attach" ||
              (attaching === "send" && CallPhase.$is("Held")(call.phase)))),
      }),
  });
};

/**
 * A request the suite's server received, or answered, kept at its latest phase so an answer is
 * classified against the Attempt's earlier sends.
 */
export const requested = (state: State, request: Request) => ({
  ...state,
  requests: [...state.requests.filter((r) => r.seq !== request.seq), request].toSorted(
    (a, b) => a.seq - b.seq,
  ),
});

const eachActor = (state: State, change: (a: Actor) => Actor) => ({
  ...state,
  actors: new Map([...state.actors].map(([key, a]) => [key, change(a)])),
});

/**
 * The runtime wrote a batch in a step: it holds some prefix of that step (design B4), so it is kept
 * as the least it holds, each actor's turns and fields before the step's second turn (`least`; the
 * step's end when it ran fewer). A flush lands at once, any other once the store lands it.
 */
export const wrote = (state: State, least: State, purpose: Purpose) => ({
  ...state,
  actors: new Map(
    [...state.actors].map(([key, a]) => {
      const start = least.actors.get(key) ?? FRESH;
      const kept = { turns: start.turns, fields: start.fields };

      return [
        key,
        purpose === "flush" ? { ...a, saved: kept } : { ...a, pending: Option.some(kept) },
      ] as const;
    }),
  ),
});

/**
 * The store landed the held batches: each actor's turns the latest of them holds are on disk.
 */
export const landed = (state: State) =>
  eachActor(state, (a) => ({
    ...a,
    saved: Option.match(a.pending, {
      onNone: () => a.saved,
      onSome: (kept) => (kept.turns >= a.saved.turns ? kept : a.saved),
    }),
    pending: Option.none(),
  }));

/**
 * The held batches will never land.
 */
export const dropped = (state: State) =>
  eachActor(state, (a) => ({ ...a, pending: Option.none() }));

/**
 * A kill and reload: an actor with turns the landed batch may not hold resumes at one of the leaves
 * those turns reached, from the one the batch surely holds (`allowed`, design section 3; WriteAhead
 * R10, I10), with the fields that batch holds; any other keeps its stored leaf.
 */
/**
 * The leaves an actor's record may hold: the one its saved turns reached, each its later turns
 * reached, and its initial leaf when its removal may have landed. A turn whose leaf the table
 * could not tell (`UNKNOWN_LEAF` in `trail`) leaves nothing to check: empty, and the next turn's
 * `from` is the report's, a stated limit.
 */
const reachedOf = (state: State, key: string, a: Actor, removed: boolean) => {
  const initial = state.machines[key.split(" ")[0] ?? ""]?.initial;
  const at = a.saved.turns === 0 ? initial : a.trail[a.saved.turns - 1];
  const fresh = removed ? initial : undefined;
  const leaves = [at, ...a.trail.slice(a.saved.turns), fresh];

  return leaves.includes(UNKNOWN_LEAF)
    ? []
    : [...new Set(leaves.flatMap((l) => (l === undefined ? [] : [l])))];
};

/**
 * A `trail` entry for a turn whose leaf the table could not tell.
 */
export const UNKNOWN_LEAF = "*";

/**
 * The suite disposed or forgot `actor`: an unanswered ending of one of its calls in the step that
 * adopts it is that call's restore, and after a kill it may start fresh at its initial leaf (the
 * removal may have landed).
 */
export const unbound = (state: State, actor: ActorRef) => ({
  ...state,
  actors: new Map(
    [...state.actors].map(([key, a]) => [
      key,
      key === keyOf(actor) ? { ...a, removed: true, allowed: reachedOf(state, key, a, true) } : a,
    ]),
  ),
  calls: new Map(
    [...state.calls].map(([key, c]) => [
      key,
      c.actor === keyOf(actor) ? { ...c, booted: true } : c,
    ]),
  ),
});

export const reloaded = (state: State) => ({
  ...state,
  disposing: false,
  calls: new Map([...state.calls].map(([key, c]) => [key, { ...c, booted: true }])),
  actors: new Map(
    [...state.actors].map(([key, a]) => {
      const lost = a.turns > a.saved.turns;
      const reached = reachedOf(state, key, a, a.removed);

      return [
        key,
        {
          ...a,
          phase:
            lost || (a.removed && Phase.$is("Fresh")(a.phase))
              ? Phase.Stored({ state: Option.none() })
              : TABLE[a.phase._tag].Reloaded(Input.Reloaded(), a.phase),
          driven: [],
          entry: a.entry + 1,
          fields: a.saved.fields,
          saved: { turns: a.turns, fields: a.saved.fields },
          pending: Option.none(),
          allowed: lost || a.removed ? reached : [],
          removed: false,
        },
      ] as const;
    }),
  ),
});

/**
 * The labels the suite's server gave a call's answer, under `operation attempt` when the request
 * named one, and under the operation alone (its latest answer: a read's ending names no Attempt).
 */
export const answered = (
  state: State,
  operation: string,
  key: Option.Option<string>,
  labels: Labels,
) => ({
  ...state,
  answers: new Map([
    ...state.answers,
    [operation, labels],
    ...Option.toArray(Option.map(key, (k) => [attemptKey(operation, k), labels] as const)),
  ]),
});

/**
 * The labels of the answer a delivered ending came from; none when the suite gave none (a decline,
 * a cancel, a restore).
 */
export const answerOf = (state: State, operation: string, attempt: Option.Option<string>) =>
  state.answers.get(
    Option.match(attempt, { onNone: () => operation, onSome: (a) => attemptKey(operation, a) }),
  ) ?? {};
