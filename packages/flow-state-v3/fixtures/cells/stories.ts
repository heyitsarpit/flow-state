import { Story } from "../../src/host/testing/index.ts";
import { cellsCheckout, cellsSetup } from "./machine.ts";
import { Shop, ShopFake } from "./server.ts";

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
 * Every Story of the fixture, by name.
 */
export const stories = { usual, long };
