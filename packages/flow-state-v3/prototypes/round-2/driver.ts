// The one impure file. pump is the only loop; it owns the world variable, the inbox and the fibers. It retains nothing else:
// log and frames go to sinks (D35). Shape B (D6): runFork + addObserver + a set the Runtime owns. One obligation: at least
// one `sent` per invoke. A core throw is fatal (D27).
// Prior art, read: drain then defer, codebases/xstate/packages/core/src/createActor.ts:280-299; runFork starts now,
// node_modules/effect/src/internal/effect.ts:5680-5690.
import { Cause, Effect, Exit, type Fiber } from "effect";
import { OutcomeFailure, OutcomeUnknown, type Compiled } from "../conformance/fixtures/compiled.ts";
import type { Host } from "../conformance/fake-world.ts";
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
  machines: Machines;
  modules: readonly Module<any>[];
  bounds?: Partial<Bounds>;
  onStep?: (r: StepRecord) => void;
  onEvidence: (e: readonly Evidence[]) => void;
  onIssue: (i: readonly Issue[]) => void;
}) => {
  const { host, modules, machines } = cfg;
  const bounds = { ...defaultBounds, ...cfg.bounds };
  const sys = { machines, modules, bounds };
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
  const listeners = new Set<() => void>();
  // A sink's throw is its owner's bug. It never skips a command or kills a drain (M9).
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
      done(readExit(exit));
    });
  };
  const invoke = (c: Extract<Command, { k: "invoke" }>) => {
    try {
      const effect = machines[c.machine]!.ops[c.op]!.commit(c.input, { attempt: c.ctx });
      fork(`${c.attempt}#${c.send}`, effect, (exit) =>
        input({ k: "sent", attempt: c.attempt, send: c.send, exit }),
      );
    } catch (cause) {
      input({ k: "sent", attempt: c.attempt, send: c.send, exit: { t: "defect", cause } });
    }
  };
  let forks = 0;
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
        return host.storage.write(
          c.writes,
          c.purpose,
          t && ((ok) => input({ k: "stored", attempt: t.attempt, ticket: t.ticket, ok })),
        );
      }
      case "module": {
        const m = modules.find((x) => x.id === c.m);
        m?.exec?.(c.cmd, {
          fork: (effect, done) =>
            fork(`module/${c.m}/${++forks}`, effect as Effect.Effect<unknown, unknown>, done),
          input: (payload) => input({ k: "module", m: c.m, payload }),
          machine: (id) => machines[id]!,
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
        // D6: each command isolated, and before any sink, so a throw in either never loses a command (M9).
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
  // Per drain, never per publication. A send from a listener queues and runs after notify (D2). A chain of drains that only
  // listeners keep alive is bounded (D35); an outside input resets it.
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
      if (chain >= bounds.notifyChain) {
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
  input({ k: "boot", records: [...host.storage.load()] });
  return {
    input,
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
