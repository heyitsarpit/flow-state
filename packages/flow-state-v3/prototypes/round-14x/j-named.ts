// bun round-9/j-named.ts [--only a,b]: for each lost ending in `mutants-lost.ts`, how many cases fail, and how many of them say "(j)". The measure of D125. From prototypes/.
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { MUTANTS } from "./mutants-lost.ts";

const root = resolve(import.meta.dir, "..");
const nm = resolve(root, "../../../node_modules");
const i = process.argv.indexOf("--only");
const only = i < 0 ? undefined : new Set(process.argv[i + 1]!.split(","));
const scratch = mkdtempSync(join(tmpdir(), "flow-j-"));
symlinkSync(nm, join(scratch, "node_modules"));
let named = 0;
let n = 0;
for (const m of MUTANTS) {
  if (only && !only.has(m.id)) continue;
  n++;
  const dir = join(scratch, "m");
  rmSync(dir, { recursive: true, force: true });
  cpSync(join(root, "conformance"), join(dir, "conformance"), { recursive: true });
  cpSync(import.meta.dir, join(dir, "round-9"), { recursive: true });
  for (const [file, find, replace] of m.edits) {
    const p = join(dir, "round-9", file);
    const text = readFileSync(p, "utf8");
    const pattern = new RegExp(find.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"));
    if (!pattern.test(text)) throw new Error(`${m.id}: does not apply`);
    writeFileSync(p, text.replace(pattern, () => replace));
  }
  const r = Bun.spawnSync(["bun", join(dir, "conformance/watch.ts"), "--rss-mb", "1200", "--seconds", "60", "--", "bun", join(dir, "conformance/main.ts"), "--round", "99", "--no-catalog", "--runtime", "../round-9/adapter.ts"]);
  const out = r.stdout.toString();
  const fails = out.split("\n").filter((l) => l.startsWith("FAIL"));
  const j = fails.filter((l) => l.includes("(j)"));
  if (j.length) named++;
  console.log(`${m.id.padEnd(32)} failing ${String(fails.length).padStart(4)}  named by (j) ${String(j.length).padStart(4)}  ${out.includes("WATCH") ? (out.match(/WATCH.*/)?.[0] ?? "").includes("killed no") ? "" : "WATCHDOG" : ""}  ${j[0]?.match(/\(j\)[^;]*/)?.[0]?.slice(0, 70) ?? (fails[0]?.split(/\s+/)[1] ?? "SURVIVED")}`);
}
rmSync(scratch, { recursive: true, force: true });
console.log(`\n${named}/${n} named by (j)`);
