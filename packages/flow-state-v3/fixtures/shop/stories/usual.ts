import { Fake, samplesOf, Story } from "../../../src/host/testing/index.ts";
import {
  guestCart,
  guestShopper,
  mainBadge,
  mainCart,
  mainFlow,
  mainShopper,
  storeSetup,
  checkout,
  shopSetup,
} from "../app.ts";
import { Cart } from "../machines/cart.ts";
import { CheckoutFlow } from "../machines/checkout-flow.ts";
import { Shopper } from "../machines/shopper.ts";
import { CartFake } from "../server/layer.ts";
import { Pay } from "../../services/shop/machines/pay.ts";
import { ShopFake, ShopFakeSessionCloseFails } from "../../services/shop/server/layer.ts";
import { Shop } from "../../services/shop/server/shop.ts";

/**
 * The shop over its port fakes, with no steps yet: every Story of the shop around the checkout
 * starts here.
 */
export const storeStory = (id: string) =>
  Story.app(storeSetup, { id, fixtures: [ShopFake, CartFake] });

/**
 * Ada signs in, adds two lines and edits one; the cart reads her name and the badge the cart's
 * count, bumping on each change; she signs out.
 */
export const browse = storeStory("shop/browse")
  .ensure(mainShopper)
  .ensure(mainCart)
  .ensure(mainBadge)
  .checkpoint("empty")
  .send(mainShopper, Shopper.E.SignIn({ name: "ada" }))
  .send(mainCart, Cart.E.Add({ lineId: "l1", variantId: "v1" }))
  .checkpoint("added")
  .send(mainCart, Cart.E.Add({ lineId: "l2", variantId: "v2" }))
  .send(mainCart, Cart.E.SetQuantity({ lineId: "l1", quantity: 3 }))
  .checkpoint("edited")
  .send(mainShopper, Shopper.E.SignOut())
  .checkpoint("signed out");

/**
 * A guest shops in a cart named for the guest.
 */
export const guestBrowse = storeStory("shop/guest-browse")
  .ensure(guestShopper)
  .ensure(guestCart)
  .send(guestCart, Cart.E.Add({ lineId: "g1", variantId: "v1" }))
  .checkpoint("added");

/**
 * Checkout on an empty cart is denied; after an add it moves through the address, the shipping
 * method and slot, and pay; Back twice returns to the slot, then the method; the tab reloads, and
 * Back once more reaches the address; the checkout's Pay is paid, which ends the flow.
 */
export const checkoutSteps = storeStory("shop/checkout-steps")
  .ensure(mainShopper)
  .ensure(mainCart)
  .ensure(mainFlow)
  .send(mainFlow, CheckoutFlow.E.Begin())
  .checkpoint("empty cart")
  .send(mainCart, Cart.E.Add({ lineId: "l1", variantId: "v1" }))
  .send(mainFlow, CheckoutFlow.E.Begin())
  .checkpoint("address")
  .send(mainFlow, CheckoutFlow.E.AddressEntered({ line1: "12 Canal St" }))
  .checkpoint("method")
  .send(mainFlow, CheckoutFlow.E.MethodChosen({ method: "express" }))
  .send(mainFlow, CheckoutFlow.E.SlotChosen({ slot: "9-12" }))
  .checkpoint("pay")
  .send(mainFlow, CheckoutFlow.E.Back())
  .checkpoint("back to slot")
  .send(mainFlow, CheckoutFlow.E.Back())
  .checkpoint("back to method")
  .reload()
  .checkpoint("reloaded")
  .send(mainFlow, CheckoutFlow.E.Back())
  .checkpoint("address again")
  .ensure(checkout)
  .send(checkout, Pay.E.Start({ cartId: "main", intentId: "pi-main" }))
  .send(checkout, Pay.E.PayRequested({ paymentMethodId: "visa" }))
  .checkpoint("paid");

/**
 * The checkout app over its port fake, with no steps yet: every Pay Story starts here.
 */
export const shopStory = (id: string) => Story.app(shopSetup, { id, fixtures: [ShopFake] });

const cart = (n: number) => Pay.E.Start({ cartId: `c${n}`, intentId: `pi${n}` });

const visa = Pay.E.PayRequested({ paymentMethodId: "visa" });

/**
 * The key the checkout's owed rows are saved under, and a record there in a newer format, as a
 * later release of the app would have left it.
 */
export const checkoutOwed = "owed/Checkout/Pay/checkout-1";

const newerOwed = '{"format":5,"machine":"Checkout/Pay","name":"checkout-1","rows":[]}';

/**
 * A later release left the checkout's owed record in a newer format: each boot reports it unread
 * and keeps its bytes, and the shopper still pays.
 */
export const unreadOwed = shopStory("shop/unread-owed")
  .world(Fake.storage.put(checkoutOwed, newerOwed))
  .ensure(checkout)
  .reload()
  .checkpoint("first boot")
  .send(checkout, cart(1))
  .send(checkout, visa)
  .reload()
  .checkpoint("second boot");

/**
 * A `confirm` reaches the shop and its answer is held, never released; the commit's 60-second
 * deadline passes; the tab reloads; then time moves on.
 */
export const lostConfirm = shopStory("shop/lost-confirm")
  .ensure(checkout)
  .send(checkout, Pay.E.Start({ cartId: "c1", intentId: "pi1" }))
  .world(Shop.confirm.hold({ at: "response" }))
  .send(checkout, visa)
  .advance("59999 millis")
  .checkpoint("before deadline")
  .advance("1001 millis")
  .checkpoint("late")
  .reload()
  .checkpoint("reloaded")
  .advance("10 seconds")
  .checkpoint("after");

/**
 * The shopper pays and goes to close the tab before the shop has taken the confirm, so the page
 * warns that a payment is still out; once the shop answers nothing is left to warn about.
 */
export const leaveWhilePaying = shopStory("shop/leave-while-paying")
  .ensure(checkout)
  .send(checkout, cart(1))
  .world(Shop.confirm.hold())
  .send(checkout, visa)
  .checkpoint("paying")
  .world(Shop.confirm.release())
  .checkpoint("paid");

/**
 * The shopper pays and the shop's order is placed but its answer held; the shopper leaves, starts
 * again and pays, and the held order then answers in a state whose guard denies it.
 */
export const orderDeniedLate = shopStory("shop/order-denied-late")
  .ensure(checkout)
  .send(checkout, cart(1))
  .world(Shop.placeOrder.hold(), Shop.voidAuthorization.hold())
  .send(checkout, visa)
  .send(checkout, Pay.E.Leave())
  .send(checkout, cart(1))
  .world(Shop.confirm.hold())
  .send(checkout, visa)
  .checkpoint("before")
  .world(Shop.placeOrder.release())
  .checkpoint("placed");

/**
 * The shop takes a payment but its answer is lost, and the shopper leaves the checkout, so the app
 * removes it; the tab reloads twice before the shopper opens the checkout again and it takes the
 * unsure payment back.
 */
export const unsurePayRemoved = shopStory("shop/unsure-pay-removed")
  .ensure(checkout)
  .send(checkout, cart(1))
  .world(Shop.confirm.drop({ at: "response" }))
  .send(checkout, visa)
  .checkpoint("unsure")
  .dispose(checkout)
  .checkpoint("removed")
  .reload({ reattach: false })
  .checkpoint("reloaded")
  .reload({ reattach: false })
  .checkpoint("reloaded again")
  .ensure(checkout)
  .checkpoint("adopted");

/**
 * The shopper pays and signs out, so the app disposes its Runtime, over a payment SDK whose session
 * fails to close when the services are released.
 */
export const sessionCloseFails = Story.app(shopSetup, {
  id: "shop/session-close-fails",
  fixtures: [ShopFakeSessionCloseFails],
})
  .ensure(checkout)
  .send(checkout, cart(1))
  .send(checkout, visa)
  .checkpoint("paid")
  .disposeRuntime()
  .checkpoint("signed out");

/**
 * Ada signs in, fills her cart and starts checking out, with the badge on screen; she signs out,
 * so the app disposes its Runtime with every screen still open; the tab reloads with only the
 * badge on screen.
 */
export const signOutMidCheckout = storeStory("shop/sign-out-mid-checkout")
  .ensure(mainShopper)
  .ensure(mainCart)
  .ensure(mainBadge)
  .ensure(mainFlow)
  .send(mainShopper, Shopper.E.SignIn({ name: "ada" }))
  .send(mainCart, Cart.E.Add({ lineId: "l1", variantId: "v1" }))
  .send(mainFlow, CheckoutFlow.E.Begin())
  .checkpoint("checking out")
  .disposeRuntime()
  .checkpoint("signed out")
  .reload({ reattach: false })
  .ensure(mainBadge)
  .checkpoint("badge reopened");

/**
 * The shop turns a confirm away as busy with a negative retry delay: the turn that would arm that
 * retry is refused, refused again on its one redelivery, and given one more try after a reload.
 */
export const busyRefused = shopStory("shop/busy-refused")
  .ensure(checkout)
  .send(checkout, Pay.E.Start({ cartId: "c1", intentId: "pi1" }))
  .world(Shop.busy({ retryAfterMs: -1 }))
  .send(checkout, visa)
  .checkpoint("refused")
  .reload()
  .checkpoint("reloaded");

/**
 * A shopper pays with a double click while the confirm is out, finishes, then meets a declined
 * card, a busy queue that clears, and leaves while a charge is out, which voids the hold.
 */
export const usual = shopStory("shop/usual")
  .ensure(checkout)
  .advance("1 second")
  .send(checkout, cart(1))
  .advance("2 seconds")
  .world(Shop.confirm.hold())
  .send(checkout, visa)
  .send(checkout, visa)
  .advance("2 seconds")
  .world(Shop.confirm.release())
  .checkpoint("paid")
  .advance("2 seconds")
  .send(checkout, Pay.E.Done())
  .send(checkout, cart(2))
  .world(Shop.decline({ code: "card_declined" }))
  .send(checkout, visa)
  .checkpoint("declined")
  .world(Shop.busy({ retryAfterMs: 1500 }))
  .send(checkout, visa)
  .advance("1500 millis")
  .checkpoint("retried")
  .send(checkout, Pay.E.Done())
  .send(checkout, cart(3))
  .world(Shop.confirm.hold({ at: "response" }))
  .send(checkout, visa)
  .send(checkout, Pay.E.Leave())
  .world(Shop.confirm.release())
  .checkpoint("left")
  .detach(checkout)
  .advance("4 seconds")
  .ensure(checkout)
  .checkpoint("end");

type ShopStory = ReturnType<typeof shopStory>;

const paid = (story: ShopStory) =>
  story.send(checkout, visa).advance("1 second").send(checkout, Pay.E.Done());

const landedButLost = (story: ShopStory) =>
  story
    .world(Shop.confirm.drop({ at: "response" }))
    .send(checkout, visa)
    .advance("3 seconds")
    .send(checkout, Pay.E.Done());

const lostThenResent = (story: ShopStory) =>
  story
    .world(Shop.confirm.drop())
    .send(checkout, visa)
    .advance("3 seconds")
    .advance("1 second")
    .send(checkout, Pay.E.Done());

const declinedThenLeft = (story: ShopStory) =>
  story
    .world(Shop.decline({ code: "card_declined" }))
    .send(checkout, visa)
    .send(checkout, Pay.E.Leave())
    .detach(checkout)
    .advance("2 seconds")
    .ensure(checkout);

const round = (story: ShopStory, n: number) => {
  const started = story.advance("1 second").send(checkout, cart(n));
  const variants = [paid, landedButLost, lostThenResent, declinedThenLeft] as const;
  const next = variants[n % variants.length]?.(started) ?? started;

  return n % 3 === 2 ? next.reload() : next;
};

/**
 * Fourteen carts paid, lost after landing, lost and re-sent, or declined and left, with a reload
 * every third cart: about a hundred steps, for the bench.
 */
export const long = Array.from({ length: 14 }, (_, n) => n)
  .reduce(round, shopStory("shop/long").ensure(checkout))
  .checkpoint("end");

const chosen = Pay.E.CardChosen({ paymentMethodId: "visa" });
const startOne = Pay.E.Start({ cartId: "c1", intentId: "pi1" });
const startTwo = Pay.E.Start({ cartId: "c2", intentId: "pi2" });

/**
 * A stress run from seed 36, printed by the generator and pasted here: lost and refused answers
 * and writes, an offline span, disposals and reloads. The reload sweep and the bench run it as any
 * Story.
 */
export const seededStress = shopStory("shop/stress-36")
  .world(Shop.crash({ endpoint: "confirm" }))
  .ensure(checkout)
  .world(Fake.storage.hold())
  .send(checkout, chosen)
  .send(checkout, visa)
  .send(checkout, chosen)
  .send(checkout, startOne)
  .send(checkout, Pay.E.Leave())
  .send(checkout, visa)
  .send(checkout, Pay.E.CheckAgain())
  .send(checkout, Pay.E.Leave())
  .reload({ reattach: false })
  .send(checkout, Pay.E.Leave())
  .send(checkout, Pay.E.CheckAgain())
  .send(checkout, visa)
  .send(checkout, startTwo)
  .send(checkout, visa)
  .send(checkout, Pay.E.Done())
  .send(checkout, visa)
  .world(Fake.storage.hold())
  .send(checkout, Pay.E.CheckAgain())
  .send(checkout, Pay.E.Leave())
  .send(checkout, startOne)
  .world(Fake.network.offline())
  .send(checkout, startTwo)
  .dispose(checkout, { how: "forget" })
  .send(checkout, Pay.E.CheckAgain())
  .send(checkout, Pay.E.Done())
  .advance("20 millis")
  .disposeRuntime()
  .reload({ heldWrites: "land" })
  .advance("7 millis")
  .send(checkout, visa)
  .world(Fake.storage.refuse())
  .advance("20 millis")
  .send(checkout, Pay.E.Done())
  .advance("3 millis")
  .send(checkout, Pay.E.Leave())
  .send(checkout, visa)
  .advance("16 millis")
  .send(checkout, visa)
  .send(checkout, Pay.E.Done())
  .send(checkout, startOne)
  .send(checkout, chosen)
  .world(Fake.storage.refuse())
  .send(checkout, visa)
  .send(checkout, Pay.E.CheckAgain())
  .send(checkout, Pay.E.CheckAgain())
  .send(checkout, startTwo)
  .send(checkout, chosen)
  .world(Fake.storage.hold())
  .advance("5 millis")
  .send(checkout, startTwo)
  .advance("2 millis")
  .send(checkout, visa)
  .advance("17 millis")
  .send(checkout, startOne)
  .send(checkout, visa)
  .send(checkout, chosen)
  .advance("18 millis")
  .send(checkout, startTwo)
  .send(checkout, Pay.E.Leave())
  .send(checkout, startTwo)
  .send(checkout, startTwo)
  .send(checkout, Pay.E.Leave())
  .send(checkout, chosen)
  .world(Fake.storage.refuseLoad())
  .reload({ reattach: false })
  .advance("4 millis")
  .send(checkout, visa)
  .advance("10 millis")
  .send(checkout, chosen)
  .send(checkout, Pay.E.CheckAgain())
  .send(checkout, startTwo)
  .send(checkout, startTwo)
  .send(checkout, startOne)
  .send(checkout, Pay.E.Leave())
  .send(checkout, startTwo)
  .send(checkout, startOne)
  .send(checkout, chosen)
  .send(checkout, visa)
  .send(checkout, startOne)
  .send(checkout, Pay.E.Leave())
  .advance("20 millis")
  .send(checkout, Pay.E.CheckAgain())
  .send(checkout, Pay.E.Leave())
  .send(checkout, startOne)
  .send(checkout, visa)
  .advance("15 millis")
  .send(checkout, startOne)
  .send(checkout, Pay.E.Leave())
  .send(checkout, visa)
  .advance("8 millis")
  .send(checkout, visa)
  .send(checkout, Pay.E.Done())
  .advance("7 millis")
  .send(checkout, visa)
  .send(checkout, Pay.E.CheckAgain())
  .send(checkout, visa)
  .advance("15 millis")
  .send(checkout, startTwo)
  .advance("15 millis")
  .send(checkout, startTwo)
  .advance("56438 millis")
  .world(Fake.network.online())
  .advance("2 minutes")
  .advance("2 minutes");

/**
 * What a shopper and the shop can do, for generated runs: start two carts, choose a card, pay,
 * leave, check again and finish; the shop declines a card, is busy, challenges or lands a charge
 * and then fails.
 */
export const samples = samplesOf({
  id: "shop",
  story: shopStory("shop/samples"),
  names: { setup: "shopSetup", fixtures: ["ShopFake"] },
  actors: { checkout },
  servers: { Shop },
  failures: [
    Shop.decline({ code: "card_declined" }),
    Shop.busy({ retryAfterMs: 1500 }),
    Shop.challenge({}),
    Shop.crash({ endpoint: "confirm" }),
    Fake.storage.put(checkoutOwed, newerOwed),
  ],
  landedFailures: [Shop.landThenFail({})],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(checkout, cart(1))
      .send(checkout, cart(2))
      .send(checkout, chosen)
      .send(checkout, visa)
      .send(checkout, visa)
      .send(checkout, Pay.E.Leave())
      .send(checkout, Pay.E.CheckAgain())
      .send(checkout, Pay.E.Done()),
});

/**
 * Every Story of the fixture, by name.
 */
export const stories = {
  lostConfirm,
  orderDeniedLate,
  busyRefused,
  usual,
  long,
  seededStress,
  unreadOwed,
};
