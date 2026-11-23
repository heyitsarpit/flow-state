import { Story } from "../../../src/host/testing/index.ts";
import { Carts } from "../server/carts.ts";
import { CartViewFake, MiniCart, miniCart, miniCartSetup } from "./mini-cart.ts";

/**
 * The shop with the mini cart over the carts fake, the mini cart shown.
 */
export const miniCartStory = (id: string) =>
  Story.app(miniCartSetup, { id, fixtures: [CartViewFake] }).ensure(miniCart);

/**
 * The shopper switches carts while the first cart's refresh is on the wire: nothing shows the
 * first cart any more, so its refresh is stopped.
 */
export const switchCarts = Story.app(miniCartSetup, {
  id: "shop/switch-carts",
  fixtures: [CartViewFake],
})
  .world(Carts.cart.hold())
  .ensure(miniCart)
  .send(miniCart, MiniCart.E.Show({ cartId: "cart-2" }))
  .checkpoint("switched")
  .world(Carts.cart.release())
  .checkpoint("released");

/**
 * An add shows its line at once, before the server answers.
 */
export const addShownAtOnce = miniCartStory("shop/add-shown-at-once")
  .world(Carts.addLine.hold())
  .send(miniCart, MiniCart.E.Add({ lineId: "l1", variantId: "v-red" }))
  .checkpoint("sending")
  .world(Carts.addLine.release())
  .checkpoint("added");

/**
 * An add of a sold-out variant shows at once, then goes when the server refuses it.
 */
export const refusedAddRemoved = miniCartStory("shop/refused-add-removed")
  .world(Carts.soldOut({ variantId: "v-blue" }))
  .send(miniCart, MiniCart.E.Add({ lineId: "l1", variantId: "v-blue" }))
  .checkpoint("refused");

/**
 * The cart's first read is on the wire when an add fails: once the read lands, the cart shows what
 * it loaded and nothing of the failed add.
 */
export const failedAddDuringLoad = Story.app(miniCartSetup, {
  id: "shop/failed-add-during-load",
  fixtures: [CartViewFake],
})
  .world(Carts.cart.hold(), Carts.soldOut({ variantId: "v-blue" }))
  .ensure(miniCart)
  .send(miniCart, MiniCart.E.Add({ lineId: "l1", variantId: "v-blue" }))
  .world(Carts.cart.release())
  .checkpoint("loaded");

/**
 * A refresh asked before an add answers after it: the stale snapshot lands nothing, and the read
 * that follows shows the added line.
 */
export const staleSnapshot = Story.app(miniCartSetup, {
  id: "shop/stale-snapshot",
  fixtures: [CartViewFake],
})
  .world(Carts.cart.hold({ at: "response" }))
  .ensure(miniCart)
  .send(miniCart, MiniCart.E.Add({ lineId: "l1", variantId: "v-red" }))
  .world(Carts.cart.release())
  .checkpoint("settled");

/**
 * Two adds overlap: the first one's answer starts a refresh whose snapshot misses the second line,
 * and the second add answers before that snapshot does. The stale snapshot lands nothing, the second
 * line stays shown throughout, and the trailing read shows both lines.
 */
export const staleOverlappingAdds = miniCartStory("shop/stale-overlapping-adds")
  .world(Carts.addLine.hold(), Carts.addLine.hold())
  .send(miniCart, MiniCart.E.Add({ lineId: "l1", variantId: "v-red" }))
  .send(miniCart, MiniCart.E.Add({ lineId: "l2", variantId: "v-green" }))
  .checkpoint("sending")
  .world(Carts.cart.hold({ at: "response" }), Carts.addLine.release())
  .checkpoint("one answered")
  .world(Carts.addLine.release(), Carts.cart.release())
  .checkpoint("settled");
