import { actorRef } from "flow-state";
import { CartMachine } from "./cart.machine.js";
import { MiniCartMachine } from "./mini-cart.machine.js";

// One cart page per cart, persisted: a quantity change on the wire survives a reload. The header's mini-cart is a
// second actor on the same cart: two screens, one set of records (E7).
export const cartRef = (cartId: string) => actorRef(CartMachine, cartId, { persist: true });

export const miniCartRef = (cartId: string) => actorRef(MiniCartMachine, cartId);
