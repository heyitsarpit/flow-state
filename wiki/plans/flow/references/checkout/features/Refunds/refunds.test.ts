// The refunds page's checks (machine-design 2.10.6): each test runs its Story once and reads the checkpoints.
import { expect, test } from "vite-plus/test";
import { Stripe } from "../../testing/stripe.fake.js";
import { Refunds } from "./refunds.definition.js";
import { Order } from "./refunds.domain.js";
import { refundsRef } from "./refunds.ref.js";
import {
  reloadMidRefund,
  sixtyFiveRefunds,
  threeRefunds,
  unsureHoldsTheCharge,
} from "./refunds.story.js";

const { O } = Refunds;

const ch9 = { chargeId: "ch_9" };

test("three refunds queue in order, are predicted at once, and the third is refused", async () => {
  const { refundsQueued, refundsSettled } = (await threeRefunds.run()).checkpoints;
  // Work in progress: three outstanding on the charge's lane.
  expect(refundsQueued.lane(O.refund, ch9)).toMatchObject({ pending: true, outstanding: 2 });
  expect(refundsQueued.read(Stripe.refund)).toHaveLength(1); // one on the wire, two queued behind it
  // $40 + $30 + $50 predicted over the record beneath; the server will refuse the last.
  expect(refundsQueued.entity(Order, { orderId: "o-9" })).toMatchObject({
    data: { refundedCents: 12_000, status: "refunded" },
    predicted: true,
  });
  expect(refundsSettled.read(Stripe.refund).map((r) => r.input.amountCents)).toEqual([
    4_000, 3_000, 5_000,
  ]); // in order
  expect(
    refundsSettled.read(Stripe).shop.orders.find((o) => o.orderId === "o-9")?.refundedCents,
  ).toBe(7_000);
  expect(refundsSettled.memory.notice).toBe("Only $20.00 is left to refund on that charge.");
  expect(refundsSettled.entity(Order, { orderId: "o-9" })).toMatchObject({
    data: { refundedCents: 7_000 },
    predicted: false,
  });
  // Each landing invalidated the orders list (O22).
  expect(refundsSettled.read(Stripe.orders).length).toBeGreaterThan(
    refundsQueued.read(Stripe.orders).length,
  );
});

test("a lost answer holds the charge's lane until the re-send answers", async () => {
  const { secondWaits, bothRefunded } = (await unsureHoldsTheCharge.run()).checkpoints;
  expect(secondWaits.lane(O.refund, ch9)).toMatchObject({
    pending: true,
    retryCount: 1,
    outstanding: 1,
  });
  expect(bothRefunded.read(Stripe).shop.refunds).toHaveLength(2); // the re-send was deduped by its key
});

test("a reload mid-refund keeps the order uncertain until the list repairs it", async () => {
  const { reloadedMidRefund, repaired } = (await reloadMidRefund.run()).checkpoints;
  expect(reloadedMidRefund.entity(Order, { orderId: "o-9" })).toMatchObject({ uncertain: true }); // the stored mark, not a prediction (E18)
  expect(reloadedMidRefund.read(refundsRef)).toBeDefined();
  expect(repaired.entity(Order, { orderId: "o-9" })).toMatchObject({
    data: { refundedCents: 2_000 },
    uncertain: false,
  });
});

test("the 65th refund on one charge is not sent", async () => {
  const { overloaded } = (await sixtyFiveRefunds.run()).checkpoints;
  expect(overloaded.memory.notice).toBe("Too many refunds queued on this charge.");
  expect(overloaded.lane(O.refund, ch9)).toMatchObject({ outstanding: 64 });
});
