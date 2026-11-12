import assert from "node:assert/strict";
import { Option } from "effect";
import { describe, it } from "vite-plus/test";
import { rules } from "../dsl/lifecycle-rules.ts";
import type { Script } from "../dsl/script.ts";
import { pairsIn, recording, successorPairs, undistinguished } from "./cells.ts";
import { cellMutants, killedBy, pilots, tableCells } from "./model-mutation.ts";
import { playPart } from "./play.ts";

const reachOfPart = (scripts: ReadonlyArray<Script>) => {
  const reads = scripts.map((script) => {
    const log: Array<string> = [];
    playPart(script, "production", recording(rules, log));

    return log;
  });

  return new Set([
    ...reads.flatMap((log) => log.map((c) => `cell ${c}`)),
    ...reads.flatMap((log) => [...pairsIn(log, successorPairs())].map((p) => `pair ${p}`)),
    ...cellMutants(scripts)
      .filter((m) => m.noticed)
      .map((m) => `kill ${m.cell}`),
  ]);
};

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

  it("a throw, a case's own expectation or a timeout is never a kill; an oracle's refusal is", () => {
    const why = "seed 1: lane-queue: WriteLanes I15: t1 (Gone) got Send";

    assert.ok(Option.isNone(killedBy({ _tag: "Fail", id: "x", oracles: [], why })));
    assert.ok(Option.isNone(killedBy({ _tag: "Timeout", id: "x", seed: 1, seconds: 5 })));
    assert.deepEqual(
      killedBy({ _tag: "Fail", id: "x", oracles: ["lane-queue"], why }),
      Option.some("WriteLanes I15"),
    );
  });

  it("a cell no pilot reads is listed unnoticed, naming no Invariant", () => {
    const [first] = pilots();
    assert.ok(first !== undefined);

    const queued = cellMutants([first]).find((m) => m.cell === "A Send·Queued·always");

    assert.deepEqual(queued, { cell: "A Send·Queued·always", invariant: "none", noticed: false });
  });

  it("each pilot part reaches a cell, a cell pair or a noticed mutant no other part does (False pass)", () => {
    const solo = pilots().filter((s) => !s.id.startsWith("MIX-"));
    const names = [...new Set(solo.map((s) => s.fixture))];

    const byPart = Object.fromEntries(
      names.map((name) => [name, reachOfPart(solo.filter((s) => s.fixture === name))]),
    );

    assert.equal(names.length, 3);
    assert.deepEqual(undistinguished(byPart), []);
    assert.deepEqual(undistinguished({ ...byPart, renamed: byPart["transfers"]! }), [
      "transfers",
      "renamed",
    ]);
  });
});
