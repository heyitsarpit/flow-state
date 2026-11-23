import { Predicate } from "effect";
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

// The cart row's line ids, live optimistic lines included, and whether any is applied (Plan
// Operations O6): what a view of the cart shows, where `value` fires only on confirmed data.
const rowOf = (cut: Cut, ref: ActorRef<typeof MiniCart>) => {
  const [row] = cut.read(ref)?.operations.get("cart")?.values() ?? [];
  const data = Predicate.hasProperty(row, "data") ? row.data : undefined;
  const lines = Predicate.hasProperty(data, "lines") ? data.lines : undefined;

  return {
    lines: Predicate.isObject(lines) ? Object.keys(lines).toSorted() : [],
    predicted: Predicate.hasProperty(row, "predicted") && row.predicted === true,
  };
};

describe("the mini cart (Operations entry table; Plan Operations O5)", () => {
  it("Operations, entry table (Last hold left, Running): switching carts stops the old cart's refresh", async () => {
    const { switchCarts } = await load();
    const run = await switchCarts.run();

    const cart1 = (cut: Cut) =>
      cut
        .read(Carts.cart)
        .filter((c) => c.input.cartId === "cart-1")
        .map((c) => c.status);

    expect(cart1(run.checkpoints.released)).toEqual(["handled"]);
  });

  it("Plan Operations O2, O5, O6: an add shows its line at once on the cart row, predicted, and the line stays once the server confirms it; value fires only then", async () => {
    const { addShownAtOnce, miniCart } = await load();
    const run = await addShownAtOnce.run();
    const { sending, added } = run.checkpoints;

    expect(rowOf(sending, miniCart)).toEqual({ lines: ["l1"], predicted: true });
    expect(lineIds(sending, miniCart)).toEqual([]);
    expect(rowOf(added, miniCart)).toEqual({ lines: ["l1"], predicted: false });
    expect(lineIds(added, miniCart)).toEqual(["l1"]);
  });

  it("Plan Operations O5: a refused add's optimistic line goes, with no refetch", async () => {
    const { refusedAddRemoved, miniCart } = await load();
    const run = await refusedAddRemoved.run();
    const refused = run.checkpoints.refused;

    expect(lineIds(refused, miniCart)).toEqual([]);
    expect(refused.read(Carts.cart)).toHaveLength(1);
  });

  it("Plan Operations O5: an add that fails while the first read is on the wire leaves the loaded cart, with no phantom line", async () => {
    const { failedAddDuringLoad, miniCart } = await load();
    const run = await failedAddDuringLoad.run();
    const loaded = run.checkpoints.loaded;

    expect(lineIds(loaded, miniCart)).toEqual([]);
  });

  it("Operations R4, I7, T4.4: a snapshot asked before an add lands nothing, and the trailing read shows the added line", async () => {
    const { staleSnapshot, miniCart } = await load();
    const run = await staleSnapshot.run();
    const settled = run.checkpoints.settled;

    expect(settled.read(Carts.cart)).toHaveLength(2);
    expect(lineIds(settled, miniCart)).toEqual(["l1"]);
  });

  it("Plan Operations O2 (a live optimistic layer holds an entry); Operations I3, I12, I22: an unsure add from a product page holds the closed cart until its refetch lands, then the cart is kept a minute and collected", async () => {
    const { closedAddUnsure } = await load();
    const run = await closedAddUnsure.run();
    const collects = (cut: Cut) => cut.inspection.timers.filter((t) => t.kind === "Collect");
    const { unsure, refetched, collected } = run.checkpoints;

    expect(collects(unsure)).toEqual([]);
    expect(collects(run.checkpoints["held past gcTime"])).toEqual([]);
    expect(refetched.read(Carts.cart)).toHaveLength(2);
    expect(collects(refetched)).toHaveLength(1);
    expect(collects(collected)).toEqual([]);
  });

  it("Operations R4, I7; Plan Operations O5, O6: overlapping adds keep both lines shown on the cart row, and the stale snapshot between them lands nothing", async () => {
    const { staleOverlappingAdds, miniCart } = await load();
    const run = await staleOverlappingAdds.run();
    const shown = ["sending", "one answered", "settled"] as const;

    expect(shown.map((name) => rowOf(run.checkpoints[name], miniCart).lines)).toEqual([
      ["l1", "l2"],
      ["l1", "l2"],
      ["l1", "l2"],
    ]);
    expect(lineIds(run.checkpoints.settled, miniCart)).toEqual(["l1", "l2"]);
    expect(run.checkpoints.settled.read(Carts.cart)).toHaveLength(3);
  });
});
