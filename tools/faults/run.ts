// Shows that Flow State's tests tell a right runtime from a wrong one. In scratch copies of the
// package it runs the tests three ways: unchanged (must pass), with a dead core whose step changes
// nothing (every test should fail), and once per planted fault in tests/faults.ts (at least one
// test should fail). A fault counts as caught only when its run fails and still prints its test
// summary with a failed test: a timeout, output past the buffer, a run with no summary, or one
// whose summary shows no failed test is reported as such and is never caught (tools/faults/verdict.ts,
// checked by verdict.test.ts before every run). It exits 1 when the unchanged tests fail or a fault is missed, stale or not judged,
// so a fault the tests stop catching shows; it is never a CI gate. Faults run four at a time, each
// in its own copy, and each fault's run stops at its first failing test.
//
//   bun tools/faults/run.ts [tests path, default packages/flow-state-v3: its tests and src]
import { execFile } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { type Fault, faults } from "../../packages/flow-state-v3/tests/faults.ts";
import { type Run, summaryOf, verdictOf } from "./verdict.ts";

const repo = resolve(import.meta.dirname, "..", "..");
const pkg = "packages/flow-state-v3";
const tests = process.argv[2] ?? pkg;
const skipped = new Set(["node_modules", "prototypes"]);
const WORKERS = 4;
const RUN_MS = 240_000;
const BUFFER = 256 * 1024 * 1024;

type Edit = Fault["edits"][number];


const makeCopy = () => {
  const root = mkdtempSync(join(tmpdir(), "flow-faults-"));

  cpSync(resolve(repo, pkg), join(root, pkg), { recursive: true, filter: (file) => !skipped.has(basename(file)) });
  writeFileSync(
    join(root, "vite.config.ts"),
    'import { defineConfig } from "vite-plus";\nexport default defineConfig({ test: { include: ["packages/**/*.test.ts"] } });\n',
  );
  writeFileSync(join(root, "package.json"), '{ "name": "scratch", "private": true, "type": "module", "workspaces": ["packages/*"] }\n');
  cpSync(resolve(repo, "tsconfig.base.json"), join(root, "tsconfig.base.json"));
  symlinkSync(resolve(repo, "node_modules"), join(root, "node_modules"));

  return root;
};

const run = (root: string, reporter: ReadonlyArray<string> = []) =>
  new Promise<Run>((done) => {
    execFile(
      resolve(repo, "node_modules/.bin/vp"),
      ["test", "run", tests, ...reporter],
      { cwd: root, encoding: "utf8", timeout: RUN_MS, maxBuffer: BUFFER },
      (error, stdout, stderr) => {
        const out = `${stdout}${stderr}`;
        const failed = error as (Error & { readonly killed?: boolean; readonly code?: number | string }) | null;

        if (failed?.killed === true) return done({ kind: "broken", why: `timed out after ${RUN_MS} ms` });

        if (failed?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") return done({ kind: "broken", why: "output passed the buffer" });

        done({ kind: "ran", passed: failed === null, out });
      },
    );
  });

// Applies the edits in one copy, runs the body, and puts the files back. Returns false when an
// edit's path leaves the copy or its text is not in its file exactly once, so a stale fault is
// reported and never passes for caught.
const planted = async (root: string, edits: ReadonlyArray<Edit>, body: () => Promise<void>) => {
  const copy = join(root, pkg);

  if (edits.some((edit) => relative(copy, resolve(copy, edit.file)).startsWith(".."))) return false;

  const originals = edits.map((edit) => ({
    edit,
    path: join(copy, edit.file),
    text: readFileSync(join(copy, edit.file), "utf8"),
  }));

  if (originals.some(({ edit, text }) => text.split(edit.find).length !== 2)) return false;

  for (const { edit, path, text } of originals) writeFileSync(path, text.replace(edit.find, () => edit.replace));

  try {
    await body();
  } finally {
    for (const { path, text } of originals) writeFileSync(path, text);
  }

  return true;
};

const DEAD_CORE: Edit = {
  file: "src/core/step.ts",
  find: "  const tx = makeTx(machines, world0, env);",
  replace: "  if (machines.size >= 0) return { world: world0, commands: [], evidence: [] };\n  const tx = makeTx(machines, world0, env);",
};

// Tests a dead core may leave green: a contract test of a port fake runs no core, an inverted
// test, titled by the rule it breaks ("Turn I9: ..."), passes on any failure, and a CLI test
// compares the CLI with a direct run of the same core, so a dead core changes both sides; the CLI's
// own faults are planted in tests/tooling-faults.ts. A test beside the code in src/ tests a part
// other than the step (the lane table, the platform's seed, the bootstrap), which the dead core
// leaves alone.
const mayStayGreen = [
  /\.contract\.test\.ts > /u,
  / > [A-Z][A-Za-z]+ [RIT]\d+: /u,
  /tests\/cli\/[^ ]+\.test\.ts > /u,
  /flow-state-v3\/src\/[^ ]+\.test\.ts > /u,
];

const deadCore = async (root: string) => {
  const ok = await planted(root, [DEAD_CORE], async () => {
    const result = await run(root, ["--reporter=verbose"]);

    if (result.kind === "broken") {
      console.log(`dead core: NOT JUDGED (${result.why})`);
      process.exitCode = 1;

      return;
    }

    const green = result.out.split("\n").filter((line) => line.includes("✓"));
    const unexplained = green.filter((line) => !mayStayGreen.some((allowed) => allowed.test(line)));

    console.log(`dead core: ${summaryOf(result.out) ?? "no test summary"}; still green: ${green.length}`);

    for (const line of green) console.log(`  ${unexplained.includes(line) ? "UNEXPLAINED " : ""}${line.trim()}`);

    if (unexplained.length > 0 || summaryOf(result.out) === undefined) process.exitCode = 1;
  });

  if (!ok) {
    console.log("dead core: STALE, the edit no longer applies to src/core/step.ts");
    process.exitCode = 1;
  }
};

const plantAll = async (roots: ReadonlyArray<string>) => {
  const verdicts = new Map<string, string>();
  const queue = [...faults];

  const worker = async (root: string) => {
    for (let fault = queue.shift(); fault !== undefined; fault = queue.shift()) {
      let verdict = "STALE";
      const given = fault;

      // oxlint-disable-next-line no-await-in-loop -- one fault at a time per copy
      await planted(root, given.edits, async () => {
        // A fault is caught by its first failing test, so a run stops there.
        verdict = verdictOf(await run(root, ["--bail=1"]));

        // A stopped run can lose its failed test's report; the whole run then judges.
        if (verdict === "NOT JUDGED (no failed test)") verdict = verdictOf(await run(root));
      });
      verdicts.set(given.name, verdict);
      console.log(`${given.name} [${given.rule}]: ${verdict}`);
    }
  };

  await Promise.all([deadCore(roots[0] ?? ""), ...roots.slice(1).map(worker)]);
  await worker(roots[0] ?? "");

  const caught = [...verdicts.values()].filter((verdict) => verdict.startsWith("caught")).length;

  console.log(`\nfaults caught: ${caught} of ${faults.length}`);

  if (caught < faults.length) process.exitCode = 1;
};

const roots = Array.from({ length: WORKERS }, makeCopy);

try {
  const control = await run(roots[0] ?? "");
  const passed = control.kind === "ran" && control.passed && summaryOf(control.out) !== undefined;

  console.log(`unchanged: ${passed ? "pass" : "FAIL"} (${control.kind === "ran" ? (summaryOf(control.out) ?? "no test summary") : control.why})`);

  if (passed) await plantAll(roots);
  else {
    if (control.kind === "ran") console.log(control.out.slice(-2000));
    process.exitCode = 1;
  }
} finally {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
}
