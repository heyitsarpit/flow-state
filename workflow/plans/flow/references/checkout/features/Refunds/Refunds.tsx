// The merchant's refunds page. Each order's refunded amount is the record's (`predicted` while refunds are queued);
// the charge's lane says how many are still to go (`outstanding`, serialize's count).
import { useActorByRef, useView } from "flow-state/react";
import { Refunds } from "./refunds.definition.js";
import { Order } from "./refunds.domain.js";
import { refundsRef } from "./refunds.ref.js";

const { E, O } = Refunds;

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function RefundsScreen() {
  const refunds = useActorByRef(refundsRef, {});
  const orders = useView(refunds, (s) => s.operations.orders?.data ?? []);
  const notice = useView(refunds, (s) => s.memory.notice);

  return (
    <section aria-label="Refunds">
      {notice !== "" && <p role="status">{notice}</p>}
      <ul>
        {orders.map((order) => (
          <OrderRow
            key={order.orderId}
            orderId={order.orderId}
            chargeId={order.chargeId}
            refunds={refunds}
          />
        ))}
      </ul>
    </section>
  );
}

function OrderRow({
  orderId,
  chargeId,
  refunds,
}: {
  orderId: string;
  chargeId: string;
  refunds: ReturnType<typeof useActorByRef>;
}) {
  const order = useView(refunds, (s) =>
    Order.get(s, { orderId }, Order.pick("amountCents", "refundedCents", "status")),
  );
  const lane = useView(refunds, (s) => O.refund.get(s, { chargeId }));

  if (order.data === undefined) return null;

  return (
    <li aria-busy={lane.pending}>
      {orderId} · {money(order.data.amountCents)} ·{" "}
      <span style={{ fontStyle: order.predicted ? "italic" : undefined }}>
        refunded {money(order.data.refundedCents)}
      </span>
      {lane.outstanding > 0 && <em> {lane.outstanding} to go</em>}
      {order.uncertain && <em title="We're checking a refund">?</em>}
      <button
        onClick={() => refunds.send(E.RefundAsked({ orderId, chargeId, amountCents: 1_000 }))}
      >
        Refund $10
      </button>
    </li>
  );
}
