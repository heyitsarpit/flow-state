import { Effect, Layer } from "effect";
import { CartApi } from "../services.ts";
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
