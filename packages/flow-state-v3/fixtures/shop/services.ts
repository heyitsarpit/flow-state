import { Context, type Effect, Schema } from "effect";

/**
 * A cart line as the cart service reports it.
 */
export const Line = Schema.Struct({
  lineId: Schema.String,
  variantId: Schema.String,
  quantity: Schema.Number,
});

/**
 * The variant is sold out: the line was not added.
 */
export const SoldOut = Schema.TaggedStruct("SoldOut", { lineId: Schema.String });

/**
 * The variant is sold out: the line was not added.
 */
export type SoldOut = typeof SoldOut.Type;

/**
 * Not enough stock for the quantity asked: `quantity` is what the line still holds.
 */
export const NotEnough = Schema.TaggedStruct("NotEnough", {
  lineId: Schema.String,
  quantity: Schema.Number,
});

/**
 * Not enough stock for the quantity asked: `quantity` is what the line still holds.
 */
export type NotEnough = typeof NotEnough.Type;

/**
 * The cart service did not answer.
 */
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}

type Idem = { readonly idempotencyKey: string };

/**
 * The cart service: where the shop's lines come from. Each write carries its Attempt's id as the
 * idempotency key.
 */
export class CartApi extends Context.Service<
  CartApi,
  {
    readonly addLine: (
      input: { readonly cartId: string; readonly lineId: string; readonly variantId: string },
      options: Idem,
    ) => Effect.Effect<typeof Line.Type, SoldOut | NoResponse>;
    readonly setQuantity: (
      input: { readonly cartId: string; readonly lineId: string; readonly quantity: number },
      options: Idem,
    ) => Effect.Effect<typeof Line.Type, NotEnough | NoResponse>;
  }
>()("flow-state-v3/fixtures/pay/CartApi") {}
