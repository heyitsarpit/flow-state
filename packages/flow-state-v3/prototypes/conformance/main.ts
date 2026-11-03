// bun packages/flow-state-v3/prototypes/conformance/main.ts --round 6 --runtime ../round-6/adapter.ts
//   [--no-search] [--lock]. Searches run separately: search/run.ts, under watch.ts.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { makeHarness, recipients, swapFixtures } from "./drive.ts";
import type { Harness, RuntimeModule } from "./harness.ts";
import { caseOutput, diffOutput, type Section, type Tracked } from "./output.ts";
import { catalog, printReports } from "./report.ts";
import {
  checkClaims,
  checkEndings,
  checkMints,
  Ctx,
  Mismatch,
  openCase,
  type Scenario,
} from "./scenarios/ctx.ts";
import { round5Scenarios } from "./scenarios/round5.scenario.ts";
import { round6Scenarios } from "./scenarios/round6.scenario.ts";
import { round7Scenarios } from "./scenarios/round7.scenario.ts";
import { round8Scenarios } from "./scenarios/round8.scenario.ts";
import { round9Scenarios } from "./scenarios/round9.scenario.ts";
import { round9bScenarios } from "./scenarios/round9b.scenario.ts";
import { round10Scenarios } from "./scenarios/round10.scenario.ts";
import { streams5Scenarios } from "./scenarios/streams5.scenario.ts";
import { flowScenarios } from "./scenarios/flows.scenario.ts";
import { fragScenarios } from "./scenarios/frag.scenario.ts";
import { reviewScenarios } from "./scenarios/review.scenario.ts";
import { orderScenarios } from "./scenarios/order.scenario.ts";
import { payScenarios } from "./scenarios/pay.scenario.ts";
import { round4Scenarios } from "./scenarios/round4.scenario.ts";
import { storeScenarios } from "./scenarios/store.scenario.ts";
import { streamScenarios } from "./scenarios/stream.scenario.ts";

export type RunResult = { id: string; variant?: string; ok: boolean; why?: string; ms: number; trace?: string; output?: string };
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
  ...round9bScenarios,
  ...round10Scenarios,
];

const here = import.meta.dir;
const LOCK = join(here, "expected.lock");
const LOG = join(here, "expected-changes.log");
const BULK = 3; // one reason on more lines than this is a bulk reason
const BASELINE = join(here, "expected.baseline");
const BASELINE_SHA = "e4c9a86d26fc0b84a47696bd5844a3e534da6cba";
const SCHEME = "--- hash scheme 2 (D135):";

// D33, D135: a hash reads tokens, so `vp fmt` and comments are free, and code and strings are not. A joined line cannot swallow an oracle: what a comment swallowed is gone from the tokens. What does not parse is hashed by its bytes.
const transpiler = new Bun.Transpiler({ loader: "ts", minifyWhitespace: true, trimUnusedImports: false });
export const tokens = (src: string): string => {
  // Held by an assignment: the transpiler drops an unused pure expression, and a function's text would hash as nothing.
  for (const t of [src, `globalThis.__t=(${src})`, `globalThis.__t=({${src}})`]) {
    try {
      const out = transpiler.transformSync(t);
      if (out.trim().length > 0 && (t === src ? !/^\s*(\(|async\b|function\b|["'\w$-]+\()/.test(src) : true)) return out;
    } catch {}
  }
  return src;
};
const sha = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12);
// Re-audit H2: under `typed/` the types and the `@ts-expect-error` comments are the pins, and the transpiler strips both. Those files hash by
// their text with whitespace collapsed: `vp fmt`'s line breaks are free, and a type, a directive or a comment's words are not.
export const typedText = (src: string) => src.replace(/\s+/g, " ").trim();
const shaFile = (f: string, text: string) => sha(f.startsWith("typed/") ? typedText(text) : f.endsWith(".ts") ? tokens(text) : text);
const bodyOf = (s: Scenario) =>
  [
    tokens(s.run?.toString() ?? ""),
    ...Object.entries(s.variants ?? {}).map(([k, f]) => `${k}:${tokens(f.toString())}`),
    JSON.stringify(s.cites),
    JSON.stringify(s.pins ?? []),
    JSON.stringify(s.outputAllow ?? null),
  ].join("\n");
// D113, D116: what the suite and its gates lean on is an expected result too. By walking, so a new file cannot be forgotten.
const walked = (root: string, dir: string, ext: RegExp) =>
  existsSync(join(root, dir)) ? readdirSync(join(root, dir)).filter((f) => ext.test(f)).sort().map((f) => `${dir}/${f}`) : [];
const SHARED = [
  ...walked(here, "scenarios", /\.ts$/),
  ...walked(here, "search", /\.ts$/),
  ...walked(here, "fixtures", /\.ts$/),
  ...walked(here, "bench", /\.ts$/),
  ...walked(here, "reference", /\.ts$/), // re-check M2''': the suite's model of binding is an expected result too
  "main.ts",
  "output.ts",
  "falsify.ts",
  "broken-adapter.ts",
  "null-adapter.ts",
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
const roundFiles = (root: string) => [
  ...walked(root, "cli", /\.ts$/),
  ...walked(root, "typed", /\.ts$/),
  ...walked(root, "checks", /\.ts$/),
  ...walked(root, "reality", /\.ts$/),
  ...walked(root, ".", /^(mutants.*\.ts|run-plants\.sh|edge-plants\.py)$/).map((f) => f.slice(2)),
  "adapter.ts",
];
let roundDir: string | undefined;
const splitLock = (l: string): [string, string] => [l.slice(0, l.lastIndexOf(" ")), l.slice(l.lastIndexOf(" ") + 1)]; // a variant's name may hold spaces
// D134: one line per case: its name, a tab, its whole output.
const OUTPUTS = join(here, "expected-output.txt");
const outputs = (): Map<string, string> =>
  new Map(
    existsSync(OUTPUTS)
      ? readFileSync(OUTPUTS, "utf8").split("\n").filter(Boolean).map((l) => {
          const t = l.indexOf("\t");
          return [l.slice(0, t), l.slice(t + 1)] as [string, string];
        })
      : [],
  );
const lockLines = (): string[] => [
  ...allScenarios.map((s) => `${s.id} ${sha(bodyOf(s))}`),
  // D103: a variant is an expected result too. Its text is in its scenario's hash; this line is so that one gone is seen by name.
  ...allScenarios.flatMap((s) => Object.keys(s.variants ?? {}).map((v) => `variant:${s.id}/${v} present`)),
  ...SHARED.filter((f) => existsSync(join(here, f))).map((f) => `file:${f} ${shaFile(f, readFileSync(join(here, f), "utf8"))}`),
  ...(roundDir ? roundFiles(roundDir).filter((f) => existsSync(join(roundDir!, f))).map((f) => `round:${f} ${shaFile(f, readFileSync(join(roundDir!, f), "utf8"))}`) : []),
  ...[...outputs()].map(([k, v]) => `output:${k} ${sha(v)}`),
];

// The store failing, the core failing, a listener's storm: none has a closure or a turn to name. Surveyed (FLOW_ORIGIN_SURVEY=1): these three only.
const NO_ORIGIN = new Set(process.env["FLOW_ORIGIN_SURVEY"] ? [] : ["Fatal", "StorageFailure", "TurnStorm"]);
export const runScenarios = (
  make: () => Harness,
  cellsHit: Set<string> = new Set(),
  only?: ReadonlySet<string>,
  o: { outputs?: ReadonlyMap<string, string>; onResult?: (r: RunResult) => void; collect?: Map<string, string> } = {},
): RunResult[] => {
  const results: RunResult[] = [];
  const push = (r: RunResult) => {
    results.push(r);
    o.onResult?.(r);
  };
  for (const s of allScenarios) {
    if (only && !only.has(s.id)) continue;
    const cases: Array<[string | undefined, (c: Ctx) => void]> = s.run
      ? [[undefined, s.run]]
      : Object.entries(s.variants ?? {});
    const citedCells = s.cites.filter((x) => x.startsWith("cell:lane.")).map((x) => x.slice(5));
    const hitHere = new Set<string>();
    // A search is its own oracle, and makes thousands of harnesses: it is not tracked. Stated by the id's prefix.
    const isSearch = s.id.startsWith("SEARCH-");
    for (const [variant, body] of cases) {
      const t = performance.now();
      (globalThis as any).__kills = [];
      const v = variant ? { variant } : {};
      // D130: every harness this case makes, whoever made it. The checks below run on each, so a case that drives a second harness cannot leave them on an empty one.
      const tracked: Tracked[] = [];
      const makeTracked = (): Harness => {
        const h = make();
        if (isSearch) return h;
        const rec: Tracked = { h, actors: new Map(), hashes: new Set(), steps: 0 };
        // Tracked once it boots: a machine table the seal refuses has no harness to read (REV7-M2).
        const start = h.start;
        h.start = (cfg) => {
          start(cfg);
          tracked.push(rec);
        };
        const note = (step: any) => {
          for (const a of [step?.ensure, step?.send, step?.burst, step?.dispose]) if (a?.actor !== undefined) rec.actors.set(`${a.actor}/${a.id}`, a);
          rec.steps++;
        };
        const hashed = () => {
          try {
            rec.hashes.add(Bun.hash(h.read.stateHash())); // a number: a step's world text would hold gigabytes across a long case
          } catch {}
        };
        const { do: do_, raw, send } = h;
        h.do = (st) => {
          note(st);
          do_(st);
          hashed();
        };
        h.raw = (st) => {
          note(st);
          raw(st);
        };
        h.send = (a, event, payload) => {
          note({ send: a });
          send(a, event, payload);
        };
        return h;
      };
      const fresh = (machines = s.fixtures, bounds = s.bounds) => {
        const h = makeTracked();
        h.start({ machines, seed: 1, ...(bounds ? { bounds } : {}) });
        return h;
      };
      const named = openCase(s.namedIssues ?? []);
      try {
        const c = new Ctx(fresh(), s.actor);
        c.fresh = fresh;
        c.make = makeTracked;
        body(c);
        for (const { h } of tracked) {
          const r = h.read;
          const extra = r.issues().map((i) => i.code).filter((x) => !named.includes(x));
          if (extra.length) throw new Mismatch(`issues not named by the scenario: ${extra.join(", ")}`);
          // Rule 12, under-specification A07: an issue says where it came from. Only what has no closure or turn behind it may come without: the codes below, by what they are.
          const noOrigin = r.issues().filter((i) => !i.origin && !NO_ORIGIN.has(i.code)).map((i) => i.code);
          if (noOrigin.length) throw new Mismatch(`rule 12: an issue with no origin: ${[...new Set(noOrigin)].join(", ")}`);
          checkClaims(r);
          checkEndings(r);
          checkMints(r);
          // D145: money moved twice is never right by accident. A case that shows the hazard on purpose names it.
          const twice = r.appliedTwice();
          if (twice.length && !named.includes("AppliedTwice")) throw new Mismatch(`a key the server applied twice: ${twice.join(" ")}`);
          // D145: a resend of a key must be the same request. Another body is a refusal in production and a bug here.
          if (r.frozenDrops() > 0) throw new Mismatch(`D146: ${r.frozenDrops()} step(s) a frozen page cannot take`);
          if (r.bodyMismatches() > 0) throw new Mismatch(`a key resent with another body, ${r.bodyMismatches()} time(s)`);
          const rep = r.replay();
          if (!rep.same) throw new Mismatch(`S11 replay differs: ${JSON.stringify(rep.firstDiff)}`);
          const minted = new Set(r.evidence("mint").map((e) => e["attempt"]));
          for (const q of r.requests())
            if (
              q.idempotencyKey !== undefined &&
              !q.op.startsWith("drv") &&
              !q.idempotencyKey.startsWith("business:") && // D106: a key the server recognises, by design no Attempt's
              !minted.has(q.idempotencyKey)
            )
              throw new Mismatch(`key ${q.idempotencyKey} is no Attempt`);
          for (const e of r.evidence("lane")) {
            cellsHit.add(e["cell"]);
            hitHere.add(e["cell"]);
          }
        }
        // D134: the whole output, beside the named oracles. A case states what it does not care about.
        const nm = name({ id: s.id, ...v });
        let output: string | undefined;
        if (!isSearch && (o.outputs || o.collect)) {
          const got = JSON.stringify(caseOutput(tracked, (s.outputAllow?.sections ?? []) as readonly Section[]));
          o.collect?.set(nm, got);
          const want = o.outputs?.get(nm);
          if (o.outputs) {
            const d = want === undefined ? ["no expected output"] : diffOutput(want, got);
            if (d.length) output = d.join("; ");
          }
        }
        push({ id: s.id, ...v, ok: true, ms: performance.now() - t, ...(output ? { output } : {}) });
      } catch (e) {
        push({
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
    if (process.memoryUsage().rss > 5e8) Bun.gc(true); // a long case leaves gigabytes of world text for a GC that is in no hurry
    const missing = citedCells.filter((x) => !hitHere.has(x));
    const last = results.at(-1)!;
    if (missing.length && results.filter((r) => r.id === s.id).every((r) => r.ok)) {
      last.ok = false;
      last.why = `cites a cell no run hit: ${missing.join(", ")}`;
      o.onResult?.(last);
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
  // D126: `--first-lock` is for a suite with no history. A log with lines says there was one, so a moved lock is not a first run.
  if (!existsSync(LOCK) && has("--first-lock") && existsSync(LOG) && readFileSync(LOG, "utf8").includes(" hash:")) {
    console.log(`NO LOCK at ${LOCK}, and ${LOG} has history, so this is not a first run. Restore it from git.`);
    process.exit(1);
  }
  const old = new Map(existsSync(LOCK) ? readFileSync(LOCK, "utf8").trim().split("\n").map(splitLock) : []);
  const fullLog = existsSync(LOG) ? readFileSync(LOG, "utf8") : "";
  const log = fullLog;
  // D135: what the lock says proves nothing. For each id, the current hash is its frozen baseline, or the hash of its last line in the log, with a reason of its own. A pasted hash has no line.
  // The limit, stated: a hand can write a line with a poor reason, and can edit the baseline and BASELINE_SHA together. Both show in `git diff`, and review reads the reason. No local file can do better.
  const baselineText = existsSync(BASELINE) ? readFileSync(BASELINE, "utf8") : "";
  if (!has("--freeze-baseline") && createHash("sha1").update(baselineText).digest("hex") !== BASELINE_SHA) {
    console.log(`BASELINE at ${BASELINE} is not the one main.ts pins. Restore it from git.`);
    process.exit(1);
  }
  const baseline = new Map(baselineText.trim().split("\n").filter(Boolean).map(splitLock));
  const after = fullLog.includes(SCHEME) ? fullLog.slice(fullLog.indexOf(SCHEME)) : "";
  const logLines = after.split("\n").filter((l) => l.includes(" hash:"));
  const reasonOf = (l: string) => l.split(" | ").slice(1).join(" | ").trim();
  const uses = new Map<string, number>();
  for (const l of logLines) uses.set(reasonOf(l), (uses.get(reasonOf(l)) ?? 0) + 1);
  const lastLine = new Map<string, string>();
  for (const l of logLines) lastLine.set(l.slice(0, l.indexOf(" hash:")), l);
  const logged = (id: string, h: string) => {
    const l = lastLine.get(id);
    if (l === undefined) return baseline.get(id) === h;
    return l.startsWith(`${id} hash:${h} `) && reasonOf(l).length > 0 && uses.get(reasonOf(l))! <= BULK;
  };
  const now = lockLines().map(splitLock);
  const firstLock = !existsSync(LOCK);
  const needsLine = ([id, h]: [string, string]) => !firstLock && !id.startsWith("variant:") && !logged(id, h);
  const unlogged = now.filter(needsLine).map(([id]) => id);
  // D103, D135: an id the lock or the baseline had and the suite does not is a failure until a `removed:` line names it.
  const nowIds = new Set(now.map(([id]) => id));
  const gone = [...new Set([...old.keys(), ...baseline.keys()])].filter((id) => !nowIds.has(id) && !log.split("\n").some((l) => l.startsWith(`removed:${id} | `) && l.split(" | ")[1]!.trim().length > 0));
  const stale = has("--lock") ? [] : now.filter(([id, h]) => old.get(id) !== h).map(([id]) => id);
  if (has("--freeze-baseline")) {
    const text = lockLines().join("\n") + "\n";
    writeFileSync(BASELINE, text);
    writeFileSync(LOCK, text);
    console.log(`baseline frozen: sha ${createHash("sha1").update(text).digest("hex")}`);
    process.exit(0);
  }
  if (has("--hashes"))
    for (const e of now) if (needsLine(e)) console.log(`HASH ${e[0]} hash:${e[1]}`);
  if (has("--lock")) {
    // D113: the lock follows the log, never the other way. Review: weaken a case, `--lock`, and the next run is clean with no line.
    if (unlogged.length || gone.length) {
      console.log(`LOCK REFUSED. Log these first: ${[...unlogged, ...gone].join(" ")}`);
      process.exit(1);
    }
    writeFileSync(LOCK, lockLines().join("\n") + "\n");
    old.clear();
    for (const [k, v] of now) old.set(k, v);
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
  const onlySet = only ? new Set(only.split(",")) : undefined;
  const unknownOnly = onlySet ? [...onlySet].filter((x) => !allScenarios.some((s) => s.id === x)) : [];
  // D134: the plain pass only. `--swap` and a sweep of the environment have other outputs by design, and say what they compare.
  const plain = !arg("--swap") && !process.env["FLOW_RUNTIME_DEFAULT"] && !process.env["FLOW_CAPTURE_MS"] && !process.env["FLOW_DRAIN_MS"] && !has("--no-output");
  const collect = has("--write-output") ? new Map<string, string>() : undefined;
  const printed = new Set<RunResult>();
  const print = (r: RunResult) => {
    printed.add(r);
    console.log(
      `${r.ok && !r.output ? "PASS" : "FAIL"}  ${name(r).padEnd(52)}\t${r.ok ? (r.output ? `output: ${r.output}` : `${r.ms.toFixed(1)} ms`) : r.why}${r.trace ? `\n      ${r.trace}` : ""}`,
    );
  };
  const results = runScenarios(
    makeHarness(mod.port),
    cells,
    onlySet,
    { ...(plain && !collect ? { outputs: outputs() } : {}), onResult: print, ...(collect ? { collect } : {}) },
  );
  if (collect) {
    const merged = outputs();
    for (const [k, v] of collect) merged.set(k, v);
    // A full run knows every case: a line for a case no longer in the suite goes, and the lock's `removed:` rule asks why.
    if (!onlySet) for (const k of [...merged.keys()]) if (!collect.has(k)) merged.delete(k);
    writeFileSync(OUTPUTS, [...merged].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}\t${v}`).join("\n") + "\n");
    console.log(`expected-output.txt written: ${collect.size} cases`);
  }
  // A one-way check before: a scenario the catalog does not list was never noticed.
  if (!has("--no-catalog")) {
    const listed = new Set(catalog().map((r) => r.id));
    for (const s of allScenarios) if (!listed.has(s.id)) disagreements.push(`${s.id}: not in SCENARIOS.md`);
  }
  if (!has("--no-catalog")) printReports(
    round,
    allScenarios,
    cells,
    arg("--mutants") ? resolve(here, arg("--mutants")!) : undefined,
  );
  const pass = results.filter((r) => r.ok && !r.output).length;
  const nothing = results.length === 0 ? " NOTHING RAN." : "";
  if (unknownOnly.length) disagreements.push(`--only names no scenario: ${unknownOnly.join(" ")}`);
  console.log(
    `\nSUMMARY  ${pass}/${results.length} scenario cases pass;${nothing} of the rest, by output alone: ${results.filter((r) => r.ok && r.output).length}; unlogged expectation changes: ${unlogged.join(" ") || "none"}; removed with no log line: ${gone.join(" ") || "none"}; stale lock: ${stale.length}; catalog disagreements: ${disagreements.join("; ") || "none"}`,
  );
  // Stage G: how each delivery's recipient was settled (drive.ts `ears`). After SUMMARY, so a reader of the summary line is unchanged.
  console.log(`RECIPIENTS  observed ${recipients.observed}; ambiguous ${recipients.ambiguous}; with no copy recorded ${recipients.noCopy}; unplaceable ${recipients.unplaceable}; at a boot, counted not placed ${recipients.atBoot}; unobserved (allowance A2) ${recipients.unobserved}; runs paid by the suite's sends ${recipients.bySend}; left over (red) ${recipients.leftover}`);
  process.exitCode = results.length > 0 && pass === results.length && !unlogged.length && !gone.length && !stale.length && !disagreements.length ? 0 : 1;
}
