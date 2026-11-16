import { Story } from "../../../src/host/testing/index.ts";
import {
  guestCart,
  guestShopper,
  mainBadge,
  mainCart,
  mainFlow,
  mainShopper,
  storeSetup,
} from "../app.ts";
import { CartFake } from "../server/layer.ts";
import { ShopFake } from "../server.ts";

/**
 * The shop over its port fakes, with no steps yet: every Story of the shop around the checkout
 * starts here.
 */
export const storeStory = (id: string) =>
  Story.app(storeSetup, { id, fixtures: [ShopFake, CartFake] });

/**
 * Adds a line of a variant.
 */
export const add = (lineId: string, variantId: string) =>
  ({ _tag: "Add", lineId, variantId }) as const;

/**
 * Sets a line's quantity.
 */
export const setQuantity = (lineId: string, quantity: number) =>
  ({ _tag: "SetQuantity", lineId, quantity }) as const;

/**
 * Ada signs in, adds two lines and edits one; the cart reads her name and the badge the cart's
 * count, bumping on each change; she signs out.
 */
export const browse = storeStory("pay/browse")
  .ensure(mainShopper)
  .ensure(mainCart)
  .ensure(mainBadge)
  .checkpoint("empty")
  .send(mainShopper, { _tag: "SignIn", name: "ada" })
  .send(mainCart, add("l1", "v1"))
  .checkpoint("added")
  .send(mainCart, add("l2", "v2"))
  .send(mainCart, setQuantity("l1", 3))
  .checkpoint("edited")
  .send(mainShopper, { _tag: "SignOut" })
  .checkpoint("signed out");

/**
 * A guest shops in a cart named for the guest.
 */
export const guestBrowse = storeStory("pay/guest-browse")
  .ensure(guestShopper)
  .ensure(guestCart)
  .send(guestCart, add("g1", "v1"))
  .checkpoint("added");

/**
 * Checkout on an empty cart is denied; after an add it moves through the address, the shipping
 * method and slot, and pay; Back twice returns to the slot, then the method; the tab reloads, and
 * Back once more reaches the address.
 */
export const checkoutSteps = storeStory("pay/checkout-steps")
  .ensure(mainShopper)
  .ensure(mainCart)
  .ensure(mainFlow)
  .send(mainFlow, { _tag: "Begin" })
  .checkpoint("empty cart")
  .send(mainCart, add("l1", "v1"))
  .send(mainFlow, { _tag: "Begin" })
  .checkpoint("address")
  .send(mainFlow, { _tag: "AddressEntered", line1: "12 Canal St" })
  .checkpoint("method")
  .send(mainFlow, { _tag: "MethodChosen", method: "express" })
  .send(mainFlow, { _tag: "SlotChosen", slot: "9-12" })
  .checkpoint("pay")
  .send(mainFlow, { _tag: "Back" })
  .checkpoint("back to slot")
  .send(mainFlow, { _tag: "Back" })
  .checkpoint("back to method")
  .reload()
  .checkpoint("reloaded")
  .send(mainFlow, { _tag: "Back" })
  .checkpoint("address again");
