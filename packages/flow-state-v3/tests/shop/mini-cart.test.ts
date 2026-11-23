import { describe, expect, it } from "vite-plus/test";
import { Carts } from "../../fixtures/shop/server/carts.ts";
import type { MiniCart } from "../../fixtures/shop/pending/mini-cart.ts";
import type { Cut } from "../../src/host/testing/index.ts";
import type { ActorRef } from "../../src/index.ts";

// The header's mini cart: a placed whole-cart read, a quick add with an `optimistic` value on that
// read, and an invalidate when the add answers. The mini cart uses members not yet built, so its
// fixture loads inside each test. Expected results: the entry table (Last hold left, Running
// releases; Invalidate on a Running placed entry wants a trailing request and the behind answer
// lands nothing) and Plan Operations O5 (an optimistic value applies at start, is removed on a
// failure without overwriting newer data, and is confirmed by the read after success).

const load = async () => {
  const stories = await import("../../fixtures/shop/pending/stories.ts");
  const refs = await import("../../fixtures/shop/pending/mini-cart.ts");

  return { ...stories, ...refs };
};

// The line ids a mini cart shows at a cut, none when it is not running.
const lineIds = (cut: Cut, ref: ActorRef<typeof MiniCart>) =>
  Object.keys(cut.read(ref)?.memory.lines ?? {}).toSorted();

describe("the mini cart (Operations entry table; Plan Operations O5)", () => {
  it.fails("Operations, entry table (Last hold left, Running): switching carts stops the old cart's refresh", async () => {
    const { switchCarts } = await load();
    const run = await switchCarts.run();

    const cart1 = (cut: Cut) =>
      cut
        .read(Carts.cart)
        .filter((c) => c.input.cartId === "cart-1")
        .map((c) => c.status);

    expect(cart1(run.checkpoints.released)).toEqual(["handled"]);
  });

  it.fails("Plan Operations O5: an add shows its line at once, and the line stays once the server confirms it", async () => {
    const { addShownAtOnce, miniCart } = await load();
    const run = await addShownAtOnce.run();
    const { sending, added } = run.checkpoints;

    expect(lineIds(sending, miniCart)).toEqual(["l1"]);
    expect(lineIds(added, miniCart)).toEqual(["l1"]);
  });

  it.fails("Plan Operations O5: a refused add's optimistic line goes, with no refetch", async () => {
    const { refusedAddRemoved, miniCart } = await load();
    const run = await refusedAddRemoved.run();
    const refused = run.checkpoints.refused;

    expect(lineIds(refused, miniCart)).toEqual([]);
    expect(refused.read(Carts.cart)).toHaveLength(1);
  });

  it.fails("Plan Operations O5: an add that fails while the first read is on the wire leaves the loaded cart, with no phantom line", async () => {
    const { failedAddDuringLoad, miniCart } = await load();
    const run = await failedAddDuringLoad.run();
    const loaded = run.checkpoints.loaded;

    expect(lineIds(loaded, miniCart)).toEqual([]);
  });

  it.fails("Operations R4, I7, T4.4: a snapshot asked before an add lands nothing, and the trailing read shows the added line", async () => {
    const { staleSnapshot, miniCart } = await load();
    const run = await staleSnapshot.run();
    const settled = run.checkpoints.settled;

    expect(settled.read(Carts.cart)).toHaveLength(2);
    expect(lineIds(settled, miniCart)).toEqual(["l1"]);
  });

  it.fails("Operations R4, I7; Plan Operations O5: overlapping adds keep both lines shown, and the stale snapshot between them lands nothing", async () => {
    const { staleOverlappingAdds, miniCart } = await load();
    const run = await staleOverlappingAdds.run();
    const shown = ["sending", "one answered", "settled"] as const;

    expect(shown.map((name) => lineIds(run.checkpoints[name], miniCart))).toEqual([
      ["l1", "l2"],
      ["l1", "l2"],
      ["l1", "l2"],
    ]);
    expect(run.checkpoints.settled.read(Carts.cart)).toHaveLength(3);
  });
});
