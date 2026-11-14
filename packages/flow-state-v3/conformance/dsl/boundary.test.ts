/// <reference types="node" />
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vite-plus/test";
import { Option } from "effect";
import { nullPort } from "../adapters/null.ts";
import { Serialize } from "../fixtures/one-lane.ts";
import { Pay } from "../fixtures/pay.ts";
import { openCase, UnbootedFixture } from "./case.ts";
import { rules } from "./lifecycle-rules.ts";

describe("a case's actors come from the fixtures it boots", () => {
  it("an actor of a fixture the case did not boot is a scenario bug", () => {
    const opened = openCase({
      port: nullPort,
      fixtures: [Pay],
      captureMs: 5000,
      oracles: [],
      seed: 1,
      graphs: [],
      overdue: () => false,
      crashAt: Option.none(),
      replay: Option.none(),
      rules,
      judge: false,
      excuse: () => false,
    });

    assert.doesNotThrow(() => opened.driven.actor(Pay, "a"));
    assert.throws(() => opened.driven.actor(Serialize, "a"), UnbootedFixture);
  });
});

const SUITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The expect half's roots (Conformance R20, T40): what a step owes is computed here and in what they
 * import, from suite facts and the fixtures only.
 */
const ROOTS = ["dsl/expect.ts", "turn/predict.ts"];

/**
 * Names that carry a report, a runtime answer or the runtime itself, by the module that exports
 * them.
 */
const BANNED = new Map<string, ReadonlyArray<string>>([
  [
    "port.ts",
    [
      "Observation",
      "Turn",
      "Minted",
      "Sent",
      "Ended",
      "Delivered",
      "Recorded",
      "TurnPart",
      "heard",
      "Boot",
      "Runtime",
      "Port",
      "Unreadable",
    ],
  ],
  ["dsl/oracle.ts", ["Fact", "RuntimeAnswer", "RuntimeFact", "isRuntimeFact", "reported"]],
]);

/**
 * Modules on the compare side or the runtime's: an expect module never imports them.
 */
const COMPARE = [
  "dsl/compare.ts",
  "dsl/lifecycle-step.ts",
  "dsl/engine.ts",
  "dsl/case.ts",
  "dsl/play.ts",
  "turn/selection.ts",
  "turn/judge.ts",
  "turn/late.ts",
];

type Import = { readonly from: string; readonly names: ReadonlyArray<string> };

// RETURN_TYPE: the matches' groups are optional strings; the contract states the parsed shape.
const importsOf = (source: string): ReadonlyArray<Import> => [
  ...[...source.matchAll(/(?:import|export)\s+(type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)";/gu)].map(
    (m) => ({
      from: m[3] ?? "",
      names: (m[2] ?? "")
        .split(",")
        .map((n) => n.trim().replace(/^type\s+/u, ""))
        .filter((n) => n !== ""),
    }),
  ),
  ...[
    ...source.matchAll(
      /(?:import|export)\s+(?:type\s+)?\*(?:\s+as\s+\w+)?\s+from\s+"([^"]+)";|import\(\s*"([^"]+)"\s*\)/gu,
    ),
  ].map((m) => ({ from: m[1] ?? m[2] ?? "", names: ["*"] })),
];

const targetOf = (module: string, from: string) =>
  relative(SUITE, resolve(SUITE, dirname(module), from));

/**
 * The boundary's breaches in one module's source, as `module: what`: each banned name it imports,
 * each compare module, and any module outside the suite or in its adapters (Conformance T37: the
 * model imports nothing from a runtime, an adapter or an implementation).
 */
const breachesOf = (module: string, source: string) =>
  importsOf(source).flatMap((i) => {
    if (!i.from.startsWith(".")) return [];
    const target = targetOf(module, i.from);
    const banned = BANNED.get(target) ?? [];

    const named =
      i.names.includes("*") && banned.length > 0
        ? ["*"]
        : banned.filter((n) => i.names.includes(n));

    const imported = COMPARE.filter((c) => c === target).map((c) => `${module}: imports ${c}`);

    const runtime = [target]
      .filter((t) => t.startsWith("..") || t.startsWith("adapters/"))
      .map((t) => `${module}: imports the runtime module ${t}`);

    return [...named.map((n) => `${module}: imports ${n} from ${target}`), ...imported, ...runtime];
  });

const localImports = (module: string) =>
  importsOf(readFileSync(join(SUITE, module), "utf8"))
    .filter((i) => i.from.startsWith("."))
    .map((i) => targetOf(module, i.from))
    .filter((t) => !t.startsWith("..") && !COMPARE.includes(t));

const closure = (roots: ReadonlyArray<string>) => {
  const seen = new Set<string>();
  const queue = [...roots];

  for (let next = queue.shift(); next !== undefined; next = queue.shift())
    if (!seen.has(next)) {
      seen.add(next);
      queue.push(...localImports(next));
    }

  return [...seen];
};

describe("the expect half's boundary (Conformance R20, T37, T40)", () => {
  it("no expect module imports a report, a runtime answer or a compare module", () => {
    const breaches = closure(ROOTS).flatMap((module) =>
      breachesOf(module, readFileSync(join(SUITE, module), "utf8")),
    );

    assert.deepStrictEqual(breaches, []);
  });

  it("the check rejects a planted report, compare and runtime import", () => {
    const planted = [
      'import { type Observation, sameActor } from "../port.ts";',
      'import { reported } from "./compare.ts";',
      'import { step } from "../../prototypes/round-14/step.ts";',
      'import * as port from "../port.ts";',
      'export { Fact } from "./oracle.ts";',
      'const later = import("./compare.ts");',
    ].join("\n");

    assert.deepStrictEqual(breachesOf("dsl/expect.ts", planted), [
      "dsl/expect.ts: imports Observation from port.ts",
      "dsl/expect.ts: imports dsl/compare.ts",
      "dsl/expect.ts: imports the runtime module ../prototypes/round-14/step.ts",
      "dsl/expect.ts: imports Fact from dsl/oracle.ts",
      "dsl/expect.ts: imports * from port.ts",
      "dsl/expect.ts: imports dsl/compare.ts",
    ]);
  });
});
