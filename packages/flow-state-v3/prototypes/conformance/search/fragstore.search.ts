// SEARCH-FRAGSTORE: a trait's write on the entity store, persisted, crossed with freeze, dispose, rebind and reload. The crossing
// nobody had tried (method step 2). Above the usual oracles, D66's: **no silent wrongness**. When nothing is outstanding and the store
// shows a record unmarked, unpredicted, it must be what the server holds.
import { thingRef, traitStoreFixture, type StoreShape } from "../fixtures/desk.compiled.ts";
import type { Answer, Harness, Step } from "../harness.ts";
import { checkClaims, checkEndings, checkMints } from "../scenarios/ctx.ts";
import { bfs, Oracle, type Action, type Report } from "./engine.ts";

const A = { actor: "Lab/TraitStore", id: "a" };
const open = (op: string) => (h: Harness) => h.read.outside().open.some((o) => o.op === op && !o.never);
const storage = (h: Harness) => h.read.outside().storage.some((s) => !s.hung && s.purpose !== "flush");
const COMMITS = 3;
const answers: ReadonlyArray<readonly [string, Answer]> = [
  ["ok", { apply: true }],
  ["fail", { fail: { tag: "Refused" } }],
  ["lost", { lost: true }],
  ["landed", { applyLost: true }],
];
const ACTIONS: readonly Action[] = [
  { name: "Go", step: { send: A, event: "Go", payload: { v: -1 }, to: ["t"] } },
  { name: "Resend", step: { send: A, event: "Resend", to: ["t"] } },
  { name: "GiveUp", step: { send: A, event: "GiveUp", to: ["t"] } },
  { name: "Fetch", step: { send: A, event: "Fetch", to: ["t"] } },
  ...answers.map(([n, a]): Action => ({ name: `put.${n}`, step: { answer: "put", with: a }, on: open("put") })),
  { name: "fetch.truth", step: { answer: "fetch", with: { truth: true } }, on: open("fetch") },
  { name: "repair.truth", step: { answer: "repair", with: { truth: true } }, on: open("repair") },
  { name: "repair.fail", step: { answer: "repair", with: { fail: { tag: "NoResponse" } } }, on: open("repair") },
  { name: "ack", step: { storage: "ack" }, on: storage },
  { name: "refuse", step: { storage: "refuse" }, on: storage },
  { name: "Away", step: { send: A, event: "Away" } },
  { name: "Back", step: { send: A, event: "Back" } },
  { name: "reload", step: { reload: true } },
  { name: "dispose", step: { dispose: A } },
  { name: "ensure", step: { ensure: A } },
  { name: "t30s", step: { advance: 30_000 } },
  { name: "landLate", step: { fault: { landLate: "put" } }, on: (h) => h.read.outside().lost > 0 },
];
const withV = (make: () => Harness) => () => {
  const h = make();
  let commits = 0;
  const inner = h.do.bind(h);
  h.do = (s: Step) => {
    if ("send" in s && s.event === "Go") {
      commits++;
      inner({ ...s, payload: { v: commits } });
    } else inner(s);
  };
  return h;
};
export const searchFragStore = (
  make: () => Harness,
  shape: StoreShape,
  o: { depth: number; maxStates: number; deadlineMs: number },
): Report =>
  bfs({
    make: withV(() => {
      const h = make();
      h.start({ machines: [traitStoreFixture(shape)], seed: 1 });
      h.do({ ensure: A });
      return h;
    }),
    actions: ACTIONS.map((a) =>
      a.name === "Go"
        ? { ...a, on: (h: Harness) => h.read.evidence("mint").length < COMMITS }
        : a,
    ),
    depth: o.depth,
    maxStates: o.maxStates,
    deadlineMs: o.deadlineMs,
    extra: (s) => `${s.filter((a) => a.name === "Go").length}`,
    edge(_pre, post) {
      if (post.read.quiet().fatal) throw new Oracle("fatal");
      const i = post.read.issues().find((x) => x.code === "Fatal" || x.code === "ModuleDefect" || x.code === "CannotOccur");
      if (i) throw new Oracle(`${i.code} ${i.origin ?? ""} ${String(i.input ?? "")}`);
    },
    state(h) {
      checkClaims(h.read);
      checkEndings(h.read);
      checkMints(h.read);
      const r = h.read.record(thingRef);
      const out = h.read.outside();
      const q = h.read.quiet();
      // Outstanding: a request open, one that may still land, a lane anybody could still resolve.
      const busy = out.open.length > 0 || out.lost > 0 || out.mayHave.length > 0 || q.waits.some((w) => w.kind !== "timer");
      if (r && !busy && !r.predicted && !r.uncertain) {
        if (r.data?.v !== h.read.truth().server.thing.v)
          throw new Oracle(`silently wrong: shows ${JSON.stringify(r.data)}, server ${JSON.stringify(h.read.truth().server.thing)}`);
      }
    },
  });
