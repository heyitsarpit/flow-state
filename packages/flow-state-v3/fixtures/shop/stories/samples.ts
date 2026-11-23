import { Fake, samplesOf } from "../../../src/host/testing/index.ts";
import { mainBadge, mainCart, mainFlow, mainShopper } from "../app.ts";
import { Carts } from "../server/carts.ts";
import { Cart } from "../machines/cart.ts";
import { CheckoutFlow } from "../machines/checkout-flow.ts";
import { Shopper } from "../machines/shopper.ts";
import { storeStory } from "./usual.ts";

// The main cart's record as a damaged disk or a bad copy could leave it: its shopper slot bound to
// a local actor's name, and its body copied under the guest cart's key.
const cartBody = (provider: string) =>
  String.raw`{"body":{"graph":{},"instances":{},"memory":{"adding":"","errors":{},"lines":{"l9":{"quantity":1,"variantId":"v1"}},"notice":"","wanted":{}},"schedules":{},"slots":{"shopper":{"baselines":{},"provider":{"machine":"Shop/Shopper","name":"${provider}"},"seen":{"value":""}}},"state":"OPEN"},"format":6}`;

const forgedCarts = [
  Fake.storage.put('actor/Shop/Cart/{"owner":"main"}', cartBody("~9")),
  Fake.storage.put('actor/Shop/Cart/{"owner":"guest"}', cartBody("main")),
];

const serviceFailures = [
  Carts.soldOut({ variantId: "v2" }),
  Carts.stock({ variantId: "v1", left: 1 }),
];

const storeSamplesOf = (records: boolean) =>
  samplesOf({
    id: records ? "shop-records" : "shop-store",
    story: storeStory(records ? "shop/records-samples" : "shop/store-samples"),
    names: { setup: "storeSetup", fixtures: ["ShopFake", "CartFake"] },
    actors: { mainShopper, mainCart, mainBadge, mainFlow },
    servers: { Carts },
    failures: records ? [...serviceFailures, ...forgedCarts] : serviceFailures,
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

/**
 * What a shopper and the cart service can do in the shop around the checkout, for generated runs:
 * sign in and out, add and edit lines (0 and negative among them) and step through checkout; the
 * service sells a variant out or runs low. Pay's own samples drive the checkout's Pay.
 */
export const samples = storeSamplesOf(false);

/**
 * What a shopper and the cart service can do around the checkout, with the main cart's record on
 * disk forged or copied under the guest's key: the store's samples, for every runner.
 */
export const recordSamples = storeSamplesOf(true);
