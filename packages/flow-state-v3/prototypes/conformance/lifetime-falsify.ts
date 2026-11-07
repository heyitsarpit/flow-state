// Rule 73's falsify: LIFE-01..10, green on the unmutated runtime, must go red by a named oracle on each wrong runtime of
// `mutants-lifetime.ts`. bun lifetime-falsify.ts --runtime ../round-14x/adapter.ts. Each copy sits in the OS temp folder, as mutate.ts's do.
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { watched } from "./watch.ts";

const here = import.meta.dir;
const i = process.argv.indexOf("--runtime");
const source = dirname(resolve(here, i < 0 ? "../round-14x/adapter.ts" : process.argv[i + 1]!));
// Round 14 (OD31): LIFE-01..30 as built, and the rewritten dispose cases whose result the rule changed.
const ONLY = [...Array.from({ length: 30 }, (_, k) => `LIFE-${String(k + 1).padStart(2, "0")}`).filter((id) => !["LIFE-19", "LIFE-20", "LIFE-25", "LIFE-26"].includes(id)), "REV5-H5H6", "FRAG-08", "R14-ID-01", "R14-ID-02", "R14-ID-03", "R14-IGN-01", "R14-IGN-02", "R14-IGN-03", "R14-F-01"].join(",");
const { MUTANTS } = (await import(join(source, "mutants-lifetime.ts"))) as {
  MUTANTS: ReadonlyArray<{ id: string; kills: readonly string[]; edits: ReadonlyArray<readonly [string, string, string]> }>;
};
const scratch = mkdtempSync(join(tmpdir(), "flow-life-"));
symlinkSync(resolve(here, "../../../../node_modules"), join(scratch, "node_modules"));
const flex = (find: string) => new RegExp(find.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"));
const runOne = async (edits: ReadonlyArray<readonly [string, string, string]>) => {
  const dir = join(scratch, "m");
  rmSync(dir, { recursive: true, force: true });
  cpSync(here, join(dir, "conformance"), { recursive: true });
  cpSync(source, join(dir, basename(source)), { recursive: true });
  for (const [file, find, rep] of edits) {
    const p = join(dir, basename(source), file);
    const text = readFileSync(p, "utf8");
    if (!flex(find).test(text)) throw new Error(`edit does not apply to ${file}: ${find}`);
    writeFileSync(p, text.replace(flex(find), () => rep));
  }
  const r = await watched(
    ["bun", join(dir, "conformance/main.ts"), "--round", "99", "--no-catalog", "--no-output", "--runtime", `../${basename(source)}/adapter.ts`, "--only", ONLY],
    { rssMb: 1500, seconds: 120, capture: true },
  );
  const lines = r.stdout.split("\n");
  return {
    passed: lines.filter((l) => l.startsWith("PASS")).map((l) => l.slice(4).split("\t")[0]!.trim()),
    failed: lines.filter((l) => l.startsWith("FAIL")).map((l) => `${l.slice(4).split("\t")[0]!.trim()}: ${(l.split("\t")[1] ?? "").slice(0, 140)}`),
  };
};
let bad = 0;
const control = await runOne([]);
console.log(`${control.failed.length === 0 && control.passed.length > 0 ? "ok  " : "BAD "} control: ${control.passed.length} pass, ${control.failed.length} fail${control.failed.length ? `\n       ${control.failed.join("\n       ")}` : ""}`);
if (control.failed.length) bad++;
// Fail-then-pass: every case green on the control must be red on at least one wrong runtime.
const everRed = new Set<string>();
for (const m of MUTANTS) {
  const r = await runOne(m.edits);
  const killed = r.failed.length > 0;
  if (!killed) bad++;
  for (const f of r.failed) everRed.add(f.split(":")[0]!.split("/")[0]!.trim());
  console.log(`${killed ? "ok  " : "BAD "} ${m.id} (${m.kills.join(",")}): ${r.failed.length} red${killed ? `\n       ${r.failed.join("\n       ")}` : ""}`);
}
const neverRed = [...new Set(control.passed.map((p) => p.split("/")[0]!.trim()))].filter((id) => !everRed.has(id));
console.log(neverRed.length === 0 ? "every case is red on some wrong runtime" : `never red: ${neverRed.join(" ")}`);
rmSync(scratch, { recursive: true, force: true });
console.log(bad === 0 ? "every lifetime mutant goes red" : `${bad} survivor(s) or a red control`);
process.exitCode = bad === 0 ? 0 : 1;
