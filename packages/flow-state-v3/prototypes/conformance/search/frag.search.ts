// FRAG-15, SEARCH-FRAG: enter, leave, end, reload over two writing copies, with S1's system model's concerns: L3, every ending
// delivered or parked or evidence, one request per Attempt, a copy's `saved` never contradicting the fake. Review M9: the header
// said so; now the code does too.
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
  { name: "both", step: send("SetDocs", { docs: ["d1", "d2:x/y"] }) },
  { name: "edit2", step: send("Edited", { body: "c" }, ["docs:d2:x/y"]), on: has("d2:x/y") },
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
      // One request per Attempt: a key goes out again only after an unknown (rule 18).
      const sends = new Map<string, number>();
      for (const q of h.read.requests())
        if (q.idempotencyKey) sends.set(q.idempotencyKey, (sends.get(q.idempotencyKey) ?? 0) + 1);
      const held = new Set(
        h.read
          .evidence("ending")
          .filter((e) => e["channel"] === "unknown")
          .map((e) => e["attempt"]),
      );
      for (const [k, n] of sends)
        if (n > 1 && !held.has(k)) throw new Oracle(`${k} sent ${n} times with no unknown`);
      // A copy's `saved` names a body the fake holds for that document (a success it heard, not its own guess).
      const docs = (h.read.truth().server?.docs ?? {}) as Record<string, string>;
      for (const d of ["d1", "d2:x/y"]) {
        const saved = h.read.inner(N, [`docs:${d}`])?.memory.saved;
        if (saved && docs[d] !== saved)
          throw new Oracle(`copy ${d} says saved ${saved}, the fake holds ${docs[d]}`);
      }
    },
  });
