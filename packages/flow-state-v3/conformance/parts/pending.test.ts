import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { coreTriage, triageFaults } from "../core-mutants-triage.ts";
import { GRACE_MS } from "../dsl/expect.ts";
import { verdictOfLimit } from "../limits.ts";
import { productionCases } from "../runner/gates.ts";
import { scenarios } from "../suite.ts";
import { actorIn, idled, returned, used } from "../turn/anchor.ts";
import { anchorAt } from "../turn/selection.ts";
import { parts } from "../../fixtures/index.ts";
import { modelFields, modelMutants } from "./model-mutation.ts";
import { combinationGate } from "./pairs.ts";
import { partFaults } from "./play.ts";
import { partFixture } from "./reference.ts";

/**
 * Each check below asserts a gap the suite still has, owned by the Task named in its title. It
 * fails once that Task closes the gap: then the check becomes a requirement of the gate it names,
 * and this pending one is deleted.
 */
describe("pending checks, owed to other Tasks (routed gaps)", () => {
  it("T52: model fields that no part's expected trace notices remain (Conformance I61, T39)", () => {
    const noticed = modelMutants().filter((m) => m.noticed).length;

    assert.ok(noticed > 0);
    assert.ok(noticed < modelFields().length);
  });

  it("T52: an owed row, triage row or pair owner that matches nothing raises no fault", () => {
    const run = {
      script: { id: "PART-x-usual-1", fixture: "x", actor: "a", steps: [] },
      run: { verdict: { _tag: "Pass" as const, id: "PART-x-usual-1" }, facts: [], skipped: 0 },
    };

    const ghost = { case: "PART-gone-usual-9", check: "c", invariant: "I", why: "w", owner: "o" };
    assert.deepEqual(partFaults([run], [ghost]), []);
    assert.deepEqual(triageFaults([], coreTriage), []);

    const reached = combinationGate({
      declared: ["rj", "ky"],
      runs: [{ id: "r", mix: false, byComposite: { C: new Set(["rj", "ky"]) }, cells: [] }],
      owners: {
        "rj+ky": { task: "@task.V3.T19", slice: 2, by: "a sweep", date: "2026-11-12" },
      },
      tasks: { "@task.V3.T19": { open: true, slice: 2 } },
      sliceOf: { rj: 0, ky: 0 },
      current: 0,
    });

    assert.deepEqual(reached.failures, []);
  });

  it("T52: a triaged mutant that now errors or times out, and an empty sample, pass the triage", () => {
    const [row] = coreTriage;
    assert.ok(row !== undefined);

    assert.deepEqual(
      triageFaults([{ status: "ERROR", at: row.at, mutated: row.mutated }], coreTriage),
      [],
    );
    assert.deepEqual(
      triageFaults([{ status: "TIME", at: row.at, mutated: row.mutated }], coreTriage),
      [],
    );
    assert.deepEqual(triageFaults([], []), []);
  });

  it("T52: a case row is held by its expectation's label, whatever the case cites (Conformance R9)", () => {
    const owed = scenarios.find((s) => s.id === "TURN-01/schedule-out-of-range");
    assert.ok(owed !== undefined);
    assert.ok(!owed.cites.includes("Turn I14"));

    const row = { case: owed.id, check: "case", invariant: "Turn I14", why: "w" };
    const failed = { _tag: "Fail" as const, id: owed.id, oracles: [], why: "seed 1: Turn I14: x" };

    assert.equal(verdictOfLimit(row, failed).held, true);
  });

  it("T17: production's Compile static cases run in no machine gate, only under vitest", () => {
    assert.ok(productionCases.length > 0);
    assert.ok(!productionCases.some((id) => id.startsWith("CMP-")));
  });

  it("T9: a returning local actor's leaf is unknown, not its initial leaf, and mayHaveEnded stays set", () => {
    const part = parts.find((p) => p.name === "sync");
    assert.ok(part !== undefined);

    const actor = { machine: part.machine.compiled.id, id: "a" };
    const machines = { [actor.machine]: partFixture(part).handlers };
    const free = idled(used(anchorAt(machines, actor, "COOLING", []), actor, 1), 0, GRACE_MS);
    const ended = idled(used(free, actor, -1), GRACE_MS, GRACE_MS);

    assert.equal(actorIn(returned(ended, actor, GRACE_MS), actor).phase._tag, "Unanchored");
    assert.equal(actorIn(used(ended, actor, 1), actor).mayHaveEnded, true);
  });
});
