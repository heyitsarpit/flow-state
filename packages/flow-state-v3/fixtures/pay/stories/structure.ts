import { actorRef } from "../../../src/index.ts";
import { guestShopper, mainBadge, mainCart, mainFlow, mainShopper } from "../app.ts";
import { CartMachine } from "../machines/cart.ts";
import { Carts } from "../server/carts.ts";
import { add, setQuantity, storeStory } from "./usual.ts";

/**
 * Shopper, cart and badge, three layers; the add's answer is lost after it landed; the tab reloads
 * and only the badge, the deepest node, is ensured.
 */
export const chain = storeStory("pay/chain")
  .ensure(mainShopper)
  .ensure(mainCart)
  .ensure(mainBadge)
  .send(mainShopper, { _tag: "SignIn", name: "ada" })
  .world(Carts.addLine.drop({ at: "response" }))
  .send(mainCart, add("l1", "v1"))
  .send(mainCart, setQuantity("l1", 2))
  .reload({ reattach: false })
  .ensure(mainBadge)
  .checkpoint("reloaded");

const everything = (id: string) =>
  storeStory(id)
    .ensure(mainShopper)
    .ensure(mainCart)
    .ensure(mainBadge)
    .ensure(mainFlow)
    .send(mainCart, add("l1", "v1"));

/**
 * The checkout flow is disposed first, then the badge, the cart and the shopper; the Pay the flow
 * read is left with no use, and its grace passes.
 */
export const flowFirst = everything("pay/flow-first")
  .dispose(mainFlow)
  .dispose(mainBadge)
  .dispose(mainCart)
  .dispose(mainShopper)
  .advance("1 second")
  .checkpoint("disposed");

/**
 * The cart is let go and ends after its grace, then the shopper is forgotten; the cart, ensured
 * again, reads a fresh shopper.
 */
export const shopperForgotten = storeStory("pay/shopper-forgotten")
  .ensure(mainShopper)
  .send(mainShopper, { _tag: "SignIn", name: "ada" })
  .ensure(mainCart)
  .send(mainCart, add("l1", "v1"))
  .detach(mainCart)
  .advance("1 second")
  .dispose(mainShopper, { how: "forget" })
  .ensure(mainCart)
  .checkpoint("fresh");

/**
 * An add is on the wire when the tab reloads.
 */
export const reloadedMidAdd = storeStory("pay/reloaded-mid-add")
  .ensure(mainCart)
  .world(Carts.addLine.hold({ at: "response" }))
  .send(mainCart, add("l1", "v1"))
  .reload()
  .checkpoint("reloaded");

/**
 * The cart is disposed while its badge and checkout flow are bound to it.
 */
export const cartFirst = () => everything("pay/cart-first").dispose(mainCart);

/**
 * The main cart is live with the main shopper; a second ref names it with the guest.
 */
export const conflictingCart = () =>
  storeStory("pay/conflicting-cart")
    .ensure(mainShopper)
    .ensure(guestShopper)
    .ensure(mainCart)
    .ensure(actorRef(CartMachine, { owner: "main" }, { context: { shopper: guestShopper } }));

/**
 * The cart gets a line before its checkout flow is bound; then checkout begins.
 */
export const flowBoundLate = storeStory("pay/flow-bound-late")
  .ensure(mainShopper)
  .ensure(mainCart)
  .send(mainCart, add("l1", "v1"))
  .ensure(mainFlow)
  .send(mainFlow, { _tag: "Begin" })
  .checkpoint("begun");
