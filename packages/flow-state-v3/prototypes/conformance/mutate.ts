// bun mutate.ts --runtime ../round-2 --list mutants.ts --out mutants.json
// One process per mutant, in the OS temp folder, under the watchdog (review L3; a mutant reached 11.9 GB in round 1). Each
// mutant is a source edit of a scratch copy. An edit that no longer applies fails the run, so the list cannot rot silently.
// A mutant the watchdog kills counts as killed, by resources, and says so.
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { watched } from "./watch.ts";

export type Mutant = {
  id: string;
  kills: readonly string[]; // the ids this mutant breaks: citations it can prove (D33)
  edits: ReadonlyArray<readonly [file: string, find: string, replace: string]>;
};
const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(k);
  return i < 0 ? d : process.argv[i + 1]!;
};
const here = import.meta.dir;
const source = resolve(here, arg("--runtime", "../round-6"));
const listFile = resolve(source, arg("--list", "mutants.ts"));
const out = resolve(source, arg("--out", "mutants.json"));
const author = arg("--author", "builder");
const only = arg("--only", "");
const checkOnly = process.argv.includes("--check");
const withSearch = process.argv.includes("--search");
const searchOnly = process.argv.includes("--search-only");
const extra = [...(withSearch ? ["--search"] : []), ...(searchOnly ? ["--search-only"] : [])];
const { MUTANTS } = (await import(listFile)) as { MUTANTS: readonly Mutant[] };
const rootModules = resolve(here, "../../../../node_modules");
const scratch = mkdtempSync(join(tmpdir(), "flow-mut-"));
symlinkSync(rootModules, join(scratch, "node_modules"));
const results: unknown[] = [];
// Round 10: one snapshot of the sources at the start. Copying the live folder per mutant let an edit made during a run reach the later mutants: the first rerun of stage A's list was killed by 605 cases of a half-made edit.
const pristine = join(scratch, "pristine");
cpSync(here, join(pristine, "conformance"), { recursive: true });
cpSync(source, join(pristine, basename(source)), { recursive: true });
// D101: the control. A gate that fails on the unmutated code kills every mutant that reaches it: that is what round 7's three search-only kills were (RESULTS). So it runs first, and a failure stops the run.
{
  const dir = join(scratch, "control");
  cpSync(join(pristine, "conformance"), join(dir, "conformance"), { recursive: true });
  cpSync(join(pristine, basename(source)), join(dir, basename(source)), { recursive: true });
  const r = await watched(["bun", join(dir, "conformance/mutate-one.ts"), "--runtime", `../${basename(source)}/adapter.ts`, ...extra], {
    rssMb: 1700,
    seconds: 240,
    capture: true,
  });
  const line = r.stdout.trim().split("\n").at(-1) ?? "";
  const killedBy = (() => {
    try {
      return JSON.parse(line).killedBy as string | null;
    } catch {
      return "no answer";
    }
  })();
  rmSync(dir, { recursive: true, force: true });
  if (killedBy !== null || r.killed !== null) {
    rmSync(scratch, { recursive: true, force: true });
    console.log(`CONTROL FAILED: the unmutated code is killed by ${r.killed ?? killedBy}: ${line.slice(0, 400)}`);
    process.exit(2);
  }
  console.log(`control: the unmutated code passes every gate (${(r.ms / 1000).toFixed(0)} s)`);
}
const invalid: string[] = [];
const byWatchdog: string[] = [];
let survived = 0;
const list = only ? MUTANTS.filter((m) => only.split(",").includes(m.id)) : MUTANTS;
for (const m of list) {
  const dir = join(scratch, "m");
  rmSync(dir, { recursive: true, force: true });
  cpSync(join(pristine, "conformance"), join(dir, "conformance"), { recursive: true });
  cpSync(join(pristine, basename(source)), join(dir, basename(source)), { recursive: true });
  for (const [file, find, replace] of m.edits) {
    const p = join(dir, basename(source), file);
    const text = readFileSync(p, "utf8");
    const pattern = new RegExp(
      find
        .split(/\s+/)
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("\\s*"),
    );
    if (!pattern.test(text)) throw new Error(`${m.id}: edit does not apply to ${file}: ${find}`);
    writeFileSync(
      p,
      text.replace(pattern, () => replace),
    );
  }
  // D113: a mutant that does not parse says nothing about the tests.
  const unparsed = m.edits.flatMap(([file]) => {
    try {
      new Bun.Transpiler({ loader: "ts" }).scan(readFileSync(join(dir, basename(source), file), "utf8"));
      return [];
    } catch (e) {
      return [`${file}: ${String(e).slice(0, 120)}`];
    }
  });
  if (unparsed.length) {
    invalid.push(m.id);
    console.log(`INVALID  ${m.id.padEnd(36)} does not parse: ${unparsed[0]}`);
    results.push({ id: m.id, kills: m.kills, killed: false, killers: [], author, by: "invalid", peakMb: 0 });
    continue;
  }
  const r = await watched(
    [
      "bun",
      join(dir, "conformance/mutate-one.ts"),
      "--runtime",
      `../${basename(source)}/adapter.ts`,
      ...extra,
    ],
    { rssMb: 1700, seconds: 240, capture: true },
  );
  const line = r.stdout.trim().split("\n").at(-1) ?? "";
  let parsed: { killedBy: string | null; killers: string[]; search: string } | undefined;
  try {
    parsed = JSON.parse(line);
  } catch {
    parsed = undefined;
  }
  const killers = parsed?.killers ?? [];
  // D132, bugs M2: it parsed and the control ran, so a run with no answer is a run this mutant broke. Killed, by `crash`, and counted apart: it shrank the denominator before.
  if (r.killed !== null) byWatchdog.push(m.id);
  const killed = r.killed !== null || !parsed || (parsed?.killedBy ?? null) !== null;
  if (!killed) survived++;
  results.push({
    id: m.id,
    kills: m.kills,
    killed,
    killers,
    author,
    by: r.killed ?? (parsed ? (parsed.killedBy ?? "survived") : "crash"),
    peakMb: r.peakMb,
  });
  console.log(
    `${killed ? "KILLED  " : "SURVIVED"} ${m.id.padEnd(36)} ${r.killed ? `watchdog ${r.killed} at ${r.peakMb} MB` : parsed ? `${parsed.killedBy ?? "nothing"}: ${killers.length}: ${killers.slice(0, 4).join(" ")}${killers.length > 4 ? " ..." : ""}` : `crash: ${r.stdout.slice(-200)}`}`,
  );
}
rmSync(scratch, { recursive: true, force: true });
writeFileSync(out, JSON.stringify(results, null, 1));
console.log(`\n${results.length - survived - invalid.length}/${results.length - invalid.length} killed (${author}); by the watchdog: ${byWatchdog.join(" ") || "none"}; invalid: ${invalid.join(" ") || "none"}`);
