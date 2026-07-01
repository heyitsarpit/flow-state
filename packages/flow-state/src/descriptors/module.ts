import type { FlowModuleDefinition, FlowModuleInventory, FlowModuleMeta } from "../public/types.js";
import { summarizeModule } from "./inventory.js";
import { validateModuleInventory } from "./validation.js";

export function createModuleDefinition<
  const Id extends string,
  const Inventory extends FlowModuleInventory,
>(id: Id, inventory: Inventory, meta: FlowModuleMeta = {}): FlowModuleDefinition<Id, Inventory> {
  validateModuleInventory(id, inventory, meta);

  const module = Object.assign(
    {
      kind: "module" as const,
      id,
      meta,
    },
    inventory,
  ) as FlowModuleDefinition<Id, Inventory>;
  const summary = summarizeModule(module);

  return Object.freeze(
    Object.assign(module, {
      inventory: () => summary,
    }),
  );
}
