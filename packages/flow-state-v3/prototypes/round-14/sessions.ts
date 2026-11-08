// Stream sessions, all three kinds: `every`, `latest` (T5), `listen` (T7, thin): Form A (S5). Session state is in the slice, the connection handle in the driver. Built from Streams T1, T2, T3, T4,
// T9, rule 68-71, as the design names them. No file of the core imports this. D69: it reads the tree only through `cx.placed` and
// `cx.slice`. D70: a releasing session has left `sessions`; the wait for it is a fact per (actor, slot), `closing`. D71: a session
// pulls, one value per go-ahead. Prior art: S5's formA.ts (the table); desk feed.socket.ts, feed.machine.ts (the fixture's shape).
import { Effect, Stream } from "effect";
import { FeedQueue, type Signal } from "../conformance/fixtures/compiled.ts";
import { feedStream } from "./feed.ts";
import { carried, own, text, type SealedStream } from "./gate.ts";
import type { PlacedActivity } from "./inc.ts";
import type { ActorChange, Cx, Module, Told } from "./seam.ts";

type Item = {
  readonly kind: "value" | "missed" | "failure" | "settle" | "page";
  readonly v?: unknown;
  readonly why?: string;
  readonly at?: { readonly at: unknown }; // a Reset's place, moved at its notice's admission (T3 row 2)
  readonly moves: boolean;
};
type St = "Queued" | "Connecting" | "Live" | "Repairing" | "Dropped" | "Waiting" | "Ended";
type StreamSpec = SealedStream; // D77: every closure a Slot
const FLOW_REASONS: ReadonlySet<string> = new Set(["Closed", "Overflow", "Silent", "PageSilent"]); // always retried under `reconnect`
type Session = {
  readonly id: string;
  readonly actor: string;
  readonly machine: string;
  readonly inc: string;
  readonly activation: string;
  readonly op: string;
  readonly slot: string; // op|key: the partition's entry, and the wait for a predecessor (rule 70)
  readonly key: unknown; // read once, at start, with `input`
  readonly input: unknown; // read once, at start (rule 68)
  readonly st: St;
  readonly conn: string;
  readonly n: number;
  readonly regInConn: boolean;
  readonly owed: boolean;
  readonly noted: boolean;
  readonly claim: unknown;
  readonly wiped: boolean;
  readonly connected: boolean;
  readonly waitingForPull: boolean; // a value has been taken; the next waits for its go-ahead
  readonly queue: readonly Item[];
  readonly inFlight?: { readonly tag: string; readonly item: Item };
  readonly tags: number;
  readonly flaps: number;
  readonly liveSince?: number;
  // T1's Repairing variables.
  readonly rid?: string;
  readonly buf: readonly Item[];
  readonly stalls: number;
  readonly movedHere: boolean;
  readonly greeted?: { readonly at: unknown };
  readonly lastRead?: { readonly at: unknown };
  readonly prevNext?: { readonly next: unknown };
  readonly wantNext?: { readonly next: unknown };
  readonly emptyRun: number;
  readonly from?: { readonly at: unknown };
  readonly pageN: number;
  // T5.
  readonly last?: { readonly v: unknown; readonly at: number; readonly own: boolean };
  readonly confirmed: boolean;
  readonly heard?: string;
  // T7: "`from` is the session's own last position".
  readonly listenAt?: unknown;
};
type Mark = { readonly at: unknown; readonly filled: boolean }; // the bookmark
type Pending = {
  readonly actor: string;
  readonly inc: string;
  readonly slot: string;
  readonly name: string;
  readonly at: unknown;
};
type Closing = { readonly actor: string; readonly slot: string; readonly op: string };
export type SessionsSlice = {
  readonly sessions: Readonly<Record<string, Session>>;
  readonly closing: Readonly<Record<string, Closing>>; // conn -> who waits on it. Rule 70
  readonly pending: readonly Pending[]; // members this turn, applied once the turn is committed, in this same step
};
const empty: SessionsSlice = { sessions: {}, closing: {}, pending: [] };
const specOf = (cx: Cx, machine: string, op: string): StreamSpec =>
  cx.machine(machine).streams![op] as unknown as SealedStream;
// L4: one of three known words. A value with a field of that name is a value.
const isSignal = (f: any): f is Signal =>
  typeof f === "object" &&
  f !== null &&
  (f._feed === "live" || f._feed === "ping" || f._feed === "down");
const slotOfKey = (spec: StreamSpec, key: unknown) => `${spec.id}|${text(key)}`;
// The design's capped schedule stands in for a `backoff` that says nothing usable (D77, L5).
const delayOf = (spec: StreamSpec, n: number, cx: Cx) =>
  cx.user(spec.backoff, [n], () => Math.min(30_000, 1000 * 2 ** n));
const put = (s: SessionsSlice, x: Session): SessionsSlice => ({
  ...s,
  sessions: { ...s.sessions, [x.id]: x },
});
const drop = (s: SessionsSlice, id: string): SessionsSlice => {
  const { [id]: _gone, ...sessions } = s.sessions;
  return { ...s, sessions };
};
// What the partition says, read through the view, never through a copy: rule 71's one place.
const marks = (cx: Cx, x: { actor: string; inc: string }) =>
  (cx.slice(x.actor, x.inc)?.partition ?? {}) as Readonly<Record<string, Mark>>;
const markOf = (cx: Cx, x: { actor: string; inc: string; slot: string }) =>
  own(marks(cx, x), x.slot);
const writeMark = (cx: Cx, x: { actor: string; inc: string; slot: string }, m: Mark | undefined) =>
  cx.partition(x.actor, x.inc, (old) => {
    const { [x.slot]: _g, ...rest } = (old ?? {}) as Record<string, Mark>;
    return m ? { ...rest, [x.slot]: m } : rest;
  });
const fieldEmpty = (spec: StreamSpec, memory: any) => {
  if (!spec.fills) return true; // `fills: false` is always empty
  const f = memory?.[spec.fills];
  if (typeof f === "number") return f === 0;
  if (Array.isArray(f)) return f.length === 0;
  return !(f && typeof f === "object" && Object.keys(f).length > 0);
};
const emptyFor = (spec: StreamSpec, cx: Cx, x: { actor: string; inc: string }) =>
  fieldEmpty(spec, cx.slice(x.actor, x.inc)?.memory);
const armIdle = (cx: Cx, x: Session, spec: StreamSpec) =>
  cx.arm(`idle/${x.id}`, cx.now + spec.idleMs);
const disarmAll = (cx: Cx, x: Session) => {
  cx.disarm(`idle/${x.id}`);
  cx.disarm(`healthy/${x.id}`);
  cx.disarm(`backoff/${x.id}`);
  cx.disarm(`pageSilent/${x.id}`);
};
const busy = (s: SessionsSlice, actor: string, slot: string) =>
  Object.values(s.closing).some((c) => c.actor === actor && c.slot === slot);
const closeConn = (s: SessionsSlice, x: Session, cx: Cx): SessionsSlice => {
  cx.command({ k: "close", conn: x.conn });
  cx.arm(`overdue/${x.conn}`, cx.now + 5000);
  return {
    ...s,
    closing: { ...s.closing, [x.conn]: { actor: x.actor, slot: x.slot, op: x.op } },
  };
};
const mapperOf = (spec: StreamSpec, it: Item) =>
  it.kind === "value"
    ? spec.value
    : it.kind === "missed"
      ? spec.missed
      : it.kind === "page"
        ? spec.pages!
        : failureMap(spec, it);
const failureMap = (spec: StreamSpec, it: Item) =>
  (it.why !== undefined && spec.failureBy?.[it.why]) || spec.failure;

// ── Delivery, rule 69: at most one in mail for a session. The next goes when it has turned. T4: then a go-ahead for the next pull.
const pump = (s: SessionsSlice, x0: Session, spec: StreamSpec, cx: Cx): SessionsSlice => {
  if (x0.inFlight) return put(s, x0);
  const [item, ...queue] = x0.queue;
  if (item?.kind === "settle") {
    // T4: apply and continue. T3: creates the entry if none.
    const b = markOf(cx, x0);
    if (item.at?.at !== undefined || !b)
      writeMark(cx, x0, { at: item.at?.at ?? b?.at, filled: b?.filled ?? !emptyFor(spec, cx, x0) });
    return pump(s, { ...x0, queue }, spec, cx);
  }
  if (!item) {
    if (x0.st === "Repairing" && x0.wantNext) {
      const { wantNext, ...rest } = x0;
      return requestPage(s, rest, wantNext.next, spec, cx); // T1: the next page only when no page item is queued
    }
    if (x0.waitingForPull && (x0.st === "Live" || x0.st === "Dropped")) {
      cx.command({ k: "pull", conn: x0.conn });
      if (x0.st === "Live") armIdle(cx, x0, spec); // T1: armed only while a pull is outstanding
      return put(s, { ...x0, waitingForPull: false });
    }
    return put(s, x0);
  }
  const tag = `${x0.id}#${x0.tags}`;
  const m = mapperOf(spec, item);
  let threw = false;
  const payload = m.from
    ? cx.user(
        m.from as never,
        [
          item.kind === "failure" ? { why: item.why, ...(item.v as object) } : item.v,
          { key: x0.key, input: x0.input },
        ] as never,
        (() => {
          threw = true;
          return {};
        }) as never,
      )
    : item.kind === "failure"
      ? { why: item.why }
      : {};
  if (threw) {
    if (item.kind === "failure") return put(s, { ...x0, queue }); // nothing more can be said
    return end(s, emptied({ ...x0, queue }, cx), spec, cx, "Defect"); // D46: a value mapper's throw is T1's end(Defect)
  }
  cx.deliver({
    actor: x0.actor,
    inc: x0.inc,
    activation: x0.activation,
    event: { tag: m.event, payload: payload as object },
    tag,
    ending: item.kind === "failure",
  });
  return put(s, { ...x0, queue, inFlight: { tag, item }, tags: x0.tags + 1 });
};
const notice = (x: Session, why: string, at?: { at: unknown }): Session =>
  x.noted
    ? x
    : {
        ...x,
        noted: true,
        queue: [...x.queue, { kind: "missed", why, moves: false, ...(at ? { at } : {}) }],
      };
// M2: what an `end` stops is named, item by item.
const emptied = (x: Session, cx: Cx): Session => {
  for (const q of x.queue)
    if (q.kind !== "settle") cx.note("discarded", { op: x.op, item: q.kind, why: "Ended" });
  return { ...x, queue: [] };
};
// T1 `end`; T9: `failure` behind queued items.
const end = (
  s: SessionsSlice,
  x: Session,
  spec: StreamSpec,
  cx: Cx,
  why: string,
  v?: unknown,
): SessionsSlice => {
  disarmAll(cx, x);
  abandon(x, cx);
  if (spec.listen) gap(x, cx, "ended");
  const closed = x.st === "Waiting" || x.st === "Queued" ? s : closeConn(s, x, cx);
  return pump(
    closed,
    {
      ...withoutRead(x),
      st: "Ended",
      confirmed: false,
      queue: [...x.queue, { kind: "failure", why, v, moves: false }],
    },
    spec,
    cx,
  );
};

// ── T1's procedures.
const abandon = (x: Session, cx: Cx) => {
  if (x.rid) cx.command({ k: "abandon", rid: x.rid });
  cx.disarm(`page/${x.id}`);
  cx.disarm(`pageSilent/${x.id}`);
};
const withoutRead = (x: Session): Session => {
  const { rid: _r, lastRead: _l, prevNext: _p, wantNext: _w, greeted: _g, from: _f, ...rest } = x;
  return { ...rest, buf: [], emptyRun: 0, pageN: 0, movedHere: false };
};
const gap = (x: Session, cx: Cx, why: "unproven" | "lost" | "ended") =>
  cx.publish({ k: "gap", machine: x.machine, op: x.op, session: x.id, input: x.input, why });
const requestPage = (
  s: SessionsSlice,
  x: Session,
  next: unknown,
  _spec: StreamSpec,
  cx: Cx,
): SessionsSlice => {
  const rid = cx.gen();
  cx.command({
    k: "read",
    rid,
    machine: x.machine,
    op: x.op,
    input: x.input,
    from: x.from?.at,
    next,
  });
  cx.arm(`pageSilent/${x.id}`, cx.now + cx.pageMs); // D79: no read waits for ever. A stall, as T2 row 6 counts one
  return put(s, { ...x, rid, prevNext: { next } });
};
const repairFrom = (
  s: SessionsSlice,
  x0: Session,
  from: unknown,
  spec: StreamSpec,
  cx: Cx,
): SessionsSlice => {
  const greeted = x0.greeted;
  abandon(x0, cx);
  const x: Session = {
    ...withoutRead(x0),
    st: "Repairing",
    from: { at: from },
    ...(greeted ? { greeted } : {}),
  };
  return requestPage(s, x, undefined, spec, cx);
};
// T1 `complete`: `settle(through ?? lastRead ?? greeted)`, then what the socket said meanwhile, moving.
const complete = (
  s: SessionsSlice,
  x: Session,
  through: unknown,
  spec: StreamSpec,
  cx: Cx,
): SessionsSlice => {
  const at = through ?? x.lastRead?.at ?? x.greeted?.at;
  const buf = x.buf;
  const y: Session = {
    ...withoutRead(x),
    st: "Live",
    stalls: 0,
    // M1: a pull is owed only if a value is holding the source. A read that buffered nothing banks no credit.
    waitingForPull: x.waitingForPull,
    queue: [...x.queue, { kind: "settle", at: { at }, moves: false }, ...buf],
  };
  return pump(s, y, spec, cx);
};
const pageItems = (spec: StreamSpec, items: readonly unknown[]): Item[] =>
  items.length === 0
    ? []
    : spec.pages
      ? [{ kind: "page", v: items, moves: false }]
      : items.map((v) => ({ kind: "value" as const, v, moves: false }));
const lastOf = (x: Session, spec: StreamSpec, items: readonly unknown[]) => {
  const at = spec.position ? (items.at(-1) as any)?.[spec.position] : undefined;
  return at === undefined ? x.lastRead : { at };
};
const onPage = (
  s: SessionsSlice,
  p: { rid: string; exit: { t: string; value?: any; reason?: any } },
  cx: Cx,
): SessionsSlice => {
  const x = Object.values(s.sessions).find((y) => y.rid === p.rid);
  if (!x || x.st !== "Repairing") {
    cx.note("fence", { page: p.rid });
    return s;
  }
  const spec = specOf(cx, x.machine, x.op);
  cx.disarm(`pageSilent/${x.id}`);
  if (p.exit.t !== "ok") {
    if (
      p.exit.t === "failure" &&
      spec.pageRetryWhile &&
      cx.user(spec.pageRetryWhile, [p.exit.reason], () => false) // D77: a throw means not retried
    ) {
      cx.arm(`page/${x.id}`, cx.now + delayOf(spec, x.pageN, cx)); // the socket stays open
      return put(s, { ...x, pageN: x.pageN + 1 });
    }
    return end(s, x, spec, cx, p.exit.reason?._tag ?? "Defect", p.exit.reason);
  }
  const a = p.exit.value;
  const items: readonly unknown[] = Array.isArray(a?.items) ? a.items : [];
  // T1: a position fails to decode: Defect. An answer of no shape is the same.
  if (!["more", "done", "gone"].includes(a?._feed) || bad(a.through) || bad(a.next))
    return end(s, x, spec, cx, "Defect");
  const lastRead = lastOf(x, spec, items);
  let y: Session = { ...x, ...(lastRead ? { lastRead } : {}), pageN: 0 };
  if (a._feed === "gone") y = notice({ ...y, noted: false }, "Lost");
  y = { ...y, queue: [...y.queue, ...pageItems(spec, items)] };
  if (a.through !== undefined && a._feed !== "done")
    y = {
      ...y,
      movedHere: true,
      stalls: 0,
      queue: [...y.queue, { kind: "settle", at: { at: a.through }, moves: false }],
    };
  if (a._feed === "done") {
    cx.note("Proof", { op: x.op, proof: a.proof });
    return complete(s, y, a.through, spec, cx);
  }
  if (a.next === undefined) return complete(s, y, a.through, spec, cx);
  const repeated = x.prevNext !== undefined && text(x.prevNext.next) === text(a.next);
  const emptyRun = items.length === 0 ? y.emptyRun + 1 : 0;
  if (repeated || emptyRun >= 2) return end(s, y, spec, cx, "PageStalled");
  return pump(s, { ...y, emptyRun, wantNext: { next: a.next } }, spec, cx);
};
// T5: `value` is the last value iff Live and confirmed. Newest wins: what is in mail and no longer current is taken back.
const reconcile = (s: SessionsSlice, x0: Session, spec: StreamSpec, cx: Cx): SessionsSlice => {
  let x = x0;
  const current = x.st === "Live" && x.confirmed && x.last !== undefined;
  const t = current ? text(x.last!.v) : undefined;
  if (
    x.inFlight &&
    x.inFlight.item.kind === "value" &&
    (!current || text(x.inFlight.item.v) !== t)
  ) {
    cx.retract(x.inFlight.tag);
    cx.note("discarded", { op: x.op, item: "value", why: "NotLive" });
    x = (({ inFlight: _i, ...r }) => r)(x);
  }
  if (current && t !== x.heard && !x.inFlight)
    x = { ...x, queue: [{ kind: "value", v: x.last!.v, moves: false }] };
  else if (x.inFlight === undefined) x = { ...x, queue: x.queue.filter((q) => q.kind !== "value") };
  return pump(s, x, spec, cx);
};
const connect = (s: SessionsSlice, x0: Session, spec: StreamSpec, cx: Cx): SessionsSlice => {
  if (!cx.live) return s;
  let x: Session = { ...x0, wiped: false, noted: false, connected: true, waitingForPull: false };
  if (spec.listen || spec.delivers === "latest") {
    const conn = cx.gen();
    const from = spec.listen ? x.listenAt : undefined;
    cx.command({ k: "open", conn, machine: x.machine, op: x.op, input: x.input, from });
    armIdle(cx, x, spec);
    return put(s, { ...x, conn, st: "Connecting", regInConn: false });
  }
  let b = markOf(cx, x);
  if (b?.filled && emptyFor(spec, cx, x)) {
    x = { ...x, wiped: true };
    b = { at: undefined, filled: false };
    writeMark(cx, x, b); // at once, so leaving before registering stays owed
  }
  const conn = cx.gen();
  cx.command({ k: "open", conn, machine: x.machine, op: x.op, input: x.input, from: b?.at });
  armIdle(cx, x, spec);
  return put(s, { ...x, conn, claim: b?.at, st: "Connecting", regInConn: false });
};
// Streams T2, the rows with no catchUp, in order.
const register = (
  s: SessionsSlice,
  x0: Session,
  sig: Extract<Signal, { _feed: "live" }>,
  spec: StreamSpec,
  cx: Cx,
): SessionsSlice => {
  const first = !x0.regInConn;
  let x: Session = {
    ...x0,
    regInConn: true,
    owed: false,
    noted: false,
    st: "Live",
    liveSince: cx.now,
  };
  cx.arm(`healthy/${x.id}`, cx.now + spec.healthyMs);
  armIdle(cx, x, spec);
  if (spec.listen) {
    if (!sig.proof) gap(x, cx, "unproven"); // T7: an unproven registration, the first included
    return put(s, x);
  }
  if (spec.delivers === "latest") {
    x = { ...x, confirmed: sig.proof !== undefined && x.last?.own === true };
    return reconcile(s, x, spec, cx);
  }
  const b = markOf(cx, x);
  const E = emptyFor(spec, cx, x);
  const C = spec.catchUp !== undefined;
  const greet = (y: Session): Session =>
    sig.head === undefined ? y : { ...y, greeted: { at: sig.head } };
  if (sig.restartAt !== undefined) {
    if (!b && E) writeMark(cx, x, { at: sig.restartAt, filled: false }); // row 1
    else x = notice(x, "Reset", { at: sig.restartAt }); // row 2: at missed Reset's admission
    return C ? repairFrom(s, x, sig.restartAt, spec, cx) : put(s, x);
  }
  if (!b && E) {
    if (C) return repairFrom(s, greet(x), undefined, spec, cx); // row 3: the record is made at `complete`
    writeMark(cx, x, { at: sig.head, filled: false }); // row 3: first open
    return put(s, x);
  }
  if (sig.proof && (x.claim !== undefined || !first)) return put(s, x); // row 4
  if (sig.proof) cx.note("ProofWithoutPosition", { op: x.op });
  if (x.wiped && first)
    return C ? repairFrom(s, greet(x), undefined, spec, cx) : put(s, notice(x, "Unproven")); // row 5
  if (b && b.at !== undefined) {
    // row 6. S5's finding, read as 2.11.10 says: with `C`, no notice unless three repairs in a row made no move.
    if (x.stalls >= 3) {
      x = notice(x, "Lost");
      return put(s, { ...x, stalls: 0 });
    }
    return C ? repairFrom(s, x, b.at, spec, cx) : put(s, notice(x, "Unproven"));
  }
  if (!b) writeMark(cx, x, { at: sig.head, filled: !E }); // row 7
  x = notice(x, "Unproven");
  return C ? repairFrom(s, greet(x), undefined, spec, cx) : put(s, x);
};
const lose = (
  s: SessionsSlice,
  x: Session,
  spec: StreamSpec,
  cx: Cx,
  why: string,
  closedAlready: boolean,
  e?: unknown,
): SessionsSlice => {
  cx.disarm(`idle/${x.id}`);
  cx.disarm(`healthy/${x.id}`);
  abandon(x, cx);
  const retried =
    spec.reconnect &&
    (FLOW_REASONS.has(why) ||
      !spec.reconnectWhile ||
      cx.user(spec.reconnectWhile, [e], () => false)); // D77: a throw means not retried, one issue
  const flaps =
    why !== "Silent" && x.liveSince !== undefined && cx.now - x.liveSince < spec.healthyMs
      ? x.flaps + 1
      : x.flaps;
  const stalls =
    x.st === "Repairing" && (why === "Overflow" || why === "PageSilent") && !x.movedHere
      ? x.stalls + 1
      : x.stalls;
  if (!retried || flaps >= 8) {
    const y: Session = closedAlready ? { ...x, st: "Waiting" } : x;
    return end(s, y, spec, cx, retried ? "Flapping" : why, e);
  }
  if (spec.listen) gap(x, cx, "lost");
  cx.arm(`backoff/${x.id}`, cx.now + delayOf(spec, x.n, cx));
  const out = closedAlready ? s : closeConn(s, x, cx);
  // T1: this connection's frames are discarded. Notices stay: one interruption, one answer.
  const { liveSince: _l, ...rest } = withoutRead(x);
  const last = x.last && x.confirmed ? { last: { ...x.last, at: cx.now } } : {};
  const y: Session = {
    ...rest,
    ...last,
    st: "Waiting",
    n: x.n + 1,
    flaps,
    stalls,
    confirmed: false,
    regInConn: false,
    waitingForPull: false,
    queue: x.queue.filter((q) => !q.moves && q.kind !== "settle"),
  };
  return spec.delivers === "latest" ? reconcile(out, y, spec, cx) : put(out, y);
};
// Rule 70: undelivered items are discarded with evidence. D70: it leaves the table now; whoever comes next waits on `closing`.
const release = (s: SessionsSlice, x: Session, cx: Cx): SessionsSlice => {
  if (x.inFlight) cx.retract(x.inFlight.tag);
  for (const q of [...x.queue, ...(x.inFlight ? [x.inFlight.item] : [])])
    cx.note("discarded", { op: x.op, item: q.kind });
  disarmAll(cx, x);
  abandon(x, cx);
  if (cx.machine(x.machine).streams?.[x.op]?.listen) gap(x, cx, "ended"); // T7: a release is a gap
  const out = drop(s, x.id);
  return x.st === "Waiting" || x.st === "Queued" || x.st === "Ended" ? out : closeConn(out, x, cx);
};
// A predecessor has closed: whoever waits on this (actor, slot) connects now.
const woken = (s: SessionsSlice, gone: Closing, cx: Cx): SessionsSlice => {
  if (busy(s, gone.actor, gone.slot)) return s;
  const next = Object.values(s.sessions).find(
    (y) => y.st === "Queued" && y.actor === gone.actor && y.slot === gone.slot,
  );
  return next ? connect(s, next, specOf(cx, next.machine, next.op), cx) : s;
};
// T1's member cells: what is queued or in mail stops moving; Live and Dropped owe a notice, at the head.
const afterMember = (
  s: SessionsSlice,
  a: string,
  inc: string,
  slot: string,
  at: unknown,
  cx: Cx,
): SessionsSlice => {
  let out = s;
  for (const x of Object.values(s.sessions)) {
    if (x.actor !== a || x.inc !== inc || x.slot !== slot) continue;
    const queue = x.queue.filter((q) => q.kind !== "settle").map((q) => ({ ...q, moves: false }));
    const spec = specOf(cx, x.machine, x.op);
    // T1: with `catchUp` it reads, from there, and owes no notice.
    const frozen = x.inFlight
      ? { inFlight: { ...x.inFlight, item: { ...x.inFlight.item, moves: false } } }
      : {};
    if (spec.catchUp && (x.st === "Live" || x.st === "Repairing" || x.st === "Dropped")) {
      out = repairFrom(out, { ...x, ...frozen, queue, st: "Live" }, at, spec, cx); // M3
      continue;
    }
    const owed = x.st === "Live" || x.st === "Dropped";
    out = put(out, {
      ...x,
      ...frozen,
      queue:
        owed && !x.noted ? [{ kind: "missed", why: "Unproven", moves: false }, ...queue] : queue,
      noted: x.noted || owed,
    });
  }
  return out;
};

// ── The level-triggered fact: which sessions should exist is a function of this actor's tree. D69: the core says what is placed.
const idOf = (a: string, p: PlacedActivity) => `${a}/${p.inc}/${p.activation}/${p.activity.op}`;
const fresh = (
  a: ActorChange,
  p: PlacedActivity,
  input: unknown,
  key: unknown,
  spec: StreamSpec,
): Session => ({
  id: idOf(a.key, p),
  actor: a.key,
  machine: a.machine,
  inc: p.inc,
  activation: p.activation,
  op: p.activity.op,
  slot: slotOfKey(spec, key),
  key,
  input,
  st: "Queued",
  conn: "",
  n: 0,
  regInConn: false,
  owed: false,
  noted: false,
  claim: undefined,
  wiped: false,
  connected: false,
  waitingForPull: false,
  queue: [],
  tags: 0,
  flaps: 0,
  buf: [],
  stalls: 0,
  movedHere: false,
  emptyRun: 0,
  pageN: 0,
  confirmed: false,
});
const onActors = (s0: SessionsSlice, changed: readonly ActorChange[], cx: Cx): SessionsSlice => {
  let s = s0;
  for (const a of changed) {
    if (!cx.machine(a.machine).uses.includes("sessions")) continue;
    const placed = cx.placed(a.key);
    const here = placed.filter((p) => {
      const when = p.activity.when;
      if (!when) return true;
      // T9, proposed: a `when` throw keeps the session as it is, with one issue. It cannot refuse a turn that has committed.
      return (
        cx.user(
          when as never,
          [{ memory: cx.slice(a.key, p.inc)?.memory, event: {} }] as never,
          (() => own(s.sessions, idOf(a.key, p)) !== undefined) as never,
        ) === true
      );
    });
    const ids = new Set(here.map((p) => idOf(a.key, p)));
    // Members of this turn, on after memory, in action order (T3). The turn is committed; no guard read them.
    const members = s.pending.filter((p) => p.actor === a.key);
    s = { ...s, pending: s.pending.filter((p) => p.actor !== a.key) };
    for (const p of members) {
      if (!cx.slice(a.key, p.inc)) continue; // L5: its life ended in that turn
      const spec = specOf(cx, a.machine, p.slot.slice(0, p.slot.indexOf("|")));
      const E = fieldEmpty(spec, cx.slice(a.key, p.inc)?.memory);
      writeMark(
        cx,
        { actor: a.key, inc: p.inc, slot: p.slot },
        p.name === "bookmark" ? { at: p.at, filled: !E } : { at: undefined, filled: false },
      );
      s = afterMember(s, a.key, p.inc, p.slot, p.name === "bookmark" ? p.at : undefined, cx);
    }
    // T3: a releasing turn may raise `filled`, never lower it. Then it goes.
    for (const x of Object.values(s.sessions)) {
      if (x.actor !== a.key || ids.has(x.id)) continue;
      const b = markOf(cx, x);
      const i = cx.slice(x.actor, x.inc);
      if (b && i && !b.filled && !fieldEmpty(specOf(cx, x.machine, x.op), i.memory))
        writeMark(cx, x, { ...b, filled: true });
      s = release(s, x, cx);
    }
    for (const p of here) {
      const id = idOf(a.key, p);
      if (own(s.sessions, id)) continue;
      const spec = specOf(cx, a.machine, p.activity.op);
      // Rule 68: read once, at start. A throw means no session, with an issue (D46).
      const input = cx.user(
        p.activity.input as never,
        [{ memory: cx.slice(a.key, p.inc)?.memory, event: {} }] as never,
        (() => undefined) as never,
      );
      if (input === undefined || !carried(input)) continue;
      const KEY_FAILED = {};
      const key = cx.user(spec.key, [input], () => KEY_FAILED); // D77: no session, one issue
      if (key === KEY_FAILED) continue;
      const x = fresh(a, p, input, key, spec);
      s = busy(s, a.key, x.slot) ? put(s, x) : connect(s, x, spec, cx);
    }
    // T3: end of any committed turn whose session stays placed and has connected: `filled` is the field. On a change only.
    for (const x of Object.values(s.sessions)) {
      if (x.actor !== a.key || !x.connected) continue;
      const spec = specOf(cx, a.machine, x.op);
      const b = markOf(cx, x);
      if (x.st !== "Queued" && b) {
        const filled = !emptyFor(spec, cx, x);
        if (b.filled !== filled) writeMark(cx, x, { ...b, filled });
      }
      if (!x.inFlight && x.queue.length) s = pump(s, x, spec, cx);
    }
  }
  return s;
};

// ── After a delivery's turn. A value moves the bookmark through Denied and Unhandled; a refusal ends the session (T1, T3).
const onTurned = (s: SessionsSlice, t: Extract<Told, { k: "turned" }>, cx: Cx): SessionsSlice => {
  const x = Object.values(s.sessions).find((y) => y.inFlight?.tag === t.tag);
  if (!x) return s;
  const spec = specOf(cx, x.machine, x.op);
  const next: Session = (({ inFlight: _i, ...r }) => r)(x);
  const it = x.inFlight!.item;
  if (it.kind === "value" && spec.delivers === "latest" && t.outcome === "ran")
    return reconcile(s, { ...next, heard: text(it.v) ?? "" }, spec, cx);
  if (t.outcome === "invalid") {
    if (it.kind === "failure") return pump(s, next, spec, cx); // D50 has redelivered it
    return end(s, emptied(next, cx), spec, cx, "Defect");
  }
  if (t.outcome === "fenced") {
    cx.note("discarded", { op: x.op, item: it.kind });
    return pump(s, next, spec, cx);
  }
  if (it.kind === "missed" && it.at)
    writeMark(cx, x, { at: it.at.at, filled: markOf(cx, x)?.filled ?? false }); // T3 row 2
  if (it.kind === "value" && it.moves && spec.position) {
    const at = (it.v as Record<string, unknown>)?.[spec.position];
    if (at !== undefined && !carried(at))
      return end(s, emptied(next, cx), spec, cx, "Defect");
    const b = markOf(cx, x);
    writeMark(cx, x, { at: at ?? b?.at, filled: b?.filled ?? false }); // T3: `v[position] ?? at`, re-created if missing
  }
  return pump(s, next, spec, cx);
};

// ── Frames from the driver, fenced by connection.
type DriverFrame =
  | { readonly k: "frame"; readonly conn: string; readonly f: unknown }
  | {
      readonly k: "closed";
      readonly conn: string;
      readonly failed: boolean;
      readonly e?: unknown;
      readonly why?: string;
      readonly defect?: boolean;
    }
  | { readonly k: "failing"; readonly conn: string; readonly why: string };
const bad = (v: unknown) => v !== undefined && !carried(v);
const onFrame = (
  s: SessionsSlice,
  p: Extract<DriverFrame, { k: "frame" }>,
  cx: Cx,
): SessionsSlice => {
  const x = Object.values(s.sessions).find((y) => y.conn === p.conn);
  if (!x || x.st === "Ended" || x.st === "Waiting" || x.st === "Queued") {
    cx.note("fence", { conn: p.conn }); // and a value's go-ahead never comes; the fiber is being closed
    return s;
  }
  const spec = specOf(cx, x.machine, x.op);
  const f = p.f;
  if (isSignal(f)) {
    if (f._feed === "ping") {
      if (x.st === "Connecting") {
        cx.note("PingsWithoutLive", { op: x.op }); // does not re-arm
        return s;
      }
      if (x.st === "Dropped") return s;
      armIdle(cx, x, spec);
      return s;
    }
    if (f._feed === "down") {
      cx.disarm(`idle/${x.id}`);
      cx.disarm(`healthy/${x.id}`); // L2: T1's `—`
      abandon(x, cx);
      const { liveSince: _l, ...rest } = withoutRead(x);
      const y: Session = { ...rest, st: "Dropped", owed: false, confirmed: false };
      return spec.delivers === "latest" ? reconcile(s, y, spec, cx) : put(s, y);
    }
    // T1: a position fails to decode at intake: Defect, so one bad frame cannot stop saving.
    if (bad(f.head) || bad(f.restartAt)) return end(s, x, spec, cx, "Defect");
    if (x.st === "Repairing" && f.restartAt === undefined) {
      if (f.proof) {
        cx.note("ProofWhileRepairing", { op: x.op }); // T1: evidence; stay
        return s;
      }
      cx.note("RegistrationChurn", { op: x.op }); // T1: restart from b.at; no second notice
      armIdle(cx, x, spec);
      return repairFrom(s, x, markOf(cx, x)?.at, spec, cx);
    }
    if (x.st === "Repairing") abandon(x, cx);
    const r = register(s, x.st === "Repairing" ? withoutRead(x) : x, f, spec, cx);
    const nowX = r.sessions[x.id]!;
    return nowX.st === "Repairing" ? r : pump(r, nowX, spec, cx);
  }
  // T7: a change, in order, in a store publication, never through a turn. `from` is the session's own last position.
  if (spec.listen) {
    const y0 =
      x.st === "Connecting" ? register(s, x, { _feed: "live" }, spec, cx).sessions[x.id]! : x;
    cx.publish({ k: "pushed", machine: x.machine, op: x.op, session: x.id, value: f });
    const at = spec.position ? (f as any)?.[spec.position] : undefined;
    armIdle(cx, y0, spec);
    cx.command({ k: "pull", conn: y0.conn });
    return put(s, at === undefined ? y0 : { ...y0, listenAt: at });
  }
  // T5.
  if (spec.delivers === "latest") {
    const y0 =
      x.st === "Connecting" ? { ...x, st: "Live" as const, regInConn: true, liveSince: cx.now } : x;
    armIdle(cx, y0, spec);
    cx.command({ k: "pull", conn: y0.conn });
    const live = y0.st === "Live";
    const y: Session = {
      ...y0,
      last: { v: f, at: cx.now, own: live },
      confirmed: live,
    };
    return reconcile(s, y, spec, cx);
  }
  if (x.st === "Repairing") {
    armIdle(cx, x, spec);
    const buf = [...x.buf, { kind: "value" as const, v: f, moves: true }];
    // T4: at the bound it stops pulling: a pulled source waits, a pushed one fills its own queue.
    if (buf.length >= (spec.callbackBound ?? 1024)) {
      cx.disarm(`idle/${x.id}`); // T1, literally: armed only while a pull is outstanding. The page deadline covers this read
      return put(s, { ...x, buf, waitingForPull: true });
    }
    cx.command({ k: "pull", conn: x.conn });
    return put(s, { ...x, buf });
  }
  // A value. Connecting: `register(live())`, then this row in the new state.
  let cur = s;
  let y = x;
  if (x.st === "Connecting") {
    cur = register(s, x, { _feed: "live" }, spec, cx);
    y = cur.sessions[x.id]!;
  }
  if (y.st === "Dropped") {
    const b = markOf(cx, y);
    if (!b && emptyFor(spec, cx, y)) writeMark(cx, y, { at: undefined, filled: false });
    else if (!y.owed) y = { ...notice({ ...y, noted: false }, "Unproven"), owed: true };
  }
  cx.disarm(`idle/${y.id}`); // T1: no pull is outstanding until this one has turned
  return pump(
    cur,
    {
      ...y,
      waitingForPull: true,
      queue: [...y.queue, { kind: "value", v: f, moves: true }],
    },
    spec,
    cx,
  );
};
const onClosed = (
  s: SessionsSlice,
  p: Extract<DriverFrame, { k: "closed" }>,
  cx: Cx,
): SessionsSlice => {
  const c = own(s.closing, p.conn);
  if (c) {
    cx.disarm(`overdue/${p.conn}`);
    const { [p.conn]: _gone, ...closing } = s.closing;
    return woken({ ...s, closing }, c, cx);
  }
  const gone = Object.values(s.sessions).find((y) => y.conn === p.conn);
  if (!gone || gone.st === "Ended" || gone.st === "Waiting" || gone.st === "Queued") return s;
  const spec = specOf(cx, gone.machine, gone.op);
  // M4: T1's defect row. A stream that dies, or a `subscribe` that throws, ends; it does not reconnect.
  if (p.defect) return end(s, { ...gone, st: "Waiting" }, spec, cx, "Defect");
  return lose(s, gone, spec, cx, p.why ?? (p.failed ? "Failed" : "Closed"), true, p.e);
};

export const sessions: Module<SessionsSlice> = {
  id: "sessions",
  rank: 30,
  observes: true,
  init: () => empty,
  told(s, fact, cx) {
    switch (fact.k) {
      case "actors":
        return onActors(s, fact.changed, cx);
      case "turned":
        return onTurned(s, fact, cx);
      case "member": {
        const { input, at } = fact.value as { input: unknown; at?: unknown };
        const spec = specOf(cx, cx.machineOf(fact.actor)!, fact.op);
        const key = cx.user(spec.key, [input], () => undefined);
        return {
          ...s,
          pending: [
            ...s.pending,
            { actor: fact.actor, inc: fact.inc, slot: slotOfKey(spec, key), name: fact.name, at },
          ],
        };
      }
      default:
        return s;
    }
  },
  input(s, payload, cx) {
    const p = payload as
      | DriverFrame
      | { k: "page"; rid: string; exit: { t: string } }
      | { k: "timer"; key: string };
    if (p.k === "frame") return onFrame(s, p, cx);
    if (p.k === "page") return onPage(s, p, cx);
    if (p.k === "closed") return onClosed(s, p, cx);
    if (p.k === "failing") {
      // D79, proposed for T1: a stopped pull cannot hear a failure at the end of a queue it is not reading.
      const y = Object.values(s.sessions).find((z) => z.conn === p.conn);
      if (!y || y.st !== "Repairing" || !y.waitingForPull) return s;
      cx.note("Overflowed", { op: y.op });
      return lose(s, y, specOf(cx, y.machine, y.op), cx, p.why, false, { _tag: p.why });
    }
    if (p.k !== "timer") return s;
    // Its own timers. The kind is this module's name, never a user's value.
    const kind = p.key.slice(0, p.key.indexOf("/"));
    const id = p.key.slice(kind.length + 1);
    if (kind === "overdue") {
      const c = own(s.closing, id);
      if (!c) return s;
      cx.note("ReleaseOverdue", { op: c.op });
      const { [id]: _gone, ...closing } = s.closing;
      return woken({ ...s, closing }, c, cx);
    }
    const x = own(s.sessions, id);
    if (!x) return s;
    const spec = specOf(cx, x.machine, x.op);
    if (kind === "idle") return lose(s, x, spec, cx, "Silent", false);
    if (kind === "pageSilent") {
      if (x.st !== "Repairing") return s;
      cx.note("PageSilent", { op: x.op });
      return lose(s, x, spec, cx, "PageSilent", false);
    }
    if (kind === "healthy") return put(s, { ...x, n: 0, flaps: 0 });
    if (kind === "page") return requestPage(s, x, x.prevNext?.next, spec, cx);
    if (kind === "backoff") {
      if (busy(s, x.actor, x.slot)) return put(s, { ...x, st: "Queued" });
      return connect(s, x, spec, cx);
    }
    return s;
  },
  read(s, ref) {
    const x = Object.values(s.sessions).find((y) => `${y.actor}|${y.op}` === ref);
    if (!x) return undefined;
    const c =
      x.st === "Live" || x.st === "Repairing" ? "Live" : x.st === "Ended" ? "Ended" : "Connecting";
    return {
      connection: c,
      st: x.st,
      queued: x.queue.length,
      inFlight: x.inFlight !== undefined,
      catchingUp: x.st === "Repairing",
      buffered: x.buf.length,
      value: x.st === "Live" && x.confirmed ? x.last?.v : undefined,
      ...(x.last ? { last: { value: x.last.v, at: x.last.at } } : {}),
    };
  },
  dispose(s, cx) {
    for (const x of Object.values(s.sessions)) if (x.conn) cx.command({ k: "close", conn: x.conn });
    return empty;
  },
  exec(cmd, io) {
    const c = cmd as {
      k: "open" | "close" | "pull" | "read" | "abandon";
      rid: string;
      next: unknown;
      conn: string;
      machine: string;
      op: string;
      input: unknown;
      from: unknown;
    };
    if (c.k === "close") return io.stop(c.conn);
    if (c.k === "pull") return io.open(c.conn);
    if (c.k === "abandon") return io.stop(`read:${c.rid}`);
    if (c.k === "read") {
      const sp = io.machine(c.machine).streams![c.op] as unknown as SealedStream;
      const eff = Effect.suspend(
        () =>
          sp.catchUp!.run(c.input, { from: c.from, next: c.next }) as Effect.Effect<
            unknown,
            unknown
          >,
      );
      return io.fork(`read:${c.rid}`, eff, (exit) => io.input({ k: "page", rid: c.rid, exit }));
    }
    const spec = io.machine(c.machine).streams![c.op] as unknown as SealedStream;
    // D79: a `Feed.callback` asks this Runtime for its queue, so a failing one can be heard with the pull stopped. A throw building it: T1's defect.
    const stream = Stream.unwrap(
      Effect.sync(
        () => spec.subscribe.run(c.input, { from: c.from }) as Stream.Stream<unknown, unknown>,
      ),
    ).pipe(
      Stream.provideService(FeedQueue, {
        make: (cb) =>
          feedStream(cb, {
            latest: spec.delivers === "latest",
            onFailing: (why) => io.input({ k: "failing", conn: c.conn, why }),
          }),
      }),
    );
    // D71: a signal flows; a value waits for its go-ahead, so a pulled source waits with it.
    const run = Stream.runForEach(stream, (f) =>
      Effect.suspend(() => {
        io.input({ k: "frame", conn: c.conn, f } satisfies DriverFrame);
        return isSignal(f) ? Effect.void : (io.credit(c.conn) as Effect.Effect<void>);
      }),
    );
    io.fork(c.conn, run, (exit) =>
      io.input({
        k: "closed",
        conn: c.conn,
        failed: exit.t !== "ok",
        ...(exit.t === "defect" ? { defect: true } : {}),
        ...(exit.t === "failure"
          ? { e: exit.reason, why: (exit.reason as any)?._tag ?? "Failed" }
          : {}),
      } satisfies DriverFrame),
    );
  },
};
