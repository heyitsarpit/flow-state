import type { FlowReceipt } from "./receipt-types.js";
import type {
  FlowChildSnapshot,
  FlowResourceSnapshot,
  FlowStreamSnapshot,
  FlowTimerSnapshot,
  FlowTransactionSnapshot,
} from "./snapshot-types.js";
import type { FlowEvent, FlowTransactionDefinition } from "./resource-transaction-types.js";
import type { FlowInvokeDescriptor } from "./machine-invoke-types.js";
import type { FlowAfterDefinition } from "./machine-view-stream-types.js";

type BivariantCallback<Args, Result> = {
  bivarianceHack(args: Args): Result;
}["bivarianceHack"];

type AnyFlowTransactionDefinition = FlowTransactionDefinition<
  string,
  unknown,
  unknown,
  unknown,
  unknown,
  FlowEvent
>;

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
      readonly states: Readonly<
        Partial<Record<string, FlowMachineStateNode<Context, Event, string>>>
      >;
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

export type FlowActionDefinition<
  Context,
  Event extends FlowEvent,
  State extends string,
> = BivariantCallback<
  FlowTransitionArgs<Context, Event, State>,
  void | FlowReceipt | ReadonlyArray<FlowReceipt>
>;

export type FlowTransitionDefinition<
  Context,
  Event extends FlowEvent,
  State extends string,
> = Readonly<{
  readonly target?: State;
  readonly reenter?: boolean;
  readonly guard?: BivariantCallback<FlowTransitionArgs<Context, Event, State>, boolean>;
  readonly update?: BivariantCallback<FlowTransitionArgs<Context, Event, State>, Partial<Context>>;
  readonly actions?:
    | FlowActionDefinition<Context, Event, State>
    | ReadonlyArray<FlowActionDefinition<Context, Event, State>>;
  readonly submit?: AnyFlowTransactionDefinition;
}>;

export type FlowEventTransitions<Context, Event extends FlowEvent, State extends string> =
  | State
  | FlowTransitionDefinition<Context, Event, State>
  | ReadonlyArray<FlowTransitionDefinition<Context, Event, State>>;

type FlowStateTransitions<Context, Event extends FlowEvent, State extends string> = Readonly<{
  readonly [Type in Event["type"]]?: FlowEventTransitions<
    Context,
    Extract<Event, { readonly type: Type }>,
    State
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
  readonly invoke?: FlowInvokeDescriptor | ReadonlyArray<FlowInvokeDescriptor>;
  readonly after?:
    | FlowAfterDefinition<State, Context, Event>
    | ReadonlyArray<FlowAfterDefinition<State, Context, Event>>;
  readonly always?: FlowEventTransitions<Context, Event, State>;
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
> = Readonly<{
  readonly kind: "machine";
  readonly id: Id;
  readonly config: FlowMachineConfig<Id, Context, Event, State, Initial>;
  readonly getInitialSnapshot: () => FlowSnapshot<Context, Initial, Event>;
}>;

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

export type InferMachineContext<Machine extends FlowMachine> =
  Machine extends FlowMachine<infer Context, infer _Event, infer _State, infer _Initial, infer _Id>
    ? Context
    : never;

export type InferMachineEvent<Machine extends FlowMachine> =
  Machine extends FlowMachine<infer _Context, infer Event, infer _State, infer _Initial, infer _Id>
    ? Event
    : never;

export type InferMachineState<Machine extends FlowMachine> =
  Machine extends FlowMachine<infer _Context, infer _Event, infer State, infer _Initial, infer _Id>
    ? State
    : never;

export type FlowEventForState<
  Event extends FlowEvent,
  States extends Readonly<Partial<Record<string, FlowStateNodeShape>>>,
  State extends string,
> = State extends Extract<keyof States, string> ? FlowEventsByState<Event, States>[State] : never;
