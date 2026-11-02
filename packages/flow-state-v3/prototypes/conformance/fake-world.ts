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
  later(f: () => void): void;
  scheduler: Scheduler.Scheduler;
  storage: {
    load(): ReadonlyMap<string, string>;
    // `then` makes the write awaited: the fake holds it until a `storage` step. Others land at once. `failed`: a plain write that
    // did not land (review M7). A real store says so; silence is not landing. The batch is atomic: this is the contract D80 relies on.
    write(
      writes: readonly Write[],
      purpose: Purpose,
      then?: (ok: boolean) => void,
      failed?: (why: string) => void,
    ): void;
  };
};
export type ServerModel = {
  init(): any;
  // Applies a write. A `fail` is a definite refusal; nothing changed.
  apply?(op: string, input: any, s: any): { s: any; value?: unknown; fail?: any };
  read?(op: string, input: any, s: any, t: World0): unknown;
};
type E = Effect.Effect<unknown, any>;
export type Api = {
  call(op: string, input: unknown, o?: { idempotencyKey?: string }): E;
  track(op: string, key: string, body: E): E; // a request whose body is the fixture's own effect
  confirm(i: unknown, o: { idempotencyKey: string }): E;
  placeOrder(i: unknown, o: { idempotencyKey: string }): E;
  voidAuthorization(i: unknown, o: { idempotencyKey: string }): E;
  intent(i: unknown): E;
  orderFor(i: unknown): E;
  socket(op: string, input: unknown, from: unknown): unknown; // Stream of what the server pushes, until a `feed` step ends it
  pulled(op: string, input: unknown, from: unknown): unknown; // hands over one backlog item per pull (T4)
  feed(op: string, input: unknown, from: unknown, bound?: number): unknown; // T6: a `Feed.callback`. The queue is the runtime's
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
};
const capturable = (v: any) => v?.status === "requires_capture" || v?.status === "succeeded";
const matches = (input: any, where?: Readonly<Record<string, unknown>>) =>
  !where || Object.entries(where).every(([k, v]) => input?.[k] === v);

export class FakeWorld {
  now = 0;
  process = 0;
  private idSeq = 0;
  private timers: Array<{ at: number; seq: number; f: () => void; process: number }> = [];
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
  readonly auths: Array<{ key: string; intent: string; voided: boolean; placed: boolean }> = [];
  readonly orders: string[] = [];
  serverState: any;
  uninterruptible = new Set<string>();
  syncAnswers = new Map<string, Answer>();
  yields = 0;

  readonly kv = new Map<string, string>();
  plainFails = 0; // review M7: the next n plain writes fail, and say so
  private lastBatch: Array<{ key: string; before: string | undefined }> = [];
  private held: Array<{
    writes: readonly Write[];
    purpose: Purpose;
    then?: ((ok: boolean) => void) | undefined;
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
    this.held = []; // an unconfirmed write dies with its process. `landNoAck` is how a landed one is modelled.
    for (const r of this.requests) r.resume = undefined;
  }

  // ── Host
  host(): Host {
    const process = this.process;
    return {
      now: () => this.now,
      id: () => `att-${this.seed}-${++this.idSeq}`,
      setTimer: (at, f) => {
        const t = { at, seq: ++this.timerSeq, f, process };
        this.timers.push(t);
        return () => {
          this.timers = this.timers.filter((x) => x !== t);
        };
      },
      later: (f) => void this.laters.push(f),
      scheduler: this.scheduler,
      storage: {
        // M9: a store has no order. Shuffled per seed and process, for good, so rule 44's order is the runtime's own.
        load: () => {
          const out = [...this.kv];
          let x = (this.seed * 2654435761 + this.process * 40503 + 1) >>> 0;
          for (let i = out.length - 1; i > 0; i--) {
            x = (Math.imul(x, 48271) >>> 0) % 2147483647;
            const j = x % (i + 1);
            [out[i], out[j]] = [out[j]!, out[i]!];
          }
          return new Map(out);
        },
        write: (writes, purpose, then, failed) => {
          const blocked = writes.some((w) =>
            this.held.some((h) => h.writes.some((x) => x.key === w.key)),
          );
          if (then === undefined && !blocked && this.plainFails > 0) {
            this.plainFails--;
            failed?.("a plain write failed");
            return;
          }
          if (then !== undefined || blocked) this.held.push({ writes, purpose, then });
          else this.landWrites(writes);
        },
      },
    };
  }
  corrupt(match: string, edit: (raw: string) => string) {
    for (const [k, v] of this.kv) if (k.includes(match)) this.kv.set(k, edit(v));
  }
  // Review M7: a store with no atomic batch. Only the first `keep` writes of the last batch really landed. Real IndexedDB cannot do this.
  tearLast(keep: number) {
    for (const { key, before } of this.lastBatch.slice(keep)) {
      if (before === undefined) this.kv.delete(key);
      else this.kv.set(key, before);
    }
    this.lastBatch = [];
  }
  private landWrites(writes: readonly Write[]) {
    this.lastBatch = writes.map((w) => ({ key: w.key, before: this.kv.get(w.key) }));
    for (const w of writes) {
      if (w.value === undefined) this.kv.delete(w.key);
      else this.kv.set(w.key, w.value);
    }
  }

  storageStep(how: "ack" | "refuse" | "hang" | "landNoAck", match?: string) {
    // L8: per key FIFO. A write behind a hung one for its key cannot be answered.
    const behindHung = (h: (typeof this.held)[number]) =>
      this.held
        .slice(0, this.held.indexOf(h))
        .some((o) => o.hung && o.writes.some((x) => h.writes.some((w) => w.key === x.key)));
    const eligible = (h: (typeof this.held)[number]) =>
      !h.hung &&
      h.then !== undefined &&
      !behindHung(h) &&
      (match === undefined || h.purpose === match || h.writes.some((w) => w.key.includes(match)));
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
        }
        h.then?.(how === "ack");
      }
    }
    this.flushUnblocked();
  }
  private noteAck(writes: readonly Write[]) {
    for (const w of writes) if (w.value !== undefined) this.acked.add(w.value); // opaque: the oracle looks for the id in it
  }
  // Writes queued behind a settled one, in order, per key (a KeyValueStore's FIFO). A hung write keeps blocking its key.
  private flushUnblocked() {
    for (let i = 0; i < this.held.length; i++) {
      const h = this.held[i]!;
      if (h.then !== undefined) continue;
      const blocked = this.held
        .slice(0, i)
        .some((o) => o.writes.some((x) => h.writes.some((w) => w.key === x.key)));
      if (!blocked) {
        this.held.splice(i--, 1);
        this.landWrites(h.writes);
      }
    }
  }
  // What a `storage` step could answer now: the search asks this rather than guessing (L8).
  answerable() {
    return this.held.some(
      (h) =>
        h.then !== undefined &&
        !h.hung &&
        !this.held
          .slice(0, this.held.indexOf(h))
          .some((o) => o.hung && o.writes.some((x) => h.writes.some((w) => w.key === x.key))),
    );
  }

  // ── Fake server
  readonly api: Api = {
    call: (op, input, o) => this.call(op, input, o?.idempotencyKey),
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
  };
  readonly conns: Conn[] = [];
  closeMs = 20; // review H7: a real close takes time. `Infinity` never finishes (`ReleaseOverdue`)
  private newConn(op: string, input: unknown, from: unknown): Conn {
    const c: Conn = {
      op,
      input,
      from,
      process: this.process,
      open: true,
      pulled: 0,
      backlog: [],
    };
    this.conns.push(c);
    return c;
  }
  // A server's end needs no handshake. Ours does.
  private closeConn(c: Conn): Effect.Effect<void> {
    if (!c.open) return Effect.void;
    c.closing = true;
    const ms = this.closeMs;
    return Effect.callback<void>((resume) => {
      if (ms === Infinity) return;
      const process = c.process;
      this.timers.push({
        at: this.now + ms,
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
    s: { frame?: unknown; frames?: readonly unknown[]; end?: true; fail?: unknown },
  ) {
    const c = this.conns.findLast(
      (x) => x.op === op && x.open && !x.closing && x.process === this.process,
    );
    if (!c) throw new NoHeldRequest(`feed: no open connection for ${op}`);
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
  private call(op: string, input: unknown, key?: string): E {
    const isRead = key === undefined;
    const r: Held = {
      op,
      input,
      at: this.now,
      answered: false,
      process: this.process,
      ...(key === undefined ? {} : { idempotencyKey: key }),
    };
    const sync = this.syncAnswers.get(op);
    let body: E = Effect.suspend(() => {
      r.startState = this.serverState;
      this.requests.push(r);
      if (sync) {
        r.answered = true;
        return this.settle(r, sync);
      }
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
  // Applied once per key, whoever sends it and however many times.
  private landOnServer(r: Held): { value?: unknown; fail?: any } {
    const key = r.idempotencyKey;
    const prior = key === undefined ? undefined : this.landed.get(key);
    if (prior) return prior;
    const out = this.server?.apply?.(r.op, r.input, this.serverState) ?? { s: this.serverState };
    this.serverState = out.s;
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
      storage: this.held.map((h) => ({
        purpose: h.purpose,
        keys: h.writes.map((w) => w.key),
        hung: h.hung === true,
      })),
      timers: this.timers.filter((t) => t.process === this.process).map((t) => t.at),
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
        })),
      scheduler: { picks: this.scheduler.picks, choices: this.scheduler.choices },
    };
  }
  // Everything that decides this world's future, as text. Ids and times are normalised by the runtime's stateText.
  stateText(): string {
    return JSON.stringify({
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
      kv: [...this.kv.entries()].filter(([k]) => k !== "meta").sort(([a], [b]) => (a < b ? -1 : 1)),
      held: this.held.map((h) => [h.writes, h.purpose, h.hung === true, h.then !== undefined]),
    });
  }

  // ── Settling and time
  settleStep() {
    if (this.scheduler.q.length) this.scheduler.next()();
    else if (this.laters.length) this.laters.shift()!();
  }
  hasLaters() {
    return this.laters.length > 0;
  }
  hasWork() {
    return this.scheduler.q.length > 0 || this.laters.length > 0;
  }
  advanceWith(ms: number, settle: () => void) {
    const end = this.now + ms;
    for (;;) {
      settle();
      const due = this.timers
        .filter((t) => t.at <= end)
        .sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (!due) break;
      this.timers = this.timers.filter((t) => t !== due);
      this.now = Math.max(this.now, due.at);
      due.f();
    }
    this.now = end;
    settle();
  }
}
export class NoHeldRequest extends Error {}
