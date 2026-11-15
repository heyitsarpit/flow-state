// Planted violations for the six ban rules, run through oxlint with the options vite.config.ts gives
// each rule. Every rule must fire inside the package, stay silent in each exception folder, catch the
// `globalThis`, `global` and `window` forms, and ignore type positions.
// Run: node --experimental-strip-types tools/flow-state-lint/rules.test.ts
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const config = (await import(join(root, "vite.config.ts"))).default;

const banRules = [
  "no-json-stringify",
  "no-entropy",
  "no-clock",
  "no-timers",
  "no-host-apis",
  "no-effect-runtime",
] as const;

type Rule = (typeof banRules)[number];

// The options vite.config.ts gives the rules: the test runs what the project runs.
const given = config.lint.overrides.find(
  (override: { rules?: Record<string, unknown> }) => override.rules?.["flow-state/no-timers"],
).rules;

// Each line is one use the rule must report; `quiet` lines are not uses and must stay unreported.
const samples: Record<Rule, { fires: ReadonlyArray<string>; quiet: ReadonlyArray<string> }> = {
  "no-json-stringify": {
    fires: ["JSON.stringify(1);", "globalThis.JSON.stringify(1);", "global.JSON.stringify(1);"],
    quiet: ["JSON.parse('1');", "const stringify = 1;"],
  },
  "no-entropy": {
    fires: [
      "Math.random();",
      "globalThis.Math.random();",
      "crypto.randomUUID();",
      "globalThis.crypto;",
      "window.crypto;",
    ],
    quiet: ["type C = typeof Math;", "const random = 1;"],
  },
  "no-clock": {
    fires: ["Date.now();", "new Date();", "performance.now();", "globalThis.Date;", "global.performance;"],
    quiet: ["export const d: Date = Object.create(null);", "type D = Date;"],
  },
  "no-timers": {
    fires: [
      "setTimeout(() => 1, 1);",
      "clearTimeout(1);",
      "setInterval(() => 1, 1);",
      "queueMicrotask(() => 1);",
      "globalThis.setTimeout;",
      "global.setInterval;",
      "window.queueMicrotask;",
    ],
    quiet: ["type T = ReturnType<typeof setTimeout>;"],
  },
  "no-host-apis": {
    fires: [
      "window;",
      "document;",
      "navigator;",
      "indexedDB;",
      "localStorage;",
      "sessionStorage;",
      "globalThis.localStorage;",
      "global.document;",
    ],
    quiet: ["type W = Window;", "const document2 = 1;"],
  },
  "no-effect-runtime": {
    fires: [
      "Effect.gen(function* () {});",
      "Effect.runSync(Effect.void);",
      "Effect.runPromise(Effect.void);",
      "Effect.runFork(Effect.void);",
      "Effect.try(() => 1);",
      "Effect.tryPromise(() => Promise.resolve(1));",
      "Promise.resolve(1);",
      "globalThis.Promise;",
      "E.gen(function* () {});",
      "Fx.runSync(Effect.void);",
      "Pkg.Effect.runSync(Effect.void);",
    ],
    quiet: ["export type P = Promise<number>;", "Effect.succeed(1);", "Other.gen();"],
  },
};

const imports = [
  'import { Effect, Effect as Fx } from "effect";',
  'import * as E from "effect/Effect";',
  'import * as Pkg from "effect";',
  "const Other = { gen: () => 1 };",
].join("\n");

// Where each rule must fire and where it must stay silent, as paths in the package. A `.test.ts` or
// a `test/` folder is a test file.
const inside = [
  "src/core/planted.ts",
  "src/core/deep/planted.ts",
  "src/host/planted.ts",
  "src/host/platform/planted.ts",
  "tests/planted.ts",
  "fixtures/planted.ts",
  "bench/planted.ts",
  "src/core/planted.test.ts",
  "src/core/test/planted.ts",
  "src/host/planted.test.ts",
];

const silent: Record<Rule, ReadonlyArray<string>> = {
  "no-json-stringify": [],
  "no-entropy": ["src/host/platform/planted.ts"],
  "no-clock": ["src/host/platform/planted.ts", "bench/planted.ts"],
  "no-timers": ["src/host/platform/planted.ts", "bench/planted.ts"],
  "no-host-apis": ["src/host/planted.ts", "src/host/platform/planted.ts", "src/host/planted.test.ts"],
  "no-effect-runtime": [
    "src/host/planted.ts",
    "src/host/platform/planted.ts",
    "src/core/planted.test.ts",
    "src/core/test/planted.ts",
    "src/host/planted.test.ts",
    "tests/planted.ts",
    "fixtures/planted.ts",
    "bench/planted.ts",
  ],
};

const workdir = mkdtempSync(join(tmpdir(), "flow-state-lint-"));

try {
  const pkg = join(workdir, "packages", "flow-state-v3");
  const planted = new Map<string, { rule: Rule; path: string; lines: number }>();

  const write = (path: string, text: string) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };

  for (const rule of banRules)
    for (const path of [...inside, "../../elsewhere/planted.ts"]) {
      // One file per rule and place, so a rule's own reports are the file's reports.
      const file = path.replace(/planted/u, `${rule}-planted`);
      const body = [...samples[rule].fires, ...samples[rule].quiet];
      const text = `${imports}\n${body.join("\n")}\n`;

      write(join(pkg, file), text);
      planted.set(join(pkg, file), { rule, path, lines: imports.split("\n").length });
    }

  write(
    join(workdir, ".oxlintrc.json"),
    JSON.stringify({
      jsPlugins: [{ name: "flow-state", specifier: join(root, "tools/flow-state-lint/index.ts") }],
      categories: { correctness: "off" },
      rules: given,
    }),
  );

  const run = spawnSync(
    join(root, "node_modules/.bin/oxlint"),
    ["-c", ".oxlintrc.json", "--format", "json", "packages", "elsewhere"],
    { cwd: workdir, encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] },
  );

  const found: ReadonlyArray<{ code: string; filename: string; labels: ReadonlyArray<{ span: { line: number } }> }> =
    JSON.parse(run.stdout).diagnostics;

  const reportedLines = (file: string, rule: Rule) =>
    found
      .filter((d) => d.code === `flow-state(${rule})` && join(workdir, d.filename) === file)
      .flatMap((d) => d.labels.map((l) => l.span.line))
      .toSorted((a, b) => a - b)
      .filter((line, i, all) => all[i - 1] !== line);

  for (const [file, { rule, path, lines }] of planted) {
    const got = reportedLines(file, rule);
    const outside = path.startsWith("..");

    const want =
      outside || silent[rule].includes(path)
        ? []
        : samples[rule].fires.map((_, i) => lines + 1 + i);

    assert.deepEqual(got, want, `${rule} in ${path}`);
  }

  console.log("flow-state ban rule tests passed");
} finally {
  rmSync(workdir, { recursive: true, force: true });
}
