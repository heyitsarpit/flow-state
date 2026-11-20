// The cart page. A line's quantity and total are the `CartLine` record's (`predicted` while a change is on its way);
// its name is the `Product` record's; the coupon's discount is this page's own guess, from memory, until the shop
// answers.
import { useActorByRef, useView } from "flow-state/react";
import { CartPage } from "./cart.definition.js";
import { CartLine, Cart as CartRecord, Product } from "./cart.domain.js";
import { cartRef } from "./cart.ref.js";

const { S, E, O } = CartPage;

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function CartScreen({ cartId }: { cartId: string }) {
  const cart = useActorByRef(cartRef(cartId), { input: { cartId } });
  const lineIds = useView(cart, (s) => s.memory.lineIds);
  const totals = useView(cart, (s) =>
    CartRecord.get(s, { cartId }, CartRecord.pick("totalCents", "discountCents")),
  );
  const coupon = useView(cart, (s) => s.memory.coupon);
  const removing = useView(cart, (s) => S.REMOVING.is(s));

  return (
    <section aria-label="Cart">
      <ul>
        {lineIds.map((lineId) => (
          <Line key={lineId} cart={cart} cartId={cartId} lineId={lineId} />
        ))}
      </ul>
      <p>
        Total:{" "}
        {coupon.status === "applying" && coupon.predictedTotalCents !== null ? (
          <em title="Applying your code">{money(coupon.predictedTotalCents)}</em>
        ) : (
          <span style={{ fontStyle: totals.predicted ? "italic" : undefined }}>
            {money(totals.data?.totalCents ?? 0)}
          </span>
        )}
      </p>
      {coupon.status === "refused" && <p role="alert">{coupon.reason}</p>}
      <button onClick={() => cart.send(E.ApplyCoupon({ code: "SAVE10" }))}>Apply SAVE10</button>
      {removing && (
        <dialog open>
          Remove this item?
          <button onClick={() => cart.send(E.REMOVING.Yes())}>Remove</button>
          <button onClick={() => cart.send(E.REMOVING.No())}>Keep</button>
        </dialog>
      )}
    </section>
  );
}

function Line({
  cart,
  cartId,
  lineId,
}: {
  cart: ReturnType<typeof useActorByRef>;
  cartId: string;
  lineId: string;
}) {
  const line = useView(cart, (s) =>
    CartLine.get(s, { cartId, lineId }, CartLine.pick("productId", "quantity", "lineTotalCents")),
  );
  const name = useView(cart, (s) =>
    line.data === undefined
      ? undefined
      : Product.get(s, { productId: line.data.productId }, Product.pick("name")).data?.name,
  );
  const lane = useView(cart, (s) => O.setQuantity.get(s, { cartId, lineId }));

  if (line.data === undefined) return null;

  return (
    <li aria-busy={lane.pending}>
      {name ?? line.data.productId}
      <button onClick={() => cart.send(E.steppers.key(lineId).Decrement())}>−</button>
      <span style={{ fontStyle: line.predicted ? "italic" : undefined }}>{line.data.quantity}</span>
      <button onClick={() => cart.send(E.steppers.key(lineId).Increment())}>+</button>
      {money(line.data.lineTotalCents)}
      {lane.waiting && <em> updating…</em>}
      {line.uncertain && <em title="We're checking this change">?</em>}
    </li>
  );
}
