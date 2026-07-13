import type {
  FlowEnsureDefinition,
  FlowEvent,
  FlowInvalidationTarget,
  FlowInvalidateDefinition,
  FlowObserveDefinition,
  FlowPatchDefinition,
  FlowRefreshDefinition,
  FlowRunDefinition,
  UnknownFlowTransactionDefinition,
} from "./resource-transaction-types.js";
import type { FlowMachine } from "./machine-core-types.js";
import type { Stream } from "effect";

type AnyFlowStreamDefinition = Readonly<{
  readonly kind: "stream";
  readonly id: string;
  readonly config: Readonly<{
    readonly id: string;
    readonly params?: (args: Record<string, unknown>) => unknown;
    readonly subscribe: (args: {
      readonly params: never;
    }) => Stream.Stream<unknown, unknown, unknown>;
    readonly pressure?:
      | Readonly<{
          readonly strategy: "queue";
          readonly limit: number;
        }>
      | Readonly<{
          readonly strategy: "coalesce-latest";
          readonly key: (value: never) => string;
        }>;
    readonly routes?: Readonly<{
      readonly value?: (value: never) => FlowEvent;
      readonly done?: () => FlowEvent;
      readonly failure?: (error: never) => FlowEvent;
      readonly defect?: (cause: unknown) => FlowEvent;
      readonly interrupt?: () => FlowEvent;
    }>;
    readonly context?: unknown;
  }>;
}>;
export type AnyFlowMachine = FlowMachine<any, any, any, any, any>;

export type FlowChildConfig<Machine extends AnyFlowMachine = AnyFlowMachine> = Readonly<{
  readonly id: string;
  readonly machine: Machine;
  readonly supervision?: "stop-on-failure" | "continue-on-failure";
}>;

export type FlowChildDefinition<Machine extends AnyFlowMachine = AnyFlowMachine> = Readonly<{
  readonly kind: "child";
  readonly id: string;
  readonly config: FlowChildConfig<Machine>;
}>;

export type FlowInvokeDescriptor =
  | AnyFlowStreamDefinition
  | FlowChildDefinition
  | FlowEnsureDefinition
  | FlowObserveDefinition
  | FlowRefreshDefinition
  | FlowPatchDefinition
  | FlowInvalidateDefinition<FlowInvalidationTarget>
  | FlowRunDefinition<UnknownFlowTransactionDefinition<FlowEvent>>;
