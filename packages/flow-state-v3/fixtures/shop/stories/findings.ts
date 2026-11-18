import { Schema } from "effect";
import { Fake } from "../../../src/host/testing/index.ts";
import { guestCart, mainCart, mainFlow, mainShopper } from "../app.ts";
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
  lane: 'lane/Shop/Cart/{"owner":7}|Shop/add-line|{"cartId":"main"}',
  laneText:
    '{"attempt":"att-000000000000000000006d61696e3a31-1","digest":"840bff58","displaced":[],"format":4,"inFlight":true,"input":{"cartId":"main","lineId":"l1","variantId":"v1"},"queue":[],"retryCount":0}',
  actor: 'actor/Shop/Cart/{"owner":7}',
  actorText:
    '{"context":{},"format":4,"graph":{},"memories":[],"memory":{"adding":"l1","errors":{},"lines":{},"notice":"","owner":"7","wanted":{}},"reactions":[],"schedules":[],"seen":{"shopper":""},"state":"OPEN"}',
  owed: 'owed/Shop/Cart/{"owner":"main","x":1}',
  owedText:
    '{"format":4,"rows":[{"attempt":"att-000000000000000000006d61696e3a31-1","channel":"unknown","kept":false,"operation":"add","reason":"Restored","value":null}]}',
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
  text: '{"format":4,"rows":[{"attempt":"att-000000000000000000006d61696e3a31-1","channel":"unknown","kept":false,"operation":"add","reason":"Restored","value":null}]}',
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
    '{"context":{},"format":4,"graph":{},"memories":[],"memory":{"adding":"","errors":{},"lines":{},"notice":"","owner":"5","wanted":{}},"reactions":[],"schedules":[],"seen":{"shopper":""},"state":"OPEN"}',
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
  `{"context":{"shopper":{"machine":"Shop/Shopper","name":"main"}},"format":4,"graph":{"Shop/Shopper/main":{}},"memories":[],"memory":{"adding":"","errors":{},"lines":{"${lineId}":{"quantity":1,"variantId":"v1"}},"notice":"","owner":"main","wanted":{}},"reactions":[],"schedules":[],"seen":{"shopper":""},"state":"OPEN"}`;

// An owed record holding one unknown ending: on the lane `lane` names after its identity, or of
// `operation` with no lane.
const owedOf = (row: { readonly lane: string } | { readonly operation: string }) =>
  `{"format":4,"rows":[{"attempt":"att-000000000000000000006d61696e3a39-9","channel":"unknown","kept":false,${
    "lane" in row ? `"lane":${jsonText(row.lane)}` : `"operation":${jsonText(row.operation)}`
  },"reason":"Restored","value":null}]}`;

// The main cart's lane keys start here.
const mainLane = 'lane/Shop/Cart/{"owner":"main"}';

// A Held head's input for the main cart.
const heldInput = '{"cartId":"main","lineId":"l1","variantId":"v1"}';

// A lane record of the main cart's add: Held with the held input, or with no head and an Attempt
// a cancel displaced.
const laneOf = (head: "held" | "headless") =>
  head === "headless"
    ? '{"displaced":["att-000000000000000000006d61696e3a39-9"],"format":4}'
    : `{"attempt":"att-000000000000000000006d61696e3a39-9","digest":"840bff58","displaced":[],"format":4,"inFlight":false,"input":${heldInput},"queue":[],"retryCount":0}`;

// An owed record holding an unknown ending of an add for an Attempt the main cart never made.
const mainOwedText = owedOf({ operation: "add" });

/**
 * Records whose key and content disagree, as a damaged disk or a bad copy could leave them: the
 * main cart's record with another line under a local key and under the guest's key (read as the
 * guest's: the key alone names the identity), an owed record under a local key and under a key that
 * does not round-trip, records of one kind under another kind's prefix, rows and lanes of
 * operations or contracts the cart never writes or by key text their key never gives, and records
 * of a machine no entry declares.
 */
export const borrowedRecords = {
  owed: [
    { key: "owed/Shop/Cart/~7", text: mainOwedText },
    { key: 'owed/Shop/Cart/{"owner":"main"} ', text: mainOwedText },
    { key: 'owed/Shop/Cart/{"owner":"wrong-kind"}', text: mainCartText("l7") },
    { key: "owed/Gone/x", text: mainOwedText },
    { key: "owed//x", text: mainOwedText },
    { key: 'owed/Shop/Cart/{"owner":"gone-op"}', text: owedOf({ operation: "gone" }) },
    {
      key: 'owed/Shop/Cart/{"owner":"other-lane"}',
      text: owedOf({ lane: 'add|{"cartId":"main"}' }),
    },
  ],
  lanes: [
    { key: `${mainLane}|Shop/add-line|GARBAGE`, text: laneOf("headless") },
    { key: `${mainLane}|Shop/add-line|`, text: laneOf("headless") },
    { key: `${mainLane}|Shop/add-line|{ "cartId": "main" }`, text: laneOf("headless") },
    { key: `${mainLane}|Shop/set-quantity|{"cartId":"main"}`, text: laneOf("headless") },
    { key: `${mainLane}|Shop/add-line|{"cartId":"other"}`, text: laneOf("held") },
    { key: `${mainLane}|gone|{"cartId":"main"}`, text: laneOf("headless") },
    { key: `${mainLane}|add|{"cartId":"main"}`, text: laneOf("headless") },
    { key: "lane/Gone/x|add|{}", text: laneOf("headless") },
  ],
  actors: [
    { key: "actor/Shop/Cart/~5", text: mainCartText("l9") },
    { key: 'actor/Shop/Cart/{"owner":"guest"}', text: mainCartText("l8") },
    { key: 'actor/Shop/Cart/{"owner":"wrong-kind"}', text: mainOwedText },
  ],
  gone: { key: "actor/Gone/x", text: mainCartText("l6") },
  other: [{ key: "junk/x", text: mainOwedText }],
} as const;

/**
 * The main cart adds a line; then the store holds records whose key and content disagree, and the
 * tab reloads: the main cart restores its own line and hears no ending it never made, and the
 * guest cart starts fresh as the guest's, never from the main cart's record under its key.
 */
export const borrowedRecordsReload = storeStory("shop/borrowed-records")
  .ensure(mainCart)
  .send(mainCart, add("l1", "v1"))
  .world(
    ...[
      ...borrowedRecords.owed,
      ...borrowedRecords.lanes,
      ...borrowedRecords.actors,
      borrowedRecords.gone,
      ...borrowedRecords.other,
    ].map(({ key, text }) => Fake.storage.put(key, text)),
  )
  .reload({ reattach: false })
  .checkpoint("booted")
  .ensure(mainCart)
  .ensure(guestCart)
  .checkpoint("restored");

// An owed record of the main cart holding one declined add, which has no Attempt and wakes the
// cart at the boot with the context its record was saved with.
const mainOwedNoAttempt =
  '{"format":4,"rows":[{"attempt":null,"channel":"notSent","kept":false,"operation":"add","reason":"Rejected","value":{"why":"Rejected"}}]}';

// The main cart's record holding one line `l9`, with its shopper slot bound to `provider` (JSON)
// and its graph as `graph` (JSON).
const boundCartText = (provider: string, graph: string) =>
  `{"context":{"shopper":${provider}},"format":4,"graph":${graph},"memories":[],"memory":{"adding":"","errors":{},"lines":{"l9":{"quantity":1,"variantId":"v1"}},"notice":"","owner":"main","wanted":{}},"reactions":[],"schedules":[],"seen":{"shopper":""},"state":"OPEN"}`;

/**
 * The main cart's record with its shopper slot bound to an identity no ref gives it, as a damaged
 * disk or a bad copy could leave it, each beside an owed ending that wakes the cart at the boot:
 * a local shopper, a shopper slot bound to a cart under a name no cart has, a machine no entry
 * declares, and a graph that binds the shopper's own provider to a local actor.
 */
export const forgedBindings = {
  cart: 'actor/Shop/Cart/{"owner":"main"}',
  owed: { key: 'owed/Shop/Cart/{"owner":"main"}', text: mainOwedNoAttempt },
  local: boundCartText('{"machine":"Shop/Shopper","name":"~9"}', '{"Shop/Shopper/~9":{}}'),
  otherMachine: boundCartText('{"machine":"Shop/Cart","name":"x"}', '{"Shop/Cart/x":{}}'),
  gone: boundCartText('{"machine":"Gone","name":"x"}', '{"Gone/x":{}}'),
  graph: boundCartText(
    '{"machine":"Shop/Shopper","name":"main"}',
    '{"Shop/Shopper/main":{"shopper":{"machine":"Shop/Shopper","name":"~9"}}}',
  ),
} as const;

// The main cart adds a line; then its record is replaced by `text` beside an owed ending, and the
// tab reloads and ensures the cart.
const boundReload = (id: string, text: string) =>
  storeStory(id)
    .ensure(mainCart)
    .send(mainCart, add("l1", "v1"))
    .world(
      Fake.storage.put(forgedBindings.cart, text),
      Fake.storage.put(forgedBindings.owed.key, forgedBindings.owed.text),
    )
    .reload({ reattach: false })
    .checkpoint("booted")
    .ensure(mainCart)
    .checkpoint("restored");

/**
 * The main cart's record bound to a local shopper: the record is set aside and reported, no local
 * shopper starts, and the cart starts fresh and hears its owed ending.
 */
export const boundToLocal = boundReload("shop/bound-to-local", forgedBindings.local);

/**
 * The main cart's shopper slot bound to a cart under a name no cart has: set aside and reported,
 * and the boot goes on.
 */
export const boundToOtherMachine = boundReload(
  "shop/bound-to-other-machine",
  forgedBindings.otherMachine,
);

/**
 * The main cart's shopper slot bound to a machine no entry declares: set aside and reported.
 */
export const boundToGone = boundReload("shop/bound-to-gone", forgedBindings.gone);

/**
 * The main cart's graph binding its shopper's own slot to a local actor: set aside and reported.
 */
export const boundGraphToLocal = boundReload("shop/bound-graph-to-local", forgedBindings.graph);

/**
 * An owed record of the main cart whose row names an add lane by key text no add's key gives, as
 * a damaged disk could leave it: set aside and reported, and the cart hears nothing from it.
 */
export const owedOtherLaneText = {
  key: 'owed/Shop/Cart/{"owner":"main"}',
  text: owedOf({ lane: "Shop/add-line|GARBAGE" }),
} as const;

/**
 * The main cart adds a line; then the store holds its owed record naming a lane no add's key
 * gives, and the tab reloads and ensures the cart.
 */
export const owedOtherLane = storeStory("shop/owed-other-lane")
  .ensure(mainCart)
  .send(mainCart, add("l1", "v1"))
  .world(Fake.storage.put(owedOtherLaneText.key, owedOtherLaneText.text))
  .reload({ reattach: false })
  .checkpoint("booted")
  .ensure(mainCart)
  .checkpoint("restored");

// A success of the main cart's add, as an owed row saves it: of Attempt `attempt` on its add lane,
// or with no Attempt and no lane.
const addedRow = (attempt: "nine" | "none") =>
  attempt === "nine"
    ? '{"attempt":"att-000000000000000000006d61696e3a39-9","channel":"success","kept":false,"lane":"Shop/add-line|{\\"cartId\\":\\"main\\"}","reason":"success","value":{"lineId":"l5","quantity":1,"variantId":"v1"}}'
    : '{"attempt":null,"channel":"success","kept":false,"operation":"add","reason":"success","value":{"lineId":"l5","quantity":1,"variantId":"v1"}}';

/**
 * Records a release never writes, each well-formed field by field, as a damaged disk or a bad copy
 * could leave them: an owed record holding one Attempt's success twice, one holding a success with
 * no Attempt (only a decline has none), and a lane record owing one displaced Attempt twice.
 */
export const forgedEndings = {
  repeatedRow: {
    key: 'owed/Shop/Cart/{"owner":"main"}',
    text: `{"format":4,"rows":[${addedRow("nine")},${addedRow("nine")}]}`,
  },
  madeUpSuccess: {
    key: 'owed/Shop/Cart/{"owner":"main"}',
    text: `{"format":4,"rows":[${addedRow("none")}]}`,
  },
  repeatedDisplaced: {
    key: `${mainLane}|Shop/add-line|{"cartId":"main"}`,
    text: '{"displaced":["att-000000000000000000006d61696e3a39-9","att-000000000000000000006d61696e3a39-9"],"format":4}',
  },
} as const;

// The main cart adds a line; then the store holds `forged`, and the tab reloads and ensures the
// cart.
const forgedReload = (id: string, forged: { readonly key: string; readonly text: string }) =>
  storeStory(id)
    .ensure(mainCart)
    .send(mainCart, add("l1", "v1"))
    .world(Fake.storage.put(forged.key, forged.text))
    .reload({ reattach: false })
    .checkpoint("booted")
    .ensure(mainCart)
    .checkpoint("restored");

/**
 * An owed record holding one Attempt's success twice: set aside and reported, and the cart never
 * hears it twice.
 */
export const owedRowRepeated = forgedReload("shop/owed-row-repeated", forgedEndings.repeatedRow);

/**
 * An owed record holding a success with no Attempt: set aside and reported, and the cart hears no
 * success nobody sent.
 */
export const owedMadeUpSuccess = forgedReload(
  "shop/owed-made-up-success",
  forgedEndings.madeUpSuccess,
);

/**
 * A lane record owing one displaced Attempt twice: set aside and reported, and the cart never hears
 * that Attempt's unknown twice.
 */
export const displacedRepeated = forgedReload(
  "shop/displaced-repeated",
  forgedEndings.repeatedDisplaced,
);

/**
 * The main cart's record remembering a selection of a slot its machine never declared, as a
 * damaged disk could leave it: set aside and reported, and the cart starts fresh.
 */
export const seenUndeclaredText = {
  key: 'actor/Shop/Cart/{"owner":"main"}',
  text: mainCartText("l9").replace('"seen":{"shopper":""}', '"seen":{"gone":"","shopper":""}'),
} as const;

/**
 * The main cart adds a line; then its record remembers a slot it never declared, and the tab
 * reloads and ensures the cart.
 */
export const seenUndeclared = forgedReload("shop/seen-undeclared", seenUndeclaredText);

// The Attempt the shape samples name: one the main cart never made, or with a Held head below.
const nine = "att-000000000000000000006d61696e3a39-9";

// A success of the main cart's add with Attempt nine and no lane, which only a store's refusal of a
// Held head's capture owes, and then unknown.
const laneLessSuccess =
  '{"attempt":"att-000000000000000000006d61696e3a39-9","channel":"success","kept":false,"operation":"add","reason":"success","value":{"lineId":"l5","quantity":1,"variantId":"v1"}}';

/**
 * Owed records holding a success with an Attempt and no lane, which no release writes: one for an
 * Attempt the cart never made, and one for the Held head's own Attempt beside that head's lane
 * record.
 */
export const laneLessEndings = {
  owed: {
    key: 'owed/Shop/Cart/{"owner":"main"}',
    text: `{"format":4,"rows":[${laneLessSuccess}]}`,
  },
  lane: { key: `${mainLane}|Shop/add-line|{"cartId":"main"}`, text: laneOf("held") },
} as const;

/**
 * The main cart adds a line; then the store holds a success with an Attempt and no lane, and the
 * tab reloads and ensures the cart.
 */
export const laneLessSuccessReload = forgedReload("shop/lane-less-success", laneLessEndings.owed);

/**
 * The main cart adds a line; then the store holds a Held add of Attempt nine and a success of that
 * same Attempt with no lane, and the tab reloads, ensures the cart and adds again.
 */
export const laneLessHeldSuccess = storeStory("shop/lane-less-held-success")
  .ensure(mainCart)
  .send(mainCart, add("l1", "v1"))
  .world(
    Fake.storage.put(laneLessEndings.lane.key, laneLessEndings.lane.text),
    Fake.storage.put(laneLessEndings.owed.key, laneLessEndings.owed.text),
  )
  .reload({ reattach: false })
  .checkpoint("booted")
  .ensure(mainCart)
  .checkpoint("restored");

const TAGS = ["absent", "Answered", "Unsent", "Refused", "Declined"] as const;

const PLACES = ["lane", "operation"] as const;

const ATTEMPTS = ["absent", "null", "minted"] as const;

const CHANNELS = ["absent", "success", "failure", "unknown", "notSent"] as const;

const REASONS = ["absent", "success", "StorageRefused", "Rejected"] as const;

const VALUES = ["absent", "null", "why", "line"] as const;

/**
 * One owed row's shape: its tag, whether it names its lane or its operation, its Attempt, channel,
 * reason and value, each present or absent.
 */
export type RowCombination = {
  readonly tag: (typeof TAGS)[number];
  readonly place: (typeof PLACES)[number];
  readonly attempt: (typeof ATTEMPTS)[number];
  readonly channel: (typeof CHANNELS)[number];
  readonly reason: (typeof REASONS)[number];
  readonly value: (typeof VALUES)[number];
};

const combinations: ReadonlyArray<RowCombination> = TAGS.flatMap((tag) =>
  PLACES.flatMap((place) =>
    ATTEMPTS.flatMap((attempt) =>
      CHANNELS.flatMap((channel) =>
        REASONS.flatMap((reason) =>
          VALUES.map((value) => ({ tag, place, attempt, channel, reason, value })),
        ),
      ),
    ),
  ),
);

const recordText = Schema.encodeSync(Schema.fromJsonString(Schema.Json));

// A shape's present parts, in key order, as canonical text puts them.
const rowOf = (row: RowCombination) =>
  Object.fromEntries(
    [
      ["_tag", row.tag === "absent" ? undefined : row.tag],
      ["attempt", { absent: undefined, null: null, minted: nine }[row.attempt]],
      ["channel", row.channel === "absent" ? undefined : row.channel],
      ["kept", false],
      [row.place, row.place === "lane" ? 'Shop/add-line|{"cartId":"main"}' : "add"],
      ["reason", row.reason === "absent" ? undefined : row.reason],
      [
        "value",
        {
          absent: undefined,
          null: null,
          why: { why: row.reason === "absent" ? "Rejected" : row.reason },
          line: { lineId: "l5", quantity: 1, variantId: "v1" },
        }[row.value],
      ],
    ].filter(([, v]) => v !== undefined),
  );

/**
 * One owed record per row shape, each under a cart of its own: every combination of tag, lane or
 * operation, Attempt, channel, reason and value, as a damaged disk or a bad copy could leave them.
 * Only the shapes a release writes may be read.
 */
export const rowCombinations = combinations.map((combination, i) => ({
  combination,
  key: `owed/Shop/Cart/{"owner":"s${String(i)}"}`,
  text: recordText({ format: 4, rows: [rowOf(combination)] }),
}));

/**
 * The main cart adds a line; then the store holds an owed record of every row shape, and the tab
 * reloads.
 */
export const rowCombinationsReload = storeStory("shop/row-combinations")
  .ensure(mainCart)
  .send(mainCart, add("l1", "v1"))
  .world(...rowCombinations.map(({ key, text }) => Fake.storage.put(key, text)))
  .reload({ reattach: false })
  .checkpoint("booted");
