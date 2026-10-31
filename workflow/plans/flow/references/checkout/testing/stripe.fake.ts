// The Stripe fake: the shop's server and Stripe behind it, as one `Fake.server`, because a confirm, a capture and a
// refund change the same truth (2.10.4: a fake cannot share truth with another server). Its truth is an Effect
// Schema (`ShopTruth`, adapters/server.ts), so `describe`, digests and generated controls read it (Y2).
//
// Two client halves, both the app's real adapters:
//   - `ShopHttp` over `Fake.fetch(Stripe, route)`: every status the adapter reads is one a handler returned (Y6);
//   - a Stripe.js stand-in (`StripeClient`) whose `handleNextAction` calls the `nextAction` endpoint: the bank's
//     challenge is a request that waits (`Stripe.nextAction.hold()`) until the customer finishes
//     (`Stripe.completeChallenge({ passed })`, then `release()`). Like Stripe.js it takes no signal: interrupting
//     the fiber that awaits it does not take the request back, so the challenge can finish after the checkout
//     stopped waiting (F11).
//
// Controls, Stripe's real sequences: `busy` (the next confirms answer 429), `challenge` (3-D Secure required),
// `decline`, `webhookTwice` (Stripe delivers one event twice, Y4), `captureElsewhere` (the background capture job
// wins a race with a void), `changePrice` (a re-price under a pending quantity change).
import { Effect, Layer, Schema } from "effect";
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
) => [{ ...truth, shop }, toWire(result)] as const;

const cartKey = { cartId: Schema.String };

const key = { key: Schema.String };

export const Stripe = Fake.server("Stripe", {
  truth: { shop: Server.ShopTruth, challengePasses: Schema.Boolean },
  initial: { shop: Server.seed(), challengePasses: true },
  endpoints: {
    products: Fake.call({
      request: {},
      handle: (t) => [t, { status: 200, body: t.shop.products }],
    }),
    product: Fake.call({
      request: { productId: Schema.String },
      handle: (t, r) => [
        t,
        { status: 200, body: t.shop.products.find((p) => p.productId === r.productId) },
      ],
    }),
    cart: Fake.call({
      request: cartKey,
      handle: (t, r) => [t, { status: 200, body: Server.findCart(t.shop, r.cartId) }],
    }),
    setQuantity: Fake.call({
      request: { ...cartKey, lineId: Schema.String, quantity: Schema.Int, ...key },
      handle: (t, r) => step(t, Server.setQuantity(t.shop, r, r.key)),
    }),
    removeLine: Fake.call({
      request: { ...cartKey, lineId: Schema.String, ...key },
      handle: (t, r) => step(t, Server.removeLine(t.shop, r, r.key)),
    }),
    applyCoupon: Fake.call({
      request: { ...cartKey, code: Schema.String, ...key },
      handle: (t, r) => step(t, Server.applyCoupon(t.shop, r, r.key)),
    }),
    // The confirm our server forwards to Stripe with our `Idempotency-Key`. The answer carries the client secret
    // Stripe.js needs for a challenge.
    confirm: Fake.call({
      request: { intentId: Schema.String, paymentMethodId: Schema.String, ...key },
      handle: (t, r) => {
        const [next, wire] = step(t, Server.confirm(t.shop, r, r.key));

        return [
          next,
          wire.status === 200
            ? {
                status: 200,
                body: { ...(wire.body as Intent), clientSecret: `${r.intentId}_secret` },
              }
            : wire,
        ];
      },
    }),
    intent: Fake.call({
      request: { intentId: Schema.String },
      handle: (t, r) => [
        t,
        { status: 200, body: t.shop.intents.find((i) => i.intentId === r.intentId) },
      ],
    }),
    // Stripe.js `handleNextAction`: answered when the customer finishes the bank's challenge.
    nextAction: Fake.call({
      request: { clientSecret: Schema.String },
      handle: (t, r) => {
        const intentId = r.clientSecret.replace("_secret", "");
        const [shop, result] = Server.completeChallenge(t.shop, intentId, t.challengePasses);

        return [
          { ...t, shop },
          result.ok
            ? {
                status: 200,
                body: { paymentIntent: { id: intentId, status: result.value.status } },
              }
            : { status: 200, body: { error: { type: "card_error", code: result.error.code } } },
        ];
      },
    }),
    placeOrder: Fake.call({
      request: { ...cartKey, intentId: Schema.String, ...key },
      handle: (t, r) => {
        const [shop, result] = Server.placeOrder(t.shop, r, r.key);

        return [
          { ...t, shop },
          result.ok
            ? { status: 200, body: result.value }
            : { status: 409, body: { order: result.error.order } },
        ];
      },
    }),
    orderFor: Fake.call({
      request: cartKey,
      handle: (t, r) => [
        t,
        { status: 200, body: t.shop.orders.find((o) => o.cartId === r.cartId) ?? null },
      ],
    }),
    voidAuthorization: Fake.call({
      request: { intentId: Schema.String, ...key },
      handle: (t, r) => step(t, Server.voidAuthorization(t.shop, r, r.key)),
    }),
    reserveShipping: Fake.call({
      request: { ...cartKey, postcode: Schema.String, ...key },
      handle: (t, r) => step(t, Server.reserveShipping(t.shop, r, r.key)),
    }),
    orders: Fake.call({
      request: { status: Schema.optional(Schema.String) },
      handle: (t, r) => [
        t,
        {
          status: 200,
          body: t.shop.orders.filter((o) => r.status === undefined || o.status === r.status),
        },
      ],
    }),
    refund: Fake.call({
      request: { orderId: Schema.String, chargeId: Schema.String, amountCents: Schema.Int, ...key },
      handle: (t, r) => step(t, Server.refund(t.shop, r, r.key)),
    }),
  },
  controls: {
    busy: Fake.control({ times: Schema.Int }, (t, { times }) => ({
      ...t,
      shop: { ...t.shop, busy: times },
    })),
    challenge: Fake.control({ on: Schema.Boolean }, (t, { on }) => ({
      ...t,
      shop: { ...t.shop, challenge: on },
    })),
    decline: Fake.control({ code: Schema.NullOr(Schema.String) }, (t, { code }) => ({
      ...t,
      shop: { ...t.shop, decline: code },
    })),
    // What the customer does in the bank's page. The held `nextAction` answers with it when released.
    completeChallenge: Fake.control({ passed: Schema.Boolean }, (t, { passed }) => ({
      ...t,
      challengePasses: passed,
    })),
    // Stripe delivers `payment_intent.amount_capturable_updated` twice; the shop processes it once by its id.
    webhookTwice: Fake.control({ ...cartKey, intentId: Schema.String }, (t, e) => {
      const event = { id: `evt_${e.intentId}`, intentId: e.intentId, cartId: e.cartId };

      return { ...t, shop: Server.webhook(Server.webhook(t.shop, event), event) };
    }),
    captureElsewhere: Fake.control({ intentId: Schema.String }, (t, { intentId }) => ({
      ...t,
      shop: Server.captureElsewhere(t.shop, intentId),
    })),
    changePrice: Fake.control({ productId: Schema.String, priceCents: Schema.Int }, (t, p) => ({
      ...t,
      shop: Server.changePrice(t.shop, p.productId, p.priceCents),
    })),
  },
});

// The shop's HTTP routes, as the real server routes them. Flow parses nothing else (2.10.4).
// design gap: `route` reads the request's JSON body, so it is async here; 2.10.4 shows only a URL being read.
const route = async (request: Request) => {
  const url = new URL(request.url);
  const p = url.pathname
    .split("/")
    .filter((x) => x !== "")
    .map(decodeURIComponent); // api, …
  const body = request.method === "GET" ? {} : ((await request.json()) as Record<string, unknown>);
  const k = request.headers.get("Idempotency-Key") ?? "";

  if (p[1] === "products")
    return p[2] === undefined
      ? { endpoint: "products", input: {} }
      : { endpoint: "product", input: { productId: p[2] } };

  if (p[1] === "carts") {
    const cartId = p[2]!;

    if (p[3] === undefined) return { endpoint: "cart", input: { cartId } };
    if (p[3] === "lines" && p[5] === "remove")
      return { endpoint: "removeLine", input: { cartId, lineId: p[4], key: k } };
    if (p[3] === "lines")
      return {
        endpoint: "setQuantity",
        input: { cartId, lineId: p[4], quantity: body.quantity, key: k },
      };
    if (p[3] === "coupon")
      return { endpoint: "applyCoupon", input: { cartId, code: body.code, key: k } };
    if (p[3] === "shipping")
      return { endpoint: "reserveShipping", input: { cartId, postcode: body.postcode, key: k } };
    if (p[3] === "order" && request.method === "GET")
      return { endpoint: "orderFor", input: { cartId } };
    if (p[3] === "order")
      return { endpoint: "placeOrder", input: { cartId, intentId: body.intentId, key: k } };
  }

  if (p[1] === "intents") {
    if (p[3] === "confirm")
      return {
        endpoint: "confirm",
        input: { intentId: p[2], paymentMethodId: body.paymentMethodId, key: k },
      };
    if (p[3] === "cancel")
      return { endpoint: "voidAuthorization", input: { intentId: p[2], key: k } };
    return { endpoint: "intent", input: { intentId: p[2] } };
  }

  if (p[1] === "orders" && p[3] === "refunds")
    return {
      endpoint: "refund",
      input: { orderId: p[2], chargeId: body.chargeId, amountCents: body.amountCents, key: k },
    };

  if (p[1] === "orders")
    return { endpoint: "orders", input: { status: url.searchParams.get("status") ?? undefined } };

  return undefined;
};

const ShopOverFetch = ShopHttp(ORIGIN).pipe(Layer.provide(Fake.fetch(Stripe, route)));

// Stripe.js, over the run's server. A lost request is what Stripe.js reports as an `api_connection_error`.
const StripeJsOverFake = Layer.effect(
  StripeClient,
  Effect.gen(function* () {
    const server = yield* Stripe;
    const run = yield* Effect.runtime<never>();

    return StripeClient.of({
      handleNextAction: ({ clientSecret }) =>
        Effect.runPromiseWith(run)(
          server.nextAction({ clientSecret }).pipe(
            Effect.map((wire) => wire.body as never),
            Effect.catchTag("Fake/Lost", () =>
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
