import { Fake } from "../../../src/host/testing/index.ts";
import { mainCart, mainFlow, mainShopper } from "../app.ts";
import { Carts } from "../server/carts.ts";
import { add, setQuantity, storeStory } from "./usual.ts";

const twoLines = (id: string) =>
  storeStory(id).ensure(mainCart).send(mainCart, add("l1", "v1")).send(mainCart, add("l2", "v2"));

/**
 * One line's edit is held on the wire while another line's lands: neither waits on or ends the
 * other.
 */
export const independentLines = twoLines("shop/independent-lines")
  .world(Carts.setQuantity.hold({ at: "response" }))
  .send(mainCart, setQuantity("l1", 2))
  .send(mainCart, setQuantity("l2", 5))
  .checkpoint("b done")
  .world(Carts.setQuantity.release())
  .checkpoint("settled");

/**
 * Two lines edited at once; the first asks for more than is left and is refused, the second lands.
 */
export const failingLineAlone = twoLines("shop/failing-line-alone")
  .world(Carts.stock({ variantId: "v1", left: 1 }))
  .world(Carts.setQuantity.hold({ at: "response" }))
  .send(mainCart, setQuantity("l1", 3))
  .send(mainCart, setQuantity("l2", 4))
  .world(Carts.setQuantity.release())
  .checkpoint("settled");

/**
 * The second variant is sold out: its add is refused and the first line stays.
 */
export const refusedAddAlone = storeStory("shop/refused-add-alone")
  .ensure(mainCart)
  .send(mainCart, add("l1", "v1"))
  .world(Carts.soldOut({ variantId: "v2" }))
  .send(mainCart, add("l2", "v2"))
  .checkpoint("settled");

/**
 * A line set to 0 is removed.
 */
export const quantityZero = storeStory("shop/quantity-zero")
  .ensure(mainCart)
  .send(mainCart, add("l1", "v1"))
  .send(mainCart, setQuantity("l1", 0))
  .checkpoint("removed");

/**
 * The same cart ensured again while it is live.
 */
export const sameCartTwice = storeStory("shop/same-cart-twice")
  .ensure(mainCart)
  .send(mainCart, add("l1", "v1"))
  .ensure(mainCart)
  .checkpoint("again");

/**
 * Checkout is asked to begin while a quantity is still on the wire: denied, then allowed once it
 * lands.
 */
export const waitsWhileBusy = storeStory("shop/waits-while-busy")
  .ensure(mainShopper)
  .ensure(mainCart)
  .ensure(mainFlow)
  .send(mainCart, add("l1", "v1"))
  .world(Carts.setQuantity.hold({ at: "response" }))
  .send(mainCart, setQuantity("l1", 2))
  .send(mainFlow, { _tag: "Begin" })
  .checkpoint("busy")
  .world(Carts.setQuantity.release())
  .send(mainFlow, { _tag: "Begin" })
  .checkpoint("settled");

const checkingOut = (id: string) =>
  storeStory(id)
    .ensure(mainShopper)
    .ensure(mainCart)
    .ensure(mainFlow)
    .send(mainCart, add("l1", "v1"));

/**
 * A quantity's answer is lost after the server applied it; then checkout begins.
 */
export const quantityLost = checkingOut("shop/quantity-lost")
  .world(Carts.setQuantity.drop({ at: "response" }))
  .send(mainCart, setQuantity("l1", 2))
  .send(mainFlow, { _tag: "Begin" })
  .checkpoint("settled");

/**
 * The store refuses the write that would send a quantity; then checkout begins.
 */
export const quantityNotSaved = checkingOut("shop/quantity-not-saved")
  .world(Fake.storage.refuse())
  .send(mainCart, setQuantity("l1", 2))
  .send(mainFlow, { _tag: "Begin" })
  .checkpoint("settled");

/**
 * A line set to 0 is on the wire when it is set to 3; the 0 removes the line, so the 3 finds no
 * line; then checkout begins.
 */
export const removedLineAnswer = checkingOut("shop/removed-line-answer")
  .world(Carts.setQuantity.hold({ at: "response" }))
  .send(mainCart, setQuantity("l1", 0))
  .send(mainCart, setQuantity("l1", 3))
  .world(Carts.setQuantity.release())
  .send(mainCart, add("l2", "v2"))
  .send(mainFlow, { _tag: "Begin" })
  .checkpoint("settled");
