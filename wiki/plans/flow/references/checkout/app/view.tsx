"use client";

// The shop's pages under one FlowProvider. A different shopper is a new Runtime (`key`), so nothing stored for one
// shopper is shown to another. The Cart's Checkout button hands the cart to the checkout actor.
import { FlowProvider, useActorByRef } from "flow-state/react";
import { CartScreen } from "../features/Cart/Cart.js";
import { MiniCartBadge } from "../features/Cart/MiniCart.js";
import { Pay } from "../features/Pay/pay.definition.js";
import { CheckoutScreen } from "../features/Pay/Pay.js";
import { payRef } from "../features/Pay/pay.ref.js";
import { RefundsScreen } from "../features/Refunds/Refunds.js";
import { shopSetup } from "./setup.js";

export function Shop({
  shopperId,
  route,
}: {
  shopperId: string;
  route: "/cart" | "/checkout" | "/admin/refunds";
}) {
  return (
    <FlowProvider key={shopperId} setup={shopSetup(shopperId)}>
      <MiniCartBadge cartId="cart-1" />
      {route === "/cart" && (
        <>
          <CartScreen cartId="cart-1" />
          <CheckoutButton cartId="cart-1" intentId="pi_1" />
        </>
      )}
      {route === "/checkout" && <CheckoutScreen paymentMethodId="pm_card_visa" />}
      {route === "/admin/refunds" && <RefundsScreen />}
    </FlowProvider>
  );
}

function CheckoutButton({ cartId, intentId }: { cartId: string; intentId: string }) {
  const checkout = useActorByRef(payRef, {});

  return <button onClick={() => checkout.send(Pay.E.Start({ cartId, intentId }))}>Checkout</button>;
}
