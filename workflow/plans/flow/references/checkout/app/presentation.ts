// "Pay safely": how the checkout's Stories are presented (playback.md 6). Each presentation names one Story's
// checkpoints (type-checked); the list plays in order in app/demo.tsx.
// design gap: as in the desk's app/presentation.ts, `definePresentation` is assumed to come from
// "flow-state/testing", and a list of presentations stands in for a playlist.
import { definePresentation } from "flow-state/testing";
import { couponPredicted, opened, quantityCoalesced } from "../features/Cart/cart.story.js";
import {
  lateChallenge,
  paid,
  reconciled,
  reloadMidCharge,
  voidedOnLeave,
} from "../features/Pay/pay.story.js";
import { refundsQueued } from "../features/Refunds/refunds.story.js";

const pacing = { speed: 1, maxWait: "800 millis", minDwell: "120 millis" } as const;

export const paySafely = [
  definePresentation(opened, {
    scenes: [{ at: "cart", caption: "A lamp and two packs of bulbs", route: "/cart" }],
    pacing,
  }),
  definePresentation(quantityCoalesced, {
    scenes: [
      {
        at: "quantity-coalesced",
        caption: "Five taps, two requests: only the last count matters",
        hold: "1200 millis",
      },
      { at: "quantity-saved", caption: "The shop agrees: 7" },
    ],
    pacing,
  }),
  definePresentation(couponPredicted, {
    scenes: [
      {
        at: "coupon-predicted",
        caption: "SAVE10: the page's guess at the total, until the shop answers",
      },
    ],
    pacing,
  }),
  definePresentation(paid, {
    scenes: [
      { at: "card", caption: "Signed in: straight to the card", route: "/checkout" },
      { at: "paid", caption: "Paid" },
    ],
    pacing,
  }),
  definePresentation(lateChallenge, {
    scenes: [
      {
        at: "challenge-timing-out",
        caption: "The bank's check ran out of time",
        hold: "1500 millis",
      },
      { at: "timed-out", caption: "We stopped waiting. The bank's page didn't" },
      { at: "paid-after-timeout", caption: "The bank said yes after all: the order is placed" },
    ],
    pacing,
  }),
  definePresentation(reconciled, {
    scenes: [
      {
        at: "pay-unsure",
        caption: "The answer was lost. Your card may be charged: we don't pay again",
        hold: "2000 millis",
      },
      {
        at: "reconciled",
        caption: "We asked Stripe: it was. One charge, and the receipt says we checked",
      },
    ],
    pacing,
  }),
  definePresentation(voidedOnLeave, {
    scenes: [
      {
        at: "voided-on-leave",
        caption: "Left mid-payment: the hold on the card is released",
        route: "/cart",
      },
    ],
    pacing,
  }),
  definePresentation(reloadMidCharge, {
    scenes: [
      {
        at: "reload-mid-charge",
        caption: "Reloaded before the payment left: you weren't charged",
        route: "/checkout",
      },
    ],
    pacing,
  }),
  definePresentation(refundsQueued, {
    scenes: [
      {
        at: "refunds-queued",
        caption: "Three refunds on one charge: queued in order",
        route: "/admin/refunds",
      },
      { at: "refunds-settled", caption: "The third asked for more than was left, and was refused" },
    ],
    pacing,
  }),
];
