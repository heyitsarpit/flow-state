// One cart: its lines with their steppers, the remove dialog, and the coupon box. One actor per cart.
//
// How this module is different (COVERAGE.md 5.3): its stepper copies own nothing (the host writes, F4), its line
// writes are `latest` (O4, O5), and its coupon is a PLAIN write whose predicted total lives in the actor's memory
// (O21), beside the domain's predicted line totals (E16). The difference shows on one screen: a line's total is the
// store's (every screen shows it), the coupon's discount is this cart page's guess until the shop answers.
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import { applyCoupon } from "./cart.contracts.js";
import { CartDomain } from "./cart.domain.js";
import { ConfirmRemove } from "./confirm-remove.subroutine.js";
import { QuantityStepper } from "./quantity-stepper.trait.js";

const LineFacts = Schema.Struct({ lineId: Schema.String, quantity: Schema.Int });

export const CartPage = definition({
  id: "Checkout/Cart",
  states: ["SHOPPING", { REMOVING: ConfirmRemove }],
  events: { ApplyCoupon: { code: Schema.String } },
  internalEvents: {
    Loaded: { lines: Schema.Array(LineFacts), subtotalCents: Schema.Int },
    LoadFailed: {},
    QuantitySet: {},
    LineGone: {},
    QuantityUnsure: Flow.uncertain({}),
    Removed: {},
    RemoveUnsure: Flow.uncertain({}),
    CouponApplied: {},
    CouponRefused: { reason: Schema.String },
    CouponUnsure: Flow.uncertain({}),
  },
  memory: {
    cartId: Flow.input(Schema.String),
    lineIds: Flow.initial(Schema.Array(Schema.String), []), // the `of:` list of `steppers`
    quantities: Flow.initial(Schema.Record(Schema.String, Schema.Int), {}), // the steppers' starting counts
    subtotalCents: Flow.initial(Schema.Int, 0), // the last confirmed subtotal, for the coupon's guess
    removing: Flow.initial(Schema.NullOr(Schema.String), null), // the line the remove dialog asks about
    // The coupon's look, memory-held because it is a plain write (rule 36): what the page shows until the shop answers.
    coupon: Flow.initial(
      Schema.Struct({
        code: Schema.NullOr(Schema.String),
        status: Schema.Literals(["none", "applying", "applied", "refused", "unsure"]),
        predictedTotalCents: Schema.NullOr(Schema.Int),
        reason: Schema.NullOr(Schema.String),
      }),
      { code: null, status: "none", predictedTotalCents: null, reason: null },
    ),
  },
  traits: { steppers: QuantityStepper.each({ of: "lineIds", max: 50 }) },
  operations: ({ E }) => ({
    cart: CartDomain.cart.outcomes({
      value: E.Loaded.from((cart) => ({
        lines: cart.lines.map((l) => ({ lineId: l.lineId, quantity: l.quantity })),
        subtotalCents: cart.subtotalCents,
      })),
      failure: { NoResponse: E.LoadFailed, Defect: E.LoadFailed, Interrupted: E.LoadFailed },
    }),
    product: CartDomain.productById, // bare: a line's name is the product's record (E1, E19)
    setQuantity: CartDomain.setQuantity.outcomes({
      success: E.QuantitySet,
      failure: { LineGone: E.LineGone, NotSent: E.QuantitySet },
      unknown: E.QuantityUnsure,
    }),
    removeLine: CartDomain.removeLine.outcomes({
      success: E.Removed,
      failure: { LineGone: E.Removed, NotSent: E.Removed },
      unknown: E.RemoveUnsure,
    }),
    coupon: applyCoupon.outcomes(
      {
        success: E.CouponApplied,
        failure: {
          CouponRejected: E.CouponRefused.from((e) => ({ reason: e.reason })),
          NotSent: E.CouponRefused.from(() => ({ reason: "Not sent" })),
        },
        unknown: E.CouponUnsure,
      },
      { writes: ({ input }) => [CartDomain.cart.invalidate({ cartId: input.cartId })] }, // rule 36: by contract id
    ),
  }),
});
