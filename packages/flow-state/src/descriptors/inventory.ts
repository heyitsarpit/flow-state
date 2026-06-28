import type {
  FlowAppDefinition,
  FlowAppInventorySummary,
  FlowInventoryEntry,
  FlowModuleDefinition,
  FlowModuleInventorySummary,
  FlowSeededResource,
  FlowViewByScreenEntry,
} from "../public/types.js";

const emptyNames = Object.freeze([]) as ReadonlyArray<string>;

function namesFromSection(section: unknown): ReadonlyArray<string> {
  if (section === undefined || section === null || typeof section !== "object" || Array.isArray(section)) {
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

function fixtureRegistryOf(module: FlowModuleDefinition): Readonly<Record<string, unknown>> | undefined {
  const fixtures = (module as Record<string, unknown>).fixtures;
  if (fixtures === undefined || fixtures === null || typeof fixtures !== "object" || Array.isArray(fixtures)) {
    return undefined;
  }

  return fixtures as Readonly<Record<string, unknown>>;
}

function isSeededResourceArray(value: unknown): value is ReadonlyArray<FlowSeededResource> {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        "ref" in entry &&
        "value" in entry,
    )
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

  for (const module of app.modules) {
    const registry = fixtureRegistryOf(module);
    const fixtureValue = registry?.[fixtureName];
    if (!isSeededResourceArray(fixtureValue)) {
      continue;
    }

    resources.push(...fixtureValue);
  }

  return Object.freeze(resources);
}
