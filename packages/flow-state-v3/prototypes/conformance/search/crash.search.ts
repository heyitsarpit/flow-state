// SEARCH-CRASH (review H1): a persisted write machine with no reconcile, plain writes that fail and say so late, kills. The oracle reads only the
// server and the store: a second Attempt while an earlier one may be at the server and was never released. On the fake with sync failure this could not fail.
import { bareFixture, BareId } from "../typed/round7.ts";
import type { Harness, Step } from "../harness.ts";
import { checkClaims, checkEndings } from "../scenarios/ctx.ts";
import { bfs, Oracle, type Action, type Report } from "./engine.ts";

const A = { actor: BareId, id: "a" };
const send = (event: string, payload: unknown = {}): Step => ({ send: A, event, payload });
const open = (h: Harness) => h.read.outside().open.some((o) => o.op === "charge" && !o.never);
const storage = (h: Harness) => h.read.outside().storage.some((s) => !s.hung && s.purpose !== "flush");
const held = (h: Harness) => h.read.outside().failing > 0;
const ALPHABET: readonly Action[] = [
  { name: "Go", step: send("Go") },
  { name: "Note", step: send("Note", { text: "x" }) },
  { name: "Retry", step: send("Retry") },
  { name: "Forget", step: send("Forget") },
  { name: "failNext", step: { fault: { storageFailsLate: 1 } } },
  { name: "failHeld", step: { fault: { storageFailsHeld: 1 } } },
  { name: "sayFailed", step: { storage: "failLate" }, on: held },
  { name: "ack", step: { storage: "ack" }, on: storage },
  { name: "refuse", step: { storage: "refuse" }, on: storage },
  { name: "lost", step: { answer: "charge", with: { lost: true } }, on: open },
  { name: "ok", step: { answer: "charge", with: { ok: {} } }, on: open },
  { name: "advance", step: { advance: 1100 } },
  { name: "hide", step: { hide: true } },
  { name: "reload", step: { reload: true } },
];
export const searchCrash = (
  make: () => Harness,
  o: { depth: number; maxStates: number; deadlineMs: number },
  bounds: Record<string, number> = { captureMs: 0 },
): Report =>
  bfs({
    make: () => {
      const h = make();
      h.start({ machines: [bareFixture()], seed: 1, bounds });
      h.do({ ensure: A });
      return h;
    },
    actions: ALPHABET,
    ...o,
    edge(pre, post) {
      const seen = new Set(pre.read.requests().filter((x) => x.op === "charge").map((x) => x.idempotencyKey));
      const mayHave = new Set(pre.read.outside().mayHave);
      const released = new Set(post.read.evidence("Released").map((e) => e["attempt"]));
      for (const q of post.read.requests().filter((x) => x.op === "charge")) {
        if (seen.has(q.idempotencyKey)) continue;
        for (const old of seen)
          if (mayHave.has(old!) && !released.has(old))
            throw new Oracle(`a second Attempt ${q.idempotencyKey} beside undecided ${old}`);
      }
    },
    state(h) {
      checkClaims(h.read);
      checkEndings(h.read);
    },
  });
