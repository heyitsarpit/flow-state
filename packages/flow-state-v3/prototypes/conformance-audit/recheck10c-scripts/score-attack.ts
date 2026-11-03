import { score, scoreAsked } from "/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/recheck10c/wt/packages/flow-state-v3/prototypes/round-10/reality/score.ts";
const show = (label: string, out: unknown, modes: string[]) => console.log(label.padEnd(44), scoreAsked(out, modes).code, JSON.stringify(scoreAsked(out, modes).bad).slice(0, 100));
// The old M1 reproductions, through what run.ts now calls.
show("old: {} asked s3", {}, ["s3"]);
show("old: bfcache:{}", { bfcache: {} }, ["bfcache"]);
show("old: twoCharge (misspelt) in crash", { crash: [{ twoCharge: 3 }], crashSummary: { cycles: 1, doubleCharge: 0, chargedNoLane: 0, fatal: 0, unsettled: 0 } }, ["crash"]);
// New attacks.
show("tabs: an empty object", { tabs: {} }, ["tabs"]);
show("tabs: an array of nothing", { tabs: [] }, ["tabs"]);
show("s3: rows of empty objects", { s3store: [{}], s3runtime: [{}] }, ["s3"]);
show("desk: one empty row", { desk: [{}] }, ["desk"]);
show("crash: summary cycles 0, rows [{}]", { crash: [{}], crashSummary: { cycles: 0, doubleCharge: 0, chargedNoLane: 0, fatal: 0, unsettled: 0 } }, ["crash"]);
show("atom: lostAcked misspelt beside", { atom: [{ lostAcked: 0, cycles: 0, lostAcke: 5 }] }, ["atom"]);
show("bfcache: zombie as a string elsewhere", { bfcache: { cached: true, back: "reload", bfcacheZombie: 0, bOwner: false, backSees: "A" } }, ["bfcache"]);
show("crash: doubleCharge -1", { crash: [{}], crashSummary: { cycles: 3, doubleCharge: -1, chargedNoLane: 0, fatal: 0, unsettled: 0 } }, ["crash"]);
console.log("plain score({}) still", score({}).code);
