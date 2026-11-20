// The one impure file. pump is the only loop; it owns the world variable, the inbox, the fibers and the input log.
// Shape B (D6): runFork + addObserver + a set the Runtime owns. One obligation: at least one `sent` per invoke.
// Prior art, read: drain then defer, codebases/xstate/packages/core/src/createActor.ts:280-299; batch depth then flush,
// codebases/alien-signals/src/index.ts:106-112; runFork starts now, node_modules/effect/src/internal/effect.ts:5680-5690.
import { Cause, Effect, Exit, type Fiber } from "effect";
import { OutcomeFailure, OutcomeUnknown, type Compiled } from "../conformance/fixtures/compiled.ts";
import type { Host } from "../conformance/fake-world.ts";
import { emptyWorld, step } from "./step.ts";
import type {
  Command,
  Env,
  Evidence,
  Input,
  Issue,
  Machines,
  Module,
  SendExit,
  StepOut,
  World,
} from "./world.ts";

export type LogEntry = {
  readonly input: Input;
  readonly now: number;
  readonly ids: readonly string[];
  readonly out: StepOut | "aborted";
};
export type Publication = NonNullable<StepOut["frame"]>;

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

export const safeStep = (
  world: World,
  i: Input,
  env: Env,
  machines: Machines,
  modules: readonly Module[],
): StepOut | "aborted" => {
  try {
    return step(world, i, env, machines, modules);
  } catch {
    return "aborted"; // D10: our own bug. The value stays.
  }
};

// When a turn's step aborts, its mail head would be runnable forever, so the item goes. RESULTS, finding F4.
export const afterAbort = (world: World, i: Input): World =>
  i.k === "turn" ? { ...world, mail: world.mail.slice(1) } : world;

export const createRuntime = (cfg: {
  host: Host;
  compiled: readonly Compiled[];
  modules: readonly Module[];
  bounds?: { drainMs?: number };
  onEvidence: (e: readonly Evidence[]) => void;
  onIssue: (i: readonly Issue[]) => void;
}) => {
  const { host, modules } = cfg;
  const machines: Machines = Object.fromEntries(cfg.compiled.map((c) => [c.id, c]));
  const drainMs = cfg.bounds?.drainMs ?? 8;
  let world: World = emptyWorld;
  let running = false;
  let yielded = false;
  const inbox: Input[] = [];
  const log: LogEntry[] = [];
  const frames: Publication[] = [];
  const fibers = new Map<string, Fiber.Fiber<unknown, unknown>>();
  const hostTimers = new Map<string, () => void>();
  const listeners = new Set<() => void>();

  const invoke = (c: Extract<Command, { k: "invoke" }>) => {
    const key = `${c.attempt}#${c.send}`;
    let fiber: Fiber.Fiber<unknown, unknown>;
    try {
      const effect = machines[c.machine]!.ops[c.op]!.commit(c.input, { attempt: c.ctx });
      fiber = Effect.runFork(effect, { scheduler: host.scheduler });
    } catch (cause) {
      return input({ k: "sent", attempt: c.attempt, send: c.send, exit: { t: "defect", cause } });
    }
    fibers.set(key, fiber);
    fiber.addObserver((exit) => {
      fibers.delete(key);
      input({ k: "sent", attempt: c.attempt, send: c.send, exit: readExit(exit) });
    });
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
        return host.storage.write(
          c.writes,
          c.purpose,
          c.ticket && ((ok) => input({ k: c.ticket!.k, attempt: c.ticket!.attempt, ok })),
        );
    }
  };

  const pump = () => {
    if (running) return;
    running = true;
    yielded = false;
    const t0 = performance.now();
    try {
      while (inbox.length || (world.mail.length > 0 && !world.disposing)) {
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
        const out = safeStep(world, i, env, machines, modules);
        log.push({ input: i, now: env.now, ids, out });
        if (out === "aborted") {
          world = afterAbort(world, i);
          cfg.onIssue([{ code: "StepDefect", input: i.k }]);
          continue;
        }
        world = out.world;
        cfg.onEvidence(out.evidence);
        if (out.issues.length) cfg.onIssue(out.issues);
        if (out.frame) frames.push(out.frame);
        // D6: each command isolated, so a throw in one never skips the rest.
        for (const c of out.commands) {
          try {
            exec(c);
          } catch (e) {
            cfg.onIssue([{ code: "CommandFailed", origin: c.k, input: String(e) }]);
          }
        }
        if (performance.now() - t0 > drainMs && (inbox.length || world.mail.length)) {
          yielded = true;
          host.later(pump);
          break;
        }
      }
    } finally {
      running = false;
    }
    if (!yielded) for (const l of listeners) l(); // notify per drain, never per publication
  };
  function input(i: Input) {
    inbox.push(i);
    pump();
  }

  input({ k: "boot", records: [...host.storage.load()] });
  return {
    input,
    log,
    frames,
    machines,
    modules,
    world: () => world,
    pending: () => inbox.length > 0 || (world.mail.length > 0 && !world.disposing) || running,
    live: () => fibers.size,
    subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
  };
};
export type Runtime = ReturnType<typeof createRuntime>;
