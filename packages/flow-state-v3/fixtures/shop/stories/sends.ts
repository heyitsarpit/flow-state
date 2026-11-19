import { Fake, samplesOf, Story } from "../../../src/host/testing/index.ts";
import { buyNow, checkout, mainCart, mainFlow, mainShopper, storeExpressSetup } from "../app.ts";
import { CartFake } from "../server/layer.ts";
import { ShopFake } from "../../services/shop/server/layer.ts";
import { Carts } from "../server/carts.ts";
import { Shop } from "../../services/shop/server/shop.ts";
import { add, storeStory } from "./usual.ts";

/**
 * The flow's request to pay with a card.
 */
export const payWith = (paymentMethodId: string) => ({ _tag: "PayWith", paymentMethodId }) as const;

/**
 * Ada's checkout is started for her cart; she adds a line, steps through the address, method and
 * slot, and pays with her card from the flow.
 */
export const checkoutSends = storeStory("shop/checkout-sends")
  .ensure(mainShopper)
  .ensure(mainCart)
  .ensure(checkout)
  .ensure(mainFlow)
  .send(checkout, { _tag: "Start", cartId: "main", intentId: "pi-main" })
  .send(mainCart, add("l1", "v1"))
  .send(mainFlow, { _tag: "Begin" })
  .send(mainFlow, { _tag: "AddressEntered", line1: "12 Canal St" })
  .send(mainFlow, { _tag: "MethodChosen", method: "express" })
  .send(mainFlow, { _tag: "SlotChosen", slot: "9-12" })
  .checkpoint("pay")
  .send(mainFlow, payWith("visa"))
  .checkpoint("paid");

/**
 * What a shopper can do around the checkout's Pay from the flow, for generated runs: start the
 * checkout, add a line, step to the pay step and pay with a card (an empty card id among them); the
 * card is declined.
 */
export const checkoutSendSamples = samplesOf({
  id: "shop-checkout-sends",
  story: storeStory("shop/checkout-sends-samples").ensure(mainShopper).ensure(mainCart),
  names: { setup: "storeSetup", fixtures: ["ShopFake", "CartFake"] },
  actors: { mainShopper, checkout, mainFlow, mainCart },
  servers: { Shop, Carts },
  failures: [Shop.decline({ code: "card_declined" })],
  landedFailures: [],
  values: { payWith: payWith("visa"), payWithNothing: payWith("") },
  controls: [],
  steps: (story) =>
    story
      .send(checkout, { _tag: "Start", cartId: "main", intentId: "pi-main" })
      .send(mainCart, add("l1", "v1"))
      .send(mainFlow, { _tag: "Begin" })
      .send(mainFlow, { _tag: "AddressEntered", line1: "12 Canal St" })
      .send(mainFlow, { _tag: "MethodChosen", method: "express" })
      .send(mainFlow, { _tag: "SlotChosen", slot: "9-12" })
      .send(mainFlow, payWith("visa")),
});

/**
 * The shop with the one-click buy button over its port fakes, with no steps yet: every Story of the
 * buy button starts here.
 */
export const expressStory = (id: string) =>
  Story.app(storeExpressSetup, { id, fixtures: [ShopFake, CartFake] });

/**
 * A click on the buy button with the saved card.
 */
export const buy = { _tag: "Buy", paymentMethodId: "visa" } as const;

const start = { _tag: "Start", cartId: "main", intentId: "pi-main" } as const;

// The checkout is started for the main cart and the buy button is on the page.
const started = (id: string) =>
  expressStory(id).ensure(checkout).ensure(buyNow).send(checkout, start);

/**
 * The checkout's confirm is held while it pays; the checkout is closed and its grace passes while
 * the confirm is on the wire; the buy button is clicked; then the confirm lands.
 */
export const buyBusyCheckout = started("shop/buy-busy-checkout")
  .world(Shop.confirm.hold())
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "amex" })
  .detach(checkout)
  .advance("1 second")
  .send(buyNow, buy)
  .checkpoint("clicked")
  .world(Shop.confirm.release())
  .checkpoint("landed");

/**
 * The checkout is closed and ends with its record; the buy button is clicked with the confirm held,
 * and a second passes; the checkout is opened again and asked to pay; the held confirm lands, the
 * checkout is closed, and the grace passes.
 */
export const buyEndedCheckout = started("shop/buy-ended-checkout")
  .detach(checkout)
  .advance("1 second")
  .checkpoint("ended")
  .world(Shop.confirm.hold())
  .send(buyNow, buy)
  .checkpoint("clicked")
  .advance("1 second")
  .checkpoint("held past the grace")
  .ensure(checkout)
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .world(Shop.confirm.release())
  .detach(checkout)
  .advance("1 second")
  .checkpoint("after the grace");

/**
 * The checkout's confirm answer is lost, so it is unsure; it is closed and ends with that unsure
 * charge held in its record; then the buy button is clicked.
 */
export const buyUnsureCheckout = started("shop/buy-unsure-checkout")
  .world(Shop.confirm.drop({ at: "response" }))
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "amex" })
  .checkpoint("unsure")
  .detach(checkout)
  .advance("1 second")
  .send(buyNow, buy)
  .checkpoint("clicked");

/**
 * The buy button is clicked before any checkout was opened.
 */
export const buyUnopenedCheckout = expressStory("shop/buy-unopened-checkout")
  .ensure(buyNow)
  .send(buyNow, buy)
  .checkpoint("clicked");

/**
 * The checkout is started and forgotten; then the buy button is clicked.
 */
export const buyForgottenCheckout = started("shop/buy-forgotten-checkout")
  .dispose(checkout, { how: "forget" })
  .send(buyNow, buy)
  .checkpoint("clicked");

/**
 * The checkout's saved record is text no release can read; the tab reloads; then the buy button
 * is clicked.
 */
export const buyDamagedCheckout = expressStory("shop/buy-damaged-checkout")
  .ensure(buyNow)
  .world(Fake.storage.put("actor/Checkout/Pay/checkout-1", "{not a record"))
  .reload()
  .send(buyNow, buy)
  .checkpoint("clicked");

/**
 * The store holds every write; a card is chosen at the checkout, which is closed and its grace
 * passes, so it ends with that change unwritten; the buy button is clicked; then the store lets the writes through.
 */
export const buyEndingCheckout = started("shop/buy-ending-checkout")
  .world(Fake.storage.hold())
  .send(checkout, { _tag: "CardChosen", paymentMethodId: "amex" })
  .detach(checkout)
  .advance("1 second")
  .send(buyNow, buy)
  .checkpoint("clicked")
  .world(Fake.storage.release())
  .checkpoint("released");

/**
 * The store holds every write while the checkout is disposed, so its removal is not acknowledged;
 * the buy button is clicked; then the store lets the writes through.
 */
export const buyDisposingCheckout = started("shop/buy-disposing-checkout")
  .world(Fake.storage.hold())
  .dispose(checkout)
  .send(buyNow, buy)
  .checkpoint("clicked")
  .world(Fake.storage.release())
  .checkpoint("released");

/**
 * What a shopper can do with the buy button and the checkout, for generated runs: start the
 * checkout, click buy (an empty card among them), close the checkout; the card is declined.
 */
export const buyNowSamples = samplesOf({
  id: "shop-buy-now",
  story: expressStory("shop/buy-now-samples").ensure(buyNow),
  names: { setup: "storeExpressSetup", fixtures: ["ShopFake", "CartFake"] },
  actors: { buyNow, checkout },
  servers: { Shop },
  failures: [Shop.decline({ code: "card_declined" })],
  landedFailures: [],
  values: { buy, buyNothing: { _tag: "Buy", paymentMethodId: "" }, start },
  controls: [],
  steps: (story) =>
    story
      .send(checkout, start)
      .send(buyNow, buy)
      .send(buyNow, { _tag: "Buy", paymentMethodId: "" })
      .send(checkout, { _tag: "Leave" }),
});
