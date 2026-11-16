import { Fake, samplesOf, Story } from "../../src/host/testing/index.ts";
import { cellsCheckout, cellsSetup } from "./machine.ts";
import { Shop, ShopFake, ShopFakeSteadfast } from "./server.ts";

/**
 * The Cells checkout over its port fake, with no steps yet: every Cells Story starts here.
 */
export const cellsStory = (id: string) => Story.app(cellsSetup, { id, fixtures: [ShopFake] });

const cart = (n: number) => ({ _tag: "Start", cartId: `c${n}`, intentId: `pi${n}` }) as const;

const visa = { _tag: "PayRequested", paymentMethodId: "visa" } as const;

/**
 * A shopper aborts before paying, pays through a busy queue, then aborts a charge whose answer was
 * lost, which releases the hold, and leaves.
 */
export const usual = cellsStory("cells/usual")
  .ensure(cellsCheckout)
  .advance("1 second")
  .send(cellsCheckout, cart(1))
  .send(cellsCheckout, { _tag: "AbortPay" })
  .advance("2 seconds")
  .world(Shop.busy({ retryAfterMs: 1500 }))
  .send(cellsCheckout, visa)
  .advance("1500 millis")
  .checkpoint("paid")
  .send(cellsCheckout, { _tag: "Done" })
  .send(cellsCheckout, cart(2))
  .world(Shop.confirm.drop())
  .send(cellsCheckout, visa)
  .checkpoint("unsure")
  .send(cellsCheckout, { _tag: "AbortPay" })
  .checkpoint("aborted")
  .advance("3 seconds")
  .send(cellsCheckout, { _tag: "Leave" })
  .detach(cellsCheckout)
  .advance("4 seconds")
  .ensure(cellsCheckout)
  .checkpoint("end");

type CellsStory = ReturnType<typeof cellsStory>;

const abortedOnTheWire = (story: CellsStory) =>
  story
    .world(Shop.confirm.hold({ at: "response" }))
    .send(cellsCheckout, visa)
    .send(cellsCheckout, { _tag: "AbortPay" })
    .world(Shop.confirm.release())
    .advance("3 seconds")
    .send(cellsCheckout, { _tag: "Leave" });

const abortedWhileUnsure = (story: CellsStory) =>
  story
    .world(Shop.confirm.drop())
    .send(cellsCheckout, visa)
    .send(cellsCheckout, { _tag: "AbortPay" })
    .advance("3 seconds")
    .send(cellsCheckout, { _tag: "Leave" });

const paid = (story: CellsStory) =>
  story
    .send(cellsCheckout, { _tag: "AbortPay" })
    .send(cellsCheckout, visa)
    .advance("1 second")
    .send(cellsCheckout, { _tag: "Done" });

const round = (story: CellsStory, n: number) => {
  const started = story.advance("1 second").send(cellsCheckout, cart(n));
  const variants = [paid, abortedOnTheWire, abortedWhileUnsure] as const;
  const next = variants[n % variants.length]?.(started) ?? started;

  return n % 4 === 3 ? next.reload() : next;
};

/**
 * Fourteen carts paid, aborted on the wire or aborted while unsure, with a reload every fourth:
 * about a hundred steps, for the bench.
 */
export const long = Array.from({ length: 14 }, (_, n) => n)
  .reduce(round, cellsStory("cells/long").ensure(cellsCheckout))
  .checkpoint("end");

/**
 * A stress run from seed 56, printed by the generator and pasted here, over the uninterruptible
 * port fake. The reload sweep and the bench run it as any Story.
 */
export const seededStress = Story.app(cellsSetup, {
  id: "cells/stress-56",
  fixtures: [ShopFakeSteadfast],
})
  .ensure(cellsCheckout)
  .world(Fake.storage.hold())
  .advance("7 millis")
  .send(cellsCheckout, { _tag: "Done" })
  .advance("5 millis")
  .advance("5 millis")
  .send(cellsCheckout, { _tag: "Done" })
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .world(Fake.storage.refuse())
  .advance("15 millis")
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Done" })
  .advance("20 millis")
  .advance("20 millis")
  .advance("4 millis")
  .advance("10 millis")
  .send(cellsCheckout, { _tag: "Leave" })
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(cellsCheckout, { _tag: "Leave" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(cellsCheckout, { _tag: "CheckAgain" })
  .send(cellsCheckout, { _tag: "Done" })
  .advance("20 millis")
  .send(cellsCheckout, { _tag: "CheckAgain" })
  .send(cellsCheckout, { _tag: "AbortPay" })
  .advance("10 millis")
  .advance("10 millis")
  .send(cellsCheckout, { _tag: "AbortPay" })
  .advance("6 millis")
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(cellsCheckout, { _tag: "CheckAgain" })
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(cellsCheckout, { _tag: "AbortPay" })
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .advance("13 millis")
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .world(Fake.network.offline())
  .send(cellsCheckout, { _tag: "AbortPay" })
  .send(cellsCheckout, { _tag: "Leave" })
  .advance("16 millis")
  .advance("11 millis")
  .send(cellsCheckout, { _tag: "AbortPay" })
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .advance("15 millis")
  .advance("11 millis")
  .advance("10 millis")
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(cellsCheckout, { _tag: "AbortPay" })
  .advance("61461 millis")
  .world(Fake.network.online())
  .advance("2 millis")
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .advance("1 millis")
  .advance("12 millis")
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .advance("5 millis")
  .send(cellsCheckout, { _tag: "AbortPay" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "AbortPay" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(cellsCheckout, { _tag: "AbortPay" })
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(cellsCheckout, { _tag: "AbortPay" })
  .advance("17 millis")
  .send(cellsCheckout, { _tag: "AbortPay" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .advance("14 millis")
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(cellsCheckout, { _tag: "Done" })
  .send(cellsCheckout, { _tag: "Leave" })
  .advance("9 millis")
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Leave" })
  .send(cellsCheckout, { _tag: "AbortPay" })
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .advance("14 millis")
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .advance("17 millis")
  .advance("3 millis")
  .advance("5 millis")
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "AbortPay" })
  .send(cellsCheckout, { _tag: "AbortPay" })
  .send(cellsCheckout, { _tag: "Done" })
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(cellsCheckout, { _tag: "Leave" })
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .advance("5 millis")
  .send(cellsCheckout, { _tag: "Done" })
  .detach(cellsCheckout)
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .advance("2 minutes")
  .world(Fake.storage.release())
  .advance("2 minutes")
  .advance("2 minutes");

/**
 * What a shopper and the shop can do, for generated runs: Pay's gestures and aborting a payment;
 * the shop declines, is busy, challenges, lands then fails, or crashes.
 */
export const samples = samplesOf({
  id: "cells",
  story: Story.app(cellsSetup, { id: "cells/samples", fixtures: [ShopFakeSteadfast] }),
  names: { setup: "cellsSetup", fixtures: ["ShopFakeSteadfast"] },
  actors: { cellsCheckout },
  servers: { Shop },
  failures: [
    Shop.decline({ code: "card_declined" }),
    Shop.busy({ retryAfterMs: 1500 }),
    Shop.challenge({}),
    Shop.crash({ endpoint: "confirm" }),
  ],
  landedFailures: [Shop.landThenFail({})],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(cellsCheckout, cart(1))
      .send(cellsCheckout, cart(2))
      .send(cellsCheckout, visa)
      .send(cellsCheckout, visa)
      .send(cellsCheckout, { _tag: "AbortPay" })
      .send(cellsCheckout, { _tag: "AbortPay" })
      .send(cellsCheckout, { _tag: "Leave" })
      .send(cellsCheckout, { _tag: "CheckAgain" })
      .send(cellsCheckout, { _tag: "Done" }),
});

/**
 * Every Story of the fixture, by name.
 */
export const stories = { usual, long, seededStress };
