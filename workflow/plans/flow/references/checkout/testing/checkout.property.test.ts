// The checkout's two money properties, over generated runs (Y9): whatever the wire does to the confirm, the
// challenge, the order and the void, and whatever the shopper presses,
//   1. no intent is ever charged twice (at most one authorization per intent in the Stripe fake's truth), and
//   2. once the run settles, every authorization is captured (an order exists) or voided: none is left on a card.
// A failing run is shrunk and emitted as a Story (`counterexample`), which app/demo.tsx plays (X6).
// design gap: the generators' spellings (`Generate.*`), as in the desk's comments.test.ts (REVIEW gap 39).
// design gap: `frame.settled` and the `counterexample` option are assumed; playback.md 8 names failure replay of
// "the Story a property test emits" as a follow-up without its spelling.
import { Generate, propertyTest, Story } from "flow-state/testing";
import { test } from "vite-plus/test";
import { CART_1, signedIn } from "../features/Pay/pay.story.js";
import { Pay } from "../features/Pay/pay.definition.js";
import { PayMachine } from "../features/Pay/pay.machine.js";
import { Stripe, StripeFake } from "./stripe.fake.js";

const chargedOnce = Story.property("an intent is charged at most once", (frame) => {
  const truth = frame.read(Stripe);
  const twice = truth.shop.intents.filter(
    (i) => truth.shop.charges.filter((c) => c.intentId === i.intentId).length > 1,
  );
  return twice.length > 0 ? twice : undefined;
});

// Only meaningful when nothing is left to happen: `frame.settled` is the end of a run with no lane, timer or held
// request left.
const noneLeftOnACard = Story.property("every authorization is captured or voided", (frame) => {
  if (!frame.settled) return undefined;
  const left = frame.read(Stripe).shop.charges.filter((c) => c.status === "authorized");
  return left.length > 0 ? left : undefined;
});

export const moneyRuns = Story.make(PayMachine, {
  id: "pay/property-money",
  context: signedIn,
  fixtures: [StripeFake],
  properties: [chargedOnce, noneLeftOnACard],
}).send(Pay.E.Start(CART_1));

test("the card is charged once, and never left authorized", () =>
  propertyTest(moneyRuns, {
    steps: [
      Generate.sends(Pay, {
        only: [Pay.E.summary.PayPressed, Pay.E.Leave, Pay.E.CHALLENGE.BankShown, Pay.E.CheckAgain],
      }),
      Generate.wire(Stripe.confirm), // hold, release, drop (request and response), duplicate, release({ nth })
      Generate.wire(Stripe.nextAction),
      Generate.wire(Stripe.placeOrder),
      Generate.wire(Stripe.voidAuthorization),
      Generate.wire(Stripe.intent),
      Generate.controls(Stripe, {
        only: ["busy", "challenge", "completeChallenge", "webhookTwice", "captureElsewhere"],
      }),
      Generate.advance(["2 seconds", "3 seconds", "5 minutes"]),
    ],
    seed: 11,
    runs: 200,
    length: 30,
    counterexample: { id: "pay/property-counterexample" }, // the shrunk failing run, as a Story with this id
  }));
