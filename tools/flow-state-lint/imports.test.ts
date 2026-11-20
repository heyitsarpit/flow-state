// Planted violations for the package's import rules, run through oxlint with the overrides
// vite.config.ts gives. Each rule must refuse its forbidden import and allow its permitted ones.
// Run: node --experimental-strip-types tools/flow-state-lint/imports.test.ts
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const config = (await import(join(root, "vite.config.ts"))).default;

type Override = { files: ReadonlyArray<string>; excludeFiles?: ReadonlyArray<string>; rules?: Record<string, unknown> };

// The overrides vite.config.ts gives the import rule: the test runs what the project runs.
const overrides = (config.lint.overrides as ReadonlyArray<Override>)
  .filter((override) => override.rules?.["no-restricted-imports"] !== undefined)
  .map(({ files, excludeFiles, rules }) => ({
    files,
    ...(excludeFiles === undefined ? {} : { excludeFiles }),
    rules: { "no-restricted-imports": rules?.["no-restricted-imports"] },
  }));

// One file per case: where it sits in the package, what it imports, and whether lint must refuse it.
const cases: ReadonlyArray<{ file: string; imports: string; refused: boolean }> = [
  { file: "src/core/a.ts", imports: "../host/runtime.ts", refused: true },
  { file: "src/core/b.ts", imports: "./world.ts", refused: false },
  { file: "src/core/c.ts", imports: "../../fixtures/pay/machine.ts", refused: true },
  { file: "src/core/d.tsx", imports: "../host/runtime.ts", refused: true },
  { file: "src/machine-planted.ts", imports: "./host/runtime.ts", refused: true },
  { file: "src/machine-planted-2.ts", imports: "./core/world.ts", refused: false },
  { file: "src/index.ts", imports: "./host/runtime.ts", refused: false },
  { file: "src/host/a.ts", imports: "../../tests/rules/rules.ts", refused: true },
  { file: "src/host/b.ts", imports: "../../bench/run.ts", refused: true },
  { file: "src/host/c.ts", imports: "../core/world.ts", refused: false },
  { file: "fixtures/pay/a.ts", imports: "../../src/index.ts", refused: false },
  { file: "fixtures/pay/b.ts", imports: "../../src/host/testing/index.ts", refused: false },
  { file: "fixtures/pay/h.ts", imports: "../../src/host/persistence.ts", refused: false },
  { file: "fixtures/pay/c.ts", imports: "../../src/core/world.ts", refused: true },
  { file: "fixtures/pay/d.ts", imports: "../../src/host/runtime.ts", refused: true },
  { file: "fixtures/pay/e.ts", imports: "../../tests/rules/rules.ts", refused: true },
  { file: "fixtures/pay/f.tsx", imports: "../../src/core/world.ts", refused: true },
  { file: "tests/pay/a.ts", imports: "../../src/host/testing/index.ts", refused: false },
  { file: "tests/pay/b.ts", imports: "../../src/host/inspect.ts", refused: false },
  { file: "tests/pay/c.ts", imports: "../../src/index.ts", refused: false },
  { file: "tests/pay/d.ts", imports: "../../fixtures/pay/stories.ts", refused: false },
  { file: "tests/pay/e.ts", imports: "../../src/core/world.ts", refused: true },
  { file: "tests/pay/f.ts", imports: "../../src/host/testing.ts", refused: true },
  { file: "tests/pay/g.ts", imports: "../../src/host/trace.ts", refused: false },
  { file: "tests/types/a.ts", imports: "../../src/host/persistence.ts", refused: false },
  { file: "tests/pay/h.tsx", imports: "../../src/core/world.ts", refused: true },
  { file: "tests/cli/a.ts", imports: "../../src/host/cli/main.ts", refused: false },
  { file: "tests/cli/b.ts", imports: "../../src/host/cli/discover.ts", refused: true },
  { file: "tests/surface/a.ts", imports: "../../src/entry.ts", refused: false },
  { file: "tests/surface/b.ts", imports: "../../src/error.ts", refused: true },
  { file: "fixtures/pay/g.ts", imports: "../../src/host/cli/main.ts", refused: true },
  { file: "bench/a.ts", imports: "../src/host/driver.ts", refused: true },
  { file: "bench/c.ts", imports: "../src/host/trace.ts", refused: false },
  { file: "bench/b.ts", imports: "../fixtures/pay/stories.ts", refused: false },
];

const workdir = mkdtempSync(join(tmpdir(), "flow-state-imports-"));

try {
  const pkg = join(workdir, "packages", "flow-state-v3");

  for (const { file, imports } of cases) {
    mkdirSync(dirname(join(pkg, file)), { recursive: true });
    writeFileSync(join(pkg, file), `import * as planted from "${imports}";\nexport { planted };\n`);
  }

  writeFileSync(
    join(workdir, ".oxlintrc.json"),
    JSON.stringify({ categories: { correctness: "off" }, rules: {}, overrides }),
  );

  const run = spawnSync(
    join(root, "node_modules/.bin/oxlint"),
    ["-c", ".oxlintrc.json", "--format", "json", "packages"],
    { cwd: workdir, encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] },
  );

  const found: ReadonlyArray<{ code: string; filename: string }> = JSON.parse(run.stdout).diagnostics;

  const refused = new Set(
    found.filter((d) => d.code.includes("no-restricted-imports")).map((d) => join(workdir, d.filename)),
  );

  for (const { file, imports, refused: expected } of cases)
    assert.equal(
      refused.has(join(pkg, file)),
      expected,
      `${file} importing ${imports} should be ${expected ? "refused" : "allowed"}`,
    );

  console.log("import rule tests passed");
} finally {
  rmSync(workdir, { recursive: true, force: true });
}
