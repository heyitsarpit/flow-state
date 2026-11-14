/// <reference types="node" />
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vite-plus/test";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Core Spec rules that were retired and whose ids are never reused: WriteLanes R15 (`cancelAll`,
 * deferred) and WriteLanes I21, which ordered its endings.
 */
const RETIRED: ReadonlyArray<string> = ["WriteLanes I21", "WriteLanes R15"];

// RETURN_TYPE: a recursive function names its type.
const filesIn = (dir: string): ReadonlyArray<string> =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        if (e.isDirectory()) return filesIn(join(dir, e.name));

        return e.name.endsWith(".ts") ? [join(dir, e.name)] : [];
      })
    : [];

describe("citations name live rules (Conformance R5, I9, I10)", () => {
  it("no case, oracle, mutant or trace cites a retired rule", () => {
    const citing = filesIn(HERE)
      .filter((file) => file !== fileURLToPath(import.meta.url))
      .flatMap((file) => {
        const source = readFileSync(file, "utf8");

        return RETIRED.filter((id) => new RegExp(`${id}(?!\\d)`, "u").test(source)).map(
          (id) => `${relative(HERE, file)}: ${id}`,
        );
      });

    assert.deepStrictEqual(citing, []);
  });

  it("refuses a planted citation of a retired rule", () => {
    assert.ok(RETIRED.some((id) => new RegExp(`${id}(?!\\d)`, "u").test("judges WriteLanes R15.")));
    assert.ok(!RETIRED.some((id) => new RegExp(`${id}(?!\\d)`, "u").test("WriteLanes R150")));
  });
});
