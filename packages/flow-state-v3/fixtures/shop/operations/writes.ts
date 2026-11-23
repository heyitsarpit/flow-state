import { Effect, Schema } from "effect";
import { Outcome, transaction } from "../../../src/index.ts";
import { CartApi, CartViewApi } from "../services.ts";

/**
 * Adds a line to a cart, one add per cart at a time: a lost answer is unknown.
 */
export const addLine = transaction({
  id: "Shop/add-line",
  input: { cartId: Schema.String, lineId: Schema.String, variantId: Schema.String },
  key: ["cartId"],
  concurrency: "reject",
  services: [CartApi],
  commit: (input, { attempt }) =>
    CartApi.use((api) => api.addLine(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    ),
});

/**
 * Sets one line's quantity, the latest edit per line winning: 0 removes the line; a lost answer is
 * unknown.
 */
export const setQuantity = transaction({
  id: "Shop/set-quantity",
  input: { cartId: Schema.String, lineId: Schema.String, quantity: Schema.Number },
  key: ["cartId", "lineId"],
  concurrency: "latest",
  services: [CartApi],
  commit: (input, { attempt }) =>
    CartApi.use((api) => api.setQuantity(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    ),
});

/**
 * One line added from the mini cart. A lost answer is unknown.
 */
export const quickAdd = transaction({
  id: "Shop/quickAdd",
  input: { cartId: Schema.String, lineId: Schema.String, variantId: Schema.String },
  key: ["cartId", "lineId"],
  concurrency: "reject",
  services: [CartViewApi],
  commit: (input, { attempt }) =>
    CartViewApi.use((api) => api.quickAdd(input, { idempotencyKey: attempt.id })).pipe(
      Effect.catchTag("NoResponse", (e) => Outcome.unknown(e)),
    ),
});
