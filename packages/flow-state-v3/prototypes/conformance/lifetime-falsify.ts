// Rule 73's falsify: LIFE-01..10, green on the unmutated runtime, must go red by a named oracle on each wrong runtime of
// `mutants-lifetime.ts`. bun lifetime-falsify.ts --runtime ../round-14x/adapter.ts. Each copy sits in the OS temp folder, as mutate.ts's do.
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { CLOCK_TRIP, judged } from "./watch.ts";

const here = import.meta.dir;
const i = process.argv.indexOf("--runtime");
const source = dirname(resolve(here, i < 0 ? "../round-14x/adapter.ts" : process.argv[i + 1]!));
// Round 14 (OD31): LIFE-01..30 as built, and the rewritten dispose cases whose result the rule changed.
const ONLY = [...Array.from({ length: 30 }, (_, k) => `LIFE-${String(k + 1).padStart(2, "0")}`).filter((id) => !["LIFE-19", "LIFE-20", "LIFE-25", "LIFE-26"].includes(id)), "REV5-H5H6", "FRAG-08", "R14-ID-01", "R14-ID-02", "R14-ID-03", "R14-IGN-01", "R14-IGN-02", "R14-IGN-03", "R14-F-01", "R14-FIX-01", "R14-FIX-02", "R14-FIX-03", "REV5-M1", "PAY-16", "SURV-08", "REV8-PINS"].join(",");
const { MUTANTS: ALL } = (await import(join(source, "mutants-lifetime.ts"))) as {
  MUTANTS: ReadonlyArray<{ id: string; kills: readonly string[]; edits: ReadonlyArray<readonly [string, string, string]> }>;
};
// `--mutants a,b` runs only those wrong runtimes (a quick check while building; the gate runs them all).
const pick = process.argv.indexOf("--mutants");
const MUTANTS = pick < 0 ? ALL : ALL.filter((m) => process.argv[pick + 1]!.split(",").some((p) => m.id.startsWith(p)));
const scratch = mkdtempSync(join(tmpdir(), "flow-life-"));
symlinkSync(resolve(here, "../../../../node_modules"), join(scratch, "node_modules"));
const flex = (find: string) => new RegExp(find.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"));
const unknown: string[] = [];
let runs = 0;
const runOne = async (edits: ReadonlyArray<readonly [string, string, string]>) => {
  const dir = join(scratch, `m-${runs++}`);
  rmSync(dir, { recursive: true, force: true });
  cpSync(here, join(dir, "conformance"), { recursive: true });
  cpSync(source, join(dir, basename(source)), { recursive: true });
  for (const [file, find, rep] of edits) {
    const p = join(dir, basename(source), file);
    const text = readFileSync(p, "utf8");
    if (!flex(find).test(text)) throw new Error(`edit does not apply to ${file}: ${find}`);
    writeFileSync(p, text.replace(flex(find), () => rep));
  }
  const r = await judged(
    ["bun", join(dir, "conformance/main.ts"), "--round", "99", "--no-catalog", "--no-output", "--runtime", `../${basename(source)}/adapter.ts`, "--only", ONLY],
    { rssMb: 1500, seconds: 120, capture: true },
  );
  // After the rerun alone, a run the load still answered (a time kill, a clock trip) says nothing: no FAIL of it counts as red.
  if (r.unknown !== undefined || r.killed === "time" || r.stdout.includes(CLOCK_TRIP)) unknown.push(edits.length ? edits[0]![0] : "control");
  rmSync(dir, { recursive: true, force: true });
  const lines = r.stdout.split("\n").filter((l) => !l.includes(CLOCK_TRIP));
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
// `--parallel N` (N <= 8): N wrong runtimes at once, each in its own copy; printed in list order.
const pi = process.argv.indexOf("--parallel");
const parallel = Math.min(8, Math.max(1, pi < 0 ? 1 : Number(process.argv[pi + 1]) || 1));
const everRed = new Set<string>();
const ran: Array<Promise<Awaited<ReturnType<typeof runOne>>>> = [];
const queue = MUTANTS.map((m, k) => [m, k] as const);
const slots: Array<(r: Awaited<ReturnType<typeof runOne>>) => void> = [];
for (let k = 0; k < MUTANTS.length; k++) ran.push(new Promise((res) => (slots[k] = res)));
void Promise.all(Array.from({ length: Math.min(parallel, queue.length) }, async () => {
  for (let x = queue.shift(); x; x = queue.shift()) slots[x[1]]!(await runOne(x[0].edits));
}));
for (const [k, m] of MUTANTS.entries()) {
  const r = await ran[k]!;
  const killed = r.failed.length > 0;
  if (!killed) bad++;
  for (const f of r.failed) everRed.add(f.split(":")[0]!.split("/")[0]!.trim());
  console.log(`${killed ? "ok  " : "BAD "} ${m.id} (${m.kills.join(",")}): ${r.failed.length} red${killed ? `\n       ${r.failed.join("\n       ")}` : ""}`);
}
const neverRed = [...new Set(control.passed.map((p) => p.split("/")[0]!.trim()))].filter((id) => !everRed.has(id));
console.log(neverRed.length === 0 ? "every case is red on some wrong runtime" : `never red: ${neverRed.join(" ")}`);
rmSync(scratch, { recursive: true, force: true });
if (unknown.length) console.log(`BAD  unknown under load, so these runs prove nothing: ${unknown.length}`);
console.log(bad === 0 && !unknown.length ? "every lifetime mutant goes red" : `${bad} survivor(s) or a red control${unknown.length ? `, ${unknown.length} unknown` : ""}`);
process.exitCode = bad === 0 && !unknown.length ? 0 : 1;
