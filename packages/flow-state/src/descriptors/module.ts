import type {
  FlowModuleDefinition,
  FlowModuleInventory,
  FlowModuleMeta,
} from "../public/types.js";

type FlowInventoryFactory<Inventory extends FlowModuleInventory> = () => Inventory;

export function createModuleDefinition<
  const Id extends string,
  Inventory extends FlowModuleInventory,
>(
  id: Id,
  inventoryOrFactory: Inventory | FlowInventoryFactory<Inventory>,
  meta: FlowModuleMeta = {},
): FlowModuleDefinition<Id, Inventory> {
  const inventory =
    typeof inventoryOrFactory === "function"
      ? (inventoryOrFactory as FlowInventoryFactory<Inventory>)()
      : inventoryOrFactory;

  return Object.freeze(
    Object.assign(
      {
        kind: "module" as const,
        id,
        inventory,
        meta,
      },
      inventory,
    ),
  ) as FlowModuleDefinition<Id, Inventory>;
}
