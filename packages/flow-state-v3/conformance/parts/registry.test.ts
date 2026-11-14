import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { scenarioOf } from "../dsl/script.ts";
import { fixtureNamed, registry } from "../fixtures/registry.ts";
import { scenarios } from "../suite.ts";

describe("one fixture registry (Conformance R15)", () => {
  it("every fixture a case boots resolves by its name from the registry", () => {
    const booted = [...new Set(scenarios.flatMap((s) => s.fixtures.map((f) => f.name)))];

    assert.ok(booted.length > 5);
    assert.deepEqual(
      booted.filter((name) => !registry.has(name)),
      [],
    );
  });

  it("an unknown fixture name fails, in the registry and in a script", () => {
    assert.throws(() => fixtureNamed("nope"));
    assert.throws(() =>
      scenarioOf({ id: "x", fixture: "nope", actor: "a", steps: [] }, [...registry.values()]),
    );
  });
});
