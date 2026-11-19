import { Fake, samplesOf, Story } from "../../../src/host/testing/index.ts";
import {
  checkout,
  mainCart,
  mainFlow,
  mainShopper,
  renewalPay,
  storeSubscribedSetup,
  subscription,
} from "../app.ts";
import { CartFake } from "../server/layer.ts";
import { ShopFake } from "../../services/shop/server/layer.ts";
import { Carts } from "../server/carts.ts";
import { Shop } from "../../services/shop/server/shop.ts";
import { add, storeStory } from "./usual.ts";

/**
 * The flow's request to pay with a card.
 */
export const payWith = (paymentMethodId: string) => ({ _tag: "PayWith", paymentMethodId }) as const;

const payWithVisa = payWith("visa");

const payWithNothing = payWith("");

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
  values: { payWithVisa, payWithNothing },
  controls: [],
  steps: (story) =>
    story
      .send(checkout, { _tag: "Start", cartId: "main", intentId: "pi-main" })
      .send(mainFlow, payWithNothing)
      .send(mainCart, add("l1", "v1"))
      .send(mainFlow, { _tag: "Begin" })
      .send(mainFlow, { _tag: "AddressEntered", line1: "12 Canal St" })
      .send(mainFlow, { _tag: "MethodChosen", method: "express" })
      .send(mainFlow, { _tag: "SlotChosen", slot: "9-12" })
      .send(mainFlow, payWithVisa),
});

/**
 * The shop with the weekly box subscription over its port fakes, with no steps yet: every Story of
 * a renewal starts here.
 */
export const renewalStory = (id: string) =>
  Story.app(storeSubscribedSetup, { id, fixtures: [ShopFake, CartFake] });

/**
 * How long the subscription waits between renewals.
 */
export const WEEK = "7 days";

/**
 * The shopper subscribes with the saved card.
 */
export const subscribe = { _tag: "Subscribe", paymentMethodId: "visa" } as const;

const subscribeNothing = { _tag: "Subscribe", paymentMethodId: "" } as const;

const start = { _tag: "Start", cartId: "weekly", intentId: "pi-weekly" } as const;

const cancel = { _tag: "Cancel" } as const;

// The renewal's Pay is started for the weekly box and the shopper subscribes.
const started = (id: string) =>
  renewalStory(id)
    .ensure(renewalPay)
    .ensure(subscription)
    .send(renewalPay, start)
    .send(subscription, subscribe);

/**
 * The renewal's confirm is held while it pays by another card; the Pay is closed and its grace
 * passes while the confirm is on the wire; the week passes and the subscription renews; then the
 * confirm lands.
 */
export const renewalBusyPay = started("shop/renewal-busy-pay")
  .world(Shop.confirm.hold())
  .send(renewalPay, { _tag: "PayRequested", paymentMethodId: "amex" })
  .detach(renewalPay)
  .advance("1 second")
  .advance(WEEK)
  .checkpoint("renewed")
  .world(Shop.confirm.release())
  .checkpoint("landed");

/**
 * The renewal's Pay is closed and ends with its record; the week passes with the confirm held, so
 * the subscription renews; a second later the confirm is still on the wire; the Pay is opened and
 * asked to pay again; the held confirm lands, the Pay is closed, and the grace passes.
 */
export const renewalEndedPay = started("shop/renewal-ended-pay")
  .detach(renewalPay)
  .advance("1 second")
  .checkpoint("ended")
  .world(Shop.confirm.hold())
  .advance(WEEK)
  .checkpoint("renewed")
  .advance("1 second")
  .checkpoint("held past the grace")
  .ensure(renewalPay)
  .send(renewalPay, { _tag: "PayRequested", paymentMethodId: "visa" })
  .world(Shop.confirm.release())
  .detach(renewalPay)
  .advance("1 second")
  .checkpoint("after the grace");

/**
 * The renewal's confirm answer is lost, so it is unsure; the Pay is closed and ends with that
 * unsure charge held in its record; then the week passes and the subscription renews.
 */
export const renewalUnsurePay = started("shop/renewal-unsure-pay")
  .world(Shop.confirm.drop({ at: "response" }))
  .send(renewalPay, { _tag: "PayRequested", paymentMethodId: "amex" })
  .checkpoint("unsure")
  .detach(renewalPay)
  .advance("1 second")
  .advance(WEEK)
  .checkpoint("renewed");

/**
 * The shopper subscribes before the renewal's Pay was ever opened; the week passes.
 */
export const renewalUnopenedPay = renewalStory("shop/renewal-unopened-pay")
  .ensure(subscription)
  .send(subscription, subscribe)
  .advance(WEEK)
  .checkpoint("renewed");

/**
 * The renewal's Pay is started and forgotten; then the week passes.
 */
export const renewalForgottenPay = started("shop/renewal-forgotten-pay")
  .dispose(renewalPay, { how: "forget" })
  .advance(WEEK)
  .checkpoint("renewed");

/**
 * The shopper subscribes; the renewal's saved record is text no release can read; the tab reloads;
 * then the week passes.
 */
export const renewalDamagedPay = renewalStory("shop/renewal-damaged-pay")
  .ensure(subscription)
  .send(subscription, subscribe)
  .world(Fake.storage.put("actor/Checkout/Pay/renewal", "{not a record"))
  .reload()
  .advance(WEEK)
  .checkpoint("renewed");

/**
 * The renewal's Pay is started and saved; the store then holds every write while the shopper
 * leaves the Pay and starts it again for next week's intent, so that change is unwritten; the Pay
 * is closed and its grace passes, so it ends with the change unwritten; the week passes and the
 * subscription renews; then the store lets the writes through.
 */
export const renewalEndingPay = started("shop/renewal-ending-pay")
  .checkpoint("saved")
  .world(Fake.storage.hold())
  .send(renewalPay, { _tag: "Leave" })
  .send(renewalPay, { _tag: "Start", cartId: "weekly", intentId: "pi-week-2" })
  .detach(renewalPay)
  .advance("1 second")
  .advance(WEEK)
  .checkpoint("renewed")
  .world(Fake.storage.release())
  .checkpoint("released");

/**
 * The store holds every write while the renewal's Pay is disposed, so its removal is not
 * acknowledged; the week passes and the subscription renews; then the store lets the writes
 * through.
 */
export const renewalDisposingPay = started("shop/renewal-disposing-pay")
  .world(Fake.storage.hold())
  .dispose(renewalPay)
  .advance(WEEK)
  .checkpoint("renewed")
  .world(Fake.storage.release())
  .checkpoint("released");

/**
 * What a shopper can do with the subscription and its renewal's Pay, for generated runs: start the
 * Pay, subscribe (with an empty card among them), cancel; the card is declined. A week is past the
 * generated runs' think times, so no renewal falls due in them.
 */
export const renewalSamples = samplesOf({
  id: "shop-renewals",
  story: renewalStory("shop/renewals-samples").ensure(subscription),
  names: { setup: "storeSubscribedSetup", fixtures: ["ShopFake", "CartFake"] },
  actors: { subscription, renewalPay },
  servers: { Shop },
  failures: [Shop.decline({ code: "card_declined" })],
  landedFailures: [],
  values: { subscribe, subscribeNothing, start, cancel },
  controls: [],
  steps: (story) =>
    story
      .send(renewalPay, start)
      .send(subscription, subscribe)
      .send(subscription, subscribeNothing)
      .send(subscription, cancel),
});
