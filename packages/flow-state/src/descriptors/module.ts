import type {
  FlowModuleDefinition,
  FlowModuleInventory,
  FlowModuleMeta,
} from "../core/api/types.js";
import { summarizeModule } from "./inventory.js";
import { validateModuleInventory } from "./validation.js";

function copyStringArray(
  value: ReadonlyArray<string> | undefined,
): ReadonlyArray<string> | undefined {
  return value === undefined ? undefined : Object.freeze([...value]);
}

function copyModuleMeta<Meta extends FlowModuleMeta>(meta: Meta): Meta {
  return Object.freeze({
    ...meta,
    dependencies: copyStringArray(meta.dependencies),
    tags: copyStringArray(meta.tags),
    screens: copyStringArray(meta.screens),
    fixtures: copyStringArray(meta.fixtures),
    permissions: copyStringArray(meta.permissions),
  }) as Meta;
}

function copyRegistry(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const copied = Object.create(null) as Record<string, unknown>;
  for (const [field, entry] of Object.entries(value)) {
    copied[field] = Array.isArray(entry) ? Object.freeze([...entry]) : entry;
  }
  return Object.freeze(copied);
}

function copyInventory<Inventory extends FlowModuleInventory>(inventory: Inventory): Inventory {
  const copied = Object.create(null) as Record<string, unknown>;
  for (const [field, value] of Object.entries(inventory)) {
    copied[field] =
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? copyRegistry(value as Readonly<Record<string, unknown>>)
        : value;
  }
  return Object.freeze(copied) as Inventory;
}

export function createModuleDefinition<
  const Id extends string,
  const Inventory extends FlowModuleInventory,
  const Meta extends FlowModuleMeta = FlowModuleMeta,
>(
  id: Id,
  inventory: Inventory,
  meta: Meta = {} as Meta,
): FlowModuleDefinition<Id, Inventory, Meta> {
  validateModuleInventory(id, inventory, meta);
  const copiedMeta = copyModuleMeta(meta);
  const copiedInventory = copyInventory(inventory);

  const module = Object.assign(
    {
      kind: "module" as const,
      id,
      meta: copiedMeta,
    },
    copiedInventory,
  ) as FlowModuleDefinition<Id, Inventory, Meta>;
  const summary = summarizeModule(module);

  return Object.freeze(
    Object.assign(module, {
      inventory: () => summary,
    }),
  );
}
