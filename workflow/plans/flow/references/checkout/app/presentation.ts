// "Pay safely": how the checkout's Stories are presented (playback.md 6). Each presentation names one Story's
// checkpoints (type-checked); the list plays in order in app/demo.tsx.
// `definePresentation` comes from "flow-state/testing", and a list of presentations stands in for a playlist.
import { definePresentation } from "flow-state/testing";
import { couponOnTheWire, fiveTaps, opened } from "../features/Cart/cart.story.js";
import {
  lateChallenge,
  leaveMidCharge,
  lostConfirm,
  paidFirstTime,
  reloadDuringCharge,
} from "../features/Pay/pay.story.js";
import { threeRefunds } from "../features/Refunds/refunds.story.js";

const pacing = { speed: 1, maxWait: "800 millis", minDwell: "120 millis" } as const;

export const paySafely = [
  definePresentation(opened, {
    scenes: [{ at: "cart", caption: "A lamp and two packs of bulbs", route: "/cart" }],
    pacing,
  }),
  definePresentation(fiveTaps, {
    scenes: [
      {
        at: "quantityCoalesced",
        caption: "Five taps, two requests: only the last count matters",
        hold: "1200 millis",
      },
      { at: "quantitySaved", caption: "The shop agrees: 7" },
    ],
    pacing,
  }),
  definePresentation(couponOnTheWire, {
    scenes: [
      {
        at: "couponPredicted",
        caption: "SAVE10: the page's guess at the total, until the shop answers",
      },
    ],
    pacing,
  }),
  definePresentation(paidFirstTime, {
    scenes: [
      { at: "card", caption: "Signed in: straight to the card", route: "/checkout" },
      { at: "paid", caption: "Paid" },
    ],
    pacing,
  }),
  definePresentation(lateChallenge, {
    scenes: [
      {
        at: "challengeTimingOut",
        caption: "The bank's check ran out of time",
        hold: "1500 millis",
      },
      { at: "timedOut", caption: "We stopped waiting. The bank's page didn't" },
      { at: "paidAfterTimeout", caption: "The bank said yes after all: the order is placed" },
    ],
    pacing,
  }),
  definePresentation(lostConfirm, {
    scenes: [
      {
        at: "payUnsure",
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
  definePresentation(leaveMidCharge, {
    scenes: [
      {
        at: "voidedOnLeave",
        caption: "Left mid-payment: the hold on the card is released",
        route: "/cart",
      },
    ],
    pacing,
  }),
  definePresentation(reloadDuringCharge, {
    scenes: [
      {
        at: "reloadMidCharge",
        caption: "Reloaded before the payment left: you weren't charged",
        route: "/checkout",
      },
    ],
    pacing,
  }),
  definePresentation(threeRefunds, {
    scenes: [
      {
        at: "refundsQueued",
        caption: "Three refunds on one charge: queued in order",
        route: "/admin/refunds",
      },
      { at: "refundsSettled", caption: "The third asked for more than was left, and was refused" },
    ],
    pacing,
  }),
];
