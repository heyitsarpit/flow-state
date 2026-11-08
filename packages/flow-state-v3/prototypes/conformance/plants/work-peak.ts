// The largest work one harness call spends (drive.ts `spentInCall`), over the suite, its 5 s pass, its swap pass, falsify's 14 searches and
// any mutants named: the measurement `WORK_PER_CALL` is sized from (20 times it, up to the next power of ten). Every child appends its own
// maximum to one file (FLOW_WORK_PEAK). bun plants/work-peak.ts [--mutants id,id]
import { join } from "node:path";
import { stated } from "../verdicts/state.ts";

await stated("work-peak", async (scope) => {
  const { mkdtempSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { MUTANT, SEARCH, SUITE, WORK_PER_CALL } = await import("../limits.ts");
  const { describe, outcome } = await import("../verdicts/read.ts");
  const { final, job } = await import("../verdicts/runner.ts");
  type Item = import("../verdicts/verdict.ts").Item;
  const conf = join(import.meta.dir, "..");
  const file = join(mkdtempSync(join(tmpdir(), "flow-work-")), "peaks.txt");
  const env = { FLOW_WORK_PEAK: file };
  const rt = ["--runtime", "../round-14/adapter.ts"];
  const runner = scope.runner({ slots: 4, mb: 14_000, budgetS: null });
  const runs: Array<Promise<import("../verdicts/runner.ts").Done>> = [];
  const suite = (name: string, args: readonly string[], e: Record<string, string> = {}) =>
    runs.push(runner.run(job(name, { gate: "suite", cmd: ["bun", "main.ts", "--round", "99", "--no-catalog", ...rt, ...args], cwd: conf, env: { ...env, ...e }, limits: SUITE.limits, contract: "gate" }, SUITE.size)));
  suite("suite", []);
  suite("5 s pass", [], { FLOW_RUNTIME_DEFAULT: "1", FLOW_TEST_FLUSH: "reads,faults" });
  suite("swap pass", ["--swap", "../round-14/typed/swaps.ts"]);
  for (const w of ["pay", "like", "chain", "crash", "cross", "frag", "odd", "session", "repairing", "listen.load", "fragstore.row", "flush.bare.tight", "flush.serialize.directed", "flush.bare.capture"])
    runs.push(runner.run(job(`search ${w}`, { gate: "search", cmd: ["bun", "search/run.ts", "--which", w, "--runtime", "../../round-14/adapter.ts", "--depth", "4", "--states", "4000", "--expect", "completed"], cwd: conf, env, limits: SEARCH.limits, contract: "gate" }, SEARCH.size)));
  const mi = process.argv.indexOf("--mutants");
  if (mi > 0)
    runs.push(runner.run(job("mutants", { gate: "mutate", cmd: ["bun", "mutate.ts", "--runtime", "../round-14", "--list", "mutants.ts", "--only", process.argv[mi + 1]!, "--out", "/dev/null"], cwd: conf, env, limits: { mb: MUTANT.mb * 2, seconds: 290 }, contract: "gate" }, { slots: 2, peakMb: 0, aloneS: 120 })));
  const done = await Promise.all(runs);
  const lost = done.filter((d) => final(d).answer === "none");
  const rows = readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => Number(l.split(" ")[0]));
  const max = Math.max(0, ...rows);
  const sized = 10 ** Math.ceil(Math.log10(Math.max(1, 20 * max)));
  console.log(`WORK-PEAK ${max} over ${rows.length} processes; 20 x that is ${20 * max}; the next power of ten ${sized}; WORK_PER_CALL ${WORK_PER_CALL}`);
  for (const d of done) console.log(`  ${d.job.name}: ${outcome(final(d))} ${describe(final(d)).slice(0, 120)}`);
  const items: Item[] = [{ kind: "measure", name: "work peak", outcome: lost.length ? "unknown" : sized <= WORK_PER_CALL ? "pass" : "fail", why: lost.length ? `${lost.length} run(s) gave no answer` : sized <= WORK_PER_CALL ? "" : `${sized} needed, ${WORK_PER_CALL} set`, detail: { max, processes: rows.length } }];
  return items;
});
