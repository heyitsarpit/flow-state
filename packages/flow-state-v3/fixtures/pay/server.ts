import { Exit } from "effect";
import { Fake } from "../../src/host/testing/index.ts";
import { ShopApi } from "./contracts.ts";

/**
 * The shop's truth: a confirmed intent is capturable, one order per cart, and an intent nobody
 * confirmed still needs a payment method.
 */
export const shopServer = Fake.server(ShopApi, () => {
  const intents = new Map<string, string>();
  const orders = new Map<string, string>();

  return {
    confirm: (input) => {
      intents.set(input.intentId, "requires_capture");

      return Exit.succeed({ status: "requires_capture", clientSecret: "cs" });
    },
    placeOrder: (input) => {
      const orderId = orders.get(input.cartId) ?? `o${orders.size + 1}`;
      orders.set(input.cartId, orderId);

      return Exit.succeed({ orderId });
    },
    voidAuthorization: (input) => {
      intents.set(input.intentId, "canceled");

      return Exit.succeed({});
    },
    intent: (input) =>
      Exit.succeed({ status: intents.get(input.intentId) ?? "requires_payment_method" }),
    orderFor: (input) => {
      const orderId = orders.get(input.cartId);

      // oxlint-disable-next-line lint-bomb/no-nullish-function-contracts -- the shop API answers null for a cart with no order
      return Exit.succeed(orderId === undefined ? null : { orderId });
    },
  };
});
