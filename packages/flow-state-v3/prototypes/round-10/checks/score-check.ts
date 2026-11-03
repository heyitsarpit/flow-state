// D144: the scorer of real runs must fail what it says it fails. Chrome is not run here; the scorer is, on made results and on the results this round keeps.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { score } from "../reality/score.ts";

const bad: string[] = [];
const want = (label: string, out: unknown, code: 0 | 1) => {
  const s = score(out);
  if (s.code !== code) bad.push(`${label}: expected ${code}, got ${s.code} (${s.bad.join("; ")})`);
};
want("clean", { crash: { cycles: 40, twoCharges: 0, fatal: 0 } }, 0);
want("two charges, nested", { crash: { summary: { twoCharges: 1 } } }, 1);
want("an error", { error: "boom" }, 1);
want("a thaw error", { "thaw.error": "x" }, 1);
want("no answer", { rows: "NO ANSWER" }, 1);
want("unsettled", { tabs: [{ unsettled: 2 }] }, 1);
// What this round has on disk, scored as it stands. A kept result that fails is a finding, printed, not hidden.
const dir = join(import.meta.dir, "../reality");
for (const f of readdirSync(dir).filter((x) => x.startsWith("results-") && x.endsWith(".json"))) {
  const s = score(JSON.parse(readFileSync(join(dir, f), "utf8")));
  console.log(`${f}: ${s.code ? `FAILS: ${s.bad.join("; ")}` : "passes"}`);
}
console.log(bad.length ? `FAIL\n${bad.join("\n")}` : "PASS score");
process.exit(bad.length ? 1 : 0);
