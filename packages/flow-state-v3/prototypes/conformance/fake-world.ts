// The world, owned by the suite so it survives runtime rewrites: virtual clock, stepping scheduler, fake server,
// fake storage. A runtime sees only `Host` and `Api`. A "process" is a generation: when it dies, nothing from it
// reaches the next one, without any cooperation from the runtime.
import { Effect, Exit, Stream, type Scheduler } from "effect";
import { feedCallback } from "./fixtures/compiled.ts";
import type { Answer, Outside, Request, World0 } from "./harness.ts";

export type Purpose = "acknowledge" | "capture" | "flush";
export type Write = { readonly key: string; readonly value: string | undefined }; // undefined deletes
export type Host = {
  now(): number;
  id(): string;
  setTimer(at: number, f: () => void): () => void;
  later(f: () => void): void; // a new task: what the page runs between. The page after `later` has painted, or may have
  workClock?(): number; // D122: what a slice of work is measured by. Not given: `performance.now()`. The fake counts, so a yield falls in the same place every run
  scheduler: Scheduler.Scheduler;
  // Round 7, D80: when the page stops being seen: `visibilitychange` to hidden, `pagehide`. A host may not have one.
  onHidden?(f: () => void): void;
  isHidden?(): boolean; // while hidden nothing waits for `captureMs` (review M3)
  // Stage J: the store's codec, a stored record's text as a value. Not given: `JSON.parse`. Production's store and codec live here too.
  decode?(key: string, text: string): unknown;
  storage: {
    load(): ReadonlyMap<string, string> | PromiseLike<ReadonlyMap<string, string>>; // round 7: a real read takes time, or never answers
    // `then` makes the write awaited: the fake holds it until a `storage` step. Others land at once. `failed`: a plain write that
    // did not land (review M7). A real store says so; silence is not landing. The batch is atomic: this is the contract D80 relies on.
    write(writes: readonly Write[], purpose: Purpose, answer: (ok: boolean, why?: string) => void): void; // an answer comes later, never inside
  };
};
export type ServerModel = {
  init(): any;
  // Applies a write. A `fail` is a definite refusal; nothing changed.
  apply?(op: string, input: any, s: any): { s: any; value?: unknown; fail?: any };
  read?(op: string, input: any, s: any, t: World0): unknown;
};
type E = Effect.Effect<unknown, any>;
export type FakeEventSource = {
  onopen: ((e: { readonly type: "open" }) => void) | null;
  onmessage: ((e: { readonly type: "message"; readonly data: string; readonly lastEventId: string }) => void) | null;
  onerror: ((e: { readonly type: "error" }) => void) | null;
  readyState: 0 | 1 | 2;
  close(): void;
  addEventListener(type: string, fn: (e: any) => void): void;
  removeEventListener(type: string, fn: (e: any) => void): void;
};
export type FakeWebSocket = {
  readyState: 0 | 1 | 2 | 3;
  addEventListener(type: "open" | "message" | "close" | "error", fn: (e: any) => void): void;
  removeEventListener(type: "open" | "message" | "close" | "error", fn: (e: any) => void): void;
  send(data: string): void;
  close(code?: number): void;
};
type RawEvent =
  | { type: "open" }
  | { type: "message"; data: string; lastEventId?: string; event?: string }
  | { type: "error"; fatal?: boolean }
  | { type: "retry"; ms: number };
type RawSocket = { type: "open" } | { type: "message"; data: string } | { type: "close"; code?: number };
export type Api = {
  call(op: string, input: unknown, o?: { idempotencyKey?: string; dedupe?: false }): E;
  track(op: string, key: string, body: E): E; // a request whose body is the fixture's own effect
  confirm(i: unknown, o: { idempotencyKey: string }): E;
  placeOrder(i: unknown, o: { idempotencyKey: string }): E;
  voidAuthorization(i: unknown, o: { idempotencyKey: string }): E;
  intent(i: unknown): E;
  orderFor(i: unknown): E;
  socket(op: string, input: unknown, from: unknown): unknown; // Stream of what the server pushes, until a `feed` step ends it
  pulled(op: string, input: unknown, from: unknown): unknown; // hands over one backlog item per pull (T4)
  feed(op: string, input: unknown, from: unknown, bound?: number): unknown; // T6: a `Feed.callback`. The queue is the runtime's
  eventSource(op: string, input: unknown, from: unknown): FakeEventSource; // a browser's EventSource: the raw events a scenario pushes
  webSocket(op: string, url?: string): FakeWebSocket; // a browser's WebSocket: the raw events a scenario pushes; `sent` is what the runtime sent
  page(): number; // which page load this is: a fixture's module state (an app-wide socket hub) belongs to one, as a browser's does
};
type Conn = {
  op: string;
  input: unknown;
  from: unknown;
  process: number;
  open: boolean; // the server's side: until a close has finished, or the server ended it
  closing?: boolean; // we asked; a real close is a handshake and awaited finalizers
  pulled: number; // items a pulled source has handed over: T4's "at turn pace" is seen here
  backlog: unknown[]; // a pulled source's items, waiting at the server
  ended?: boolean;
  failing?: { e: unknown };
  wake?: (() => void) | undefined;
  push?: (f: unknown) => void;
  end?: () => void;
  fail?: (e: unknown) => void;
  closingAt?: number; // the first time `closing` became true, on the fake clock
  sent?: string[]; // a WebSocket's frames the runtime sent
  lastEventIdHeader?: string; // an EventSource's reconnect: the Last-Event-ID the browser sent
  heldAtOpen: number;
};

class StepScheduler implements Scheduler.Scheduler {
  readonly executionMode = "async" as const;
  q: Array<() => void> = [];
  shuffle: number | undefined;
  yieldEvery = 0;
  picks = 0;
  choices = 0;
  private ops = 0;
  shouldYield() {
    return this.yieldEvery > 0 && ++this.ops % this.yieldEvery === 0;
  }
  private d = { scheduleTask: (t: () => void) => void this.q.push(t), flush: () => {} };
  makeDispatcher() {
    return this.d;
  }
  next() {
    this.picks++;
    if (this.q.length > 1) this.choices++;
    if (this.shuffle === undefined) return this.q.shift()!;
    this.shuffle = (Math.imul(this.shuffle, 48271) >>> 0) % 2147483647;
    return this.q.splice(this.shuffle % this.q.length, 1)[0]!;
  }
}

type Held = Request & {
  startState?: unknown; // review H6: what the server held when this request started
  never?: boolean;
  aborted?: boolean;
  lostOpen?: boolean; // the answer was lost and the server has not applied it: it may land late
  landedUnseen?: boolean; // the server applied it; nobody heard
  refused?: boolean; // a `fail`: rule 18 says the first send may still land, so this decides nothing (M9)
  tracked?: boolean;
  resume?: ((e: E) => void) | undefined;
  process: number;
  noDedupe?: boolean; // a server with no idempotency (PostgREST): the key labels the request, the server applies each send
};
const capturable = (v: any) => v?.status === "requires_capture" || v?.status === "succeeded";
const stable = (v: unknown): string =>
  JSON.stringify(v, (_: string, x: any) =>
    x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x,
  );
const matches = (input: any, where?: Readonly<Record<string, unknown>>) =>
  !where || Object.entries(where).every(([k, v]) => input?.[k] === v);
type Listener = (e: any) => void;
const eventTarget = () => {
  const byType = new Map<string, Set<Listener>>();
  return {
    add: (type: string, fn: Listener) => {
      byType.set(type, (byType.get(type) ?? new Set<Listener>()).add(fn));
    },
    remove: (type: string, fn: Listener) => void byType.get(type)?.delete(fn),
    fire: (type: string, e: unknown, handler?: Listener | null) => {
      handler?.(e);
      for (const fn of [...(byType.get(type) ?? [])]) fn(e);
    },
  };
};

const FROZEN_AFTER = 5_000;
const NORMAL_CLOSE = 1000; // a WebSocket's clean close code
export class FakeWorld {
  now = 0; // monotonic: what timers run on
  clockOffset = 0; // how far the wall clock the host reads has been set back
  process = 0;
  private idSeq = 0;
  private timers: Array<{ at: number; claim: number; seq: number; f: () => void; process: number }> = [];
  private timerSeq = 0;
  readonly scheduler = new StepScheduler();
  private laters: Array<() => void> = [];

  readonly requests: Held[] = [];
  readonly charged = new Set<string>();
  readonly acked = new Set<string>();
  readonly placedKeys = new Set<string>();
  readonly voidedKeys = new Set<string>();
  readonly chargedIntents = new Set<string>();
  readonly voidedIntents = new Set<string>();
  readonly placedIntents = new Set<string>();
  readonly landed = new Map<string, { value?: unknown; fail?: any }>();
  readonly landedBody = new Map<string, string>();
  readonly applications = new Map<string, number>(); // D145: real applications per key; more than one is money moved twice
  bodyMismatches = 0;
  // D145, assumptions #2: the server prunes what it remembers of keys. The next send of an old key is a new request.
  forgetKeys() {
    this.landed.clear();
    this.landedBody.clear();
  }
  readonly auths: Array<{ key: string; intent: string; voided: boolean; placed: boolean }> = [];
  readonly orders: string[] = [];
  serverState: any;
  uninterruptible = new Set<string>();
  syncAnswers = new Map<string, Answer | ((input: any) => Answer)>();
  // D122, review assumption 57: an answer that comes as a resolved promise does: after the pump has returned, before any task. By the input, so one row of a queue can differ.
  microAnswers = new Map<string, (input: any) => Answer>();
  private micro: Array<() => void> = [];
  private sinceTask = 0;
  tasks = 0; // how many tasks the page has had
  private work = 0;
  spent = 0;
  private spentFrom = 0;
  spendLimit = Infinity;
  yields = 0;

  readonly kv = new Map<string, string>();
  plainFails = 0; // review M7: the next n plain writes fail, and say so
  lateCancels = 0; // re-audit M3: the next n timer cancels come too late
  // Review H1: a real store answers later. `Late`: said on the next tick. `Held`: said only at a `failLate` storage step, after whatever came next.
  plainFailsLate = 0;
  plainFailsHeld = 0;
  private laterFailing = 0;
  private lateReports: Array<{ writes: readonly Write[]; go: () => void }> = [];
  holdPlain = false; // a plain success in flight: answered by a `storage` step (review, assumption 14)
  slowAfterAck = false; // D104: the store goes slow at the next `ack`: what is issued after it stays in flight. H1's real shape (review: held 400 ms after the ack)
  storeWide = false; // one IndexedDB store: only the oldest batch is answerable, so a hang holds everyone
  hidden = false;
  freezeTimers = false; // a frozen tab: nothing fires until thaw
  private outKeys = (): Set<string> =>
    new Set([...this.held.flatMap((h) => h.writes), ...this.lateReports.flatMap((r) => r.writes)].map((w) => w.key));
  private oneOutPerKey(writes: readonly Write[]) {
    const out = this.outKeys();
    for (const w of writes)
      if (out.has(w.key)) throw new Error(`(g) a second write out for ${w.key}`);
  }
  // What was asked of the store, in order, whatever became of it: an oracle's own record, so a case can see a cut, a retry's gap, or a batch that should not exist.
  readonly batches: Array<{ at: number; purpose: Purpose; writes: readonly Write[] }> = [];
  loadMode: "now" | "hang" | "fail" = "now"; // round 7: the next boot's read
  private pendingLoad: { ok: (m: ReadonlyMap<string, string>) => void; no: (e: unknown) => void } | undefined;
  loadAnswered = 0; // stage L: loads answered with the records, over the run
  get loadPending() {
    return this.pendingLoad !== undefined; // a slow load the suite has not answered
  }
  private hiders: Array<{ f: () => void; process: number }> = [];
  private lastBatch: Array<{ key: string; before: string | undefined }> = [];
  private held: Array<{
    writes: readonly Write[];
    purpose: Purpose;
    answer: (ok: boolean, why?: string) => void;
    hung?: boolean;
  }> = [];
  constructor(
    readonly seed: number,
    readonly server?: ServerModel,
  ) {
    this.serverState = server?.init();
  }

  killProcess() {
    this.process++;
    this.timers = [];
    this.scheduler.q = [];
    this.laters = [];
    this.micro = [];
    this.sinceTask = 0;
    this.lateReports = [];
    this.laterFailing = 0;
    this.pendingLoad = undefined;
    this.held = []; // an unconfirmed write dies with its process. `landNoAck` is how a landed one is modelled.
    for (const r of this.requests) r.resume = undefined;
  }

  // ── Host
  host(): Host {
    const process = this.process;
    return {
      now: () => this.now - this.clockOffset,
      id: () => `att-${this.seed}-${++this.idSeq}`,
      setTimer: (at, f) => {
        // A real timer is relative: asked for "at" on the wall clock as it reads now. `claim` is that wall-clock time, what the world says.
        const t = { at: at + this.clockOffset, claim: at, seq: ++this.timerSeq, f, process };
        this.timers.push(t);
        return () => {
          if (this.lateCancels > 0) return void this.lateCancels--; // re-audit M3: too late, the old timer still fires at its time
          this.timers = this.timers.filter((x) => x !== t);
        };
      },
      later: (f) => void this.laters.push(f),
      workClock: () => (this.work += 0.01),
      scheduler: this.scheduler,
      onHidden: (f) => void this.hiders.push({ f, process }),
      isHidden: () => this.hidden,
      storage: {
        // M9: a store has no order. Shuffled per seed and process, for good, so rule 44's order is the runtime's own.
        load: () => {
          // Stage L (review M2): the suite's own fact of whether, and how often, a boot was given the records. Not the runtime's word.
          const read = () => {
            this.loadAnswered++;
            return this.readAll();
          };
          if (this.loadMode === "now") return read();
          const mode = this.loadMode;
          this.loadMode = "now";
          return {
            then: ((ok: never, no: never) => {
              this.pendingLoad = {
                ok: () => (ok as (m: unknown) => void)(read()),
                no: (e) => (no as (e: unknown) => void)(e),
              };
              if (mode === "fail") this.laters.push(() => this.storageStep("loadFail"));
            }) as never,
          } as PromiseLike<ReadonlyMap<string, string>>;
        },
        write: (writes, purpose, answer) => {
          this.oneOutPerKey(writes); // oracle (g): the edge's invariant, seen from the store
          this.batches.push({ at: this.now, purpose, writes });
          const plain = purpose === "flush";
          if (plain && this.plainFails > 0) {
            this.plainFails--;
            this.laters.push(() => answer(false, "a plain write failed"));
          } else if (plain && this.plainFailsLate > 0) {
            this.plainFailsLate--;
            this.laterFailing++;
            this.laters.push(() => {
              this.laterFailing--;
              answer(false, "a plain write failed, said later");
            });
          } else if (plain && this.plainFailsHeld > 0) {
            this.plainFailsHeld--;
            this.lateReports.push({
              writes,
              go: () => answer(false, "a plain write failed, said much later"),
            });
          } else if (!plain || this.holdPlain) {
            this.held.push({ writes, purpose, answer });
          } else {
            this.landWrites(writes);
            this.laters.push(() => answer(true));
          }
        },
      },
    };
  }
  // Round 7, D80: the page stops being seen. What the runtime starts here runs; what a kill then takes is the test's business.
  hide() {
    for (const h of this.hiders) if (h.process === this.process) h.f();
  }
  private readAll(): ReadonlyMap<string, string> {
          const out = [...this.kv];
          let x = (this.seed * 2654435761 + this.process * 40503 + 1) >>> 0;
          for (let i = out.length - 1; i > 0; i--) {
            x = (Math.imul(x, 48271) >>> 0) % 2147483647;
            const j = x % (i + 1);
            [out[i], out[j]] = [out[j]!, out[i]!];
          }
          return new Map(out);
  }
  // Round 7: the wall clock moves back. A real timer is relative, so what is armed fires as it would have; only `now` lies.
  clockBack(ms: number) {
    this.clockOffset += ms;
  }
  // D104, H3: at the next open the browser has recreated the origin's IndexedDB. Everything goes, older committed records too. The server remembers what it did.
  wipe() {
    this.kv.clear();
    this.lastBatch = [];
  }
  corrupt(match: string, edit: (raw: string) => string) {
    for (const [k, v] of this.kv) if (k.includes(match)) this.kv.set(k, edit(v));
  }
  // Review M7: a store with no atomic batch. Only the first `keep` writes of the last batch really landed. Real IndexedDB cannot do this.
  tearLast(keep: number): string[] {
    for (const { key, before } of this.lastBatch.slice(keep)) {
      if (before === undefined) this.kv.delete(key);
      else this.kv.set(key, before);
    }
    const keys = this.lastBatch.map((w) => w.key); // stage L (review M9): the batch's keys, landed or not, so the suite can scope its excuse
    this.lastBatch = [];
    return keys;
  }
  private landWrites(writes: readonly Write[]) {
    this.lastBatch = writes.map((w) => ({ key: w.key, before: this.kv.get(w.key) }));
    for (const w of writes) {
      if (w.value === undefined) this.kv.delete(w.key);
      else this.kv.set(w.key, w.value);
    }
  }

  storageStep(how: "ack" | "refuse" | "hang" | "landNoAck" | "failLate" | "loadOk" | "loadFail", match?: string) {
    if (how === "failLate") {
      for (const r of this.lateReports.splice(0)) r.go();
      return;
    }
    if (how === "loadOk" || how === "loadFail") {
      const p = this.pendingLoad;
      this.pendingLoad = undefined;
      if (how === "loadOk") p?.ok(new Map());
      else p?.no(new Error("the read failed"));
      return;
    }
    const eligible = (h: (typeof this.held)[number]) =>
      !h.hung &&
      (!this.storeWide || h === this.held[0]) &&
      (match === undefined || h.purpose === match || h.writes.some((w) => w.key.includes(match)));
    const answers: Array<() => void> = []; // one storage step answers in one task, as it did before answers came later
    for (const h of this.held.filter(eligible)) {
      if (how === "hang") {
        h.hung = true;
      } else if (how === "landNoAck") {
        this.landWrites(h.writes);
        this.noteAck(h.writes);
        h.hung = true;
      } else {
        this.held.splice(this.held.indexOf(h), 1);
        if (how === "ack") {
          this.landWrites(h.writes);
          this.noteAck(h.writes);
          if (this.slowAfterAck) {
            this.slowAfterAck = false;
            this.holdPlain = true;
          }
        }
        answers.push(() => h.answer(how === "ack"));
      }
      if (this.storeWide) break;
    }
    if (answers.length) this.laters.push(() => answers.forEach((a) => a()));
  }
  private noteAck(writes: readonly Write[]) {
    for (const w of writes) if (w.value !== undefined) this.acked.add(w.value); // opaque: the oracle looks for the id in it
  }
  // What a `storage` step could answer now: the search asks this rather than guessing (L8).
  answerable() {
    return this.held.some((h) => !h.hung && (!this.storeWide || h === this.held[0]));
  }

  // ── Fake server
  readonly api: Api = {
    call: (op, input, o) => this.call(op, input, o?.idempotencyKey, o?.dedupe === false),
    track: (op, key, body) => this.track(op, key, body),
    confirm: (input, o) => this.call("pay", input, o.idempotencyKey),
    placeOrder: (input, o) => this.call("place", input, o.idempotencyKey),
    voidAuthorization: (input, o) => this.call("void", input, o.idempotencyKey),
    intent: (input) => this.call("intent", input),
    orderFor: (input) => this.call("order", input),
    // D79: a pushed source is a `Feed.callback`, so what bounds it is the runtime's queue. An unbounded `Stream.callback` here was review M5.
    socket: (op, input, from) => this.api.feed(op, input, from),
    // A pulled source: nothing moves until the consumer asks. `backlog` is what the server has.
    pulled: (op, input, from) => {
      const c = this.newConn(op, input, from);
      const END = {};
      c.end = () => {
        c.ended = true;
        c.wake?.();
      };
      c.fail = (e) => {
        c.failing = { e };
        c.wake?.();
      };
      const next = Effect.callback<unknown, unknown>((resume) => {
        const give = () => {
          c.wake = undefined;
          if (c.backlog.length > 0) {
            c.pulled++;
            resume(Effect.succeed(c.backlog.shift()));
          } else if (c.failing) {
            c.open = false;
            resume(Effect.fail(c.failing.e));
          } else if (c.ended) {
            c.open = false;
            resume(Effect.succeed(END));
          }
        };
        if (c.backlog.length > 0 || c.failing || c.ended) give();
        else c.wake = give;
      });
      return Stream.fromEffectRepeat(next).pipe(
        Stream.takeWhile((x) => x !== END),
        Stream.ensuring(Effect.suspend(() => this.closeConn(c))),
      );
    },
    // T6's far side. The fake holds no queue: `emit` is the runtime's, so what bounds a pushed source is runtime code (review M5).
    feed: (op, input, from, bound) => {
      const c = this.newConn(op, input, from);
      return feedCallback({
        ...(bound === undefined ? {} : { bound }),
        start: (emit) => {
          c.push = (f) => void emit(f);
          c.end = () => emit.end();
          c.fail = (e) => emit.fail(e);
          return () => this.closeConn(c);
        },
      });
    },
    // WHATWG HTML "server-sent events": the remembered last event id, retry time, named events, and a self-reconnect after a non-fatal error.
    eventSource: (op, input, from) => {
      let cur = this.newConn(op, input, from);
      let lastId = "";
      let retryMs = 3000;
      let armed: { live: boolean } | undefined;
      const on = eventTarget();
      const es: FakeEventSource = {
        onopen: null,
        onmessage: null,
        onerror: null,
        readyState: 0,
        close: () => {
          es.readyState = 2;
          if (armed) armed.live = false;
          armed = undefined;
          cur.open = false;
          this.markClosing(cur);
        },
        addEventListener: on.add,
        removeEventListener: on.remove,
      };
      const handle = (raw: RawEvent) => {
        if (es.readyState === 2) return;
        if (raw.type === "open") {
          es.readyState = 1;
          on.fire("open", { type: "open" }, es.onopen);
        } else if (raw.type === "message") {
          if (raw.lastEventId !== undefined) lastId = raw.lastEventId;
          const type = raw.event ?? "message";
          if (raw.data !== "") on.fire(type, { type, data: raw.data, lastEventId: lastId }, type === "message" ? es.onmessage : null);
        } else if (raw.type === "retry") {
          retryMs = raw.ms;
        } else {
          cur.open = false;
          es.readyState = raw.fatal === true ? 2 : 0;
          on.fire("error", { type: "error" }, es.onerror);
          if (es.readyState === 0) {
            const token = { live: true };
            armed = token;
            this.after(retryMs, cur.process, () => {
              if (!token.live) return;
              armed = undefined;
              cur = this.newConn(op, input, from);
              if (lastId !== "") cur.lastEventIdHeader = lastId;
              attach(cur);
            });
          }
        }
      };
      const attach = (c: Conn) => {
        c.push = (raw) => handle(raw as RawEvent);
        c.end = () => handle({ type: "error" });
        c.fail = () => handle({ type: "error", fatal: true });
      };
      attach(cur);
      return es;
    },
    page: () => this.process,
    webSocket: (op, url) => {
      const c = this.newConn(op, url, undefined);
      const sent: string[] = [];
      c.sent = sent;
      const on = eventTarget();
      const ws: FakeWebSocket = {
        readyState: 0,
        addEventListener: on.add,
        removeEventListener: on.remove,
        send: (data) => {
          if (ws.readyState === 0) throw new Error("InvalidStateError");
          if (ws.readyState === 1) sent.push(data); // a closing or closed socket drops it, as a browser does
        },
        close: (code) => {
          if (ws.readyState === 2 || ws.readyState === 3) return;
          ws.readyState = 2;
          this.markClosing(c);
          if (this.closeMs === Infinity) return;
          this.after(this.closeMs, c.process, () => {
            if (ws.readyState === 3) return;
            ws.readyState = 3;
            c.open = false;
            on.fire("close", { type: "close", code: code ?? 1000, wasClean: true });
          });
        },
      };
      const handle = (raw: RawSocket) => {
        if (ws.readyState === 3) return;
        if (raw.type === "open") {
          ws.readyState = 1;
          on.fire("open", { type: "open" });
        } else if (raw.type === "message") {
          on.fire("message", { type: "message", data: raw.data });
        } else {
          ws.readyState = 3;
          c.open = false;
          const { code = 1006 } = raw;
          const clean = code === NORMAL_CLOSE;
          if (!clean) on.fire("error", { type: "error" });
          on.fire("close", { type: "close", code, wasClean: clean });
        }
      };
      c.push = (raw) => handle(raw as RawSocket);
      c.end = () => handle({ type: "close", code: 1000 });
      c.fail = () => handle({ type: "close", code: 1006 });
      return ws;
    },
  };
  readonly conns: Conn[] = [];
  closeMs = 20; // review H7: a real close takes time. `Infinity` never finishes (`ReleaseOverdue`)
  private newConn(op: string, input: unknown, from: unknown): Conn {
    // Rule 70, as the world saw it: how many connections of this op and input were held (open, and not closing for 5 s) when this one opened.
    const heldAtOpen = this.conns.filter(
      (x) => x.op === op && x.process === this.process && x.open && stable(x.input) === stable(input) && !(x.closing === true && x.closingAt !== undefined && this.now - x.closingAt >= 5000),
    ).length;
    const c: Conn = {
      op,
      input,
      from,
      process: this.process,
      open: true,
      pulled: 0,
      backlog: [],
      heldAtOpen,
    };
    this.conns.push(c);
    return c;
  }
  private markClosing(c: Conn) {
    if (c.closing === true) return;
    c.closing = true;
    c.closingAt = this.now;
  }
  private after(ms: number, process: number, f: () => void) {
    this.timers.push({ at: this.now + ms, claim: this.now + ms - this.clockOffset, seq: ++this.timerSeq, process, f });
  }
  // A server's end needs no handshake. Ours does.
  private closeConn(c: Conn): Effect.Effect<void> {
    if (!c.open) return Effect.void;
    this.markClosing(c);
    const ms = this.closeMs;
    return Effect.callback<void>((resume) => {
      if (ms === Infinity) return;
      const process = c.process;
      this.timers.push({
        at: this.now + ms,
        claim: this.now + ms - this.clockOffset,
        seq: ++this.timerSeq,
        process,
        f: () => {
          c.open = false;
          resume(Effect.void);
        },
      });
    });
  }
  // What a `feed` step does: the newest open connection of this op says something, or ends.
  feedStep(
    op: string,
    s: { frame?: unknown; frames?: readonly unknown[]; end?: true; fail?: unknown; to?: unknown; all?: true; nth?: number; closing?: true },
  ) {
    const open = this.conns.filter(
      (x) => x.op === op && x.open && (s.closing === true || !x.closing) && x.process === this.process,
    );
    const candidates = s.to === undefined ? open : open.filter((x) => stable(x.input) === stable(s.to));
    if (candidates.length === 0)
      throw new NoHeldRequest(
        `feed: no open connection for ${op}${s.to === undefined ? "" : ` to ${JSON.stringify(s.to)}`}`,
      );
    const pick = s.nth === undefined ? candidates.at(-1) : candidates[s.nth];
    if (!s.all && pick === undefined) throw new NoHeldRequest(`feed: no open connection #${s.nth} for ${op}`);
    for (const c of s.all ? candidates : [pick!]) {
      if (s.end) {
        if (c.push) c.open = false;
        c.end?.();
      } else if (s.fail !== undefined) {
        if (c.push) c.open = false;
        c.fail?.(s.fail);
      } else {
        const items = s.frames ?? [s.frame];
        if (c.push) for (const f of items) c.push(f);
        else
          for (const f of items) {
            c.backlog.push(f);
            c.wake?.();
          }
      }
    }
  }
  private call(op: string, input: unknown, key?: string, noDedupe = false): E {
    const isRead = key === undefined;
    const r: Held = {
      op,
      input,
      at: this.now,
      answered: false,
      process: this.process,
      ...(key === undefined ? {} : { idempotencyKey: key }),
      ...(noDedupe ? { noDedupe } : {}),
    };
    const sync = this.syncAnswers.get(op);
    let body: E = Effect.suspend(() => {
      r.startState = this.serverState;
      this.requests.push(r);
      if (sync) {
        r.answered = true;
        return this.settle(r, typeof sync === "function" ? sync(input) : sync);
      }
      const micro = this.microAnswers.get(op);
      if (micro)
        return Effect.callback<unknown, any>((resume) => {
          r.answered = true;
          this.micro.push(() => resume(this.settle(r, micro(input))));
        });
      return Effect.callback<unknown, any>((resume) => {
        r.resume = resume;
        // A read carries a signal, so aborting it ends it at the server. A write has none (pay.contracts.ts): it stays.
        return isRead ? Effect.sync(() => void (r.aborted = true)) : undefined;
      });
    });
    if (this.yields > 0)
      body = Effect.yieldNow.pipe(Effect.andThen(Effect.yieldNow), Effect.andThen(body));
    return this.uninterruptible.has(op) ? Effect.uninterruptible(body) : body;
  }
  private track(op: string, key: string, body: E): E {
    const r: Held = {
      op,
      input: {},
      at: this.now,
      answered: false,
      process: this.process,
      idempotencyKey: key,
      tracked: true,
    };
    return Effect.suspend(() => {
      this.requests.push(r);
      return body;
    }).pipe(
      Effect.onExit((x) =>
        Effect.sync(() => {
          r.answered = true;
          void Exit.isSuccess(x);
        }),
      ),
    );
  }
  // Applied once per key, whoever sends it and however many times, while the server remembers the key (D145: `forgetKeys` is Stripe's pruning after 24 hours).
  // D145, assumptions #5: the same key with another body is refused, as Stripe does; nothing lands.
  private landOnServer(r: Held): { value?: unknown; fail?: any } {
    const key = r.noDedupe ? undefined : r.idempotencyKey;
    const prior = key === undefined ? undefined : this.landed.get(key);
    if (prior) {
      const first = this.landedBody.get(key!);
      if (first !== undefined && first !== JSON.stringify(r.input ?? null)) {
        this.bodyMismatches++;
        return { fail: { _tag: "IdempotencyMismatch", status: 400 } };
      }
      return prior;
    }
    const out = this.server?.apply?.(r.op, r.input, this.serverState) ?? { s: this.serverState };
    if (key !== undefined) {
      this.applications.set(key, (this.applications.get(key) ?? 0) + 1); // D145: what really happened at the server, counted
      this.landedBody.set(key, JSON.stringify(r.input ?? null));
    }
    this.serverState = out.s;
    if (!out.fail) this.ledger(r, "value" in out ? out.value : undefined); // bugs M5: a landing the client never heard is still money; the ledger counts every application
    const result = {
      ...("value" in out ? { value: out.value } : {}),
      ...(out.fail ? { fail: out.fail } : {}),
    };
    if (key !== undefined) this.landed.set(key, result);
    return result;
  }
  private ledger(r: Held, v: unknown) {
    const intent = (r.input as any)?.intentId;
    if (r.op === "pay" && capturable(v)) {
      if (!this.charged.has(r.idempotencyKey!))
        this.auths.push({ key: r.idempotencyKey!, intent, voided: false, placed: false });
      this.charged.add(r.idempotencyKey!);
      this.chargedIntents.add(intent);
    }
    if (r.op === "place") {
      this.placedKeys.add(r.idempotencyKey!);
      this.placedIntents.add(intent);
      const latest = this.auths.findLast((a) => a.intent === intent && !a.placed);
      if (latest) latest.placed = true;
      const id = (v as any)?.orderId;
      if (id && !this.orders.includes(id)) this.orders.push(id);
    }
    if (r.op === "void") {
      this.voidedKeys.add(r.idempotencyKey!);
      this.voidedIntents.add(intent);
      for (const a of this.auths) if (a.intent === intent) a.voided = true;
    }
  }
  private settle(r: Held, a: Answer): E {
    if ("ok" in a) {
      this.ledger(r, a.ok);
      return Effect.succeed(a.ok);
    }
    if ("fail" in a) {
      const { tag, ...rest } = a.fail;
      r.refused = true;
      return Effect.fail({ _tag: tag, ...rest });
    }
    if ("lost" in a) {
      r.lostOpen = true;
      return Effect.fail({ _tag: "NoResponse" });
    }
    if ("lostButLanded" in a) {
      r.landedUnseen = true;
      this.ledger(r, a.lostButLanded);
      return Effect.fail({ _tag: "NoResponse" });
    }
    if ("die" in a) return Effect.die(a.die);
    if ("interrupted" in a) return Effect.interrupt;
    // D145, assumptions #3: Stripe refuses a send of a key while an earlier one is executing (409), saves nothing, and may still land the first.
    if ("inFlight" in a) {
      const earlier = this.requests.some((x) => x !== r && x.idempotencyKey === r.idempotencyKey && x.idempotencyKey !== undefined && !x.answered && !x.never);
      if (!earlier) throw new Error("inFlight: no earlier send of this key is still open");
      r.refused = true;
      return Effect.fail({ _tag: "Conflict", status: 409 });
    }
    // D145, assumptions #4: it lands, answers a failure, and that failure is what every retry of the key hears (Stripe saves a 500 too).
    if ("applyFail" in a) {
      this.landOnServer(r);
      const fail = { _tag: a.applyFail.tag, status: a.applyFail.status ?? 500 };
      if (r.idempotencyKey !== undefined) this.landed.set(r.idempotencyKey, { fail });
      r.landedUnseen = true;
      return Effect.fail(fail);
    }
    if ("apply" in a || "applyLost" in a) {
      const out = this.landOnServer(r);
      if ("applyLost" in a) {
        r.landedUnseen = true;
        return Effect.fail({ _tag: "NoResponse" });
      }
      if (out.fail) return Effect.fail(out.fail);
      return Effect.succeed(out.value);
    }
    if ("truth" in a) {
      const v = this.server?.read?.(r.op, r.input, this.serverState, this.truth());
      return Effect.succeed(v);
    }
    if ("atStart" in a) {
      // Review H6: a read of a real server's snapshot, older than its landing whenever anything happened in between.
      const v = this.server?.read?.(r.op, r.input, r.startState, this.truth());
      return Effect.succeed(v);
    }
    throw new Error("settle: not an answer");
  }
  private oldest(op: string, where?: Readonly<Record<string, unknown>>) {
    return this.requests.find(
      (r) =>
        r.op === op &&
        !r.answered &&
        !r.never &&
        !r.aborted &&
        r.process === this.process &&
        matches(r.input, where),
    );
  }
  hasOpen(op: string) {
    return this.oldest(op) !== undefined;
  }
  answer(op: string, a: Answer, where?: Readonly<Record<string, unknown>>) {
    const r = this.oldest(op, where);
    if (!r) throw new NoHeldRequest(`answer: no held request for ${op}`);
    if ("never" in a) {
      r.never = true;
      return;
    }
    r.answered = true;
    const e = this.settle(r, a);
    r.resume?.(e);
    r.resume = undefined;
  }
  // The server's answer finally arrives. If the fiber is gone, or the process, only the truth changes.
  lateAnswer(op: string, a: Answer) {
    const r = this.requests.find((x) => x.op === op && !x.answered && !x.aborted);
    if (!r) throw new NoHeldRequest(`lateAnswer: no open request for ${op}`);
    r.answered = true;
    const e = this.settle(r, a);
    r.resume?.(e);
    r.resume = undefined;
  }
  // A request whose answer was lost reaches the server after all. Nobody hears it.
  landLate(op: string) {
    const r = this.requests.find((x) => x.op === op && x.lostOpen);
    if (!r) throw new NoHeldRequest(`landLate: no lost request for ${op}`);
    r.lostOpen = false;
    this.landOnServer(r);
  }
  canLandLate(op: string) {
    return this.requests.some((x) => x.op === op && x.lostOpen);
  }
  truth(): World0 {
    return {
      charges: this.charged.size,
      chargedKeys: [...this.charged],
      acked: [...this.acked],
      placed: this.placedKeys.size,
      voided: this.voidedKeys.size,
      ledger: {
        charged: [...this.chargedIntents],
        voided: [...this.voidedIntents],
        placed: [...this.placedIntents],
        auths: this.auths.map((a) => ({ ...a })),
        orders: [...this.orders],
      },
      server: this.serverState,
    };
  }
  publicRequests(): readonly Request[] {
    return this.requests.map(({ op, input, at, answered, idempotencyKey }) => ({
      op,
      input,
      at,
      answered,
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    }));
  }
  // Undecided at the server: never answered (from any process), or its answer was lost. An oracle reads this, not an ending.
  mayHave(): string[] {
    const open = (r: Held) => !r.answered || r.lostOpen === true || r.landedUnseen === true;
    // A refused send of a key that was also sent before stays undecided through `decided` above.
    const keyed = this.requests.filter((r) => r.idempotencyKey !== undefined);
    // One key, one write at the server: a success from any send decides it, whatever an older send still shows. A refusal does not.
    const decided = new Set(
      keyed.filter((r) => !open(r) && !r.refused).map((r) => r.idempotencyKey!),
    );
    return [...new Set(keyed.filter(open).map((r) => r.idempotencyKey!))].filter(
      (k) => !decided.has(k),
    );
  }
  outside(): Omit<Outside, "live" | "injections"> {
    return {
      open: this.requests
        .filter((r) => !r.answered && !r.aborted && r.process === this.process)
        .map((r) => ({
          op: r.op,
          never: r.never === true,
          input: r.input,
          ...(r.idempotencyKey === undefined ? {} : { key: r.idempotencyKey }),
        })),
      mayHave: this.mayHave(),
      storage: [
        ...this.lateReports.map((r) => ({ purpose: "late", keys: r.writes.map((w) => w.key), hung: false })),
        ...this.held.map((h) => ({
        purpose: h.purpose,
        keys: h.writes.map((w) => w.key),
        hung: h.hung === true,
      })),
      ],
      timers: this.timers.filter((t) => t.process === this.process).map((t) => t.claim),
      lost: this.requests.filter((r) => r.lostOpen).length,
      feeds: this.conns
        .filter((c) => c.process === this.process)
        .map((c) => ({
          op: c.op,
          input: c.input,
          from: c.from,
          open: c.open,
          closing: c.closing === true,
          pulled: c.pulled,
          backlog: c.backlog.length,
          ...(c.closingAt === undefined ? {} : { closingAt: c.closingAt }),
          ...(c.lastEventIdHeader === undefined ? {} : { lastEventIdHeader: c.lastEventIdHeader }),
          sent: [...(c.sent ?? [])],
          heldAtOpen: c.heldAtOpen,
        })),
      scheduler: { picks: this.scheduler.picks, choices: this.scheduler.choices },
      failing: this.lateReports.length + this.laterFailing,
      batches: this.batches,
    };
  }
  // Everything that decides this world's future, as text. Ids and times are normalised by the runtime's stateText.
  stateText(): string {
    return JSON.stringify({
      clockOffset: this.clockOffset, // D141, bugs M3: `clockBack` is an action, and a set-back clock has another future
      open: this.requests
        .filter((r) => !r.answered && r.process === this.process)
        .map((r) => [r.op, r.idempotencyKey, r.input, r.never === true, r.aborted === true]),
      lost: this.requests.filter((r) => r.lostOpen).map((r) => [r.op, r.idempotencyKey, r.input]),
      mayHave: this.mayHave().sort(),
      auths: this.auths,
      orders: this.orders,
      landed: [...this.landed.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
      charged: [...this.charged].sort(),
      acked: [...this.acked].sort(),
      ledger: this.truth().ledger,
      server: this.serverState,
      conns: this.conns
        .filter((c) => c.process === this.process)
        .map((c) => [c.op, c.input, c.from, c.open, c.closing === true, c.backlog.length]),
      closeMs: this.closeMs,
      fails: [this.plainFails, this.plainFailsLate, this.plainFailsHeld, this.lateReports.length],
      hidden: this.hidden,
      frozen: this.freezeTimers,
      holdPlain: this.holdPlain,
      slowAfterAck: this.slowAfterAck,
      kv: [...this.kv.entries()].filter(([k]) => k !== "meta").sort(([a], [b]) => (a < b ? -1 : 1)),
      held: this.held.map((h) => [h.writes, h.purpose, h.hung === true]),
    });
  }

  // ── Settling and time
  // A microtask runs before any task, and the page has nothing until the queue is empty. So a chain of them with no task between is a frozen page, and the suite can say so (oracle k).
  markCall() {
    this.spentFrom = this.spent;
  }
  spentInCall() {
    return this.spent - this.spentFrom;
  }
  private spend() {
    if (++this.spent - this.spentFrom > this.spendLimit) throw new Error(`harness: did not quiesce in ${this.spendLimit} work units in one call`);
  }
  settleStep() {
    this.spend();
    if (this.micro.length) {
      if (++this.sinceTask > FROZEN_AFTER) throw new Error(`(k) the page froze: ${FROZEN_AFTER} answers with no task between`);
      this.micro.shift()!();
    } else if (this.scheduler.q.length) this.scheduler.next()();
    else if (this.laters.length) {
      this.sinceTask = 0;
      this.tasks++;
      this.laters.shift()!();
    }
  }
  hasLaters() {
    return this.laters.length > 0;
  }
  hasWork() {
    return this.micro.length > 0 || this.scheduler.q.length > 0 || this.laters.length > 0;
  }
  advanceWith(ms: number, settle: () => void) {
    const end = this.now + ms;
    for (;;) {
      settle();
      if (this.freezeTimers) break; // a frozen tab: nothing fires until thaw
      const due = this.timers
        .filter((t) => t.at <= end)
        .sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (!due) break;
      this.spend();
      this.timers = this.timers.filter((t) => t !== due);
      this.now = Math.max(this.now, due.at);
      due.f();
    }
    this.now = end;
    settle();
  }
}
export class NoHeldRequest extends Error {}
