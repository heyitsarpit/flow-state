import { Effect, Layer, Ref } from "effect";
import { ShopApi } from "../services.ts";
import { Shop } from "./shop.ts";

const lost = () => Effect.fail({ _tag: "NoResponse" } as const);

const shopApi = (steadfast: boolean) =>
  Effect.map(Shop, (shop) =>
    ShopApi.of({
      confirm: (input, { idempotencyKey }) => {
        const sent = shop
          .confirm({ ...input, key: idempotencyKey })
          .pipe(Effect.catchTag("FakeLost", lost));

        return steadfast ? Effect.uninterruptible(sent) : sent;
      },
      placeOrder: (input, { idempotencyKey }) =>
        shop.placeOrder({ ...input, key: idempotencyKey }).pipe(Effect.catchTag("FakeLost", lost)),
      voidAuthorization: (input, { idempotencyKey }) =>
        shop
          .voidAuthorization({ ...input, key: idempotencyKey })
          .pipe(Effect.catchTag("FakeLost", lost)),
      intent: (input) => shop.intent(input).pipe(Effect.catchTag("FakeLost", lost)),
      orderFor: (input) => shop.orderFor(input).pipe(Effect.catchTag("FakeLost", lost)),
    }),
  );

/**
 * The port fake: `ShopApi` over the shop's server, a lost answer read as the port's NoResponse.
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

/**
 * The port fake over a payment SDK that voids a confirm its caller abandons, through the session it
 * opened when the services started: once that session has closed, the void cannot be sent.
 */
export const ShopFakeVoidsAbandoned = Layer.effect(
  ShopApi,
  Effect.gen(function* () {
    const open = yield* Ref.make(true);
    yield* Effect.addFinalizer(() => Ref.set(open, false));
    const shop = yield* Shop;
    const api = yield* shopApi(false);

    const voided = (intentId: string, idempotencyKey: string) =>
      Effect.flatMap(Ref.get(open), (live) =>
        live
          ? Effect.ignore(shop.voidAuthorization({ intentId, key: `void-${idempotencyKey}` }))
          : Effect.die("the payment session closed before the void was sent"),
      );

    return ShopApi.of({
      ...api,
      confirm: (input, options) =>
        Effect.onInterrupt(api.confirm(input, options), () =>
          voided(input.intentId, options.idempotencyKey),
        ),
    });
  }),
);
