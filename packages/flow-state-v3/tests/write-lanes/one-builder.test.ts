import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const SRC = new URL("../../src/", import.meta.url);

const sources = (dir: string) =>
  readdirSync(new URL(dir, SRC), { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".ts"))
    .map((f) => `${dir}${f}`);

const text = (file: string) => readFileSync(new URL(file, SRC), "utf8");

const EVIDENCE_BUILT = /\bEvidence\.[A-Z]\w*\(/u;

describe("one builder of reports (WriteLanes realization, I34)", () => {
  it.fails("WriteLanes I34: every report is built by evidenceOf from an act; no other core module builds an Evidence", () => {
    const builders = sources("core/")
      .filter((f) => !f.endsWith(".test.ts") && f !== "core/evidence-of.ts")
      .filter((f) => EVIDENCE_BUILT.test(text(f)));

    expect(builders).toEqual([]);
  });
});

const TEMPORARY = /\bPART-|\b(?:step|Task) T\d+\b|"T\d+"|\(T\d+ acceptance|\bT\d+'s\b/u;

describe("the package names no temporary record", () => {
  it.fails("no source file, test included, names a Task, step or old-suite case id", () => {
    const named = sources("").filter((f) => TEMPORARY.test(text(f)));

    expect(named).toEqual([]);
  });
});
