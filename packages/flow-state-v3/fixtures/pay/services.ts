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
export type SoldOut = { readonly _tag: "SoldOut"; readonly lineId: string };

/**
 * Not enough stock for the quantity asked: `quantity` is what the line still holds.
 */
export type NotEnough = {
  readonly _tag: "NotEnough";
  readonly lineId: string;
  readonly quantity: number;
};

/**
 * The cart service did not answer.
 */
export type NoResponse = { readonly _tag: "NoResponse" };

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
