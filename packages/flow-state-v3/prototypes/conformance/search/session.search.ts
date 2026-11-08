// SEARCH-SESSION: sessions crossed with what they have been crossed with least: reload, freeze, reset, dispose, a slow close and one
// that never finishes, ahead of a value in mail. Oracles read what the suite owns: the fake's connections and what each was asked to
// resume from. Review H7, H9. Values are numbered as sent, so an edge can say which it was; their positions rise, so a `from` can be
// checked against memory (rule 71).
import { chatFixture } from "../typed/chat.ts";
import { roomsFixture } from "../typed/feed.ts";
import type { Harness, Step } from "../harness.ts";
import { checkClaims, checkEndings, checkMints } from "../scenarios/ctx.ts";
import { bfs, Oracle, type Action, type Report } from "./engine.ts";

const R = { actor: "Desk/Rooms", id: "a" };
const OP = "activity";
const anyOpen = (h: Harness) => h.read.outside().feeds.some((f) => f.open && !f.closing);
// The connections rule 70 counts: open, or closing for less than T1's 5 s. The fake says when each close began; the runtime's word is not read.
const held = (h: Harness) =>
  h.read.outside().feeds.filter((f) => f.open && !(f.closing && f.closingAt !== undefined && h.read.now() - f.closingAt >= 5000));
// Rule 70's wait is per (actor, operation, key). One actor here; `activity`'s contract keys by `workspaceId` (typed/feed.ts), so a field
// the input carries beyond it does not make another key.
const keyOf = (op: string, input: unknown) => `${op} ${JSON.stringify({ workspaceId: (input as { workspaceId?: unknown } | undefined)?.workspaceId })}`;
const resetsSent = new WeakMap<Harness, Set<number>>(); // the suite's own record: the epochs of the reset frames it pushed
const withValues = (make: () => Harness) => () => {
  const h = make();
  let n = 0;
  const inner = h.do.bind(h);
  h.do = (s: Step) => {
    if ("feed" in s && (s.frame as any)?.t === "reset") resetsSent.set(h, new Set([...(resetsSent.get(h) ?? []), (s.frame as any).epoch]));
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
  {
    name: "value.nopos",
    step: { feed: OP, frame: { t: "activity", noPosition: true } },
    on: anyOpen,
  },
  { name: "reset", step: { feed: OP, frame: { t: "reset", epoch: 2 } }, on: anyOpen },
  { name: "ping", step: { feed: OP, frame: { t: "ping" } }, on: anyOpen },
  {
    name: "down",
    step: { feed: OP, frame: { t: "signal", signal: { _feed: "down", reason: "x" } } },
    on: anyOpen,
  },
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
  o: { depth: number; maxStates: number },
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
    edge(pre, post, last) {
      if (post.read.quiet().fatal) throw new Oracle("a session stopped the Runtime");
      const i = post.read
        .issues()
        .find((x) => x.code === "Fatal" || x.code === "ModuleDefect" || x.code === "CannotOccur");
      if (i) throw new Oracle(`${i.code} ${i.origin ?? ""} ${String(i.input ?? "")}`);
      // Rule 70: one connection per key, a closing one included, until its own close is 5 s old by the fake's clock (`ReleaseOverdue`).
      const per = new Map<string, number>();
      for (const f of held(post)) per.set(keyOf(f.op, f.input), (per.get(keyOf(f.op, f.input)) ?? 0) + 1);
      for (const [k, n] of per) if (n > 1) throw new Oracle(`rule 70: ${n} connections for ${k}`);
      const early = post.read.outside().feeds.find((f) => f.heldAtOpen.some((x) => keyOf(f.op, x) === keyOf(f.op, f.input)));
      if (early) throw new Oracle(`rule 70: a connection for ${keyOf(early.op, early.input)} opened while another was held`);
      if (post.read.peakDeliveriesInMail() > 1) throw new Oracle("rule 69: two in mail");
      // Rule 71, on the wire: a connection opened in this step resumes from the bookmark, which sits in one record with its value's memory.
      // Values are epoch 1, so an epoch-1 `from` names a value in the room's memory now; any other epoch is the `restartAt` (seq 0) of a
      // reset the suite pushed. A reload starts a new page, whose connections are all new.
      const before = "reload" in last.step ? 0 : pre.read.outside().feeds.length;
      const activity = (post.read.inner(R, ["room"])?.memory?.activity ?? []) as any[];
      for (const f of post.read.outside().feeds.slice(before)) {
        const at = f.from as any;
        if (at === undefined) continue;
        const named =
          at !== null && typeof at === "object" && (at.epoch === 1 ? activity.some((e) => e.cursor?.epoch === 1 && e.cursor.seq === at.seq) : at.seq === 0 && resetsSent.get(post)?.has(at.epoch) === true);
        if (!named)
          throw new Oracle(`rule 71: resumed from ${JSON.stringify(at)} with no such value in the same record`);
      }
    },
    state(h) {
      checkClaims(h.read);
      checkEndings(h.read);
      checkMints(h.read);
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
  {
    name: "done",
    step: {
      answer: "history",
      with: { ok: { _feed: "done", items: [{ id: "a", cursor: 1 }], proof: "p", through: 2 } },
    },
    on: hist,
  },
  {
    name: "more",
    step: {
      answer: "history",
      with: { ok: { _feed: "more", items: [{ id: "b", cursor: 3 }], next: "n" } },
    },
    on: hist,
  },
  {
    name: "gone",
    step: { answer: "history", with: { ok: { _feed: "gone", reason: "r", through: 5 } } },
    on: hist,
  },
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
  o: { depth: number; maxStates: number },
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
    edge(_pre, post) {
      if (post.read.quiet().fatal) throw new Oracle("fatal");
      const i = post.read
        .issues()
        .find((x) => x.code === "Fatal" || x.code === "ModuleDefect" || x.code === "CannotOccur");
      if (i) throw new Oracle(`${i.code} ${i.origin ?? ""} ${String(i.input ?? "")}`);
      if (post.read.peakDeliveriesInMail() > 1) throw new Oracle("rule 69");
      if (held(post).length > 1 || post.read.outside().feeds.some((f) => f.heldAtOpen.length > 0)) throw new Oracle("rule 70: two connections");
      // At most one read of history outstanding: T1's "one page at a time".
      if (post.read.outside().open.filter((x) => x.op === "history").length > 1)
        throw new Oracle("two reads");
    },
    state(h) {
      checkClaims(h.read);
      checkEndings(h.read);
      checkMints(h.read);
    },
    // A repair always has its next read coming (2.11.10: "one page at a time; pages retry with the socket open"). Judged on the fake's own
    // record: a Repairing session with no read of history open must have one opened, or have left Repairing, within 2^depth s, the longest
    // page retry `depth` failures can stack under Chat's `1000 x 2^n` (16 s at depth 4, inside `idle`'s 45 s; `idle` and `healthy` are not the
    // repair's to wake). The runtime's queue and timer words are not read. The steps here run no edge oracle; they only look for the read.
    drain(h) {
      const repairing = () => h.read.module("sessions", `${C.actor}/${C.id}|${M}`)?.st === "Repairing";
      const reading = () => h.read.outside().open.some((x) => x.op === "history");
      for (let t = 0; t < 2 ** o.depth && repairing() && !reading(); t++) h.do({ advance: 1000 });
      if (repairing() && !reading()) throw new Oracle("Repairing with no read of history coming");
    },
  });
