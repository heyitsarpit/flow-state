// D144: the scorer of real runs must fail what it says it fails. Chrome is not run here; the scorer is, on made results and on the results this round keeps.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkItems, stated } from "../../conformance/verdicts/state.ts";

await stated("checks/score-check.ts", async () => {
const { score, scoreAsked } = await import("../reality/score.ts");
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
const crashRow = { how: "crash", killMs: 0, payDelay: 40, owner: true, before: "Card", restored: "Card", final: "Done", settled: true, keys: 1, arrived: 1, replays: 0, orders: 1, fatal: 0, issues: [], lanes: [], notSent: false };
const crashSum = { cycles: 1, doubleCharge: 0, chargedNoLane: 0, notSent: 0, fatal: 0, unsettled: 0, byRestored: { Card: 1 } };
asked("a counter misspelled", { crash: [crashRow], crashSummary: { ...crashSum, cycles: 3, doubleCharg: 3 } }, ["crash"], 1);
asked("crash, no rows", { crash: [], crashSummary: { ...crashSum, cycles: 0 } }, ["crash"], 1);
asked("crash, green", { crash: [crashRow], crashSummary: crashSum }, ["crash"], 0);
asked("atom row without its counter", { atom: [{ cycles: 3 }] }, ["atom"], 1);
// Re-check M2', D157: the attacks of `conformance-audit/recheck10c-scripts/score-attack.ts`, each red now.
asked("tabs: an empty object", { tabs: {} }, ["tabs"], 1);
asked("tabs: an array of nothing", { tabs: [] }, ["tabs"], 1);
asked("s3: rows of empty objects", { s3store: [{}], s3runtime: [{}] }, ["s3"], 1);
asked("desk: one empty row", { desk: [{}] }, ["desk"], 1);
asked("crash: zero cycles, a row of nothing", { crash: [{}], crashSummary: { ...crashSum, cycles: 0 } }, ["crash"], 1);
asked("crash: zero cycles, real rows", { crash: [crashRow], crashSummary: { ...crashSum, cycles: 0 } }, ["crash"], 1);
asked("atom: lostAcked misspelt beside", { atom: [{ how: "crash", durability: "strict", lostAcked: 0, cycles: 3, torn: 0, maxLag: 0, lostAcke: 5 }] }, ["atom"], 1);
asked("atom: zero cycles", { atom: [{ how: "crash", durability: "strict", lostAcked: 0, cycles: 0, torn: 0, maxLag: 0 }] }, ["atom"], 1);
asked("crash: doubleCharge -1", { crash: [crashRow], crashSummary: { ...crashSum, cycles: 3, doubleCharge: -1 } }, ["crash"], 1);
asked("crash row: keys -1", { crash: [{ ...crashRow, keys: -1 }], crashSummary: crashSum }, ["crash"], 1);
// Greens, so the reds above are about the attack.
asked("atom, green", { atom: [{ how: "crash", durability: "strict", lostAcked: 0, cycles: 3, torn: 0, maxLag: 0 }] }, ["atom"], 0);
asked("tabs, green", { tabs: { locksAvailable: true, a: true, b: false, bStartsEmpty: true, bEvidence: 1, afterACrashNewTab: true, diskStillA: "ti", bStillOpenWhenCOpened: true } }, ["tabs"], 0);
asked("desk, green", { desk: [{ name: "x", honest: true, unresolved: [], shows: {}, server: {}, repairs: 0, lists: 1, aborted: [], replayed: 0, issues: [], journal: [] }] }, ["desk"], 0);
const s3row = { rate: 1, messages: 100, n: 100, durability: "relaxed", mode: "json", syncMedianMs: 1, syncP99Ms: 2, commitMedianMs: 3, commitP99Ms: 4 };
const s3rt = { rate: 1, size: 100, n: 100, gapMs: 16, captureMs: 0, turnMedianMs: 1, turnP99Ms: 1, writes: 3, writeSyncMs: 1, commitMs: 1, mbWritten: 0.1, longTasks: 0, longTasksOnlyInTakeRecords: 0, seconds: 1 };
asked("s3, green", { s3store: [s3row], s3runtime: [s3rt] }, ["s3"], 0);
asked("s3: n zero", { s3store: [{ ...s3row, n: 0 }], s3runtime: [s3rt] }, ["s3"], 1);
// What this round has on disk, scored as it stands. A kept result that fails is a finding, printed, not hidden.
const dir = join(import.meta.dir, "../reality");
for (const f of readdirSync(dir).filter((x) => x.startsWith("results-") && x.endsWith(".json"))) {
  const s = score(JSON.parse(readFileSync(join(dir, f), "utf8")));
  console.log(`${f}: ${s.code ? `FAILS: ${s.bad.join("; ")}` : "passes"}`);
}
console.log(bad.length ? `FAIL\n${bad.join("\n")}` : "PASS score");
return checkItems("score", bad);
});
