import { Duration } from "effect";

import type { CanonicalKeyInput } from "./canonical.js";
import type { AnyDefinition } from "./definition.js";
import type {
  AnyChild,
  AnyDescriptor,
  AnyResource,
  AnyStream,
  AnyTransaction,
  Child,
  FlowStream,
  InvalidationTarget,
  Resource,
  ResourceRef,
  Transaction,
  TransactionRef,
} from "./descriptors.js";
import {
  BindingTypeId,
  BindingKeyTypeId,
  BindingRegistryTypeId,
  DescriptorTypeId,
  EventTypeId,
  freezeArray,
  InputTypeId,
  MemoryTypeId,
  RequirementsTypeId,
  StateTypeId,
  TypeId,
} from "./internal.js";
import type {
  BindingCarriers,
  BindingDescriptors,
  BindingRequirements,
  EventOf,
  InputOf,
  MemoryOf,
  StateOf,
} from "./internal.js";
import { usageError } from "./usage-error.js";

export type ResourceSnapshot<A, E, Ref extends ResourceRef = ResourceRef> =
  | Readonly<{
      ref: Ref;
      status: "idle";
      availability: "empty";
      activity: "idle";
      freshness: "stale";
    }>
  | Readonly<{
      ref: Ref;
      status: "loading";
      availability: "empty";
      activity: "fetching";
      freshness: "stale";
      generation: number;
    }>
  | Readonly<{
      ref: Ref;
      status: "loading";
      availability: "placeholder";
      activity: "fetching";
      freshness: "stale";
      generation: number;
      value: A;
    }>
  | Readonly<{
      ref: Ref;
      status: "failure";
      availability: "empty";
      activity: "idle";
      freshness: "stale";
      generation: number;
      error: E;
    }>
  | (Readonly<{
      ref: Ref;
      availability: "value";
      value: A;
      updatedAt: number;
      expiresAt: number;
    }> &
      (
        | Readonly<{ status: "success"; freshness: "fresh"; invalidatedAt?: never }>
        | Readonly<{ status: "stale"; freshness: "stale"; invalidatedAt?: never }>
        | Readonly<{ status: "stale"; freshness: "invalidated"; invalidatedAt: number }>
      ) &
      (
        | Readonly<{ activity: "idle"; generation?: never }>
        | Readonly<{ activity: "fetching"; generation: number }>
      ));

type ResourceValue<Ref> =
  Ref extends ResourceRef<string, readonly CanonicalKeyInput[], infer A, unknown, unknown>
    ? A
    : never;
type ResourceError<Ref> =
  Ref extends ResourceRef<string, readonly CanonicalKeyInput[], unknown, infer E, unknown>
    ? E
    : never;

type TransactionRefValue<Ref> =
  Ref extends TransactionRef<string, unknown, infer A, unknown> ? A : never;
type TransactionRefError<Ref> =
  Ref extends TransactionRef<string, unknown, unknown, infer E> ? E : never;

type StreamValue<Value> =
  Value extends FlowStream<string, readonly unknown[], infer A, unknown, unknown> ? A : never;
type StreamError<Value> =
  Value extends FlowStream<string, readonly unknown[], unknown, infer E, unknown> ? E : never;

type BindingKeyFor<Bindings, Descriptor> =
  Bindings extends ActivityBinding<unknown, infer BoundDescriptor, infer Key>
    ? BoundDescriptor extends Descriptor
      ? Descriptor extends BoundDescriptor
        ? Key
        : never
      : never
    : never;

export type MachineSnapshotOf<Value extends AnyMachine> =
  Value extends Machine<infer D, infer _R, infer _Descriptors, infer TimerName, infer Bindings>
    ? MachineSnapshot<D, TimerName, Bindings>
    : never;

export type TransactionSnapshot<A, E, Ref = unknown> =
  | Readonly<{ status: "idle"; ref: Ref }>
  | Readonly<{ status: "queued" | "pending"; ref: Ref; generation: number }>
  | Readonly<{ status: "success"; ref: Ref; generation: number; value: A }>
  | Readonly<{ status: "failure"; ref: Ref; generation: number; error: E }>
  | Readonly<{ status: "defect"; ref: Ref; generation: number }>
  | Readonly<{ status: "interrupt"; ref: Ref; generation: number }>;

type StreamValueCarrier<A> = [A] extends [never] ? unknown : unknown;

export type StreamSnapshot<A, E, Key> = (
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "running"; key: Key; generation: number }>
  | Readonly<{ status: "complete"; key: Key; generation: number }>
  | Readonly<{ status: "failure"; key: Key; generation: number; error: E }>
  | Readonly<{ status: "defect"; key: Key; generation: number }>
  | Readonly<{ status: "interrupt"; key: Key; generation: number }>
) &
  StreamValueCarrier<A>;

export type ChildSnapshot<Snapshot, Key> =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "active" | "complete"; key: Key; generation: number; snapshot: Snapshot }>
  | Readonly<{ status: "defect" | "interrupt" | "stopped"; key: Key; generation: number }>;

export type TimerSnapshot<State, Name> =
  | Readonly<{ status: "idle"; name: Name }>
  | Readonly<{
      status: "scheduled";
      name: Name;
      state: State;
      generation: number;
      startedAt: number;
      dueAt: number;
    }>
  | Readonly<{
      status: "fired";
      name: Name;
      state: State;
      generation: number;
      startedAt: number;
      dueAt: number;
      firedAt: number;
    }>
  | Readonly<{
      status: "interrupt";
      name: Name;
      state: State;
      generation: number;
      startedAt: number;
      dueAt: number;
    }>;

export interface MachineSnapshot<
  DefinitionValue extends AnyDefinition,
  TimerName extends string = string,
  Bindings = ActivityBinding,
> {
  readonly value: StateOf<DefinitionValue>;
  readonly memory: Readonly<MemoryOf<DefinitionValue>>;
  readonly revision: number;
  readonly storeRevision: number;
  readonly lifecycle: "active" | "disposed";
  readonly resources: Readonly<{
    get: <Ref extends ResourceRef>(
      ref: Ref,
    ) => ResourceSnapshot<ResourceValue<Ref>, ResourceError<Ref>, Ref>;
    require: <Ref extends ResourceRef>(ref: Ref) => ResourceValue<Ref>;
  }>;
  readonly transactions: Readonly<{
    get: <Ref extends TransactionRef>(
      ref: Ref,
    ) => TransactionSnapshot<TransactionRefValue<Ref>, TransactionRefError<Ref>, Ref>;
  }>;
  readonly streams: Readonly<{
    get: <Value extends AnyStream>(
      stream: Value,
    ) => StreamSnapshot<StreamValue<Value>, StreamError<Value>, BindingKeyFor<Bindings, Value>>;
  }>;
  readonly children: Readonly<{
    get: <Value extends Child<string, AnyMachine>>(
      child: Value,
    ) => ChildSnapshot<MachineSnapshotOf<Value["machine"]>, BindingKeyFor<Bindings, Value>>;
  }>;
  readonly timers: Readonly<{
    get: <Name extends TimerName>(name: Name) => TimerSnapshot<StateOf<DefinitionValue>, Name>;
  }>;
  readonly issues: readonly Readonly<{
    kind: "failure" | "defect" | "interrupt" | "cleanup" | "invariant";
    source: "runtime" | "machine" | "resource" | "transaction" | "stream" | "timer" | "child";
    id: string;
  }>[];
}

type EventName<D extends AnyDefinition> = keyof D["E"] & string;
type StateName<D extends AnyDefinition> = keyof D["S"] & string;
type EventFor<D extends AnyDefinition, Name extends EventName<D>> = ReturnType<D["E"][Name]>;

type TransitionContext<D extends AnyDefinition, Event> = Readonly<{
  state: StateOf<D>;
  memory: Readonly<MemoryOf<D>>;
  snapshot: MachineSnapshot<D>;
  event: Event;
}>;

type ActivityContext<D extends AnyDefinition> = Readonly<{
  state: StateOf<D>;
  memory: Readonly<MemoryOf<D>>;
  snapshot: MachineSnapshot<D>;
  event: EventOf<D> | null;
  cause: Readonly<{
    kind: "activation" | "event" | "timer" | "store" | "internal";
  }>;
}>;

type Transition<D extends AnyDefinition, Event> =
  | StateOf<D>
  | Readonly<{
      target: StateOf<D>;
      guard?: (context: TransitionContext<D, Event>) => boolean;
      updateMemory?: (context: TransitionContext<D, Event>) => Partial<MemoryOf<D>>;
      reenter?: boolean;
    }>;

type TransitionList<D extends AnyDefinition, Event> =
  | Transition<D, Event>
  | readonly Transition<D, Event>[];

type EventTransitions<D extends AnyDefinition> = Readonly<{
  [Name in EventName<D>]?: TransitionList<D, EventFor<D, Name>>;
}>;

type Redirect<D extends AnyDefinition> = Readonly<{
  when: (context: Omit<TransitionContext<D, never>, "event">) => boolean;
  target: StateOf<D>;
}>;

type Timer<D extends AnyDefinition> = Readonly<{
  delay: Duration.Input;
  target: StateOf<D>;
  guard?: (
    context: Omit<TransitionContext<D, never>, "event"> & {
      readonly timer: Readonly<{ name: string; startedAt: number; dueAt: number }>;
    },
  ) => boolean;
  updateMemory?: (
    context: Omit<TransitionContext<D, never>, "event"> & {
      readonly timer: Readonly<{ name: string; startedAt: number; dueAt: number }>;
    },
  ) => Partial<MemoryOf<D>>;
}>;

export type ActivityBinding<
  R = unknown,
  Descriptor = AnyDescriptor,
  Key = CanonicalKeyInput,
> = Readonly<{
  kind: "activity";
  activityKind:
    | "ensure"
    | "observe"
    | "refresh"
    | "invalidate"
    | "transaction"
    | "stream"
    | "child";
  descriptor: Descriptor | undefined;
  options: unknown;
  readonly [TypeId]: "ActivityBinding";
  readonly [BindingTypeId]: (_: never) => R;
  readonly [BindingKeyTypeId]: (_: never) => Key;
  readonly [DescriptorTypeId]: (_: never) => Descriptor;
}>;

type ResourceRequirement<Value> =
  Value extends Resource<infer _Id, infer _Params, unknown, unknown, infer R>
    ? R
    : Value extends ResourceRef<string, readonly CanonicalKeyInput[], unknown, unknown, infer R>
      ? R
      : never;
type ResourceDescriptor<Value> =
  Value extends ResourceRef<infer Id, infer Params, infer A, infer E, infer R>
    ? Resource<Id, Params, A, E, R>
    : Value;
type ResourceA<Value> =
  Value extends Resource<infer _Id, infer _Params, infer A, infer _E, infer _R>
    ? A
    : Value extends ResourceRef<infer _Id, infer _Params, infer A, infer _E, infer _R>
      ? A
      : never;
type ResourceE<Value> =
  Value extends Resource<infer _Id, infer _Params, infer _A, infer E, infer _R>
    ? E
    : Value extends ResourceRef<infer _Id, infer _Params, infer _A, infer E, infer _R>
      ? E
      : never;
type OutcomeFailure<E, D extends AnyDefinition> = [E] extends [never]
  ? { readonly failure?: never }
  : { readonly failure?: (error: E) => EventOf<D> };

type FiniteResourceOutcomes<Value, D extends AnyDefinition> = Readonly<
  {
    success?: (value: ResourceA<Value>) => EventOf<D>;
    defect?: () => EventOf<D>;
    interrupt?: () => EventOf<D>;
  } & OutcomeFailure<ResourceE<Value>, D>
>;

type ObserveResourceOutcomes<Value, D extends AnyDefinition> = Readonly<
  {
    value?: (value: ResourceA<Value>) => EventOf<D>;
    defect?: () => EventOf<D>;
    interrupt?: () => EventOf<D>;
  } & OutcomeFailure<ResourceE<Value>, D>
>;

type TransactionParams<Value> =
  Value extends Transaction<
    infer _Id,
    infer Params,
    infer _Key,
    infer _A,
    infer _E,
    infer _R,
    infer _Singleton
  >
    ? Params
    : never;
type TransactionA<Value> =
  Value extends Transaction<
    infer _Id,
    infer _Params,
    infer _Key,
    infer A,
    infer _E,
    infer _R,
    infer _Singleton
  >
    ? A
    : never;
type TransactionE<Value> =
  Value extends Transaction<
    infer _Id,
    infer _Params,
    infer _Key,
    infer _A,
    infer E,
    infer _R,
    infer _Singleton
  >
    ? E
    : never;
type TransactionR<Value> =
  Value extends Transaction<
    infer _Id,
    infer _Params,
    infer _Key,
    infer _A,
    infer _E,
    infer R,
    infer _Singleton
  >
    ? R
    : never;

type StreamParams<Value> =
  Value extends FlowStream<infer _Id, infer Params, infer _A, infer _E, infer _R> ? Params : never;
type StreamA<Value> =
  Value extends FlowStream<infer _Id, infer _Params, infer A, infer _E, infer _R> ? A : never;
type StreamE<Value> =
  Value extends FlowStream<infer _Id, infer _Params, infer _A, infer E, infer _R> ? E : never;
type StreamR<Value> =
  Value extends FlowStream<infer _Id, infer _Params, infer _A, infer _E, infer R> ? R : never;

export interface ActivityKit<D extends AnyDefinition> {
  ensure<
    Id extends string,
    Params extends readonly CanonicalKeyInput[],
    A,
    E,
    R,
    const SelectedParams extends Params = Params,
  >(
    value: Resource<Id, Params, A, E, R>,
    options: Readonly<{
      params: (context: ActivityContext<D>) => SelectedParams | null;
      outcomes?: FiniteResourceOutcomes<Resource<Id, Params, A, E, R>, D>;
    }>,
  ): ActivityBinding<R, Resource<Id, Params, A, E, R>>;
  ensure<Value extends ResourceRef>(
    value: Value,
    options?: Readonly<{ outcomes?: FiniteResourceOutcomes<NoInfer<Value>, D> }>,
  ): ActivityBinding<ResourceRequirement<Value>, ResourceDescriptor<Value>>;
  observe<
    Id extends string,
    Params extends readonly CanonicalKeyInput[],
    A,
    E,
    R,
    const SelectedParams extends Params = Params,
  >(
    value: Resource<Id, Params, A, E, R>,
    options: Readonly<{
      params: (context: ActivityContext<D>) => SelectedParams | null;
      outcomes?: ObserveResourceOutcomes<Resource<Id, Params, A, E, R>, D>;
    }>,
  ): ActivityBinding<R, Resource<Id, Params, A, E, R>>;
  observe<Value extends ResourceRef>(
    value: Value,
    options?: Readonly<{ outcomes?: ObserveResourceOutcomes<NoInfer<Value>, D> }>,
  ): ActivityBinding<ResourceRequirement<Value>, ResourceDescriptor<Value>>;
  refresh<
    Id extends string,
    Params extends readonly CanonicalKeyInput[],
    A,
    E,
    R,
    const SelectedParams extends Params = Params,
  >(
    value: Resource<Id, Params, A, E, R>,
    options: Readonly<{
      params: (context: ActivityContext<D>) => SelectedParams | null;
      outcomes?: FiniteResourceOutcomes<Resource<Id, Params, A, E, R>, D>;
    }>,
  ): ActivityBinding<R, Resource<Id, Params, A, E, R>>;
  refresh<Value extends ResourceRef>(
    value: Value,
    options?: Readonly<{ outcomes?: FiniteResourceOutcomes<NoInfer<Value>, D> }>,
  ): ActivityBinding<ResourceRequirement<Value>, ResourceDescriptor<Value>>;
  invalidate(
    target:
      | InvalidationTarget
      | Readonly<{
          targets: (context: ActivityContext<D>) => readonly InvalidationTarget[] | null;
        }>,
  ): ActivityBinding<never, AnyResource>;
  run<Value extends AnyTransaction>(
    value: Value,
    options: TransactionParams<Value> extends void
      ? Readonly<{
          outcomes?: Readonly<
            {
              success?: (value: TransactionA<Value>) => EventOf<D>;
              defect?: () => EventOf<D>;
              interrupt?: () => EventOf<D>;
            } & OutcomeFailure<TransactionE<Value>, D>
          >;
        }>
      : Readonly<{
          params: (context: ActivityContext<D>) => TransactionParams<Value> | null;
          outcomes?: Readonly<
            {
              success?: (value: TransactionA<Value>) => EventOf<D>;
              defect?: () => EventOf<D>;
              interrupt?: () => EventOf<D>;
            } & OutcomeFailure<TransactionE<Value>, D>
          >;
        }>,
  ): ActivityBinding<TransactionR<Value>, Value>;
  stream<Value extends AnyStream, Key extends CanonicalKeyInput = readonly []>(
    value: Value,
    options: StreamParams<Value> extends readonly []
      ? Readonly<{
          outcomes?: Readonly<
            {
              value?: (value: StreamA<Value>) => EventOf<D>;
              complete?: () => EventOf<D>;
              defect?: () => EventOf<D>;
              interrupt?: () => EventOf<D>;
            } & OutcomeFailure<StreamE<Value>, D>
          >;
        }>
      : Readonly<{
          params: (context: ActivityContext<D>) => StreamParams<Value> | null;
          key: (params: StreamParams<Value>) => Key;
          outcomes?: Readonly<
            {
              value?: (value: StreamA<Value>) => EventOf<D>;
              complete?: () => EventOf<D>;
              defect?: () => EventOf<D>;
              interrupt?: () => EventOf<D>;
            } & OutcomeFailure<StreamE<Value>, D>
          >;
        }>,
  ): ActivityBinding<StreamR<Value>, Value, Key>;
  child<Value extends Child<string, AnyMachine>, Key extends CanonicalKeyInput = readonly []>(
    value: Value,
    options: InputOf<Value["machine"]> extends void
      ? Readonly<{
          outcomes?: Readonly<{
            complete?: (snapshot: MachineSnapshot<Value["machine"]["definition"]>) => EventOf<D>;
            defect?: () => EventOf<D>;
            interrupt?: () => EventOf<D>;
          }>;
        }>
      : Readonly<{
          input: (context: ActivityContext<D>) => InputOf<Value["machine"]> | null;
          key: (input: InputOf<Value["machine"]>) => Key;
          outcomes?: Readonly<{
            complete?: (snapshot: MachineSnapshot<Value["machine"]["definition"]>) => EventOf<D>;
            defect?: () => EventOf<D>;
            interrupt?: () => EventOf<D>;
          }>;
        }>,
  ): ActivityBinding<
    Value["machine"] extends { readonly [RequirementsTypeId]: (_: never) => infer R } ? R : never,
    Value,
    Key
  >;
}

type NormalStateNode<D extends AnyDefinition> = Readonly<{
  type?: never;
  on?: EventTransitions<D>;
  redirect?: Redirect<D> | readonly Redirect<D>[];
  activities?: readonly unknown[];
  timers?: Readonly<Record<string, Timer<D>>>;
}>;

type FinalStateNode = Readonly<{
  type: "final";
  on?: never;
  redirect?: never;
  activities?: never;
  timers?: never;
}>;

export type MachineConfig<D extends AnyDefinition> = Readonly<{
  initial: StateOf<D>;
  states: Readonly<{ [Name in StateName<D>]: NormalStateNode<D> | FinalStateNode }>;
}>;

export type InertStateNode = Readonly<{
  type?: "final";
  on?: object | undefined;
  redirect?: unknown;
  activities?: readonly ActivityBinding[];
  timers?: Readonly<Record<string, unknown>> | undefined;
}>;

type TimerNames<Config> = Config extends { readonly states: infer States }
  ? States extends object
    ? {
        readonly [State in keyof States]: States[State] extends { readonly timers?: infer Timers }
          ? keyof NonNullable<Timers> & string
          : never;
      }[keyof States]
    : never
  : never;

export interface Machine<
  D extends AnyDefinition = AnyDefinition,
  R = unknown,
  Descriptors = AnyDescriptor,
  TimerName extends string = string,
  Bindings = ActivityBinding,
> {
  readonly kind: "machine";
  readonly id: D["id"];
  readonly definition: D;
  readonly initial: StateOf<D>;
  readonly states: Readonly<Record<string, InertStateNode>>;
  readonly descriptors: readonly AnyDescriptor[];
  readonly [TypeId]: "Machine";
  readonly [InputTypeId]: D[typeof InputTypeId];
  readonly [MemoryTypeId]: D[typeof MemoryTypeId];
  readonly [StateTypeId]: D[typeof StateTypeId];
  readonly [EventTypeId]: D[typeof EventTypeId];
  readonly [RequirementsTypeId]: (_: never) => R;
  readonly [DescriptorTypeId]: (_: never) => Descriptors;
  readonly [BindingRegistryTypeId]: (_: never) => Bindings;
  readonly timerNames: readonly TimerName[];
}

export type AnyMachine = Machine<AnyDefinition, unknown, AnyDescriptor, string, ActivityBinding>;

const typeBrand = (_: never): never => {
  throw new Error("Flow type brands are not executable");
};

const binding = <
  R = unknown,
  Descriptor extends AnyDescriptor = AnyDescriptor,
  Key = CanonicalKeyInput,
>(
  activityKind: ActivityBinding["activityKind"],
  descriptor: Descriptor | undefined,
  options: unknown,
): ActivityBinding<R, Descriptor, Key> =>
  Object.freeze({
    kind: "activity" as const,
    activityKind,
    descriptor,
    options:
      options !== null && typeof options === "object" && !("kind" in options)
        ? Object.freeze(
            Object.fromEntries(
              Object.entries(options).map(([key, value]) => [
                key,
                key === "outcomes" && value !== null && typeof value === "object"
                  ? Object.freeze({ ...value })
                  : value,
              ]),
            ),
          )
        : options,
    [TypeId]: "ActivityBinding" as const,
    [BindingTypeId]: typeBrand,
    [BindingKeyTypeId]: typeBrand,
    [DescriptorTypeId]: typeBrand,
  });

const createActivityKit = <D extends AnyDefinition>(): ActivityKit<D> => {
  const resourceBinding = (
    activityKind: "ensure" | "observe" | "refresh",
    value: AnyResource | ResourceRef,
    options?: unknown,
  ): ActivityBinding =>
    binding(activityKind, value.kind === "resource-ref" ? value.descriptor : value, options);
  const ensure = ((value: AnyResource | ResourceRef, options?: unknown) =>
    resourceBinding("ensure", value, options)) as ActivityKit<D>["ensure"];
  const observe = ((value: AnyResource | ResourceRef, options?: unknown) =>
    resourceBinding("observe", value, options)) as ActivityKit<D>["observe"];
  const refresh = ((value: AnyResource | ResourceRef, options?: unknown) =>
    resourceBinding("refresh", value, options)) as ActivityKit<D>["refresh"];
  const invalidate = ((value: InvalidationTarget | Readonly<{ targets: Function }>) =>
    binding(
      "invalidate",
      "kind" in value && value.kind === "resource-ref" ? value.descriptor : undefined,
      value,
    )) as ActivityKit<D>["invalidate"];
  const run = ((value: AnyTransaction, options: unknown) =>
    binding("transaction", value, options)) as ActivityKit<D>["run"];
  const streamBinding = ((value: AnyStream, options: unknown) =>
    binding("stream", value, options)) as ActivityKit<D>["stream"];
  const childBinding = ((value: AnyChild, options: unknown) =>
    binding("child", value, options)) as ActivityKit<D>["child"];
  return Object.freeze({
    ensure,
    observe,
    refresh,
    invalidate,
    run,
    stream: streamBinding,
    child: childBinding,
  });
};

const validateKeys = (
  value: object,
  allowed: ReadonlySet<string>,
  operation: string,
  details: Readonly<Record<string, CanonicalKeyInput>>,
): void => {
  for (const key of Object.keys(value))
    if (!allowed.has(key)) usageError("InvalidDefinition", operation, { ...details, key });
};

const validateTarget = (target: unknown, definition: AnyDefinition, operation: string): void => {
  if (
    target === null ||
    typeof target !== "object" ||
    !("kind" in target) ||
    target.kind !== "state" ||
    !("id" in target) ||
    !Object.values(definition.S).some((token) => token === target)
  )
    usageError("InvalidDefinition", operation, { id: definition.id, reason: "target" });
};

export const machine = <D extends AnyDefinition, const Config extends MachineConfig<D>>(
  definition: D,
  build: (kit: Readonly<{ S: D["S"]; E: D["E"]; activity: ActivityKit<D> }>) => Config,
  ...invalidTopLevelKeys: Exclude<keyof Config, keyof MachineConfig<D>> extends never
    ? readonly []
    : readonly [invalidTopLevelKeys: never]
): Machine<
  D,
  BindingRequirements<Config>,
  BindingDescriptors<Config>,
  TimerNames<Config>,
  BindingCarriers<Config>
> => {
  void invalidTopLevelKeys;
  const activity = createActivityKit<D>();
  const config = build(Object.freeze({ S: definition.S, E: definition.E, activity }));
  validateKeys(config, new Set(["initial", "states"]), "machine", { id: definition.id });
  validateTarget(config.initial, definition, "machine.initial");
  const expectedStates = new Set(Object.keys(definition.S));
  const actualStates = Object.keys(config.states);
  if (
    actualStates.length !== expectedStates.size ||
    actualStates.some((name) => !expectedStates.has(name))
  )
    usageError("InvalidDefinition", "machine.states", {
      id: definition.id,
      reason: "state-coverage",
    });

  const descriptors: AnyDescriptor[] = [];
  const seenDescriptors = new Set<AnyDescriptor>();
  const timerNames: string[] = [];
  const seenTimers = new Set<string>();
  const compiledStates: Record<string, InertStateNode> = {};
  for (const [stateName, node] of Object.entries(config.states)) {
    if (node.type === "final") {
      validateKeys(node, new Set(["type"]), "machine.final", { id: definition.id, stateName });
      compiledStates[stateName] = Object.freeze({ type: "final" });
      continue;
    }
    if (node.type !== undefined)
      usageError("InvalidDefinition", "machine.state", {
        id: definition.id,
        stateName,
        reason: "state-type",
      });
    validateKeys(
      node,
      new Set(["type", "on", "redirect", "activities", "timers"]),
      "machine.state",
      {
        id: definition.id,
        stateName,
      },
    );
    const compiledOn: Record<string, unknown> = {};
    if (node.on !== undefined) {
      for (const [eventName, transitions] of Object.entries(node.on)) {
        if (!(eventName in definition.E))
          usageError("InvalidDefinition", "machine.on", {
            id: definition.id,
            stateName,
            eventName,
          });
        const transitionList = Array.isArray(transitions) ? transitions : [transitions];
        const compiledTransitions: unknown[] = [];
        for (const transition of transitionList) {
          if (transition !== null && typeof transition === "object" && "kind" in transition)
            validateTarget(transition, definition, "machine.transition");
          else if (transition !== null && typeof transition === "object") {
            validateKeys(
              transition,
              new Set(["target", "guard", "updateMemory", "reenter"]),
              "machine.transition",
              {
                id: definition.id,
                stateName,
                eventName,
              },
            );
            validateTarget(transition.target, definition, "machine.transition.target");
          } else
            usageError("InvalidDefinition", "machine.transition", { id: definition.id, stateName });
          compiledTransitions.push(
            transition !== null && typeof transition === "object" && !("kind" in transition)
              ? Object.freeze({ ...transition })
              : transition,
          );
        }
        compiledOn[eventName] = Array.isArray(transitions)
          ? freezeArray(compiledTransitions)
          : compiledTransitions[0];
      }
    }
    const compiledRedirects: unknown[] = [];
    if (node.redirect !== undefined) {
      for (const redirect of Array.isArray(node.redirect) ? node.redirect : [node.redirect]) {
        validateKeys(redirect, new Set(["when", "target"]), "machine.redirect", {
          id: definition.id,
          stateName,
        });
        validateTarget(redirect.target, definition, "machine.redirect.target");
        compiledRedirects.push(Object.freeze({ ...redirect }));
      }
    }
    const compiledActivities: ActivityBinding[] = [];
    for (const candidate of node.activities ?? []) {
      if (candidate === null || typeof candidate !== "object" || !("kind" in candidate))
        usageError("InvalidDefinition", "machine.activities", { id: definition.id, stateName });
      const activityValue = candidate as ActivityBinding;
      if (activityValue.kind !== "activity")
        usageError("InvalidDefinition", "machine.activities", { id: definition.id, stateName });
      compiledActivities.push(activityValue);
      if (
        activityValue.descriptor !== undefined &&
        !seenDescriptors.has(activityValue.descriptor)
      ) {
        seenDescriptors.add(activityValue.descriptor);
        descriptors.push(activityValue.descriptor);
      }
    }
    const compiledTimers: Record<string, unknown> = {};
    for (const [name, timer] of Object.entries(node.timers ?? {})) {
      if (seenTimers.has(name))
        usageError("InvalidDefinition", "machine.timers", {
          id: definition.id,
          name,
          reason: "duplicate-timer",
        });
      seenTimers.add(name);
      timerNames.push(name);
      validateKeys(timer, new Set(["delay", "guard", "target", "updateMemory"]), "machine.timer", {
        id: definition.id,
        stateName,
        name,
      });
      const milliseconds = Duration.toMillis(timer.delay);
      if (!Number.isSafeInteger(milliseconds) || milliseconds < 0)
        usageError("InvalidDefinition", "machine.timer", {
          id: definition.id,
          name,
          reason: "delay",
        });
      validateTarget(timer.target, definition, "machine.timer.target");
      compiledTimers[name] = Object.freeze({ ...timer });
    }
    compiledStates[stateName] = Object.freeze({
      on: node.on === undefined ? undefined : Object.freeze(compiledOn),
      redirect:
        node.redirect === undefined
          ? undefined
          : Array.isArray(node.redirect)
            ? freezeArray(compiledRedirects)
            : compiledRedirects[0],
      activities: freezeArray(compiledActivities),
      timers: node.timers === undefined ? undefined : Object.freeze(compiledTimers),
    });
  }

  const result: Machine<
    D,
    BindingRequirements<Config>,
    BindingDescriptors<Config>,
    TimerNames<Config>,
    BindingCarriers<Config>
  > = {
    kind: "machine" as const,
    id: definition.id,
    definition,
    initial: config.initial,
    states: Object.freeze(compiledStates),
    descriptors: freezeArray(descriptors),
    timerNames: freezeArray(timerNames) as readonly TimerNames<Config>[],
    [TypeId]: "Machine" as const,
    [InputTypeId]: typeBrand,
    [MemoryTypeId]: typeBrand,
    [StateTypeId]: typeBrand,
    [EventTypeId]: typeBrand,
    [RequirementsTypeId]: typeBrand,
    [DescriptorTypeId]: typeBrand,
    [BindingRegistryTypeId]: typeBrand,
  };
  return Object.freeze(result);
};
