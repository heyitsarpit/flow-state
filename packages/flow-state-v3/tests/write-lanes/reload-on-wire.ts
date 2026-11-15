import { expect } from "vite-plus/test";
import { Shop } from "../../fixtures/pay/server.ts";
import { charges, CHECK, lastReason, onWire, row, state } from "../checkout.ts";
import { played } from "../rules/played.ts";

/**
 * `pay` on the wire across a reload: restored Held, then its late answer and the re-read settle
 * it, and the order is placed once (Restore R1, R3; WriteLanes R8, R10).
 */
export const reloadOnWire = async (id: string) => {
  const run = await played(
    onWire(id, Shop.confirm.hold())
      .reload()
      .checkpoint("reloaded")
      .world(Shop.confirm.release(), Shop.placeOrder.hold())
      .advance(CHECK)
      .checkpoint("placing")
      .world(Shop.placeOrder.release())
      .checkpoint("paid"),
  );

  const { reloaded, placing, paid } = run.checkpoints;

  expect(state(reloaded)).toBe("UNSURE");
  expect(row(reloaded)?.uncertain).toBe(true);
  expect(lastReason(run.evidence, "pay")).toBe("Restored");
  expect(reloaded.read(Shop.confirm)).toHaveLength(1);
  expect(state(placing)).toBe("PLACING");
  expect(state(paid)).toBe("PAID");
  expect(charges(paid)).toBe(1);
};
