// Re-audit M4: a search stopped by its budget is not green when an action it ran never moved the state. Before, half the actions could be dead.
// Real runtime, real fixture, one action that runs everywhere and does nothing (an empty advance), and a budget that ends the search first.
import { makeHarness } from "../../conformance/drive.ts";
import { notesFixture } from "../../conformance/typed/lab-machines.ts";
import { bfs, type Action } from "../../conformance/search/engine.ts";
import { port } from "../adapter.ts";

const N = { actor: "Notes", id: "a" };
const make = makeHarness(port);
const run = (actions: readonly Action[]) =>
  bfs({
    make: () => {
      const h = make();
      h.start({ machines: [notesFixture], seed: 1 });
      h.do({ ensure: N });
      return h;
    },
    actions,
    depth: 6,
    maxStates: 30,
    deadlineMs: 30_000,
    edge() {},
    state() {},
  });
const live: Action[] = [
  { name: "enter", step: { send: N, event: "SetDocs", payload: { docs: ["d1"] } } },
  { name: "leave", step: { send: N, event: "SetDocs", payload: { docs: [] } } },
  { name: "edit", step: { send: N, event: "Edited", payload: { body: "b" }, to: ["docs:d1"] }, on: (h) => h.read.inner(N, ["docs:d1"]) !== undefined },
];
const bad: string[] = [];
const green = run(live);
if (green.verdict !== "inconclusive" && green.verdict !== "completed") bad.push(`control: ${green.verdict} ${JSON.stringify(green.deadActions)}, wanted a budget-stopped green`);
const dead = run([...live, { name: "nothing", step: { advance: 0 } }]);
if (dead.verdict !== "vacuous") bad.push(`one dead action of four, budget-stopped: ${dead.verdict}, wanted vacuous`);
console.log(bad.length ? `FAIL\n${bad.join("\n")}` : `PASS search vacuity (control ${green.verdict}, dead ${dead.verdict} ${JSON.stringify(dead.deadActions)})`);
process.exit(bad.length ? 1 : 0);
