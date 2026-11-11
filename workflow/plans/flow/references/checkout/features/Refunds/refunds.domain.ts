// What a refund means for the order record: its refunded amount grows by the refund, at once, on every screen that
// shows the order (E14: a field function over the record beneath, so a second queued refund adds to the first's
// prediction). The lane and its predicted key persist together, so a reload mid-refund keeps the order marked and
// repairs it from the server (E18).
import { desc, domain, entity, read, write } from "flow-state";
import { Order as OrderRow } from "../../adapters/types.js";
import { ordersOf, refund } from "./refunds.contracts.js";

export const Order = entity({
  id: "Checkout/Order",
  fields: OrderRow.fields,
  primaryKey: ["orderId"],
  version: "revision",
});

export const RefundsDomain = domain("refunds", {
  orders: read(ordersOf)
    .list(Order, ({ output }) => output)
    .orderBy(({ record }) => [desc(record.orderId)]),

  refund: write(refund).predicts(({ input }) =>
    Order.patch(
      { orderId: input.orderId },
      {
        refundedCents: (beneath, input) => beneath.refundedCents + input.amountCents,
        status: (beneath, input) =>
          beneath.refundedCents + input.amountCents >= beneath.amountCents
            ? "refunded"
            : "refunding",
      },
    ),
  ),
});
