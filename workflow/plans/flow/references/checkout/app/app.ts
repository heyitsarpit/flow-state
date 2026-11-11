// The closed machine universe of the shop. Nothing starts here.
import { app } from "flow-state";
import { CartMachine } from "../features/Cart/cart.machine.js";
import { MiniCartMachine } from "../features/Cart/mini-cart.machine.js";
import { PayMachine } from "../features/Pay/pay.machine.js";
import { RefundsMachine } from "../features/Refunds/refunds.machine.js";
import { ShopperMachine } from "../features/Shopper/shopper.machine.js";
import { ShopperRef } from "../features/Shopper/shopper.ref.js";

// The checkout reads who is shopping through this default (F22); nothing else reads upward.
export const CheckoutApp = app({
  id: "checkout",
  machines: {
    shopper: ShopperMachine,
    cart: CartMachine,
    miniCart: MiniCartMachine,
    pay: { machine: PayMachine, context: { signedIn: ShopperRef, savedAddress: ShopperRef } },
    refunds: RefundsMachine,
  },
});
