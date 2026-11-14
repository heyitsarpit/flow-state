/// <reference types="node" />
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vite-plus/test";
import { traces } from "./dsl/lifecycle.traces.ts";
import { rules } from "./dsl/lifecycle-rules.ts";
import { cellsOf, valueAt } from "./parts/cells.ts";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Core Spec rules that were retired and whose ids are never reused: WriteLanes R15 (`cancelAll`,
 * deferred) and WriteLanes I21, which ordered its endings. Round-14's frozen `cancelAll` cases
 * still judge them until round-14 retires, so they cite them as retired, by name.
 */
const RETIRED: ReadonlyArray<string> = ["WriteLanes I21", "WriteLanes R15"];

const bare = (text: string) =>
  RETIRED.filter((id) => {
    const [spec, rule] = id.split(" ");
    const listed = `${spec} (?:[RI]\\d+(?:, | and ))+${rule}(?!\\d)`;

    return new RegExp(`(?<!Retired )${id}(?!\\d)|${listed}`, "u").test(text);
  });

// RETURN_TYPE: a recursive function names its type.
const filesIn = (dir: string): ReadonlyArray<string> =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        if (e.isDirectory()) return filesIn(join(dir, e.name));

        return /\.(ts|tsv|txt|json)$/u.test(e.name) ? [join(dir, e.name)] : [];
      })
    : [];

const runtimeCites = () => [
  ...cellsOf().flatMap((cell) => {
    const value = valueAt(rules, cell);

    return value !== undefined && "invariant" in value ? [value.invariant] : [];
  }),
  ...traces.flatMap((trace) => trace.refusals.flat()),
];

describe("citations name live rules, or a retired one as retired (Conformance R5, I9, I10)", () => {
  it("no file cites a retired rule but as retired", () => {
    const files = filesIn(HERE).filter((file) => file !== fileURLToPath(import.meta.url));
    assert.ok(files.length > 100, "the walk found no files");

    const citing = files.flatMap((file) =>
      bare(readFileSync(file, "utf8")).map((id) => `${relative(HERE, file)}: ${id}`),
    );

    assert.deepStrictEqual(citing, []);
  });

  it("no cite the model builds at run time names a retired rule but as retired", () => {
    const cites = runtimeCites();
    assert.ok(cites.length > 0, "the model built no cite");

    assert.deepStrictEqual([...new Set(cites.flatMap(bare))], []);
  });

  it("refuses a planted bare citation and accepts the retired form", () => {
    assert.deepStrictEqual(bare("judges WriteLanes R15."), ["WriteLanes R15"]);
    assert.deepStrictEqual(bare("judges Retired WriteLanes R15."), []);
    assert.deepStrictEqual(bare("WriteLanes R150"), []);
  });

  it("refuses a retired id inside a list of cites, even after the retired form", () => {
    assert.deepStrictEqual(bare("WriteLanes R14, R15: one lane"), ["WriteLanes R15"]);
    assert.deepStrictEqual(bare("WriteLanes I8 and I21"), ["WriteLanes I21"]);
    assert.deepStrictEqual(bare("Retired WriteLanes R14, R15"), ["WriteLanes R15"]);
    assert.deepStrictEqual(bare("WriteLanes R14, R150"), []);
  });
});
