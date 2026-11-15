import { Effect, Exit, Layer, Schema } from "effect";
import { Fake } from "../../src/host/testing/index.ts";
import { ShopApi } from "./contracts.ts";

const ShopTruth = Schema.Struct({
  intents: Schema.Record(Schema.String, Schema.String),
  orders: Schema.Record(Schema.String, Schema.String),
  busy: Schema.Array(Schema.Number),
});

type Truth = typeof ShopTruth.Type;

const Intent = Schema.Struct({
  status: Schema.String,
  clientSecret: Schema.optionalKey(Schema.String),
});

const Order = Schema.Struct({ orderId: Schema.String });

const key = { key: Schema.String };

const Busy = Schema.TaggedStruct("Busy", { retryAfterMs: Schema.Number });

/**
 * The shop's truth: a confirmed intent is capturable, one order per cart, an intent nobody
 * confirmed still needs a payment method, and each `busy` answer queued by the control turns the
 * next confirm away with its retry delay.
 */
export const Shop = Fake.server("Shop", {
  truth: ShopTruth,
  initial: { intents: {}, orders: {}, busy: [] },
  endpoints: {
    confirm: Fake.call({
      request: { intentId: Schema.String, paymentMethodId: Schema.String, ...key },
      success: Intent,
      failure: Busy,
      handle: (truth: Truth, { intentId }) => {
        const [retryAfterMs, ...later] = truth.busy;

        if (retryAfterMs !== undefined)
          return {
            truth: { ...truth, busy: later },
            exit: Exit.fail({ _tag: "Busy" as const, retryAfterMs }),
          };

        return {
          truth: { ...truth, intents: { ...truth.intents, [intentId]: "requires_capture" } },
          exit: Exit.succeed({ status: "requires_capture", clientSecret: "cs" }),
        };
      },
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
  controls: {
    busy: Fake.control({ retryAfterMs: Schema.Number }, (truth: Truth, { retryAfterMs }) => ({
      ...truth,
      busy: [...truth.busy, retryAfterMs],
    })),
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
