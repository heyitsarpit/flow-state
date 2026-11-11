// The shop's HTTP port: products, carts, payment intents (through our server, which talks to Stripe with the
// idempotency key), orders and refunds. Effect-only. Hand-written over `fetch`, as the desk's http-api.ts is: a
// rejected `fetch` is `NoResponse`, a status is a tagged failure or `ServerError`. Nothing here decides what is
// definite and what is unknown; the contracts' commits do.
//
// The `fetch` it calls is Effect's `FetchHttpClient.Fetch` reference (the global one by default), so a Story
// replaces the transport with `Fake.fetch(Stripe, route)` and this adapter's status reading runs unchanged (Y6).
import { Context, Effect, Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import {
  AlreadyCaptured,
  Busy,
  CardDeclined,
  Cart,
  CouponRejected,
  Intent,
  IntentBusy,
  IntentStatus,
  LineGone,
  NoResponse,
  NotDeliverable,
  Order,
  OverRefund,
  Product,
  Refund,
  ServerError,
  ShippingSlot,
} from "./types.js";

type Read = { signal: AbortSignal };

type Write = { idempotencyKey: string; signal: AbortSignal };

type Lost = NoResponse | ServerError;

export class ShopApi extends Context.Service<
  ShopApi,
  {
    products: (options: Read) => Effect.Effect<ReadonlyArray<Product>, NoResponse>;
    product: (input: { productId: string }, options: Read) => Effect.Effect<Product, NoResponse>;
    cart: (input: { cartId: string }, options: Read) => Effect.Effect<Cart, NoResponse>;
    setQuantity: (
      input: { cartId: string; lineId: string; quantity: number },
      options: Write,
    ) => Effect.Effect<Cart, LineGone | Lost>;
    removeLine: (
      input: { cartId: string; lineId: string },
      options: Write,
    ) => Effect.Effect<Cart, LineGone | Lost>;
    applyCoupon: (
      input: { cartId: string; code: string },
      options: Write,
    ) => Effect.Effect<Cart, CouponRejected | Lost>;
    // Our server confirms the intent with Stripe's API, passing our `Idempotency-Key` on to Stripe.
    confirm: (
      input: { intentId: string; paymentMethodId: string },
      options: { idempotencyKey: string },
    ) => Effect.Effect<Intent & { clientSecret: string }, CardDeclined | Busy | IntentBusy | Lost>;
    intent: (input: { intentId: string }, options: Read) => Effect.Effect<Intent, NoResponse>;
    placeOrder: (
      input: { cartId: string; intentId: string },
      options: Write,
    ) => Effect.Effect<Order, OrderExists | Lost>;
    orderFor: (input: { cartId: string }, options: Read) => Effect.Effect<Order | null, NoResponse>;
    voidAuthorization: (
      input: { intentId: string },
      options: Write,
    ) => Effect.Effect<void, AlreadyCaptured | Lost>;
    reserveShipping: (
      input: { cartId: string; postcode: string },
      options: Write,
    ) => Effect.Effect<ShippingSlot, NotDeliverable | Lost>;
    orders: (
      input: { status?: "completed" | "refunding" | "refunded" },
      options: Read,
    ) => Effect.Effect<ReadonlyArray<Order>, NoResponse>;
    refund: (
      input: { orderId: string; chargeId: string; amountCents: number },
      options: Write,
    ) => Effect.Effect<Refund, OverRefund | Lost>;
  }
>()("Checkout/ShopApi") {}

// 409 on placing an order: one exists for this cart already.
export class OrderExists extends Schema.TaggedError<OrderExists>()("OrderExists", {
  order: Order,
}) {}

const StripeError = Schema.Struct({
  type: Schema.String,
  code: Schema.optional(Schema.String),
  decline_code: Schema.optional(Schema.String),
  status: Schema.optional(IntentStatus),
  retryAfterMs: Schema.optional(Schema.Number),
});

export const ShopHttp = (origin: string) =>
  Layer.effect(
    ShopApi,
    Effect.map(FetchHttpClient.Fetch, (fetch) => makeShop(origin, fetch)),
  );

const makeShop = (origin: string, fetch: typeof globalThis.fetch) => {
  const request = (
    path: string,
    options: { signal?: AbortSignal; body?: object; idempotencyKey?: string },
  ) =>
    Effect.tryPromise({
      try: (lifetime) => {
        const headers = new Headers({ "Content-Type": "application/json" });

        if (options.idempotencyKey !== undefined)
          headers.set("Idempotency-Key", options.idempotencyKey);

        const init: RequestInit = {
          method: options.body === undefined ? "GET" : "POST",
          headers,
          credentials: "same-origin",
          signal:
            options.signal === undefined ? lifetime : AbortSignal.any([options.signal, lifetime]),
        };

        if (options.body !== undefined) init.body = JSON.stringify(options.body);

        return fetch(new URL(path, origin), init);
      },
      catch: () => new NoResponse(),
    });

  const decoded = <S extends Schema.Constraint>(schema: S, response: Response) =>
    Effect.tryPromise({
      try: () => response.json() as Promise<unknown>,
      catch: () => new Error("bad JSON"),
    }).pipe(Effect.flatMap(Schema.decodeUnknownEffect(schema)), Effect.orDie);

  const read = <S extends Schema.Constraint>(schema: S, path: string, signal: AbortSignal) =>
    request(path, { signal }).pipe(
      Effect.flatMap((response) =>
        Effect.gen(function* () {
          if (!response.ok) return yield* new NoResponse();

          return yield* decoded(schema, response);
        }),
      ),
    );

  // A write's answer: the body, a known 4xx rebuilt by `refused`, a 5xx as `ServerError`.
  const written = <S extends Schema.Constraint, E>(
    schema: S,
    response: Response,
    refused: (status: number, body: unknown) => E | undefined,
  ) =>
    Effect.gen(function* () {
      if (response.ok) return yield* decoded(schema, response);

      if (response.status >= 500) return yield* new ServerError({ status: response.status });

      const body = yield* decoded(Schema.Unknown, response);
      const error = refused(response.status, body);

      if (error !== undefined) return yield* Effect.fail(error);

      return yield* Effect.die(new Error(`Unexpected shop status ${String(response.status)}`));
    });

  const shop = ShopApi.of({
    products: ({ signal }) => read(Schema.Array(Product), "/api/products", signal),
    product: ({ productId }, { signal }) =>
      read(Product, `/api/products/${encodeURIComponent(productId)}`, signal),
    cart: ({ cartId }, { signal }) =>
      read(Cart, `/api/carts/${encodeURIComponent(cartId)}`, signal),
    setQuantity: ({ cartId, lineId, quantity }, { idempotencyKey, signal }) =>
      request(`/api/carts/${cartId}/lines/${lineId}`, {
        signal,
        idempotencyKey,
        body: { quantity },
      }).pipe(
        Effect.flatMap((r) =>
          written(Cart, r, (status) => (status === 404 ? new LineGone({ lineId }) : undefined)),
        ),
      ),
    removeLine: ({ cartId, lineId }, { idempotencyKey, signal }) =>
      request(`/api/carts/${cartId}/lines/${lineId}/remove`, {
        signal,
        idempotencyKey,
        body: {},
      }).pipe(
        Effect.flatMap((r) =>
          written(Cart, r, (status) => (status === 404 ? new LineGone({ lineId }) : undefined)),
        ),
      ),
    applyCoupon: ({ cartId, code }, { idempotencyKey, signal }) =>
      request(`/api/carts/${cartId}/coupon`, { signal, idempotencyKey, body: { code } }).pipe(
        Effect.flatMap((r) =>
          written(Cart, r, (status, body) =>
            status === 422
              ? new CouponRejected({ reason: String((body as { reason?: string }).reason ?? "") })
              : undefined,
          ),
        ),
      ),
    // No caller signal: once our server forwards a confirm to Stripe, cutting our request would not stop Stripe.
    confirm: ({ intentId, paymentMethodId }, { idempotencyKey }) =>
      request(`/api/intents/${intentId}/confirm`, {
        idempotencyKey,
        body: { paymentMethodId },
      }).pipe(
        Effect.flatMap((response) =>
          Effect.gen(function* () {
            if (response.ok)
              return yield* decoded(
                Schema.Struct({ ...Intent.fields, clientSecret: Schema.String }),
                response,
              );

            if (response.status >= 500) return yield* new ServerError({ status: response.status });

            const error = yield* decoded(StripeError, response);

            if (response.status === 402)
              return yield* new CardDeclined({ code: error.decline_code ?? "generic_decline" });

            if (response.status === 429)
              return yield* new Busy({ retryAfterMs: error.retryAfterMs });

            if (error.code === "payment_intent_unexpected_state")
              return yield* new IntentBusy({ status: error.status ?? "processing" });

            return yield* Effect.die(new Error(`Unexpected Stripe error ${error.type}`));
          }),
        ),
      ),
    intent: ({ intentId }, { signal }) => read(Intent, `/api/intents/${intentId}`, signal),
    placeOrder: ({ cartId, intentId }, { idempotencyKey, signal }) =>
      request(`/api/carts/${cartId}/order`, { signal, idempotencyKey, body: { intentId } }).pipe(
        Effect.flatMap((r) =>
          written(Order, r, (status, body) =>
            status === 409
              ? new OrderExists({ order: (body as { order: Order }).order })
              : undefined,
          ),
        ),
      ),
    orderFor: ({ cartId }, { signal }) =>
      read(Schema.NullOr(Order), `/api/carts/${cartId}/order`, signal),
    voidAuthorization: ({ intentId }, { idempotencyKey, signal }) =>
      request(`/api/intents/${intentId}/cancel`, { signal, idempotencyKey, body: {} }).pipe(
        Effect.flatMap((r) =>
          written(Schema.Unknown, r, (status, body) =>
            status === 409
              ? new AlreadyCaptured({
                  chargeId: String((body as { chargeId?: string }).chargeId ?? ""),
                })
              : undefined,
          ),
        ),
        Effect.asVoid,
      ),
    reserveShipping: ({ cartId, postcode }, { idempotencyKey, signal }) =>
      request(`/api/carts/${cartId}/shipping`, { signal, idempotencyKey, body: { postcode } }).pipe(
        Effect.flatMap((r) =>
          written(ShippingSlot, r, (status) =>
            status === 422 ? new NotDeliverable({ postcode }) : undefined,
          ),
        ),
      ),
    orders: ({ status }, { signal }) =>
      read(
        Schema.Array(Order),
        `/api/orders${status === undefined ? "" : `?status=${status}`}`,
        signal,
      ),
    refund: ({ orderId, chargeId, amountCents }, { idempotencyKey, signal }) =>
      request(`/api/orders/${orderId}/refunds`, {
        signal,
        idempotencyKey,
        body: { chargeId, amountCents },
      }).pipe(
        Effect.flatMap((r) =>
          written(Refund, r, (status, body) =>
            status === 409
              ? new OverRefund({
                  leftCents: Number((body as { leftCents?: number }).leftCents ?? 0),
                })
              : undefined,
          ),
        ),
      ),
  });

  return shop;
};
