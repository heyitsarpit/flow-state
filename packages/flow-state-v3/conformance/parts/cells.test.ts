import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { parts } from "../../fixtures/index.ts";
import { implemented as production } from "../adapters/production.ts";
import { Outcome, rules } from "../dsl/lifecycle-rules.ts";
import { cellsOf, pairsIn, recording, replaced, successorPairs } from "./cells.ts";
import { scriptOf } from "./generate.ts";
import { combinationGate, lostCellPairs } from "./pairs.ts";
import { playPart } from "./play.ts";

const send = { table: "tableA", row: "Send", column: "Unsent", guard: "open" } as const;

describe("cell-pair reach (Q14: Conformance R18, I58; catalogue 5A)", () => {
  it("the denominator follows the tables: a cell's successors sit where its value leaves the subject", () => {
    const pairs = successorPairs();

    assert.equal(cellsOf().length, 316);
    assert.ok(pairs.has("A Send·Unsent·open > A EndDefinite·OnWire·running"));
    assert.ok(!pairs.has("A Send·Unsent·open > A Send·Unsent·open"));
    assert.ok(pairs.has("A Send·Unsent·open > B OnWire·reject·always"));
    assert.ok(!pairs.has("A Send·Unsent·open > C Heard·Delivering·always"));

    const stayed = successorPairs(replaced(rules, send, Outcome.Stay()));

    assert.ok(stayed.has("A Send·Unsent·open > A Send·Unsent·open"));
    assert.ok(!stayed.has("A Send·Unsent·open > A EndDefinite·OnWire·running"));
    assert.ok(pairs.size < cellsOf().length ** 2 / 4);
  });

  it("a pilot run's model reads cells in order, and the pairs it reaches are successor pairs", () => {
    const log: Array<string> = [];

    const played = playPart(
      scriptOf(parts[1]!, "usual", 1, production),
      "production",
      recording(rules, log),
    );

    assert.equal(played.verdict._tag, "Pass");
    assert.ok(log.includes("A Send·Unsent·open"), log.join(", "));

    const reached = pairsIn(log, successorPairs());

    assert.ok(reached.size > 0);
    assert.ok([...reached].every((p) => successorPairs().has(p)));
    assert.deepEqual(
      [...pairsIn(["A Send·Unsent·open", "A Send·Unsent·open"], successorPairs())],
      [],
    );
  });

  it("the combination gate reports cell pairs per composite and lists the reached ones (I58)", () => {
    const cells = ["A Send·Unsent·open", "A EndDefinite·OnWire·running"];

    const run = (id: string, mix: boolean) => ({
      id,
      mix,
      byComposite: { C: new Set(["rj"]) },
      cells,
    });

    const verdict = combinationGate({
      declared: ["rj"],
      runs: [run("r1", false), run("r2", true)],
      owners: {},
      tasks: {},
      sliceOf: { rj: 0 },
      current: 0,
    });

    assert.deepEqual(verdict.failures, []);
    assert.deepEqual(verdict.cellPairs.byComposite, { C: 1, "app mix": 1 });
    assert.equal(verdict.cellPairs.reached, 1);
    assert.equal(verdict.cellPairs.total, successorPairs().size);
    assert.equal(verdict.cellPairs.keys.length, 1);
  });

  it("a recorded cell pair no run reaches fails the gate; a new one is only noted (R18, I58; T61)", () => {
    const reached = ["a > b", "b > c"];

    assert.deepEqual(lostCellPairs(["a > b", "x > y"], reached), [
      "BAD  cell pair x > y: recorded as reached, reached by no run now",
    ]);
    assert.deepEqual(lostCellPairs(["a > b"], reached), []);
  });
});
