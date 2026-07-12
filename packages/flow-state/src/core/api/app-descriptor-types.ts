import type { Layer } from "effect";

import type { FlowRuntimeDefaultServices } from "../runtime/services/runtime-contracts.js";

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
    FlowRuntimeDefaultServices | Layer.Success<Services[number]>,
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
