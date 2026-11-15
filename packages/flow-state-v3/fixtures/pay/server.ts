import { Effect, Exit, Layer, Schema } from "effect";
import { Fake } from "../../src/host/testing/index.ts";
import { ShopApi } from "./contracts.ts";

const Busy = Schema.TaggedStruct("Busy", { retryAfterMs: Schema.Number });

const CardDeclined = Schema.TaggedStruct("CardDeclined", { code: Schema.String });

const ServerError = Schema.TaggedStruct("ServerError", {});

const Turn = Schema.Union([
  Busy,
  CardDeclined,
  Schema.TaggedStruct("Challenge", {}),
  Schema.TaggedStruct("LandThenFail", {}),
]);

const ShopTruth = Schema.Struct({
  intents: Schema.Record(Schema.String, Schema.String),
  charges: Schema.Record(Schema.String, Schema.String),
  orders: Schema.Record(Schema.String, Schema.String),
  confirms: Schema.Array(Turn),
  crashes: Schema.Array(Schema.String),
});

type Truth = typeof ShopTruth.Type;

const Intent = Schema.Struct({
  status: Schema.String,
  clientSecret: Schema.optionalKey(Schema.String),
});

const Order = Schema.Struct({ orderId: Schema.String });

const key = { key: Schema.String };

const crashed = (truth: Truth, endpoint: string) => truth.crashes[0] === endpoint;

const afterCrash = (truth: Truth) => ({
  truth: { ...truth, crashes: truth.crashes.slice(1) },
  exit: Exit.die("the shop crashed"),
});

const capture = (truth: Truth, intentId: string, key: string) => ({
  ...truth,
  intents: { ...truth.intents, [intentId]: "requires_capture" },
  charges: { ...truth.charges, [key]: intentId },
});

const captured = { status: "requires_capture", clientSecret: "cs" };

const confirm = (truth: Truth, intentId: string, key: string) => {
  const [next, ...later] = truth.confirms;
  const rest = { ...truth, confirms: later };

  if (truth.charges[key] !== undefined) return { truth, exit: Exit.succeed(captured) };

  if (next === undefined)
    return { truth: capture(truth, intentId, key), exit: Exit.succeed(captured) };

  if (next._tag === "Challenge")
    return {
      truth: { ...rest, intents: { ...rest.intents, [intentId]: "requires_action" } },
      exit: Exit.succeed({ status: "requires_action", clientSecret: "cs" }),
    };

  if (next._tag === "LandThenFail")
    return {
      truth: capture(rest, intentId, key),
      exit: Exit.fail({ _tag: "ServerError" as const }),
    };

  return { truth: rest, exit: Exit.fail(next) };
};

/**
 * The shop's truth: a confirmed intent is capturable and its charge is kept by idempotency key, so
 * a key it has charged is answered again without a second charge; one order per cart; an intent
 * nobody confirmed still needs a payment method, and a cart with no order has none. Controls queue what
 * the next confirm meets (a busy queue, a declined card, a challenge, or a charge that lands and
 * then fails), or crash an endpoint's next call.
 */
export const Shop = Fake.server("Shop", {
  truth: ShopTruth,
  initial: { intents: {}, charges: {}, orders: {}, confirms: [], crashes: [] },
  endpoints: {
    confirm: Fake.call({
      request: { intentId: Schema.String, paymentMethodId: Schema.String, ...key },
      success: Intent,
      failure: Schema.Union([Busy, CardDeclined, ServerError]),
      handle: (truth: Truth, { intentId, key: given }) =>
        crashed(truth, "confirm") ? afterCrash(truth) : confirm(truth, intentId, given),
    }),
    placeOrder: Fake.call({
      request: { cartId: Schema.String, intentId: Schema.String, ...key },
      success: Order,
      failure: Schema.Never,
      handle: (truth: Truth, { cartId }) => {
        if (crashed(truth, "placeOrder")) return afterCrash(truth);
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
      handle: (truth: Truth, { intentId }) =>
        crashed(truth, "voidAuthorization")
          ? afterCrash(truth)
          : {
              truth: { ...truth, intents: { ...truth.intents, [intentId]: "canceled" } },
              exit: Exit.succeed({}),
            },
    }),
    intent: Fake.call({
      request: { intentId: Schema.String },
      success: Intent,
      failure: Schema.Never,
      handle: (truth: Truth, { intentId }) =>
        crashed(truth, "intent")
          ? afterCrash(truth)
          : {
              truth,
              exit: Exit.succeed({ status: truth.intents[intentId] ?? "requires_payment_method" }),
            },
    }),
    orderFor: Fake.call({
      request: { cartId: Schema.String },
      success: Schema.NullOr(Order),
      failure: Schema.Never,
      handle: (truth: Truth, { cartId }) => {
        if (crashed(truth, "orderFor")) return afterCrash(truth);
        const orderId = truth.orders[cartId];

        return { truth, exit: Exit.succeed(orderId === undefined ? null : { orderId }) };
      },
    }),
  },
  controls: {
    busy: Fake.control({ retryAfterMs: Schema.Number }, (truth: Truth, { retryAfterMs }) => ({
      ...truth,
      confirms: [...truth.confirms, { _tag: "Busy" as const, retryAfterMs }],
    })),
    decline: Fake.control({ code: Schema.String }, (truth: Truth, { code }) => ({
      ...truth,
      confirms: [...truth.confirms, { _tag: "CardDeclined" as const, code }],
    })),
    challenge: Fake.control({}, (truth: Truth) => ({
      ...truth,
      confirms: [...truth.confirms, { _tag: "Challenge" as const }],
    })),
    landThenFail: Fake.control({}, (truth: Truth) => ({
      ...truth,
      confirms: [...truth.confirms, { _tag: "LandThenFail" as const }],
    })),
    crash: Fake.control({ endpoint: Schema.String }, (truth: Truth, { endpoint }) => ({
      ...truth,
      crashes: [...truth.crashes, endpoint],
    })),
  },
});

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
