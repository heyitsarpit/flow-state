// Re-audit H2: D91's compile-time pins are a gate. `tsc` on `typed/tsconfig.json`: every `@ts-expect-error` must be an error, and the
// typed front end must compile. Each directive is counted too, so a pin deleted with its line is seen even when `tsc` stays green.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const typed = join(import.meta.dir, "../typed");
let dir = import.meta.dir;
while (!existsSync(join(dir, "node_modules/.bin/tsc")) && dirname(dir) !== dir) dir = dirname(dir);
const tsc = join(dir, "node_modules/.bin/tsc");
if (!existsSync(tsc)) {
  console.log("FAIL  types: no tsc found");
  process.exit(1);
}
const p = Bun.spawnSync([tsc, "-p", join(typed, "tsconfig.json")], { stdin: "ignore", timeout: 150_000 });
const out = p.stdout.toString() + p.stderr.toString();
const bad: string[] = [];
if (p.exitCode !== 0) bad.push(`tsc exit ${p.exitCode}: ${out.split("\n").filter(Boolean).slice(0, 3).join(" | ")}`);
// The pins this round states. A refusal removed with its directive compiles; this count does not.
const PINS = 9;
const n = (readFileSync(join(typed, "type-tests.ts"), "utf8").match(/@ts-expect-error/g) ?? []).length;
if (n !== PINS) bad.push(`type-tests.ts holds ${n} @ts-expect-error pins, ${PINS} stated`);
for (const b of bad) console.log(`FAIL  types: ${b}`);
console.log(bad.length ? "TYPES FAIL" : `TYPES PASS  tsc clean, ${n} pins`);
process.exit(bad.length ? 1 : 0);
