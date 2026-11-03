// One mutant's run, or the control: the round's gates in order, stopping at the first that kills. Prints one JSON line. Spawned by mutate.ts.
// D101: suite, `--swap`, typed compare and date check, CLI pins, the 5 s gate. These are what the round claims, so they are what a mutant must get past. `killedBy` says which.
// A search runs only with `--search`, directed, by a state budget and no deadline that matters, so its answer does not depend on how busy the machine is. Round 8 found why searches
// killed nothing and why three kills did not reproduce: RESULTS. A search hunts new traces; it is not a regression gate.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { makeHarness } from "./drive.ts";
import type { RuntimeModule } from "./harness.ts";
import { searchFlush } from "./search/flush.search.ts";

const i = process.argv.indexOf("--runtime");
const runtimeArg = process.argv[i + 1]!;
const round = resolve(import.meta.dir, dirname(runtimeArg));
const mod = (await import(resolve(import.meta.dir, runtimeArg))) as RuntimeModule;
const make = makeHarness(mod.port);
const failed = (out: string) =>
  out
    .split("\n")
    .filter((l) => l.startsWith("FAIL"))
    .map((l) => l.slice(4).split("\t")[0]!.trim());
const spawn = (...cmd: string[]) => {
  const p = Bun.spawnSync(["bun", ...cmd], { cwd: import.meta.dir, env: process.env });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
};

const done = (killedBy: string | null, killers: readonly string[], search = "not run") => {
  console.log(JSON.stringify({ killedBy, killers, search }));
  process.exit(0);
};
// Round 8's question: what does a search see on its own? No scenario first, so a mutant a scenario would kill still reaches it. By a state budget, so a busy machine changes nothing.
if (process.argv.includes("--search-only")) {
  const o = { depth: 12, maxStates: 3_000, deadlineMs: 100_000 };
  const a = searchFlush(make, "serialize", o, false, false, "store");
  const q = a.verdict === "failed" ? a : searchFlush(make, "serialize", o, false, false, "queue");
  const b = q.verdict === "failed" ? q : searchFlush(make, "bare", o, true);
  done(b.verdict === "failed" ? "search" : null, b.verdict === "failed" ? [b.failure ?? ""] : [], b.verdict);
}
// D134: named oracles first. A mutant killed only by whole output is reported apart, since output notices anything that changes.
// A child, so its memory is gone before the next gate: D129 sees the tree, and two suites at once pass the limit.
const first = spawn("main.ts", "--round", "99", "--no-catalog", "--runtime", runtimeArg);
if (!first.out.includes("SUMMARY")) done("crash", [first.err.slice(0, 200) || first.out.slice(-200)]);
const failing = first.out.split("\n").filter((l) => l.startsWith("FAIL"));
const suite = failing.filter((l) => !l.split("\t")[1]?.startsWith("output:")).map((l) => l.slice(4).split("\t")[0]!.trim());
if (suite.length) done("suite", suite);
const outputOnly = failing.map((l) => l.slice(4).split("\t")[0]!.trim());
if (existsSync(join(round, "typed/swaps.ts"))) {
  const s = spawn("main.ts", "--round", "99", "--no-catalog", "--swap", join(round, "typed/swaps.ts"), "--runtime", runtimeArg);
  if (failed(s.out).length || !s.out.includes("SUMMARY")) done("swap", failed(s.out).length ? failed(s.out) : ["could not run"]);
  for (const f of ["typed/compare.ts", "typed/date-check.ts"]) {
    const t = spawn(join(round, f));
    if (t.code !== 0) done(f, [t.out.split("\n").filter((l) => /FAIL|differ/i.test(l))[0] ?? `exit ${t.code}`]);
  }
}
if (existsSync(join(round, "cli/main.ts"))) {
  const c = spawn(join(round, "cli/main.ts"));
  if (c.code !== 0) done("cli", failed(c.out).length ? c.out.split("\n").filter((l) => l.startsWith("FAIL")).map((l) => l.slice(6, 70)) : [`exit ${c.code}`]);
}
const g = spawn("gate5s.ts", "--runtime", runtimeArg);
if (g.code !== 0) done("gate", [g.out.trim().slice(0, 300) || g.err.slice(0, 200)]);
if (outputOnly.length) done("output", outputOnly);
if (process.argv.includes("--search")) {
  const r = searchFlush(make, "serialize", { depth: 11, maxStates: 8_000, deadlineMs: 100_000 }, false, false, "store");
  if (r.verdict === "failed") done("search", [r.failure ?? ""], r.verdict);
  done(null, [], r.verdict);
}
done(null, []);
