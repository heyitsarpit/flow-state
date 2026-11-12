import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { cellMutants, tableCells } from "./model-mutation.ts";

describe("model mutation (Q16: Conformance R19, I61, T39)", () => {
  it("mutates every cell of the model's tables once", () => {
    const cells = tableCells();

    assert.ok(cells.length > 0);
    assert.deepEqual(
      cellMutants().map((m) => m.cell),
      cells,
    );
  });

  it("the pilots notice some cells, each by a refusal naming an Invariant", () => {
    const noticed = cellMutants().filter((m) => m.noticed);

    assert.ok(noticed.length > 0);
    assert.ok(noticed.every((m) => /^[A-Za-z]+ I\d+$/.test(m.invariant)));
  });
});
