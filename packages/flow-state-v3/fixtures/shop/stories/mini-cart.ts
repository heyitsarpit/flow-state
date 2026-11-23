import { samplesOf, Story } from "../../../src/host/testing/index.ts";
import { miniCart, miniCartSetup } from "../app.ts";
import { MiniCart } from "../machines/mini-cart.ts";
import { Carts } from "../server/carts.ts";
import { CartViewFake } from "../server/layer.ts";

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
  .world(Carts.addLine.hold(), Carts.addLine.hold(), Carts.cart.hold({ at: "response" }))
  .send(miniCart, MiniCart.E.Add({ lineId: "l1", variantId: "v-red" }))
  .send(miniCart, MiniCart.E.Add({ lineId: "l2", variantId: "v-green" }))
  .checkpoint("sending")
  .world(Carts.addLine.release())
  .checkpoint("one answered")
  .world(Carts.addLine.release(), Carts.cart.release())
  .checkpoint("settled");

/**
 * The shopper closes the mini cart, then adds from a product page; the add's answer is lost, so
 * the cart is read again, and that read is held past the cart's minute of `gcTime`. Once it lands,
 * nothing holds the cart, which is kept a minute and then collected.
 */
export const closedAddUnsure = miniCartStory("shop/closed-add-unsure")
  .send(miniCart, MiniCart.E.Close())
  .world(Carts.addLine.hold(), Carts.cart.hold())
  .send(miniCart, MiniCart.E.Add({ lineId: "l1", variantId: "v-red" }))
  .world(Carts.addLine.lose())
  .checkpoint("unsure")
  .advance("2 minutes")
  .checkpoint("held past gcTime")
  .world(Carts.cart.release())
  .checkpoint("refetched")
  .advance("1 minute")
  .checkpoint("collected");

/**
 * What a shopper does with the header's mini cart, for generated runs: show a cart (one with an
 * empty id among them), add lines, close and open it. The cart service's one failure is a sold-out
 * variant, and no control undoes it, so there are no controls.
 */
export const miniCartSamples = samplesOf({
  id: "shop-mini-cart",
  story: Story.app(miniCartSetup, { id: "shop/mini-cart-samples", fixtures: [CartViewFake] }),
  names: { setup: "miniCartSetup", fixtures: ["CartViewFake"] },
  actors: { miniCart },
  servers: { Carts },
  failures: [Carts.soldOut({ variantId: "v-blue" })],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(miniCart, MiniCart.E.Show({ cartId: "cart-2" }))
      .send(miniCart, MiniCart.E.Show({ cartId: "" }))
      .send(miniCart, MiniCart.E.Add({ lineId: "l1", variantId: "v-red" }))
      .send(miniCart, MiniCart.E.Add({ lineId: "l2", variantId: "v-blue" }))
      .send(miniCart, MiniCart.E.Add({ lineId: "", variantId: "" }))
      .send(miniCart, MiniCart.E.Close())
      .send(miniCart, MiniCart.E.Add({ lineId: "l3", variantId: "v-red" }))
      .send(miniCart, MiniCart.E.Open()),
});
