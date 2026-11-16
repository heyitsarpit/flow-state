import { Effect, Layer } from "effect";
import { CartApi } from "../services.ts";
import { Carts } from "./carts.ts";

const lost = () => Effect.fail({ _tag: "NoResponse" } as const);

/**
 * The cart service's port fake: `CartApi` over the carts server, a lost answer read as the port's
 * NoResponse.
 */
export const CartFake = Layer.effect(
  CartApi,
  Effect.map(Carts, (carts) =>
    CartApi.of({
      addLine: (input, { idempotencyKey }) =>
        carts.addLine({ ...input, key: idempotencyKey }).pipe(Effect.catchTag("FakeLost", lost)),
      setQuantity: (input, { idempotencyKey }) =>
        carts
          .setQuantity({ ...input, key: idempotencyKey })
          .pipe(Effect.catchTag("FakeLost", lost)),
    }),
  ),
);
