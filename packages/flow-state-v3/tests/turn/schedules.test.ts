import { describe, expect, it } from "vite-plus/test";
import { checkout } from "../../fixtures/pay/app.ts";
import { Shop } from "../../fixtures/services/shop/server/shop.ts";
import { before, memory, onWire, type Records, state, VISA } from "../checkout.ts";
import { played } from "../rules/played.ts";

const SLOW = "Still confirming with your bank…";

const ticks = (records: Records) =>
  records.filter((e) => e._tag === "Turn" && e.event === "CheckTick").length;

describe("TURN-03: PAYING's 8-second slow notice (Turn R14, R15, R17, I20 to I23)", () => {
  it("TURN-03/unused: no firing while unused; the overdue deadline fires once on the returning use (Turn I22, I23)", async () => {
    const run = await played(
      onWire("TURN-03/unused", Shop.confirm.hold())
        .detach(checkout)
        .advance("9 seconds")
        .checkpoint("unused")
        .ensure(checkout)
        .checkpoint("back"),
    );

    expect(ticks(before(run, "unused"))).toBe(0);
    expect(memory(run.checkpoints.unused)?.["notice"]).toBe("");
    expect(ticks(before(run, "back"))).toBe(1);
    expect(state(run.checkpoints.back)).toBe("PAYING");
    expect(memory(run.checkpoints.back)?.["notice"]).toBe(SLOW);
  });

  it("TURN-03/exited: no firing after PAYING is left", async () => {
    const run = await played(
      onWire("TURN-03/exited", Shop.confirm.hold())
        .world(Shop.placeOrder.hold(), Shop.confirm.release())
        .checkpoint("placing")
        .advance("9 seconds")
        .checkpoint("later"),
    );

    expect(state(run.checkpoints.placing)).toBe("PLACING");
    expect(ticks(run.evidence)).toBe(0);
    expect(memory(run.checkpoints.later)?.["notice"]).toBe("");
  });

  it("TURN-03/on-time: not before its delay, once at it, and a Duration fires once (Turn I21)", async () => {
    const run = await played(
      onWire("TURN-03/on-time", Shop.confirm.hold())
        .advance("7999 millis")
        .checkpoint("7999")
        .advance("1 millis")
        .checkpoint("8000")
        .advance("8 seconds")
        .checkpoint("16000"),
    );

    expect(ticks(before(run, "7999"))).toBe(0);
    expect(memory(run.checkpoints["7999"])?.["notice"]).toBe("");
    expect(ticks(before(run, "8000"))).toBe(1);
    expect(ticks(before(run, "16000"))).toBe(1);
  });

  it("TURN-03/re-entered: the first activation's deadline never fires in the second (Turn I20)", async () => {
    const run = await played(
      onWire("TURN-03/re-entered", Shop.confirm.hold())
        .advance("4 seconds")
        .world(Shop.decline({ code: "card_declined" }), Shop.confirm.release())
        .checkpoint("card")
        .world(Shop.confirm.hold())
        .send(checkout, VISA)
        .checkpoint("paying")
        .advance("4500 millis")
        .checkpoint("later"),
    );

    expect(state(run.checkpoints.card)).toBe("CARD");
    expect(state(run.checkpoints.paying)).toBe("PAYING");
    expect(memory(run.checkpoints.later)?.["notice"]).toBe("");
  });
});
