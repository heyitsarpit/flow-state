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
import type { AnyFlowMachine, InferMachineContext } from "./machine-core-types.js";
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
  Context = unknown,
> = Readonly<{
  readonly id: string;
  readonly machine: Machine;
  readonly supervision?: "stop-on-failure" | "continue-on-failure";
  readonly input?: (
    args: Readonly<{ readonly context: Context; readonly event?: Event }>,
  ) => InferMachineContext<Machine>;
  readonly routes?: FlowChildRoutes<Event>;
}>;

export type FlowChildDefinition<
  Machine extends AnyFlowMachine = any,
  Event extends FlowEvent = never,
  RoutedEvent extends FlowEvent = Event,
  Context = unknown,
> = Readonly<{
  readonly kind: "child";
  readonly id: string;
  readonly config: FlowChildConfig<Machine, Event, Context>;
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
      FlowChildDefinition<AnyFlowMachine, any, any, any>,
      "config" | keyof FlowMachineRoutedBinding<FlowEvent>
    > &
      Readonly<{
        readonly config: Readonly<{
          readonly id: string;
          readonly machine: AnyFlowMachine;
          readonly supervision?: "stop-on-failure" | "continue-on-failure";
          readonly input?: (args: any) => unknown;
          readonly routes?: any;
        }>;
      }> &
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
