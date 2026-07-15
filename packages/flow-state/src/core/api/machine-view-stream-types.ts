import type { Stream } from "effect";
import type * as Duration from "effect/Duration";

import type { FlowIssue, FlowReceipt } from "./receipt-types.js";
import type {
  FlowChildSnapshot,
  FlowResourceSnapshot,
  FlowStreamSnapshot,
  FlowTimerSnapshot,
  FlowTransactionSnapshot,
} from "./snapshot-types.js";
import type { FlowEvent } from "./resource-transaction-types.js";
import type { FlowTransitionArgs } from "./machine-core-types.js";

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
  readonly select: (args: {
    readonly context: Context;
    readonly value: State;
    readonly resources: Readonly<Record<string, FlowResourceSnapshot>>;
    readonly transactions: Readonly<Record<string, FlowTransactionSnapshot>>;
    readonly streams: Readonly<Record<string, FlowStreamSnapshot>>;
    readonly timers: Readonly<Record<string, FlowTimerSnapshot>>;
    readonly children: Readonly<Record<string, FlowChildSnapshot>>;
    readonly issues: ReadonlyArray<FlowIssue>;
    readonly receipts: ReadonlyArray<FlowReceipt>;
  }) => Selected;
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
  StateInput extends string = State,
> = Readonly<{
  readonly id: string;
  readonly delay: Duration.Input;
  readonly target?: State;
  readonly guard?: (args: FlowTransitionArgs<Context, Event, StateInput>) => boolean;
  readonly update?: (args: FlowTransitionArgs<Context, Event, StateInput>) => Partial<Context>;
}>;

export type FlowAfterDefinition<
  State extends string = string,
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  StateInput extends string = State,
> = Readonly<{
  readonly kind: "after";
  readonly id: string;
  readonly config: FlowAfterConfig<State, Context, Event, StateInput>;
}>;

export type FlowStreamPressure<Value = unknown> =
  | Readonly<{
      readonly strategy: "queue";
      readonly limit: number;
    }>
  | Readonly<{
      readonly strategy: "coalesce-latest";
      readonly limit: number;
      readonly key: (value: Value) => string;
    }>;

type FlowStreamValueRoute<ValueInput, ValueOutput, Event extends FlowEvent> = [
  ValueOutput,
] extends [never]
  ? never
  : (value: ValueInput) => Event;

type FlowStreamFailureRoute<ErrorInput, ErrorOutput, Event extends FlowEvent> = [
  ErrorOutput,
] extends [never]
  ? never
  : (error: ErrorInput) => Event;

export type FlowStreamRoutes<
  ValueInput,
  ErrorInput,
  Event extends FlowEvent = FlowEvent,
  ValueOutput = ValueInput,
  ErrorOutput = ErrorInput,
> = Readonly<{
  readonly value?: FlowStreamValueRoute<ValueInput, ValueOutput, Event>;
  readonly done?: () => Event;
  readonly failure?: FlowStreamFailureRoute<ErrorInput, ErrorOutput, Event>;
  readonly defect?: (cause: unknown) => Event;
  readonly interrupt?: () => Event;
}>;

export type FlowStreamParamsArgs<Context> = unknown extends Context
  ? Readonly<Record<string, unknown>>
  : [Context] extends [never]
    ? Readonly<{ readonly context: never }>
    : [Context] extends [void]
      ? Readonly<Record<string, unknown>>
      : Readonly<{ readonly context: Context }>;

export type FlowStreamConfig<
  Id extends string = string,
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  Params = void,
  Value = unknown,
  Error = never,
  Requirements = never,
  ParamsInput = Params,
  ValueInput = Value,
  ErrorInput = Error,
  ContextInput = Context,
> = Readonly<{
  readonly id: Id;
  readonly params?: (args: FlowStreamParamsArgs<ContextInput>) => Params;
  readonly subscribe: (args: {
    readonly params: ParamsInput;
  }) => Stream.Stream<Value, Error, Requirements>;
  readonly pressure?: FlowStreamPressure<ValueInput>;
  readonly routes?: FlowStreamRoutes<ValueInput, ErrorInput, Event, Value, Error>;
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
  ParamsInput = Params,
  ValueInput = Value,
  ErrorInput = Error,
  ContextInput = Context,
> = Readonly<{
  readonly kind: "stream";
  readonly id: Id;
  readonly __flowRoutedEventType?: string extends Event["type"] ? never : Event["type"];
  readonly config: FlowStreamConfig<
    Id,
    Context,
    Event,
    Params,
    Value,
    Error,
    Requirements,
    ParamsInput,
    ValueInput,
    ErrorInput,
    ContextInput
  >;
}>;
