import { Layer } from "effect";

import type { FlowAppDefinition, FlowModuleDefinition } from "../public/types.js";

function toModuleMap<Modules extends ReadonlyArray<FlowModuleDefinition>>(
  modules: Modules,
): Record<Modules[number]["id"], Modules[number]> {
  const moduleMap = {} as Record<Modules[number]["id"], Modules[number]>;
  for (const module of modules) {
    moduleMap[module.id as Modules[number]["id"]] = module;
  }
  return moduleMap;
}

function validateModules(modules: ReadonlyArray<FlowModuleDefinition>): void {
  const seen = new Set<string>();
  for (const module of modules) {
    if (seen.has(module.id)) {
      throw new Error(`Duplicate flow module id: ${module.id}`);
    }
    seen.add(module.id);
  }
}

export function createAppDefinition<const Modules extends ReadonlyArray<FlowModuleDefinition>>(
  config: Readonly<{
    readonly modules: Modules;
  }>,
): FlowAppDefinition<Modules> {
  validateModules(config.modules);

  const id = config.modules.map((module) => module.id).join("+") || "app";
  const moduleMap = Object.freeze(toModuleMap(config.modules));

  return Object.freeze({
    kind: "app",
    id,
    modules: config.modules,
    moduleMap,
    layer: (_layerConfig) => Layer.empty,
  });
}
