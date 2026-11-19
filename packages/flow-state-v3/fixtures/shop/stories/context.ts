import { samplesOf, Story } from "../../../src/host/testing/index.ts";
import { mainCart, mainPulse, mainShopper, storePulsingSetup } from "../app.ts";
import { Cart } from "../machines/cart.ts";
import { CartPulse } from "../machines/cart-pulse.ts";
import { Shopper } from "../machines/shopper.ts";
import { Carts } from "../server/carts.ts";
import { CartFake } from "../server/layer.ts";
import { ShopFake } from "../../services/shop/server/layer.ts";

/**
 * The shop with the header's mini-cart over its port fakes, with no steps yet.
 */
export const pulseStory = (id: string) =>
  Story.app(storePulsingSetup, { id, fixtures: [ShopFake, CartFake] });

/**
 * The signed-in shopper's cart and mini-cart, ensured, with nothing in the cart yet.
 */
export const opened = (id: string) =>
  pulseStory(id)
    .ensure(mainShopper)
    .ensure(mainCart)
    .ensure(mainPulse)
    .send(mainShopper, Shopper.E.SignIn({ name: "ada" }));

/**
 * Ada adds a line, and the mini-cart pulses; she opens it. She raises the line to 5 and the count
 * follows before the cart service answers; the answer changes nothing she sees. She lowers it to
 * 2, which is shown but does not pulse, then raises it to 3, which pulses; an add of a sold-out
 * variant is refused and changes neither the lines nor the edits the count reads.
 */
export const pulseAdds = opened("shop/pulse-adds")
  .checkpoint("empty")
  .send(mainCart, Cart.E.Add({ lineId: "l1", variantId: "v1" }))
  .checkpoint("added")
  .send(mainPulse, CartPulse.E.Opened())
  .world(Carts.setQuantity.hold({ at: "response" }))
  .send(mainCart, Cart.E.SetQuantity({ lineId: "l1", quantity: 5 }))
  .checkpoint("asked")
  .world(Carts.setQuantity.release())
  .checkpoint("answered")
  .send(mainCart, Cart.E.SetQuantity({ lineId: "l1", quantity: 2 }))
  .checkpoint("lowered")
  .send(mainCart, Cart.E.SetQuantity({ lineId: "l1", quantity: 3 }))
  .checkpoint("raised")
  .world(Carts.soldOut({ variantId: "v2" }))
  .send(mainCart, Cart.E.Add({ lineId: "l2", variantId: "v2" }))
  .checkpoint("refused");

/**
 * Shopper, cart and mini-cart, three layers (S1); the line is raised to 3, the tab reloads and only
 * the mini-cart, the deepest node, is ensured (S9). Its count is read again without a pulse; the
 * next raise pulses once.
 */
export const pulseReloaded = opened("shop/pulse-reloaded")
  .send(mainCart, Cart.E.Add({ lineId: "l1", variantId: "v1" }))
  .send(mainCart, Cart.E.SetQuantity({ lineId: "l1", quantity: 3 }))
  .reload({ reattach: false })
  .ensure(mainPulse)
  .checkpoint("reloaded")
  .send(mainCart, Cart.E.SetQuantity({ lineId: "l1", quantity: 4 }))
  .checkpoint("raised");

/**
 * An add's answer is lost after the server applied it, then the tab reloads (E8) and only the
 * mini-cart is ensured again: whenever the cart's lane settles the add, before or after the
 * mini-cart's admission, the mini-cart neither loses the count nor makes one up.
 */
export const pulseReloadMidAdd = opened("shop/pulse-reload-mid-add")
  .world(Carts.addLine.drop({ at: "response" }))
  .send(mainCart, Cart.E.Add({ lineId: "l1", variantId: "v1" }))
  .reload({ reattach: false })
  .ensure(mainPulse)
  .advance("1 second")
  .checkpoint("settled");

/**
 * What a shopper and the cart service can do around the mini-cart, for generated runs: add lines,
 * edit them to 0 (the line goes, E1), to 2^53 − 1 with two more lines beside it (E6: the count
 * passes 2^53 and rounds, so a further item can leave it equal) and below 0, and open the
 * mini-cart; the service sells a variant out or runs low.
 */
export const pulseSamples = samplesOf({
  id: "shop-pulse",
  story: pulseStory("shop/pulse-samples"),
  names: { setup: "storePulsingSetup", fixtures: ["ShopFake", "CartFake"] },
  actors: { mainShopper, mainCart, mainPulse },
  servers: { Carts },
  failures: [Carts.soldOut({ variantId: "v2" }), Carts.stock({ variantId: "v1", left: 1 })],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(mainShopper, Shopper.E.SignIn({ name: "ada" }))
      .send(mainCart, Cart.E.Add({ lineId: "l1", variantId: "v1" }))
      .send(mainCart, Cart.E.Add({ lineId: "l2", variantId: "v2" }))
      .send(mainCart, Cart.E.SetQuantity({ lineId: "l1", quantity: 0 }))
      .send(mainCart, Cart.E.SetQuantity({ lineId: "l1", quantity: Number.MAX_SAFE_INTEGER }))
      .send(mainCart, Cart.E.Add({ lineId: "l3", variantId: "v1" }))
      .send(mainCart, Cart.E.SetQuantity({ lineId: "l2", quantity: 1 }))
      .send(mainCart, Cart.E.SetQuantity({ lineId: "l2", quantity: -1 }))
      .send(mainPulse, CartPulse.E.Opened()),
});
