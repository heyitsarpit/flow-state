import type {
  FlowAppDefinition,
  FlowAppInventorySummary,
  FlowInventoryEntry,
  FlowModuleDefinition,
  FlowModuleInventorySummary,
  FlowSeededResource,
  FlowViewByScreenEntry,
} from "../core/api/types.js";
import {
  invalidFlowModuleFixtureDiagnostic,
  unknownFlowModuleFixtureDiagnostic,
} from "../shared/diagnostics.js";
import { fixtureRegistryOf, isSeededResourceArray } from "./validation.js";

const emptyNames = Object.freeze([]) as ReadonlyArray<string>;

function namesFromSection(section: unknown): ReadonlyArray<string> {
  if (
    section === undefined ||
    section === null ||
    typeof section !== "object" ||
    Array.isArray(section)
  ) {
    return emptyNames;
  }

  return Object.freeze(Object.keys(section as Record<string, unknown>));
}

function moduleEntries(
  modules: ReadonlyArray<FlowModuleInventorySummary>,
  selectNames: (module: FlowModuleInventorySummary) => ReadonlyArray<string>,
): ReadonlyArray<FlowInventoryEntry> {
  return Object.freeze(
    modules.flatMap((module) =>
      selectNames(module).map((name) => ({
        module: module.name,
        name,
      })),
    ),
  );
}

function viewScreenEntries(
  modules: ReadonlyArray<FlowModuleInventorySummary>,
): ReadonlyArray<FlowViewByScreenEntry> {
  return Object.freeze(
    modules.flatMap((module) =>
      module.views.flatMap((name) =>
        module.screens.map((screen) => ({
          screen,
          module: module.name,
          name,
        })),
      ),
    ),
  );
}

export function summarizeModule(module: FlowModuleDefinition): FlowModuleInventorySummary {
  return Object.freeze({
    name: module.id,
    resources: namesFromSection((module as Record<string, unknown>).resources),
    transactions: namesFromSection((module as Record<string, unknown>).transactions),
    machines: namesFromSection((module as Record<string, unknown>).machines),
    streams: namesFromSection((module as Record<string, unknown>).streams),
    views: namesFromSection((module as Record<string, unknown>).views),
    policies: namesFromSection((module as Record<string, unknown>).policies),
    dependencies: Object.freeze([...(module.meta.dependencies ?? [])]),
    screens: Object.freeze([...(module.meta.screens ?? [])]),
    fixtures: Object.freeze([...(module.meta.fixtures ?? [])]),
    tags: Object.freeze([...(module.meta.tags ?? [])]),
    permissions: Object.freeze([...(module.meta.permissions ?? [])]),
  });
}

export function summarizeApp(app: FlowAppDefinition): FlowAppInventorySummary {
  const modules = Object.freeze(app.modules.map((module) => summarizeModule(module)));

  return Object.freeze({
    modules,
    resources: moduleEntries(modules, (module) => module.resources),
    transactions: moduleEntries(modules, (module) => module.transactions),
    actors: moduleEntries(modules, (module) => module.machines),
    streams: moduleEntries(modules, (module) => module.streams),
    views: moduleEntries(modules, (module) => module.views),
    viewsByScreen: viewScreenEntries(modules),
    fixtures: moduleEntries(modules, (module) => module.fixtures),
  });
}

export function fixtureResourcesForApp(
  app: FlowAppDefinition,
  fixtureName: string,
): ReadonlyArray<FlowSeededResource> {
  const resources: Array<FlowSeededResource> = [];
  let found = false;

  for (const module of app.modules) {
    const registry = fixtureRegistryOf(module as Readonly<Record<string, unknown>>);
    const fixtureValue = registry?.[fixtureName];
    if (fixtureValue === undefined) {
      continue;
    }

    found = true;
    if (!isSeededResourceArray(fixtureValue)) {
      throw invalidFlowModuleFixtureDiagnostic(module.id, fixtureName);
    }
    resources.push(...fixtureValue);
  }

  if (!found) {
    throw unknownFlowModuleFixtureDiagnostic(fixtureName);
  }

  return Object.freeze(resources);
}
