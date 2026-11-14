import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { coverageOf, ownsRows } from "./coverage.ts";

describe("a Task cannot close while an owed row names it (consult A3)", () => {
  it("a Task in progress, draft or ready owns rows; one done or in review does not", () => {
    for (const status of ["draft", "ready", "in_progress", "blocked"])
      assert.ok(ownsRows(status), status);

    for (const status of ["done", "review"]) assert.ok(!ownsRows(status), status);
  });
});

describe("a retired rule is out of coverage's counts (the retired cancelAll)", () => {
  it("a Spec's retired Invariant is not judged, and its retired form is not unknown", () => {
    const mutant = {
      name: "m",
      says: "s",
      expects: "Retired WriteLanes I21" as const,
      runtime: "prototype" as const,
      cases: ["LANE-03"],
      edits: [],
    };

    const result = coverageOf({
      invariants: ["WriteLanes I21"],
      guarantees: [],
      notYet: [],
      remainders: [],
      checks: { rows: [], mutants: [mutant], cases: [] },
      open: new Set(),
    });

    assert.deepEqual(result.standings, []);
    assert.deepEqual(result.gaps, []);
  });
});
