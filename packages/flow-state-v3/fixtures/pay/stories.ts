import { Story } from "../../src/host/testing/index.ts";
import { checkout, shopSetup } from "./machine.ts";
import { Shop, ShopFake } from "./server.ts";

/**
 * The checkout app over its port fake, with no steps yet: every Pay Story starts here.
 */
export const shopStory = (id: string) => Story.app(shopSetup, { id, fixtures: [ShopFake] });

const cart = (n: number) => ({ _tag: "Start", cartId: `c${n}`, intentId: `pi${n}` }) as const;

const visa = { _tag: "PayRequested", paymentMethodId: "visa" } as const;

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
 * Every Story of the fixture, by name.
 */
export const stories = { lostConfirm, busyRefused, usual, long };
