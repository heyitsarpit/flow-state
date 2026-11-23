import { Effect, Layer } from "effect";
import { CartApi, CartViewApi } from "../services.ts";
import { Carts } from "./carts.ts";

/**
 * The cart service's port fake: `CartApi` over the carts server, whose lost answer is the port's
 * NoResponse.
 */
export const CartFake = Layer.effect(
  CartApi,
  Effect.map(Carts, (carts) =>
    CartApi.of({
      addLine: (input, { idempotencyKey }) => carts.addLine({ ...input, key: idempotencyKey }),
      setQuantity: (input, { idempotencyKey }) =>
        carts.setQuantity({ ...input, key: idempotencyKey }),
    }),
  ),
);

/**
 * The cart read port's fake: `CartViewApi` over the carts server, where a quick add is a plain add.
 */
export const CartViewFake = Layer.effect(
  CartViewApi,
  Effect.map(Carts, (carts) =>
    CartViewApi.of({
      cart: carts.cart,
      quickAdd: (input, { idempotencyKey }) =>
        carts.addLine({ ...input, key: idempotencyKey }).pipe(Effect.asVoid),
    }),
  ),
);
