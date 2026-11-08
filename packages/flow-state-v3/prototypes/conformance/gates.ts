// Every final-commit gate as one run: bun gates.ts --runtime ../round-14/adapter.ts --round 14 [--out DIR] [--only a,b] [--jobs 8] [--mb 16000] [--budget 600]
// Each gate is a job in its own copy of one snapshot, under its own watchdog, longest first, at most `--jobs` slots and `--mb` of kill
// limits at once. Each job's verdict is its stated one (verdicts/). A job the machine answered (a time kill, a memory kill near its limit, a
// signal, a broken contract) is unknown, and is run once more alone, inside the budget; whatever is still unknown is red.
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { stated } from "./verdicts/state.ts";

const here = import.meta.dir;
const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(k);
  return i < 0 ? d : process.argv[i + 1]!;
};
const runtime = arg("--runtime", "../round-14/adapter.ts");
const round = arg("--round", "14");
const roundDir = dirname(resolve(here, runtime));
const tree = basename(roundDir);
const out = resolve(arg("--out", "") || mkdtempSync(join(tmpdir(), "flow-gates-")));
const maxJobs = Math.min(8, Math.max(1, Number(arg("--jobs", "8")) || 8));
const maxMb = Number(arg("--mb", "16000")) || 16000;
const budgetS = Number(arg("--budget", "600")) || 600;
const only = arg("--only", "");

type Dirs = { readonly conf: string; readonly round: string };
// name, the gate its child states, command (in the job's copy), slots, measured peak MB (packing and the memory reference), measured alone
// seconds (orders the queue, sizes the alone rerun), first-attempt limit in seconds
type Spec = { name: string; gate: string; cmd: (d: Dirs) => string[]; slots: number; mb: number; s: number; limit: number; env?: Record<string, string>; tool?: boolean; kill?: number };
const rt = ["--runtime", `../${tree}/adapter.ts`];
const falsify = (part: string, extra: string[] = []) => () => ["bun", "falsify.ts", ...rt, "--part", part, ...extra];
const suite = (name: string, env: Record<string, string>, mb: number, s: number): Spec => ({ name, gate: "suite", cmd: () => ["bun", "main.ts", "--round", round, ...rt, "--no-search"], env, slots: 1, mb, s, limit: 280 });
const LIE_SLICES = 4;
const killMb = (s: Spec) => s.kill ?? Math.max(s.mb * 2, 3000);
const specsOf = (L: typeof import("./limits.ts")): Spec[] => [
  suite("suite", {}, 1400, 19),
  suite("suite canon", { FLOW_CANON_CHECK: "1" }, 1500, 30),
  suite("suite copies", { FLOW_COPIES_CHECK: "1" }, 1300, 43),
  { name: "mutate-one", gate: "mutate-one", cmd: () => ["bun", "mutate-one.ts", ...rt], slots: 2, mb: 3500, s: 55, limit: 280 },
  { name: "graph-gate", gate: "graph-gate", cmd: () => ["bun", "graph-gate.ts", ...rt], slots: 1, mb: 2100, s: 16, limit: 280 },
  { name: "falsify suite1", gate: "falsify", cmd: falsify("suite1"), slots: 1, mb: 1700, s: 23, limit: 290 },
  { name: "falsify suite2", gate: "falsify", cmd: falsify("suite2"), slots: 1, mb: 1900, s: 55, limit: 290 },
  { name: "falsify suite3", gate: "falsify", cmd: falsify("suite3"), slots: 1, mb: 1300, s: 18, limit: 290 },
  { name: "falsify tamper", gate: "falsify", cmd: falsify("tamper"), slots: 1, mb: 600, s: 5, limit: 290 },
  { name: "falsify mutants", gate: "falsify", cmd: falsify("mutants"), slots: 1, mb: 2000, s: 60, limit: 290 },
  { name: "falsify search", gate: "falsify", cmd: falsify("search"), slots: 1, mb: 600, s: 30, limit: 290 },
  ...Array.from({ length: LIE_SLICES }, (_, k): Spec => ({ name: `falsify lies ${k + 1}/${LIE_SLICES}`, gate: "falsify", cmd: falsify("lies", ["--slice", `${k + 1}/${LIE_SLICES}`]), slots: 1, mb: 1500, s: 32, limit: 290 })),
  { name: "lifetime-falsify", gate: "lifetime-falsify", cmd: () => ["bun", "lifetime-falsify.ts", ...rt, "--parallel", "2"], slots: 2, mb: 3000, s: 22, limit: 290 },
  ...readdirSync(join(roundDir, "checks"))
    .filter((f) => f.endsWith(".ts"))
    .sort()
    .map((f): Spec => ({ name: `checks/${f}`, gate: `checks/${f}`, cmd: (d) => ["bun", join(d.round, "checks", f)], slots: 1, mb: L.SCRIPT.size.peakMb, s: 1, limit: L.SCRIPT.limits.seconds, kill: L.SCRIPT.limits.mb })),
  { name: "typed tsc", gate: "typed tsc", cmd: (d) => [resolve(here, "../../../../node_modules/.bin/tsc"), "-p", join(d.round, "typed/tsconfig.json")], slots: 1, mb: L.SCRIPT.size.peakMb, s: 1, limit: L.SCRIPT.limits.seconds, tool: true, kill: L.SCRIPT.limits.mb },
  { name: "cli pins", gate: "cli", cmd: (d) => ["bun", join(d.round, "cli/main.ts")], slots: 1, mb: L.SCRIPT.size.peakMb, s: 5, limit: L.SCRIPT.limits.seconds, kill: L.SCRIPT.limits.mb },
  { name: "verdict plants", gate: "plants", cmd: () => ["bun", "plants/plants.ts"], slots: 2, mb: 1200, s: 60, limit: 290 },
];
const label = { pass: "ok  ", fail: "BAD ", unknown: "UNKN" } as const;

await stated("gates", async (scope) => {
  const { describe, outcome } = await import("./verdicts/read.ts");
  const { final } = await import("./verdicts/runner.ts");
  const { copyOf } = await import("./verdicts/snapshot.ts");
  const L = await import("./limits.ts");
  const { CATALOG_CONTEXT } = L;
  const specs = specsOf(L);
  type Job = import("./verdicts/runner.ts").Job;
  const chosen = only ? specs.filter((j) => only.split(",").some((o) => j.name.startsWith(o))) : specs;
  const t0 = performance.now(); // evidence only: the GATES line's wall time
  const snap = scope.snapshot([here, roundDir], CATALOG_CONTEXT.map((f) => resolve(here, f)));
  const asJob = (s: Spec): Job => ({
    name: s.name,
    size: { slots: s.slots, peakMb: s.mb, aloneS: s.s, limitMb: killMb(s) },
    open: async () => {
      const c = copyOf(snap, tree, []);
      if (c._tag === "Failure") throw new Error(c.failure);
      const d = { conf: c.success.tree("conformance"), round: c.success.tree(tree) };
      return {
        spec: { gate: s.gate, cmd: s.cmd(d), cwd: d.conf, env: s.env ?? {}, limits: { mb: killMb(s), seconds: s.limit }, contract: s.tool ? "tool" : "gate" },
        close: c.success.close,
      };
    },
  });
  const runner = scope.runner({ slots: maxJobs, mb: maxMb, budgetS });
  const done = await Promise.all(chosen.map((s) => runner.run(asJob(s))));
  mkdirSync(out, { recursive: true });
  const rows: string[] = [];
  for (const d of done) {
    const f = d.job.name.replace(/[^\w.-]+/g, "_");
    const r = final(d);
    if (r.run.kind === "ended") {
      writeFileSync(join(out, `${f}.txt`), `${r.run.stdout.head}${r.run.stdout.tail}${r.run.stdout.lastLine}`);
      writeFileSync(join(out, `${f}.stderr.txt`), `${r.run.stderr.head}${r.run.stderr.tail}${r.run.stderr.lastLine}`);
    }
    writeFileSync(join(out, `${f}.reading.json`), JSON.stringify({ first: describe(d.first), alone: d.alone && describe(d.alone), skipped: d.skipped, dropped: r.run.kind === "ended" ? { stdout: r.run.stdout.dropped, stderr: r.run.stderr.dropped } : null }));
    const first = d.first.run.kind === "ended" ? d.first.run.ms / 1000 : 0;
    const t = r.run.kind === "ended" ? `${(r.run.ms / 1000).toFixed(1).padStart(6)} s of ${String(d.job.size.aloneS).padStart(3)} s  ${String(r.run.peakMb).padStart(5)} MB` : "not started";
    rows.push(`${label[outcome(r)]} ${d.job.name.padEnd(30)} ${t}${d.alone ? "  (again, alone)" : ""}${d.skipped ? `  (${d.skipped})` : ""}${first > 2 * d.job.size.aloneS ? "  re-measure" : ""}  ${describe(r).slice(0, 200)}`);
  }
  console.log(rows.join("\n"));
  const n = (o: string) => done.filter((d) => outcome(final(d)) === o).length;
  console.log(`\nGATES  ${n("pass")}/${done.length} ok, ${n("fail")} BAD, ${n("unknown")} unknown, in ${((performance.now() - t0) / 1000).toFixed(0)} s; outputs in ${out}`);
  return done.map((d) => ({ kind: "job", name: d.job.name, outcome: outcome(final(d)), why: describe(final(d)).slice(0, 300) }));
});
