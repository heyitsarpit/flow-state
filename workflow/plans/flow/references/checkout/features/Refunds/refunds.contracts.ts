// The merchant's refunds: the orders list and a refund per charge. Where the data comes from: adapters/shop-api.ts
// (`GET /api/orders`, `POST /api/orders/:id/refunds` with `Idempotency-Key`).
import { Schema } from "effect";
import { resource, transaction } from "flow-state";
import { ShopApi } from "../../adapters/shop-api.js";
import { Order, Refund } from "../../adapters/types.js";
import { unknownWhenLost } from "../Cart/cart.contracts.js";

export const ordersOf = resource({
  id: "Checkout/orders",
  input: {},
  output: Schema.Array(Order),
  key: [],
  lookup: (_input, { signal }) => ShopApi.use((api) => api.orders({}, { signal })),
  staleTime: "30 seconds",
  gcTime: "10 minutes",
  persist: true,
});

// Refunds on one charge are money in order: the second must not overtake the first, or the server's "what is left"
// check refuses the wrong one. `serialize` per charge: FIFO up to 64, each sent after the one before it settled
// (O7). Two charges are two lanes.
export const refund = transaction({
  id: "Checkout/refund",
  input: { orderId: Schema.String, chargeId: Schema.String, amountCents: Schema.Int },
  output: Refund,
  key: ["chargeId"],
  concurrency: "serialize",
  commit: (input, { attempt, signal }) =>
    ShopApi.use((api) => api.refund(input, { idempotencyKey: attempt.id, signal })).pipe(
      unknownWhenLost,
    ),
});
