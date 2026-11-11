// The Stripe fake: the shop's server and Stripe behind it, as one `Fake.server`, because a confirm, a capture and a
// refund change the same truth (2.10.4: a fake cannot share truth with another server). Its truth is an Effect
// Schema (`ShopTruth`, adapters/server.ts), so `describe`, digests and generated controls read it (Y2).
//
// Two client halves:
//   - the app's real `ShopHttp` adapter over `Fake.fetch(Stripe, routes)`: every status the adapter reads is one a handler
//     returned;
//   - a Stripe.js stand-in (`StripeClient`) whose `handleNextAction` calls the `nextAction` endpoint: the bank's
//     challenge is a request that waits (`Stripe.nextAction.hold()`) until the customer finishes
//     (`Stripe.completeChallenge({ passed })`, then `release()`). Like Stripe.js it takes no signal: interrupting
//     the fiber that awaits it does not take the request back, so the challenge can finish after the checkout
//     stopped waiting (F11).
//
// Controls, Stripe's real sequences: `busy` (the next confirms answer 429), `challenge` (3-D Secure required),
// `decline`, `webhookTwice` (Stripe delivers one event twice, Y4), `captureElsewhere` (the background capture job
// wins a race with a void), `changePrice` (a re-price under a pending quantity change).
import { Effect, FiberSet, Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { Fake } from "flow-state/testing";
import * as Server from "../adapters/server.js";
import { ShopHttp } from "../adapters/shop-api.js";
import { StripeClient } from "../adapters/stripe.js";
import { Intent } from "../adapters/types.js";

const ORIGIN = "http://shop.test";

const STATUS = {
  LineGone: 404,
  CouponRejected: 422,
  CardDeclined: 402,
  Busy: 429,
  IntentBusy: 400,
  OrderExists: 409,
  AlreadyCaptured: 409,
  NotDeliverable: 422,
  OverRefund: 409,
  ChallengeFailed: 402,
} as const;

type Wire = { status: number; body: unknown };

const toWire = <A, E extends { readonly _tag: keyof typeof STATUS }>(
  result: Server.Result<A, E>,
): Wire =>
  result.ok
    ? { status: 200, body: result.value }
    : { status: STATUS[result.error._tag], body: shape(result.error) };

// What each error looks like on the wire, as the real shop server writes it.
const shape = (error: { readonly _tag: string } & Record<string, unknown>) => {
  if (error._tag === "CardDeclined") return { type: "card_error", decline_code: error.code };
  if (error._tag === "Busy") return { type: "rate_limit_error", retryAfterMs: error.retryAfterMs };
  if (error._tag === "IntentBusy")
    return {
      type: "invalid_request_error",
      code: "payment_intent_unexpected_state",
      status: error.status,
    };
  return { ...error };
};

type Truth = { shop: Server.ShopTruth; challengePasses: boolean };

const step = <A, E extends { readonly _tag: keyof typeof STATUS }>(
  truth: Truth,
  [shop, result]: Server.Step<A, E>,
): { readonly truth: Truth; readonly response: Wire } => ({
  truth: { ...truth, shop },
  response: toWire(result),
});

const cartKey = { cartId: Schema.String };

const key = { key: Schema.String };

const idempotency = (headers: Headers) => headers.get("Idempotency-Key") ?? "";

export const Stripe = Fake.server("Stripe", {
  truth: { shop: Server.ShopTruth, challengePasses: Schema.Boolean },
  initial: { shop: Server.seed(), challengePasses: true },
  endpoints: {
    products: Fake.call({
      request: {},
      handle: (t: Truth) => ({ response: { status: 200, body: t.shop.products } }),
    }),
    product: Fake.call({
      request: { productId: Schema.String },
      handle: (t: Truth, r) => ({
        response: { status: 200, body: t.shop.products.find((p) => p.productId === r.productId) },
      }),
    }),
    cart: Fake.call({
      request: cartKey,
      handle: (t: Truth, r) => ({
        response: { status: 200, body: Server.findCart(t.shop, r.cartId) },
      }),
    }),
    setQuantity: Fake.call({
      request: { ...cartKey, lineId: Schema.String, quantity: Schema.Int, ...key },
      handle: (t: Truth, r) => step(t, Server.setQuantity(t.shop, r, r.key)),
    }),
    removeLine: Fake.call({
      request: { ...cartKey, lineId: Schema.String, ...key },
      handle: (t: Truth, r) => step(t, Server.removeLine(t.shop, r, r.key)),
    }),
    applyCoupon: Fake.call({
      request: { ...cartKey, code: Schema.String, ...key },
      handle: (t: Truth, r) => step(t, Server.applyCoupon(t.shop, r, r.key)),
    }),
    // The confirm our server forwards to Stripe with our `Idempotency-Key`. The answer carries the client secret
    // Stripe.js needs for a challenge.
    confirm: Fake.call({
      request: { intentId: Schema.String, paymentMethodId: Schema.String, ...key },
      handle: (t: Truth, r) => {
        const { truth, response } = step(t, Server.confirm(t.shop, r, r.key));

        return {
          truth,
          response:
            response.status === 200
              ? {
                  status: 200,
                  body: { ...(response.body as Intent), clientSecret: `${r.intentId}_secret` },
                }
              : response,
        };
      },
    }),
    intent: Fake.call({
      request: { intentId: Schema.String },
      handle: (t: Truth, r) => ({
        response: { status: 200, body: t.shop.intents.find((i) => i.intentId === r.intentId) },
      }),
    }),
    // Stripe.js `handleNextAction`: answered when the customer finishes the bank's challenge.
    nextAction: Fake.call({
      request: { clientSecret: Schema.String },
      handle: (t: Truth, r) => {
        const intentId = r.clientSecret.replace("_secret", "");
        const [shop, result] = Server.completeChallenge(t.shop, intentId, t.challengePasses);

        return {
          truth: { ...t, shop },
          response: result.ok
            ? {
                status: 200,
                body: { paymentIntent: { id: intentId, status: result.value.status } },
              }
            : { status: 200, body: { error: { type: "card_error", code: result.error.code } } },
        };
      },
    }),
    placeOrder: Fake.call({
      request: { ...cartKey, intentId: Schema.String, ...key },
      handle: (t: Truth, r) => {
        const [shop, result] = Server.placeOrder(t.shop, r, r.key);

        return {
          truth: { ...t, shop },
          response: result.ok
            ? { status: 200, body: result.value }
            : { status: 409, body: { order: result.error.order } },
        };
      },
    }),
    orderFor: Fake.call({
      request: cartKey,
      handle: (t: Truth, r) => ({
        response: { status: 200, body: t.shop.orders.find((o) => o.cartId === r.cartId) ?? null },
      }),
    }),
    voidAuthorization: Fake.call({
      request: { intentId: Schema.String, ...key },
      handle: (t: Truth, r) => step(t, Server.voidAuthorization(t.shop, r, r.key)),
    }),
    reserveShipping: Fake.call({
      request: { ...cartKey, postcode: Schema.String, ...key },
      handle: (t: Truth, r) => step(t, Server.reserveShipping(t.shop, r, r.key)),
    }),
    orders: Fake.call({
      request: { status: Schema.optional(Schema.String) },
      handle: (t: Truth, r) => ({
        response: {
          status: 200,
          body: t.shop.orders.filter((o) => r.status === undefined || o.status === r.status),
        },
      }),
    }),
    refund: Fake.call({
      request: { orderId: Schema.String, chargeId: Schema.String, amountCents: Schema.Int, ...key },
      handle: (t: Truth, r) => step(t, Server.refund(t.shop, r, r.key)),
    }),
  },
  controls: {
    busy: Fake.control({ times: Schema.Int }, (t: Truth, { times }) => ({
      truth: { ...t, shop: { ...t.shop, busy: times } },
    })),
    challenge: Fake.control({ on: Schema.Boolean }, (t: Truth, { on }) => ({
      truth: { ...t, shop: { ...t.shop, challenge: on } },
    })),
    decline: Fake.control({ code: Schema.NullOr(Schema.String) }, (t: Truth, { code }) => ({
      truth: { ...t, shop: { ...t.shop, decline: code } },
    })),
    // What the customer does in the bank's page. The held `nextAction` answers with it when released.
    completeChallenge: Fake.control({ passed: Schema.Boolean }, (t: Truth, { passed }) => ({
      truth: { ...t, challengePasses: passed },
    })),
    // Stripe delivers `payment_intent.amount_capturable_updated` twice; the shop processes it once by its id.
    webhookTwice: Fake.control({ ...cartKey, intentId: Schema.String }, (t: Truth, e) => {
      const event = { id: `evt_${e.intentId}`, intentId: e.intentId, cartId: e.cartId };

      return { truth: { ...t, shop: Server.webhook(Server.webhook(t.shop, event), event) } };
    }),
    captureElsewhere: Fake.control({ intentId: Schema.String }, (t: Truth, { intentId }) => ({
      truth: { ...t, shop: Server.captureElsewhere(t.shop, intentId) },
    })),
    changePrice: Fake.control(
      { productId: Schema.String, priceCents: Schema.Int },
      (t: Truth, p) => ({
        truth: { ...t, shop: Server.changePrice(t.shop, p.productId, p.priceCents) },
      }),
    ),
  },
});

// The shop's HTTP routes, as the real server routes them. A write's key is a header, so those routes spell `input`; a read is
// the short form (`{ ...params, ...query, ...body }`). The route table reads the body synchronously, so nothing here is async.
const ShopOverFetch = ShopHttp(ORIGIN).pipe(
  Layer.provide(
    Fake.fetch(Stripe, {
      "GET /api/products": "products",
      "GET /api/products/:productId": "product",
      "GET /api/carts/:cartId": "cart",
      "POST /api/carts/:cartId/lines/:lineId": {
        endpoint: "setQuantity",
        input: ({ params, body, headers }) => ({
          ...params,
          quantity: body.quantity,
          key: idempotency(headers),
        }),
      },
      "POST /api/carts/:cartId/lines/:lineId/remove": {
        endpoint: "removeLine",
        input: ({ params, headers }) => ({ ...params, key: idempotency(headers) }),
      },
      "POST /api/carts/:cartId/coupon": {
        endpoint: "applyCoupon",
        input: ({ params, body, headers }) => ({
          ...params,
          code: body.code,
          key: idempotency(headers),
        }),
      },
      "POST /api/carts/:cartId/shipping": {
        endpoint: "reserveShipping",
        input: ({ params, body, headers }) => ({
          ...params,
          postcode: body.postcode,
          key: idempotency(headers),
        }),
      },
      "GET /api/carts/:cartId/order": "orderFor",
      "POST /api/carts/:cartId/order": {
        endpoint: "placeOrder",
        input: ({ params, body, headers }) => ({
          ...params,
          intentId: body.intentId,
          key: idempotency(headers),
        }),
      },
      "GET /api/intents/:intentId": "intent",
      "POST /api/intents/:intentId/confirm": {
        endpoint: "confirm",
        input: ({ params, body, headers }) => ({
          ...params,
          paymentMethodId: body.paymentMethodId,
          key: idempotency(headers),
        }),
      },
      "POST /api/intents/:intentId/cancel": {
        endpoint: "voidAuthorization",
        input: ({ params, headers }) => ({ ...params, key: idempotency(headers) }),
      },
      "GET /api/orders": "orders",
      "POST /api/orders/:orderId/refunds": {
        endpoint: "refund",
        input: ({ params, body, headers }) => ({
          ...params,
          chargeId: body.chargeId,
          amountCents: body.amountCents,
          key: idempotency(headers),
        }),
      },
    }),
  ),
);

// Stripe.js, over the run's server. A lost request is what Stripe.js reports as an `api_connection_error`.
const StripeJsOverFake = Layer.effect(
  StripeClient,
  Effect.gen(function* () {
    const server = yield* Stripe;
    const fibers = yield* FiberSet.make();
    const runPromise = yield* FiberSet.runtimePromise(fibers)();

    // The call runs in the run's fiber set, not in the awaiting fiber: Stripe.js takes no signal, so interrupting the
    // awaiter leaves the request standing.
    return StripeClient.of({
      handleNextAction: ({ clientSecret }) =>
        runPromise(
          server.nextAction({ clientSecret }).pipe(
            Effect.map((wire) => wire.body as never),
            Effect.catchTag("FakeLost", () =>
              Effect.succeed({ error: { type: "api_connection_error" } } as never),
            ),
          ),
        ),
    });
  }),
);

// Every port the checkout uses, over the run's server. Built per tab, holding no state (STF15).
export const StripeFake = Layer.mergeAll(ShopOverFetch, StripeJsOverFake);

export const FetchOnly = FetchHttpClient.layer; // for a test that wants the bare HTTP client
