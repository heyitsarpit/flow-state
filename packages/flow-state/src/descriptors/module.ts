import type { FlowModuleDefinition, FlowModuleInventory, FlowModuleMeta } from "../public/types.js";
import { summarizeModule } from "./inventory.js";
import { validateModuleInventory } from "./validation.js";

type FlowInventoryFactory<Inventory extends FlowModuleInventory> = () => Inventory;

export function createModuleDefinition<
  const Id extends string,
  const Inventory extends FlowModuleInventory,
>(
  id: Id,
  inventoryOrFactory: Inventory | FlowInventoryFactory<Inventory>,
  meta: FlowModuleMeta = {},
): FlowModuleDefinition<Id, Inventory> {
  const members =
    typeof inventoryOrFactory === "function"
      ? (inventoryOrFactory as FlowInventoryFactory<Inventory>)()
      : inventoryOrFactory;

  validateModuleInventory(id, members, meta);

  const module = Object.assign(
    {
      kind: "module" as const,
      id,
      meta,
    },
    members,
  ) as FlowModuleDefinition<Id, Inventory>;
  const summary = summarizeModule(module);

  return Object.freeze(
    Object.assign(module, {
      inventory: () => summary,
    }),
  );
}
