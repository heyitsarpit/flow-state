// The one impure file. pump is the only loop; it owns the world variable, the inbox and the fibers. Shape B (D6): runFork +
// addObserver + a set the Runtime owns. One obligation: at least one `sent` per invoke. A core throw is fatal (D46).
// Prior art, read: drain then defer, codebases/xstate/packages/core/src/createActor.ts:280-299; runFork starts now,
// node_modules/effect/src/internal/effect.ts:5680-5690.
import { Cause, Effect, Exit, type Fiber } from "effect";
import { OutcomeFailure, OutcomeUnknown, type Compiled, type Op, type Slot } from "../conformance/fixtures/compiled.ts";

type CommitFn = Extract<Op["commit"], (...a: never[]) => unknown>;
import type { Host } from "../conformance/fake-world.ts";
import { sealAll, text } from "./gate.ts";
import type { Module } from "./seam.ts";
import { step } from "./step.ts";
import {
  defaultBounds,
  emptyWorld,
  type Bounds,
  type Command,
  type Env,
  type Evidence,
  type Input,
  type Issue,
  type Machines,
  type System,
  type Write,
  type SendExit,
  type StepOut,
  type World,
} from "./world.ts";

// A pure reading of Exit and the whole Cause (2.7.1): a failure followed by a dying finalizer is unknown.
export const readExit = (exit: Exit.Exit<unknown, unknown>): SendExit => {
  if (Exit.isSuccess(exit)) return { t: "ok", value: exit.value };
  const cause = exit.cause;
  if (Cause.hasDies(cause)) return { t: "defect", cause };
  const failed = Cause.findErrorOption(cause);
  if (failed._tag === "Some") {
    const e = failed.value;
    if (e instanceof OutcomeUnknown) return { t: "unknown", reason: e.reason };
    if (e instanceof OutcomeFailure) return { t: "failure", reason: e.reason };
    return { t: "failure", reason: e };
  }
  return { t: "interrupted", cause };
};

export type StepRecord = {
  readonly input: Input;
  readonly now: number;
  readonly ids: readonly string[];
  readonly out: StepOut | "fatal";
};
export const createRuntime = (cfg: {
  host: Host;
  machines: Machines | readonly Compiled[]; // D77: sealed here. A new host cannot forget
  around?: (sealed: Machines) => Machines; // a test build's own read of the sealed table
  persistence?: boolean; // false: O7's second tab, or a refused store. Machines run unpersisted, and nothing is read or written
  modules: readonly Module<any>[];
  bounds?: Partial<Bounds>;
  onStep?: (r: StepRecord) => void;
  onEvidence: (e: readonly Evidence[]) => void;
  onIssue: (i: readonly Issue[]) => void;
}) => {
  const { host, modules } = cfg;
  const sealedList = sealAll(
    Array.isArray(cfg.machines)
      ? (cfg.machines as readonly Compiled[])
      : Object.values(cfg.machines as Machines),
  );
  const unpersist = (t: Machines): Machines =>
    Object.fromEntries(Object.entries(t).map(([k, m]) => [k, { ...m, persisted: false }]));
  const sealed: Machines = cfg.persistence === false ? unpersist(sealedList) : sealedList;
  const machines = cfg.around ? cfg.around(sealed) : sealed;
  const bounds = { ...defaultBounds, ...cfg.bounds };
  const sys: System = { machines, modules, bounds };
  let world: World = emptyWorld;
  let running = false;
  let yielded = false;
  let fatal = false;
  let notifying = false;
  let chain = 0;
  let stormed = false;
  const inbox: Input[] = [];
  const fibers = new Map<string, Fiber.Fiber<unknown, unknown>>();
  const hostTimers = new Map<string, () => void>();
  const credits = new Map<string, number>();
  const waiting = new Map<string, () => void>();
  const listeners = new Set<() => void>();
  const guarded = (f: () => void) => {
    try {
      f();
    } catch (e) {
      try {
        cfg.onIssue([{ code: "SinkFailed", input: String(e) }]);
      } catch {
        /* nothing left to tell */
      }
    }
  };
  const fork = (
    key: string,
    effect: Effect.Effect<unknown, unknown>,
    done: (x: SendExit) => void,
  ) => {
    const fiber = Effect.runFork(effect, { scheduler: host.scheduler });
    fibers.set(key, fiber);
    fiber.addObserver((exit) => {
      fibers.delete(key);
      credits.delete(key); // L6
      waiting.delete(key);
      done(readExit(exit));
    });
  };
  // ── D80, D83: the only place a record becomes bytes. Newest per key; one batch. A failed batch stays dirty only where it is still the newest word.
  // The store's contract: a batch is atomic, batches commit in issue order, and an answer may come any time later. So: **per key, a later write
  // wins, whatever order the answers come in.** `issued` is the only thing that makes that true here. D84: a batch touching a lane does not wait.
  const dirty = new Map<string, Write>();
  const issued = new Map<string, number>();
  let issueN = 0;
  const stamp = (writes: readonly { key: string }[]) => {
    const n = ++issueN;
    for (const w of writes) issued.set(w.key, n);
    return n;
  };
  let dirtyPurpose: Write extends never ? never : Parameters<Host["storage"]["write"]>[1] = "flush";
  let captureOff: (() => void) | undefined;
  let retryN = 0;
  let reportedFailure = false;
  let reportedEncoding = false;
  let flushWanted = false;
  // D89: all or nothing. A bad record keeps the whole batch back, in `dirty`, so a lane's removal can't land without what it goes with: O5's last good capture.
  const encodeAll = (writes: readonly Write[]) => {
    const out: Array<{ key: string; value: string | undefined }> = [];
    for (const w of writes) {
      if (w.record === undefined) {
        out.push({ key: w.key, value: w.value });
        continue;
      }
      const value = text(w.record);
      if (value === undefined) {
        if (!reportedEncoding)
          guarded(() =>
            cfg.onIssue([{ code: "UnencodableValue", origin: `actor ${w.key.slice(6)}` }]),
          );
        reportedEncoding = true;
        return undefined;
      }
      out.push({ key: w.key, value });
    }
    reportedEncoding = false;
    return out;
  };
  const failedBatch = (batch: readonly Write[], n: number, why: string) => {
    if (!reportedFailure) {
      reportedFailure = true;
      guarded(() => cfg.onIssue([{ code: "StorageFailure", input: why }]));
    }
    for (const w of batch) if (issued.get(w.key) === n && !dirty.has(w.key)) dirty.set(w.key, w);
    if (dirty.size > 0) armCapture(Math.min(30_000, 1000 * 2 ** retryN++));
  };
  const landed = () => {
    retryN = 0;
    reportedFailure = false;
  };
  const flushCapture = () => {
    captureOff?.();
    captureOff = undefined;
    if (dirty.size === 0) return;
    // D95 (E2): per key, one plain write out at a time. A key whose last batch has not answered waits for that answer, so a later batch cannot land a record ahead of what an
    // earlier one might still fail to land.
    const out = new Set([...plainOut].flatMap((b) => b.keys));
    // All of it waits, not just those keys: splitting a batch would land a lane's removal without the actor that went with it.
    const batch = [...dirty.values()];
    flushWanted = batch.some((w) => out.has(w.key));
    if (flushWanted) return;
    const encoded = encodeAll(batch);
    if (!encoded) return;
    for (const w of batch) dirty.delete(w.key);
    if (encoded.length === 0) return;
    const n = stamp(batch);
    const sent = { keys: encoded.map((w) => w.key) };
    plainOut.add(sent);
    host.storage.write(
      encoded,
      dirtyPurpose,
      undefined,
      (why) => {
        failedBatch(batch, n, why);
        plainAnswered(sent);
      },
      () => {
        landed();
        plainAnswered(sent);
      },
    );
  };
  // D94: an awaited write never lands ahead of a batch before it. It waits for that batch's answer, and if the batch failed, what the batch still owes goes in its transaction.
  // So "the next lane's ack is on disk and the record it followed is not" cannot occur (E1). One commit's wait, and only behind a batch still out.
  // Per actor: another actor's stuck write holds nobody here (2.7.13's table; MED-01).
  const plainOut = new Set<{ keys: readonly string[] }>();
  const behind = (actor: string) =>
    [...plainOut].some((b) => b.keys.some((k) => k === `actor/${actor}` || k.startsWith(`lane/${actor}|`)));
  let waitingAwaited: Array<{ actor: string; go: () => void }> = [];
  const plainAnswered = (b: { keys: readonly string[] }) => {
    plainOut.delete(b);
    const ready = waitingAwaited.filter((w) => !behind(w.actor));
    waitingAwaited = waitingAwaited.filter((w) => behind(w.actor));
    for (const w of ready) w.go();
    if (flushWanted) flushCapture();
  };
  const issueAwaited = (c: Extract<Command, { k: "persist" }>, t: NonNullable<Extract<Command, { k: "persist" }>["ticket"]>) => {
    for (const w of c.writes) dirty.delete(w.key); // D83: a retry waiting here is older than this
    const owed = [...dirty.values()];
    const carried = owed.length ? encodeAll(owed) : [];
    if (carried?.length) {
      dirty.clear();
      captureOff?.();
      captureOff = undefined;
    }
    const taken = carried?.length ? owed : [];
    const n = stamp([...taken, ...c.writes]);
    host.storage.write([...(carried ?? []), ...(encodeAll(c.writes) ?? [])], c.purpose, (ok) => {
      if (!ok && taken.length) failedBatch(taken, n, "an awaited write refused");
      input({ k: "stored", attempt: t.attempt, ticket: t.ticket, ok });
    });
  };
  const armCapture = (ms: number) => {
    captureOff?.();
    captureOff = host.setTimer(host.now() + ms, () => {
      captureOff = undefined;
      flushCapture();
    });
  };
  const capture = (writes: readonly Write[], purpose: typeof dirtyPurpose) => {
    for (const w of writes) dirty.set(w.key, w);
    dirtyPurpose = purpose;
    // D84: a lane does not wait. D93: nor does a retired identity: "this actor sleeps" is not plain memory, and a kill must not wake it.
    const now = (w: Write) =>
      w.key.startsWith("lane/") || (w.record as { retired?: boolean } | undefined)?.retired === true;
    if (bounds.captureMs <= 0 || writes.some(now)) return flushCapture();
    if (!captureOff) armCapture(bounds.captureMs);
  };
  host.onHidden?.(() => flushCapture());
  const invoke = (c: Extract<Command, { k: "invoke" }>) => {
    try {
      const effect = (machines[c.machine]!.ops[c.op]!.commit as Slot<CommitFn>).run(c.input, { attempt: c.ctx });
      fork(`${c.attempt}#${c.send}`, effect, (exit) =>
        input({ k: "sent", attempt: c.attempt, send: c.send, exit }),
      );
    } catch (cause) {
      input({ k: "sent", attempt: c.attempt, send: c.send, exit: { t: "defect", cause } });
    }
  };
  const exec = (c: Command) => {
    switch (c.k) {
      case "invoke":
        return invoke(c);
      case "interrupt":
        return fibers.get(`${c.attempt}#${c.send}`)?.interruptUnsafe();
      case "arm": {
        hostTimers.get(c.timer)?.();
        hostTimers.set(
          c.timer,
          host.setTimer(c.at, () => {
            hostTimers.delete(c.timer);
            input({ k: "timer", timer: c.timer, gen: c.gen });
          }),
        );
        return;
      }
      case "disarm": {
        hostTimers.get(c.timer)?.();
        hostTimers.delete(c.timer);
        return;
      }
      case "persist": {
        const t = c.ticket;
        if (!t) return capture(c.writes, c.purpose);
        // O3, O6: an awaited write is never coalesced, and what waits goes first, so a lane cannot outrun its actor.
        flushCapture();
        if (behind(t.actor)) return void waitingAwaited.push({ actor: t.actor, go: () => issueAwaited(c, t) });
        return issueAwaited(c, t);
      }
      case "module": {
        const m = modules.find((x) => x.id === c.m);
        // M7: a module's fibers have a key, a stop and an owner. Disposal reports survivors.
        const named = (k: string) => `module/${c.m}/${k}`;
        m?.exec?.(c.cmd, {
          fork: (key, effect, done) =>
            fork(named(key), effect as Effect.Effect<unknown, unknown>, done),
          stop: (key) => fibers.get(named(key))?.interruptUnsafe(),
          input: (payload) => input({ k: "module", m: c.m, payload }),
          machine: (id) => machines[id]!,
          // D71: counted, so a go-ahead and the wait for it may come in either order. Interrupted with its fiber.
          credit: (key) =>
            Effect.callback<void>((resume) => {
              const k = named(key);
              const n = credits.get(k) ?? 0;
              if (n > 0) {
                credits.set(k, n - 1);
                resume(Effect.void);
                return;
              }
              waiting.set(k, () => resume(Effect.void));
            }),
          open: (key) => {
            const k = named(key);
            const w = waiting.get(k);
            if (w) {
              waiting.delete(k);
              w();
            } else credits.set(k, (credits.get(k) ?? 0) + 1);
          },
        });
      }
    }
  };
  const goFatal = (e: unknown) => {
    fatal = true;
    for (const f of fibers.values()) f.interruptUnsafe();
    for (const off of hostTimers.values()) off();
    hostTimers.clear();
    inbox.length = 0;
    guarded(() => cfg.onIssue([{ code: "Fatal", input: String(e) }]));
  };
  const work = () =>
    inbox.length > 0 ||
    world.follow.length > 0 ||
    (world.mail.length > 0 && world.status === "live");
  // At the disposal bound, a module's fiber still alive is evidence (D6, M7).
  const watchDisposal = () =>
    void host.setTimer(host.now() + bounds.disposeMs, () => {
      const left = [...fibers.keys()].filter((k) => k.startsWith("module/"));
      guarded(() => cfg.onEvidence(left.map((k) => ({ kind: "AbandonedFiber", op: k }))));
    });
  const pump = () => {
    if (running || fatal) return;
    running = true;
    yielded = false;
    const t0 = performance.now();
    try {
      while (!fatal && work()) {
        const i: Input = inbox.shift() ?? { k: "turn" };
        const ids: string[] = [];
        const env: Env = {
          now: host.now(),
          id: () => {
            const id = host.id();
            ids.push(id);
            return id;
          },
        };
        let out: StepOut;
        try {
          out = step(world, i, env, sys);
        } catch (e) {
          guarded(() => cfg.onStep?.({ input: i, now: env.now, ids, out: "fatal" }));
          goFatal(e);
          break;
        }
        world = out.world;
        // D6: each command isolated, and before any sink, so a throw in either never loses a command.
        for (const c of out.commands) {
          try {
            exec(c);
          } catch (e) {
            guarded(() => cfg.onIssue([{ code: "CommandFailed", origin: c.k, input: String(e) }]));
          }
        }
        guarded(() => cfg.onStep?.({ input: i, now: env.now, ids, out }));
        guarded(() => cfg.onEvidence(out.evidence));
        if (out.issues.length) guarded(() => cfg.onIssue(out.issues));
        if (i.k === "disposeRuntime") {
          flushCapture(); // L3
          watchDisposal();
        }
        if (performance.now() - t0 > bounds.drainMs && work()) {
          yielded = true;
          host.later(pump);
          break;
        }
      }
    } finally {
      running = false;
    }
    if (!yielded) notify();
  };
  const notify = () => {
    notifying = true;
    for (const l of listeners) guarded(l);
    notifying = false;
    if (inbox.length) {
      chain++;
      pump();
    }
  };
  function input(i: Input) {
    if (fatal) return guarded(() => cfg.onEvidence([{ kind: "dropped", input: i.k }]));
    if (notifying) {
      // L2: past the bound only what a listener originates drops. A completion, a timer, an ack never do.
      if (chain >= bounds.notifyChain && (i.k === "send" || i.k === "ensure")) {
        if (!stormed) guarded(() => cfg.onIssue([{ code: "TurnStorm", input: i.k }]));
        stormed = true;
        return guarded(() => cfg.onEvidence([{ kind: "dropped", input: i.k }]));
      }
      inbox.push(i);
      return;
    }
    if (!running) {
      chain = 0;
      stormed = false;
    }
    inbox.push(i);
    pump();
  }
  // O4, D87: `load` takes time. What arrives before it waits, in order, boot first, up to a bound. A read that fails or never answers is O5's
  // `StorageFailure`: run without persistence, so unread data is never overwritten. An answer after that is ignored.
  let booted = false;
  const waitingBoot: Input[] = [];
  const realInput = input;
  const boot = (records: ReadonlyMap<string, string>) => {
    booted = true;
    realInput({ k: "boot", records: [...records] });
    for (const i of waitingBoot.splice(0)) realInput(i);
  };
  const outer = (i: Input) => {
    if (booted) return realInput(i);
    if (waitingBoot.length < bounds.bootQueue) return void waitingBoot.push(i);
    guarded(() => cfg.onEvidence([{ kind: "dropped", input: i.k }]));
  };
  const loaded = cfg.persistence === false ? new Map<string, string>() : host.storage.load();
  if (loaded instanceof Map) boot(loaded);
  else {
    let settled = false;
    const noRead = (why: unknown) => {
      if (settled) return;
      settled = true;
      offBound();
      guarded(() => cfg.onIssue([{ code: "StorageFailure", input: String(why) }]));
      sys.machines = unpersist(sys.machines);
      boot(new Map());
    };
    const offBound = host.setTimer(host.now() + bounds.bootMs, () =>
      noRead(`no answer from storage in ${bounds.bootMs} ms`),
    );
    void (loaded as PromiseLike<ReadonlyMap<string, string>>).then((records) => {
      if (settled) return;
      settled = true;
      offBound();
      boot(records);
    }, noRead);
  }
  return {
    input: outer,
    flushNow: flushCapture,
    booted: () => booted,
    // For the suite's hash: what the driver holds decides the future too.
    edgeText: () => JSON.stringify([[...dirty.keys()].sort(), booted, waitingBoot.length, retryN, plainOut.size, waitingAwaited.length]),
    sealed,
    world: () => world,
    pending: () => !fatal && (work() || running),
    live: () => fibers.size,
    fatal: () => fatal,
    subscribe: (l: () => void) => void listeners.add(l),
    sys,
  };
};
export type Runtime = ReturnType<typeof createRuntime>;
export type { Compiled };
