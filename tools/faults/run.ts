// Shows that Flow State's tests tell a right runtime from a wrong one. In a scratch copy of the
// package it runs the tests three ways: unchanged (must pass), with a dead core whose step changes
// nothing (every test should fail), and once per planted fault in tests/faults.ts (at least one
// test should fail). It measures and prints; it is never a gate.
//
//   bun tools/faults/run.ts [tests path, default packages/flow-state-v3/tests]
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { type Fault, faults } from "../../packages/flow-state-v3/tests/faults.ts";

const repo = resolve(import.meta.dirname, "..", "..");
const pkg = "packages/flow-state-v3";
const tests = process.argv[2] ?? `${pkg}/tests`;
const skipped = new Set(["node_modules", "prototypes"]);
const root = mkdtempSync(join(tmpdir(), "flow-faults-"));
const copy = join(root, pkg);

type Edit = Fault["edits"][number];

const run = (reporter: ReadonlyArray<string> = []) => {
  try {
    const out = execFileSync(resolve(repo, "node_modules/.bin/vp"), ["test", "run", tests, ...reporter], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    });

    return { passed: true, out };
  } catch (error) {
    const failed = error as { readonly stdout?: string; readonly stderr?: string };

    return { passed: false, out: `${failed.stdout ?? ""}${failed.stderr ?? ""}` };
  }
};

const summary = (out: string) => /Tests\s+(.*)/u.exec(out)?.[1]?.trim() ?? "no summary";

// Applies the edits, runs the body, and puts the files back. Returns false when an edit's text is
// not in its file exactly once, so a stale fault is reported and never passes for caught.
const planted = (edits: ReadonlyArray<Edit>, body: () => void) => {
  const originals = edits.map((edit) => ({
    edit,
    path: join(copy, edit.file),
    text: readFileSync(join(copy, edit.file), "utf8"),
  }));

  if (originals.some(({ edit, text }) => text.split(edit.find).length !== 2)) return false;

  for (const { edit, path, text } of originals) writeFileSync(path, text.replace(edit.find, () => edit.replace));

  try {
    body();
  } finally {
    for (const { path, text } of originals) writeFileSync(path, text);
  }

  return true;
};

const DEAD_CORE: Edit = {
  file: "src/core/step.ts",
  find: "  const tx = makeTx(machines, world0, env);",
  replace:
    "  if (machines.size >= 0) return { world: world0, commands: [], evidence: [] };\n  const tx = makeTx(machines, world0, env);",
};

cpSync(resolve(repo, pkg), copy, { recursive: true, filter: (file) => !skipped.has(basename(file)) });
writeFileSync(
  join(root, "vite.config.ts"),
  'import { defineConfig } from "vite-plus";\nexport default defineConfig({ test: { include: ["packages/**/*.test.ts"] } });\n',
);
writeFileSync(
  join(root, "package.json"),
  '{ "name": "scratch", "private": true, "type": "module", "workspaces": ["packages/*"] }\n',
);
cpSync(resolve(repo, "tsconfig.base.json"), join(root, "tsconfig.base.json"));
symlinkSync(resolve(repo, "node_modules"), join(root, "node_modules"));

try {
  const control = run();

  console.log(`unchanged: ${control.passed ? "pass" : "FAIL"} (${summary(control.out)})`);

  if (!control.passed) {
    console.log(control.out.slice(-2000));
    process.exit(1);
  }

  const dead = planted([DEAD_CORE], () => {
    const result = run(["--reporter=verbose"]);
    const green = result.out.split("\n").filter((line) => line.includes("✓"));

    console.log(`dead core: ${summary(result.out)}; still green: ${green.length}`);

    for (const line of green) console.log(`  ${line.trim()}`);
  });

  if (!dead) console.log("dead core: STALE, the edit no longer applies to src/core/step.ts");

  const results = faults.map((fault) => {
    let verdict = "STALE";

    planted(fault.edits, () => {
      const result = run();

      verdict = result.passed ? "MISSED" : `caught (${summary(result.out)})`;
    });
    console.log(`${fault.name} [${fault.rule}]: ${verdict}`);

    return verdict;
  });

  const caught = results.filter((verdict) => verdict.startsWith("caught")).length;

  console.log(`\nfaults caught: ${caught} of ${faults.length}`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
