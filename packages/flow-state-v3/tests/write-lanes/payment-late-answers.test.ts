import { describe, expect, it } from "vite-plus/test";
import { checkout } from "../../fixtures/shop/app.ts";
import { Shop } from "../../fixtures/services/shop/server/shop.ts";
import { Pay } from "../../fixtures/services/shop/machines/pay.ts";
import { shopStory } from "../../fixtures/shop/stories/usual.ts";
import { type Cut, Fake } from "../../src/host/testing/index.ts";
import {
  before,
  charges,
  CHECK,
  endings,
  lastReason,
  memory,
  onWire,
  START,
  state,
  VISA,
} from "../checkout.ts";
import { played } from "../rules/played.ts";

const LEAVE = Pay.E.Leave();

const landed = (cut: Cut) => [
  Object.keys(cut.read(Shop).orders).length,
  cut.read(Shop.voidAuthorization).filter((c) => c.status === "answered").length,
];

it("PAY-18: an acknowledgement that landed unheard sends nothing, and the boot restores the charge unknown (WriteAhead R13, R14)", async () => {
  const run = await played(
    shopStory("PAY-18")
      .ensure(checkout)
      .send(checkout, START)
      .world(Fake.storage.hold())
      .send(checkout, VISA)
      .advance("10 seconds")
      .checkpoint("waiting")
      .reload({ heldWrites: "land" })
      .checkpoint("reloaded"),
  );

  const { waiting, reloaded } = run.checkpoints;

  expect(state(waiting)).toBe("PAYING");
  expect(String(memory(waiting)?.["notice"]).includes("haven't been charged")).toBe(false);
  expect(waiting.read(Shop.confirm)).toHaveLength(0);
  expect(state(reloaded)).toBe("UNSURE");
  expect(lastReason(run.evidence, "pay")).toBe("Restored");
});

describe("PAY-19 (Turn R20, Turn R21)", () => {
  it("PAY-19/void-answers-first: the void, then the order, both land, and the order wins", async () => {
    const run = await played(
      onWire("PAY-19/void-answers-first", Shop.placeOrder.hold())
        .send(checkout, LEAVE)
        .world(Shop.placeOrder.release())
        .checkpoint("paid"),
    );

    const { paid } = run.checkpoints;

    expect(state(paid)).toBe("PAID");
    expect(landed(paid)).toEqual([1, 1]);
  });

  it("PAY-19/place-answers-first: the order, then the void, both land, and the shopper stays left with no receipt", async () => {
    const run = await played(
      onWire("PAY-19/place-answers-first", Shop.placeOrder.hold(), Shop.voidAuthorization.hold())
        .send(checkout, LEAVE)
        .world(Shop.placeOrder.release())
        .checkpoint("placed")
        .world(Shop.voidAuthorization.release())
        .checkpoint("voided"),
    );

    const { placed, voided } = run.checkpoints;

    expect(state(placed)).toBe("LEFT");
    expect(state(voided)).toBe("LEFT");
    expect(landed(voided)).toEqual([1, 1]);
    expect(memory(voided)?.["receipt"]).toBe(null);
  });
});

describe("PAY-20 (WriteLanes R2, WriteLanes R5)", () => {
  it("PAY-20/a-500-that-landed-is-unknown-and-pay-reads-the-intent", async () => {
    const run = await played(
      onWire("PAY-20/a-500-that-landed", Shop.landThenFail({}))
        .checkpoint("unsure")
        .world(Shop.placeOrder.hold())
        .advance(CHECK)
        .checkpoint("placing"),
    );

    const { unsure, placing } = run.checkpoints;

    expect(state(unsure)).toBe("UNSURE");
    expect(endings(before(run, "unsure"), "pay").at(-1)?.channel).toBe("unknown");
    expect(charges(unsure)).toBe(1);
    expect(state(placing)).toBe("PLACING");
    expect(placing.read(Shop.confirm)).toHaveLength(1);
    expect(charges(placing)).toBe(1);
  });

  it("PAY-20/a-pruned-key-does-not-charge-twice-since-pay-reads-first", async () => {
    const run = await played(
      onWire("PAY-20/a-pruned-key", Shop.confirm.drop({ at: "response" }), Shop.placeOrder.hold())
        .advance(CHECK)
        .checkpoint("placing"),
    );

    const { placing } = run.checkpoints;

    expect(state(placing)).toBe("PLACING");
    expect(placing.read(Shop.confirm)).toHaveLength(1);
    expect(charges(placing)).toBe(1);
  });
});
