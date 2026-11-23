// The cart page, server-rendered. The server ensures the shopper and the cart and dehydrates their resource
// entries; lanes are never hydrated (2.7.15). If the cart's coupon is still on its way when the capture deadline
// passes, the payload says so with a `DehydrateCommitInFlight` record naming the coupon's lane, and the browser
// shows the server's cart without the coupon's guess (P7): the browser's own coupon lane does not exist yet, so
// the shopper presses Apply again, and the shop's `Idempotency-Key` is a new one.
import { Suspense } from "react";
import { Hydrate } from "flow-state/react";
import { dehydrate } from "flow-state/server";
import { CartScreen } from "../features/Cart/Cart.js";
import { cartRef } from "../features/Cart/cart.ref.js";
import { ShopperRef } from "../features/Shopper/shopper.ref.js";
import { shopServerSetup } from "./server-setup.js";

declare function currentShopper(): Promise<{ id: string; cookie: string; cartId: string }>;

export default function CartPage() {
  return (
    <Suspense fallback={<p>Loading your cart…</p>}>
      <CartSegment />
    </Suspense>
  );
}

async function CartSegment() {
  const shopper = await currentShopper();

  const payload = await dehydrate(
    shopServerSetup(shopper),
    (runtime) => {
      runtime.ensureActor(ShopperRef);
      runtime.ensureActor(cartRef(shopper.cartId), { input: { cartId: shopper.cartId } });
    },
    { within: "800 millis" },
  );

  return (
    <Hydrate payload={payload}>
      <CartScreen cartId={shopper.cartId} />
    </Hydrate>
  );
}
