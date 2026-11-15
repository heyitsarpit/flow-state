import { describe, expect, it } from "vite-plus/test";
import { cellsCheckout } from "../../fixtures/cells/machine.ts";
import { cellsStory } from "../../fixtures/cells/stories.ts";
import { checkout } from "../../fixtures/pay/machine.ts";
import { Shop } from "../../fixtures/pay/server.ts";
import { shopStory } from "../../fixtures/pay/stories.ts";
import { Fake, type WorldWord } from "../../src/host/testing/index.ts";
import {
  endings,
  issues,
  lastReason,
  laneFacts,
  memory,
  row,
  START,
  state,
  VISA,
} from "../checkout.ts";
import { played } from "../rules/played.ts";

const cellsOnWire = (id: string, ...words: ReadonlyArray<WorldWord>) =>
  cellsStory(id)
    .ensure(cellsCheckout)
    .send(cellsCheckout, START)
    .world(...words)
    .send(cellsCheckout, VISA);

describe("PAY-10 (WriteAhead R13, WriteLanes R3)", () => {
  it("PAY-10/refuse: a refused acknowledgement sends nothing and reports StorageFailure", async () => {
    const run = await played(
      shopStory("PAY-10/refuse")
        .ensure(checkout)
        .send(checkout, START)
        .world(Fake.storage.refuse())
        .send(checkout, VISA)
        .checkpoint("refused"),
    );

    const { refused } = run.checkpoints;

    expect(refused.read(Shop.confirm)).toHaveLength(0);
    expect(state(refused)).toBe("CARD");
    expect(laneFacts(run.evidence, "StorageFailure")).toBe(1);
  });

  it("PAY-10/hang: an acknowledgement never answered sends nothing and is silent at 10 seconds", async () => {
    const run = await played(
      shopStory("PAY-10/hang")
        .ensure(checkout)
        .send(checkout, START)
        .world(Fake.storage.hold())
        .send(checkout, VISA)
        .advance("9999 millis")
        .checkpoint("waiting")
        .advance("1 millis")
        .checkpoint("silent"),
    );

    const { waiting, silent } = run.checkpoints;

    expect(state(waiting)).toBe("PAYING");
    expect(silent.read(Shop.confirm)).toHaveLength(0);
    expect(state(silent)).toBe("PAYING");
    expect(row(silent)?.pending).toBe(true);
    expect(laneFacts(run.evidence, "StorageFailure")).toBe(0);
    expect(laneFacts(run.evidence, "StorageSilent")).toBe(1);
    expect(memory(silent)?.["notice"]).toBe("Still confirming with your bank…");
  });
});

describe("PAY-12 (WriteLanes R2, R14, R10)", () => {
  it("PAY-12/defect: a call that dies ends unknown Defect with one issue", async () => {
    const run = await played(
      cellsOnWire("PAY-12/defect", Shop.crash({ endpoint: "confirm" })).checkpoint("died"),
    );

    expect(state(run.checkpoints.died, cellsCheckout)).toBe("UNSURE");
    expect(lastReason(run.evidence, "pay")).toBe("Defect");
    expect(issues(run.evidence)).toEqual(["Defect"]);
  });

  it("PAY-12/sync: a call answered within its own send ends once", async () => {
    const run = await played(
      cellsOnWire("PAY-12/sync", Shop.placeOrder.hold()).checkpoint("placing"),
    );

    expect(state(run.checkpoints.placing, cellsCheckout)).toBe("PLACING");
    expect(endings(run.evidence, "pay")).toHaveLength(1);
  });

  it("PAY-12/cancel-on-wire: a cancel of a charge on the wire ends it unknown Cancelled and holds the lane", async () => {
    const run = await played(
      cellsOnWire("PAY-12/cancel-on-wire", Shop.confirm.hold())
        .send(cellsCheckout, { _tag: "AbortPay" })
        .checkpoint("aborted"),
    );

    const { aborted } = run.checkpoints;

    expect(state(aborted, cellsCheckout)).toBe("UNSURE");
    expect(lastReason(run.evidence, "pay")).toBe("Cancelled");
    expect(row(aborted, cellsCheckout)?.uncertain).toBe(true);
  });
});
