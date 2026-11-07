// Every final-commit gate as one run: bun gates.ts --runtime ../round-14/adapter.ts --round 14 [--out DIR] [--only a,b] [--jobs 8] [--mb 14000]
// Each gate is a job under its own watchdog, longest first, at most `--jobs` slots and `--mb` of declared memory at once (a job that runs
// several processes counts each as a slot, at its measured peak). Each job's verdict is its own exit; this run exits 1 when any job does, as
// running them one after another would. A job the load answered (a time kill, a settle stopped by the clock, an UNKNOWN line under
// FLOW_DEFER_UNKNOWN) is run again alone, with nothing else running, and that answer is the job's.
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { CLOCK_TRIP, watched, type Watched } from "./watch.ts";

const here = import.meta.dir;
const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(k);
  return i < 0 ? d : process.argv[i + 1]!;
};
const runtime = arg("--runtime", "../round-14/adapter.ts");
const round = arg("--round", "14");
const roundDir = dirname(resolve(here, runtime));
const out = resolve(arg("--out", "") || mkdtempSync(join(tmpdir(), "flow-gates-")));
const maxJobs = Math.min(8, Math.max(1, Number(arg("--jobs", "8")) || 8));
const maxMb = Number(arg("--mb", "14000")) || 14000;
const only = arg("--only", "");
const tsc = resolve(here, "../../../../node_modules/.bin/tsc");

// name, command, slots, declared MB (measured peak with margin), expected seconds (measured; orders the queue), limit in seconds
type Job = { name: string; cmd: string[]; slots: number; mb: number; s: number; limit: number };
const rt = ["--runtime", runtime];
const falsify = (part: string, extra: string[] = []) => ["bun", "falsify.ts", ...rt, "--part", part, ...extra];
const LIE_SLICES = 4;
const jobs: Job[] = [
  { name: "suite", cmd: ["bun", "main.ts", "--round", round, ...rt, "--no-search"], slots: 1, mb: 1400, s: 19, limit: 280 },
  { name: "mutate-one", cmd: ["bun", "mutate-one.ts", ...rt], slots: 4, mb: 5000, s: 21, limit: 280 },
  { name: "graph-gate", cmd: ["bun", "graph-gate.ts", ...rt], slots: 1, mb: 2100, s: 17, limit: 280 },
  { name: "falsify suite1", cmd: falsify("suite1"), slots: 1, mb: 1700, s: 26, limit: 290 },
  { name: "falsify suite2", cmd: falsify("suite2"), slots: 1, mb: 1900, s: 58, limit: 290 },
  { name: "falsify suite3", cmd: falsify("suite3"), slots: 1, mb: 1300, s: 21, limit: 290 },
  { name: "falsify tamper", cmd: falsify("tamper"), slots: 1, mb: 600, s: 7, limit: 290 },
  { name: "falsify mutants", cmd: falsify("mutants"), slots: 1, mb: 2000, s: 60, limit: 290 },
  { name: "falsify search", cmd: falsify("search"), slots: 1, mb: 600, s: 40, limit: 290 },
  ...Array.from({ length: LIE_SLICES }, (_, k) => ({ name: `falsify lies ${k + 1}/${LIE_SLICES}`, cmd: falsify("lies", ["--slice", `${k + 1}/${LIE_SLICES}`]), slots: 1, mb: 1500, s: 30, limit: 290 })),
  { name: "lifetime-falsify", cmd: ["bun", "lifetime-falsify.ts", ...rt, "--parallel", "3"], slots: 3, mb: 4200, s: 15, limit: 290 },
  ...readdirSync(join(roundDir, "checks")).filter((f) => f.endsWith(".ts")).sort().map((f) => ({ name: `checks/${f}`, cmd: ["bun", join(roundDir, "checks", f)], slots: 1, mb: 700, s: 4, limit: 200 })),
  { name: "typed tsc", cmd: [tsc, "-p", join(roundDir, "typed/tsconfig.json")], slots: 1, mb: 900, s: 6, limit: 200 },
  { name: "cli pins", cmd: ["bun", join(roundDir, "cli/main.ts")], slots: 1, mb: 600, s: 5, limit: 200 },
];
// checks/types-check.ts writes scratch files into the round's typed/, which the suite's lock walks and typed tsc reads; mutate-one runs it too,
// in this tree. Both run alone, after the rest.
const ALONE = new Set(["mutate-one", "checks/types-check.ts"]);
const chosen = (only ? jobs.filter((j) => only.split(",").some((o) => j.name.startsWith(o))) : jobs).sort((a, b) => b.s - a.s);
mkdirSync(out, { recursive: true });

type Done = { job: Job; r: Watched; again?: string };
const results = new Map<Job, Done>();
const loadOf = (r: Watched) => (r.killed === "time" ? "time" : r.stdout.includes(CLOCK_TRIP) ? "clock" : /^UNKNOWN /m.test(r.stdout) ? "unknown" : undefined);
const runJob = (j: Job, together: boolean) =>
  watched(j.cmd, { rssMb: Math.max(j.mb * 2, 3000), seconds: j.limit, capture: true, cwd: here, ...(together ? { env: { FLOW_DEFER_UNKNOWN: "1" } } : {}) });
const t0 = Date.now();
let slots = 0;
let mb = 0;
const waiting: Array<() => void> = [];
const free = () => {
  for (const w of waiting.splice(0)) w();
};
const pool = chosen.filter((j) => !ALONE.has(j.name));
const queue = [...pool];
const running: Promise<void>[] = [];
const start = (j: Job) => {
  slots += j.slots;
  mb += j.mb;
  running.push(
    runJob(j, true).then((r) => {
      results.set(j, { job: j, r });
      slots -= j.slots;
      mb -= j.mb;
      free();
    }),
  );
};
while (queue.length) {
  const k = queue.findIndex((j) => slots === 0 || (slots + j.slots <= maxJobs && mb + j.mb <= maxMb));
  if (k < 0) {
    await new Promise<void>((r) => waiting.push(r));
    continue;
  }
  start(queue.splice(k, 1)[0]!);
}
await Promise.all(running);
for (const j of chosen.filter((x) => ALONE.has(x.name))) results.set(j, { job: j, r: await runJob(j, false) });
for (const j of chosen) {
  const d = results.get(j)!;
  const why = loadOf(d.r);
  if (why) results.set(j, { job: j, r: await runJob(j, false), again: why });
}
const verdictLine = (s: string) =>
  s.split("\n").filter((l) => /^(SUMMARY|FALSIFY|GRAPH|TYPES|CONTROL|every |\{"killedBy"|.*PASS|.*FAIL)/.test(l)).at(-1)?.slice(0, 160) ?? s.trim().split("\n").at(-1)?.slice(0, 160) ?? "";
let bad = 0;
const rows: string[] = [];
for (const j of chosen) {
  const { r, again } = results.get(j)!;
  const left = loadOf(r);
  if (r.code !== 0 || left) bad++;
  const file = `${j.name.replace(/[^\w.-]+/g, "_")}.txt`;
  writeFileSync(join(out, file), r.stdout);
  rows.push(`${r.code === 0 && !left ? "ok  " : "BAD "} ${j.name.padEnd(24)} exit ${r.code}  ${(r.ms / 1000).toFixed(1).padStart(6)} s  ${String(r.peakMb).padStart(5)} MB${again ? `  (again, alone, after ${again})` : ""}${left ? `  unknown: ${left}` : ""}  ${verdictLine(r.stdout)}`);
}
console.log(rows.join("\n"));
console.log(`\nGATES  ${chosen.length - bad}/${chosen.length} exit 0 in ${((Date.now() - t0) / 1000).toFixed(0)} s; outputs in ${out}`);
process.exitCode = bad ? 1 : 0;
