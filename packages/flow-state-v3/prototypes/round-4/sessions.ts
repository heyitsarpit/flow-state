// THIN SPIKE of the stream seam. Form A (S5): session state is in the slice, the connection handle is the driver's. Streams T1, T2's
// no-catchUp rows, T3, T4's `every`, rule 69, 70, 71. NOT streams: no catchUp, Repairing, `latest`, `listen`, `Flapping`, Overflow,
// `.each` subscribe or `when`. It tests where the seam gives, on this runtime. The core imports none of this.
// Prior art: S5's formA.ts (the transition table); desk feed.socket.ts, feed.machine.ts (the fixture's shape).
import { Effect, Stream } from "effect";
import type { Signal, StreamSpec } from "../conformance/fixtures/compiled.ts";
import { text } from "./gate.ts";
import { fragOf } from "./world.ts";
import { up, viewOf, walkIncs } from "./inc.ts";
import type { ActorView, Cx, Module, Told } from "./seam.ts";
import type { Inc } from "./world.ts";

type Item = {
  readonly kind: "value" | "missed";
  readonly v?: unknown;
  readonly why?: string;
  moves: boolean;
};
type St = "Queued" | "Connecting" | "Live" | "Dropped" | "Waiting" | "Ended" | "Releasing";
type Session = {
  readonly id: string;
  readonly actor: string;
  readonly machine: string;
  readonly inc: string;
  readonly op: string;
  readonly slot: string; // op|key: the partition's entry, and the wait for a predecessor (rule 70)
  readonly input: unknown;
  readonly st: St;
  readonly conn: string;
  readonly n: number;
  readonly regInConn: boolean;
  readonly owed: boolean;
  readonly noted: boolean;
  readonly claim: unknown;
  readonly wiped: boolean;
  readonly connected: boolean;
  readonly queue: readonly Item[];
  readonly inFlight?: { readonly tag: string; readonly item: Item };
  readonly tags: number;
  readonly lastReset?: { readonly at: unknown };
};
type Mark = { readonly at: unknown; readonly filled: boolean }; // the bookmark
type Pending = {
  readonly inc: string;
  readonly slot: string;
  readonly name: string;
  readonly at: unknown;
};
export type SessionsSlice = {
  readonly sessions: Readonly<Record<string, Session>>;
  readonly pending: readonly Pending[]; // members this turn, applied once the turn is committed, in this same step
};
const empty: SessionsSlice = { sessions: {}, pending: [] };
const specOf = (cx: Cx, machine: string, op: string): StreamSpec =>
  cx.machine(machine).streams![op]!;
const isSignal = (f: any): f is Signal => typeof f === "object" && f !== null && "_feed" in f;
const slotOf = (spec: StreamSpec, input: unknown) => `${spec.id}|${text(spec.key(input))}`;
const put = (s: SessionsSlice, x: Session): SessionsSlice => ({
  ...s,
  sessions: { ...s.sessions, [x.id]: x },
});
const drop = (s: SessionsSlice, id: string): SessionsSlice => {
  const { [id]: _gone, ...sessions } = s.sessions;
  return { ...s, sessions };
};
const incOf = (root: Inc | undefined, id: string) => {
  let found: Inc | undefined;
  if (root) walkIncs(root, (i) => void (i.id === id ? (found = i) : undefined));
  return found;
};
// What the partition says, read through the view, never through a copy: rule 71's one place.
const markOf = (i: Inc | undefined, slot: string): Mark | undefined =>
  (i?.partition?.["sessions"] as Record<string, Mark> | undefined)?.[slot];
const writeMark = (cx: Cx, x: Session, m: Mark | undefined) =>
  cx.partition(x.actor, x.inc, (old) => {
    const { [x.slot]: _g, ...rest } = (old ?? {}) as Record<string, Mark>;
    return m ? { ...rest, [x.slot]: m } : rest;
  });
const fieldEmpty = (spec: StreamSpec, i: Inc | undefined) => {
  if (!spec.fills) return true; // `fills: false` is always empty
  const f = viewOf(i!)?.[spec.fills];
  return !(Array.isArray(f) && f.length > 0);
};
const armIdle = (cx: Cx, x: Session, spec: StreamSpec) =>
  cx.arm(`idle/${x.id}`, cx.now + spec.idleMs);

// ── Delivery, rule 69: at most one in mail for a session. The next goes when it has turned.
const pump = (s: SessionsSlice, x0: Session, spec: StreamSpec, cx: Cx): SessionsSlice => {
  if (x0.inFlight || x0.queue.length === 0) return put(s, x0);
  const [item, ...queue] = x0.queue;
  const tag = `${x0.id}#${x0.tags}`;
  const m = item!.kind === "value" ? spec.value : spec.missed;
  let payload: unknown = {};
  if (m.from) {
    payload = cx.user(
      m.from as never,
      [item!.v, { key: spec.key(x0.input), input: x0.input }] as never,
      (() => "__threw__") as never,
    );
    if (payload === "__threw__") return end(s, x0, spec, cx, "Defect"); // D46: a value mapper's throw is T1's end(Defect)
  }
  cx.deliver({
    actor: x0.actor,
    inc: x0.inc,
    event: { tag: m.event, payload: payload as object },
    tag,
    ending: false,
  });
  return put(s, { ...x0, queue, inFlight: { tag, item: item! }, tags: x0.tags + 1 });
};
const notice = (x: Session, why: string): Session =>
  x.noted ? x : { ...x, noted: true, queue: [...x.queue, { kind: "missed", why, moves: false }] };
const end = (
  s: SessionsSlice,
  x: Session,
  spec: StreamSpec,
  cx: Cx,
  why: string,
): SessionsSlice => {
  cx.command({ k: "close", conn: x.conn });
  cx.disarm(`idle/${x.id}`);
  cx.disarm(`backoff/${x.id}`);
  cx.deliver({
    actor: x.actor,
    inc: x.inc,
    event: { tag: spec.failure.event, payload: { why } },
    tag: `${x.id}#end`,
    ending: true,
  });
  return put(s, { ...x, st: "Ended", queue: [] });
};

// ── T1's procedures.
const connect = (
  s: SessionsSlice,
  x0: Session,
  spec: StreamSpec,
  inc: Inc | undefined,
  cx: Cx,
): SessionsSlice => {
  let x = { ...x0, wiped: false, noted: false, connected: true };
  let b = markOf(inc, x.slot);
  if (b?.filled && fieldEmpty(spec, inc)) {
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
  inc: Inc | undefined,
  cx: Cx,
): SessionsSlice => {
  const first = !x0.regInConn;
  let x: Session = { ...x0, regInConn: true, owed: false, noted: false, st: "Live" };
  cx.arm(`healthy/${x.id}`, cx.now + spec.healthyMs);
  armIdle(cx, x, spec);
  const b = markOf(inc, x.slot);
  const E = fieldEmpty(spec, inc);
  if (sig.restartAt !== undefined) {
    if (!b && E) writeMark(cx, x, { at: sig.restartAt, filled: false }); // row 1
    else x = { ...notice(x, "Reset"), lastReset: { at: sig.restartAt } }; // row 2: at missed Reset's admission
    return put(s, x);
  }
  if (!b && E) {
    writeMark(cx, x, { at: sig.head, filled: false }); // row 3: first open
    return put(s, x);
  }
  if (sig.proof && (x.claim !== undefined || !first)) return put(s, x); // row 4
  if (x.wiped && first) return put(s, notice(x, "Unproven")); // row 5
  if (b && b.at !== undefined) return put(s, notice(x, "Unproven")); // row 6
  if (!b) writeMark(cx, x, { at: sig.head, filled: !E }); // row 7
  return put(s, notice(x, "Unproven"));
};
const lose = (
  s: SessionsSlice,
  x: Session,
  spec: StreamSpec,
  cx: Cx,
  why: string,
): SessionsSlice => {
  cx.disarm(`idle/${x.id}`);
  cx.disarm(`healthy/${x.id}`);
  cx.command({ k: "close", conn: x.conn });
  if (!spec.reconnect) return end(s, x, spec, cx, why);
  cx.arm(`backoff/${x.id}`, cx.now + spec.backoff(x.n));
  return put(s, {
    ...x,
    st: "Waiting",
    n: x.n + 1,
    regInConn: false,
    queue: x.queue.filter((q) => !q.moves || x.inFlight),
  });
};
// Rule 70: undelivered items are discarded with evidence. The next session of this (actor, slot) waits for the scope to close.
const release = (s: SessionsSlice, x: Session, cx: Cx): SessionsSlice => {
  if (x.inFlight) cx.retract(x.inFlight.tag);
  for (const q of [...x.queue, ...(x.inFlight ? [x.inFlight.item] : [])])
    cx.note("discarded", { op: x.op, item: q.kind });
  cx.disarm(`idle/${x.id}`);
  cx.disarm(`healthy/${x.id}`);
  cx.disarm(`backoff/${x.id}`);
  if (x.st === "Waiting" || x.st === "Queued" || x.st === "Ended") return closed(s, x, cx);
  cx.command({ k: "close", conn: x.conn });
  cx.arm(`overdue/${x.id}`, cx.now + 5000);
  return put(s, { ...x, st: "Releasing", queue: [], lastReset: undefined as never });
};
// A predecessor has closed: whoever waits on this (actor, slot) connects now.
const closed = (s: SessionsSlice, gone: Session, cx: Cx): SessionsSlice => {
  const next = Object.values(s.sessions).find(
    (y) => y.st === "Queued" && y.actor === gone.actor && y.slot === gone.slot,
  );
  return next ? connect(s, next, specOf(cx, next.machine, next.op), incNow(next, cx), cx) : s;
};
const incNow = (x: Session, cx: Cx) => incOf(cx.actor(x.actor)?.root, x.inc);
// T1's member cells, no catchUp: queued values stop moving; Live and Dropped owe a notice, at the head.
const afterMember = (s: SessionsSlice, a: string, inc: string, slot: string): SessionsSlice => {
  let out = s;
  for (const x of Object.values(s.sessions)) {
    if (x.actor !== a || x.inc !== inc || x.slot !== slot) continue;
    const queue = x.queue.map((q) => ({ ...q, moves: false }));
    const owed = x.st === "Live" || x.st === "Dropped";
    out = put(out, {
      ...x,
      queue:
        owed && !x.noted ? [{ kind: "missed", why: "Unproven", moves: false }, ...queue] : queue,
      noted: x.noted || owed,
    });
  }
  return out;
};

// ── The level-triggered fact: which sessions should exist is a function of this actor's tree.
const wanted = (a: ActorView, cx: Cx) => {
  const out: Array<{ inc: Inc; node: string; op: string; input: unknown; activation: string }> = [];
  if (!a.root) return out;
  const m = cx.machine(a.machine);
  walkIncs(a.root, (i) => {
    if (i.frozen) return;
    const f = fragOf(m, i);
    for (const n of up(f, i.leaf))
      for (const act of f.nodes[n]!.activities ?? []) {
        const input = cx.user(act.input, [{ memory: viewOf(i), event: {} }], () => undefined);
        if (input !== undefined)
          out.push({ inc: i, node: n, op: act.op, input, activation: i.activations[n] ?? "" });
      }
  });
  return out;
};
const onActors = (s0: SessionsSlice, changed: readonly ActorView[], cx: Cx): SessionsSlice => {
  let s = s0;
  for (const a of changed) {
    if (!cx.machine(a.machine).uses.includes("sessions")) continue;
    const want = wanted(a, cx);
    const ids = new Set(want.map((w) => `${a.key}/${w.inc.id}/${w.activation}/${w.op}`));
    // Members of this turn, on after memory, in action order (T3). The turn is committed; no guard read them.
    const members = s.pending.filter((p) => incOf(a.root, p.inc));
    s = { ...s, pending: s.pending.filter((p) => !incOf(a.root, p.inc)) };
    for (const p of members) {
      const write = (mk: Mark) =>
        cx.partition(a.key, p.inc, (old) => ({ ...(old as object), [p.slot]: mk }));
      if (p.name === "bookmark") write({ at: p.at, filled: true });
      else write({ at: undefined, filled: false }); // refetch
      s = afterMember(s, a.key, p.inc, p.slot);
    }
    for (const x of Object.values(s.sessions)) {
      if (x.actor !== a.key || x.st === "Releasing" || ids.has(x.id)) continue;
      s = release(drop(s, x.id), x, cx);
    }
    for (const w of want) {
      const id = `${a.key}/${w.inc.id}/${w.activation}/${w.op}`;
      if (s.sessions[id]) continue;
      const spec = specOf(cx, a.machine, w.op);
      const x: Session = {
        id,
        actor: a.key,
        machine: a.machine,
        inc: w.inc.id,
        op: w.op,
        slot: slotOf(spec, w.input),
        input: w.input,
        st: "Queued",
        conn: "",
        n: 0,
        regInConn: false,
        owed: false,
        noted: false,
        claim: undefined,
        wiped: false,
        connected: false,
        queue: [],
        tags: 0,
      };
      const busy = Object.values(s.sessions).some(
        (y) => y.actor === a.key && y.slot === x.slot && y.st === "Releasing",
      );
      s = busy ? put(s, x) : connect(s, x, spec, w.inc, cx);
    }
    // T3: end of any committed turn whose session stays placed and has connected: `filled` is the field. On a change only.
    for (const x of Object.values(s.sessions)) {
      if (x.actor !== a.key || !x.connected || x.st === "Releasing") continue;
      const i = incNow(x, cx); // the partition may have moved just above
      if (!i) continue;
      const b = markOf(i, x.slot);
      const filled = !fieldEmpty(specOf(cx, a.machine, x.op), i);
      if (b && b.filled !== filled) writeMark(cx, x, { ...b, filled });
      if (!x.inFlight && x.queue.length) s = pump(s, x, specOf(cx, a.machine, x.op), cx);
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
  if (t.outcome === "invalid") return end(s, next, spec, cx, "Defect");
  if (t.outcome === "fenced") return put(s, next);
  const it = x.inFlight!.item;
  if (it.kind === "missed" && x.lastReset)
    cx.partition(x.actor, x.inc, (old) => {
      const o = (old ?? {}) as Record<string, Mark>;
      return { ...o, [x.slot]: { at: x.lastReset!.at, filled: o[x.slot]?.filled ?? false } };
    });
  if (it.kind === "value" && it.moves && spec.position) {
    const at = (it.v as Record<string, unknown>)?.[spec.position];
    if (at !== undefined && text(at) === undefined) return end(s, next, spec, cx, "Defect"); // a position that cannot be saved
    cx.partition(x.actor, x.inc, (old) => {
      const o = (old ?? {}) as Record<string, Mark>;
      return { ...o, [x.slot]: { at: at ?? o[x.slot]?.at, filled: o[x.slot]?.filled ?? false } };
    });
  }
  return pump(s, next, spec, cx);
};

// ── Frames from the driver, fenced by connection.
type DriverFrame =
  | { readonly k: "frame"; readonly conn: string; readonly f: unknown }
  | { readonly k: "closed"; readonly conn: string; readonly failed: boolean };
const onFrame = (
  s: SessionsSlice,
  p: Extract<DriverFrame, { k: "frame" }>,
  cx: Cx,
): SessionsSlice => {
  const x = Object.values(s.sessions).find((y) => y.conn === p.conn);
  if (!x || x.st === "Releasing" || x.st === "Ended" || x.st === "Waiting") {
    cx.note("fence", { conn: p.conn });
    return s;
  }
  const spec = specOf(cx, x.machine, x.op);
  const inc = incNow(x, cx);
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
      return put(s, { ...x, st: "Dropped", owed: false });
    }
    const r = register(s, x, f, spec, inc, cx);
    return pump(r, r.sessions[x.id]!, spec, cx);
  }
  // A value. Connecting: `register(live())`, then this row in the new state.
  let cur = s;
  let y = x;
  if (x.st === "Connecting") {
    cur = register(s, x, { _feed: "live" }, spec, inc, cx);
    y = cur.sessions[x.id]!;
  }
  if (y.st === "Dropped") {
    const b = markOf(inc, y.slot);
    if (!b && fieldEmpty(spec, inc)) writeMark(cx, y, { at: undefined, filled: false });
    else if (!y.owed) y = { ...notice({ ...y, noted: false }, "Unproven"), owed: true };
  }
  armIdle(cx, y, spec);
  return pump(cur, { ...y, queue: [...y.queue, { kind: "value", v: f, moves: true }] }, spec, cx);
};

export const sessions: Module<SessionsSlice> = {
  id: "sessions",
  rank: 30,
  observes: true,
  init: () => empty,
  input(s, payload, cx) {
    const p = payload as Told | DriverFrame | { k: "timer"; key: string };
    if (p.k === "actors") return onActors(s, p.changed, cx);
    if (p.k === "turned") return onTurned(s, p, cx);
    if (p.k === "member") {
      const { input, at } = p.value as { input: unknown; at?: unknown };
      const spec = specOf(cx, cx.actor(p.actor)!.machine, p.op);
      return {
        ...s,
        pending: [...s.pending, { inc: p.inc, slot: slotOf(spec, input), name: p.name, at }],
      };
    }
    if (p.k === "frame") return onFrame(s, p, cx);
    if (p.k === "closed") {
      const gone = Object.values(s.sessions).find((y) => y.conn === p.conn);
      if (!gone) return s;
      if (gone.st === "Releasing") {
        cx.disarm(`overdue/${gone.id}`);
        return closed(drop(s, gone.id), gone, cx);
      }
      if (gone.st === "Ended" || gone.st === "Waiting") return s;
      return lose(s, gone, specOf(cx, gone.machine, gone.op), cx, p.failed ? "Failed" : "Closed");
    }
    // A timer.
    const kind = p.key.slice(0, p.key.indexOf("/")); // this module's own timer names: the kind is never a user's value
    const id = p.key.slice(kind.length + 1);
    const x = s.sessions[id];
    if (!x) return s;
    const spec = specOf(cx, x.machine, x.op);
    if (kind === "idle") return lose(s, x, spec, cx, "Silent");
    if (kind === "healthy") return put(s, { ...x, n: 0 });
    if (kind === "backoff") return connect(s, x, spec, incNow(x, cx), cx);
    if (kind === "overdue") {
      cx.note("ReleaseOverdue", { op: x.op });
      return closed(drop(s, id), x, cx);
    }
    return s;
  },
  read(s, ref) {
    const x = Object.values(s.sessions).find((y) => `${y.actor}|${y.op}` === ref);
    if (!x) return undefined;
    const c =
      x.st === "Live"
        ? "Live"
        : x.st === "Ended"
          ? "Ended"
          : x.st === "Releasing"
            ? undefined
            : "Connecting";
    return { connection: c, st: x.st, queued: x.queue.length, inFlight: x.inFlight !== undefined };
  },
  dispose(s, cx) {
    for (const x of Object.values(s.sessions)) if (x.conn) cx.command({ k: "close", conn: x.conn });
    return empty;
  },
  exec(cmd, io) {
    const c = cmd as {
      k: "open" | "close";
      conn: string;
      machine: string;
      op: string;
      input: unknown;
      from: unknown;
    };
    if (c.k === "close") return io.stop(c.conn);
    const spec = io.machine(c.machine).streams![c.op]!;
    const stream = spec.subscribe(c.input, { from: c.from }) as Stream.Stream<unknown, unknown>;
    const run = Stream.runForEach(stream, (f) =>
      Effect.sync(() => io.input({ k: "frame", conn: c.conn, f } satisfies DriverFrame)),
    );
    io.fork(c.conn, run, (exit) =>
      io.input({ k: "closed", conn: c.conn, failed: exit.t !== "ok" } satisfies DriverFrame),
    );
  },
};
