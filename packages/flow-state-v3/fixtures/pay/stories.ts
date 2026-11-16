import { Fake, samplesOf, Story } from "../../src/host/testing/index.ts";
import { checkout, shopSetup } from "./machine.ts";
import { Shop, ShopFake } from "./server.ts";

/**
 * The checkout app over its port fake, with no steps yet: every Pay Story starts here.
 */
export const shopStory = (id: string) => Story.app(shopSetup, { id, fixtures: [ShopFake] });

const cart = (n: number) => ({ _tag: "Start", cartId: `c${n}`, intentId: `pi${n}` }) as const;

const visa = { _tag: "PayRequested", paymentMethodId: "visa" } as const;

/**
 * The key the checkout's owed rows are saved under, and a record there in a newer format, as a
 * later release of the app would have left it.
 */
export const checkoutOwed = "owed/Checkout/Pay/checkout-1";

const newerOwed = '{"format":2,"machine":"Checkout/Pay","name":"checkout-1","rows":[]}';

/**
 * A later release left the checkout's owed record in a newer format: each boot reports it unread
 * and keeps its bytes, and the shopper still pays.
 */
export const unreadOwed = shopStory("pay/unread-owed")
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
export const lostConfirm = shopStory("pay/lost-confirm")
  .ensure(checkout)
  .send(checkout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
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
 * The shop turns a confirm away as busy with a negative retry delay: the turn that would arm that
 * retry is refused, refused again on its one redelivery, and given one more try after a reload.
 */
export const busyRefused = shopStory("pay/busy-refused")
  .ensure(checkout)
  .send(checkout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .world(Shop.busy({ retryAfterMs: -1 }))
  .send(checkout, visa)
  .checkpoint("refused")
  .reload()
  .checkpoint("reloaded");

/**
 * A shopper pays with a double click while the confirm is out, finishes, then meets a declined
 * card, a busy queue that clears, and leaves while a charge is out, which voids the hold.
 */
export const usual = shopStory("pay/usual")
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
  .send(checkout, { _tag: "Done" })
  .send(checkout, cart(2))
  .world(Shop.decline({ code: "card_declined" }))
  .send(checkout, visa)
  .checkpoint("declined")
  .world(Shop.busy({ retryAfterMs: 1500 }))
  .send(checkout, visa)
  .advance("1500 millis")
  .checkpoint("retried")
  .send(checkout, { _tag: "Done" })
  .send(checkout, cart(3))
  .world(Shop.confirm.hold({ at: "response" }))
  .send(checkout, visa)
  .send(checkout, { _tag: "Leave" })
  .world(Shop.confirm.release())
  .checkpoint("left")
  .detach(checkout)
  .advance("4 seconds")
  .ensure(checkout)
  .checkpoint("end");

type ShopStory = ReturnType<typeof shopStory>;

const paid = (story: ShopStory) =>
  story.send(checkout, visa).advance("1 second").send(checkout, { _tag: "Done" });

const landedButLost = (story: ShopStory) =>
  story
    .world(Shop.confirm.drop({ at: "response" }))
    .send(checkout, visa)
    .advance("3 seconds")
    .send(checkout, { _tag: "Done" });

const lostThenResent = (story: ShopStory) =>
  story
    .world(Shop.confirm.drop())
    .send(checkout, visa)
    .advance("3 seconds")
    .advance("1 second")
    .send(checkout, { _tag: "Done" });

const declinedThenLeft = (story: ShopStory) =>
  story
    .world(Shop.decline({ code: "card_declined" }))
    .send(checkout, visa)
    .send(checkout, { _tag: "Leave" })
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
  .reduce(round, shopStory("pay/long").ensure(checkout))
  .checkpoint("end");

/**
 * A stress run from seed 36, printed by the generator and pasted here: lost and refused answers
 * and writes, an offline span, disposals and reloads. The reload sweep and the bench run it as any
 * Story.
 */
export const seededStress = Story.app(shopSetup, { id: "pay/stress-36", fixtures: [ShopFake] })
  .world(Shop.crash({ endpoint: "confirm" }))
  .ensure(checkout)
  .world(Fake.storage.hold())
  .send(checkout, { _tag: "CardChosen", paymentMethodId: "visa" })
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(checkout, { _tag: "CardChosen", paymentMethodId: "visa" })
  .send(checkout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(checkout, { _tag: "Leave" })
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(checkout, { _tag: "CheckAgain" })
  .send(checkout, { _tag: "Leave" })
  .reload({ reattach: false })
  .send(checkout, { _tag: "Leave" })
  .send(checkout, { _tag: "CheckAgain" })
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(checkout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(checkout, { _tag: "Done" })
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .world(Fake.storage.hold())
  .send(checkout, { _tag: "CheckAgain" })
  .send(checkout, { _tag: "Leave" })
  .send(checkout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .world(Fake.network.offline())
  .send(checkout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .dispose(checkout, { how: "forget" })
  .send(checkout, { _tag: "CheckAgain" })
  .send(checkout, { _tag: "Done" })
  .advance("20 millis")
  .disposeRuntime()
  .reload({ heldWrites: "land" })
  .advance("7 millis")
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .world(Fake.storage.refuse())
  .advance("20 millis")
  .send(checkout, { _tag: "Done" })
  .advance("3 millis")
  .send(checkout, { _tag: "Leave" })
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .advance("16 millis")
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(checkout, { _tag: "Done" })
  .send(checkout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(checkout, { _tag: "CardChosen", paymentMethodId: "visa" })
  .world(Fake.storage.refuse())
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(checkout, { _tag: "CheckAgain" })
  .send(checkout, { _tag: "CheckAgain" })
  .send(checkout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(checkout, { _tag: "CardChosen", paymentMethodId: "visa" })
  .world(Fake.storage.hold())
  .advance("5 millis")
  .send(checkout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .advance("2 millis")
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .advance("17 millis")
  .send(checkout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(checkout, { _tag: "CardChosen", paymentMethodId: "visa" })
  .advance("18 millis")
  .send(checkout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(checkout, { _tag: "Leave" })
  .send(checkout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(checkout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(checkout, { _tag: "Leave" })
  .send(checkout, { _tag: "CardChosen", paymentMethodId: "visa" })
  .reload({ reattach: false })
  .advance("4 millis")
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .world(Fake.storage.hold())
  .advance("10 millis")
  .send(checkout, { _tag: "CardChosen", paymentMethodId: "visa" })
  .world(Fake.storage.refuse())
  .send(checkout, { _tag: "CheckAgain" })
  .send(checkout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(checkout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(checkout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(checkout, { _tag: "Leave" })
  .send(checkout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(checkout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(checkout, { _tag: "CardChosen", paymentMethodId: "visa" })
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(checkout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(checkout, { _tag: "Leave" })
  .advance("20 millis")
  .send(checkout, { _tag: "CheckAgain" })
  .send(checkout, { _tag: "Leave" })
  .send(checkout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .advance("15 millis")
  .send(checkout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(checkout, { _tag: "Leave" })
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .advance("8 millis")
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(checkout, { _tag: "Done" })
  .advance("7 millis")
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(checkout, { _tag: "CheckAgain" })
  .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .advance("15 millis")
  .send(checkout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .advance("15 millis")
  .send(checkout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .advance("56438 millis")
  .world(Fake.network.online())
  .advance("2 minutes")
  .world(Fake.storage.release())
  .advance("2 minutes")
  .advance("2 minutes");

/**
 * What a shopper and the shop can do, for generated runs: start two carts, choose a card, pay,
 * leave, check again and finish; the shop declines a card, is busy, challenges or lands a charge
 * and then fails.
 */
export const samples = samplesOf({
  id: "pay",
  story: shopStory("pay/samples"),
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
      .send(checkout, { _tag: "CardChosen", paymentMethodId: "visa" })
      .send(checkout, visa)
      .send(checkout, visa)
      .send(checkout, { _tag: "Leave" })
      .send(checkout, { _tag: "CheckAgain" })
      .send(checkout, { _tag: "Done" }),
});

/**
 * Every Story of the fixture, by name.
 */
export const stories = {
  lostConfirm,
  busyRefused,
  usual,
  long,
  seededStress,
  unreadOwed,
};
