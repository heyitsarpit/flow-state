// One reader (VERDICTS-PROPOSAL-2.md 11.3, S1), by the source: outside verdicts/, no gate reads a child's output, ends itself, imports
// what it tests at load, or lets a clock into what it states. Each exemption is a line pattern here with its reason. bun plants/reader-check.ts
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
  join(conf, "plants/blackbox.ts"),
  join(conf, "plants/work-peak.ts"),
  ...ts(join(round, "checks")),
  join(round, "cli/main.ts"),
  join(round, "typed/compare.ts"),
  join(round, "typed/date-check.ts"),
];
const SCANNED = [...new Set([...ENTRIES, ...ts(conf), ...ts(join(conf, "verdicts"))])];
const rel = (f: string) => relative(conf, f);
const READERS = new Set(["verdicts/spawn.ts", "verdicts/read.ts", "verdicts/verdict.ts", "verdicts/runner.ts", "verdicts/snapshot.ts", "verdicts/state.ts", "verdicts/programs.ts", "verdicts/core.ts"]);
const WHOLE: Readonly<Record<string, string>> = {
  "watch.ts": "a person's command line, not a gate: it ends with its child's exit",
  "plants/reader-check.ts": "it holds the patterns",
};
type Allow = { readonly re: RegExp; readonly why: string };
const ALLOW: Readonly<Record<string, readonly Allow[]>> = {
  "plants/plants.ts": [
    { re: /script\("(budget|top|stamp|interrupted|broken-module)"|^\s*\["(stderr-1mb|stdout-20mb|silent|disagree|forged|foreign|on-stderr|sigterm|throws-at-load|emfile)", |gate\("escaped"/, why: "a planted child's source, written to break the contract on purpose" },
    { re: /Bun\.spawnSync\(\["(pgrep|ps)"/, why: "a plant checks that nothing of its own is left running" },
  ],
  "plants/blackbox.ts": [
    { re: /\$\{out\}\\n\$\{err\}`\.split|out\.split\("\\n"\)\.filter\(\(l\) => l\.startsWith\("VERDICT "\)\)|JSON\.parse\(v\.slice\(8\)\)/, why: "the old commit's human output, which has nothing else to read" },
    { re: /Bun\.spawnSync\(\["(pgrep|ps|git|sh)"|stdout\.toString\(\)\.(split|trim)|x\.exitCode !== 0|out\.includes\(pid\)/, why: "the driver's own process and export bookkeeping" },
    { re: /edits: \[\[|^\s*(old|new): \[\[/, why: "a plant's edit, a string written into the exported tree" },
  ],
  "../round-14/cli/main.ts": [{ re: /JSON\.parse\((r|unknownState|\(await run)|\.test\(txt\.out\)|r\.out \? JSON\.parse/, why: "the flow CLI, a program under test, read through programOutput" }],
};
const CLOCKS: Readonly<Record<string, RegExp>> = {
  "search/run.ts": /const t0 = performance\.now\(\)|SEARCH-COST/,
  "suite.ts": /const t = performance\.now\(\)|ms: performance\.now\(\) - t/,
  "graph-gate.ts": /const t0 = performance\.now\(\)|seconds: Math\.round\(\(performance\.now\(\) - t0\)/,
  "gates.ts": /const t0 = performance\.now\(\)|GATES  \$\{n\("pass"\)\}/,
  "plants/plants.ts": /const t0 = performance\.now\(\)|Math\.round\(performance\.now\(\) - t0\)|Bun\.write\(process\.argv\[2\], String\(Date\.now\(\)\)\)/,
  "plants/blackbox.ts": /const t0 = performance\.now\(\)|const ms = Math\.round\(performance\.now\(\) - t0\)/,
};
const output = /\b(stdout|stderr)\b[^;]*\.(split|match|includes|test|startsWith|search|indexOf|replace)\(|\b(out|err)\.(split|match|includes|startsWith|search|indexOf|replace)\(|\.(test|match|exec)\(\s*(\w+\.)?(stdout|stderr|out|err)\s*\)/;

await stated("reader-check", async () => {
  const bad: string[] = [];
  for (const f of SCANNED) {
    const name = rel(f);
    if (READERS.has(name) || WHOLE[name] !== undefined) continue;
    const text = readFileSync(f, "utf8");
    text.split("\n").forEach((raw, i) => {
      const l = raw.replace(/(^|\s)\/\/.*$/, "");
      const at = `${name}:${i + 1}`;
      if ((ALLOW[name] ?? []).some((x) => x.re.test(l))) return;
      if (output.test(l) && !/process\.(stdout|stderr)|Bun\.(stdout|stderr)/.test(l)) bad.push(`${at}: a child's output searched`);
      if (/\.(stdout|stderr)\.toString\(\)/.test(l) && !/git", "rev-parse"/.test(l)) bad.push(`${at}: a child's output read`);
      if (/startsWith\("(PASS|FAIL)/.test(l)) bad.push(`${at}: PASS/FAIL lines parsed`);
      if (/\.exitCode\s*[!=]==|\.code\s*[!=]==\s*\d/.test(l) && !/Bun\.spawnSync\(\["(pgrep|git)"/.test(l)) bad.push(`${at}: an exit compared outside read`);
      if (/process\.exit(Code)?\b/.test(l)) bad.push(`${at}: the process ends itself; only stated does`);
      if (/\b(Date\.now|performance\.now)\(\)/.test(l) && !(CLOCKS[name]?.test(l) ?? false)) bad.push(`${at}: a clock outside the evidence-only places`);
    });
    if (ENTRIES.includes(f))
      for (const m of text.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)";/gm))
        if (m[1] === undefined && !m[2]!.startsWith("node:") && !m[2]!.endsWith("verdicts/state.ts")) bad.push(`${name}: a static import of ${m[2]}, loaded before stated`);
  }
  for (const b of bad) console.log(`FAIL  ${b}`);
  console.log(bad.length ? "READER FAIL" : `READER PASS  ${SCANNED.length} files, ${ENTRIES.length} gate entries`);
  return checkItems("one reader", bad);
});
