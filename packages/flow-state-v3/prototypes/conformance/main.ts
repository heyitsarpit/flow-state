// bun packages/flow-state-v3/prototypes/conformance/main.ts --round 6 --runtime ../round-6/adapter.ts
//   [--no-search] [--lock]. Searches run separately: search/run.ts, under watch.ts.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { makeHarness, swapFixtures } from "./drive.ts";
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
import { round6Scenarios } from "./scenarios/round6.scenario.ts";
import { round7Scenarios } from "./scenarios/round7.scenario.ts";
import { round8Scenarios } from "./scenarios/round8.scenario.ts";
import { round9Scenarios } from "./scenarios/round9.scenario.ts";
import { streams5Scenarios } from "./scenarios/streams5.scenario.ts";
import { flowScenarios } from "./scenarios/flows.scenario.ts";
import { fragScenarios } from "./scenarios/frag.scenario.ts";
import { reviewScenarios } from "./scenarios/review.scenario.ts";
import { orderScenarios } from "./scenarios/order.scenario.ts";
import { payScenarios } from "./scenarios/pay.scenario.ts";
import { round4Scenarios } from "./scenarios/round4.scenario.ts";
import { storeScenarios } from "./scenarios/store.scenario.ts";
import { streamScenarios } from "./scenarios/stream.scenario.ts";

export type RunResult = { id: string; variant?: string; ok: boolean; why?: string; ms: number; trace?: string };
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
  ...round6Scenarios,
  ...round7Scenarios,
  ...round8Scenarios,
  ...round9Scenarios,
];

const here = import.meta.dir;
const LOCK = join(here, "expected.lock");
const LOG = join(here, "expected-changes.log");
const BULK = 3; // one reason on more lines than this is a bulk reason

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
// D113, D116: what the suite and its gates lean on is an expected result too. By walking, so a new file cannot be forgotten.
const walked = (root: string, dir: string, ext: RegExp) =>
  existsSync(join(root, dir)) ? readdirSync(join(root, dir)).filter((f) => ext.test(f)).sort().map((f) => `${dir}/${f}`) : [];
const SHARED = [
  ...walked(here, "scenarios", /\.ts$/),
  ...walked(here, "search", /\.ts$/),
  ...walked(here, "fixtures", /\.ts$/),
  "main.ts",
  "report.ts",
  "watch.ts",
  "gate5s.ts",
  "gate-5s-expected.txt",
  "mutate.ts",
  "mutate-one.ts",
  "harness.ts",
  "drive.ts",
  "fake-world.ts",
];
// And the round's own: CLI pins, typed checks, the adapter's normaliser. Named by what they are, so a new round logs the move once.
const roundFiles = (root: string) => [...walked(root, "cli", /\.ts$/), ...walked(root, "typed", /\.ts$/), "adapter.ts"];
let roundDir: string | undefined;
const splitLock = (l: string): [string, string] => [l.slice(0, l.lastIndexOf(" ")), l.slice(l.lastIndexOf(" ") + 1)]; // a variant's name may hold spaces
const lockLines = (): string[] => [
  ...allScenarios.map((s) => `${s.id} ${sha(bodyOf(s))}`),
  // D103: a variant is an expected result too. Its text is in its scenario's hash; this line is so that one gone is seen by name.
  ...allScenarios.flatMap((s) => Object.keys(s.variants ?? {}).map((v) => `variant:${s.id}/${v} present`)),
  ...SHARED.map((f) => `file:${f} ${sha(readFileSync(join(here, f), "utf8"))}`),
  ...(roundDir ? roundFiles(roundDir).filter((f) => existsSync(join(roundDir!, f))).map((f) => `round:${f} ${sha(readFileSync(join(roundDir!, f), "utf8"))}`) : []),
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
      (globalThis as any).__kills = [];
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
            !q.idempotencyKey.startsWith("business:") && // D106: a key the server recognises, by design no Attempt's
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
          ...((globalThis as any).__kills?.length ? { trace: (globalThis as any).__kills.join(" ; ") } : {}),
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
  const round = Number(arg("--round") ?? 9);
  const runtime = resolve(here, arg("--runtime") ?? "./null-adapter.ts");
  roundDir = dirname(runtime);
  const mod = (await import(runtime)) as RuntimeModule;
  if (arg("--swap")) swapFixtures((await import(resolve(here, arg("--swap")!))).swaps);
  console.log(`runtime: ${runtime}\nbun ${Bun.version}`);

  // A diff touching expectations with no log line fails the run. Compared first, before any lock (review M7).
  // D116, review M7: no lock is not a first run. Only `--first-lock` says it is.
  if (!existsSync(LOCK) && !has("--first-lock")) {
    console.log(`NO LOCK at ${LOCK}. Nothing can be compared, so nothing can pass. Restore it from git; \`--first-lock\` only for a new suite.`);
    process.exit(1);
  }
  const old = new Map(existsSync(LOCK) ? readFileSync(LOCK, "utf8").trim().split("\n").map(splitLock) : []);
  const log = existsSync(LOG) ? readFileSync(LOG, "utf8") : "";
  // D103: a hash counts only on a line that names its own id and gives a reason, and a reason that is not a bulk one. Review: 94 lines shared one, and any hash anywhere passed.
  const logLines = log.split("\n").filter((l) => l.includes(" hash:"));
  const reasonOf = (l: string) => l.split(" | ").slice(1).join(" | ").trim();
  const uses = new Map<string, number>();
  for (const l of logLines) uses.set(reasonOf(l), (uses.get(reasonOf(l)) ?? 0) + 1);
  const logged = (id: string, h: string) =>
    logLines.some((l) => l.startsWith(`${id} hash:${h}`) && reasonOf(l).length > 0 && uses.get(reasonOf(l))! <= BULK);
  const now = lockLines().map(splitLock);
  // D116: an id the lock does not have needs a line too, so deleting lines from the lock launders nothing. A variant's text is in its scenario's hash, so its presence line needs none.
  const firstLock = !existsSync(LOCK);
  const needsLine = ([id, h]: [string, string]) => old.get(id) !== h && !firstLock && !id.startsWith("variant:") && !logged(id, h);
  const unlogged = now.filter(needsLine).map(([id]) => id);
  // D103: an id or a variant the lock had and the suite does not is a failure until a `removed:` line names it.
  const nowIds = new Set(now.map(([id]) => id));
  const gone = [...old.keys()].filter((id) => !nowIds.has(id) && !log.split("\n").some((l) => l.startsWith(`removed:${id} | `) && l.split(" | ")[1]!.trim().length > 0));
  if (has("--hashes"))
    for (const e of now) if (needsLine(e)) console.log(`HASH ${e[0]} hash:${e[1]}`);
  if (has("--lock")) {
    // D113: the lock follows the log, never the other way. Review: weaken a case, `--lock`, and the next run is clean with no line.
    if (unlogged.length || gone.length) {
      console.log(`LOCK REFUSED. Log these first: ${[...unlogged, ...gone].join(" ")}`);
      process.exit(1);
    }
    writeFileSync(LOCK, lockLines().join("\n") + "\n");
    console.log(
      `expected.lock written, after comparing. Unlogged against the previous lock: ${unlogged.join(" ") || "none"}; removed with no log line: ${gone.join(" ") || "none"}`,
    );
  }

  // The mutation runner's `--swap` pass: scenarios only. The catalog is the plain pass's business.
  const rows = has("--no-catalog") ? [] : catalog().filter((r) => r.R <= round);
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
      `${r.ok ? "PASS" : "FAIL"}  ${name(r).padEnd(52)} ${r.ok ? `${r.ms.toFixed(1)} ms` : r.why}${r.trace ? `\n      ${r.trace}` : ""}`,
    );
  if (!has("--no-catalog")) printReports(
    round,
    allScenarios,
    cells,
    arg("--mutants") ? resolve(here, arg("--mutants")!) : undefined,
  );
  const pass = results.filter((r) => r.ok).length;
  console.log(
    `\nSUMMARY  ${pass}/${results.length} scenario cases pass; unlogged expectation changes: ${unlogged.join(" ") || "none"}; removed with no log line: ${gone.join(" ") || "none"}; catalog disagreements: ${disagreements.join("; ") || "none"}`,
  );
  process.exitCode = pass === results.length && !unlogged.length && !gone.length && !disagreements.length ? 0 : 1;
}
