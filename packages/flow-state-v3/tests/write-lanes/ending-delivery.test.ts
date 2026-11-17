import { expect, it } from "vite-plus/test";
import { checkout, secondCheckout } from "../../fixtures/shop/app.ts";
import { Shop } from "../../fixtures/services/shop/server/shop.ts";
import { shopStory } from "../../fixtures/shop/stories/usual.ts";
import type { StoryRun } from "../../src/host/testing/index.ts";
import { before, endings, issues, memory, type Records, state, VISA } from "../checkout.ts";
import { played } from "../rules/played.ts";

const cart = (intentId: string) =>
  ({ _tag: "Start", cartId: `cart-${intentId}`, intentId }) as const;

const restored = (run: StoryRun) =>
  endings(run.evidence, "pay").filter((e) => e.reason === "Restored").length;

const tries = (records: Records, operation: string) =>
  records.filter((e) => e._tag === "Delivered" && e.operation === operation).length;

// A refused ending turn: the shop turns the charge away as busy with a negative delay, which the
// WAITING retry cannot arm.
const refusedCharge = (id: string) =>
  shopStory(id)
    .ensure(checkout)
    .send(checkout, cart("pi1"))
    .world(Shop.busy({ retryAfterMs: -1 }))
    .send(checkout, VISA);

it("DLV-01: two charges of one shopper on the wire are each restored once (WriteLanes R10, I15; Restore I6)", async () => {
  const run = await played(
    shopStory("DLV-01")
      .ensure(checkout)
      .world(Shop.confirm.hold(), Shop.confirm.hold())
      .send(checkout, cart("pi1"))
      .send(checkout, VISA)
      .send(checkout, { _tag: "Leave" })
      .checkpoint("left")
      .send(checkout, cart("pi2"))
      .send(checkout, VISA)
      .checkpoint("paying")
      .reload()
      .checkpoint("reloaded"),
  );

  const { left, paying } = run.checkpoints;

  expect(state(left)).toBe("LEFT");
  expect(state(paying)).toBe("PAYING");
  expect(paying.read(Shop.confirm)).toHaveLength(2);
  expect(restored(run)).toBe(2);
});

it("DLV-02: two shoppers' charges on the wire are each restored once (WriteLanes R10, I15; Restore I6)", async () => {
  const run = await played(
    shopStory("DLV-02")
      .ensure(checkout)
      .ensure(secondCheckout)
      .world(Shop.confirm.hold(), Shop.confirm.hold())
      .send(checkout, cart("pi1"))
      .send(checkout, VISA)
      .send(secondCheckout, cart("pi2"))
      .send(secondCheckout, VISA)
      .reload()
      .checkpoint("reloaded"),
  );

  const { reloaded } = run.checkpoints;

  expect(restored(run)).toBe(2);
  expect(state(reloaded, checkout)).toBe("UNSURE");
  expect(state(reloaded, secondCheckout)).toBe("UNSURE");
});

it("DLV-03: an ending reaches only its own shopper (WriteLanes R10, I15)", async () => {
  const run = await played(
    shopStory("DLV-03")
      .ensure(checkout)
      .ensure(secondCheckout)
      .send(checkout, cart("pi1"))
      .world(Shop.decline({ code: "card_declined" }))
      .send(checkout, VISA)
      .checkpoint("declined"),
  );

  const { declined } = run.checkpoints;

  expect(state(declined, checkout)).toBe("CARD");
  expect(memory(declined, checkout)?.["notice"]).toBe("Your card was declined (card_declined).");
  expect(state(declined, secondCheckout)).toBe("IDLE");
});

it("DLV-04: a refused ending is an issue, sends nothing again, and is not re-sent at the boot (WriteLanes R10, I15; Actors R15, I24)", async () => {
  const run = await played(
    refusedCharge("DLV-04").checkpoint("refused").reload().checkpoint("reloaded"),
  );

  const { refused, reloaded } = run.checkpoints;

  expect(state(refused)).toBe("PAYING");
  expect(refused.read(Shop.confirm)).toHaveLength(1);
  expect(memory(refused)?.["receipt"]).toBe(null);
  expect(issues(before(run, "refused")).includes("InvalidTurn")).toBe(true);
  expect(state(reloaded)).toBe("PAYING");
  expect(memory(reloaded)?.["receipt"]).toBe(null);
  expect(reloaded.read(Shop.confirm)).toHaveLength(1);
});

it("DLV-05: a refused ending is delivered, once more after the refusal, and once at each boot (Actors R15, I24; WriteLanes R10, I15)", async () => {
  const run = await played(
    refusedCharge("DLV-05")
      .checkpoint("refused")
      .reload()
      .checkpoint("booted")
      .reload()
      .checkpoint("booted again"),
  );

  expect(tries(before(run, "refused"), "pay")).toBe(2);
  expect(tries(before(run, "booted"), "pay")).toBe(3);
  expect(tries(before(run, "booted again"), "pay")).toBe(4);
  expect(memory(run.checkpoints["booted again"])?.["receipt"]).toBe(null);
});

it("DLV-06: a kept ending leaves no lane to queue on, so the next charge declines Rejected (WriteLanes R6, I8; Actors R15)", async () => {
  const run = await played(
    refusedCharge("DLV-06")
      .checkpoint("refused")
      .send(checkout, { _tag: "Leave" })
      .checkpoint("left")
      .send(checkout, cart("pi1"))
      .checkpoint("card")
      .send(checkout, VISA)
      .checkpoint("pressed"),
  );

  const { left, card, pressed } = run.checkpoints;

  expect(tries(before(run, "refused"), "pay")).toBe(2);
  expect(state(left)).toBe("LEFT");
  expect(state(card)).toBe("CARD");
  expect(state(pressed)).toBe("PAYING");
  expect(pressed.read(Shop.confirm)).toHaveLength(1);
  expect(endings(run.evidence, "pay").at(-1)?.reason).toBe("Rejected");
});
