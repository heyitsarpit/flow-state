import assert from "node:assert/strict";
import { Option } from "effect";
import { describe, it } from "vite-plus/test";
import { rules } from "../dsl/lifecycle-rules.ts";
import type { Script } from "../dsl/script.ts";
import { cellName, cellsOf, pairsIn, recording, successorPairs, undistinguished } from "./cells.ts";
import { fieldGate, killedBy, modelFields, modelMutants, pilots } from "./model-mutation.ts";
import { playPart } from "./play.ts";

const mutants = modelMutants();

const reachOfPart = (scripts: ReadonlyArray<Script>) => {
  const reads = scripts.map((script) => {
    const log: Array<string> = [];
    playPart(script, "production", recording(rules, log));

    return log;
  });

  return new Set([
    ...reads.flatMap((log) => log.map((c) => `cell ${c}`)),
    ...reads.flatMap((log) => [...pairsIn(log, successorPairs())].map((p) => `pair ${p}`)),
    ...modelMutants(scripts)
      .filter((m) => m.noticed)
      .map((m) => `kill ${m.field}`),
  ]);
};

describe("model mutation (Q16: Conformance R19, I61, T39)", () => {
  it("the model's fields are walked from the rules: every cell, every deadline, the promotion rule", () => {
    const fields = modelFields();
    const cells = cellsOf().map((c) => `${c.table}.${c.row}.${c.column}.${c.guard}`);

    assert.ok(cells.every((c) => fields.includes(c)));
    assert.ok(fields.includes("deadlines.AwaitRestore.forget"));
    assert.ok(fields.includes("deadlines.Commit"));
    assert.ok(fields.includes("promotion"));
    assert.equal(fields.length, cells.length + 11 + 1);
  });

  it("the field gate passes: a mutation reaches every model field", () => {
    assert.deepEqual(fieldGate(mutants), []);
  });

  it("the field gate fails a field no mutation reaches", () => {
    const left = mutants.filter((m) => m.field !== "deadlines.PendingCancel");

    assert.deepEqual(fieldGate(left), [
      "BAD  model field deadlines.PendingCancel: no mutation reaches it",
    ]);
  });

  it("the pilots notice some fields, each by the oracle that refused", () => {
    const noticed = mutants.filter((m) => m.noticed);
    const oracles = new Set(noticed.flatMap((m) => m.oracle.split(",")));

    assert.ok(noticed.length > 0);
    assert.ok(noticed.every((m) => m.oracle !== "none"));
    assert.ok(
      [...oracles].every((o) => /^[a-z-]+$/u.test(o)),
      [...oracles].join(" "),
    );
  });

  it("a throw, a case's own expectation or a timeout is never a kill; an oracle's refusal is, by name", () => {
    const why = "seed 1: lane-queue: WriteLanes I15: t1 (Gone) got Send";

    assert.ok(Option.isNone(killedBy({ _tag: "Fail", id: "x", oracles: [], why })));
    assert.ok(Option.isNone(killedBy({ _tag: "Timeout", id: "x", seed: 1, seconds: 5 })));
    assert.deepEqual(
      killedBy({ _tag: "Fail", id: "x", oracles: ["lane-queue"], why: "no Invariant here" }),
      Option.some("lane-queue"),
    );
  });

  it("a cell no pilot reads is listed unnoticed, naming no oracle", () => {
    const [first] = pilots();
    assert.ok(first !== undefined);

    const queued = modelMutants([first]).find((m) => m.field === "tableA.Send.Queued.always");

    assert.deepEqual(queued, {
      field: "tableA.Send.Queued.always",
      oracle: "none",
      noticed: false,
    });
    assert.ok(cellsOf().some((c) => cellName(c) === "A Send·Queued·always"));
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
