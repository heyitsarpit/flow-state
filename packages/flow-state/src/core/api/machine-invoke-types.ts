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

type FlowMachineStreamRoutes<Event extends FlowEvent> = Readonly<{
  readonly value?: (value: never) => Event;
  readonly done?: () => Event;
  readonly failure?: (error: never) => Event;
  readonly defect?: (cause: never) => Event;
  readonly interrupt?: () => Event;
}>;

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
      keyof FlowMachineRoutedBinding<FlowEvent>
    > &
      Readonly<{
        readonly config: Readonly<{
          readonly routes?: FlowMachineStreamRoutes<MachineEvent>;
        }>;
      }> &
      FlowMachineRoutedBinding<MachineEvent>)
  | FlowChildDefinition
  | FlowEnsureDefinition
  | FlowObserveDefinition
  | FlowRefreshDefinition
  | FlowPatchDefinition
  | FlowInvalidateDefinition<FlowInvalidationTarget>
  | FlowRunDefinition<
      Omit<FlowTransactionBinding<FlowEvent>, keyof FlowMachineRoutedBinding<FlowEvent>> &
        FlowMachineRoutedBinding<MachineEvent>
    >;
