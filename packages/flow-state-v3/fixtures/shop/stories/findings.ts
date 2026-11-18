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

/**
 * Records a damaged disk or another release left under cart names this release cannot read: a
 * cart lane and its actor record under an owner that is a number, and owed endings under a name
 * with a field no cart's name has.
 */
export const unreadableNames = {
  lane: 'lane/Shop/Cart/{"owner":7}|add|{"cartId":"main"}',
  laneText:
    '{"attempt":"att-000000000000000000006d61696e3a31-1","displaced":[],"format":3,"inFlight":true,"input":{"cartId":"main","lineId":"l1","variantId":"v1"},"machine":"Shop/Cart","name":"{\\"owner\\":7}","operation":"add","queue":[],"retryCount":0}',
  actor: 'actor/Shop/Cart/{"owner":7}',
  actorText:
    '{"context":{},"format":3,"graph":{},"machine":"Shop/Cart","memories":[],"memory":{"adding":"l1","errors":{},"lines":{},"notice":"","owner":"7","wanted":{}},"name":"{\\"owner\\":7}","reactions":[],"schedules":[],"seen":{"shopper":""},"state":"OPEN"}',
  owed: 'owed/Shop/Cart/{"owner":"main","x":1}',
  owedText:
    '{"format":3,"machine":"Shop/Cart","name":"{\\"owner\\":\\"main\\",\\"x\\":1}","rows":[{"attempt":"att-000000000000000000006d61696e3a31-1","channel":"unknown","kept":false,"lane":null,"operation":"add","reason":"Restored","value":null}]}',
} as const;

/**
 * The main cart adds a line; then the store holds records under cart names that do not decode,
 * and the tab reloads: those records are set aside and reported, and only the main cart restores.
 */
export const unreadableName = storeStory("shop/unreadable-name")
  .ensure(mainCart)
  .send(mainCart, add("l1", "v1"))
  .world(
    Fake.storage.put(unreadableNames.lane, unreadableNames.laneText),
    Fake.storage.put(unreadableNames.actor, unreadableNames.actorText),
    Fake.storage.put(unreadableNames.owed, unreadableNames.owedText),
  )
  .reload({ reattach: false })
  .checkpoint("booted")
  .ensure(mainCart)
  .checkpoint("restored");
