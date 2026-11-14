/// <reference types="node" />
import assert from "node:assert/strict";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vite-plus/test";
import { RETIRED_RULES } from "./coverage.ts";
import { productionCases } from "./runner/gates.ts";
import { traces } from "./dsl/lifecycle.traces.ts";
import { rules } from "./dsl/lifecycle-rules.ts";
import { cellsOf, valueAt } from "./parts/cells.ts";
import { sourceFiles, sourceOf } from "./source-files.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The retired rules, named bare only where they are retired: `coverage.ts` lists them and
 * `coverage.test.ts` checks that list, so the walk leaves those two files out.
 */
const RETIRED = RETIRED_RULES;

const bare = (text: string) =>
  RETIRED.filter((id) => {
    const [spec, rule] = id.split(" ");
    const listed = `${spec} (?:[RI]\\d+(?:, | and ))+${rule}(?!\\d)`;

    return new RegExp(`(?<!Retired )${id}(?!\\d)|${listed}`, "u").test(text);
  });

const filesIn = (dir: string) => sourceFiles(dir, /\.(ts|tsv|txt|json)$/u);

const labelCites = (text: string) =>
  [...text.matchAll(/\beq\(\s*["'`]([A-Z][A-Za-z]* [RI]\d+)\b/gu)].map((m) => m[1]);

const runtimeCites = () => [
  ...cellsOf().flatMap((cell) => {
    const value = valueAt(rules, cell);

    return value !== undefined && "invariant" in value ? [value.invariant] : [];
  }),
  ...traces.flatMap((trace) => trace.refusals.flat()),
];

describe("citations name live rules, or a retired one as retired (Conformance R5, I9, I10)", () => {
  it("no file cites a retired rule but as retired", () => {
    const naming = ["coverage.ts", "coverage.test.ts"].map((f) => `${HERE}/${f}`);

    const files = filesIn(HERE).filter(
      (file) => file !== fileURLToPath(import.meta.url) && !naming.includes(file),
    );

    assert.ok(files.length > 100, "the walk found no files");

    const citing = files.flatMap((file) =>
      bare(sourceOf(file)).map((id) => `${relative(HERE, file)}: ${id}`),
    );

    assert.deepStrictEqual(citing, []);
  });

  it("no cite the model builds at run time names a retired rule but as retired", () => {
    const cites = runtimeCites();
    assert.ok(cites.length > 0, "the model built no cite");

    assert.deepStrictEqual([...new Set(cites.flatMap(bare))], []);
  });

  it("the retired cancelAll cases run on round-14 only, never among production's cases", () => {
    const retired = ["LANE-03", "LANE-04", "LANE-05", "LANE-10"];

    assert.deepEqual(
      productionCases.filter((id) => retired.includes(id)),
      [],
    );
  });

  it("refuses a planted bare citation and accepts the retired form", () => {
    assert.deepStrictEqual(bare("judges WriteLanes R15."), ["WriteLanes R15"]);
    assert.deepStrictEqual(bare("judges Retired WriteLanes R15."), []);
    assert.deepStrictEqual(bare("WriteLanes R150"), []);
  });

  it("no expectation writes its cite into its label; it declares it with `expect`", () => {
    const files = filesIn(HERE).filter(
      (file) => file.endsWith(".ts") && file !== fileURLToPath(import.meta.url),
    );

    assert.ok(files.length > 100, "the walk found no files");

    const citing = files.flatMap((file) =>
      labelCites(sourceOf(file)).map((id) => `${relative(HERE, file)}: ${id}`),
    );

    assert.deepStrictEqual(citing, []);
  });

  it("refuses a planted label cite and accepts a declared one", () => {
    assert.deepStrictEqual(labelCites('c.eq("Turn I14: refused", a, b)'), ["Turn I14"]);
    assert.deepStrictEqual(labelCites('c.eq(\n  "WriteLanes I8: held",'), ["WriteLanes I8"]);
    assert.deepStrictEqual(labelCites('c.expect("Turn I14", "refused", a, b)'), []);
    assert.deepStrictEqual(labelCites('c.eq("memory unchanged", a, b)'), []);
  });

  it("refuses a retired id inside a list of cites, even after the retired form", () => {
    assert.deepStrictEqual(bare("WriteLanes R14, R15: one lane"), ["WriteLanes R15"]);
    assert.deepStrictEqual(bare("WriteLanes I8 and I21"), ["WriteLanes I21"]);
    assert.deepStrictEqual(bare("Retired WriteLanes R14, R15"), ["WriteLanes R15"]);
    assert.deepStrictEqual(bare("WriteLanes R14, R150"), []);
  });
});
