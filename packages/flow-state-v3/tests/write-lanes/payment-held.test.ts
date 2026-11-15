import { describe, expect, it } from "vite-plus/test";
import { cellsCheckout } from "../../fixtures/cells/machine.ts";
import { cellsStory } from "../../fixtures/cells/stories.ts";
import { checkout } from "../../fixtures/pay/machine.ts";
import { Shop } from "../../fixtures/pay/server.ts";
import { Fake } from "../../src/host/testing/index.ts";
import {
  charges,
  CHECK,
  endings,
  keys,
  lastReason,
  laneFacts,
  onWire,
  row,
  START,
  state,
  VISA,
} from "../checkout.ts";
import { played } from "../rules/played.ts";
import { reloadOnWire } from "./reload-on-wire.ts";

describe("PAY-14 (Restore R3, WriteLanes R10)", () => {
  it("PAY-14: a charge on the wire across a reload is restored Held, then its late answer and the re-read settle it", async () => {
    await reloadOnWire("PAY-14");
  });
});

describe("PAY-15 (WriteLanes R2, R5, R7, R8; Restore R3)", () => {
  it("PAY-15/press-pay-while-held: a press while the head is Held is declined Rejected and sends nothing", async () => {
    const run = await played(
      onWire("PAY-15/press-pay-while-held", Shop.confirm.drop())
        .send(checkout, VISA)
        .checkpoint("pressed"),
    );

    const { pressed } = run.checkpoints;

    expect(state(pressed)).toBe("PAYING");
    expect(lastReason(run.evidence, "pay")).toBe("Rejected");
    expect(row(pressed)?.uncertain).toBe(true);
    expect(pressed.read(Shop.confirm)).toHaveLength(1);
  });

  it("PAY-15/busy-then-new-write: after a definite failure the next write has a new id", async () => {
    const run = await played(
      onWire("PAY-15/busy-then-new-write", Shop.busy({ retryAfterMs: 500 }))
        .checkpoint("waiting")
        .world(Fake.storage.hold())
        .advance("500 millis")
        .checkpoint("paying")
        .world(Fake.storage.release())
        .checkpoint("sent"),
    );

    const { waiting, paying, sent } = run.checkpoints;

    expect(state(waiting)).toBe("WAITING");
    expect(row(waiting)).toBeUndefined();
    expect(state(paying)).toBe("PAYING");
    expect(keys(sent)).toBe(2);
  });

  it("PAY-15/reload-holds-exactly-once: a Held head is restored once", async () => {
    const run = await played(
      onWire("PAY-15/reload-holds-exactly-once", Shop.confirm.drop())
        .reload()
        .checkpoint("reloaded"),
    );

    const { reloaded } = run.checkpoints;

    expect(state(reloaded)).toBe("UNSURE");
    expect(row(reloaded)?.uncertain).toBe(true);
    expect(endings(run.evidence, "pay").filter((e) => e.reason === "Restored")).toHaveLength(1);
  });

  it("PAY-15/dead-activation-timer: PAYING's slow timer dies with its activation, so UNSURE reads twice by 8.5 seconds", async () => {
    const run = await played(
      onWire("PAY-15/dead-activation-timer", Shop.confirm.drop())
        .checkpoint("unsure")
        .world(Shop.intent.hold(), Shop.intent.hold())
        .advance("8500 millis")
        .checkpoint("later"),
    );

    expect(state(run.checkpoints.unsure)).toBe("UNSURE");
    expect(run.checkpoints.later.read(Shop.intent)).toHaveLength(2);
  });

  it("PAY-15/retry-budget: three re-sends, each lost, then the budget is spent: four sends with one id", async () => {
    const lost = [Shop.confirm.drop(), Fake.storage.release()] as const;

    const run = await played(
      onWire("PAY-15/retry-budget", Shop.confirm.drop())
        .world(Fake.storage.hold())
        .advance(CHECK)
        .checkpoint("paying 1")
        .world(...lost)
        .checkpoint("unsure 1")
        .world(Fake.storage.hold())
        .advance(CHECK)
        .checkpoint("paying 2")
        .world(...lost)
        .checkpoint("unsure 2")
        .world(Fake.storage.hold())
        .advance(CHECK)
        .checkpoint("paying 3")
        .world(...lost)
        .checkpoint("unsure 3")
        .advance(CHECK)
        .checkpoint("spent"),
    );

    const rounds = [
      ["paying 1", "unsure 1"],
      ["paying 2", "unsure 2"],
      ["paying 3", "unsure 3"],
    ] as const;

    for (const [n, [paying, unsure]] of rounds.entries()) {
      expect(state(run.checkpoints[paying])).toBe("PAYING");
      expect(state(run.checkpoints[unsure])).toBe("UNSURE");
      expect(row(run.checkpoints[unsure])?.retryCount).toBe(n + 1);
    }

    expect(state(run.checkpoints.spent)).toBe("UNSURE");
    expect([run.checkpoints.spent.read(Shop.confirm).length, keys(run.checkpoints.spent)]).toEqual([
      4, 1,
    ]);
  });
});

describe("PAY-15 on Cells (WriteLanes R14)", () => {
  it("PAY-15/cancel-idle: a cancel with nothing sent records nothing", async () => {
    const run = await played(
      cellsStory("PAY-15/cancel-idle")
        .ensure(cellsCheckout)
        .send(cellsCheckout, START)
        .send(cellsCheckout, { _tag: "AbortPay" })
        .checkpoint("aborted"),
    );

    expect(state(run.checkpoints.aborted, cellsCheckout)).toBe("CARD");
    expect(laneFacts(run.evidence, "Released")).toBe(0);
    expect(laneFacts(run.evidence, "NothingToResend")).toBe(0);
  });

  it("PAY-15/cancel-on-wire: a cancel of a charge on the wire leaves the shopper unsure", async () => {
    const run = await played(
      cellsStory("PAY-15/cancel-on-wire")
        .ensure(cellsCheckout)
        .send(cellsCheckout, START)
        .world(Shop.confirm.hold())
        .send(cellsCheckout, VISA)
        .send(cellsCheckout, { _tag: "AbortPay" })
        .checkpoint("aborted"),
    );

    expect(state(run.checkpoints.aborted, cellsCheckout)).toBe("UNSURE");
    expect(charges(run.checkpoints.aborted)).toBe(0);
  });
});
