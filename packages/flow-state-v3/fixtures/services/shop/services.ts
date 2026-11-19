import { Context, Effect, Schema } from "effect";

/**
 * The shop's answer did not come back.
 */
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}

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
export type CardDeclined = { readonly _tag: "CardDeclined"; readonly code: string };

/**
 * The payment queue turned the charge away for now.
 */
export type Busy = { readonly _tag: "Busy"; readonly retryAfterMs?: number };

type IntentBusy = { readonly _tag: "IntentBusy"; readonly status: string };

type OrderExists = { readonly _tag: "OrderExists"; readonly order: { readonly orderId: string } };

/**
 * The authorization was captured before the void arrived.
 */
export type AlreadyCaptured = { readonly _tag: "AlreadyCaptured"; readonly chargeId: string };

/**
 * A payment intent as the shop reports it.
 */
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
    ) => Effect.Effect<Schema.Json, AlreadyCaptured | Lost>;
    readonly intent: (input: { readonly intentId: string }) => Effect.Effect<Intent, Lost>;
    readonly orderFor: (input: {
      readonly cartId: string;
    }) => Effect.Effect<{ readonly orderId: string } | null, Lost>;
  }
>()("flow-state-v3/fixtures/pay/ShopApi") {}

/**
 * Whether an intent's status means the card is authorized.
 */
export const capturableStatus = (status: string) =>
  status === "requires_capture" || status === "succeeded";
