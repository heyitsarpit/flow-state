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
const source = resolve(here, arg("--runtime", "../round-5"));
const listFile = resolve(source, arg("--list", "mutants.ts"));
const out = resolve(source, arg("--out", "mutants.json"));
const author = arg("--author", "builder");
const only = arg("--only", "");
const checkOnly = process.argv.includes("--check");
const { MUTANTS } = (await import(listFile)) as { MUTANTS: readonly Mutant[] };
const rootModules = resolve(here, "../../../../node_modules");
const scratch = mkdtempSync(join(tmpdir(), "flow-mut-"));
symlinkSync(rootModules, join(scratch, "node_modules"));
const results: unknown[] = [];
const notApplied: string[] = [];
let survived = 0;
const list = only ? MUTANTS.filter((m) => only.split(",").includes(m.id)) : MUTANTS;
for (const m of list) {
  const dir = join(scratch, "m");
  rmSync(dir, { recursive: true, force: true });
  cpSync(here, join(dir, "conformance"), { recursive: true });
  cpSync(source, join(dir, basename(source)), { recursive: true });
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
  const r = await watched(
    [
      "bun",
      join(dir, "conformance/mutate-one.ts"),
      "--runtime",
      `../${basename(source)}/adapter.ts`,
    ],
    { rssMb: 1400, seconds: 120, capture: true },
  );
  const line = r.stdout.trim().split("\n").at(-1) ?? "";
  let parsed: { killers: string[]; search: string } | undefined;
  try {
    parsed = JSON.parse(line);
  } catch {
    parsed = undefined;
  }
  const killers = parsed?.killers ?? [];
  const killed = r.killed !== null || killers.length > 0 || parsed?.search === "failed" || !parsed;
  if (!killed) survived++;
  results.push({
    id: m.id,
    kills: m.kills,
    killed,
    killers,
    author,
    by: r.killed ?? (parsed ? "tests" : "crash"),
    peakMb: r.peakMb,
  });
  console.log(
    `${killed ? "KILLED  " : "SURVIVED"} ${m.id.padEnd(36)} ${r.killed ? `watchdog ${r.killed} at ${r.peakMb} MB` : parsed ? `${killers.length} cases: ${killers.slice(0, 4).join(" ")}${killers.length > 4 ? " ..." : ""}${parsed.search === "failed" ? " + search" : ""}` : `crash: ${r.stdout.slice(-200)}`}`,
  );
}
rmSync(scratch, { recursive: true, force: true });
writeFileSync(out, JSON.stringify(results, null, 1));
console.log(`\nnot applied (${notApplied.length}):\n${notApplied.join("\n")}`);
console.log(`\n${results.length - survived}/${results.length} killed (${author})`);
