import { Schema } from "effect";
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

const jsonText = Schema.encodeSync(Schema.fromJsonString(Schema.String));

// An owed record of the cart machine under `name`, holding one unknown ending, as a damaged disk or
// another release could leave it.
const owedCartRecord = (name: string) => ({
  key: `owed/Shop/Cart/${name}`,
  text: `{"format":3,"machine":"Shop/Cart","name":${jsonText(name)},"rows":[{"attempt":"att-000000000000000000006d61696e3a31-1","channel":"unknown","kept":false,"lane":null,"operation":"add","reason":"Restored","value":null}]}`,
});

/**
 * Owed records under cart names no ref can give: a local actor's name (local actors never save),
 * an empty name, a name with a broken escape, and one with spaces that does not name itself back.
 * Beside the local one, an actor record under the same name.
 */
export const oddNames = {
  owed: ["~5", "", '{"owner":"\\x"}', '{ "owner": "main" }'].map(owedCartRecord),
  actor: "actor/Shop/Cart/~5",
  actorText:
    '{"context":{},"format":3,"graph":{},"machine":"Shop/Cart","memories":[],"memory":{"adding":"","errors":{},"lines":{},"notice":"","owner":"5","wanted":{}},"name":"~5","reactions":[],"schedules":[],"seen":{"shopper":""},"state":"OPEN"}',
} as const;

/**
 * The main cart adds a line; then the store holds owed records under odd cart names, and the tab
 * reloads: none of them wakes a cart, each is set aside and reported, and the main cart restores.
 */
export const oddRecordNames = storeStory("shop/odd-record-names")
  .ensure(mainCart)
  .send(mainCart, add("l1", "v1"))
  .world(
    ...oddNames.owed.map(({ key, text }) => Fake.storage.put(key, text)),
    Fake.storage.put(oddNames.actor, oddNames.actorText),
  )
  .reload({ reattach: false })
  .checkpoint("booted")
  .ensure(mainCart)
  .checkpoint("restored");

// The main cart's record as it saves it, holding one line `lineId`.
const mainCartText = (lineId: string) =>
  `{"context":{"shopper":{"machine":"Shop/Shopper","name":"main"}},"format":3,"graph":{"Shop/Shopper/main":{}},"machine":"Shop/Cart","memories":[],"memory":{"adding":"","errors":{},"lines":{"${lineId}":{"quantity":1,"variantId":"v1"}},"notice":"","owner":"main","wanted":{}},"name":"{\\"owner\\":\\"main\\"}","reactions":[],"schedules":[],"seen":{"shopper":""},"state":"OPEN"}`;

// An owed record of `machine`'s `name`, holding one unknown ending of `operation` on `lane` (JSON).
const owedOf = (machine: string, name: string, operation: string, lane: string) =>
  `{"format":3,"machine":${jsonText(machine)},"name":${jsonText(name)},"rows":[{"attempt":"att-000000000000000000006d61696e3a39-9","channel":"unknown","kept":false,"lane":${lane},"operation":${jsonText(operation)},"reason":"Restored","value":null}]}`;

// The main cart's lane keys start here.
const mainLane = 'lane/Shop/Cart/{"owner":"main"}';

// A Held head's input for the main cart.
const heldInput = '{"cartId":"main","lineId":"l1","variantId":"v1"}';

// A lane record of the main cart for `operation`: Held with `input` (JSON), or with no head
// (`null`) and an Attempt a cancel displaced.
const laneOf = (operation: string, input: string) =>
  input === "null"
    ? `{"attempt":null,"displaced":["att-000000000000000000006d61696e3a39-9"],"format":3,"inFlight":false,"input":null,"machine":"Shop/Cart","name":"{\\"owner\\":\\"main\\"}","operation":${jsonText(operation)},"queue":[],"retryCount":0}`
    : `{"attempt":"att-000000000000000000006d61696e3a39-9","displaced":[],"format":3,"inFlight":false,"input":${input},"machine":"Shop/Cart","name":"{\\"owner\\":\\"main\\"}","operation":${jsonText(operation)},"queue":[],"retryCount":0}`;

// An owed record naming the main cart, holding an unknown ending for an Attempt it never made.
const mainOwedText = `{"format":3,"machine":"Shop/Cart","name":"{\\"owner\\":\\"main\\"}","rows":[{"attempt":"att-000000000000000000006d61696e3a39-9","channel":"unknown","kept":false,"lane":null,"operation":"add","reason":"Restored","value":null}]}`;

/**
 * Records whose key and content disagree, as a damaged disk or a bad copy could leave them: the
 * main cart's record with another line under a local key and under the guest's key, an owed
 * record naming the main cart under a local key and under a key that does not round-trip, and
 * records of one kind under another kind's prefix.
 */
export const borrowedRecords = {
  owed: [
    { key: "owed/Shop/Cart/~7", text: mainOwedText },
    { key: 'owed/Shop/Cart/{"owner":"main"} ', text: mainOwedText },
    { key: 'owed/Shop/Cart/{"owner":"wrong-kind"}', text: mainCartText("l7") },
    { key: "owed/Gone/x", text: owedOf("Gone", "x", "add", "null") },
    { key: "owed//x", text: owedOf("", "x", "add", "null") },
    {
      key: 'owed/Shop/Cart/{"owner":"gone-op"}',
      text: owedOf("Shop/Cart", '{"owner":"gone-op"}', "gone", "null"),
    },
    {
      key: 'owed/Shop/Cart/{"owner":"other-lane"}',
      text: owedOf(
        "Shop/Cart",
        '{"owner":"other-lane"}',
        "add",
        jsonText('Shop/Cart/{"owner":"main"}|add|{"cartId":"main"}'),
      ),
    },
  ],
  lanes: [
    { key: `${mainLane}|add|GARBAGE`, text: laneOf("add", "null") },
    { key: `${mainLane}|add|`, text: laneOf("add", "null") },
    { key: `${mainLane}|add|{ "cartId": "main" }`, text: laneOf("add", "null") },
    { key: `${mainLane}|set|{"cartId":"main"}`, text: laneOf("add", "null") },
    { key: `${mainLane}|add|{"cartId":"other"}`, text: laneOf("add", heldInput) },
    { key: `${mainLane}|gone|{"cartId":"main"}`, text: laneOf("gone", "null") },
    { key: "lane/Gone/x|add|{}", text: laneOf("add", "null").replace('"Shop/Cart"', '"Gone"') },
  ],
  actors: [
    { key: "actor/Shop/Cart/~5", text: mainCartText("l9") },
    { key: 'actor/Shop/Cart/{"owner":"guest"}', text: mainCartText("l8") },
    { key: 'actor/Shop/Cart/{"owner":"wrong-kind"}', text: mainOwedText },
    { key: "actor/Gone/x", text: mainCartText("l6").replace('"Shop/Cart"', '"Gone"') },
  ],
  other: [{ key: "junk/x", text: mainOwedText }],
} as const;

/**
 * The main cart adds a line; then the store holds records whose key and content disagree, and the
 * tab reloads: the main cart restores its own line and hears no ending it never made.
 */
export const borrowedRecordsReload = storeStory("shop/borrowed-records")
  .ensure(mainCart)
  .send(mainCart, add("l1", "v1"))
  .world(
    ...[
      ...borrowedRecords.owed,
      ...borrowedRecords.lanes,
      ...borrowedRecords.actors,
      ...borrowedRecords.other,
    ].map(({ key, text }) => Fake.storage.put(key, text)),
  )
  .reload({ reattach: false })
  .checkpoint("booted")
  .ensure(mainCart)
  .checkpoint("restored");
