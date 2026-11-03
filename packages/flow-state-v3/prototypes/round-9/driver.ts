// The one impure file. pump is the only loop; it owns the world variable, the inbox and the fibers. Shape B (D6): runFork +
// addObserver + a set the Runtime owns. One obligation: at least one `sent` per invoke. A core throw is fatal (D46).
// Prior art, read: drain then defer, codebases/xstate/packages/core/src/createActor.ts:280-299; runFork starts now,
// node_modules/effect/src/internal/effect.ts:5680-5690.
import { Cause, Effect, Exit, type Fiber } from "effect";
import { OutcomeFailure, OutcomeUnknown, type Compiled, type Op, type Slot } from "../conformance/fixtures/compiled.ts";

type CommitFn = Extract<Op["commit"], (...a: never[]) => unknown>;
import type { Host } from "../conformance/fake-world.ts";
import { encodeRecord } from "./record.ts";
import { makeEdge } from "./edge.ts";
import { sealAll } from "./gate.ts";
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
  const sealed: Machines = sealedList;
  const machines = cfg.around ? cfg.around(sealed) : sealed;
  const bounds = { ...defaultBounds, ...cfg.bounds };
  const sys: System = { machines, modules, bounds };
  let world: World = emptyWorld;
  let running = false;
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
  // ── The edge: edge.ts. The only place a record becomes bytes. A batch goes after the drain (convergence-7, section 8, question 5), so one drain is one cut.
  let afterDrain: Array<() => void> = [];
  // D122: a cut waits for the end of a turn and its follow-ups, which are bounded, and for no more. A loop of turns that never ends the drain cannot starve the disk.
  const runAfterDrain = () => {
    if (!fatal && world.follow.length > 0) return void host.later(runAfterDrain);
    const due = afterDrain;
    afterDrain = [];
    for (const f of due) f();
  };
  const edge = makeEdge(
    {
      now: () => host.now(),
      later: (f) => {
        if (afterDrain.length === 0) host.later(runAfterDrain);
        afterDrain.push(f);
      },
      setTimer: (at, f) => host.setTimer(at, f),
      isHidden: () => host.isHidden?.() ?? false,
      storage: host.storage,
    },
    {
      captureMs: bounds.captureMs,
      storageMs: bounds.storageMs,
      retryMaxMs: bounds.retryMaxMs,
      encode: (record) => encodeRecord(machines, record),
      stored: (t, ok) => input({ k: "stored", attempt: t.attempt, ticket: t.ticket, ok }),
      report: (i) => guarded(() => cfg.onIssue([i])),
    },
  );
  host.onHidden?.(() => edge.hide());
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
      case "persist":
        return edge.accept(c);
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
  // D98: one place, so every loop agrees. A fatal's world still holds the mail it died on, and that mail is nobody's work now.
  const work = () =>
    !fatal &&
    (inbox.length > 0 ||
      world.follow.length > 0 ||
      (world.mail.length > 0 && world.status === "live"));
  // At the disposal bound, a module's fiber still alive is evidence (D6, M7).
  const watchDisposal = () =>
    void host.setTimer(host.now() + bounds.disposeMs, () => {
      const left = [...fibers.keys()].filter((k) => k.startsWith("module/"));
      guarded(() => cfg.onEvidence(left.map((k) => ({ kind: "AbandonedFiber", op: k }))));
    });
  // D122: one rule. A slice of work, however it arrived, then a task for the page. `spent` counts only work, and only a yield refills it, so an answer arriving in a microtask, which no task separates from the last, is on the same bill: it gets its one step, and what that step asks for waits for the task.
  const clock = () => host.workClock?.() ?? performance.now();
  let spent = 0;
  let yielding = false;
  const yieldToPage = () => {
    if (yielding) return;
    yielding = true;
    host.later(() => {
      yielding = false;
      spent = 0;
      pump();
    });
  };
  const pump = () => {
    if (running || fatal) return;
    running = true;
    let mark = clock();
    try {
      while (work()) {
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
          edge.hide(); // L3
          watchDisposal();
        }
        const t = clock();
        spent += t - mark;
        mark = t;
        if (spent > bounds.drainMs && work()) {
          yieldToPage();
          break;
        }
      }
    } finally {
      running = false;
    }
    notify();
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
  const boot = (records: ReadonlyMap<string, string>, persistence: boolean) => {
    booted = true;
    realInput({ k: "boot", records: [...records], persistence });
    for (const i of waitingBoot.splice(0)) realInput(i);
  };
  const outer = (i: Input) => {
    if (booted) return realInput(i);
    if (waitingBoot.length < bounds.bootQueue) return void waitingBoot.push(i);
    guarded(() => cfg.onEvidence([{ kind: "dropped", input: i.k }]));
  };
  const loaded = cfg.persistence === false ? new Map<string, string>() : host.storage.load();
  if (loaded instanceof Map) boot(loaded, cfg.persistence !== false);
  else {
    let settled = false;
    const noRead = (why: unknown) => {
      if (settled) return;
      settled = true;
      offBound();
      guarded(() => cfg.onIssue([{ code: "StorageFailure", input: String(why) }]));
      boot(new Map(), false); // D26: a persisted machine then declines its commits: NoPersistence
    };
    const offBound = host.setTimer(host.now() + bounds.bootMs, () =>
      noRead(`no answer from storage in ${bounds.bootMs} ms`),
    );
    void (loaded as PromiseLike<ReadonlyMap<string, string>>).then((records) => {
      if (settled) return;
      settled = true;
      offBound();
      boot(records, true);
    }, noRead);
  }
  return {
    input: outer,
    flushNow: () => edge.hide(),
    booted: () => booted,
    // For the suite's hash: what the driver holds decides the future too.
    edgeText: () => `${edge.text()}${JSON.stringify([booted, waitingBoot.length])}`,
    sealed,
    world: () => world,
    pending: () => work() || (!fatal && running),
    live: () => fibers.size,
    fatal: () => fatal,
    subscribe: (l: () => void) => void listeners.add(l),
    sys,
  };
};
export type Runtime = ReturnType<typeof createRuntime>;
export type { Compiled };
