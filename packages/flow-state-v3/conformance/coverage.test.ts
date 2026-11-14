import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Option } from "effect";
import { coverageOf, type Owes, ownsRows } from "./coverage.ts";
import { oracle } from "./dsl/oracle.ts";

describe("a Task cannot close while an owed row names it (consult A3)", () => {
  it("a Task in progress, draft or ready owns rows; one done or in review does not", () => {
    for (const status of ["draft", "ready", "in_progress", "blocked"])
      assert.ok(ownsRows(status), status);

    for (const status of ["done", "review"]) assert.ok(!ownsRows(status), status);
  });
});

describe("one owed list judged by the coverage gate (consult A3)", () => {
  const checking = oracle<number>({
    name: "lane-queue",
    guarantee: ["WriteLanes I1"],
    start: () => 0,
    step: (n) => [n, []],
  });

  const mutant = {
    name: "m",
    says: "s",
    expects: "WriteLanes I1" as const,
    runtime: "prototype" as const,
    cases: ["LANE-01"],
    edits: [],
  };

  const judged = (owes: ReadonlyArray<Owes>) =>
    coverageOf({
      invariants: ["WriteLanes I1", "WriteLanes I2"],
      guarantees: [{ oracle: checking, mutants: [mutant] }],
      owes,
      checks: { rows: [], mutants: [], cases: [] },
      open: new Set(["@task.V3.T18"]),
    }).gaps.map((g) => g._tag);

  const row = (subject: string, clause: Option.Option<string>) => ({
    subject,
    clause,
    task: "@task.V3.T18" as const,
    why: "w",
  });

  it("a whole row on a checked Invariant is stale, and a clause row on an unchecked one fails", () => {
    assert.deepEqual(judged([row("WriteLanes I2", Option.none())]), []);
    assert.deepEqual(
      judged([row("WriteLanes I1", Option.none()), row("WriteLanes I2", Option.none())]),
      ["Stale"],
    );
    assert.ok(judged([row("WriteLanes I2", Option.some("a part"))]).includes("Unchecked"));
    assert.deepEqual(
      judged([row("WriteLanes I1", Option.some("a part")), row("WriteLanes I2", Option.none())]),
      [],
    );
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
      owes: [],
      checks: { rows: [], mutants: [mutant], cases: [] },
      open: new Set(),
    });

    assert.deepEqual(result.standings, []);
    assert.deepEqual(result.gaps, []);
  });
});
