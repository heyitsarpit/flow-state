// SEARCH-SESSION: sessions crossed with what they have been crossed with least: reload, freeze, reset, dispose, a slow close and one
// that never finishes, ahead of a value in mail. Oracles read what the suite owns: the fake's connections, and the disk. Review H7,
// H9. Values are numbered as sent, so an edge can say which it was; their positions rise, so the disk can be checked (rule 71).
import { chatFixture } from "../fixtures/chat.compiled.ts";
import { roomsFixture } from "../fixtures/feed.compiled.ts";
import type { Harness, Step } from "../harness.ts";
import { checkClaims, checkEndings, checkMints } from "../scenarios/ctx.ts";
import { bfs, Oracle, type Action, type Report } from "./engine.ts";

const R = { actor: "Desk/Rooms", id: "a" };
const OP = "activity";
const anyOpen = (h: Harness) => h.read.outside().feeds.some((f) => f.open && !f.closing);
const withValues = (make: () => Harness) => () => {
  const h = make();
  let n = 0;
  const inner = h.do.bind(h);
  h.do = (s: Step) => {
    if ("feed" in s && (s.frame as any)?.t === "activity") {
      n++;
      const entry = (s.frame as any).noPosition
        ? { id: `e${n}` }
        : { id: `e${n}`, cursor: { epoch: 1, seq: n } };
      inner({ ...s, frame: { t: "activity", entry } });
    } else inner(s);
  };
  return h;
};
const ACTIONS: readonly Action[] = [
  { name: "hello", step: { feed: OP, frame: { t: "hello" } }, on: anyOpen },
  { name: "value", step: { feed: OP, frame: { t: "activity" } }, on: anyOpen },
  { name: "value.nopos", step: { feed: OP, frame: { t: "activity", noPosition: true } }, on: anyOpen },
  { name: "reset", step: { feed: OP, frame: { t: "reset", epoch: 2 } }, on: anyOpen },
  { name: "ping", step: { feed: OP, frame: { t: "ping" } }, on: anyOpen },
  { name: "down", step: { feed: OP, frame: { t: "signal", signal: { _feed: "down", reason: "x" } } }, on: anyOpen },
  { name: "end", step: { feed: OP, end: true }, on: anyOpen },
  { name: "Away", step: { send: R, event: "Away" } },
  { name: "Back", step: { send: R, event: "Back" } },
  { name: "ShowW2", step: { send: R, event: "ShowRoom", payload: { roomId: "w2" } } },
  { name: "t20", step: { advance: 20 } },
  { name: "t1000", step: { advance: 1000 } },
  { name: "t5000", step: { advance: 5000 } },
  { name: "reload", step: { reload: true } },
  { name: "dispose", step: { dispose: R } },
  { name: "ensure", step: { ensure: R } },
  { name: "noClose", step: { fault: { socketClose: Infinity } } },
];
export const searchSession = (
  make: () => Harness,
  o: { depth: number; maxStates: number; deadlineMs: number },
): Report =>
  bfs({
    make: withValues(() => {
      const h = make();
      h.start({ machines: [roomsFixture], seed: 1 });
      h.do({ ensure: R });
      return h;
    }),
    actions: ACTIONS,
    depth: o.depth,
    maxStates: o.maxStates,
    deadlineMs: o.deadlineMs,
    edge(_pre, post) {
      if (post.read.quiet().fatal) throw new Oracle("a session stopped the Runtime");
      const i = post.read.issues().find((x) => x.code === "Fatal" || x.code === "ModuleDefect" || x.code === "CannotOccur");
      if (i) throw new Oracle(`${i.code} ${i.origin ?? ""} ${String(i.input ?? "")}`);
      // Rule 70: one connection per key, a closing one included, until its overdue.
      if (!post.read.evidence("ReleaseOverdue").length) {
        const per = new Map<string, number>();
        for (const f of post.read.outside().feeds)
          if (f.open) per.set(JSON.stringify(f.input), (per.get(JSON.stringify(f.input)) ?? 0) + 1);
        for (const [k, n] of per) if (n > 1) throw new Oracle(`rule 70: ${n} connections for ${k}`);
      }
      if (post.read.peakDeliveriesInMail() > 1) throw new Oracle("rule 69: two in mail");
    },
    state(h) {
      checkClaims(h.read);
      checkEndings(h.read);
      checkMints(h.read);
      // Rule 71, on the disk: a bookmark at a value's position sits in one record with that value's memory. Level: a placed, thawed
      // tab has a live connection or is on its way to one.
      const rec = h.read.stored().get(`actor/${R.actor}/${R.id}`) as any;
      const room = rec?.root?.kids?.room;
      if (room) {
        const mark: any = Object.values(room.partition?.sessions ?? {})[0];
        const seq = mark?.at?.epoch === 1 ? mark.at.seq : undefined;
        if (seq !== undefined && !room.memory.activity.some((e: any) => e.cursor?.seq === seq))
          throw new Oracle(`rule 71: a bookmark at ${seq} with no such value in the same record`);
      }
      const q = h.read.quiet();
      if (!q.fatal && h.read.state(R) === "TAB") {
        const st = h.read.module("sessions", `${R.actor}/${R.id}|${OP}`)?.st;
        if (st === undefined) throw new Oracle("H7: a placed room with no session");
      }
    },
  });

// The same oracles over `catchUp`: a read crossed with frames, a drop, a member, a reload.
const C = { actor: "Lab/Chat", id: "a" };
const M = "messages";
const hist = (h: Harness) => h.read.outside().open.some((x) => x.op === "history" && !x.never);
const openM = (h: Harness) => h.read.outside().feeds.some((f) => f.open && !f.closing);
const REPAIR: readonly Action[] = [
  { name: "live", step: { feed: M, frame: { _feed: "live" } }, on: openM },
  { name: "proof", step: { feed: M, frame: { _feed: "live", proof: "x" } }, on: openM },
  { name: "value", step: { feed: M, frame: { id: "v", cursor: 100 } }, on: openM },
  { name: "end", step: { feed: M, end: true }, on: openM },
  { name: "over", step: { feed: M, fail: { _tag: "Overflow" } }, on: openM },
  { name: "done", step: { answer: "history", with: { ok: { _feed: "done", items: [{ id: "a", cursor: 1 }], proof: "p", through: 2 } } }, on: hist },
  { name: "more", step: { answer: "history", with: { ok: { _feed: "more", items: [{ id: "b", cursor: 3 }], next: "n" } } }, on: hist },
  { name: "gone", step: { answer: "history", with: { ok: { _feed: "gone", reason: "r", through: 5 } } }, on: hist },
  { name: "page.fail", step: { answer: "history", with: { fail: { tag: "PageBusy" } } }, on: hist },
  { name: "page.bad", step: { answer: "history", with: { ok: 5 } }, on: hist },
  { name: "Jump", step: { send: C, event: "Jump", payload: { at: 50 } } },
  { name: "Refetch", step: { send: C, event: "Refetch" } },
  { name: "Leave", step: { send: C, event: "Leave" } },
  { name: "Open", step: { send: C, event: "Open" } },
  { name: "t20", step: { advance: 20 } },
  { name: "t1000", step: { advance: 1000 } },
  { name: "reload", step: { reload: true } },
];
export const searchRepairing = (
  make: () => Harness,
  o: { depth: number; maxStates: number; deadlineMs: number },
): Report =>
  bfs({
    make: () => {
      const h = make();
      h.start({ machines: [chatFixture({ catchUp: true })], seed: 1 });
      h.do({ ensure: C });
      return h;
    },
    actions: REPAIR,
    depth: o.depth,
    maxStates: o.maxStates,
    deadlineMs: o.deadlineMs,
    edge(_pre, post) {
      if (post.read.quiet().fatal) throw new Oracle("fatal");
      const i = post.read.issues().find((x) => x.code === "Fatal" || x.code === "ModuleDefect" || x.code === "CannotOccur");
      if (i) throw new Oracle(`${i.code} ${i.origin ?? ""} ${String(i.input ?? "")}`);
      if (post.read.peakDeliveriesInMail() > 1) throw new Oracle("rule 69");
      const per = post.read.outside().feeds.filter((f) => f.open).length;
      if (per > 1 && !post.read.evidence("ReleaseOverdue").length) throw new Oracle("rule 70: two connections");
      // At most one read of history outstanding: T1's "one page at a time".
      if (post.read.outside().open.filter((x) => x.op === "history").length > 1) throw new Oracle("two reads");
    },
    state(h) {
      checkClaims(h.read);
      checkEndings(h.read);
      checkMints(h.read);
      // A live session on an open tab has somewhere to go: Repairing has a read, or a page timer, or a queue, never a silent wait.
      const r = h.read.module("sessions", `${C.actor}/${C.id}|${M}`);
      if (r?.st === "Repairing" && r.inFlight === false && r.queued === 0) {
        const out = h.read.outside();
        if (!out.open.some((x) => x.op === "history") && out.timers.length === 0)
          throw new Oracle("Repairing with nothing to wake it");
      }
    },
  });
