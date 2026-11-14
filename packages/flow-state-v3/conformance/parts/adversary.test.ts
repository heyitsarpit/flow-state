import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { rules } from "../dsl/lifecycle-rules.ts";
import { forgeries, FORGED_ROWS, refusalCells } from "./adversary.ts";
import { cellName } from "./cells.ts";
import { pilots } from "./model-mutation.ts";

const found = forgeries(pilots());

describe("an adversarial actor forges the reports a refusal cell refuses (Conformance I61, T39)", () => {
  it("each refusal cell is one a forged report reaches, or a move no report makes", () => {
    const cells = refusalCells(rules);

    assert.equal(cells.length, 118);
    assert.equal(cells.filter((c) => FORGED_ROWS.has(`${c.table}.${c.row}`)).length, 99);
  });

  it("the Spec model refuses each forgery at its step, by the cell's Invariant, reading the cell", () => {
    const reached = [...found.values()];

    assert.ok(reached.length > 0);

    for (const f of reached) {
      assert.equal(f.design._tag, "Fail", f.cell);
      assert.ok(f.invariant.length > 0, f.cell);
      assert.ok(f.reads.includes(f.cell), f.cell);
    }
  });

  it("forgeries reach at least the measured report-made refusal cells; one that never forges, none", () => {
    const reportMade = refusalCells(rules).filter((c) => FORGED_ROWS.has(`${c.table}.${c.row}`));
    const reached = reportMade.filter((c) => found.has(cellName(c)));

    assert.ok(reached.length >= 28, `${reached.length}/${reportMade.length}`);

    const unforged = forgeries(pilots(), () => []);

    assert.ok([...unforged.keys()].every((cell) => / StepEnds·| Reload·/u.test(cell)));
  }, 60_000);

  it("a dropped report reaches step-end cells no report makes (combined review N1)", () => {
    assert.ok(found.has("C StepEnds·Owed·live"), [...found.keys()].join(" "));
  });
});
