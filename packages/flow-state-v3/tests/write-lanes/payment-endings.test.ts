import { describe, expect, it } from "vite-plus/test";
import { checkout } from "../../fixtures/pay/machine.ts";
import { Shop } from "../../fixtures/pay/server.ts";
import { shopStory } from "../../fixtures/pay/stories.ts";
import { Fake } from "../../src/host/testing/index.ts";
import {
  before,
  charges,
  CHECK,
  keys,
  lastReason,
  laneFacts,
  memory,
  onWire,
  row,
  START,
  state,
  VISA,
} from "../checkout.ts";
import { played } from "../rules/played.ts";
import { expectResent, toResend } from "./resend.ts";

const declined = Shop.decline({ code: "card_declined" });

describe("payment endings", () => {
  it("PAY-01: a charge waits for its acknowledgement, lands, and the order is placed once (WriteLanes R2, R5, R8; WriteAhead R4)", async () => {
    const run = await played(
      shopStory("PAY-01")
        .ensure(checkout)
        .send(checkout, START)
        .checkpoint("card")
        .world(Fake.storage.hold())
        .send(checkout, VISA)
        .checkpoint("paying")
        .world(Fake.storage.hold(), Fake.storage.release())
        .checkpoint("placing")
        .world(Fake.storage.release())
        .checkpoint("paid"),
    );

    const { card, paying, placing, paid } = run.checkpoints;

    expect(state(card)).toBe("CARD");
    expect(state(paying)).toBe("PAYING");
    expect(row(paying)?.pending).toBe(true);
    expect(paying.read(Shop.confirm)).toHaveLength(0);
    expect(placing.read(Shop.confirm)).toHaveLength(1);
    expect(state(placing)).toBe("PLACING");
    expect(row(placing)).toBeUndefined();
    expect(placing.read(Shop.placeOrder)).toHaveLength(0);
    expect(paid.read(Shop.placeOrder)).toHaveLength(1);
    expect(state(paid)).toBe("PAID");
    expect(memory(paid)?.["receipt"]).toEqual({
      orderId: "o1",
      afterUnsure: false,
      alreadyPlaced: false,
    });
    expect(charges(paid)).toBe(1);
  });

  it("PAY-02: a second press while the charge is out is declined Rejected, and nothing waited behind the head (WriteLanes R7, R3, I8)", async () => {
    const run = await played(
      onWire("PAY-02", Shop.confirm.hold())
        .send(checkout, VISA)
        .checkpoint("again")
        .world(declined, Shop.confirm.release())
        .checkpoint("declined"),
    );

    const { again } = run.checkpoints;

    expect(state(again)).toBe("PAYING");
    expect(again.read(Shop.confirm)).toHaveLength(1);
    expect(memory(again)?.["notice"]).toBe("");
    expect(lastReason(before(run, "again"), "pay")).toBe("Rejected");
    expect(state(run.checkpoints.declined)).toBe("CARD");
    expect(row(run.checkpoints.declined)).toBeUndefined();
  });

  it("PAY-03: a charge that landed but whose answer was lost is read back capturable, released, and placed (WriteLanes R14, R8)", async () => {
    const run = await played(
      onWire("PAY-03", Shop.confirm.drop({ at: "response" }))
        .checkpoint("unsure")
        .world(Shop.placeOrder.hold())
        .advance(CHECK)
        .checkpoint("placing")
        .world(Shop.placeOrder.release())
        .checkpoint("paid"),
    );

    const { unsure, placing, paid } = run.checkpoints;

    expect(state(unsure)).toBe("UNSURE");
    expect(row(unsure)?.uncertain).toBe(true);
    expect(memory(unsure)?.["afterUnsure"]).toBe(true);
    expect(charges(unsure)).toBe(1);
    expect(placing.read(Shop.intent)).toHaveLength(1);
    expect(placing.read(Shop.orderFor)).toHaveLength(1);
    expect(state(placing)).toBe("PLACING");
    expect(row(placing)).toBeUndefined();
    expect(laneFacts(before(run, "placing"), "Released")).toBe(1);
    expect(placing.read(Shop.confirm)).toHaveLength(1);
    expect(state(paid)).toBe("PAID");
    expect(memory(paid)?.["receipt"]).toEqual({
      orderId: "o1",
      afterUnsure: true,
      alreadyPlaced: false,
    });
    expect(charges(paid)).toBe(1);
  });

  it("PAY-04: a re-send carries its Attempt's id and counts one retry; it lands once (WriteLanes R8, R5)", async () => {
    const run = await played(
      toResend("PAY-04")
        .world(Shop.placeOrder.hold(), Shop.confirm.release())
        .checkpoint("placing"),
    );

    const { resent, placing } = run.checkpoints;

    expectResent(run);
    expect(row(resent)?.retryCount).toBe(1);
    expect(state(placing)).toBe("PLACING");
    expect(charges(placing)).toBe(1);
    expect(keys(placing)).toBe(1);
    expect(memory(placing)?.["afterUnsure"]).toBe(true);
  });

  it("PAY-05: a decline of a re-send stays unknown StillUnknown and leaves the notice (WriteLanes R2)", async () => {
    const run = await played(
      toResend("PAY-05").world(declined, Shop.confirm.release()).checkpoint("declined"),
    );

    const { resent } = run.checkpoints;

    expectResent(run);
    expect(state(run.checkpoints.declined)).toBe("UNSURE");
    expect(row(run.checkpoints.declined)?.uncertain).toBe(true);
    expect(lastReason(run.evidence, "pay")).toBe("StillUnknown");
    expect(memory(run.checkpoints.declined)?.["notice"]).toBe(memory(resent)?.["notice"]);
  });

  it("PAY-05/held-head-sleeps-at-boot: a head saved Held has inFlight false, so the boot wakes no one (WriteAhead I24, Restore I1)", async () => {
    const run = await played(
      toResend("PAY-05/held-head-sleeps-at-boot")
        .world(declined, Shop.confirm.release())
        .checkpoint("declined")
        .detach(checkout)
        .advance("10 seconds")
        .checkpoint("asleep")
        .reload()
        .checkpoint("booted"),
    );

    expectResent(run);
    expect(state(run.checkpoints.declined)).toBe("UNSURE");

    const booted = before(run, "booted").slice(before(run, "asleep").length);

    expect(booted.filter((e) => e._tag === "Incarnated")).toHaveLength(0);
  });

  it("PAY-23: a challenge with no client secret writes no memory and keeps the hold (Turn R2, WriteLanes R8)", async () => {
    const run = await played(
      onWire("PAY-23", Shop.challenge({}), Shop.confirm.drop({ at: "response" }))
        .checkpoint("unsure")
        .advance(CHECK)
        .checkpoint("read"),
    );

    const { unsure, read } = run.checkpoints;

    expect(state(unsure)).toBe("UNSURE");
    expect(read.read(Shop.intent).map((c) => c.status)).toEqual(["answered"]);
    expect(state(read)).toBe("UNSURE");
    expect(memory(read)).toEqual(memory(unsure));
    expect(row(read)?.uncertain).toBe(true);
    expect(read.read(Shop.confirm)).toHaveLength(1);
  });
});
