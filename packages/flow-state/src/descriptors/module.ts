import type { FlowModuleDefinition, FlowModuleInventory, FlowModuleMeta } from "../public/types.js";
import { summarizeModule } from "./inventory.js";
import { validateModuleInventory } from "./validation.js";

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

  const module = Object.assign(
    {
      kind: "module" as const,
      id,
      meta,
    },
    inventory,
  ) as FlowModuleDefinition<Id, Inventory, Meta>;
  const summary = summarizeModule(module);

  return Object.freeze(
    Object.assign(module, {
      inventory: () => summary,
    }),
  );
}
