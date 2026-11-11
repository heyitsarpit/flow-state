import { Context, Effect, Schema } from "effect";
import { Outcome, resource, transaction } from "../../src/index.ts";
/**
 * Checkout's Pay contracts and the shop API they call (the real app's `pay.contracts.ts`).
 */

/**
 * A server answer as the shop's API returns it: a JSON value, or a tagged error.
 */
type Answer = Schema.Json;

type Lost = { readonly _tag: "NoResponse" } | { readonly _tag: "ServerError" };

export type CardDeclined = { readonly _tag: "CardDeclined"; readonly code: string };

export type Busy = { readonly _tag: "Busy"; readonly retryAfterMs?: number };

type IntentBusy = { readonly _tag: "IntentBusy"; readonly status: string };

type OrderExists = { readonly _tag: "OrderExists"; readonly order: { readonly orderId: string } };

export type AlreadyCaptured = { readonly _tag: "AlreadyCaptured"; readonly chargeId: string };

export type Intent = { readonly status: string; readonly clientSecret?: string };

type Idem = { readonly idempotencyKey: string };

/**
 * The shop's API, the service Pay's contracts call: where the data comes from. Flow sends nothing
 * itself; each commit puts its Attempt's id on the wire as the idempotency key.
 */
export class ShopApi extends Context.Service<
  ShopApi,
  {
    readonly confirm: (
      input: { readonly intentId: string; readonly paymentMethodId: string },
      options: Idem,
    ) => Effect.Effect<Intent, CardDeclined | Busy | IntentBusy | Lost>;
    readonly placeOrder: (
      input: { readonly cartId: string; readonly intentId: string },
      options: Idem,
    ) => Effect.Effect<{ readonly orderId: string }, OrderExists | Lost>;
    readonly voidAuthorization: (
      input: { readonly intentId: string },
      options: Idem,
    ) => Effect.Effect<Answer, AlreadyCaptured | Lost>;
    readonly intent: (input: { readonly intentId: string }) => Effect.Effect<Intent, Lost>;
    readonly orderFor: (input: {
      readonly cartId: string;
    }) => Effect.Effect<{ readonly orderId: string } | null, Lost>;
  }
>()("flow-state-v3/conformance/machines/pay/ShopApi") {}

const LOST = ["NoResponse", "ServerError"] as const;

export const capturableStatus = (status: string) =>
  status === "requires_capture" || status === "succeeded";

/**
 * How long one send of `pay` may take before it is unknown: the commit's own deadline
 * (Operations O3), as the real Pay pins it.
 */
const PAY_DEADLINE = "60 seconds";

const confirmed = (status: string, clientSecret: string, afterUnsure: boolean) => ({
  status,
  clientSecret,
  afterUnsure,
});

export type Confirmed = {
  readonly status: string;
  readonly clientSecret: string;
  readonly afterUnsure: boolean;
};

export const pay = transaction({
  id: "Checkout/pay",
  input: { intentId: Schema.String, paymentMethodId: Schema.String },
  key: ["intentId"],
  concurrency: "reject",
  services: [ShopApi],
  commit: (input, { attempt }) =>
    Effect.flatMap(Effect.service(ShopApi), (api) =>
      api.confirm(input, { idempotencyKey: attempt.id }),
    ).pipe(
      Effect.map((v) => confirmed(v.status, v.clientSecret ?? "", attempt.mayHaveApplied)),
      Effect.catchTag("IntentBusy", (e) =>
        attempt.mayHaveApplied && capturableStatus(e.status)
          ? Outcome.success(confirmed(e.status, "", true))
          : Outcome.failure(e),
      ),
      Effect.catchTag(LOST, (e) => Outcome.unknown(e)),
      Effect.timeoutOrElse({
        duration: PAY_DEADLINE,
        orElse: () => Outcome.unknown({ _tag: "TimedOut" as const }),
      }),
    ),
});

export const placeOrder = transaction({
  id: "Checkout/place-order",
  input: { cartId: Schema.String, intentId: Schema.String },
  key: ["cartId"],
  concurrency: "reject",
  services: [ShopApi],
  commit: (input, { attempt }) =>
    Effect.flatMap(Effect.service(ShopApi), (api) =>
      api.placeOrder(input, { idempotencyKey: attempt.id }),
    ).pipe(
      Effect.map((order) => ({ order, alreadyPlaced: false })),
      Effect.catchTag("OrderExists", (e) =>
        Outcome.success({ order: e.order, alreadyPlaced: true }),
      ),
      Effect.catchTag(LOST, (e) => Outcome.unknown(e)),
    ),
});

export const voidAuthorization = transaction({
  id: "Checkout/void-authorization",
  input: { intentId: Schema.String },
  key: ["intentId"],
  concurrency: "reject",
  services: [ShopApi],
  commit: (input, { attempt }) =>
    Effect.flatMap(Effect.service(ShopApi), (api) =>
      api.voidAuthorization(input, { idempotencyKey: attempt.id }),
    ).pipe(Effect.catchTag(LOST, (e) => Outcome.unknown(e))),
});

export const intentStatus = resource({
  id: "Checkout/intent-status",
  input: { intentId: Schema.String },
  key: ["intentId"],
  services: [ShopApi],
  staleTime: 0,
  gcTime: 0,
  lookup: (input) => Effect.flatMap(Effect.service(ShopApi), (api) => api.intent(input)),
});

export const orderForCart = resource({
  id: "Checkout/order-for-cart",
  input: { cartId: Schema.String },
  key: ["cartId"],
  services: [ShopApi],
  staleTime: 0,
  gcTime: 0,
  lookup: (input) => Effect.flatMap(Effect.service(ShopApi), (api) => api.orderFor(input)),
});
