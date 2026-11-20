// Shared by the rule tests: plants files in a scratch copy of the package layout and runs oxlint over
// it with the rule options vite.config.ts gives, so each test runs what the project runs.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const config = (await import(join(root, "vite.config.ts"))).default;

// The options vite.config.ts gives the rules.
const given = config.lint.overrides.find(
  (override: { rules?: Record<string, unknown> }) => override.rules?.["flow-state/no-timers"],
).rules;

type Diagnostic = {
  readonly code: string;
  readonly filename: string;
  readonly labels: ReadonlyArray<{ span: { line: number } }>;
};

export type Workdir = {
  readonly pkg: string;
  readonly write: (path: string, text: string) => void;
  readonly lint: () => ReadonlyArray<Diagnostic>;
  // The distinct lines the rule reported in the file, ascending.
  readonly lines: (found: ReadonlyArray<Diagnostic>, file: string, rule: string) => ReadonlyArray<number>;
};

export const inWorkdir = (body: (dir: Workdir) => void) => {
  const workdir = mkdtempSync(join(tmpdir(), "flow-state-lint-"));

  const write = (path: string, text: string) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };

  try {
    write(
      join(workdir, ".oxlintrc.json"),
      JSON.stringify({
        jsPlugins: [{ name: "flow-state", specifier: join(root, "tools/flow-state-lint/index.ts") }],
        categories: { correctness: "off" },
        rules: given,
      }),
    );

    body({
      pkg: join(workdir, "packages", "flow-state-v3"),
      write,
      lint: () => {
        const run = spawnSync(
          join(root, "node_modules/.bin/oxlint"),
          ["-c", ".oxlintrc.json", "--format", "json", "packages", "elsewhere"],
          { cwd: workdir, encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] },
        );

        return JSON.parse(run.stdout).diagnostics;
      },
      lines: (found, file, rule) =>
        found
          .filter((d) => d.code === `flow-state(${rule})` && join(workdir, d.filename) === file)
          .flatMap((d) => d.labels.map((l) => l.span.line))
          .toSorted((a, b) => a - b)
          .filter((line, i, all) => all[i - 1] !== line),
    });
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
};

// The imports every planted file starts with.
export const imports = [
  'import { Effect, Effect as Fx } from "effect";',
  'import { Cause, Exit, Fiber, FiberMap, FiberSet } from "effect";',
  'import * as E from "effect/Effect";',
  'import * as Pkg from "effect";',
  "const Other = { gen: () => 1 };",
].join("\n");

// Where each path-scoped rule must fire and where it must stay silent, as paths in the package. A `.test.ts`
// or a `test/` folder is a test file.
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

export type Plant = {
  // Each line is one use the rule must report; `quiet` lines are not uses and must stay unreported.
  readonly fires: ReadonlyArray<string>;
  readonly quiet: ReadonlyArray<string>;
  // Inverted: uses the rule must report but misses today, asserted unreported. When the rule learns
  // one, move it to `fires`.
  readonly missed?: ReadonlyArray<string>;
  // Paths in the package where the rule must stay silent; outside the package it is always silent.
  readonly silent: ReadonlyArray<string>;
};

// Plants each rule's samples in every place and asserts the rule reports exactly its `fires` lines where it
// applies and nothing where it is silent.
export const plantRules = (plants: Readonly<Record<string, Plant>>) =>
  inWorkdir(({ pkg, write, lint, lines }) => {
    const planted = new Map<string, { rule: string; path: string }>();
    const importLines = imports.split("\n").length;

    for (const [rule, plant] of Object.entries(plants))
      for (const path of [...inside, "../../elsewhere/planted.ts"]) {
        // One file per rule and place, so a rule's own reports are the file's reports.
        const file = path.replace(/planted/u, `${rule}-planted`);
        const body = [...plant.fires, ...plant.quiet, ...(plant.missed ?? [])];

        write(join(pkg, file), `${imports}\n${body.join("\n")}\n`);
        planted.set(join(pkg, file), { rule, path });
      }

    const found = lint();

    for (const [file, { rule, path }] of planted) {
      const plant = plants[rule];

      assert.ok(plant !== undefined);

      const want =
        path.startsWith("..") || plant.silent.includes(path)
          ? []
          : plant.fires.map((_, i) => importLines + 1 + i);

      assert.deepEqual(lines(found, file, rule), want, `${rule} in ${path}`);
    }
  });
