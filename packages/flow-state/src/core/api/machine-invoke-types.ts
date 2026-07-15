import type {
  FlowEnsureDefinition,
  FlowEvent,
  FlowInvalidationTarget,
  FlowInvalidateDefinition,
  FlowMachineRoutedBinding,
  FlowObserveDefinition,
  FlowPatchDefinition,
  FlowRefreshDefinition,
  FlowRunDefinition,
  FlowTransactionBinding,
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

export type FlowInvokeDescriptor<MachineEvent extends FlowEvent = FlowEvent> =
  | (Omit<
      FlowStreamDefinition<
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
      >,
      "__flowRoutedEvent"
    > &
      FlowMachineRoutedBinding<MachineEvent>)
  | FlowChildDefinition
  | FlowEnsureDefinition
  | FlowObserveDefinition
  | FlowRefreshDefinition
  | FlowPatchDefinition
  | FlowInvalidateDefinition<FlowInvalidationTarget>
  | FlowRunDefinition<
      Omit<FlowTransactionBinding<FlowEvent>, "__flowRoutedEvent"> &
        FlowMachineRoutedBinding<MachineEvent>
    >;
