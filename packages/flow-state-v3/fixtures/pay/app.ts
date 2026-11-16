import { Layer } from "effect";
import { actorRef, app, runtimeSetup } from "../../src/index.ts";
import { CartLive } from "./adapters/carts.ts";
import { PayMachine } from "./machine.ts";
import { CartMachine } from "./machines/cart.ts";
import { CartBadgeMachine } from "./machines/cart-badge.ts";
import { CheckoutFlowMachine } from "./machines/checkout-flow.ts";
import { ShopperMachine } from "./machines/shopper.ts";
import { ShopLive } from "./shop-http.ts";

/**
 * The signed-in shopper of this device.
 */
export const mainShopper = actorRef(ShopperMachine, "main");

/**
 * A guest shopping on the same device.
 */
export const guestShopper = actorRef(ShopperMachine, "guest");

/**
 * The main shopper's cart, which every badge and checkout reads unless its ref says otherwise.
 */
export const mainCart = actorRef(CartMachine, { owner: "main" });

/**
 * The guest's cart, bound by its ref to the guest shopper.
 */
export const guestCart = actorRef(
  CartMachine,
  { owner: "guest" },
  { context: { shopper: guestShopper } },
);

/**
 * The header badge of the main cart.
 */
export const mainBadge = actorRef(CartBadgeMachine, "badge-main");

/**
 * The main cart's checkout.
 */
export const mainFlow = actorRef(CheckoutFlowMachine, { cartId: "main" });

/**
 * The `n`th of many shoppers.
 */
export const shopperOf = (n: number) => actorRef(ShopperMachine, `s${String(n)}`);

/**
 * The cart of the `n`th of many shoppers, bound to that shopper.
 */
export const cartOf = (n: number) =>
  actorRef(CartMachine, { owner: `s${String(n)}` }, { context: { shopper: shopperOf(n) } });

/**
 * The shop: the checkout's Pay, and around it the shopper, their cart, its badge and the cart's
 * checkout flow.
 */
export const store = app({
  id: "shop",
  machines: {
    pay: PayMachine,
    shopper: ShopperMachine,
    cart: { machine: CartMachine, context: { shopper: mainShopper } },
    badge: { machine: CartBadgeMachine, context: { cart: mainCart } },
    checkout: {
      machine: CheckoutFlowMachine,
      context: { count: mainCart, busy: mainCart, shopper: mainShopper },
    },
  },
});

/**
 * The shop's real setup: the payments and cart services over HTTP, persisted, each capture written
 * at once. A Story never builds its services.
 */
export const storeSetup = runtimeSetup({
  app: store,
  services: Layer.mergeAll(ShopLive("https://shop.example"), CartLive("https://cart.example")),
  scope: "shop",
  persistence: { captureMs: 0 },
});
