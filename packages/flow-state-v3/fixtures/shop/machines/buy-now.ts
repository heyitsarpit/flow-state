import { Schema } from "effect";
import { actorRef, definition, machine, send } from "../../../src/index.ts";
import { PayMachine } from "../../services/shop/machines/pay.ts";

/**
 * The product page's one-click buy button: it holds nothing of its own.
 */
export const BuyNow = definition({
  id: "Shop/BuyNow",
  states: ["READY"],
  events: { Buy: { paymentMethodId: Schema.String } },
});

const toPay = () => actorRef(PayMachine, "checkout-1");

/**
 * The buy button: a click tells the checkout's Pay the saved card, then to pay with it.
 */
export const BuyNowMachine = machine(BuyNow, ({ S }) => ({
  default: S.READY,
  on: {
    Buy: {
      actions: [
        send(toPay, ({ event }) => ({
          _tag: "CardChosen",
          paymentMethodId: event.paymentMethodId,
        })),
        send(toPay, ({ event }) => ({
          _tag: "PayRequested",
          paymentMethodId: event.paymentMethodId,
        })),
      ],
    },
  },
}));
