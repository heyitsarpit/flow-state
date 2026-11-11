import { Option } from "effect";
import { Fact } from "../dsl/oracle.ts";
import type { Machines, Route } from "../fixtures/handlers.ts";
import type { ActorRef, Channel, Delivered, Json } from "../port.ts";
import { type Input, Phase, TABLE } from "./phases.ts";

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
 * A minted call with no definite ending yet (an unknown keeps its head Held): its actor,
 * operation, Attempt and key, oldest first, so a retry re-owns its lane's head.
 */
export type OpenCall = {
  readonly actor: string;
  readonly operation: string;
  readonly attempt: string;
  readonly key: Option.Option<Json>;
};

export type State = {
  readonly machines: Machines;
  readonly actors: ReadonlyMap<string, Actor>;
  readonly owning: ReadonlyMap<string, Owner>;
  readonly owners: ReadonlyMap<string, Owner>;
  readonly restored: ReadonlySet<string>;
  readonly open: ReadonlyArray<OpenCall>;
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

/**
 * How a delivered ending is routed (Turn R20), from the owner the suite recorded at its mint or
 * retry: an unknown { Restored } or an adopted ending is current; an owner the suite did not see,
 * or an actor whose leaf it does not know, gives `either`.
 */
// RETURN_TYPE: the Route union; the branches infer three literals.
export const routeOf = (state: State, actor: Actor, delivered: Delivered): Route => {
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
      onSome: (owner) => ({
        ...state,
        owners: new Map([...state.owners, [attemptKey(operation, attempt), owner]]),
        open: [
          ...state.open,
          ...Option.toArray(actor).map((a) => ({ actor: keyOf(a), operation, attempt, key })),
        ],
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
    ? { ...state, restored: new Set([...state.restored, attemptKey(operation, attempt.value)]) }
    : state;

export const ended = (
  state: State,
  operation: string,
  attempt: Option.Option<string>,
  channel: Channel,
  reason: string,
  step: ReadonlyArray<Fact>,
) => {
  if (channel === "unknown")
    return reason === "Restored" ? current(state, operation, attempt, step) : state;

  return {
    ...state,
    open: state.open.filter(
      (c) => c.operation !== operation || !Option.contains(attempt, c.attempt),
    ),
  };
};
