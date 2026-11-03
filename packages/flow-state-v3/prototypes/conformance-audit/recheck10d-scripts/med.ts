// M1' residue and M2' attacks at ef3e1fa9, on scratch copies.
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const P = "/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/recheck10d/wt/packages/flow-state-v3/prototypes";
const { score, scoreAsked } = await import(join(P, "round-10/reality/score.ts"));
const show = (label: string, out: unknown, modes: string[]) => console.log("SCORE", label.padEnd(44), scoreAsked(out, modes).code, JSON.stringify(scoreAsked(out, modes).bad).slice(0, 110));
show("old: {} asked s3", {}, ["s3"]);
show("tabs: an empty object", { tabs: {} }, ["tabs"]);
show("tabs: an array of nothing", { tabs: [] }, ["tabs"]);
show("s3: rows of empty objects", { s3store: [{}], s3runtime: [{}] }, ["s3"]);
show("desk: one empty row", { desk: [{}] }, ["desk"]);
show("crash: cycles 0, rows [{}]", { crash: [{}], crashSummary: { cycles: 0, doubleCharge: 0, chargedNoLane: 0, fatal: 0, unsettled: 0 } }, ["crash"]);
show("atom: misspelt beside", { atom: [{ lostAcked: 0, cycles: 1, lostAcke: 5 }] }, ["atom"]);
show("crash: doubleCharge -1", { crash: [{}], crashSummary: { cycles: 3, doubleCharge: -1, chargedNoLane: 0, fatal: 0, unsettled: 0 } }, ["crash"]);
show("atom: NaN-ish string count", { atom: [{ lostAcked: "0", cycles: 1 }] }, ["atom"]);
show("atom: cycles 0.5", { atom: [{ lostAcked: 0, cycles: 0.5 }] }, ["atom"]);
console.log("SCORE plain score({}) still", score({}).code);
// M1' residue: a directive kept, its line now erroring for another reason (a typo), so the pin no longer tests what its words say.
const root = mkdtempSync(join(P, "../../../../m1-"));
try {
  symlinkSync("/Users/arpit/Developer/flow-state/node_modules", join(root, "node_modules"));
  cpSync(join(P, "round-10"), join(root, "round-10"), { recursive: true });
  cpSync(join(P, "conformance"), join(root, "conformance"), { recursive: true });
  const f = join(root, "round-10/typed/type-tests.ts");
  const s = readFileSync(f, "utf8");
  const t = s.replace('key: ["b"], concurrency: "reject"', 'key: ["a"], concurrency: "rejct"');
  console.log("M1 tamper applied", t !== s);
  writeFileSync(f, t);
  const p = Bun.spawnSync(["bun", join(root, "round-10/checks/types-check.ts")], { stdin: "ignore", timeout: 160_000 });
  console.log("M1 typo-under-directive:", p.exitCode, p.stdout.toString().trim().split("\n").slice(-2).join(" | "));
} finally {
  rmSync(root, { recursive: true, force: true });
}
