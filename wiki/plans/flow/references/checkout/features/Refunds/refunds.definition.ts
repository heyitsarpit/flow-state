// The merchant's refunds page: recent orders, and "refund $X" per order.
//
// How this module is different (COVERAGE.md 5.3): its writes are money in order. `serialize` per charge queues the
// refunds and sends them one after another (`outstanding` on the row, `Overloaded` past 64, O7, O11); each predicts
// the order's refunded amount over the record beneath (E14); and each, when it lands, invalidates the orders list
// read, because the server's total is what the merchant reconciles against (`writes`, O22).
import { Schema } from "effect";
import { definition, Flow } from "flow-state";
import { ordersOf } from "./refunds.contracts.js";
import { RefundsDomain } from "./refunds.domain.js";

export const Refunds = definition({
  id: "Checkout/Refunds",
  states: ["READY"],
  events: {
    RefundAsked: { orderId: Schema.String, chargeId: Schema.String, amountCents: Schema.Int },
  },
  internalEvents: {
    Refunded: { orderId: Schema.String },
    OverRefund: { leftCents: Schema.Int },
    RefundNotSent: { why: Schema.String },
    RefundUnsure: Flow.uncertain({}),
  },
  memory: { notice: Flow.initial(Schema.String, "") },
  operations: ({ E }) => ({
    orders: RefundsDomain.orders,
    refund: RefundsDomain.refund.outcomes(
      {
        success: E.Refunded.from((r) => ({ orderId: r.orderId })),
        failure: {
          OverRefund: E.OverRefund.from((e) => ({ leftCents: e.leftCents })),
          // `Overloaded`: the 65th refund on one charge; nothing was sent.
          NotSent: E.RefundNotSent.from((e) => ({ why: e.why })),
        },
        unknown: E.RefundUnsure,
      },
      { writes: () => [ordersOf.invalidate({})] },
    ),
  }),
});
