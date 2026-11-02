// bun packages/flow-state-v3/prototypes/conformance/main.ts --round 5 --runtime ../round-5/adapter.ts
//   [--no-search] [--lock]. Searches run separately: search/run.ts, under watch.ts.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { makeHarness } from "./drive.ts";
import type { Harness, RuntimeModule } from "./harness.ts";
import { catalog, printReports } from "./report.ts";
import {
  checkClaims,
  checkEndings,
  checkMints,
  Ctx,
  Mismatch,
  type Scenario,
} from "./scenarios/ctx.ts";
import { round5Scenarios } from "./scenarios/round5.scenario.ts";
import { streams5Scenarios } from "./scenarios/streams5.scenario.ts";
import { flowScenarios } from "./scenarios/flows.scenario.ts";
import { fragScenarios } from "./scenarios/frag.scenario.ts";
import { reviewScenarios } from "./scenarios/review.scenario.ts";
import { orderScenarios } from "./scenarios/order.scenario.ts";
import { payScenarios } from "./scenarios/pay.scenario.ts";
import { round4Scenarios } from "./scenarios/round4.scenario.ts";
import { storeScenarios } from "./scenarios/store.scenario.ts";
import { streamScenarios } from "./scenarios/stream.scenario.ts";

export type RunResult = { id: string; variant?: string; ok: boolean; why?: string; ms: number };
export const allScenarios: readonly Scenario[] = [
  ...payScenarios,
  ...orderScenarios,
  ...storeScenarios,
  ...flowScenarios,
  ...reviewScenarios,
  ...fragScenarios,
  ...round4Scenarios,
  ...streamScenarios,
  ...round5Scenarios,
  ...streams5Scenarios,
];

const here = import.meta.dir;
const LOCK = join(here, "expected.lock");
const LOG = join(here, "expected-changes.log");

// D33: a scenario's hash covers its body and every file its expected result leans on; whitespace-blind, so `vp fmt` is free.
const norm = (s: string) => s.replace(/\s+/g, "");
const sha = (s: string) => createHash("sha1").update(norm(s)).digest("hex").slice(0, 12);
const bodyOf = (s: Scenario) =>
  [
    s.run?.toString() ?? "",
    ...Object.entries(s.variants ?? {}).map(([k, f]) => `${k}:${f.toString()}`),
    JSON.stringify(s.cites),
    JSON.stringify(s.pins ?? []),
  ].join("\n");
const SHARED = [
  "scenarios/ctx.ts",
  "scenarios/pay.scenario.ts",
  "scenarios/order.scenario.ts",
  "scenarios/store.scenario.ts",
  "scenarios/flows.scenario.ts",
  "scenarios/review.scenario.ts",
  "scenarios/frag.scenario.ts",
  "scenarios/round4.scenario.ts",
  "fake-world.ts",
  "drive.ts",
  "fixtures/compiled.ts",
  "fixtures/build.ts",
  "fixtures/pay.compiled.ts",
  "fixtures/cells.compiled.ts",
  "fixtures/issues.compiled.ts",
  "fixtures/s1.compiled.ts",
  "fixtures/cart.compiled.ts",
  "fixtures/refunds.compiled.ts",
  "fixtures/order.compiled.ts",
  "fixtures/drv.compiled.ts",
  "fixtures/lab.compiled.ts",
  "fixtures/pay-full.compiled.ts",
  "fixtures/comments.compiled.ts",
  "fixtures/real.compiled.ts",
  "fixtures/feed.compiled.ts",
  "scenarios/stream.scenario.ts",
  "scenarios/round5.scenario.ts",
  "scenarios/streams5.scenario.ts",
  "fixtures/desk.compiled.ts",
  "fixtures/oddall.compiled.ts",
  "fixtures/chat.compiled.ts",
];
const lockLines = (): string[] => [
  ...allScenarios.map((s) => `${s.id} ${sha(bodyOf(s))}`),
  ...SHARED.map((f) => `file:${f} ${sha(readFileSync(join(here, f), "utf8"))}`),
];

export const runScenarios = (
  make: () => Harness,
  cellsHit: Set<string> = new Set(),
  only?: ReadonlySet<string>,
): RunResult[] => {
  const results: RunResult[] = [];
  for (const s of allScenarios) {
    if (only && !only.has(s.id)) continue;
    const cases: Array<[string | undefined, (c: Ctx) => void]> = s.run
      ? [[undefined, s.run]]
      : Object.entries(s.variants ?? {});
    const citedCells = s.cites.filter((x) => x.startsWith("cell:lane.")).map((x) => x.slice(5));
    const hitHere = new Set<string>();
    for (const [variant, body] of cases) {
      const t = performance.now();
      const fresh = (machines = s.fixtures, bounds = s.bounds) => {
        const h = make();
        h.start({ machines, seed: 1, ...(bounds ? { bounds } : {}) });
        return h;
      };
      const c = new Ctx(fresh(), s.actor);
      c.fresh = fresh;
      c.make = make;
      c.namedIssues = [...(s.namedIssues ?? [])];
      const v = variant ? { variant } : {};
      try {
        body(c);
        const codes = c.r.issues().map((i) => i.code);
        const extra = codes.filter((x) => !c.namedIssues.includes(x));
        if (extra.length)
          throw new Mismatch(`issues not named by the scenario: ${extra.join(", ")}`);
        checkClaims(c.r);
        checkEndings(c.r);
        checkMints(c.r);
        const rep = c.r.replay();
        if (!rep.same) throw new Mismatch(`S11 replay differs: ${JSON.stringify(rep.firstDiff)}`);
        const minted = new Set(c.r.evidence("mint").map((e) => e["attempt"]));
        for (const q of c.r.requests())
          if (
            q.idempotencyKey !== undefined &&
            !q.op.startsWith("drv") &&
            !minted.has(q.idempotencyKey)
          )
            throw new Mismatch(`key ${q.idempotencyKey} is no Attempt`);
        for (const e of c.r.evidence("lane")) {
          cellsHit.add(e["cell"]);
          hitHere.add(e["cell"]);
        }
        results.push({ id: s.id, ...v, ok: true, ms: performance.now() - t });
      } catch (e) {
        results.push({
          id: s.id,
          ...v,
          ok: false,
          why:
            e instanceof Mismatch
              ? e.message
              : `threw: ${(e as Error).stack?.split("\n").slice(0, 3).join(" ")}`,
          ms: performance.now() - t,
        });
      }
    }
    const missing = citedCells.filter((x) => !hitHere.has(x));
    const last = results.at(-1)!;
    if (missing.length && results.filter((r) => r.id === s.id).every((r) => r.ok)) {
      last.ok = false;
      last.why = `cites a cell no run hit: ${missing.join(", ")}`;
    }
  }
  return results;
};

const name = (r: RunResult) => (r.variant ? `${r.id}/${r.variant}` : r.id);

if (import.meta.main) {
  const arg = (k: string) => {
    const i = process.argv.indexOf(k);
    return i < 0 ? undefined : process.argv[i + 1];
  };
  const has = (k: string) => process.argv.includes(k);
  const round = Number(arg("--round") ?? 5);
  const runtime = resolve(here, arg("--runtime") ?? "./null-adapter.ts");
  const mod = (await import(runtime)) as RuntimeModule;
  console.log(`runtime: ${runtime}\nbun ${Bun.version}`);

  // A diff touching expectations with no log line fails the run. Compared first, before any lock (review M7).
  const old = existsSync(LOCK)
    ? new Map(
        readFileSync(LOCK, "utf8")
          .trim()
          .split("\n")
          .map((l) => l.split(" ") as [string, string]),
      )
    : new Map<string, string>();
  const log = existsSync(LOG) ? readFileSync(LOG, "utf8") : "";
  const now = lockLines().map((l) => l.split(" ") as [string, string]);
  const unlogged = now
    .filter(([id, h]) => old.has(id) && old.get(id) !== h && !log.includes(`hash:${h}`))
    .map(([id]) => id);
  if (has("--hashes"))
    for (const [id, h] of now)
      if (old.has(id) && old.get(id) !== h && !log.includes(`hash:${h}`))
        console.log(`HASH ${id} hash:${h}`);
  if (has("--lock")) {
    writeFileSync(LOCK, lockLines().join("\n") + "\n");
    console.log(
      `expected.lock written, after comparing. Unlogged against the previous lock: ${unlogged.join(" ") || "none"}`,
    );
  }

  const rows = catalog().filter((r) => r.R <= round);
  const disagreements: string[] = [];
  for (const r of rows) {
    if (r.id.startsWith("SEARCH-") || r.id.startsWith("HOST-")) continue;
    const s = allScenarios.find((x) => x.id === r.id);
    if (!s) disagreements.push(`${r.id}: no scenario`);
    else if ([...s.cites].sort().join(",") !== [...r.cites].sort().join(","))
      disagreements.push(`${r.id}: cites differ from SCENARIOS.md (${s.cites.join(",")})`);
  }

  const cells = new Set<string>();
  const only = arg("--only");
  const results = runScenarios(
    makeHarness(mod.port),
    cells,
    only ? new Set(only.split(",")) : undefined,
  );
  for (const r of results)
    console.log(
      `${r.ok ? "PASS" : "FAIL"}  ${name(r).padEnd(52)} ${r.ok ? `${r.ms.toFixed(1)} ms` : r.why}`,
    );
  printReports(
    round,
    allScenarios,
    cells,
    arg("--mutants") ? resolve(here, arg("--mutants")!) : undefined,
  );
  const pass = results.filter((r) => r.ok).length;
  console.log(
    `\nSUMMARY  ${pass}/${results.length} scenario cases pass; unlogged expectation changes: ${unlogged.join(" ") || "none"}; catalog disagreements: ${disagreements.join("; ") || "none"}`,
  );
  process.exitCode = pass === results.length && !unlogged.length && !disagreements.length ? 0 : 1;
}
