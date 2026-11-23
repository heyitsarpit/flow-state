import { Effect, Layer } from "effect";
import { ShopApi } from "../services.ts";
import { Shop } from "./shop.ts";

const shopApi = (steadfast: boolean) =>
  Effect.map(Shop, (shop) =>
    ShopApi.of({
      confirm: (input, { idempotencyKey }) => {
        const sent = shop.confirm({ ...input, key: idempotencyKey });

        return steadfast ? Effect.uninterruptible(sent) : sent;
      },
      placeOrder: (input, { idempotencyKey }) => shop.placeOrder({ ...input, key: idempotencyKey }),
      voidAuthorization: (input, { idempotencyKey }) =>
        shop.voidAuthorization({ ...input, key: idempotencyKey }),
      intent: shop.intent,
      orderFor: shop.orderFor,
    }),
  );

/**
 * The port fake: `ShopApi` over the shop's server, whose lost answer is the port's NoResponse.
 */
export const ShopFake = Layer.effect(ShopApi, shopApi(false));

/**
 * The port fake over a network that will not interrupt a confirm: once sent, it runs to its
 * answer even when its caller is interrupted.
 */
export const ShopFakeSteadfast = Layer.effect(ShopApi, shopApi(true));

/**
 * The port fake over a payment SDK whose session, opened when the services start, fails to close
 * when they are released, as an SDK whose disconnect rejects does.
 */
export const ShopFakeSessionCloseFails = Layer.effect(
  ShopApi,
  Effect.tap(shopApi(false), () =>
    Effect.addFinalizer(() => Effect.die("the payment session did not close")),
  ),
);
