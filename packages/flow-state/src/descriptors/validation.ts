import type {
  FlowModuleDefinition,
  FlowModuleInventory,
  FlowModuleMeta,
  FlowSeededResource,
} from "../public/types.js";

type FlowDescriptorKind = "resource" | "transaction" | "machine" | "stream" | "view";
type FlowModuleSectionName = "resources" | "transactions" | "machines" | "streams" | "views";

type FlowDescriptorSection = Readonly<{
  readonly section: FlowModuleSectionName;
  readonly kind: FlowDescriptorKind;
  readonly label: string;
  readonly isDefinition: (value: unknown) => boolean;
}>;

const descriptorSections = [
  {
    section: "resources",
    kind: "resource",
    label: "resource",
    isDefinition: (value) => isResourceDefinition(value),
  },
  {
    section: "transactions",
    kind: "transaction",
    label: "transaction",
    isDefinition: (value) => isTransactionDefinition(value),
  },
  {
    section: "machines",
    kind: "machine",
    label: "machine",
    isDefinition: (value) => isMachineDefinition(value),
  },
  {
    section: "streams",
    kind: "stream",
    label: "stream",
    isDefinition: (value) => isStreamDefinition(value),
  },
  {
    section: "views",
    kind: "view",
    label: "view",
    isDefinition: (value) => isViewDefinition(value),
  },
] as const satisfies ReadonlyArray<FlowDescriptorSection>;

const appGlobalDescriptorSections = [descriptorSections[0]] as const;

type FlowDescriptor = Readonly<{
  readonly kind: FlowDescriptorKind;
  readonly id: string;
}>;

function isDescriptor(value: unknown): value is FlowDescriptor {
  return (
    value !== null &&
    typeof value === "object" &&
    "kind" in value &&
    "id" in value &&
    typeof (value as { readonly kind?: unknown }).kind === "string" &&
    typeof (value as { readonly id?: unknown }).id === "string"
  );
}

function hasConfig(
  value: unknown,
): value is Readonly<{ readonly config: Readonly<Record<string, unknown>> }> {
  return (
    value !== null &&
    typeof value === "object" &&
    "config" in value &&
    (value as { readonly config?: unknown }).config !== null &&
    typeof (value as { readonly config?: unknown }).config === "object"
  );
}

function isResourceDefinition(value: unknown): value is FlowDescriptor {
  return (
    isDescriptor(value) &&
    value.kind === "resource" &&
    hasConfig(value) &&
    "ref" in value &&
    typeof (value as { readonly ref?: unknown }).ref === "function"
  );
}

function isTransactionDefinition(value: unknown): value is FlowDescriptor {
  return isDescriptor(value) && value.kind === "transaction" && hasConfig(value);
}

function isMachineDefinition(value: unknown): value is FlowDescriptor {
  return (
    isDescriptor(value) &&
    value.kind === "machine" &&
    hasConfig(value) &&
    "getInitialSnapshot" in value &&
    typeof (value as { readonly getInitialSnapshot?: unknown }).getInitialSnapshot === "function"
  );
}

function isStreamDefinition(value: unknown): value is FlowDescriptor {
  return isDescriptor(value) && value.kind === "stream" && hasConfig(value);
}

function isViewDefinition(value: unknown): value is FlowDescriptor {
  return isDescriptor(value) && value.kind === "view" && hasConfig(value);
}

function isResourceRef(value: unknown): value is Readonly<{
  readonly kind: "resourceRef";
  readonly id: string;
  readonly params: ReadonlyArray<unknown>;
  readonly key: ReadonlyArray<unknown>;
}> {
  return (
    value !== null &&
    typeof value === "object" &&
    "kind" in value &&
    "id" in value &&
    "params" in value &&
    "key" in value &&
    (value as { readonly kind?: unknown }).kind === "resourceRef" &&
    typeof (value as { readonly id?: unknown }).id === "string" &&
    Array.isArray((value as { readonly params?: unknown }).params) &&
    Array.isArray((value as { readonly key?: unknown }).key)
  );
}

function registrySectionOf(
  source: Readonly<Record<string, unknown>>,
  section: FlowModuleSectionName | "fixtures",
): Readonly<Record<string, unknown>> | undefined {
  const value = source[section];
  if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Readonly<Record<string, unknown>>;
}

function validateDescriptorSection(
  moduleId: string,
  members: Readonly<Record<string, unknown>>,
  descriptorSection: FlowDescriptorSection,
): void {
  const registry = registrySectionOf(members, descriptorSection.section);
  if (registry === undefined) {
    return;
  }

  for (const [entryName, entryValue] of Object.entries(registry)) {
    if (!descriptorSection.isDefinition(entryValue)) {
      throw new Error(
        `Invalid flow module ${descriptorSection.label} entry: ${moduleId}.${descriptorSection.section}.${entryName}`,
      );
    }
  }
}

export function fixtureRegistryOf(
  source: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | undefined {
  return registrySectionOf(source, "fixtures");
}

export function isSeededResourceArray(value: unknown): value is ReadonlyArray<FlowSeededResource> {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        "ref" in entry &&
        "value" in entry &&
        isResourceRef((entry as { readonly ref?: unknown }).ref),
    )
  );
}

function validateFixtureRegistry(
  moduleId: string,
  members: Readonly<Record<string, unknown>>,
  meta: FlowModuleMeta,
): void {
  const registry = fixtureRegistryOf(members);
  if (registry === undefined) {
    return;
  }

  const declaredFixtures = meta.fixtures ?? [];
  const declaredFixtureNames = new Set(declaredFixtures);

  for (const [fixtureName, fixtureValue] of Object.entries(registry ?? {})) {
    if (!isSeededResourceArray(fixtureValue)) {
      throw new Error(`Invalid flow module fixture: ${moduleId}.fixtures.${fixtureName}`);
    }
    if (!declaredFixtureNames.has(fixtureName)) {
      throw new Error(`Undeclared flow module fixture: ${moduleId}.fixtures.${fixtureName}`);
    }
  }

  for (const fixtureName of declaredFixtures) {
    const fixtureValue = registry?.[fixtureName];
    if (!isSeededResourceArray(fixtureValue)) {
      throw new Error(`Missing flow module fixture: ${moduleId}.fixtures.${fixtureName}`);
    }
  }
}

export function validateModuleInventory(
  moduleId: string,
  members: FlowModuleInventory,
  meta: FlowModuleMeta,
): void {
  const recordMembers = members as Readonly<Record<string, unknown>>;
  for (const descriptorSection of descriptorSections) {
    validateDescriptorSection(moduleId, recordMembers, descriptorSection);
  }
  validateFixtureRegistry(moduleId, recordMembers, meta);
}

export function validateAppModules(modules: ReadonlyArray<FlowModuleDefinition>): void {
  const seenModuleIds = new Set<string>();
  const seenDescriptorIds = new Map<FlowDescriptorKind, Map<string, FlowDescriptor>>(
    appGlobalDescriptorSections.map((section) => [section.kind, new Map<string, FlowDescriptor>()]),
  );

  for (const module of modules) {
    if (seenModuleIds.has(module.id)) {
      throw new Error(`Duplicate flow module id: ${module.id}`);
    }
    seenModuleIds.add(module.id);

    const moduleRecord = module as Readonly<Record<string, unknown>>;
    for (const descriptorSection of appGlobalDescriptorSections) {
      const registry = registrySectionOf(moduleRecord, descriptorSection.section);
      if (registry === undefined) {
        continue;
      }

      for (const descriptor of Object.values(registry)) {
        if (!descriptorSection.isDefinition(descriptor)) {
          continue;
        }

        const seenIds = seenDescriptorIds.get(descriptorSection.kind)!;
        const existingDescriptor = seenIds.get(descriptor.id);
        if (existingDescriptor !== undefined && existingDescriptor !== descriptor) {
          throw new Error(`Duplicate flow ${descriptorSection.label} id: ${descriptor.id}`);
        }
        seenIds.set(descriptor.id, descriptor);
      }
    }
  }
}
