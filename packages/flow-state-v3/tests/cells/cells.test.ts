import { describe, expect, it } from "vite-plus/test";
import { CellsMachine } from "../../fixtures/cells/machines/cells.ts";
import { cellsCheckout } from "../../fixtures/cells/app.ts";
import { Shop } from "../../fixtures/services/shop/server/shop.ts";
import { long, usual } from "../../fixtures/cells/stories/usual.ts";
import type { Cut } from "../../src/host/testing/index.ts";
import { checked } from "../rules/rules.ts";

const payment = (cut: Cut) => {
  const snapshot = cut.read(cellsCheckout);

  return snapshot === undefined
    ? undefined
    : CellsMachine.definition.O.pay.get(snapshot.operations, { intentId: "pi2" });
};

describe("the usual and long Cells Stories", () => {
  it("an abort with nothing sent does nothing, and an abort while unsure releases the hold (WriteLanes R14, R8)", async () => {
    const run = checked(await usual.run());
    const { paid, unsure, aborted, end } = run.checkpoints;
    const released = run.evidence.filter((e) => e._tag === "Lane" && e.kind === "Released");

    expect(paid.read(cellsCheckout)?.state).toBe("PAID");
    expect(unsure.read(cellsCheckout)?.state).toBe("UNSURE");
    expect(payment(unsure)).toEqual(
      expect.objectContaining({ value: expect.objectContaining({ uncertain: true }) }),
    );
    expect(payment(aborted)).toEqual(expect.objectContaining({ _tag: "None" }));
    expect(released).toHaveLength(1);
    expect(end.read(cellsCheckout)?.state).toBe("LEFT");
    expect(end.read(Shop).orders).toEqual({ c1: "o1" });
  });

  it("runs about a hundred steps over fourteen carts; the paid ones and those aborted on the wire, whose charge landed and is read back, are placed (WriteLanes R14, I6)", async () => {
    const run = checked(await long.run());

    expect(long.steps.length).toBeGreaterThanOrEqual(90);
    expect(long.steps.length <= 120).toBe(true);
    expect(Object.keys(run.end.read(Shop).orders)).toHaveLength(10);
    expect(run.end.read(Shop.placeOrder)).toHaveLength(10);
  });
});
