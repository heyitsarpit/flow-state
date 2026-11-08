// One reader (VERDICTS-PROPOSAL-2.md 11.3, S1), by the source: outside verdicts/, no gate reads a child's output, ends itself, imports
// what it tests at load, or lets a clock into what it states. Each exemption is named here with its reason. bun plants/reader-check.ts
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { checkItems, stated } from "../verdicts/state.ts";

const conf = join(import.meta.dir, "..");
const round = join(conf, "../round-14");
const ts = (dir: string) => readdirSync(dir).filter((f) => f.endsWith(".ts")).sort().map((f) => join(dir, f));
const ENTRIES = [
  ...["main.ts", "gates.ts", "mutate.ts", "mutate-one.ts", "gate5s.ts", "falsify.ts", "lifetime-falsify.ts", "graph-gate.ts"].map((f) => join(conf, f)),
  join(conf, "search/run.ts"),
  join(conf, "plants/plants.ts"),
  join(conf, "plants/reader-check.ts"),
  ...ts(join(round, "checks")),
  join(round, "cli/main.ts"),
  join(round, "typed/compare.ts"),
  join(round, "typed/date-check.ts"),
];
const SCANNED = [...new Set([...ENTRIES, ...ts(conf), join(conf, "plants/blackbox.ts"), ...ts(join(conf, "verdicts"))])];
const rel = (f: string) => relative(conf, f);
const READERS = new Set(["verdicts/spawn.ts", "verdicts/read.ts", "verdicts/verdict.ts", "verdicts/runner.ts", "verdicts/snapshot.ts", "verdicts/state.ts"]);
const EXEMPT: Readonly<Record<string, string>> = {
  "plants/blackbox.ts": "it reads the old commit's human output, which has nothing else",
  "watch.ts": "a person's command line, not a gate: it ends with its child's exit",
  "plants/reader-check.ts": "it holds the patterns",
};
const EXEMPT_LINES: Readonly<Record<string, ReadonlyArray<{ readonly re: RegExp; readonly why: string }>>> = {
  "plants/plants.ts": [
    { re: /script\(|\bgate\("|^\s*\["[a-z0-9-]+", /, why: "a planted child's source, written to break the contract on purpose" },
    { re: /Bun\.spawnSync\(\["(pgrep|ps)"/, why: "a plant checks that nothing of its own is left running" },
  ],
  "../round-14/checks/types-check.ts": [{ re: /\((p|q)\.stdout \+ (p|q)\.stderr\)|const out = p\.stdout \+ p\.stderr/, why: "tsc, a program under test, read through programOutput" }],
};
const CLOCKS: Readonly<Record<string, string>> = {
  "verdicts/spawn.ts": "the watchdog's time limit and the run's evidence ms",
  "verdicts/runner.ts": "the global budget",
  "search/run.ts": "the SEARCH-COST human line",
  "suite.ts": "the PASS line's ms, for people",
  "graph-gate.ts": "the GRAPH-GATE line's seconds, left out of its items",
  "gates.ts": "the GATES line's wall time",
  "plants/plants.ts": "evidence lines and the alone-order stamps",
  "plants/blackbox.ts": "the plant table's wall time",
};

await stated("reader-check", async () => {
  const bad: string[] = [];
  for (const f of SCANNED) {
    const name = rel(f);
    if (READERS.has(name)) continue;
    const text = readFileSync(f, "utf8");
    const lines = text.split("\n");
    lines.forEach((raw, i) => {
      const l = raw.replace(/(^|\s)\/\/.*$/, "");
      const at = `${name}:${i + 1}`;
      if (EXEMPT[name] === undefined && !(EXEMPT_LINES[name] ?? []).some((x) => x.re.test(l))) {
        if (/\b(stdout|stderr)\b[^;]*\.(split|match|includes|test|startsWith|search|indexOf|replace)\(/.test(l) && !/process\.(stdout|stderr)|Bun\.(stdout|stderr)/.test(l)) bad.push(`${at}: a child's output searched`);
        if (/\.(stdout|stderr)\.toString\(\)/.test(l) && !/git", "rev-parse"/.test(l)) bad.push(`${at}: a child's output read`);
        if (/startsWith\("(PASS|FAIL)/.test(l)) bad.push(`${at}: PASS/FAIL lines parsed`);
        if (/\.exitCode\s*[!=]==|\.code\s*[!=]==\s*\d/.test(l) && !/Bun\.spawnSync\(\["(pgrep|git)"/.test(l)) bad.push(`${at}: an exit compared outside read`);
        if (/process\.exit(Code)?\b/.test(l)) bad.push(`${at}: the process ends itself; only stated does`);
      }
      if (/\b(Date\.now|performance\.now)\(\)/.test(l) && CLOCKS[name] === undefined && EXEMPT[name] === undefined) bad.push(`${at}: a clock outside the evidence-only places`);
    });
    if (ENTRIES.includes(f))
      for (const m of text.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)";/gm))
        if (m[1] === undefined && !m[2]!.startsWith("node:") && !m[2]!.endsWith("verdicts/state.ts")) bad.push(`${name}: a static import of ${m[2]}, loaded before stated`);
  }
  for (const b of bad) console.log(`FAIL  ${b}`);
  console.log(bad.length ? "READER FAIL" : `READER PASS  ${SCANNED.length} files, ${ENTRIES.length} gate entries`);
  return checkItems("one reader", bad);
});
