import type { FlowReceipt } from "./receipt-types.js";
import type {
  FlowChildSnapshot,
  FlowResourceSnapshot,
  FlowStreamSnapshot,
  FlowTimerSnapshot,
  FlowTransactionSnapshot,
} from "./snapshot-types.js";
import type {
  FlowEvent,
  FlowMachineRoutedBinding,
  FlowTransactionBinding,
} from "./resource-transaction-types.js";
import type { FlowInvokeDescriptor } from "./machine-invoke-types.js";
import type { FlowAfterDefinition } from "./machine-view-stream-types.js";

export type FlowSnapshot<
  Context,
  State extends string,
  Event extends FlowEvent = FlowEvent,
> = Readonly<{
  readonly machine: Readonly<{
    readonly kind: "machine";
    readonly id: string;
    readonly config: Readonly<{
      readonly id: string;
      readonly initial: string;
      readonly context: () => Context;
      readonly states: Readonly<Partial<Record<string, FlowSnapshotMachineStateNode>>>;
    }>;
    readonly getInitialSnapshot: () => FlowSnapshot<Context, string, Event>;
  }>;
  readonly value: State;
  readonly context: Context;
  readonly resources: Readonly<Record<string, FlowResourceSnapshot>>;
  readonly transactions: Readonly<Record<string, FlowTransactionSnapshot>>;
  readonly streams: Readonly<Record<string, FlowStreamSnapshot>>;
  readonly timers: Readonly<Record<string, FlowTimerSnapshot>>;
  readonly children: Readonly<Record<string, FlowChildSnapshot>>;
  readonly truncatedBeforeReceiptCount?: number;
  readonly receipts: ReadonlyArray<FlowReceipt>;
}>;

export type FlowTransitionRuntime = Readonly<{
  readonly now: () => number;
}>;

export type FlowTransitionArgs<Context, Event extends FlowEvent, State extends string> = Readonly<{
  readonly context: Context;
  readonly event: Event;
  readonly value: State;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly resources: FlowSnapshot<Context, State, Event>["resources"];
  readonly transactions: FlowSnapshot<Context, State, Event>["transactions"];
  readonly streams: FlowSnapshot<Context, State, Event>["streams"];
  readonly timers: FlowSnapshot<Context, State, Event>["timers"];
  readonly children: FlowSnapshot<Context, State, Event>["children"];
  readonly receipts: FlowSnapshot<Context, State, Event>["receipts"];
  readonly runtime: FlowTransitionRuntime;
}>;

export type FlowActionDefinition<Context, Event extends FlowEvent, State extends string> = (
  args: FlowTransitionArgs<Context, Event, State>,
) => void | FlowReceipt | ReadonlyArray<FlowReceipt>;

export type FlowTransitionDefinition<
  Context,
  Event extends FlowEvent,
  State extends string,
  MachineEvent extends FlowEvent = FlowEvent,
> = Readonly<{
  readonly target?: State;
  readonly reenter?: boolean;
  readonly guard?: (args: FlowTransitionArgs<Context, Event, State>) => boolean;
  readonly update?: (args: FlowTransitionArgs<Context, Event, State>) => Partial<Context>;
  readonly actions?:
    | FlowActionDefinition<Context, Event, State>
    | ReadonlyArray<FlowActionDefinition<Context, Event, State>>;
  readonly submit?: FlowTransactionBinding<FlowEvent> & FlowMachineRoutedBinding<MachineEvent>;
}>;

export type FlowEventTransitions<
  Context,
  Event extends FlowEvent,
  State extends string,
  MachineEvent extends FlowEvent = FlowEvent,
> =
  | State
  | FlowTransitionDefinition<Context, Event, State, MachineEvent>
  | ReadonlyArray<FlowTransitionDefinition<Context, Event, State, MachineEvent>>;

type FlowInvokeDefinitions<Event extends FlowEvent = FlowEvent> =
  | FlowInvokeDescriptor<Event>
  | readonly []
  | readonly [FlowInvokeDescriptor<Event>, ...FlowInvokeDescriptor<Event>[]];

type FlowSnapshotActionDefinition = (
  args: never,
) => void | FlowReceipt | ReadonlyArray<FlowReceipt>;

type FlowSnapshotTransitionDefinition = Readonly<{
  readonly target?: string;
  readonly reenter?: boolean;
  readonly guard?: (args: never) => boolean;
  readonly update?: (args: never) => unknown;
  readonly actions?: FlowSnapshotActionDefinition | ReadonlyArray<FlowSnapshotActionDefinition>;
  readonly submit?: unknown;
}>;

type FlowSnapshotEventTransitions =
  | string
  | FlowSnapshotTransitionDefinition
  | ReadonlyArray<FlowSnapshotTransitionDefinition>;

type FlowSnapshotMachineStateNode = Readonly<{
  readonly type?: "final";
  readonly entry?: FlowSnapshotActionDefinition | ReadonlyArray<FlowSnapshotActionDefinition>;
  readonly exit?: FlowSnapshotActionDefinition | ReadonlyArray<FlowSnapshotActionDefinition>;
  readonly invoke?: FlowInvokeDefinitions;
  readonly after?: unknown;
  readonly always?: FlowSnapshotEventTransitions;
  readonly on?: Readonly<Partial<Record<string, FlowSnapshotEventTransitions>>>;
}>;

export type FlowMachineConfigShape = Readonly<{
  readonly id: string;
  readonly initial: string;
  readonly context: () => unknown;
  readonly states: Readonly<Partial<Record<string, FlowSnapshotMachineStateNode>>>;
}>;

export type AnyFlowMachine = Readonly<{
  readonly kind: "machine";
  readonly id: string;
  readonly config: FlowMachineConfigShape;
  readonly getInitialSnapshot: () => FlowSnapshot<unknown, string, FlowEvent>;
  readonly __flowMachineFamily?: Readonly<{
    readonly context: unknown;
    readonly event: FlowEvent;
    readonly state: string;
  }>;
}>;

type FlowStateTransitions<Context, Event extends FlowEvent, State extends string> = Readonly<{
  readonly [Type in Event["type"]]?: FlowEventTransitions<
    Context,
    Extract<Event, { readonly type: Type }>,
    State,
    Event
  >;
}>;

export type FlowMachineStateNode<
  Context,
  Event extends FlowEvent,
  State extends string,
> = Readonly<{
  readonly type?: "final";
  readonly entry?:
    | FlowActionDefinition<Context, Event, State>
    | ReadonlyArray<FlowActionDefinition<Context, Event, State>>;
  readonly exit?:
    | FlowActionDefinition<Context, Event, State>
    | ReadonlyArray<FlowActionDefinition<Context, Event, State>>;
  readonly invoke?: FlowInvokeDefinitions<Event>;
  readonly after?:
    | FlowAfterDefinition<State, Context, Event, never>
    | ReadonlyArray<FlowAfterDefinition<State, Context, Event, never>>;
  readonly always?: FlowEventTransitions<Context, Event, State, Event>;
  readonly on?: FlowStateTransitions<Context, Event, State>;
}>;

export type FlowMachineConfig<
  Id extends string = string,
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
  Initial extends State = State,
> = Readonly<{
  readonly id: Id;
  readonly initial: Initial;
  readonly context: () => Context;
  readonly states: Readonly<Record<State, FlowMachineStateNode<Context, Event, State>>>;
}>;

export type FlowMachine<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
  Initial extends State = State,
  Id extends string = string,
  Config extends FlowMachineConfigShape = FlowMachineConfig<Id, Context, Event, State, Initial>,
> = Readonly<{
  readonly kind: "machine";
  readonly id: Id;
  readonly config: Config;
  readonly getInitialSnapshot: () => FlowSnapshot<Context, Initial, Event>;
  readonly __flowMachineFamily?: Readonly<{
    readonly context: Context;
    readonly event: Event;
    readonly state: State;
  }>;
}>;

export type InferMachineConfigContext<Config extends FlowMachineConfigShape> = ReturnType<
  Config["context"]
>;

export type InferMachineConfigState<Config extends FlowMachineConfigShape> = Extract<
  keyof Config["states"],
  string
>;

type ArrayMember<Value> = Value extends ReadonlyArray<infer Member> ? Member : Value;

type ConfigProperty<Value, Key extends PropertyKey> =
  Value extends Readonly<Record<Key, infer Entry>> ? Entry : never;

type ConfiguredMachineTransitions<Config extends FlowMachineConfigShape> =
  Config["states"][keyof Config["states"]] extends infer Node
    ? Node extends unknown
      ?
          | ConfigProperty<ConfigProperty<Node, "on">, keyof ConfigProperty<Node, "on">>
          | ConfigProperty<Node, "always">
      : never
    : never;

type ConfiguredTransactionEvents<Config extends FlowMachineConfigShape> =
  ArrayMember<ConfiguredMachineTransitions<Config>> extends infer Transition
    ? ConfigProperty<Transition, "submit"> extends infer Transaction
      ? Transaction extends {
          readonly __flowTransactionFamily?: Readonly<{ readonly event: infer Event }>;
        }
        ? Event
        : never
      : never
    : never;

type ConfiguredRunEvents<Config extends FlowMachineConfigShape> =
  Config["states"][keyof Config["states"]] extends infer Node
    ? ArrayMember<ConfigProperty<Node, "invoke">> extends infer Invoke
      ? Invoke extends { readonly kind: "run"; readonly transaction: infer Transaction }
        ? Transaction extends {
            readonly __flowTransactionFamily?: Readonly<{ readonly event: infer Event }>;
          }
          ? Event
          : never
        : never
      : never
    : never;

type RouteCallbackEvent<Route> = Route extends (...args: ReadonlyArray<never>) => infer Event
  ? Event extends FlowEvent
    ? string extends Event["type"]
      ? never
      : Event
    : never
  : never;

type ConfiguredStreamEvents<Config extends FlowMachineConfigShape> =
  Config["states"][keyof Config["states"]] extends infer Node
    ? ArrayMember<ConfigProperty<Node, "invoke">> extends infer Invoke
      ? Invoke extends {
          readonly kind: "stream";
          readonly config: { readonly routes?: infer Routes };
        }
        ? Routes extends object
          ? RouteCallbackEvent<Routes[keyof Routes]>
          : never
        : never
      : never
    : never;

type ConfiguredEventTypes<Config extends FlowMachineConfigShape> =
  Config["states"][keyof Config["states"]] extends infer Node
    ? Node extends { readonly on: infer On }
      ? Extract<keyof On, string>
      : never
    : never;

type ConfiguredEvents<Config extends FlowMachineConfigShape> = {
  readonly [Type in ConfiguredEventTypes<Config>]: Readonly<{ readonly type: Type }>;
}[ConfiguredEventTypes<Config>];

type CallbackEvents<Callback> =
  Callback extends ReadonlyArray<infer Member>
    ? CallbackEvents<Member>
    : Callback extends (args: infer Args) => unknown
      ? Args extends { readonly event: infer Event }
        ? Event
        : never
      : never;

type TransitionCallbackEvents<Transition> =
  Transition extends ReadonlyArray<infer Member>
    ? TransitionCallbackEvents<Member>
    : CallbackEvents<
        | ConfigProperty<Transition, "guard">
        | ConfigProperty<Transition, "update">
        | ConfigProperty<Transition, "actions">
      >;

type ConfiguredCallbackEvents<Config extends FlowMachineConfigShape> =
  Config["states"][keyof Config["states"]] extends infer Node
    ?
        | CallbackEvents<ConfigProperty<Node, "entry"> | ConfigProperty<Node, "exit">>
        | TransitionCallbackEvents<ConfiguredMachineTransitions<Config>>
    : never;

type CarriedMachineEvents<Config extends FlowMachineConfigShape> = Extract<
  | ConfiguredTransactionEvents<Config>
  | ConfiguredRunEvents<Config>
  | ConfiguredStreamEvents<Config>
  | ConfiguredCallbackEvents<Config>,
  FlowEvent
>;

export type InferMachineConfigEvent<Config extends FlowMachineConfigShape> = [
  CarriedMachineEvents<Config>,
] extends [never]
  ? ConfiguredEvents<Config>
  : CarriedMachineEvents<Config>;

export type InferMachineConfigInitial<Config extends FlowMachineConfigShape> = Extract<
  Config["initial"],
  InferMachineConfigState<Config>
>;

type FlowConfiguredEventType<Node> = Node extends { readonly on?: infer On }
  ? Extract<keyof NonNullable<On>, string>
  : never;

type FlowStateNodeShape = Readonly<{
  readonly on?: object;
  readonly always?: unknown;
}>;

type FlowEventsByState<
  Event extends FlowEvent,
  States extends Readonly<Partial<Record<string, FlowStateNodeShape>>>,
> = {
  readonly [Key in Extract<keyof States, string>]: Extract<
    Event,
    { readonly type: FlowConfiguredEventType<States[Key]> }
  >;
};

type InferMachineFamily<Machine extends AnyFlowMachine> = Machine extends {
  readonly __flowMachineFamily?: infer Family;
}
  ? NonNullable<Family>
  : never;

export type InferMachineContext<Machine extends AnyFlowMachine> =
  InferMachineFamily<Machine> extends { readonly context: infer Context } ? Context : never;

export type InferMachineEvent<Machine extends AnyFlowMachine> =
  InferMachineFamily<Machine> extends { readonly event: infer Event extends FlowEvent }
    ? Event
    : never;

export type InferMachineState<Machine extends AnyFlowMachine> =
  InferMachineFamily<Machine> extends { readonly state: infer State extends string }
    ? State
    : never;

export type FlowEventForState<
  Event extends FlowEvent,
  States extends Readonly<Partial<Record<string, FlowStateNodeShape>>>,
  State extends string,
> = State extends Extract<keyof States, string> ? FlowEventsByState<Event, States>[State] : never;
