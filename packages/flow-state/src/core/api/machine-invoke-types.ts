import type {
  FlowEnsureDefinition,
  FlowEvent,
  FlowInvalidationTarget,
  FlowInvalidateDefinition,
  FlowMachineRoutedBinding,
  FlowObserveDefinition,
  FlowOutcomeRoutes,
  FlowPatchDefinition,
  FlowRefreshDefinition,
  FlowRunDefinition,
  FlowSelectedResourceQueryDefinition,
  FlowTransactionBinding,
} from "./resource-transaction-types.js";
import type { AnyFlowMachine } from "./machine-core-types.js";
import type { FlowStreamDefinition } from "./machine-view-stream-types.js";
import type { FlowIssue } from "./receipt-types.js";
import type { FlowActorSnapshotTree } from "./snapshot-types.js";

type FlowMachineStreamRoutes<Event extends FlowEvent> = Readonly<{
  readonly value?: (value: never) => Event;
  readonly done?: () => Event;
  readonly failure?: (error: never) => Event;
  readonly defect?: (cause: never) => Event;
  readonly interrupt?: () => Event;
}>;

export type FlowChildRoutes<Event extends FlowEvent> = FlowOutcomeRoutes<
  FlowActorSnapshotTree,
  FlowIssue,
  Event
>;

export type FlowChildConfig<
  Machine extends AnyFlowMachine = any,
  Event extends FlowEvent = never,
> = Readonly<{
  readonly id: string;
  readonly machine: Machine;
  readonly supervision?: "stop-on-failure" | "continue-on-failure";
  readonly routes?: FlowChildRoutes<Event>;
}>;

export type FlowChildDefinition<
  Machine extends AnyFlowMachine = any,
  Event extends FlowEvent = never,
  RoutedEvent extends FlowEvent = Event,
> = Readonly<{
  readonly kind: "child";
  readonly id: string;
  readonly config: FlowChildConfig<Machine, Event>;
}> &
  FlowMachineRoutedBinding<RoutedEvent>;

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
  | (Omit<
      FlowChildDefinition<AnyFlowMachine, any, any>,
      "config" | keyof FlowMachineRoutedBinding<FlowEvent>
    > &
      Readonly<{ readonly config: any }> &
      FlowMachineRoutedBinding<MachineEvent>)
  | FlowEnsureDefinition
  | FlowObserveDefinition
  | FlowRefreshDefinition
  | (Omit<
      FlowSelectedResourceQueryDefinition<"ensure" | "observe" | "refresh", any, any, any, any>,
      "config" | keyof FlowMachineRoutedBinding<FlowEvent>
    > &
      Readonly<{ readonly config: any }> &
      FlowMachineRoutedBinding<MachineEvent>)
  | FlowPatchDefinition
  | FlowInvalidateDefinition<FlowInvalidationTarget>
  | FlowRunDefinition<
      Omit<FlowTransactionBinding<FlowEvent>, keyof FlowMachineRoutedBinding<FlowEvent>> &
        FlowMachineRoutedBinding<MachineEvent>
    >;
