// Rule 73's falsify: LIFE-01..10, green on the unmutated runtime, must go red by a named oracle on each wrong runtime of
// `mutants-lifetime.ts`. bun lifetime-falsify.ts --runtime ../round-14x/adapter.ts [--parallel N] [--mutants a,b] [--budget S]. One snapshot
// at the start; each run in its own copy of it. The control must be a whole run of the planned cases; a run the machine ended scores nothing.
import { basename, dirname, join, resolve } from "node:path";
import { stated } from "./verdicts/state.ts";

await stated("lifetime-falsify", async (scope) => {
  const { MACHINE_MB, SUITE } = await import("./limits.ts");
  const { plannedCases } = await import("./suite.ts");
  const { describe } = await import("./verdicts/read.ts");
  const { final } = await import("./verdicts/runner.ts");
  const { check, copyOf } = await import("./verdicts/snapshot.ts");
  const { expect, isScored, sameCases } = await import("./verdicts/verdict.ts");
  type Item = import("./verdicts/verdict.ts").Item;
  type Edit = import("./verdicts/snapshot.ts").Edit;
  type Reading = import("./verdicts/read.ts").Reading;
  const here = import.meta.dir;
  const i = process.argv.indexOf("--runtime");
  const source = dirname(resolve(here, i < 0 ? "../round-14x/adapter.ts" : process.argv[i + 1]!));
  // Round 14 (OD31): LIFE-01..30 as built, and the rewritten dispose cases whose result the rule changed.
  const ONLY = [...Array.from({ length: 30 }, (_, k) => `LIFE-${String(k + 1).padStart(2, "0")}`).filter((id) => !["LIFE-19", "LIFE-20", "LIFE-25", "LIFE-26"].includes(id)), "REV5-H5H6", "FRAG-08", "R14-ID-01", "R14-ID-02", "R14-ID-03", "R14-IGN-01", "R14-IGN-02", "R14-IGN-03", "R14-F-01", "R14-FIX-01", "R14-FIX-02", "R14-FIX-03", "R15-01", "R15-02", "R15-03", "P1-H", "REV7-M2", "REV7-M8", "REV5-M1", "PAY-16", "SURV-08", "REV8-PINS"];
  const { MUTANTS: ALL } = (await import(join(source, "mutants-lifetime.ts"))) as {
    MUTANTS: ReadonlyArray<{ id: string; kills: readonly string[]; edits: readonly Edit[] }>;
  };
  // `--mutants a,b` runs only those wrong runtimes (a quick check while building; the gate runs them all).
  const pick = process.argv.indexOf("--mutants");
  const MUTANTS = pick < 0 ? ALL : ALL.filter((m) => process.argv[pick + 1]!.split(",").some((p) => m.id.startsWith(p)));
  const pi = process.argv.indexOf("--parallel");
  const parallel = Math.min(8, Math.max(1, pi < 0 ? 1 : Number(process.argv[pi + 1]) || 1));
  const bi = process.argv.indexOf("--budget");
  const snap = scope.snapshot([here, source]);
  const tree = basename(source);
  const problems = MUTANTS.map((m) => check(snap, tree, m.id, m.edits));
  if (problems.some((p) => p !== null)) {
    for (const p of problems) if (p) console.log(`BAD  ${p.id}: ${p.problem}: ${p.why}`);
    return problems.filter((p) => p !== null).map((p) => ({ kind: "list", name: p!.id, outcome: "fail" as const, why: `${p!.problem}: ${p!.why}` }));
  }
  const runner = scope.runner({ slots: parallel, mb: Math.min(MACHINE_MB, parallel * SUITE.limits.mb), budgetS: bi < 0 ? null : Number(process.argv[bi + 1]) });
  const runJob = (name: string, edits: readonly Edit[], peakMb: number) =>
    runner.run({
      name,
      size: { ...SUITE.size, peakMb, limitMb: SUITE.limits.mb },
      open: async () => {
        const c = copyOf(snap, tree, edits);
        if (c._tag === "Failure") throw new Error(c.failure);
        const cwd = c.success.tree("conformance");
        return {
          spec: { gate: "suite", cmd: ["bun", join(cwd, "main.ts"), "--round", "99", "--no-catalog", "--no-output", "--runtime", `../${tree}/adapter.ts`, "--only", ONLY.join(",")], cwd, env: {}, limits: SUITE.limits, contract: "gate" },
          close: c.success.close,
        };
      },
    });
  const caseItems = (r: Reading) => (r.answer === "stated" ? r.verdict.items.filter(isScored).filter((x) => x.kind === "case" || x.kind === "work-bound") : []);
  const failText = (r: Reading) => caseItems(r).filter((x) => x.outcome === "fail").map((x) => `${x.name}: ${x.why.slice(0, 140)}`);
  const items: Item[] = [];
  const control = final(await runJob("control", [], 0));
  const ci = expect("control", "control", control, "pass", { kinds: ["case", "only"], holds: sameCases(plannedCases(new Set(ONLY))) });
  items.push(ci);
  const passed = caseItems(control).filter((x) => x.outcome === "pass").map((x) => x.name);
  const cf = failText(control);
  console.log(`${ci.outcome === "pass" ? "ok  " : ci.outcome === "unknown" ? "UNKN" : "BAD "} control: ${passed.length} pass, ${cf.length} fail${cf.length ? `\n       ${cf.join("\n       ")}` : ""}${ci.outcome !== "pass" ? `  ${ci.why}` : ""}`);
  // Fail-then-pass: every case green on the control must be red on at least one wrong runtime.
  const ref = control.run.kind === "ended" ? control.run.peakMb : 0;
  const { MEMORY_MARGIN } = await import("./verdicts/read.ts");
  if (SUITE.limits.mb < MEMORY_MARGIN * ref) throw new Error(`defect: the kill limit ${SUITE.limits.mb} MB is under ${MEMORY_MARGIN} x the control's peak ${ref} MB`);
  const runs = MUTANTS.map((m) => runJob(m.id, m.edits, ref));
  const everRed = new Set<string>();
  let unknownRuns = 0;
  for (const [k, m] of MUTANTS.entries()) {
    const r = final(await runs[k]!);
    if (r.answer === "none") {
      unknownRuns++;
      items.push({ kind: "wrong runtime", name: m.id, outcome: "unknown", why: describe(r) });
      console.log(`UNKN ${m.id} (${m.kills.join(",")}): ${describe(r)}`);
      continue;
    }
    if (r.answer === "bound") {
      items.push({ kind: "wrong runtime", name: m.id, outcome: "fail", why: "red by memory, by no named oracle" });
      console.log(`BAD  ${m.id} (${m.kills.join(",")}): red by memory, by no named oracle`);
      continue;
    }
    const red = failText(r);
    const failed = caseItems(r).filter((x) => x.outcome === "fail");
    for (const x of failed) everRed.add(x.name);
    const aimed = failed.filter((x) => x.kind === "case" && m.kills.some((k) => x.name === k || x.name.startsWith(`${k}/`)));
    const asserted = aimed.filter((x) => !x.why.startsWith("threw"));
    const why = red.length === 0 ? "0 red" : aimed.length === 0 ? `no target red (${m.kills.join(", ")})` : asserted.length === 0 ? `target red only by a throw: ${aimed[0]!.why.slice(0, 120)}` : "";
    items.push({ kind: "wrong runtime", name: m.id, outcome: why === "" ? "pass" : "fail", why, detail: { failed: failed.map((x) => x.name) } });
    console.log(`${why === "" ? "ok  " : "BAD "} ${m.id} (${m.kills.join(",")}): ${red.length} red${why ? `; ${why}` : ""}${red.length ? `\n       ${red.join("\n       ")}` : ""}`);
  }
  const neverRed = passed.filter((name) => !everRed.has(name));
  console.log(neverRed.length === 0 ? "every case is red on some wrong runtime" : `never red: ${neverRed.join(" ")}`);
  items.push({
    kind: "coverage",
    name: "every case red on some wrong runtime",
    outcome: ci.outcome !== "pass" ? ci.outcome : neverRed.length === 0 ? "pass" : unknownRuns > 0 ? "unknown" : "fail",
    why: neverRed.length === 0 ? "" : `never red${unknownRuns ? ` (${unknownRuns} wrong runtime(s) unknown)` : ""}: ${neverRed.join(" ")}`,
  });
  const bad = items.filter((x) => isScored(x) && x.outcome !== "pass");
  console.log(bad.length === 0 ? "every lifetime mutant goes red" : `${bad.length} survivor(s), unknown or a red control`);
  return items;
});
