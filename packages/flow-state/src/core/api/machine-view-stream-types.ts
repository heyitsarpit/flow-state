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

type BivariantCallback<Args, Result> = {
  bivarianceHack(args: Args): Result;
}["bivarianceHack"];

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

export type FlowStreamPressure<Value = unknown> =
  | Readonly<{
      readonly strategy: "queue";
      readonly limit: number;
    }>
  | Readonly<{
      readonly strategy: "coalesce-latest";
      readonly key: (value: Value) => string;
    }>;

type FlowStreamValueRoute<Value, Event extends FlowEvent> = [Value] extends [never]
  ? never
  : (value: Value) => Event;

type FlowStreamFailureRoute<Error, Event extends FlowEvent> = [Error] extends [never]
  ? never
  : (error: Error) => Event;

export type FlowStreamRoutes<Value, Error, Event extends FlowEvent = FlowEvent> = Readonly<{
  readonly value?: FlowStreamValueRoute<Value, Event>;
  readonly done?: () => Event;
  readonly failure?: FlowStreamFailureRoute<Error, Event>;
  readonly defect?: BivariantCallback<unknown, Event>;
  readonly interrupt?: () => Event;
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
  readonly pressure?: FlowStreamPressure<Value>;
  readonly routes?: FlowStreamRoutes<Value, Error, Event>;
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
