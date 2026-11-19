// Planted refusals for paired-refusals, run through oxlint. `fires` lines are the 1-based lines the rule
// must report; every other line must stay quiet.
// Run: node --experimental-strip-types tools/flow-state-lint/rules/paired-refusals.test.ts
import assert from "node:assert/strict";
import { join } from "node:path";

import { inWorkdir } from "./test-support.ts";

const files: Record<string, { text: ReadonlyArray<string>; fires: ReadonlyArray<number> }> = {
  "tests/types/planted.test-d.ts": {
    text: [
      'it("a call with no positive", () => {',
      "  // @ts-expect-error Actors R24: a foreign ref",
      "  runtime.createActor(Rent, {});", // fires
      "  expectTypeOf(runtime.ensureActor(plain)).toEqualTypeOf<Actor>();",
      "});",
      'it("a call with only a negated or loose assertion", () => {',
      "  // @ts-expect-error Actors R24: a foreign ref",
      "  runtime.disposeActor(rent);", // fires
      "  expectTypeOf(runtime.disposeActor(plain)).not.toBeNever();",
      "  expectTypeOf(runtime.disposeActor(plain)).not.toEqualTypeOf<never>();",
      "});",
      'it("a call paired exactly", () => {',
      "  // @ts-expect-error Actors R24: a foreign ref",
      "  runtime.ensureActor(rent);",
      "  expectTypeOf(runtime.ensureActor(plain)).toEqualTypeOf<Actor>();",
      "});",
      'it("a misspelt member read paired on its object", () => {',
      "  // @ts-expect-error a field the definition lacks",
      '  void order?.memory["pausedUntill"];',
      "  expectTypeOf(order?.memory.pausedUntil).toEqualTypeOf<Date | undefined>();",
      "});",
      'it("a comparison paired in another test does not count", () => {',
      "  // @ts-expect-error a state the definition lacks",
      '  void (cut.lifecycle === "Opne");', // fires
      "});",
      'it("the other test", () => {',
      '  expectTypeOf(cut.lifecycle).toEqualTypeOf<"Open">();',
      "});",
      'it("a property paired by its parameter, and one paired by a longer name only", () => {',
      "  machine(Lamp, () => ({",
      "    // @ts-expect-error a schedule of another definition",
      "    schedules: { ring: Bell.E.Ring },",
      "    // @ts-expect-error a key no positive names as a whole word",
      "    on: { Flip: 1 },", // fires
      "  }));",
      "  expectTypeOf(machine(Lamp, () => ({ schedules: { ring: E.Off }, only: 1 }))).toEqualTypeOf<M>();",
      "});",
    ],
    fires: [3, 8, 24, 34],
  },
  "tests/actors/planted.test.ts": {
    text: ["// @ts-expect-error a run-time test's own refusal", "runtime.createActor(Rent, {});"],
    fires: [],
  },
};

inWorkdir(({ pkg, write, lint, lines }) => {
  const placed = (path: string) => join(pkg, path.replace(/planted/u, "paired-refusals-planted"));

  for (const [path, { text }] of Object.entries(files)) write(placed(path), `${text.join("\n")}\n`);

  const found = lint();

  for (const [path, { fires }] of Object.entries(files))
    assert.deepEqual(lines(found, placed(path), "paired-refusals"), fires, `paired-refusals in ${path}`);
});

console.log("flow-state paired-refusals tests passed");
