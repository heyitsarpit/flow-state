// D144: the scorer of real runs must fail what it says it fails. Chrome is not run here; the scorer is, on made results and on the results this round keeps.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { score, scoreAsked } from "../reality/score.ts";

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
// Re-audit M1: a counter that is not a count fails anywhere; a run that ran nothing, or not what it was asked, fails by its asked modes.
want("a count as text", { crash: { twoCharges: "1" } }, 1);
want("a count that is NaN", { crash: { twoCharges: Number.NaN } }, 1);
const asked = (label: string, out: unknown, modes: readonly string[], code: 0 | 1) => {
  const s = scoreAsked(out, modes);
  if (s.code !== code) bad.push(`${label}: expected ${code}, got ${s.code} (${s.bad.join("; ")})`);
};
const greenBfcache = { bfcache: { cached: true, back: "reload", bOwner: true, backSees: "B", bfcacheZombie: 0 } };
asked("bfcache, green", greenBfcache, ["bfcache"], 0);
asked("nothing asked", {}, [], 1);
asked("a mode that does not exist", {}, ["nothing-here"], 1);
asked("asked and empty", {}, ["bfcache"], 1);
asked("asked, section empty", { bfcache: {} }, ["bfcache"], 1);
asked("bfcache not cached", { bfcache: { ...greenBfcache.bfcache, cached: false } }, ["bfcache"], 1);
asked("bfcache navigated, not reloaded", { bfcache: { ...greenBfcache.bfcache, back: "navigate" } }, ["bfcache"], 1);
asked("a counter misspelled", { crash: [{ keys: 1 }], crashSummary: { cycles: 3, doubleCharg: 3, chargedNoLane: 0, fatal: 0, unsettled: 0 } }, ["crash"], 1);
asked("crash, no rows", { crash: [], crashSummary: { cycles: 0, doubleCharge: 0, chargedNoLane: 0, fatal: 0, unsettled: 0 } }, ["crash"], 1);
asked("crash, green", { crash: [{ keys: 1 }], crashSummary: { cycles: 1, doubleCharge: 0, chargedNoLane: 0, fatal: 0, unsettled: 0 } }, ["crash"], 0);
asked("atom row without its counter", { atom: [{ cycles: 3 }] }, ["atom"], 1);
// What this round has on disk, scored as it stands. A kept result that fails is a finding, printed, not hidden.
const dir = join(import.meta.dir, "../reality");
for (const f of readdirSync(dir).filter((x) => x.startsWith("results-") && x.endsWith(".json"))) {
  const s = score(JSON.parse(readFileSync(join(dir, f), "utf8")));
  console.log(`${f}: ${s.code ? `FAILS: ${s.bad.join("; ")}` : "passes"}`);
}
console.log(bad.length ? `FAIL\n${bad.join("\n")}` : "PASS score");
process.exit(bad.length ? 1 : 0);
