// The shop's wire types and errors. Effect-only: it imports nothing else, so it type-checks with Effect alone.
import { Schema } from "effect";

export const Product = Schema.Struct({
  productId: Schema.String,
  name: Schema.String,
  priceCents: Schema.Int,
  revision: Schema.Number,
});

export type Product = typeof Product.Type;

// A cart line names a product (its key) and copies the product's price when the line was priced: the server
// re-prices the line when the product's price changes, so `unitPriceCents` is the line's own field.
export const CartLine = Schema.Struct({
  cartId: Schema.String,
  lineId: Schema.String,
  productId: Schema.String,
  quantity: Schema.Int,
  unitPriceCents: Schema.Int,
  lineTotalCents: Schema.Int,
  revision: Schema.Number,
});

export type CartLine = typeof CartLine.Type;

export const Cart = Schema.Struct({
  cartId: Schema.String,
  lines: Schema.Array(CartLine),
  subtotalCents: Schema.Int,
  couponCode: Schema.NullOr(Schema.String),
  discountCents: Schema.Int,
  totalCents: Schema.Int,
  intentId: Schema.String, // the Stripe PaymentIntent this cart pays with, created with the cart
  revision: Schema.Number,
});

export type Cart = typeof Cart.Type;

export const IntentStatus = Schema.Literals([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing",
  "requires_capture",
  "succeeded",
  "canceled",
]);

export type IntentStatus = typeof IntentStatus.Type;

export const Intent = Schema.Struct({
  intentId: Schema.String,
  status: IntentStatus,
  amountCents: Schema.Int,
  chargeId: Schema.NullOr(Schema.String),
});

export type Intent = typeof Intent.Type;

export const OrderStatus = Schema.Literals(["completed", "refunding", "refunded"]);

export const Order = Schema.Struct({
  orderId: Schema.String,
  cartId: Schema.String,
  chargeId: Schema.String,
  status: OrderStatus,
  amountCents: Schema.Int,
  refundedCents: Schema.Int,
  revision: Schema.Number,
});

export type Order = typeof Order.Type;

// The receipt the shopper sees. `alreadyPlaced` is the commit's reading of a 409 after an earlier send of the same
// Attempt may have placed it (`attempt.mayHaveApplied`, O13): "your order was placed" either way, worded honestly.
export const Receipt = Schema.Struct({ order: Order, alreadyPlaced: Schema.Boolean });

export type Receipt = typeof Receipt.Type;

export const Refund = Schema.Struct({
  refundId: Schema.String,
  orderId: Schema.String,
  chargeId: Schema.String,
  amountCents: Schema.Int,
  status: Schema.Literals(["pending", "succeeded", "failed"]),
});

export type Refund = typeof Refund.Type;

export const ShippingSlot = Schema.Struct({
  slotId: Schema.String,
  postcode: Schema.String,
  feeCents: Schema.Int,
});

export type ShippingSlot = typeof ShippingSlot.Type;

export const Address = Schema.Struct({
  name: Schema.String,
  line1: Schema.String,
  postcode: Schema.String,
  email: Schema.String,
});

export type Address = typeof Address.Type;

// --- errors: definite failures the server or Stripe meant ---------------------------------------------------

export class CardDeclined extends Schema.TaggedError<CardDeclined>()("CardDeclined", {
  code: Schema.String,
}) {}

// 429: Stripe is rate limiting. Information only: the machine decides to wait (MD 2.7.6).
export class Busy extends Schema.TaggedError<Busy>()("Busy", {
  retryAfterMs: Schema.optional(Schema.Number),
}) {}

// `payment_intent_unexpected_state`: the intent is being confirmed elsewhere (another tab), or is no longer
// confirmable. Definite: this send did nothing.
export class IntentBusy extends Schema.TaggedError<IntentBusy>()("IntentBusy", {
  status: IntentStatus,
}) {}

// 409 on a void: the authorization was captured meanwhile (a background capture won the race).
export class AlreadyCaptured extends Schema.TaggedError<AlreadyCaptured>()("AlreadyCaptured", {
  chargeId: Schema.String,
}) {}

export class ChallengeFailed extends Schema.TaggedError<ChallengeFailed>()("ChallengeFailed", {
  code: Schema.String,
}) {}

export class CouponRejected extends Schema.TaggedError<CouponRejected>()("CouponRejected", {
  reason: Schema.String,
}) {}

export class LineGone extends Schema.TaggedError<LineGone>()("LineGone", {
  lineId: Schema.String,
}) {}

// 409 on a refund: more than is left on the charge.
export class OverRefund extends Schema.TaggedError<OverRefund>()("OverRefund", {
  leftCents: Schema.Int,
}) {}

export class NotDeliverable extends Schema.TaggedError<NotDeliverable>()("NotDeliverable", {
  postcode: Schema.String,
}) {}

// `fetch` rejected, or Stripe.js reported an API connection error: the request may or may not have arrived.
export class NoResponse extends Schema.TaggedError<NoResponse>()("NoResponse", {}) {}

export class ServerError extends Schema.TaggedError<ServerError>()("ServerError", {
  status: Schema.Number,
}) {}
