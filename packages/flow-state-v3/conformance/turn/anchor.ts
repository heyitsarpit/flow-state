import { Data, Option } from "effect";
import { Fact } from "../dsl/oracle.ts";
import type { Machines, Route } from "../fixtures/handlers.ts";
import type { ActorRef, Channel, Delivered, Json } from "../port.ts";
import { type Input, leafOf, Phase, TABLE } from "./phases.ts";

export type Actor = {
  readonly phase: Phase;
  readonly driven: ReadonlyArray<string>;
  readonly entry: number;
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
};

export type State = {
  readonly machines: Machines;
  readonly actors: ReadonlyMap<string, Actor>;
  readonly owning: ReadonlyMap<string, Owner>;
  readonly calls: ReadonlyMap<string, Call>;
};

export const keyOf = (actor: ActorRef) => `${actor.machine} ${actor.id}`;

export const FRESH: Actor = { phase: Phase.Fresh(), driven: [], entry: 0 };

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

export const withoutOne = (events: ReadonlyArray<string>, event: string) => {
  const at = events.indexOf(event);

  return at < 0 ? events : [...events.slice(0, at), ...events.slice(at + 1)];
};

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
export const routeOf = (state: State, actor: Actor, delivered: Delivered): Route => {
  if (Option.isNone(delivered.attempt)) return "either";

  const call = state.calls.get(attemptKey(delivered.operation, delivered.attempt.value));
  const owner = call === undefined ? undefined : Option.getOrUndefined(call.owner);
  const leaf = leafOf(actor.phase);

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
        }),
    },
  );

/**
 * An Attempt whose ending is current whatever its owner (R20): an unknown { Restored }, or an
 * adopted ending (its `Unparked`), but only in a step where the suite booted a page or attached a
 * use, the only steps a restore or an adoption can come in.
 */
export const current = (
  state: State,
  operation: string,
  attempt: Option.Option<string>,
  step: ReadonlyArray<Fact>,
) =>
  Option.isSome(attempt) && step.some((f) => Fact.$is("Reloaded")(f) || Fact.$is("Ensured")(f))
    ? withCall(state, {
        ...callOf(state, operation, attempt.value),
        current: true,
      })
    : state;

const moveCall = (state: State, operation: string, attempt: string, phase: CallPhase) => {
  const call = state.calls.get(attemptKey(operation, attempt));

  return call === undefined ? state : withCall(state, { ...call, phase });
};

/**
 * A call sent again: a Held head re-sent by its retry is in flight once more.
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

export const ended = (
  state: State,
  operation: string,
  attempt: Option.Option<string>,
  channel: Channel,
  reason: string,
  step: ReadonlyArray<Fact>,
) => {
  if (Option.isNone(attempt)) return state;

  if (channel === "unknown") {
    const restored = reason === "Restored" ? current(state, operation, attempt, step) : state;

    return moveCall(restored, operation, attempt.value, CallPhase.Held());
  }

  return moveCall(state, operation, attempt.value, CallPhase.Ended());
};
