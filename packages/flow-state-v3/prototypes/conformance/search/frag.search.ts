// FRAG-15, SEARCH-FRAG: enter, leave, end, reload over one writing copy, with S1's system model's concerns: L3, every ending
// delivered or parked or evidence, one request per Attempt, a copy's status never contradicting the fake. Memory-free handlers.
import { notesFixture } from "../fixtures/lab.compiled.ts";
import type { Harness, Step } from "../harness.ts";
import { checkClaims, checkEndings } from "../scenarios/ctx.ts";
import { bfs, Oracle, type Action, type Report } from "./engine.ts";

const N = { actor: "Notes", id: "a" };
const send = (event: string, payload: unknown = {}, to?: readonly string[]): Step => ({
  send: N,
  event,
  payload,
  ...(to ? { to } : {}),
});
const open = (op: string) => (h: Harness) =>
  h.read.outside().open.some((o) => o.op === op && !o.never);
const storage = (h: Harness) =>
  h.read.outside().storage.some((s) => !s.hung && s.purpose !== "flush");
const has = (d: string) => (h: Harness) => h.read.inner(N, [`docs:${d}`]) !== undefined;
const ACTIONS: readonly Action[] = [
  { name: "enter", step: send("SetDocs", { docs: ["d1"] }) },
  { name: "leave", step: send("SetDocs", { docs: [] }) },
  { name: "edit", step: send("Edited", { body: "b" }, ["docs:d1"]), on: has("d1") },
  { name: "resend", step: send("Resend", {}, ["docs:d1"]), on: has("d1") },
  { name: "drop", step: send("Drop", {}, ["docs:d1"]), on: has("d1") },
  { name: "ack", step: { storage: "ack" }, on: storage },
  { name: "landNoAck", step: { storage: "landNoAck" }, on: storage },
  { name: "reload", step: { reload: true } },
  { name: "save.ok", step: { answer: "save", with: { apply: true } }, on: open("save") },
  { name: "save.lost", step: { answer: "save", with: { lost: true } }, on: open("save") },
  {
    name: "save.conflict",
    step: { answer: "save", with: { fail: { tag: "Conflict" } } },
    on: open("save"),
  },
  { name: "dispose", step: { dispose: N } },
  { name: "ensure", step: { ensure: N } },
];
export const searchFrag = (
  make: () => Harness,
  o: { depth: number; maxStates: number; deadlineMs: number },
): Report =>
  bfs({
    make: () => {
      const h = make();
      h.start({ machines: [notesFixture], seed: 1 });
      h.do({ ensure: N });
      return h;
    },
    actions: ACTIONS,
    depth: o.depth,
    maxStates: o.maxStates,
    deadlineMs: o.deadlineMs,
    edge(_pre, post) {
      if (post.read.quiet().fatal) throw new Oracle("fatal");
      const bad = post.read.issues().filter((i) => i.code !== "RecordQuarantined");
      if (bad.length) throw new Oracle(`issue ${bad[0]!.code} ${bad[0]!.origin ?? ""}`);
      // Rule 17 across a crash: once unknown, never a definite ending for that Attempt.
      const unknown = new Set<unknown>();
      for (const e of post.read.evidence("ending")) {
        if (e["channel"] === "unknown") unknown.add(e["attempt"]);
        else if (unknown.has(e["attempt"]) && e["channel"] === "failure")
          throw new Oracle(`a definite ending after unknown: ${e["reason"]}`);
      }
    },
    state(h) {
      checkClaims(h.read);
      checkEndings(h.read);
    },
  });
