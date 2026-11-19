import { Context, Effect, Schema } from "effect";

/**
 * The shop's answer did not come back.
 */
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}

/**
 * The shop's answer did not come back within the commit's deadline.
 */
export class TimedOut extends Schema.TaggedError<TimedOut>()("TimedOut", {}) {}

/**
 * The shop answered with a server error.
 */
export const ServerError = Schema.TaggedStruct("ServerError", {});

/**
 * The shop answered with a server error.
 */
export type ServerError = typeof ServerError.Type;

type Lost = NoResponse | ServerError;

/**
 * The card issuer refused the charge.
 */
export const CardDeclined = Schema.TaggedStruct("CardDeclined", { code: Schema.String });

/**
 * The card issuer refused the charge.
 */
export type CardDeclined = typeof CardDeclined.Type;

/**
 * The payment queue turned the charge away for now.
 */
export const Busy = Schema.TaggedStruct("Busy", {
  retryAfterMs: Schema.optionalKey(Schema.Number),
});

/**
 * The payment queue turned the charge away for now.
 */
export type Busy = typeof Busy.Type;

/**
 * An order the shop already holds.
 */
export const Order = Schema.Struct({ orderId: Schema.String });

const IntentBusy = Schema.TaggedStruct("IntentBusy", { status: Schema.String });

const OrderExists = Schema.TaggedStruct("OrderExists", { order: Order });

/**
 * The authorization was captured before the void arrived.
 */
export const AlreadyCaptured = Schema.TaggedStruct("AlreadyCaptured", { chargeId: Schema.String });

/**
 * The authorization was captured before the void arrived.
 */
export type AlreadyCaptured = typeof AlreadyCaptured.Type;

/**
 * A payment intent as the shop reports it.
 */
export const Intent = Schema.Struct({
  status: Schema.String,
  clientSecret: Schema.optionalKey(Schema.String),
});

/**
 * A payment intent as the shop reports it.
 */
export type Intent = typeof Intent.Type;

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
    ) => Effect.Effect<Intent, CardDeclined | Busy | typeof IntentBusy.Type | Lost>;
    readonly placeOrder: (
      input: { readonly cartId: string; readonly intentId: string },
      options: Idem,
    ) => Effect.Effect<typeof Order.Type, typeof OrderExists.Type | Lost>;
    readonly voidAuthorization: (
      input: { readonly intentId: string },
      options: Idem,
    ) => Effect.Effect<Schema.Json, AlreadyCaptured | Lost>;
    readonly intent: (input: { readonly intentId: string }) => Effect.Effect<Intent, Lost>;
    readonly orderFor: (input: {
      readonly cartId: string;
    }) => Effect.Effect<typeof Order.Type | null, Lost>;
  }
>()("flow-state-v3/fixtures/pay/ShopApi") {}

/**
 * Whether an intent's status means the card is authorized.
 */
export const capturableStatus = (status: string) =>
  status === "requires_capture" || status === "succeeded";
