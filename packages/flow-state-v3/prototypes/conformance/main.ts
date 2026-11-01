// bun packages/flow-state-v3/prototypes/conformance/main.ts --round 1 --runtime ../round-1/adapter.ts
//   [--no-search] [--search-cap N] [--search-seconds N] [--lock]
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Harness, RuntimeModule } from "./harness.ts";
import { catalog, printReports } from "./report.ts";
import { Ctx, fixtures, Mismatch, payScenarios, type Scenario } from "./scenarios/pay.scenario.ts";
import { searchPay, type SearchReport } from "./search/pay.search.ts";

export type RunResult = { id: string; variant?: string; ok: boolean; why?: string; ms: number };

const here = import.meta.dir;
const LOCK = join(here, "expected.lock");
const LOG = join(here, "expected-changes.log");
const bodyOf = (s: Scenario) =>
  [
    s.run?.toString() ?? "",
    ...Object.entries(s.variants ?? {}).map(([k, f]) => `${k}:${f.toString()}`),
  ].join("\n");
const hash = (s: Scenario) => createHash("sha1").update(bodyOf(s)).digest("hex").slice(0, 12);

// Every-scenario checks from SCENARIOS.md, plus: a cited cell must have been hit.
const closing = (c: Ctx, s: Scenario) => {
  const codes = c.r.issues().map((i) => i.code);
  const extra = codes.filter((x) => !c.namedIssues.includes(x));
  if (extra.length) throw new Mismatch(`issues not named by the scenario: ${extra.join(", ")}`);
  const rep = c.r.replay();
  if (!rep.same) throw new Mismatch(`S11 replay differs: ${JSON.stringify(rep.firstDiff)}`);
  const seen = new Set<string>();
  for (const e of c.r.evidence("ending")) {
    if (e["send"] === undefined) continue;
    const k = `${e["attempt"]}#${e["send"]}`;
    if (seen.has(k)) throw new Mismatch(`two endings for send ${k}`);
    seen.add(k);
  }
  const minted = new Set(c.r.evidence("mint").map((e) => e["attempt"]));
  for (const q of c.r.requests())
    if (q.idempotencyKey !== undefined && !minted.has(q.idempotencyKey))
      throw new Mismatch(`key ${q.idempotencyKey} is no Attempt`);
};

export const runScenarios = (
  makeHarness: () => Harness,
  cellsHit: Set<string> = new Set(),
): RunResult[] => {
  const results: RunResult[] = [];
  for (const s of payScenarios) {
    const cases: Array<[string | undefined, (c: Ctx) => void]> = s.run
      ? [[undefined, s.run]]
      : Object.entries(s.variants ?? {});
    const citedCells = s.cites.filter((x) => x.startsWith("cell:")).map((x) => x.slice(5));
    const hitHere = new Set<string>();
    for (const [variant, body] of cases) {
      const t = performance.now();
      const fresh = () => {
        const h = makeHarness();
        h.start({ machines: fixtures, seed: 1 });
        return h;
      };
      const c = new Ctx(fresh());
      (c as any).fresh = fresh;
      try {
        body(c);
        closing(c, s);
        for (const e of c.r.evidence("lane")) {
          cellsHit.add(e["cell"]);
          hitHere.add(e["cell"]);
        }
        results.push({
          id: s.id,
          ...(variant ? { variant } : {}),
          ok: true,
          ms: performance.now() - t,
        });
      } catch (e) {
        results.push({
          id: s.id,
          ...(variant ? { variant } : {}),
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
  const round = Number(arg("--round") ?? 1);
  const runtime = resolve(here, arg("--runtime") ?? "./null-adapter.ts");
  const mod = (await import(runtime)) as RuntimeModule;
  console.log(`runtime: ${runtime}\nbun ${Bun.version}`);

  if (has("--lock")) {
    writeFileSync(LOCK, payScenarios.map((s) => `${s.id} ${hash(s)}`).join("\n") + "\n");
    console.log("expected.lock written");
  }
  // A diff touching expectations with no log line fails the run.
  const lock = existsSync(LOCK)
    ? new Map(
        readFileSync(LOCK, "utf8")
          .trim()
          .split("\n")
          .map((l) => l.split(" ") as [string, string]),
      )
    : new Map<string, string>();
  const log = existsSync(LOG) ? readFileSync(LOG, "utf8") : "";
  const unlogged = payScenarios.filter(
    (s) =>
      lock.has(s.id) &&
      lock.get(s.id) !== hash(s) &&
      !log.split("\n").some((l) => l.startsWith(`${s.id} `)),
  );

  // Catalog agreement: ids and cites must match SCENARIOS.md.
  const rows = catalog().filter((r) => r.R === 1);
  const disagreements: string[] = [];
  for (const r of rows) {
    if (r.id === "SEARCH-PAY") continue;
    const s = payScenarios.find((x) => x.id === r.id);
    if (!s) disagreements.push(`${r.id}: no scenario`);
    else if (s.cites.join(",") !== r.cites.join(","))
      disagreements.push(`${r.id}: cites differ from SCENARIOS.md`);
  }

  const cells = new Set<string>();
  const results = runScenarios(mod.makeHarness, cells);
  for (const r of results)
    console.log(
      `${r.ok ? "PASS" : "FAIL"}  ${name(r).padEnd(40)} ${r.ok ? `${r.ms.toFixed(1)} ms` : r.why}`,
    );

  let search: SearchReport | undefined;
  if (!has("--no-search")) {
    const allGreen = results.every((r) => r.ok);
    if (!allGreen) console.log("SKIP  SEARCH-PAY  scenarios are red; its result would say nothing");
    else {
      search = searchPay(mod.makeHarness, {
        cap: Number(arg("--search-cap") ?? 200_000),
        depth: 8,
        deadlineMs: Number(arg("--search-seconds") ?? 120) * 1000,
      });
      console.log(
        `${search.verdict === "failed" ? "FAIL" : search.verdict === "completed" ? "PASS" : "INCONCLUSIVE"}  SEARCH-PAY ${JSON.stringify(search)}`,
      );
    }
  }

  printReports(
    round,
    rows.map((r) => ({ id: r.id, cites: r.cites })),
    cells,
  );
  const pass = results.filter((r) => r.ok).length;
  console.log(
    `\nSUMMARY  ${pass}/${results.length} scenario cases pass; search ${search?.verdict ?? "not run"}; unlogged expectation changes: ${unlogged.map((s) => s.id).join(" ") || "none"}; catalog disagreements: ${disagreements.join("; ") || "none"}`,
  );
  process.exitCode =
    pass === results.length &&
    unlogged.length === 0 &&
    disagreements.length === 0 &&
    search?.verdict !== "failed"
      ? 0
      : 1;
}
