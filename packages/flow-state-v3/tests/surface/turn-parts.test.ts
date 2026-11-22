import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

// The turn's parts read from the source: only `apply.ts` writes an incarnation and publishes
// (Changes R11, I4), the writers it replaces are gone, and one builder makes every callback's
// input (Changes R22). The unions of `model` and `realization` are pinned as types in
// `src/core/turn-parts.test-d.ts`.

const CORE = new URL("../../src/core/", import.meta.url);

const production = readdirSync(CORE).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".test-d.ts"),
);

const text = (file: string) => readFileSync(new URL(file, CORE), "utf8");

const filesWith = (pattern: RegExp) => production.filter((f) => pattern.test(text(f)));

// The writers `apply` replaces (Changes.md, fit to today's code: delete), by file and name.
const REPLACED = [
  "serve.ts#raised",
  "serve.ts#refusal",
  "incarnations.ts#setIncarnation",
  "incarnations.ts#publish",
  "context.ts#failing",
  "step.ts#fired",
  "world.ts#withIssue",
  "world.ts#withIssues",
  "world.ts#withoutIssue",
];

const declared = (entry: string) => {
  const [file = "", name = ""] = entry.split("#");

  return new RegExp(`(?:const|function)\\s+${name}\\b`, "u").test(text(file));
};

describe("one applier (Changes R11, I4)", () => {
  it("Changes R11: only apply.ts writes an incarnation into the world", () => {
    expect(filesWith(/putIncarnation\(/u)).toEqual(["apply.ts"]);
  });

  it("Changes R11: a publication is built at one call site, in apply.ts", () => {
    expect(filesWith(/Act\.Published\(/u)).toEqual(["apply.ts"]);
  });

  it("Changes R11: the writers apply replaces are gone", () => {
    expect(REPLACED.filter(declared)).toEqual([]);
  });
});

// A record built for a user callback: a value literal with the scope's memory beside what only a
// callback reads (its event, the time, a timer's key). Outside `reads.ts`, every core file is
// scanned, so a builder moved to a new file is still found (Changes R22, CallbackInputs).
const LITERAL = /\{[^{}]*\}/gu;

const hasKey = (literal: string, key: string) =>
  new RegExp(`(?:^\\{|,)\\s*${key}\\s*[:,}]`, "u").test(literal);

const callbackRecord = (literal: string) =>
  !literal.includes("readonly") &&
  !literal.includes("Schema.") &&
  hasKey(literal, "memory") &&
  ["event", "now", "key"].some((key) => hasKey(literal, key));

const found = production
  .filter((f) => f !== "reads.ts")
  .flatMap((f) =>
    [...text(f).matchAll(LITERAL)]
      .map((m) => m[0].replaceAll(/\s+/gu, " "))
      .filter(callbackRecord)
      .map((literal) => `${f}: ${literal}`),
  );

describe("one builder of callback inputs (Changes R22)", () => {
  it("Changes R22: readsOf is declared once, in reads.ts", () => {
    expect(filesWith(/(?:const|function)\s+readsOf\b/u)).toEqual(["reads.ts"]);
  });

  it("Changes R22: no caller of a user callback builds its inputs itself", () => {
    expect(found).toEqual([]);
  });
});
