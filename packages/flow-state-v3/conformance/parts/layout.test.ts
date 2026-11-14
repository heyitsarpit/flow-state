/// <reference types="node" />
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { sourceFiles, sourceOf } from "../source-files.ts";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vite-plus/test";

const PACKAGE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const filesIn = (dir: string) => sourceFiles(dir, /\.ts$/u);

/**
 * Every module specifier a file names: static imports of any form (named, aliased, default,
 * namespace, side-effect), re-exports and dynamic imports.
 */
export const specifiers = (source: string) =>
  [
    ...source.matchAll(/(?:^|\n)\s*(?:import|export)\s[^"'`]*?from\s*["']([^"']+)["']/g),
    ...source.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g),
    ...source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
  ].map((m) => m[1] ?? "");

const resolved = (file: string, specifier: string) =>
  specifier.startsWith(".") ? relative(PACKAGE, resolve(dirname(file), specifier)) : specifier;

describe("layout (Q1: Conformance R15; phase-out step 3)", () => {
  it("fixtures and bench sit beside conformance", () => {
    assert.ok(filesIn(join(PACKAGE, "fixtures")).length >= 4);
    assert.ok(filesIn(join(PACKAGE, "bench")).length >= 1);
    assert.ok(filesIn(join(PACKAGE, "fixtures", "pay")).length >= 1, "fixtures/pay is missing");
    assert.ok(
      !existsSync(join(PACKAGE, "conformance", "machines")),
      "conformance/machines remains",
    );
  });

  it("fixtures import only src/index.ts, effect and their own modules", () => {
    const allowed = (to: string) =>
      to === "src/index.ts" || to === "effect" || to.startsWith("fixtures/");

    for (const file of filesIn(join(PACKAGE, "fixtures")).filter((f) => !f.endsWith(".test.ts")))
      for (const s of specifiers(readFileSync(file, "utf8")))
        assert.ok(allowed(resolved(file, s)), `${relative(PACKAGE, file)} imports ${s}`);
  });

  it("conformance never imports bench", () => {
    for (const file of filesIn(join(PACKAGE, "conformance")))
      for (const s of specifiers(sourceOf(file)))
        assert.ok(
          !resolved(file, s).startsWith("bench/"),
          `${relative(PACKAGE, file)} imports ${s}`,
        );
  });

  it("the walker sees every import form a lint could miss", () => {
    const planted = [
      'import { Observation as O } from "../bench/a.ts";',
      'import "../bench/b.ts";',
      'import D from "../bench/c.ts";',
      'export * from "../bench/d.ts";',
      'const e = await import("../bench/e.ts");',
    ].join("\n");

    assert.equal(specifiers(planted).filter((s) => s.includes("bench/")).length, 5);
  });
});
