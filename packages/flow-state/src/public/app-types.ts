import type { Effect, Exit, Layer, ManagedRuntime } from "effect";

import type { SelectionSource } from "../shared/contracts.js";
import type { HostSignals } from "../core/runtime/services/host-signals.js";
import type { InspectionLog } from "../core/runtime/services/inspection.js";
import type { NotificationScheduler } from "../core/runtime/services/notification-scheduler.js";
import type { OrchestratorSystem } from "../core/orchestrator/orchestrator-system.js";
import type { ResourceStore } from "../core/runtime/services/resource-store.js";
import type { TraceLog } from "../core/runtime/services/trace.js";
import type {
  FlowRuntimeInspection,
  FlowTraceOutcomeKind,
  FlowTraceOutcomeSource,
} from "./inspect-types.js";
import type {
  FlowActorSnapshotTree,
  FlowChildSnapshot,
  FlowEvent,
  FlowIssue,
  FlowIssueSummary,
  FlowReceipt,
  FlowResourceHydrationEntry,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowRuntimeBootActorSnapshot,
  FlowSeededResource,
} from "../core/api/data-types.js";
import type {
  FlowMachine,
  FlowSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../core/api/machine-types.js";

export type FlowModuleInventory = Readonly<Record<string, unknown>>;

export type FlowModuleMeta = Readonly<{
  readonly dependencies?: ReadonlyArray<string>;
  readonly tags?: ReadonlyArray<string>;
  readonly screens?: ReadonlyArray<string>;
  readonly fixtures?: ReadonlyArray<string>;
  readonly permissions?: ReadonlyArray<string>;
}>;

export type FlowInventoryEntry = Readonly<{
  readonly module: string;
  readonly name: string;
}>;

export type FlowViewByScreenEntry = FlowInventoryEntry &
  Readonly<{
    readonly screen: string;
  }>;

export type FlowModuleInventorySummary = Readonly<{
  readonly name: string;
  readonly resources: ReadonlyArray<string>;
  readonly transactions: ReadonlyArray<string>;
  readonly machines: ReadonlyArray<string>;
  readonly streams: ReadonlyArray<string>;
  readonly views: ReadonlyArray<string>;
  readonly policies: ReadonlyArray<string>;
  readonly dependencies: ReadonlyArray<string>;
  readonly screens: ReadonlyArray<string>;
  readonly fixtures: ReadonlyArray<string>;
  readonly tags: ReadonlyArray<string>;
  readonly permissions: ReadonlyArray<string>;
}>;

export type FlowAppInventorySummary = Readonly<{
  readonly modules: ReadonlyArray<FlowModuleInventorySummary>;
  readonly resources: ReadonlyArray<FlowInventoryEntry>;
  readonly transactions: ReadonlyArray<FlowInventoryEntry>;
  readonly actors: ReadonlyArray<FlowInventoryEntry>;
  readonly streams: ReadonlyArray<FlowInventoryEntry>;
  readonly views: ReadonlyArray<FlowInventoryEntry>;
  readonly viewsByScreen: ReadonlyArray<FlowViewByScreenEntry>;
  readonly fixtures: ReadonlyArray<FlowInventoryEntry>;
}>;

export type FlowModuleDefinition<
  Id extends string = string,
  Inventory extends FlowModuleInventory = FlowModuleInventory,
  Meta extends FlowModuleMeta = FlowModuleMeta,
> = Readonly<{
  readonly kind: "module";
  readonly id: Id;
  readonly inventory: () => FlowModuleInventorySummary;
  readonly meta: Meta;
}> &
  Inventory;

export type FlowModuleMap<
  Modules extends ReadonlyArray<FlowModuleDefinition> = ReadonlyArray<FlowModuleDefinition>,
> = Readonly<{
  readonly [Module in Modules[number] as Module["id"]]: Module;
}>;

export type FlowStoreDescriptor = Readonly<{
  readonly kind: "store";
  readonly mode: "memory" | "test";
}>;

export type FlowOrchestratorDescriptor = Readonly<{
  readonly kind: "orchestrators";
  readonly mode: "live" | "test";
}>;

export type FlowAppLayerConfig<
  Services extends ReadonlyArray<Layer.Any> = ReadonlyArray<Layer.Any>,
> = Readonly<{
  readonly store: FlowStoreDescriptor;
  readonly orchestrators: FlowOrchestratorDescriptor;
  readonly services?: Services;
}>;

export type FlowAppDefinition<
  Modules extends ReadonlyArray<FlowModuleDefinition> = ReadonlyArray<FlowModuleDefinition>,
> = Readonly<{
  readonly kind: "app";
  readonly id: string;
  readonly modules: Modules;
  readonly moduleMap: FlowModuleMap<Modules>;
  readonly inventory: () => FlowAppInventorySummary;
  readonly layer: <Services extends ReadonlyArray<Layer.Any> = readonly []>(
    config: FlowAppLayerConfig<Services>,
  ) => Layer.Layer<
    | NotificationScheduler
    | ResourceStore
    | OrchestratorSystem
    | HostSignals
    | InspectionLog
    | TraceLog
    | Layer.Success<Services[number]>,
    Layer.Error<Services[number]>,
    Layer.Services<Services[number]>
  >;
}>;

export type FlowAppFixtureName<App extends FlowAppDefinition> = Extract<
  App["modules"][number] extends infer Module
    ? Module extends Readonly<{ readonly meta: Readonly<{ readonly fixtures?: infer Fixtures }> }>
      ? Fixtures extends ReadonlyArray<infer Name>
        ? Name
        : never
      : never
    : never,
  string
>;

export type FlowActor<
  Context = unknown,
  Event extends FlowEvent = FlowEvent,
  State extends string = string,
> = SelectionSource<FlowSnapshot<Context, State, Event>> &
  Readonly<{
    readonly id: string;
    readonly machine: FlowMachine<Context, Event, State>;
    readonly send: (event: Event) => FlowActor<Context, Event, State>;
    readonly snapshot: () => FlowSnapshot<Context, State, Event>;
    readonly getSnapshot: () => FlowSnapshot<Context, State, Event>;
    readonly flush: () => Promise<void>;
    readonly children: () => Readonly<Record<string, FlowChildSnapshot>>;
    readonly receipts: () => ReadonlyArray<FlowReceipt>;
    readonly issues: () => ReadonlyArray<FlowIssue>;
    readonly serialize: () => FlowActorSnapshotTree;
    readonly retryChild: (id: string) => boolean;
    readonly retryTransaction: (id: string) => boolean;
    readonly resetTransaction: (id: string) => boolean;
    readonly dispose: () => Promise<void>;
  }>;

type InferResourceRefValue<Ref extends FlowResourceRef> =
  Ref extends FlowResourceRef<string, ReadonlyArray<unknown>, infer Value> ? Value : never;

export type FlowRuntimeResources = Readonly<{
  readonly seedResources: (resources: ReadonlyArray<FlowSeededResource>) => void;
  readonly hydrate: (entries: ReadonlyArray<FlowResourceHydrationEntry>) => void;
  readonly dehydrate: () => ReadonlyArray<FlowResourceHydrationEntry>;
  readonly inspect: () => ReadonlyArray<FlowResourceSnapshot>;
  readonly subscribe: <Ref extends FlowResourceRef>(
    ref: Ref,
    listener: (snapshot: FlowResourceSnapshot<InferResourceRefValue<Ref>>) => void,
  ) => () => void;
  readonly patch: (
    ref: FlowResourceRef,
    updater: (current: Record<string, unknown>) => Record<string, unknown>,
  ) => void;
  readonly get: <Ref extends FlowResourceRef>(
    ref: Ref,
  ) => FlowResourceSnapshot<InferResourceRefValue<Ref>> | null;
}>;

export type FlowRuntimeBootOptions = Readonly<{
  readonly actors?: ReadonlyArray<FlowActor<any, any, any>>;
}>;

export type FlowRuntimeBootPayload = Readonly<{
  readonly version: "flow-state/runtime-boot.v1";
  readonly resources: ReadonlyArray<FlowResourceHydrationEntry>;
  readonly actors: ReadonlyArray<FlowRuntimeBootActorSnapshot>;
}>;

export type FlowRuntimeHydratedBoot = Readonly<{
  readonly payload: FlowRuntimeBootPayload;
  readonly actors: Readonly<Record<string, FlowActorSnapshotTree>>;
  readonly actorSnapshot: (id: string) => FlowActorSnapshotTree | undefined;
}>;

export type FlowActorStartOptions<Machine extends FlowMachine = FlowMachine> = Readonly<{
  readonly id?: string;
  readonly policy?: string;
  readonly snapshot?:
    | FlowSnapshot<
        InferMachineContext<Machine>,
        InferMachineState<Machine>,
        InferMachineEvent<Machine>
      >
    | FlowActorSnapshotTree
    | undefined;
}>;

export type FlowRuntimeOrchestrators = Readonly<{
  readonly start: <Machine extends FlowMachine>(
    machine: Machine,
    options?: FlowActorStartOptions<Machine>,
  ) => FlowActor<
    InferMachineContext<Machine>,
    InferMachineEvent<Machine>,
    InferMachineState<Machine>
  >;
  readonly get: (id: string) => FlowActor | null;
  readonly stop: (id: string) => Promise<void>;
}>;

export type FlowRuntime<RuntimeServices = never, LayerError = never> = Readonly<{
  readonly kind: "runtime";
  readonly managedRuntime: ManagedRuntime.ManagedRuntime<RuntimeServices, LayerError>;
  readonly resources: FlowRuntimeResources;
  readonly inspection: FlowRuntimeInspection;
  readonly orchestrators: FlowRuntimeOrchestrators;
  readonly runPromise: <A, E>(
    effect: Effect.Effect<A, E, RuntimeServices>,
    options?: Effect.RunOptions,
  ) => Promise<A>;
  readonly runPromiseExit: <A, E>(
    effect: Effect.Effect<A, E, RuntimeServices>,
    options?: Effect.RunOptions,
  ) => Promise<Exit.Exit<A, LayerError | E>>;
  readonly dehydrateBoot: (options?: FlowRuntimeBootOptions) => FlowRuntimeBootPayload;
  readonly hydrateBoot: (payload: FlowRuntimeBootPayload) => FlowRuntimeHydratedBoot;
  readonly dispose: () => Promise<void>;
  readonly createActor: <Machine extends FlowMachine>(
    machine: Machine,
    options?: FlowActorStartOptions<Machine>,
  ) => FlowActor<
    InferMachineContext<Machine>,
    InferMachineEvent<Machine>,
    InferMachineState<Machine>
  >;
}>;

export type FlowStoryExpectedFacts = Readonly<{
  readonly receiptTypes?: ReadonlyArray<string>;
  readonly relatedIds?: ReadonlyArray<string>;
  readonly issueKinds?: ReadonlyArray<FlowIssueSummary["kind"]>;
  readonly issueSources?: ReadonlyArray<FlowIssueSummary["source"]>;
  readonly outcomeKinds?: ReadonlyArray<FlowTraceOutcomeKind>;
  readonly outcomeSources?: ReadonlyArray<FlowTraceOutcomeSource>;
}>;

export type FlowStorySeed<FixtureName extends string = string> = Readonly<{
  readonly resources?: ReadonlyArray<FlowSeededResource>;
  readonly fixtures?: ReadonlyArray<FixtureName>;
  readonly boot?: FlowRuntimeBootPayload;
  readonly actorId?: string;
}>;

export type FlowStorySetup = Readonly<{
  readonly kind: "setup";
  readonly description: string;
}>;

export type FlowStoryStart<Machine extends FlowMachine = FlowMachine> =
  | Readonly<{
      readonly kind: "snapshot";
      readonly snapshot: FlowSnapshot<
        InferMachineContext<Machine>,
        string,
        InferMachineEvent<Machine>
      >;
    }>
  | FlowStorySetup;

export type FlowStory<
  Machine extends FlowMachine = FlowMachine,
  FixtureName extends string = string,
> = Readonly<{
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly seed?: FlowStorySeed<FixtureName>;
  readonly start?: FlowStoryStart<Machine>;
  readonly events: ReadonlyArray<InferMachineEvent<Machine>>;
  readonly expectedState?: InferMachineState<Machine>;
  readonly expectedFacts?: FlowStoryExpectedFacts;
  readonly tags?: ReadonlyArray<string>;
}>;
