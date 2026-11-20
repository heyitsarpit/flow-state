import { samplesOf } from "../../../src/host/testing/index.ts";
import { mainBadge, mainCart, mainFlow, mainShopper } from "../app.ts";
import { Carts } from "../server/carts.ts";
import { Cart } from "../machines/cart.ts";
import { CheckoutFlow } from "../machines/checkout-flow.ts";
import { Shopper } from "../machines/shopper.ts";
import { storeStory } from "./usual.ts";

/**
 * What a shopper and the cart service can do in the shop around the checkout, for generated runs:
 * sign in and out, add and edit lines (0 and negative among them) and step through checkout; the
 * service sells a variant out or runs low. Pay's own samples drive the checkout's Pay.
 */
export const samples = samplesOf({
  id: "shop-store",
  story: storeStory("shop/store-samples"),
  names: { setup: "storeSetup", fixtures: ["ShopFake", "CartFake"] },
  actors: { mainShopper, mainCart, mainBadge, mainFlow },
  servers: { Carts },
  failures: [Carts.soldOut({ variantId: "v2" }), Carts.stock({ variantId: "v1", left: 1 })],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(mainShopper, Shopper.E.SignIn({ name: "ada" }))
      .send(mainShopper, Shopper.E.SignOut())
      .send(mainCart, Cart.E.Add({ lineId: "l1", variantId: "v1" }))
      .send(mainCart, Cart.E.Add({ lineId: "l2", variantId: "v2" }))
      .send(mainCart, Cart.E.SetQuantity({ lineId: "l1", quantity: 3 }))
      .send(mainCart, Cart.E.SetQuantity({ lineId: "l1", quantity: 0 }))
      .send(mainCart, Cart.E.SetQuantity({ lineId: "l2", quantity: -1 }))
      .send(mainFlow, CheckoutFlow.E.Begin())
      .send(mainFlow, CheckoutFlow.E.AddressEntered({ line1: "12 Canal St" }))
      .send(mainFlow, CheckoutFlow.E.MethodChosen({ method: "express" }))
      .send(mainFlow, CheckoutFlow.E.SlotChosen({ slot: "9-12" }))
      .send(mainFlow, CheckoutFlow.E.Back()),
});
