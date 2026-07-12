import type {
  FlowModuleDefinition,
  FlowModuleInventory,
  FlowModuleMeta,
  FlowSeededResource,
  FlowTag,
} from "../core/api/types.js";
import {
  duplicateFlowDescriptorIdDiagnostic,
  duplicateFlowModuleIdDiagnostic,
  invalidFlowDescriptorIdDiagnostic,
  invalidFlowModuleIdDiagnostic,
  invalidFlowModuleEntryDiagnostic,
  invalidFlowModuleFixtureDiagnostic,
  invalidFlowModuleInventoryFieldDiagnostic,
  invalidFlowModuleMetaDiagnostic,
  incompatibleFlowTagDefinitionDiagnostic,
  missingFlowModuleFixtureDiagnostic,
  undeclaredFlowModuleFixtureDiagnostic,
} from "../shared/diagnostics.js";

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

type ResourceDescriptorWithConfig = FlowDescriptor &
  Readonly<{
    readonly config: Readonly<{
      readonly tags?: unknown;
    }>;
  }>;

const liveMetaFields = [
  "dependencies",
  "tags",
  "screens",
  "fixtures",
  "permissions",
] as const satisfies ReadonlyArray<keyof FlowModuleMeta>;

const reservedModuleIds = new Set(["__proto__", "prototype", "constructor"]);
const reservedModuleInventoryFields = new Set(["kind", "id", "meta", "inventory"]);
const maxModuleIdLength = 128;

function unsafeIdReason(id: string): string | undefined {
  if (id.length === 0) {
    return "empty";
  }
  if (id.length > maxModuleIdLength) {
    return "oversize";
  }
  if (reservedModuleIds.has(id)) {
    return "reserved";
  }
  for (let index = 0; index < id.length; index += 1) {
    const characterCode = id.charCodeAt(index);
    if (characterCode <= 0x1f || characterCode === 0x7f) {
      return "control-character";
    }
  }
  return undefined;
}

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

function isFlowTag(value: unknown): value is FlowTag {
  return (
    value !== null &&
    typeof value === "object" &&
    "kind" in value &&
    "id" in value &&
    (value as { readonly kind?: unknown }).kind === "tag" &&
    typeof (value as { readonly id?: unknown }).id === "string"
  );
}

function staticResourceTags(descriptor: FlowDescriptor): ReadonlyArray<FlowTag> {
  const tags = (descriptor as ResourceDescriptorWithConfig).config.tags;
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags.filter(isFlowTag);
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
      throw invalidFlowModuleEntryDiagnostic({
        moduleId,
        section: descriptorSection.section,
        entryName,
        kind: descriptorSection.label,
      });
    }

    const descriptor = entryValue as FlowDescriptor;
    const unsafeReason = unsafeIdReason(descriptor.id);
    if (unsafeReason !== undefined) {
      throw invalidFlowDescriptorIdDiagnostic({
        kind: descriptorSection.label,
        descriptorId: descriptor.id,
        reason: unsafeReason,
      });
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

function isStringArray(value: unknown): value is ReadonlyArray<string> {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function validateModuleMeta(moduleId: string, meta: FlowModuleMeta): void {
  for (const field of liveMetaFields) {
    const value = meta[field];
    if (value !== undefined && !isStringArray(value)) {
      throw invalidFlowModuleMetaDiagnostic({
        moduleId,
        field,
      });
    }
  }
}

export function validateModuleId(moduleId: string): void {
  const unsafeReason = unsafeIdReason(moduleId);
  if (unsafeReason !== undefined) {
    throw invalidFlowModuleIdDiagnostic({ moduleId, reason: unsafeReason });
  }
}

function validateModuleInventoryFields(
  moduleId: string,
  members: Readonly<Record<string, unknown>>,
): void {
  for (const field of Object.keys(members)) {
    if (reservedModuleInventoryFields.has(field)) {
      throw invalidFlowModuleInventoryFieldDiagnostic({
        moduleId,
        field,
      });
    }
  }
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
      throw invalidFlowModuleFixtureDiagnostic(moduleId, fixtureName);
    }
    if (!declaredFixtureNames.has(fixtureName)) {
      throw undeclaredFlowModuleFixtureDiagnostic(moduleId, fixtureName);
    }
  }

  for (const fixtureName of declaredFixtures) {
    const fixtureValue = registry?.[fixtureName];
    if (!isSeededResourceArray(fixtureValue)) {
      throw missingFlowModuleFixtureDiagnostic(moduleId, fixtureName);
    }
  }
}

export function validateModuleInventory(
  moduleId: string,
  members: FlowModuleInventory,
  meta: FlowModuleMeta,
): void {
  validateModuleId(moduleId);
  validateModuleInventoryFields(moduleId, members as Readonly<Record<string, unknown>>);
  validateModuleMeta(moduleId, meta);
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
  const schemaTags = new Map<
    string,
    Readonly<{
      readonly moduleId: string;
      readonly schema: unknown;
    }>
  >();

  for (const module of modules) {
    if (seenModuleIds.has(module.id)) {
      throw duplicateFlowModuleIdDiagnostic(module.id);
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
          throw duplicateFlowDescriptorIdDiagnostic({
            kind: descriptorSection.label,
            descriptorId: descriptor.id,
          });
        }
        seenIds.set(descriptor.id, descriptor);

        if (descriptorSection.kind === "resource") {
          for (const tag of staticResourceTags(descriptor)) {
            if (!("schema" in tag)) {
              continue;
            }

            const existingTag = schemaTags.get(tag.id);
            if (existingTag !== undefined && existingTag.schema !== tag.schema) {
              throw incompatibleFlowTagDefinitionDiagnostic({
                tagId: tag.id,
                firstModuleId: existingTag.moduleId,
                nextModuleId: module.id,
              });
            }

            schemaTags.set(tag.id, {
              moduleId: existingTag?.moduleId ?? module.id,
              schema: tag.schema,
            });
          }
        }
      }
    }
  }
}
