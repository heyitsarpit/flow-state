import { Fake, samplesOf } from "../../../src/host/testing/index.ts";
import { mainBadge, mainCart, mainFlow, mainShopper } from "../app.ts";
import { Carts } from "../server/carts.ts";
import { forgedEndings, owedOtherLaneText, seenUndeclaredText } from "./findings.ts";
import { add, setQuantity, storeStory } from "./usual.ts";

/**
 * What a shopper and the cart service can do in the shop around the checkout, for generated runs:
 * sign in and out, add and edit lines (0 and negative among them) and step through checkout; the
 * service sells a variant out or runs low. Pay's own samples drive the checkout's Pay.
 */
export const samples = samplesOf({
  id: "shop-store",
  story: storeStory("shop/store-samples"),
  names: { setup: "storeSetup", fixtures: ["ShopFake", "CartFake"] },
  actors: { mainShopper, mainCart, mainBadge, mainFlow },
  servers: { Carts },
  failures: [Carts.soldOut({ variantId: "v2" }), Carts.stock({ variantId: "v1", left: 1 })],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) =>
    story
      .send(mainShopper, { _tag: "SignIn", name: "ada" })
      .send(mainShopper, { _tag: "SignOut" })
      .send(mainCart, add("l1", "v1"))
      .send(mainCart, add("l2", "v2"))
      .send(mainCart, setQuantity("l1", 3))
      .send(mainCart, setQuantity("l1", 0))
      .send(mainCart, setQuantity("l2", -1))
      .send(mainFlow, { _tag: "Begin" })
      .send(mainFlow, { _tag: "AddressEntered", line1: "12 Canal St" })
      .send(mainFlow, { _tag: "MethodChosen", method: "express" })
      .send(mainFlow, { _tag: "SlotChosen", slot: "9-12" })
      .send(mainFlow, { _tag: "Back" }),
});

/**
 * The main cart with a record on disk no release wrote, for generated runs: its owed record naming
 * a lane by key text no add's key gives, which a reload must set aside and report.
 */
export const recordSamples = samplesOf({
  id: "shop-records",
  story: storeStory("shop-records/samples"),
  names: { setup: "storeSetup", fixtures: ["ShopFake", "CartFake"] },
  actors: { mainCart },
  servers: { Carts },
  failures: [
    Fake.storage.put(owedOtherLaneText.key, owedOtherLaneText.text),
    ...Object.values(forgedEndings).map((f) => Fake.storage.put(f.key, f.text)),
    Fake.storage.put(seenUndeclaredText.key, seenUndeclaredText.text),
  ],
  landedFailures: [],
  values: {},
  controls: [],
  steps: (story) => story.send(mainCart, add("l1", "v1")).send(mainCart, setQuantity("l1", 3)),
});
