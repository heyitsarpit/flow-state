// The header: how many items, and a remove per line. The same `CartLine` records the cart page shows (E7): a
// quantity change there is here at once, predicted.
import { useActorByRef, useView } from "flow-state/react";
import { CartLine } from "./cart.domain.js";
import { miniCartRef } from "./cart.ref.js";
import { MiniCart } from "./mini-cart.machine.js";

export function MiniCartBadge({ cartId }: { cartId: string }) {
  const mini = useActorByRef(miniCartRef(cartId), { input: { cartId } });
  const lines = useView(mini, (s) => s.operations.cart?.data?.lines ?? []);
  const count = useView(mini, (s) =>
    lines.reduce(
      (sum, l) => sum + (CartLine.get(s, l, CartLine.pick("quantity")).data?.quantity ?? 0),
      0,
    ),
  );

  return (
    <details>
      <summary>{count} items</summary>
      {lines.map((l) => (
        <button key={l.lineId} onClick={() => mini.send(MiniCart.E.Remove({ lineId: l.lineId }))}>
          Remove {l.productId}
        </button>
      ))}
    </details>
  );
}
