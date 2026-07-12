import type {
  FlowAfterConfig,
  FlowChildConfig,
  FlowEvent,
  FlowMachine,
  FlowMachineConfig,
  FlowMachineStateNode,
  FlowResourceConfig,
  FlowStreamConfig,
  FlowTransactionConfig,
  FlowViewConfig,
} from "../core/api/types.js";

type Mutable<T> = {
  -readonly [Property in keyof T]: T[Property];
};

function copyArray<Value>(value: ReadonlyArray<Value>): ReadonlyArray<Value> {
  return Object.freeze([...value]);
}

function freezeRecord<T extends object>(value: T): T {
  return Object.freeze({ ...value }) as T;
}

function copyTransitionObject<T extends object>(transition: T): T {
  const copied = { ...transition } as Record<string, unknown>;
  if (Array.isArray(copied.actions)) {
    copied.actions = copyArray(copied.actions);
  }
  return Object.freeze(copied) as T;
}

function copyTransitionValue<T>(transition: T): T {
  if (Array.isArray(transition)) {
    return Object.freeze(transition.map((entry) => copyTransitionObject(entry))) as T;
  }

  if (transition !== null && typeof transition === "object") {
    return copyTransitionObject(transition);
  }

  return transition;
}

function copyStateTransitions<T extends object>(transitions: T): T {
  const copied = Object.create(null) as Record<string, unknown>;
  for (const [eventType, transition] of Object.entries(transitions)) {
    if (transition !== undefined) {
      copied[eventType] = copyTransitionValue(transition);
    }
  }

  return Object.freeze(copied) as T;
}

function copyStateNode<Context, Event extends FlowEvent, State extends string>(
  node: FlowMachineStateNode<Context, Event, State>,
): FlowMachineStateNode<Context, Event, State> {
  const copied = { ...node } as Record<string, unknown>;
  if (Array.isArray(node.entry)) {
    copied.entry = copyArray(node.entry);
  }
  if (Array.isArray(node.exit)) {
    copied.exit = copyArray(node.exit);
  }
  if (Array.isArray(node.invoke)) {
    copied.invoke = copyArray(node.invoke);
  }
  if (Array.isArray(node.after)) {
    copied.after = copyArray(node.after);
  }
  if (node.always !== undefined) {
    copied.always = copyTransitionValue(node.always);
  }
  if (node.on !== undefined) {
    copied.on = copyStateTransitions(node.on);
  }
  return Object.freeze(copied) as FlowMachineStateNode<Context, Event, State>;
}

function copyStates<Context, Event extends FlowEvent, State extends string>(
  states: FlowMachineConfig<string, Context, Event, State, State>["states"],
): FlowMachineConfig<string, Context, Event, State, State>["states"] {
  const copied = Object.create(null) as Record<string, FlowMachineStateNode<Context, Event, State>>;
  for (const [state, node] of Object.entries(states) as Array<
    [State, FlowMachineStateNode<Context, Event, State>]
  >) {
    copied[state] = copyStateNode(node);
  }
  return Object.freeze(copied);
}

export function copyResourceConfig<
  const Id extends string,
  Params extends ReadonlyArray<unknown>,
  Value,
  Error,
  Requirements,
  Schema,
>(
  config: FlowResourceConfig<Id, Params, Value, Error, Requirements, Schema>,
): FlowResourceConfig<Id, Params, Value, Error, Requirements, Schema> {
  const copied = { ...config } as Mutable<
    FlowResourceConfig<Id, Params, Value, Error, Requirements, Schema>
  >;
  if (Array.isArray(config.tags)) {
    copied.tags = copyArray(config.tags);
  }
  if (config.freshness !== undefined) {
    copied.freshness = freezeRecord(config.freshness);
  }
  return Object.freeze(copied);
}

export function copyMachineConfig<
  Context,
  Event extends FlowEvent,
  State extends string,
  Initial extends State,
  const Id extends string,
>(
  config: FlowMachineConfig<Id, Context, Event, State, Initial>,
): FlowMachineConfig<Id, Context, Event, State, Initial> {
  return Object.freeze({
    ...config,
    states: copyStates(config.states) as FlowMachineConfig<
      Id,
      Context,
      Event,
      State,
      Initial
    >["states"],
  });
}

export function copyTransactionConfig<
  const Id extends string,
  Params,
  Value,
  Error,
  Requirements,
  Event extends FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown>,
>(
  config: FlowTransactionConfig<Id, Params, Value, Error, Requirements, Event, PreviewPatches>,
): FlowTransactionConfig<Id, Params, Value, Error, Requirements, Event, PreviewPatches> {
  const copied = { ...config } as Mutable<
    FlowTransactionConfig<Id, Params, Value, Error, Requirements, Event, PreviewPatches>
  >;
  if (config.preview !== undefined) {
    copied.preview = freezeRecord(config.preview);
  }
  if (Array.isArray(config.invalidates)) {
    copied.invalidates = copyArray(config.invalidates);
  }
  if (config.routes !== undefined) {
    copied.routes = freezeRecord(config.routes);
  }
  if (config.scope !== undefined) {
    copied.scope = freezeRecord(config.scope);
  }
  if (config.queue !== undefined) {
    copied.queue = freezeRecord(config.queue);
  }
  return Object.freeze(copied);
}

export function copyViewConfig<const Id extends string, Context, State extends string, Selected>(
  config: FlowViewConfig<Id, Context, State, Selected>,
): FlowViewConfig<Id, Context, State, Selected> {
  return Object.freeze({
    ...config,
    sources: copyArray(config.sources),
  });
}

export function copyStreamConfig<
  const Id extends string,
  Context,
  Event extends FlowEvent,
  Params,
  Value,
  Error,
  Requirements,
>(
  config: FlowStreamConfig<Id, Context, Event, Params, Value, Error, Requirements>,
): FlowStreamConfig<Id, Context, Event, Params, Value, Error, Requirements> {
  const copied = { ...config } as Mutable<
    FlowStreamConfig<Id, Context, Event, Params, Value, Error, Requirements>
  >;
  if (config.pressure !== undefined) {
    copied.pressure = freezeRecord(config.pressure);
  }
  if (config.routes !== undefined) {
    copied.routes = freezeRecord(config.routes);
  }
  return Object.freeze(copied);
}

export function copyAfterConfig<State extends string, Context, Event extends FlowEvent>(
  config: FlowAfterConfig<State, Context, Event>,
): FlowAfterConfig<State, Context, Event> {
  return Object.freeze({ ...config });
}

export function copyChildConfig<Machine extends FlowMachine>(
  config: FlowChildConfig<Machine>,
): FlowChildConfig<Machine> {
  return Object.freeze({ ...config });
}
