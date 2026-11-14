import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { GRACE_MS } from "../dsl/expect.ts";
import { productionCases } from "../runner/gates.ts";
import { actorIn, idled, returned, used } from "../turn/anchor.ts";
import { anchorAt } from "../turn/selection.ts";
import { parts } from "../../fixtures/index.ts";
import { modelFields, modelMutants } from "./model-mutation.ts";
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
