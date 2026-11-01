// The cart's checks (`@flow-state/vitest`, proposed). `storyTest(story, ({ at }) => …)` runs the Story once and
// hands each named checkpoint as `at.<name>`: the snapshot there, with `read` for the world and the records
// (the desk's editor.test.ts explains the shape).
import { storyTest } from "@flow-state/vitest"; // NEW (proposed)
import { Story } from "flow-state/testing";
import { expect } from "vite-plus/test";
import { Stripe } from "../../testing/stripe.fake.js";
import { CartPage } from "./cart.definition.js";
import { CartLine } from "./cart.domain.js";
import {
  CART,
  cartHydrated,
  couponPredicted,
  couponRejected,
  linesIndependent,
  opened,
  pageAndHeader,
  quantityCoalesced,
  removeAsked,
  repricedUnderPending,
  waitsBehindUnsure,
} from "./cart.story.js";

const { S, O } = CartPage;

const l = (lineId: string) => ({ ...CART, lineId });

storyTest(opened, ({ at }) => {
  expect(at.cart.memory.lineIds).toEqual(["l1", "l2"]);
  expect(at.cart.memory.steppers.map((c) => [c.key, c.quantity])).toEqual([
    ["l1", 1],
    ["l2", 2],
  ]);
  expect(at.cart.operations.product).toHaveLength(2); // one session per product the lines name (E19)
});

storyTest(quantityCoalesced, ({ at }) => {
  const cut = at["quantity-coalesced"];
  expect(cut.read(Story.entity(CartLine, l("l2")))).toMatchObject({
    data: { quantity: 7, lineTotalCents: 8_400 }, // 7 × $12, from the price beneath (E14)
    predicted: true,
  });
  expect(O.setQuantity.get(cut, l("l2"))).toMatchObject({ pending: true, waiting: true });
  expect(cut.read(Story.records("lane", { operation: O.setQuantity }))).toContainEqual(
    expect.objectContaining({ cell: expect.objectContaining({ evidence: "Superseded" }) }),
  );
  const sent = at["quantity-saved"].read(Stripe.setQuantity).map((r) => r.input.quantity);
  expect(sent).toEqual([3, 7]); // two requests for five taps (O4)
  expect(at["quantity-saved"].read(Stripe).shop.carts[0]?.lines[1]?.quantity).toBe(7);
});

storyTest(linesIndependent, ({ at }) => {
  expect(at["both-sent"].read(Stripe.setQuantity)).toHaveLength(2);
});

storyTest(waitsBehindUnsure, ({ at }) => {
  expect(O.setQuantity.get(at["line-unsure"], l("l2"))).toMatchObject({ retryCount: 1 }); // the same Attempt
  expect(O.setQuantity.get(at["waiting-behind-unsure"], l("l2"))).toMatchObject({ waiting: true });
  const keys = at["caught-up"].read(Stripe.setQuantity).map((r) => r.input.key);
  expect(keys[0]).toBe(keys[1]); // the re-send carried the first Attempt's id
  expect(at["caught-up"].read(Stripe).shop.carts[0]?.lines[1]?.quantity).toBe(4);
});

storyTest(removeAsked, ({ at }) => {
  expect(at.asking.state).toBe(S.REMOVING);
  expect(at.asking.memory.REMOVING?.lineId).toBe("l1");
  expect(at.removed.read(Story.records("exit", { instance: ["REMOVING"] }))).toMatchObject([
    { exit: "Remove", payload: { lineId: "l1" } },
  ]);
  expect(at.removed.read(Story.entity(CartLine, l("l1")))).toBeUndefined();
});

storyTest(couponPredicted, ({ at }) => {
  expect(at["coupon-predicted"].memory.coupon).toMatchObject({
    status: "applying",
    predictedTotalCents: 6_210,
  });
  expect(at["second-code-refused"].read(Stripe.applyCoupon)).toHaveLength(1); // refused before anything was sent
  expect(
    at["second-code-refused"].read(Story.records("verdict", { event: CartPage.E.ApplyCoupon })),
  ).toContainEqual(
    expect.objectContaining({ denied: [expect.objectContaining({ code: "InFlight" })] }),
  );
  expect(at["coupon-applied"].memory.coupon.status).toBe("applied");
  // The cart's read was invalidated by the operation's `writes` and read again (O22, rule 36).
  expect(at["coupon-applied"].read(Stripe.cart).length).toBeGreaterThan(
    at["coupon-predicted"].read(Stripe.cart).length,
  );
});

storyTest(couponRejected, ({ at }) => {
  expect(at["coupon-rejected"].memory.coupon).toMatchObject({
    status: "refused",
    reason: "That code is not valid",
  });
});

storyTest(pageAndHeader, ({ at }) => {
  const queues = at["queued-on-one-line"].read(Story.inspection).domains.cart.queues;
  // design gap: a queue entry's fields beyond `entity` are not shown (merge 5 names the queue, not its row);
  // `key` and `items` (the Attempts in order) are assumed.
  expect(queues).toContainEqual(
    expect.objectContaining({
      entity: "Checkout/CartLine",
      key: l("l1"),
      items: [expect.anything(), expect.anything()],
    }), // E12
  );
  expect(at["queued-on-one-line"].read(Story.entity(CartLine, l("l1")))).toBeUndefined(); // hidden on both screens
  expect(at["both-settled"].read(Stripe).shop.carts[0]?.lines.map((x) => x.lineId)).toEqual(["l2"]);
});

storyTest(repricedUnderPending, ({ at }) => {
  // 2 × $50 over the new base, while the change is still on the wire (E11).
  expect(at["replayed-over-new-price"].read(Story.entity(CartLine, l("l1")))).toMatchObject({
    data: { quantity: 2, unitPriceCents: 5_000, lineTotalCents: 10_000 },
    predicted: true,
  });
  // design gap: `checkReplays` reports a "prediction fault" (M5-D10 9.9); its record code is not named, so
  // `PredictionFault` is assumed.
  expect(at["replayed-over-new-price"].read(Story.records("diagnostic"))).not.toContainEqual(
    expect.objectContaining({ code: "PredictionFault" }),
  );
  expect(at.repriced.read(Story.entity(CartLine, l("l1")))).toMatchObject({ predicted: false });
});

storyTest(cartHydrated, ({ at }) => {
  expect(at["hydrated-without-coupon"].read(Story.records("hydration"))).toContainEqual(
    expect.objectContaining({
      code: "DehydrateCommitInFlight",
      operation: "Checkout/apply-coupon",
    }),
  );
  expect(at["hydrated-without-coupon"].read(Story.inspection).lanes).toEqual([]); // lanes are never hydrated
});
