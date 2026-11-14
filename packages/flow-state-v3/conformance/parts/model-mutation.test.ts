import assert from "node:assert/strict";
import { Option } from "effect";
import { describe, it } from "vite-plus/test";
import type { TaskRef } from "../coverage.ts";
import { rules } from "../dsl/lifecycle-rules.ts";
import type { Script } from "../dsl/script.ts";
import { cellName, cellsOf, pairsIn, recording, successorPairs, undistinguished } from "./cells.ts";
import { forgeries } from "./adversary.ts";
import { modelOwed } from "./model-owes.ts";

const OWNERS = new Set<TaskRef>([
  "@task.V3.T18",
  "@task.V3.T19",
  "@task.V3.T20",
  "@task.V3.T54",
  "@task.V3.T55",
  "@task.V3.T53",
  "@task.V3.T61",
]);

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

  it("the field gate passes: every field is noticed or owed to an open Task", () => {
    assert.deepEqual(fieldGate(mutants, rules, modelOwed, OWNERS), []);
    assert.ok(modelOwed.every((o) => OWNERS.has(o.task)));
  });

  it("a refusal cell no report makes is the suite's to reach, a retired cancelAll cell round-14's", () => {
    const ownedBy = (task: TaskRef) =>
      modelOwed.filter((o) => o.task === task).map((o) => o.subject);

    const retired = ownedBy("@task.V3.T53");
    const unforgeable = ownedBy("@task.V3.T61");

    assert.equal(retired.length, 9);
    assert.ok(retired.every((s) => s.includes(".CancelAll.") || s.includes(".cancelAll")));
    assert.equal(unforgeable.length, 18);
    assert.ok(unforgeable.includes("tableA.Send.Queued.always"));
    assert.ok(unforgeable.includes("tableC.Reload.Delivering.always"));
    assert.ok(!unforgeable.includes("tableB.Idle.CancelAll.always"));
  });

  it("the field gate fails a field no mutation reaches", () => {
    const left = mutants.filter((m) => m.field !== "deadlines.PendingCancel");

    assert.deepEqual(fieldGate(left, rules, modelOwed, OWNERS), [
      "BAD  model field deadlines.PendingCancel: no mutation reaches it",
    ]);
  });

  it("the field gate fails a field no part's trace notices (Conformance I61, T39)", () => {
    const all = modelFields().map((field) => ({ field, oracle: "lane-queue", noticed: true }));
    const [first, ...rest] = all;
    assert.ok(first !== undefined);

    assert.deepEqual(fieldGate([{ ...first, oracle: "none", noticed: false }, ...rest]), [
      `BAD  model field ${first.field}: no part's expected trace changes under its mutation`,
    ]);
  });

  it("the field gate fails an owed row on a noticed field, on no field, or of a Task not open", () => {
    const all = modelFields().map((field) => ({ field, oracle: "lane-queue", noticed: true }));
    const [first, second, ...rest] = all;
    assert.ok(first !== undefined && second !== undefined);

    const open = new Set<TaskRef>(["@task.V3.T18"]);

    const row = (subject: string, task: TaskRef = "@task.V3.T18") => ({
      subject,
      clause: Option.none<string>(),
      task,
      why: "w",
    });

    const unnoticed = [{ ...first, oracle: "none", noticed: false }, second, ...rest];

    assert.deepEqual(fieldGate(unnoticed, rules, [row(first.field)], open), []);
    assert.equal(
      fieldGate(unnoticed, rules, [row(first.field), row(second.field)], open).length,
      1,
    );
    assert.equal(fieldGate(unnoticed, rules, [row(first.field), row("tableZ.x")], open).length, 1);
    assert.equal(fieldGate(unnoticed, rules, [row(first.field, "@task.V3.T47")], open).length, 1);
  });

  it("the field gate over no part script fails every field", () => {
    assert.equal(fieldGate(modelMutants([])).length, modelFields().length);
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

  it("a refusal cell a forged report reaches is noticed by its mutant, by the refusing oracle", () => {
    const forged = forgeries(pilots());

    const fieldOf = new Map(
      cellsOf().map((c) => [cellName(c), `${c.table}.${c.row}.${c.column}.${c.guard}`]),
    );

    assert.ok(forged.size >= 28);

    for (const cell of forged.keys()) {
      const mutant = mutants.find((m) => m.field === fieldOf.get(cell));
      assert.ok(mutant?.noticed === true && mutant.oracle !== "none", cell);
    }
  }, 120_000);

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

    assert.equal(names.length, 5);
    assert.deepEqual(undistinguished(byPart), []);
    assert.deepEqual(undistinguished({ ...byPart, renamed: byPart["transfers"]! }), [
      "transfers",
      "renamed",
    ]);
  }, 240_000);
});
