import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { Room } from "../../fixtures/home/machines/room.ts";

const SRC = new URL("../../src/", import.meta.url);

const CAST = "typescript/no-unsafe-type-assertion";

const DECLARED = /^(\s*)(?:export\s+)?(?:const|function)\s+(\w+)/u;

// Test tooling is not production: its casts are the test tooling's own restores (Types, Host).
const production = readdirSync(SRC, { recursive: true, encoding: "utf8" })
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".test-d.ts"))
  .filter((f) => !f.startsWith("host/testing/") && !f.split("/").includes("test"));

// The declared parts a definition's face does not hold, and what it holds for them.
const ECHO = ["states", "events", "internalEvents", "memory", "context", "operations", "schedules"];

const KEPT = [
  "id",
  "persist",
  "S",
  "E",
  "O",
  "M",
  "state",
  "Event",
  "State",
  "Input",
  "Memory",
  "Snapshot",
];

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

// Types T7's ratchet: the count of cast disables only falls. Lower it with each deletion; the exact
// list of crossings is owed by the Task that builds host/snapshot.ts#project.
const MOST = 39;

// The casts the crossings door and slot absorb, and the kind-brand casts the made-value doors
// absorb (Types R13, one point per class of cast).
const ABSORBED = [
  "contract.ts#trustedAttempt",
  "definition.ts#definition",
  "entry.ts#registered",
  "events.ts#codecOf",
  "events.ts#trusted",
  "flow.ts#Flow",
  "flow.ts#selectOf",
  "handles.ts#erase",
  "machine.ts#erasedBody",
  "machine.ts#erasedWhen",
  "machine.ts#machine",
  "machine.ts#trustedTokens",
  "send.ts#send",
];

const CROSSINGS = ["entry.ts#door", "handles.ts#slot"];

// Types I1: the parts of a definition, which every derived type reads, are declared in one module.
const PARTS = /^(?:export\s+)?type\s+Parts\b/mu;

describe("one derivation (Types R1, I1)", () => {
  it("Types I1: Parts, the one reading of a definition's parts, is declared in derive.ts alone", () => {
    expect(production.filter((f) => PARTS.test(readFileSync(new URL(f, SRC), "utf8")))).toEqual([
      "derive.ts",
    ]);
  });
});

describe("a definition's face holds tokens and codecs, not its declaration (Types R1)", () => {
  it("Types R1: the declaration is off the face's value; the tokens and the codecs for whole values stay", () => {
    expect({
      echo: ECHO.filter((key) => key in Room),
      kept: KEPT.filter((key) => !(key in Room)),
      schema: "schema" in Room.M.sensors,
    }).toEqual({ echo: [], kept: [], schema: false });
  });
});

describe("a type crosses into the erased core at named functions only (Types R13, I4, T7)", () => {
  it("Types T7: the cast disables in src/ outside test tooling never grow past the ratchet", () => {
    expect(MOST).toBeGreaterThanOrEqual(production.flatMap(castsOf).length);
  });

  it.fails("Types R13: door and slot hold their crossing's one cast, and the casts they absorb are gone", () => {
    const casts = new Set(production.flatMap(castsOf));

    expect({
      crossings: CROSSINGS.filter((c) => casts.has(c)),
      absorbed: ABSORBED.filter((c) => casts.has(c)),
    }).toEqual({ crossings: CROSSINGS, absorbed: [] });
  });
});
