import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Effect, Option } from "effect";
import { parts } from "../../fixtures/index.ts";
import { nullSurface } from "../adapters/null-static.ts";
import { staticOwed } from "../adapters/production-static.ts";
import { constructionCases } from "../compile/construction.cases.ts";
import { playStatic } from "../dsl/static-case.ts";
import { runtimeSurface } from "../runner/args.ts";
import { Built, MemoryField, type Source } from "../surface.ts";

const production = Effect.runSync(runtimeSurface("production"));

const plain: Source = {
  id: "Static/Plain",
  states: ["Idle", "Busy"],
  initial: "Idle",
  events: ["Go"],
  internalEvents: [],
  uncertain: [],
  memory: { count: MemoryField.Initial({ value: 0, schemaDefault: Option.none() }) },
  operations: [],
  on: { Go: { guard: Option.none(), target: Option.some("Busy") } },
  onMachine: () => undefined,
};

const passes = (id: string) => {
  const found = constructionCases.find((c) => c.id === id);
  assert.ok(found !== undefined, id);

  try {
    playStatic(production, found);

    return true;
  } catch {
    return false;
  }
};

describe("production's static surface (Q22: phase-out step 3, Conformance Q17)", () => {
  it("is production's own, not the null surface: it builds what production declares, and refuses the rest", () => {
    assert.notEqual(production, nullSurface);

    const built = production.construct(plain);
    assert.ok(Built.$is("Compiled")(built));
    assert.deepEqual([...built.view.states].toSorted(), ["Busy", "Idle"]);

    const wrong = production.construct({
      ...plain,
      on: { ...plain.on, Nope: { guard: Option.none(), target: Option.none() } },
    });

    assert.deepEqual(wrong, Built.Refused({ codes: ["InvalidMachine"] }));
  });

  it("passes every Compile construction case it does not owe, and each owed case still fails", () => {
    for (const c of constructionCases) {
      const owed = staticOwed.cases.some((id) => id === c.id);

      assert.equal(passes(c.id), !owed, `${c.id}${owed ? ` (owed to ${staticOwed.owner})` : ""}`);
    }
  });

  it("names every alternative of each part's and Pay's Compiled, or owes the places check", () => {
    assert.ok(parts.length > 0);

    for (const name of ["pay", ...parts.map((p) => p.name)])
      assert.equal(production.places(name).length > 0, !staticOwed.places, name);
  });
});
