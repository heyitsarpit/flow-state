import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { Room } from "../../fixtures/home/machines/room.ts";

const SRC = new URL("../../src/", import.meta.url);

const CAST = "typescript/no-unsafe-type-assertion";

const DECLARED = /^(\s*)(?:export\s+)?(?:const|function)\s+(\w+)/u;

const sources = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".test-d.ts"),
);

// Test tooling is not production: its casts are the test tooling's own restores (Types, Host).
const production = sources.filter(
  (f) => !f.startsWith("host/testing/") && !f.split("/").includes("test"),
);

// The test tooling production imports (the CLI, the trace), counted apart so a cast cannot move
// there unseen.
const testing = sources.filter((f) => f.startsWith("host/testing/"));

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

// Any disable comment that names the cast rule: next-line, same-line or block, oxlint or eslint.
const DISABLE = new RegExp(`(?:oxlint|eslint)-disable(?:-next-line|-line)?\\b.*${CAST}`, "u");

const castsOf = (file: string) => {
  const lines = readFileSync(new URL(file, SRC), "utf8").split("\n");

  return lines.flatMap((line, at) =>
    DISABLE.test(line) ? [`${file}#${enclosing(lines, at)}`] : [],
  );
};

// Types T7's ratchet, exact: the count of cast disables in production, and apart in the test
// tooling. A deletion lowers it; the exact list of crossings is owed by the Task that builds
// host/snapshot.ts#project.
const MOST = 20;

const MOST_IN_TESTING = 8;

// The casts the crossings door and slot absorb, and the kind-brand casts the made-value doors
// absorb (Types R13, one point per class of cast).
const ABSORBED = [
  "compile-body.ts#levelOf",
  "contract.ts#boundOf",
  "contract.ts#trusted",
  "contract.ts#trustedAttempt",
  "definition.ts#definition",
  "entry.ts#registered",
  "events.ts#codecOf",
  "events.ts#selectionCodec",
  "events.ts#trusted",
  "flow.ts#Flow",
  "flow.ts#marker",
  "flow.ts#selectOf",
  "handles.ts#erase",
  "handles.ts#guard",
  "handles.ts#member",
  "host/refs.ts#refOf",
  "machine.ts#erasedBody",
  "machine.ts#erasedWhen",
  "machine.ts#machine",
  "machine.ts#trustedTokens",
  "made.ts#madeCallable",
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
  it("Types T7: the cast disables in src/ are exactly the ratchet, and the test tooling's apart", () => {
    expect({
      production: production.flatMap(castsOf).length,
      testing: testing.flatMap(castsOf).length,
    }).toEqual({ production: MOST, testing: MOST_IN_TESTING });
  });

  it("Types R13: door and slot each hold their crossing's one cast, and the casts they absorb are gone", () => {
    const casts = production.flatMap(castsOf);

    expect({
      crossings: CROSSINGS.map((c) => casts.filter((cast) => cast === c).length),
      absorbed: ABSORBED.filter((c) => casts.includes(c)),
    }).toEqual({ crossings: CROSSINGS.map(() => 1), absorbed: [] });
  });

  it("Types T7: every disable form is counted, not only the next-line one", () => {
    const forms = [
      `// oxlint-disable-next-line ${CAST} -- why`,
      `const x = y as Z; // oxlint-disable-line ${CAST}`,
      `/* oxlint-disable ${CAST} */`,
      `// eslint-disable-next-line ${CAST}`,
      `// oxlint-disable-next-line ${CAST}, lint-bomb/other -- why`,
    ];

    expect([...forms.map((line) => DISABLE.test(line)), DISABLE.test("// a cast")]).toEqual([
      ...forms.map(() => true),
      false,
    ]);
  });
});
