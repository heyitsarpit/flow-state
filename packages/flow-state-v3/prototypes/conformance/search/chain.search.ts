// SEARCH-CHAIN (D122, D125): ops that answer at once, the way a local source does: queues and spins, on two actors, with presses, kills, disposals and refusals among them. The fake throws (k) if a page froze; (j) is in checkClaims. Above those:
//   (l) a press on another actor is heard in its step, whatever a spin is doing
//   (m) a queue left alone finishes, or a wait or a refusal says why
//   (n) a stopped spin stays stopped
import { ChainId, chainFixture } from "../typed/round9b.ts";
import type { Harness, Step } from "../harness.ts";
import { checkClaims, checkEndings } from "../scenarios/ctx.ts";
import { bfs, Oracle, type Action, type Report } from "./engine.ts";

const A = { actor: ChainId, id: "a" };
const B = { actor: ChainId, id: "b" };
const send = (w: typeof A, event: string, payload: unknown = {}): Step => ({ send: w, event, payload });
const open = (op: string) => (h: Harness) => h.read.outside().open.some((o) => o.op === op && !o.never);
const storage = (h: Harness) => h.read.outside().storage.some((s) => !s.hung);
const ACTIONS: readonly Action[] = [
  { name: "Rows", step: send(A, "Rows", { n: 6 }) },
  { name: "Writes", step: send(A, "Writes", { n: 4 }) },
  { name: "Spin", step: send(A, "Spin") },
  { name: "Stop", step: send(A, "Stop") },
  { name: "Press.b", step: send(B, "Press") },
  { name: "Pw.b", step: send(B, "Pw") },
  // Review M4: with a settle after every action, an ending never lands while another actor has mail. These send to both in one go, so it does.
  { name: "Rows+Pw.b", step: { sendMany: [[A, "Rows", { n: 6 }], [B, "Pw", {}], [B, "Press", {}]] } },
  { name: "Pw.b+Spin+Press.b", step: { sendMany: [[B, "Pw", {}], [A, "Spin", {}], [B, "Press", {}]] } },
  { name: "pw.ok", step: { answer: "pw", with: { ok: {} } }, on: open("pw") },
  { name: "ack", step: { storage: "ack" }, on: storage },
  { name: "FLUSH", step: { hide: true } },
  { name: "KILL", step: { reload: true } },
  { name: "Dispose", step: { dispose: A } },
  { name: "Ensure", step: { ensure: A } },
  { name: "tick", step: { advance: 1000 } },
  { name: "refuseRow", step: { fault: { throwIn: "on.RowOk[1].updateMemory", times: 2 } } },
  { name: "refuseWrite", step: { fault: { throwIn: "on.SaveOk[1].updateMemory", times: 2 } } },
];
export const searchChain = (make: () => Harness, o: { depth: number; maxStates: number }): Report =>
  bfs({
    make: () => {
      const h = make();
      h.start({ machines: [chainFixture({ persisted: true })], seed: 1, bounds: { captureMs: 0, drainMs: 0.2 } as never });
      h.do({ fault: { microAnswer: ["row", (i: any) => (i.i % 2 ? { fail: { tag: "Duplicate" } } : { ok: {} })] } });
      h.do({ fault: { microAnswer: ["save", (i: any) => (i.i % 2 ? { fail: { tag: "Duplicate" } } : { ok: {} })] } });
      h.do({ fault: { microAnswer: ["spin", { fail: { tag: "Whatever" } }] } });
      h.do({ tasksPerStep: 6 });
      h.do({ ensure: A });
      h.do({ ensure: B });
      return h;
    },
    actions: ACTIONS,
    depth: o.depth,
    maxStates: o.maxStates,
    edge(pre, post, last) {
      if (last === "Press.b") {
        const was = (pre.read.memory(B) as any)?.presses;
        const is = (post.read.memory(B) as any)?.presses;
        if (was !== undefined && is !== was + 1) throw new Oracle(`(l) a press on another actor was not heard in its step: ${was} -> ${is}`);
      }
    },
    state(h) {
      checkClaims(h.read);
      checkEndings(h.read);
    },
    drain(h, script) {
      // (m), (n): stop what spins, and let the rest run out.
      h.do({ send: A, event: "Stop", payload: {} });
      for (let i = 0; i < 40 && h.read.quiet().spinning; i++) h.do({ advance: 0 });
      h.do({ tasksPerStep: null });
      for (let i = 0; i < 40; i++) {
        const out = h.read.outside();
        if (out.storage.some((s) => !s.hung)) h.do({ storage: "ack" });
        else if (out.open.some((x) => x.op === "pw" && !x.never)) h.do({ answer: "pw", with: { ok: {} } });
        else break;
      }
      const m = h.read.memory(A) as any;
      if (m && m.n > 0 && m.i + 1 < m.n) {
        const said = h.read.issues().some((i) => i.code === "InvalidTurn") || script.includes("KILL") || script.includes("Dispose");
        if (!said && !h.read.quiet().waits.some((w) => w.kind !== "timer")) throw new Oracle(`(m) a queue stopped at ${m.i} of ${m.n} with nothing to say why`);
      }
      const spunOnDisk = () => (h.read.stored().get("actor/Lab/Chain/a") as any)?.root?.memory?.spun;
      const n = m?.spun ?? spunOnDisk();
      h.do({ advance: 60_000 });
      const after = (h.read.memory(A) as any)?.spun ?? spunOnDisk();
      if (after !== undefined && n !== undefined && after !== n) throw new Oracle("(n) a stopped spin went on");
    },
  });
