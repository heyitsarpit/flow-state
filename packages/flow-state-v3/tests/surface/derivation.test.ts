import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const SRC = new URL("../../src/", import.meta.url);

const CAST = "typescript/no-unsafe-type-assertion";

const DECLARED = /^(\s*)(?:export\s+)?(?:const|function)\s+(\w+)/u;

// Test tooling is not production: its casts are the test tooling's own restores (Types, Host).
const production = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".test-d.ts"))
  .filter((f) => !f.startsWith("host/testing/") && !f.split("/").includes("test"));

const indentOf = (line: string) => line.length - line.trimStart().length;

// The function or const a cast disable sits in: the nearest declaration above it at a smaller
// indent.
const enclosing = (lines: ReadonlyArray<string>, at: number) => {
  for (let i = at - 1; i >= 0; i -= 1) {
    const found = DECLARED.exec(lines[i] ?? "");

    if (found !== null && indentOf(lines[i] ?? "") < indentOf(lines[at] ?? "")) return found[2];
  }

  return "(module)";
};

const castsOf = (file: string) => {
  const lines = readFileSync(new URL(file, SRC), "utf8").split("\n");

  return lines.flatMap((line, at) =>
    line.includes(`oxlint-disable-next-line ${CAST}`) ? [`${file}#${enclosing(lines, at)}`] : [],
  );
};

// Types I4: the named crossings, then the boundaries to what lies outside Flow's types, one point
// per class of cast (Types R13). The made-value doors of construction trust are one boundary: a
// value's kind is a phantom brand no value holds.
const NAMED = [
  "entry.ts#door",
  "handles.ts#slot",
  "host/snapshot.ts#project",
  "host/driver.ts#provided",
  "core/tx.ts#branded",
  "core/tx.ts#draft",
  "core/codec.ts#parsed",
  "core/boundary.ts#rebuildOf",
  "core/boundary.ts#bodyOf",
  "core/boundary.ts#withContextOf",
  "core/boundary.ts#transformationOf",
  "core/boundary.ts#kept",
  "core/boundary.ts#kept",
  "core/boundary.ts#typedOf",
  "made.ts#madeCallable",
  "made.ts#madeOf",
  "host/refs.ts#slotRefs",
];

// Types I1: the parts of a definition, which every derived type reads, are declared in one module.
const PARTS = /^(?:export\s+)?type\s+Parts\b/mu;

describe("one derivation (Types R1, I1)", () => {
  it.fails("Types I1: Parts, the one reading of a definition's parts, is declared in derive.ts alone", () => {
    expect(production.filter((f) => PARTS.test(readFileSync(new URL(f, SRC), "utf8")))).toEqual([
      "derive.ts",
    ]);
  });
});

describe("a type crosses into the erased core at named functions only (Types R13, I4, T7)", () => {
  it.fails("Types I4: the cast disables in src/ outside test tooling are exactly the named crossings and boundaries", () => {
    expect(production.flatMap(castsOf).toSorted()).toEqual(NAMED.toSorted());
  });
});
