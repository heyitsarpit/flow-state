// Shows that Flow State's tests tell a right runtime from a wrong one. In scratch copies of the
// package it runs the tests three ways: unchanged (must pass), with a dead core whose step changes
// nothing (every test should fail), and once per planted fault in tests/faults.ts (at least one
// test should fail). The unchanged run and the dead core run the whole suite, stress files
// included. A fault runs its own target tests first and the whole suite only when they let it
// through, so its verdict is the whole suite's whenever the targets miss. A fault counts as caught
// only when its run fails and still prints its test summary with a failed test: a timeout, output
// past the buffer, a run with no summary, or one whose summary shows no failed test is reported as
// such and is never caught (tools/faults/verdict.ts, checked by verdict.test.ts before every run).
// The unchanged run goes first, and a test red there never counts as a fault's catch.
// It exits 1 when the unchanged tests fail, a fault is missed, stale or not judged, or a target
// file is missing, so a fault the tests stop catching shows; it is never a CI gate. Copies sized
// to the cores and memory (below) run at once, each its own scratch directory, removed at the
// end, on failure, or when the run is stopped.
//
// `--only <name...>` plants just the named faults, for iterating on a Task's own rules: no dead
// core, and the unchanged run covers only their target files, to find the tests already red there.
// An unknown name is refused.
//
// FLOW_FAULTS_EVERY_CATCH=true lists every catching test, to tell which faults give the same
// signal: a fault's target run then covers the target files of every fault of its rule and does
// not stop at its first failing test. A fault the targets miss is still judged by the whole suite,
// stopping at its first failing test, so its list is partial.
//
// `--background` runs at the lowest CPU priority (nice 19, which every test run it starts
// inherits) on 2 copies x 2 workers, so it blocks no other work, and writes everything it prints to
// a file in the system's temp directory as well as stdout; the first line names the file.
//
//   bun tools/faults/run.ts [--only <name...>] [--background]
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { availableParallelism, setPriority, tmpdir, totalmem } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { type Fault, faults as allFaults } from "../../packages/flow-state-v3/tests/faults.ts";
import { runGrouped, stopAll, stopOnSignals } from "./group.ts";
import { applyEdits, credited, failedTestsOf, parseArgs, redsKnown, type Run, summaryOf, verdictOf } from "./verdict.ts";

const asked = parseArgs(allFaults, process.argv.slice(2));

if ("refused" in asked) {
  console.error(`faults: ${asked.refused}`);
  process.exit(2);
}

const { faults, only, background } = asked;

if (background) {
  const log = join(tmpdir(), `flow-faults-${new Date().toISOString().replaceAll(":", "-")}.log`);
  const print = console.log;
  const tee = (line: unknown) => {
    print(line);
    appendFileSync(log, `${String(line)}\n`);
  };

  setPriority(19);
  writeFileSync(log, "");
  console.log = tee;
  console.error = tee;
  console.log(`faults: in the background at nice 19, 2 copies x 2 workers; verdict also in ${log}`);
}

const repo = resolve(import.meta.dirname, "..", "..");
const pkg = "packages/flow-state-v3";
const skipped = new Set(["node_modules", "prototypes"]);
// Each copy runs vitest with WORKERS workers, and copies x workers is about the core count, so a
// run is never starved into its timeout. A worker peaks near 2 GiB (the deep-value tests, measured
// with `/usr/bin/time -l`), so memory bounds the copies too. Two at least: the unchanged run and
// the dead core.
const WORKERS = background ? 2 : 3;
const WORKER_PEAK = 2 * 1024 ** 3;
const COPIES = background ? 2 : Math.max(
  only ? 1 : 2,
  Math.min(Math.floor(availableParallelism() / WORKERS), Math.floor(totalmem() / (WORKERS * WORKER_PEAK))),
);
// One tier's run, timed out past this: the slowest whole tier measured under the run's own load
// is 152 s (a whole stress tier), so 240 s leaves about half again.
// At nice 19 on fewer workers a tier may wait behind other work, so the background run allows 600 s.
const RUN_MS = background ? 600_000 : 240_000;
const FAILS_REPORTER = resolve(import.meta.dirname, "fails-reporter.ts");
const EXPECTED_FAIL = "expected fail: ";
// What one run may print: the most measured is 7.2 MiB (the dead core's verbose usual tier); the
// buffer only holds what is printed, so a large margin costs nothing until a run needs it.
const BUFFER = 256 * 1024 * 1024;
const EVERY_CATCH = process.env["FLOW_FAULTS_EVERY_CATCH"] === "true";

type Edit = Fault["edits"][number];

const roots: Array<string> = [];

const cleanUp = () => {
  stopAll();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
};

stopOnSignals(cleanUp);

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
      "// The plants' own check reads the planted text, so it would fail for every fault planted.",
      'const plants = "packages/flow-state-v3/tests/faults.test.ts";',
      "export default defineConfig({",
      "  test: {",
      '    include: [tier === "stress" ? stress : "packages/**/*.test.ts"],',
      '    exclude: [...configDefaults.exclude, plants, ...(tier === "usual" ? [stress] : [])],',
      "    // Type tests run as the default suite runs them, so a fault in a type is caught by its type test.",
      "    typecheck: {",
      '      enabled: tier !== "stress",',
      '      include: ["packages/flow-state-v3/**/*.test-d.ts"],',
      '      tsconfig: "packages/flow-state-v3/tsconfig.json",',
      "    },",
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
const runTier = async (root: string, files: ReadonlyArray<string>, tier: "all" | "usual" | "stress", flags: ReadonlyArray<string>): Promise<Run> => {
  const paths = files.length === 0 ? [pkg] : files.map((file) => join(pkg, file));
  const ended = await runGrouped(
    resolve(repo, "node_modules/.bin/vp"),
    ["test", "run", ...paths, `--maxWorkers=${WORKERS}`, ...flags],
    { cwd: root, timeoutMs: RUN_MS, maxBuffer: BUFFER, env: { ...process.env, FLOW_FAULTS_TIER: tier } },
  );

  if (ended.timedOut) return { kind: "broken", why: `timed out after ${RUN_MS} ms` };

  if (ended.overflow) return { kind: "broken", why: "output passed the buffer" };

  return { kind: "ran", passed: ended.code === 0, out: ended.out };
};

// Prints how long a whole tier ran and how much it printed, the sizes RUN_MS and BUFFER are set from.
const timed = async (tier: string, body: () => Promise<Run>) => {
  const start = performance.now();
  const ran = await body();
  const size = ran.kind === "ran" ? `${Math.ceil(ran.out.length / 1024)} KiB` : ran.why;

  console.log(`  whole ${tier} tier: ${Math.round((performance.now() - start) / 1000)} s, ${size}`);

  return ran;
};

// Runs the given test files of a copy, or its whole suite when none are given: the usual tests,
// then the stress files, each its own run under its own timeout, as `nub run test` and
// `nub run test:stress` are. A bailing run stops after a tier that failed.
const run = async (root: string, files: ReadonlyArray<string>, flags: ReadonlyArray<string> = []): Promise<Run> => {
  if (files.length > 0) return runTier(root, files, "all", flags);
  const usual = await timed("usual", () => runTier(root, [], "usual", flags));

  if (usual.kind === "broken" || (!usual.passed && flags.includes("--bail=1"))) return usual;
  const stress = await timed("stress", () => runTier(root, [], "stress", flags));

  if (stress.kind === "broken") return { kind: "broken", why: `stress files ${stress.why}` };

  return { kind: "ran", passed: usual.passed && stress.passed, out: `${usual.out}\n${stress.out}` };
};

// The tests red in the unchanged run, and the files it covered: a fault is caught only by a test
// outside them. A run judged over files the unchanged run did not cover (a `--only` fault's
// whole-suite fallback) first runs the unchanged whole suite once, in a copy of its own.
let knownRed: ReadonlySet<string> = new Set();
let unchangedFiles: ReadonlyArray<string> | "whole" = "whole";
let wholeUnchanged: Promise<boolean> | undefined;

const unchangedWhole = () => {
  wholeUnchanged ??= (async () => {
    const result = await run(makeCopy(), []);

    if (result.kind === "broken") return false;
    knownRed = new Set([...knownRed, ...failedTestsOf(result.out)]);
    unchangedFiles = "whole";
    console.log(`unchanged whole suite, for a fallback: ${summaryOf(result.out) ?? "no test summary"}`);

    return true;
  })();

  return wholeUnchanged;
};

// A fault's verdict over some files, where a test red in the unchanged run never counts as the
// catch. The run stops at its first failing test unless one of its files holds such a test, and a
// stopped run that lost its failed test's report runs again whole.
const judged = async (root: string, files: ReadonlyArray<string>, everyCatch = false) => {
  if (!redsKnown(unchangedFiles, files.length === 0 ? "whole" : files) && !(await unchangedWhole()))
    return { verdict: "NOT JUDGED (the unchanged whole suite did not finish)", tests: [] };
  const paths = new Set(files.map((file) => join(pkg, file)));
  const mayBail = !everyCatch && ![...knownRed].some((test) => files.length === 0 || paths.has(test.split(" > ")[0] ?? ""));
  const first = await run(root, files, mayBail ? ["--bail=1"] : []);
  const result = verdictOf(first) === "NOT JUDGED (no failed test)" ? await run(root, files) : first;

  return credited(verdictOf(result), result.kind === "ran" ? failedTestsOf(result.out) : [], knownRed);
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
  /tests\/compile\/(construction|compiled|schedule-send)\.test\.ts > /u,
  // Also static, each running no step: the closed code list and a constant's data view.
  /tests\/compile\/codes\.test\.ts > the closed code list [^>]*> Diagnostics R7: the public union/u,
  /tests\/compile\/deep-constants\.test\.ts > [^>]+> Codec R1, Inspection: the machine's data view/u,
  // A fixture written wrong is refused when its machine is built, before any Runtime.
  / > [^>]* written wrong is refused at construction [^>]*> /u,
  // An ensure, create or name refused at admission, before the step: an input with no encoded
  // form, a foreign ref, a missing context provider.
  /tests\/actors\/identity\.test\.ts > [^>]+> Actors R(6, I9: an input that type-checks|6: createActor checks its input|24: a ref of a machine this Runtime's app does not run)/u,
  /tests\/restore\/deep-inputs\.test\.ts > [^>]+> Codec R4: a name with no JSON text/u,
  // A step of another app's Story is refused before the step runs.
  /tests\/stories\/foreign\.test\.ts > [^>]+> Actors R24: steps of another app's Story are refused/u,
  /tests\/session\/workspace\.test\.ts > [^>]+> S7, Actors R18, Stories R3: a Story's ensure of a status with no team/u,
  // The run rules over crafted runs: the oracle judged with no core, each rule seen firing.
  /tests\/rules\/rules\.test\.ts > run rules over (crafted runs|the fake store's batches|crafted runs, each rule seen firing) > /u,
  // The fixtures' registration and the bench's declarations, statistics and history: no step.
  /tests\/generated\/manifests\.test\.ts > (every fixture registers one manifest|sample-set ids) /u,
  /tests\/bench\/declare\.test\.ts > bench (declarations|tiers|subjects|statistics|history) > /u,
  /tests\/bench\/proofs\.stress\.test\.ts > bench proofs > every manifest's saved stress Story has a turn bench/u,
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

  const targets = EVERY_CATCH
    ? [...new Set(allFaults.filter((other) => other.rule === fault.rule).flatMap((other) => other.tests))]
    : fault.tests;

  await planted(root, fault.edits, async () => {
    const targeted = await judged(root, targets, EVERY_CATCH);

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

  // The unchanged run comes first, beside the dead core, so every fault is judged against it. With
  // `--only` there is no dead core, and the unchanged run covers the named faults' targets.
  const dead = only ? Promise.resolve() : deadCore(deadRoot);
  const targets = [...new Set(faults.flatMap((fault) => fault.tests))];
  const result = await run(controlRoot, only ? targets : []);

  unchangedFiles = only ? targets : "whole";
  const passed = result.kind === "ran" && result.passed && summaryOf(result.out) !== undefined;

  console.log(`unchanged: ${passed ? "pass" : "FAIL"} (${result.kind === "ran" ? (summaryOf(result.out) ?? "no test summary") : result.why})`);

  if (result.kind === "ran") knownRed = new Set(failedTestsOf(result.out));

  for (const test of knownRed) console.log(`  ${test}`);

  if (result.kind === "broken") {
    await dead;
    console.log("\nfaults not judged: the unchanged run did not finish");
    process.exitCode = 1;

    return;
  }

  await Promise.all([worker(controlRoot), ...(deadRoot === "" ? [] : [dead.then(() => worker(deadRoot))]), ...rest.map(worker)]);

  const caught = [...verdicts.values()].filter((verdict) => verdict.startsWith("caught")).length;

  console.log(`\nfaults caught: ${caught} of ${faults.length}; ${wholeSuite} needed the whole suite`);

  if (!passed) console.log(`the unchanged run fails ${knownRed.size} tests; no fault is credited with them`);

  if (!passed || caught < faults.length) process.exitCode = 1;
};

try {
  for (let n = 0; n < Math.min(COPIES, only ? faults.length : COPIES); n += 1) makeCopy();
  await plantAll();
} finally {
  cleanUp();
}
