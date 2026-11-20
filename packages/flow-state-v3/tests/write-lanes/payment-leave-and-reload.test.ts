import { describe, expect, it } from "vite-plus/test";
import { checkout } from "../../fixtures/shop/app.ts";
import { Shop } from "../../fixtures/services/shop/server/shop.ts";
import { Pay } from "../../fixtures/services/shop/machines/pay.ts";
import { shopStory } from "../../fixtures/shop/stories/usual.ts";
import { Fake } from "../../src/host/testing/index.ts";
import {
  before,
  charges,
  denials,
  endings,
  lastReason,
  memory,
  onWire,
  row,
  START,
  state,
  steadfastStory,
  VISA,
} from "../checkout.ts";
import { played } from "../rules/played.ts";
import { reloadOnWire } from "./reload-on-wire.ts";

const LEAVE = Pay.E.Leave();

describe("PAY-06 (WriteLanes R2, WriteLanes R8, WriteLanes R10)", () => {
  it("PAY-06/interruptible: a charge that never answers ends unknown at its deadline, and its late landing ends nothing more", async () => {
    const run = await played(
      onWire("PAY-06/interruptible", Shop.confirm.hold())
        .advance("8 seconds")
        .checkpoint("slow")
        .advance("52 seconds")
        .checkpoint("late")
        .world(Shop.confirm.release())
        .checkpoint("landed"),
    );

    const { slow, late, landed } = run.checkpoints;

    expect(state(slow)).toBe("PAYING");
    expect(memory(slow)?.["notice"]).toBe("Still confirming with your bank…");
    expect(row(slow)?.pending).toBe(true);
    expect(state(late)).toBe("UNSURE");
    expect(row(late)?.uncertain).toBe(true);
    expect(endings(before(run, "late"), "pay").at(-1)?.channel).toBe("unknown");
    expect(state(landed)).toBe("UNSURE");
    expect(row(landed)?.uncertain).toBe(true);
    expect(charges(landed)).toBe(1);
    expect(endings(run.evidence, "pay")).toHaveLength(1);
  });

  it("PAY-06/uninterruptible: a charge the network will not interrupt still ends once at its deadline", async () => {
    const run = await played(
      steadfastStory("PAY-06/uninterruptible")
        .ensure(checkout)
        .send(checkout, START)
        .world(Shop.confirm.hold())
        .send(checkout, VISA)
        .advance("60 seconds")
        .checkpoint("late")
        .world(Shop.confirm.release())
        .checkpoint("landed"),
    );

    expect(state(run.checkpoints.late)).toBe("UNSURE");
    expect(state(run.checkpoints.landed)).toBe("UNSURE");
    expect(endings(run.evidence, "pay")).toHaveLength(1);
  });
});

describe("PAY-07 (WriteLanes R16, WriteLanes R7)", () => {
  it("PAY-07/leaveMidCharge: leaving mid-charge keeps the charge, and its late success voids the hold", async () => {
    const run = await played(
      onWire("PAY-07/leaveMidCharge", Shop.confirm.hold())
        .send(checkout, LEAVE)
        .checkpoint("left")
        .world(Shop.voidAuthorization.hold(), Shop.confirm.release())
        .checkpoint("confirmed")
        .world(Shop.voidAuthorization.release())
        .checkpoint("voided"),
    );

    const { left, confirmed, voided } = run.checkpoints;

    expect(state(left)).toBe("LEFT");
    expect(row(left)?.pending).toBe(true);
    expect(state(confirmed)).toBe("LEFT");
    expect(confirmed.read(Shop.voidAuthorization)).toHaveLength(1);
    expect(state(voided)).toBe("LEFT");
    expect(memory(voided)?.["notice"]).toBe("The hold on your card was released.");
    expect(memory(voided)?.["authorized"]).toBe(false);
  });

  it("PAY-07/late-in-a-new-PAYING: an old charge's late success in a new PAYING ends its lane and lands once", async () => {
    const run = await played(
      onWire("PAY-07/late-in-a-new-PAYING", Shop.confirm.hold())
        .send(checkout, LEAVE)
        .send(checkout, START)
        .send(checkout, VISA)
        .checkpoint("paying")
        .world(Shop.confirm.release())
        .checkpoint("late"),
    );

    const { paying, late } = run.checkpoints;

    expect(state(paying)).toBe("PAYING");
    expect(state(late)).toBe("PAYING");
    expect(row(late)).toBeUndefined();
    expect(charges(late)).toBe(1);
  });

  it("PAY-07/late-may-not-leave: an order placed after the shopper left and started again is denied", async () => {
    const run = await played(
      onWire("PAY-07/late-may-not-leave", Shop.placeOrder.hold(), Shop.voidAuthorization.hold())
        .send(checkout, LEAVE)
        .send(checkout, START)
        .world(Shop.confirm.hold())
        .send(checkout, VISA)
        .world(Shop.placeOrder.release())
        .checkpoint("placed"),
    );

    expect(state(run.checkpoints.placed)).toBe("PAYING");
    expect(denials(run.evidence).at(-1)).toEqual(["LateMayNotLeave"]);
  });

  it.fails("Turn R19, I15: an order ending denied by its guard publishes its lane-only change once, and nothing of its own", async () => {
    const run = await played(
      onWire(
        "PAY-07/denied-ending-publishes",
        Shop.placeOrder.hold(),
        Shop.voidAuthorization.hold(),
      )
        .send(checkout, LEAVE)
        .send(checkout, START)
        .world(Shop.confirm.hold())
        .send(checkout, VISA)
        .checkpoint("before")
        .world(Shop.placeOrder.release())
        .checkpoint("placed"),
    );

    const step = before(run, "placed").slice(before(run, "before").length);

    expect(denials(step)).toEqual([["LateMayNotLeave"]]);
    expect(step.filter((e) => e._tag === "Turn")).toEqual([]);
    expect(step.filter((e) => e._tag === "Published")).toHaveLength(1);
    expect(run.checkpoints.placed.read(checkout)?.memory).toEqual(memory(run.checkpoints.before));
  });
});

describe("PAY-08 (Restore R1, Restore R2, WriteLanes R8)", () => {
  it("PAY-08/reloadDuringCharge: a charge on the wire across a reload settles once", async () => {
    await reloadOnWire("PAY-08/reloadDuringCharge");
  });

  it("PAY-08/reload-while-reconciling: the saved check timer fires at its saved time after a reload", async () => {
    const run = await played(
      onWire("PAY-08/reload-while-reconciling", Shop.confirm.drop())
        .advance("1 second")
        .reload()
        .checkpoint("reloaded")
        .advance("1999 millis")
        .checkpoint("not yet")
        .advance("1 millis")
        .checkpoint("fired"),
    );

    const { reloaded, fired } = run.checkpoints;

    expect(state(reloaded)).toBe("UNSURE");
    expect(row(reloaded)?.uncertain).toBe(true);
    expect(run.checkpoints["not yet"].read(Shop.intent)).toHaveLength(0);
    expect(fired.read(Shop.intent)).toHaveLength(1);
  });
});

describe("PAY-09 (WriteAhead R10, Restore R1)", () => {
  it("PAY-09/ack-not-stored: a click whose acknowledgement never landed is gone with its tab", async () => {
    const run = await played(
      shopStory("PAY-09/ack-not-stored")
        .ensure(checkout)
        .send(checkout, START)
        .world(Fake.storage.hold())
        .send(checkout, VISA)
        .reload()
        .checkpoint("reloaded"),
    );

    const { reloaded } = run.checkpoints;

    expect(reloaded.read(Shop.confirm)).toHaveLength(0);
    expect(state(reloaded)).toBe("CARD");
    expect(memory(reloaded)?.["notice"]).toBe("");
    expect(charges(reloaded)).toBe(0);
    expect(row(reloaded)).toBeUndefined();
  });

  it("PAY-09/ack-stored-confirmation-lost: an acknowledgement that landed unheard is restored unknown, never sent", async () => {
    const run = await played(
      shopStory("PAY-09/ack-stored-confirmation-lost")
        .ensure(checkout)
        .send(checkout, START)
        .world(Fake.storage.hold())
        .send(checkout, VISA)
        .reload({ heldWrites: "land" })
        .checkpoint("reloaded"),
    );

    const { reloaded } = run.checkpoints;

    expect(reloaded.read(Shop.confirm)).toHaveLength(0);
    expect(state(reloaded)).toBe("UNSURE");
    expect(lastReason(run.evidence, "pay")).toBe("Restored");
    expect(row(reloaded)?.uncertain).toBe(true);
  });
});
