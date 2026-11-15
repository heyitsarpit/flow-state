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
 * A stress run from seed 50, printed by the generator and pasted here, over the uninterruptible
 * port fake. The reload sweep and the bench run it as any Story.
 */
export const seededStress = Story.app(cellsSetup, {
  id: "cells/stress-50",
  fixtures: [ShopFakeSteadfast],
})
  .world(Shop.confirm.drop({ at: "response" }))
  .world(Shop.crash({ endpoint: "confirm" }))
  .ensure(cellsCheckout)
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "CheckAgain" })
  .send(cellsCheckout, { _tag: "CheckAgain" })
  .send(cellsCheckout, { _tag: "CheckAgain" })
  .send(cellsCheckout, { _tag: "CheckAgain" })
  .send(cellsCheckout, { _tag: "CheckAgain" })
  .send(cellsCheckout, { _tag: "CheckAgain" })
  .send(cellsCheckout, { _tag: "CheckAgain" })
  .send(cellsCheckout, { _tag: "CheckAgain" })
  .send(cellsCheckout, { _tag: "CheckAgain" })
  .send(cellsCheckout, { _tag: "CheckAgain" })
  .send(cellsCheckout, { _tag: "CheckAgain" })
  .send(cellsCheckout, { _tag: "CheckAgain" })
  .send(cellsCheckout, { _tag: "CheckAgain" })
  .send(cellsCheckout, { _tag: "CheckAgain" })
  .send(cellsCheckout, { _tag: "CheckAgain" })
  .send(cellsCheckout, { _tag: "CheckAgain" })
  .send(cellsCheckout, { _tag: "CheckAgain" })
  .send(cellsCheckout, { _tag: "CheckAgain" })
  .advance("4 millis")
  .dispose(cellsCheckout)
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .advance("16 millis")
  .disposeRuntime()
  .reload()
  .advance("15 millis")
  .send(cellsCheckout, { _tag: "AbortPay" })
  .ensure(cellsCheckout)
  .world(Fake.storage.hold())
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .world(Fake.storage.refuse())
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .advance("1 millis")
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .advance("19 millis")
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .advance("18 millis")
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .advance("13 millis")
  .send(cellsCheckout, { _tag: "AbortPay" })
  .advance("8 millis")
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .advance("6 millis")
  .advance("7 millis")
  .advance("7 millis")
  .send(cellsCheckout, { _tag: "AbortPay" })
  .advance("12 millis")
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .advance("16 millis")
  .advance("16 millis")
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Done" })
  .send(cellsCheckout, { _tag: "Done" })
  .advance("1 millis")
  .reload()
  .advance("1 millis")
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .detach(cellsCheckout)
  .advance("15 millis")
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .world(Shop.decline({ code: "card_declined" }))
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .advance("2 millis")
  .send(cellsCheckout, { _tag: "AbortPay" })
  .world(Fake.storage.refuse())
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .advance("4 millis")
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .advance("4 millis")
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "AbortPay" })
  .world(Fake.storage.refuse())
  .send(cellsCheckout, { _tag: "AbortPay" })
  .send(cellsCheckout, { _tag: "PayRequested", paymentMethodId: "visa" })
  .advance("4 millis")
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .advance("7 millis")
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .advance("6 millis")
  .advance("10 millis")
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .advance("9 millis")
  .dispose(cellsCheckout, { how: "forget" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "AbortPay" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .advance("20 millis")
  .send(cellsCheckout, { _tag: "AbortPay" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .advance("13 millis")
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .advance("7 millis")
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "AbortPay" })
  .send(cellsCheckout, { _tag: "Done" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .advance("16 millis")
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
  .send(cellsCheckout, { _tag: "Start", cartId: "c2", intentId: "pi2" })
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
