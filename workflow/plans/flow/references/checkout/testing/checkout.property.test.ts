// The checkout's two money properties, over generated runs (Y9): whatever the wire does to the confirm, the
// challenge, the order and the void, and whatever the shopper presses,
//   1. no intent is ever charged twice (at most one authorization per intent in the Stripe fake's truth), and
//   2. once the run settles, every authorization is captured (an order exists) or voided: none is left on a card.
// A failing run is shrunk and reported as `PropertyTestFailed` with `result.source`, the appended steps chained from
// `payMoney`. Pasted as a Story, it is the regression, and app/demo.tsx plays it (machine-design 2.10.16).
import { propertyTest, type Story } from "flow-state/testing";
import { test } from "vite-plus/test";
import { Pay } from "../features/Pay/pay.definition.js";
import type { PayMachine } from "../features/Pay/pay.machine.js";
import { CART_1, payMoney, VISA } from "../features/Pay/pay.story.js";
import { Stripe } from "./stripe.fake.js";

type PayFrame = Story.Frame<typeof PayMachine>;

const chargedOnce = (frame: PayFrame) => {
  const truth = frame.read(Stripe);
  const twice = truth.shop.charges.filter(
    (c, i) => truth.shop.charges.findIndex((d) => d.intentId === c.intentId) !== i,
  );
  return twice.length > 0 ? twice : undefined;
};

// Checked once, at the quiet point: no lane in flight, no held request, no deadline an operation owns.
const noneLeftOnACard = (cut: PayFrame) => {
  const left = cut.read(Stripe).shop.charges.filter((c) => c.status === "authorized");
  return left.length > 0 ? left : undefined;
};

const cart = { cartId: CART_1.cartId, intentId: CART_1.intentId };

test("the card is charged once, and never left authorized", () =>
  propertyTest(payMoney, {
    steps: [
      [
        Pay.E.summary.PayPressed({ paymentMethodId: VISA }),
        Pay.E.Leave(),
        Pay.E.CHALLENGE.BankShown(),
        Pay.E.CheckAgain(),
      ],
      // Every wire word on each endpoint the checkout reaches: hold, release, drop (request and response), duplicate.
      [
        Stripe.confirm.hold(),
        Stripe.confirm.release(),
        Stripe.confirm.release({ nth: 1 }),
        Stripe.confirm.drop({ at: "request" }),
        Stripe.confirm.drop({ at: "response" }),
        Stripe.confirm.duplicate(),
      ],
      [
        Stripe.nextAction.hold(),
        Stripe.nextAction.release(),
        Stripe.nextAction.drop({ at: "request" }),
        Stripe.nextAction.drop({ at: "response" }),
        Stripe.nextAction.duplicate(),
      ],
      [
        Stripe.placeOrder.hold(),
        Stripe.placeOrder.release(),
        Stripe.placeOrder.drop({ at: "request" }),
        Stripe.placeOrder.drop({ at: "response" }),
        Stripe.placeOrder.duplicate(),
      ],
      [
        Stripe.voidAuthorization.hold(),
        Stripe.voidAuthorization.release(),
        Stripe.voidAuthorization.drop({ at: "request" }),
        Stripe.voidAuthorization.drop({ at: "response" }),
        Stripe.voidAuthorization.duplicate(),
      ],
      [
        Stripe.intent.hold(),
        Stripe.intent.release(),
        Stripe.intent.drop({ at: "request" }),
        Stripe.intent.drop({ at: "response" }),
        Stripe.intent.duplicate(),
      ],
      [
        Stripe.busy({ times: 1 }),
        Stripe.challenge({ on: true }),
        Stripe.completeChallenge({ passed: true }),
        Stripe.webhookTwice(cart),
        Stripe.captureElsewhere({ intentId: CART_1.intentId }),
      ],
      [{ advance: "2 seconds" }, { advance: "3 seconds" }, { advance: "5 minutes" }],
    ],
    properties: { chargedOnce },
    whenQuiet: { noneLeftOnACard },
    seed: 11,
    runs: 200,
    length: 30,
  }));
