import { Effect, Exit, Layer, Schema } from "effect";
import { Fake } from "../../src/host/testing/index.ts";
import { ShopApi } from "./contracts.ts";

const ShopTruth = Schema.Struct({
  intents: Schema.Record(Schema.String, Schema.String),
  orders: Schema.Record(Schema.String, Schema.String),
});

type Truth = typeof ShopTruth.Type;

const Intent = Schema.Struct({
  status: Schema.String,
  clientSecret: Schema.optionalKey(Schema.String),
});

const Order = Schema.Struct({ orderId: Schema.String });

const key = { key: Schema.String };

/**
 * The shop's truth: a confirmed intent is capturable, one order per cart, and an intent nobody
 * confirmed still needs a payment method.
 */
export const Shop = Fake.server("Shop", {
  truth: ShopTruth,
  initial: { intents: {}, orders: {} },
  endpoints: {
    confirm: Fake.call({
      request: { intentId: Schema.String, paymentMethodId: Schema.String, ...key },
      success: Intent,
      failure: Schema.Never,
      handle: (truth: Truth, { intentId }) => ({
        truth: { ...truth, intents: { ...truth.intents, [intentId]: "requires_capture" } },
        exit: Exit.succeed({ status: "requires_capture", clientSecret: "cs" }),
      }),
    }),
    placeOrder: Fake.call({
      request: { cartId: Schema.String, intentId: Schema.String, ...key },
      success: Order,
      failure: Schema.Never,
      handle: (truth: Truth, { cartId }) => {
        const orderId = truth.orders[cartId] ?? `o${Object.keys(truth.orders).length + 1}`;

        return {
          truth: { ...truth, orders: { ...truth.orders, [cartId]: orderId } },
          exit: Exit.succeed({ orderId }),
        };
      },
    }),
    voidAuthorization: Fake.call({
      request: { intentId: Schema.String, ...key },
      success: Schema.Struct({}),
      failure: Schema.Never,
      handle: (truth: Truth, { intentId }) => ({
        truth: { ...truth, intents: { ...truth.intents, [intentId]: "canceled" } },
        exit: Exit.succeed({}),
      }),
    }),
    intent: Fake.call({
      request: { intentId: Schema.String },
      success: Intent,
      failure: Schema.Never,
      handle: (truth: Truth, { intentId }) => ({
        truth,
        exit: Exit.succeed({ status: truth.intents[intentId] ?? "requires_payment_method" }),
      }),
    }),
    orderFor: Fake.call({
      request: { cartId: Schema.String },
      success: Schema.NullOr(Order),
      failure: Schema.Never,
      handle: (truth: Truth, { cartId }) => {
        const orderId = truth.orders[cartId];

        return { truth, exit: Exit.succeed(orderId === undefined ? null : { orderId }) };
      },
    }),
  },
});

const lost = () => Effect.fail({ _tag: "NoResponse" } as const);

/**
 * The port fake: `ShopApi` over the shop's server, a lost answer read as the port's NoResponse.
 */
export const ShopFake = Layer.effect(
  ShopApi,
  Effect.map(Shop, (shop) =>
    ShopApi.of({
      confirm: (input, { idempotencyKey }) =>
        shop.confirm({ ...input, key: idempotencyKey }).pipe(Effect.catchTag("FakeLost", lost)),
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
