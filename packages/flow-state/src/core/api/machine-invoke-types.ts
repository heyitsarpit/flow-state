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
import type { AnyFlowMachine } from "./machine-core-types.js";
import type { FlowStreamDefinition } from "./machine-view-stream-types.js";

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
  | FlowStreamDefinition<
      unknown,
      unknown,
      unknown,
      FlowEvent,
      unknown,
      string,
      unknown,
      never,
      never,
      never,
      never
    >
  | FlowChildDefinition
  | FlowEnsureDefinition
  | FlowObserveDefinition
  | FlowRefreshDefinition
  | FlowPatchDefinition
  | FlowInvalidateDefinition<FlowInvalidationTarget>
  | FlowRunDefinition<UnknownFlowTransactionDefinition<FlowEvent>>;
