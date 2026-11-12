import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Effect } from "effect";
import { parts } from "../../fixtures/index.ts";
import { nullSurface } from "../adapters/null-static.ts";
import { constructionCases } from "../compile/construction.cases.ts";
import { playStatic } from "../dsl/static-case.ts";
import { runtimeSurface } from "../runner/args.ts";

const production = Effect.runSync(runtimeSurface("production"));

describe("production's static surface (Q22: phase-out step 3, Conformance Q17)", () => {
  it("is production's own, not the null surface", () => {
    assert.notEqual(production, nullSurface);
  });

  it("passes every Compile construction case", () => {
    for (const c of constructionCases) assert.doesNotThrow(() => playStatic(production, c), c.id);
  });

  it("names every alternative of each part's and Pay's Compiled", () => {
    assert.ok(parts.length > 0);

    for (const name of ["pay", ...parts.map((p) => p.name)])
      assert.ok(production.places(name).length > 0, name);
  });
});
