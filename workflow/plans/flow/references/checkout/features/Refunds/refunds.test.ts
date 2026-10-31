// The refunds page's checks (`@flow-state/vitest`, proposed; cart.test.ts says what `at` is).
import { storyTest } from "@flow-state/vitest"; // NEW (proposed)
import { Story } from "flow-state/testing";
import { expect } from "vite-plus/test";
import { Stripe } from "../../testing/stripe.fake.js";
import { Refunds } from "./refunds.definition.js";
import { Order } from "./refunds.domain.js";
import { refundsRef } from "./refunds.ref.js";
import {
  overloaded,
  refundsQueued,
  reloadMidRefund,
  unsureHoldsTheCharge,
} from "./refunds.story.js";

const { O } = Refunds;

const ch9 = { chargeId: "ch_9" };

storyTest(refundsQueued, ({ at }) => {
  const cut = at["refunds-queued"];
  expect(O.refund.get(cut, ch9)).toMatchObject({ pending: true, outstanding: 3 });
  expect(cut.read(Stripe.refund)).toHaveLength(1); // one on the wire, two queued behind it
  // $40 + $30 + $50 predicted over the record beneath; the server will refuse the last.
  expect(cut.read(Story.entity(Order, { orderId: "o-9" }))).toMatchObject({
    data: { refundedCents: 12_000, status: "refunded" },
    predicted: true,
  });
  const settled = at["refunds-settled"];
  expect(settled.read(Stripe.refund).map((r) => r.input.amountCents)).toEqual([
    4_000, 3_000, 5_000,
  ]); // in order
  expect(settled.read(Stripe).shop.orders.find((o) => o.orderId === "o-9")?.refundedCents).toBe(
    7_000,
  );
  expect(settled.memory.notice).toBe("Only $20.00 is left to refund on that charge.");
  expect(settled.read(Story.entity(Order, { orderId: "o-9" }))).toMatchObject({
    data: { refundedCents: 7_000 },
    predicted: false,
  });
  // Each landing invalidated the orders list (O22).
  expect(settled.read(Stripe.orders).length).toBeGreaterThan(cut.read(Stripe.orders).length);
});

storyTest(unsureHoldsTheCharge, ({ at }) => {
  expect(O.refund.get(at["second-waits"], ch9)).toMatchObject({ uncertain: true, outstanding: 2 });
  expect(at["both-refunded"].read(Stripe).shop.refunds).toHaveLength(2); // the re-send was deduped by its key
});

storyTest(reloadMidRefund, ({ at }) => {
  const order = at["reloaded-mid-refund"].read(Story.entity(Order, { orderId: "o-9" }));
  expect(order).toMatchObject({ uncertain: true }); // the stored mark, not a prediction (E18)
  expect(at["reloaded-mid-refund"].read(refundsRef)).toBeDefined();
  expect(at.repaired.read(Story.entity(Order, { orderId: "o-9" }))).toMatchObject({
    data: { refundedCents: 2_000 },
    uncertain: false,
  });
});

storyTest(overloaded, ({ at }) => {
  expect(at.overloaded.memory.notice).toBe("Too many refunds queued on this charge.");
  expect(O.refund.get(at.overloaded, ch9)).toMatchObject({ outstanding: 64 });
});
