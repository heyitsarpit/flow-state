// M4 recheck: the search-vacuity check's own fixture, plus actions that a budget-stopped search never reaches.
const P = "/private/tmp/claude-501/-Users-arpit--claude-spares-spare-cCgI4U/575b2ea3-def0-491f-9ce0-84ae4fd1afbf/scratchpad/recheck10c/wt/packages/flow-state-v3/prototypes";
const { makeHarness } = await import(`${P}/conformance/drive.ts`);
const { notesFixture } = await import(`${P}/conformance/fixtures/lab.compiled.ts`);
const { bfs } = await import(`${P}/conformance/search/engine.ts`);
const { port } = await import(`${P}/round-10/adapter.ts`);
const N = { actor: "Notes", id: "a" };
const make = makeHarness(port);
const run = (actions: any[]) =>
  bfs({ make: () => { const h = make(); h.start({ machines: [notesFixture], seed: 1 }); h.do({ ensure: N }); return h; }, actions, depth: 6, maxStates: 30, deadlineMs: 30_000, edge() {}, state() {} });
const live: any[] = [
  { name: "enter", step: { send: N, event: "SetDocs", payload: { docs: ["d1"] } } },
  { name: "leave", step: { send: N, event: "SetDocs", payload: { docs: [] } } },
  { name: "edit", step: { send: N, event: "Edited", payload: { body: "b" }, to: ["docs:d1"] }, on: (h: any) => h.read.inner(N, ["docs:d1"]) !== undefined },
];
const r = (label: string, acts: any[]) => { const x = run(acts); console.log(label.padEnd(52), x.verdict, JSON.stringify(x.deadActions ?? [])); };
r("control", live);
r("dead action, runs everywhere (the check's own)", [...live, { name: "nothing", step: { advance: 0 } }]);
r("dead action behind a guard that is never true", [...live, { name: "nothing", step: { advance: 0 }, on: () => false }]);
r("edit's guard broken to never true", [live[0], live[1], { ...live[2], on: () => false }]);
// Two of five unreached: 2*2 > 5 is false, so green.
r("two never-true guards of five", [...live, { name: "n1", step: { advance: 0 }, on: () => false }, { name: "n2", step: { advance: 0 }, on: () => false }]);
