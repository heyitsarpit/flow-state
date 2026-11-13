// The cart's checks. Each test runs its Story once, destructures the checkpoints it names, and reads them with the
// runner's own `expect` (machine-design 2.10.6).
import { expect, test } from "vite-plus/test";
import { Stripe } from "../../testing/stripe.fake.js";
import { CartPage } from "./cart.definition.js";
import { CartLine } from "./cart.domain.js";
import {
  badCoupon,
  CART,
  cartHydrated,
  couponOnTheWire,
  fiveTaps,
  linesIndependent,
  opened,
  pageAndHeader,
  removeAsked,
  repricedUnderPending,
  waitsBehindUnsure,
} from "./cart.story.js";

const { S, O } = CartPage;

const l = (lineId: string) => ({ ...CART, lineId });

test("the cart opens with a stepper per confirmed line", async () => {
  const { cart } = (await opened.run()).checkpoints;
  expect(cart.memory.lineIds).toEqual(["l1", "l2"]);
  expect(cart.memory.steppers.map((c) => [c.key, c.quantity])).toEqual([
    ["l1", 1],
    ["l2", 2],
  ]);
  expect(cart.operations.product).toHaveLength(2); // one session per product the lines name (E19)
});

test("five taps are two requests, and the total is predicted at once", async () => {
  const { quantityCoalesced, quantitySaved } = (await fiveTaps.run()).checkpoints;
  expect(quantityCoalesced.entity(CartLine, l("l2"))).toMatchObject({
    data: { quantity: 7, lineTotalCents: 8_400 }, // 7 x $12, from the price beneath (E14)
    predicted: true,
  });
  // Work in progress: the lane is on the wire with a tap waiting behind it.
  expect(quantityCoalesced.lane(O.setQuantity, l("l2"))).toMatchObject({
    pending: true,
    waiting: true,
  });
  expect(quantityCoalesced.records("lane", { operation: O.setQuantity })).toContainEqual(
    expect.objectContaining({ cell: expect.objectContaining({ evidence: "Superseded" }) }),
  );
  const sent = quantitySaved.read(Stripe.setQuantity).map((r) => r.input.quantity);
  expect(sent).toEqual([3, 7]); // two requests for five taps (O4)
  expect(quantitySaved.read(Stripe).shop.carts[0]?.lines[1]?.quantity).toBe(7);
});

test("two lines are two lanes", async () => {
  const { bothSent } = (await linesIndependent.run()).checkpoints;
  expect(bothSent.read(Stripe.setQuantity)).toHaveLength(2);
});

test("a tap behind an unsure change waits, then goes", async () => {
  const { lineUnsure, waitingBehindUnsure, caughtUp } = (await waitsBehindUnsure.run()).checkpoints;
  expect(lineUnsure.lane(O.setQuantity, l("l2"))).toMatchObject({ retryCount: 1 }); // the same Attempt
  expect(waitingBehindUnsure.lane(O.setQuantity, l("l2"))).toMatchObject({ waiting: true });
  const keys = caughtUp.read(Stripe.setQuantity).map((r) => r.input.key);
  expect(keys[0]).toBe(keys[1]); // the re-send carried the first Attempt's id
  expect(caughtUp.read(Stripe).shop.carts[0]?.lines[1]?.quantity).toBe(4);
});

test("minus at one asks first, and removes exactly that line", async () => {
  const { asking, removed } = (await removeAsked.run()).checkpoints;
  expect(asking.state).toBe(S.REMOVING);
  expect(asking.memory.REMOVING?.lineId).toBe("l1");
  expect(asking.entity(CartLine, l("l1"))).toBeDefined(); // there before the removal, so `undefined` below is gone
  expect(removed.records("exit", { instance: ["REMOVING"] })).toMatchObject([
    { name: "Remove", payload: { lineId: "l1" } },
  ]);
  expect(removed.entity(CartLine, l("l1"))).toBeUndefined();
});

test("the coupon is predicted, a second code is refused, the shop's answer wins", async () => {
  const { couponPredicted, secondCodeRefused, couponApplied } = (await couponOnTheWire.run())
    .checkpoints;
  expect(couponPredicted.memory.coupon).toMatchObject({
    status: "applying",
    predictedTotalCents: 6_210,
  });
  expect(secondCodeRefused.read(Stripe.applyCoupon)).toHaveLength(1); // refused before anything was sent
  expect(secondCodeRefused.records("verdict", { event: CartPage.E.ApplyCoupon })).toContainEqual(
    expect.objectContaining({
      result: expect.objectContaining({
        _tag: "Denied",
        reasons: [expect.objectContaining({ code: "InFlight" })],
      }),
    }),
  );
  expect(couponApplied.memory.coupon.status).toBe("applied");
  // The cart's read was invalidated by the operation's `writes` and read again (O22, rule 36).
  expect(couponApplied.read(Stripe.cart).length).toBeGreaterThan(
    couponPredicted.read(Stripe.cart).length,
  );
});

test("a refused coupon says why", async () => {
  const { couponRejected } = (await badCoupon.run()).checkpoints;
  expect(couponRejected.memory.coupon).toMatchObject({
    status: "refused",
    reason: "That code is not valid",
  });
});

test("the page's change and the header's removal queue on one line", async () => {
  const { shown, queuedOnOneLine, bothSettled } = (await pageAndHeader.run()).checkpoints;
  const queues = queuedOnOneLine.inspection?.domains.cart.queues;
  // design gap: a queue entry's fields beyond `entity` are not shown (merge 5 names the queue, not its row);
  // `key` and `items` (the Attempts in order) are assumed.
  expect(queues).toContainEqual(
    expect.objectContaining({
      entity: "Checkout/CartLine",
      key: l("l1"),
      items: [expect.anything(), expect.anything()],
    }), // E12
  );
  expect(shown.entity(CartLine, l("l1"))).toBeDefined(); // there before the removal, so `undefined` below is hidden
  expect(queuedOnOneLine.entity(CartLine, l("l1"))).toBeUndefined(); // hidden on both screens
  expect(bothSettled.read(Stripe).shop.carts[0]?.lines.map((x) => x.lineId)).toEqual(["l2"]);
});

test("a re-price under a pending change replays over the new base", async () => {
  const { replayedOverNewPrice, repriced } = (await repricedUnderPending.run()).checkpoints;
  // 2 x $50 over the new base, while the change is still on the wire (E11).
  expect(replayedOverNewPrice.entity(CartLine, l("l1"))).toMatchObject({
    data: { quantity: 2, unitPriceCents: 5_000, lineTotalCents: 10_000 },
    predicted: true,
  });
  // design gap: `checkReplays` reports a "prediction fault" (M5-D10 9.9); its record code is not named, so
  // `PredictionFault` is assumed.
  expect(replayedOverNewPrice.records("diagnostic")).not.toContainEqual(
    expect.objectContaining({ code: "PredictionFault" }),
  );
  expect(repriced.entity(CartLine, l("l1"))).toMatchObject({ predicted: false });
});

test("a coupon on the wire at the capture deadline is recorded, not hydrated", async () => {
  const { hydratedWithoutCoupon } = (await cartHydrated.run()).checkpoints;
  expect(hydratedWithoutCoupon.records("hydration")).toContainEqual(
    expect.objectContaining({
      code: "DehydrateCommitInFlight",
      operation: "Checkout/apply-coupon",
    }),
  );
  expect(hydratedWithoutCoupon.inspection?.lanes).toEqual([]); // lanes are never hydrated
});
