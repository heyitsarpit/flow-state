import { Effect, Layer } from "effect";
import { checkout, shopSetup } from "../../fixtures/shop/app.ts";
import { ShopApi } from "../../fixtures/services/shop/services.ts";
import { Shop } from "../../fixtures/services/shop/server/shop.ts";
import { samplesOf, Story } from "../../src/host/testing/index.ts";

const lost = () => Effect.fail({ _tag: "NoResponse" } as const);

/**
 * A planted fault in an app's edge: a port fake that, when a confirm's answer is lost, sends it
 * again at once under a fresh idempotency key, which no Attempt was minted with.
 */
export const ResendingShopFake = Layer.effect(
  ShopApi,
  Effect.map(Shop, (shop) =>
    ShopApi.of({
      confirm: (input, { idempotencyKey }) =>
        shop.confirm({ ...input, key: idempotencyKey }).pipe(
          Effect.catchTag("FakeLost", () =>
            shop.confirm({ ...input, key: `${idempotencyKey}:again` }),
          ),
          Effect.catchTag("FakeLost", lost),
        ),
      placeOrder: (input, { idempotencyKey }) =>
        shop.placeOrder({ ...input, key: idempotencyKey }).pipe(Effect.catchTag("FakeLost", lost)),
      voidAuthorization: (input, { idempotencyKey }) =>
        shop
          .voidAuthorization({ ...input, key: idempotencyKey })
          .pipe(Effect.catchTag("FakeLost", lost)),
      intent: (input) => shop.intent(input).pipe(Effect.catchTag("FakeLost", lost)),
      orderFor: (input) => shop.orderFor(input).pipe(Effect.catchTag("FakeLost", lost)),
    }),
  ),
);

/**
 * The pay fixture over a port fake that re-sends a lost confirm under a fresh key, as samples.
 */
export const planted = samplesOf({
  id: "pay-planted",
  story: Story.app(shopSetup, { id: "pay-planted/samples", fixtures: [ResendingShopFake] }),
  names: { setup: "shopSetup", fixtures: ["ResendingShopFake"] },
  actors: { checkout },
  servers: { Shop },
  failures: [Shop.decline({ code: "card_declined" })],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(checkout, { _tag: "Start", cartId: "c1", intentId: "pi1" })
      .send(checkout, { _tag: "PayRequested", paymentMethodId: "visa" })
      .send(checkout, { _tag: "Done" }),
});
