import { Cause, Clock, Context, Duration, Effect, Exit, type Fiber, Option, Schema } from "effect";
import type { Values } from "../core/compiled.ts";
import type { Evidence } from "../core/evidence.ts";
import { CallResult, type Env, Input, type Machines, step } from "../core/step.ts";
import { Command, emptyWorld, type World } from "../core/world.ts";
import { FlowError } from "../error.ts";
import { OutcomeFailure, OutcomeUnknown, reasonOf } from "../flow.ts";
import { makeEdge } from "./edge.ts";
import type { Host } from "./host.ts";

/**
 * The Runtime Clock over the host's time and timers, so a commit's own deadline
 * (`Effect.timeoutOrElse`) runs on the same clock as the machines.
 */
// RETURN_TYPE: Effect's Clock service shape.
export const hostClock = (host: Host): Clock.Clock => ({
  currentTimeMillisUnsafe: host.now,
  currentTimeMillis: Effect.sync(host.now),
  currentTimeNanosUnsafe: () => BigInt(host.now()) * 1_000_000n,
  currentTimeNanos: Effect.sync(() => BigInt(host.now()) * 1_000_000n),
  monotonicTimeNanosUnsafe: () => BigInt(Math.round(host.monotonic() * 1_000_000)),
  monotonicTimeNanos: Effect.sync(() => BigInt(Math.round(host.monotonic() * 1_000_000))),
  sleep: (duration) =>
    Effect.callback<void>((resume) => {
      const stop = host.arm(host.now() + Duration.toMillis(duration), () => resume(Effect.void));

      return Effect.sync(stop);
    }),
});

/**
 * How a call ended, read from its fiber's Exit and whole Cause, outside the fiber (WriteLanes R2):
 * a defect first, then Flow's own marks, then a plain error as a failure.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a call's value and error are the contract's own.
export const resultOf = (exit: Exit.Exit<unknown, unknown>) => {
  if (Exit.isSuccess(exit)) return CallResult.Success({ value: exit.value });

  if (Cause.hasDies(exit.cause)) return CallResult.Defect();

  return Option.match(Cause.findErrorOption(exit.cause), {
    onNone: () => CallResult.Interrupted(),
    onSome: (error) => {
      if (error instanceof OutcomeUnknown)
        return CallResult.Unknown({ reason: reasonOf(error.error), error: error.error });

      if (error instanceof OutcomeFailure)
        return CallResult.Failure({ reason: reasonOf(error.error), error: error.error });

      return CallResult.Failure({ reason: reasonOf(error), error });
    },
  });
};

/**
 * The one impure loop: it owns the world, runs each step, and performs the step's commands with
 * Effect (fibers, timers, the persistence edge).
 *
 * **Details**
 *
 * Inputs that arrive while a step's commands run are queued and run in order after it.
 */
export const makeDriver = (options: {
  readonly machines: Machines;
  readonly host: Host;
  readonly persistence: boolean;
  readonly captureMs: number;
  readonly services: Context.Context<never>;
  readonly sink: (evidence: ReadonlyArray<Evidence>) => void;
}) => {
  const { host, machines } = options;
  let world: World = emptyWorld(options.persistence);
  const inbox: Array<Input> = [];
  let running = false;
  // FLOW_STATE_ALLOW_UNKNOWN: a call's fiber carries the contract's own value and error.
  const fibers = new Map<string, Fiber.Fiber<unknown, unknown>>();
  const timers = new Map<string, () => void>();
  const clock = hostClock(host);

  const edge = makeEdge(host, {
    captureMs: options.captureMs,
    stored: (ticket, ok) => input(Input.Stored({ ticket, ok })),
  });

  // FLOW_STATE_ALLOW_UNKNOWN: a call's Effect is the contract's own; its services are this Runtime's.
  const fork = (call: string, effect: Effect.Effect<unknown, unknown, unknown>) => {
    // SAFETY: the boot provides every service the machines' contracts list (Actors R1).
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a contract's services are erased in Compiled and provided by this Runtime's Layer
    const provided = effect as Effect.Effect<unknown, unknown>;

    // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the driver is the host boundary that runs fibers, over the Runtime's own services
    const fiber = Effect.runForkWith(Context.add(options.services, Clock.Clock, clock))(provided, {
      scheduler: host.scheduler,
    });

    fibers.set(call, fiber);
    fiber.addObserver((exit) => {
      fibers.delete(call);
      input(Input.Settled({ call, result: resultOf(exit) }));
    });
  };

  const perform = (command: Command) =>
    Command.$match(command, {
      Invoke: ({ call, machine, operation, input: given, attempt }) => {
        const op = machines.get(machine)?.operations.get(operation);

        if (op === undefined) return;

        const context = {
          attempt: Option.match(attempt, {
            onNone: () => ({
              id: "",
              operation,
              key: {},
              input: given,
              retryCount: 0,
              mayHaveApplied: false,
            }),
            onSome: (a) => ({ ...a, operation, input: given }),
          }),
        };

        fork(
          call,
          Effect.suspend(() => op.call.run(given, context)),
        );
      },
      Interrupt: ({ call }) => {
        const fiber = fibers.get(call);

        // oxlint-disable-next-line lint-bomb/no-unsafe-fiber-methods -- a cancel interrupts the call's fiber at once; its exit settles the call
        if (fiber !== undefined) fiber.interruptUnsafe();
      },
      Arm: ({ timer, at }) => {
        timers.set(
          timer,
          host.arm(at, () => {
            timers.delete(timer);
            input(Input.Fired({ timer }));
          }),
        );
      },
      Disarm: ({ timer }) => {
        timers.get(timer)?.();
        timers.delete(timer);
      },
      Persist: ({ scope, writes, ticket }) => edge.accept(scope, writes, ticket),
    });

  const run = () => {
    running = true;

    for (let next = inbox.shift(); next !== undefined; next = inbox.shift()) {
      const env: Env = { now: host.now(), seed: host.sessionSeed };
      const out = step(machines, world, next, env);
      world = out.world;

      if (out.evidence.length > 0) options.sink(out.evidence);

      for (const command of out.commands) perform(command);
    }

    running = false;
  };

  const input = (next: Input) => {
    inbox.push(next);

    if (!running) run();
  };

  return {
    input,
    world: () => world,
    pending: () => inbox.length > 0,
    send: (
      actor: { readonly machine: string; readonly name: string },
      tag: string,
      payload: Values,
    ) => {
      const codec = machines.get(actor.machine)?.external.get(tag);

      const decoded =
        codec === undefined ? Option.none() : Schema.decodeUnknownOption(codec)(payload);

      // Actors R14: an internal, unknown or invalid event throws InvalidEvent and starts no turn.
      if (Option.isNone(decoded))
        // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the public send's contract: an invalid event throws InvalidEvent before any turn (Actors R14)
        throw new FlowError({
          code: "InvalidEvent",
          problems: [`${actor.machine} ${tag}: not a public event with a valid payload`],
        });

      input(Input.Send({ actor, tag, payload: decoded.value }));
    },
    stop: () => {
      for (const stop of timers.values()) stop();
      timers.clear();
    },
  };
};

/**
 * A Runtime's driver.
 */
export type Driver = ReturnType<typeof makeDriver>;
