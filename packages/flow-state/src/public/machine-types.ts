import type { Stream } from "effect";
import type * as Duration from "effect/Duration";

import type {
  FlowChildSnapshot,
  FlowEvent,
  FlowInvalidationTarget,
  FlowIssue,
  FlowReceipt,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowStreamSnapshot,
  FlowTimerSnapshot,
  FlowTransactionDefinition,
  FlowTransactionSnapshot,
} from "./data-types.js";

type BivariantCallback<Args, Result> = {
  bivarianceHack(args: Args): Result;
}["bivarianceHack"];

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

export type FlowViewSource =
  | "context"
  | "resources"
  | "transactions"
  | "streams"
  | "timers"
  | "children"
  | "issues"
  | "receipts";

export type FlowViewConfig<
  Id extends string = string,
  Context = unknown,
  State extends string = string,
  Selected = unknown,
> = Readonly<{
  readonly id: Id;
  readonly sources: ReadonlyArray<FlowViewSource>;
  readonly select: BivariantCallback<
    {
      readonly context: Context;
      readonly value: State;
      readonly resources: Readonly<Record<string, FlowResourceSnapshot>>;
      readonly transactions: Readonly<Record<string, FlowTransactionSnapshot>>;
      readonly streams: Readonly<Record<string, FlowStreamSnapshot>>;
      readonly timers: Readonly<Record<string, FlowTimerSnapshot>>;
      readonly children: Readonly<Record<string, FlowChildSnapshot>>;
      readonly issues: ReadonlyArray<FlowIssue>;
      readonly receipts: ReadonlyArray<FlowReceipt>;
    },
    Selected
  >;
}>;

export type FlowViewDefinition<
  Context = unknown,
  State extends string = string,
  Selected = unknown,
  Id extends string = string,
> = Readonly<{
  readonly kind: "view";
  readonly id: Id;
  readonly config: FlowViewConfig<Id, Context, State, Selected>;
}>;

export type FlowAfterConfig<
  State extends string = string,
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
> = Readonly<{
  readonly id: string;
  readonly delay: Duration.Input;
  readonly target?: State;
  readonly guard?: BivariantCallback<FlowTransitionArgs<Context, Event, State>, boolean>;
  readonly update?: BivariantCallback<FlowTransitionArgs<Context, Event, State>, Partial<Context>>;
}>;

export type FlowAfterDefinition<
  State extends string = string,
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
> = Readonly<{
  readonly kind: "after";
  readonly id: string;
  readonly config: FlowAfterConfig<State, Context, Event>;
}>;

export type FlowStreamPressure =
  | Readonly<{
      readonly strategy: "queue";
      readonly limit?: number;
    }>
  | Readonly<{
      readonly strategy: "coalesce-latest";
      readonly key: BivariantCallback<unknown, string>;
    }>;

export type FlowStreamConfig<
  Id extends string = string,
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  Params = void,
  Value = unknown,
  Error = never,
  Requirements = never,
> = Readonly<{
  readonly id: Id;
  readonly params?: BivariantCallback<Record<string, unknown>, Params>;
  readonly subscribe: BivariantCallback<
    { readonly params: Params },
    Stream.Stream<Value, Error, Requirements>
  >;
  readonly pressure?: FlowStreamPressure;
  readonly routes?: Readonly<{
    readonly value?: BivariantCallback<Value, Event>;
    readonly done?: () => Event;
    readonly failure?: BivariantCallback<Error, Event>;
    readonly defect?: BivariantCallback<unknown, Event>;
    readonly interrupt?: () => Event;
  }>;
  readonly context?: Context;
}>;

export type FlowStreamDefinition<
  Value = unknown,
  Error = never,
  Params = void,
  Event extends FlowEvent = FlowEvent,
  Context = unknown,
  Id extends string = string,
  Requirements = never,
> = Readonly<{
  readonly kind: "stream";
  readonly id: Id;
  readonly config: FlowStreamConfig<Id, Context, Event, Params, Value, Error, Requirements>;
}>;

type AnyFlowStreamDefinition = FlowStreamDefinition<
  unknown,
  unknown,
  unknown,
  FlowEvent,
  unknown,
  string,
  unknown
>;
type AnyFlowTransactionDefinition = FlowTransactionDefinition<
  string,
  unknown,
  unknown,
  unknown,
  unknown,
  FlowEvent
>;

export type FlowChildConfig<Machine extends FlowMachine = FlowMachine> = Readonly<{
  readonly id: string;
  readonly machine: Machine;
  readonly supervision?: "stop-on-failure" | "continue-on-failure";
}>;

export type FlowChildDefinition<Machine extends FlowMachine = FlowMachine> = Readonly<{
  readonly kind: "child";
  readonly id: string;
  readonly config: FlowChildConfig<Machine>;
}>;

export type FlowInvokeDescriptor =
  | AnyFlowStreamDefinition
  | FlowChildDefinition
  | Readonly<{ readonly kind: "ensure"; readonly ref: FlowResourceRef }>
  | Readonly<{ readonly kind: "observe"; readonly ref: FlowResourceRef }>
  | Readonly<{ readonly kind: "refresh"; readonly ref: FlowResourceRef }>
  | Readonly<{ readonly kind: "patch"; readonly ref: FlowResourceRef; readonly patch: unknown }>
  | Readonly<{ readonly kind: "invalidate"; readonly target: FlowInvalidationTarget }>
  | Readonly<{
      readonly kind: "run";
      readonly transaction: AnyFlowTransactionDefinition;
    }>;

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
  Machine extends FlowMachine<infer Context, any, any, any, any> ? Context : never;

export type InferMachineEvent<Machine extends FlowMachine> =
  Machine extends FlowMachine<any, infer Event, any, any, any> ? Event : never;

export type InferMachineState<Machine extends FlowMachine> =
  Machine extends FlowMachine<any, any, infer State, any, any> ? State : never;

export type FlowEventForState<
  Event extends FlowEvent,
  States extends Readonly<Partial<Record<string, FlowStateNodeShape>>>,
  State extends string,
> = State extends Extract<keyof States, string> ? FlowEventsByState<Event, States>[State] : never;
