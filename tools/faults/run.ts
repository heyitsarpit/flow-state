// Shows that Flow State's tests tell a right runtime from a wrong one. In scratch copies of the
// package it runs the tests three ways: unchanged (must pass), with a dead core whose step changes
// nothing (every test should fail), and once per planted fault in tests/faults.ts (at least one
// test should fail). The unchanged run and the dead core run the whole suite, stress files
// included. A fault runs its own target tests first and the whole suite only when they let it
// through, so its verdict is the whole suite's whenever the targets miss. A fault counts as caught
// only when its run fails and still prints its test summary with a failed test: a timeout, output
// past the buffer, a run with no summary, or one whose summary shows no failed test is reported as
// such and is never caught (tools/faults/verdict.ts, checked by verdict.test.ts before every run).
// It exits 1 when the unchanged tests fail, a fault is missed, stale or not judged, or a target
// file is missing, so a fault the tests stop catching shows; it is never a CI gate. Copies sized
// to the cores and memory (below) run at once, each its own scratch directory, removed at the
// end, on failure, or when the run is stopped.
//
//   bun tools/faults/run.ts
import { type ChildProcess, execFile } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir, totalmem } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { type Fault, faults } from "../../packages/flow-state-v3/tests/faults.ts";
import { applyEdits, failedTestsOf, type Run, summaryOf, verdictOf } from "./verdict.ts";

const repo = resolve(import.meta.dirname, "..", "..");
const pkg = "packages/flow-state-v3";
const skipped = new Set(["node_modules", "prototypes"]);
// Each copy runs vitest with WORKERS workers, and copies x workers is about the core count, so a
// run is never starved into its timeout. A worker peaks near 2 GiB (the deep-value tests, measured
// with `/usr/bin/time -l`), so memory bounds the copies too. Two at least: the unchanged run and
// the dead core.
const WORKERS = 3;
const WORKER_PEAK = 2 * 1024 ** 3;
const COPIES = Math.max(
  2,
  Math.min(Math.floor(availableParallelism() / WORKERS), Math.floor(totalmem() / (WORKERS * WORKER_PEAK))),
);
const RUN_MS = 240_000;
const FAILS_REPORTER = resolve(import.meta.dirname, "fails-reporter.ts");
const EXPECTED_FAIL = "expected fail: ";
const BUFFER = 256 * 1024 * 1024;

type Edit = Fault["edits"][number];

const children = new Set<ChildProcess>();
const roots: Array<string> = [];

const cleanUp = () => {
  for (const child of children) child.kill("SIGKILL");
  for (const root of roots) rmSync(root, { recursive: true, force: true });
};

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
  process.on(signal, () => {
    cleanUp();
    process.exit(130);
  });

const makeCopy = () => {
  const root = mkdtempSync(join(tmpdir(), "flow-faults-"));

  roots.push(root);
  cpSync(resolve(repo, pkg), join(root, pkg), { recursive: true, filter: (file) => !skipped.has(basename(file)) });
  writeFileSync(
    join(root, "vite.config.ts"),
    [
      'import { configDefaults, defineConfig } from "vite-plus";',
      "// FLOW_FAULTS_TIER picks the usual tests or the stress files; named files run in either.",
      'const tier = process.env["FLOW_FAULTS_TIER"];',
      'const stress = "packages/**/*.stress.test.ts";',
      "export default defineConfig({",
      "  test: {",
      '    include: [tier === "stress" ? stress : "packages/**/*.test.ts"],',
      '    exclude: [...configDefaults.exclude, ...(tier === "usual" ? [stress] : [])],',
      "  },",
      "});",
      "",
    ].join("\n"),
  );
  // The workspace's scripts too: the tooling benches' proofs check that `nub run` lists them.
  const { scripts } = JSON.parse(readFileSync(resolve(repo, "package.json"), "utf8")) as { readonly scripts: unknown };
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({ name: "scratch", private: true, type: "module", workspaces: ["packages/*"], scripts }, null, 2)}\n`,
  );
  cpSync(resolve(repo, "tsconfig.base.json"), join(root, "tsconfig.base.json"));
  symlinkSync(resolve(repo, "node_modules"), join(root, "node_modules"));

  return root;
};

// Runs some test files of a copy, or the whole tree when none are given, in one tier.
const runTier = (root: string, files: ReadonlyArray<string>, tier: "all" | "usual" | "stress", flags: ReadonlyArray<string>) =>
  new Promise<Run>((done) => {
    const paths = files.length === 0 ? [pkg] : files.map((file) => join(pkg, file));
    const child = execFile(
      resolve(repo, "node_modules/.bin/vp"),
      ["test", "run", ...paths, `--maxWorkers=${WORKERS}`, ...flags],
      { cwd: root, encoding: "utf8", timeout: RUN_MS, maxBuffer: BUFFER, env: { ...process.env, FLOW_FAULTS_TIER: tier } },
      (error, stdout, stderr) => {
        children.delete(child);
        const out = `${stdout}${stderr}`;
        const failed = error as (Error & { readonly killed?: boolean; readonly code?: number | string }) | null;

        if (failed?.killed === true) return done({ kind: "broken", why: `timed out after ${RUN_MS} ms` });

        if (failed?.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") return done({ kind: "broken", why: "output passed the buffer" });

        done({ kind: "ran", passed: failed === null, out });
      },
    );

    children.add(child);
  });

// Runs the given test files of a copy, or its whole suite when none are given: the usual tests,
// then the stress files, each its own run under its own timeout, as `nub run test` and
// `nub run test:stress` are. A bailing run stops after a tier that failed.
const run = async (root: string, files: ReadonlyArray<string>, flags: ReadonlyArray<string> = []): Promise<Run> => {
  if (files.length > 0) return runTier(root, files, "all", flags);
  const usual = await runTier(root, [], "usual", flags);

  if (usual.kind === "broken" || (!usual.passed && flags.includes("--bail=1"))) return usual;
  const stress = await runTier(root, [], "stress", flags);

  if (stress.kind === "broken") return { kind: "broken", why: `stress files ${stress.why}` };

  return { kind: "ran", passed: usual.passed && stress.passed, out: `${usual.out}\n${stress.out}` };
};

// A fault's verdict over some files: the run stops at its first failing test, and a stopped run
// that lost its failed test's report runs again whole.
const judged = async (root: string, files: ReadonlyArray<string>) => {
  const first = await run(root, files, ["--bail=1"]);
  const result = verdictOf(first) === "NOT JUDGED (no failed test)" ? await run(root, files) : first;

  return { verdict: verdictOf(result), tests: result.kind === "ran" ? failedTestsOf(result.out) : [] };
};

// Applies the edits in one copy, runs the body, and puts the files back. Returns false when an
// edit's path leaves the copy or its text is not in its file exactly once, so a stale fault is
// reported and never passes for caught.
const planted = async (root: string, edits: ReadonlyArray<Edit>, body: () => Promise<void>) => {
  const copy = join(root, pkg);

  if (edits.some((edit) => relative(copy, resolve(copy, edit.file)).startsWith(".."))) return false;

  const files = [...new Set(edits.map((edit) => edit.file))].map((file) => {
    const path = join(copy, file);
    const text = readFileSync(path, "utf8");

    return { path, text, planted: applyEdits(text, edits.filter((edit) => edit.file === file)) };
  });

  if (files.some((f) => f.planted === undefined)) return false;

  for (const { path, planted } of files) writeFileSync(path, planted ?? "");

  try {
    await body();
  } finally {
    for (const { path, text } of files) writeFileSync(path, text);
  }

  return true;
};

const DEAD_CORE: Edit = {
  file: "src/core/step.ts",
  find: "  const tx = makeTx(machines, world0, env);",
  replace: "  if (machines.size >= 0) return { world: world0, commands: [], evidence: [] };\n  const tx = makeTx(machines, world0, env);",
};

// Tests a dead core may leave green: a contract test of a port fake runs no core, and a CLI test
// compares the CLI with a direct run of the same core, so a dead core changes both sides; the CLI's
// own faults are planted in tests/tooling-faults.ts. A test beside the code in src/ tests a part
// other than the step (the lane table, the platform's seed, the bootstrap), which the dead core
// leaves alone. A gap marker declared with `it.fails` passes on any failure; fails-reporter.ts
// names each, and they are counted apart.
const mayStayGreen = [
  /\.contract\.test\.ts > /u,
  /tests\/cli\/[^ ]+\.test\.ts > /u,
  /flow-state-v3\/src\/[^ ]+\.test\.ts > /u,
  // Reads the package's source and runs no core: who builds reports, rows and writes, and names.
  /tests\/write-lanes\/one-builder\.test\.ts > /u,
  // The compiler and the Runtime's check of a Compiled run no step; their own faults are planted
  // in tests/structure-faults.ts. A compile test that runs a turn lives elsewhere.
  /tests\/compile\/(construction|compiled)\.test\.ts > /u,
];

const deadCore = async (root: string) => {
  const ok = await planted(root, [DEAD_CORE], async () => {
    const result = await run(root, [], ["--reporter=verbose", `--reporter=${FAILS_REPORTER}`]);

    if (result.kind === "broken") {
      console.log(`dead core: NOT JUDGED (${result.why})`);
      process.exitCode = 1;

      return;
    }

    const lines = result.out.split("\n");
    const markers = new Set(lines.flatMap((line) => (line.startsWith(EXPECTED_FAIL) ? [line.slice(EXPECTED_FAIL.length)] : [])));
    const marker = (line: string) => markers.has(line.trim().replace(/^✓ /u, "").replace(/ \d+ms$/u, ""));
    const green = lines.filter((line) => line.includes("✓") && !marker(line));
    const unexplained = green.filter((line) => !mayStayGreen.some((allowed) => allowed.test(line)));

    console.log(
      `dead core: ${summaryOf(result.out) ?? "no test summary"}; still green: ${green.length}, besides ${markers.size} it.fails gap markers`,
    );

    for (const line of green) console.log(`  ${unexplained.includes(line) ? "UNEXPLAINED " : ""}${line.trim()}`);

    if (unexplained.length > 0 || summaryOf(result.out) === undefined) process.exitCode = 1;
  });

  if (!ok) {
    console.log("dead core: STALE, the edit no longer applies to src/core/step.ts");
    process.exitCode = 1;
  }
};

// A fault's verdict: its target tests first, the whole suite when they let it through.
const verdictFor = async (root: string, fault: Fault) => {
  const missing = fault.tests.filter((file) => !existsSync(join(repo, pkg, file)));

  if (fault.tests.length === 0 || missing.length > 0)
    return { verdict: `STALE (target tests missing: ${missing.join(", ") || "none named"})`, by: "", tests: [] };

  let outcome = { verdict: "STALE", by: "", tests: [] as ReadonlyArray<string> };

  await planted(root, fault.edits, async () => {
    const targeted = await judged(root, fault.tests);

    outcome = targeted.verdict.startsWith("caught")
      ? { ...targeted, by: "targets" }
      : { ...(await judged(root, [])), by: `whole suite; targets ${targeted.verdict}` };
  });

  return outcome;
};

const plantAll = async () => {
  const verdicts = new Map<string, string>();
  const queue = [...faults];
  let wholeSuite = 0;

  const worker = async (root: string) => {
    for (let fault = queue.shift(); fault !== undefined; fault = queue.shift()) {
      // oxlint-disable-next-line no-await-in-loop -- one fault at a time per copy
      const { verdict, by, tests } = await verdictFor(root, fault);

      if (by.startsWith("whole")) wholeSuite += 1;
      verdicts.set(fault.name, verdict);
      console.log(`${fault.name} [${fault.rule}]: ${verdict}${by === "" ? "" : ` by ${by}`}`);

      for (const test of tests) console.log(`  ${test}`);
    }
  };

  const [controlRoot = "", deadRoot = "", ...rest] = roots;

  const control = (async () => {
    const result = await run(controlRoot, []);
    const passed = result.kind === "ran" && result.passed && summaryOf(result.out) !== undefined;

    console.log(`unchanged: ${passed ? "pass" : "FAIL"} (${result.kind === "ran" ? (summaryOf(result.out) ?? "no test summary") : result.why})`);

    if (!passed && result.kind === "ran") for (const test of failedTestsOf(result.out)) console.log(`  ${test}`);

    await worker(controlRoot);

    return passed;
  })();

  const [passed] = await Promise.all([control, deadCore(deadRoot).then(() => worker(deadRoot)), ...rest.map(worker)]);

  const caught = [...verdicts.values()].filter((verdict) => verdict.startsWith("caught")).length;

  if (!passed) {
    console.log("\nfaults not judged: the unchanged tests fail");
    process.exitCode = 1;

    return;
  }

  console.log(`\nfaults caught: ${caught} of ${faults.length}; ${wholeSuite} needed the whole suite`);

  if (caught < faults.length) process.exitCode = 1;
};

try {
  for (let n = 0; n < COPIES; n += 1) makeCopy();
  await plantAll();
} finally {
  cleanUp();
}
