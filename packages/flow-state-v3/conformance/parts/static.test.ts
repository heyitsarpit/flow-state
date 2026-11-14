import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Effect, Option } from "effect";
import { parts } from "../../fixtures/index.ts";
import { nullSurface } from "../adapters/null-static.ts";
import { staticOwed } from "../adapters/production-static.ts";
import { constructionCases } from "../compile/construction.cases.ts";
import { Mismatch } from "../dsl/oracle.ts";
import { playStatic } from "../dsl/static-case.ts";
import { runtimeSurface } from "../runner/args.ts";
import { Built, MemoryField, type Source, type Surface } from "../surface.ts";

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

const inexpressible = new Set(["Computed", "Input", "NumberInput"]);

/**
 * Production's surface over S1 with the fields production cannot declare left out: a probe of
 * what each owed case lacks besides them, never a gate's surface.
 */
const withoutInputs: Surface = {
  ...production,
  construct: (source) =>
    production.construct({
      ...source,
      memory: Object.fromEntries(
        Object.entries(source.memory).filter(([, f]) => !inexpressible.has(f._tag)),
      ),
    }),
};

const failureOf = (surface: Surface, id: string) => {
  const found = constructionCases.find((c) => c.id === id);
  assert.ok(found !== undefined, id);

  try {
    playStatic(surface, found);

    return "pass";
  } catch (failure) {
    if (failure instanceof Mismatch) return `Mismatch ${failure.label} (actual ${failure.actual})`;

    return `Error ${String(failure)}`;
  }
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

  it("passes every Compile construction case it does not owe, and each owed case fails on S1's fields", () => {
    for (const c of constructionCases) {
      const owed = staticOwed.cases.some((row) => row.case === c.id);

      assert.equal(passes(c.id), !owed, `${c.id}${owed ? ` (owed to ${staticOwed.owner})` : ""}`);
    }

    const computed = MemoryField.Computed({ compute: () => "0" });

    for (const [field, why] of [
      [MemoryField.Input(), "production has no Flow.input"],
      [computed, "production has no computed initial"],
    ] as const) {
      const built = production.construct({ ...plain, memory: { ...plain.memory, field } });

      assert.ok(Built.$is("Crashed")(built) && built.thrown.includes(why), why);
    }
  });

  it("without S1's Flow.input and computed fields, each owed case fails by the check its row names, or passes", () => {
    assert.equal(staticOwed.cases.length, constructionCases.length);

    for (const row of staticOwed.cases) {
      const failed = failureOf(withoutInputs, row.case);

      if (row.missing === "none") assert.equal(failed, "pass", row.case);
      else assert.ok(failed.startsWith(`Mismatch ${row.missing}`), `${row.case}: ${failed}`);
    }
  });

  it("names every alternative of each part's and Pay's Compiled, or owes the places check", () => {
    assert.ok(parts.length > 0);

    for (const name of ["pay", ...parts.map((p) => p.name)])
      assert.equal(production.places(name).length > 0, !staticOwed.places, name);
  });
});
