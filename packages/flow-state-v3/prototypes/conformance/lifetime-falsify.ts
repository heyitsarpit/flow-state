// The lifetime experiment's falsify: LIFE-01..04, green on the unmutated runtime, must go red by a named oracle on each wrong runtime of
// `mutants-lifetime.ts`. bun lifetime-falsify.ts --runtime ../round-14x/adapter.ts. Each copy sits in the OS temp folder, as mutate.ts's do.
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { watched } from "./watch.ts";

const here = import.meta.dir;
const i = process.argv.indexOf("--runtime");
const source = dirname(resolve(here, i < 0 ? "../round-14x/adapter.ts" : process.argv[i + 1]!));
const ONLY = "LIFE-01,LIFE-02,LIFE-03,LIFE-04,LIFE-05";
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
console.log(`${control.failed.length === 0 && control.passed.length === 7 ? "ok  " : "BAD "} control: ${control.passed.length} pass, ${control.failed.length} fail`);
if (control.failed.length) bad++;
for (const m of MUTANTS) {
  const r = await runOne(m.edits);
  const killed = r.failed.length > 0;
  if (!killed) bad++;
  console.log(`${killed ? "ok  " : "BAD "} ${m.id} (${m.kills.join(",")}): ${r.failed.length} red${killed ? `\n       ${r.failed.join("\n       ")}` : ""}`);
}
rmSync(scratch, { recursive: true, force: true });
console.log(bad === 0 ? "every lifetime mutant goes red" : `${bad} survivor(s) or a red control`);
process.exitCode = bad === 0 ? 0 : 1;
