import type {
  FlowEnsureDefinition,
  FlowEvent,
  FlowInvalidationTarget,
  FlowInvalidateDefinition,
  FlowObserveDefinition,
  FlowPatchDefinition,
  FlowRefreshDefinition,
  FlowRunDefinition,
  FlowTransactionDefinition,
} from "./resource-transaction-types.js";
import type { FlowMachine } from "./machine-core-types.js";
import type { FlowStreamDefinition } from "./machine-view-stream-types.js";

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
  | FlowRunDefinition<AnyFlowTransactionDefinition>;
