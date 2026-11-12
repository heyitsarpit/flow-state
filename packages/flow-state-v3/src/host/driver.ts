import {
  Cause,
  Clock,
  Context,
  Deferred,
  Duration,
  Effect,
  Exit,
  Option,
  Result,
  Schema,
} from "effect";
import { Operation } from "../core/compiled.ts";
import type { Values } from "../core/compiled.ts";
import { Evidence } from "../core/evidence.ts";
import { CallResult, type Env, Input, type Machines, step } from "../core/step.ts";
import { DISPOSAL_BOUND_MS } from "../core/tx.ts";
import { type CallId, Command, Disposal, emptyWorld, type World } from "../core/world.ts";
import { FlowError } from "../error.ts";
import { OutcomeFailure, OutcomeUnknown, reasonOf } from "../flow.ts";
import { makeEdge } from "./edge.ts";
import type { Fibers } from "./fibers.ts";
import { Host, type Platform } from "./host.ts";

/**
 * A call's Effect with its contract's services erased: the Runtime provides every service the
 * machines' contracts list.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a call's value, error and services are the contract's own.
const provided = (effect: Effect.Effect<unknown, unknown, unknown>) =>
  // SAFETY: the boot provides every service the machines' contracts list.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a contract's services are erased in Compiled and provided by the Runtime's fibers
  effect as Effect.Effect<unknown, unknown>;

/**
 * How a call ended, read from its fiber's Exit and whole Cause, outside the fiber:
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
 * Effect: calls and timers as keyed fibers in the Runtime's Scope, writes through the persistence
 * edge.
 *
 * **Details**
 *
 * Inputs that arrive while a step's commands run are queued and run in order after it. Once the
 * core's disposal has ended, inputs are dropped. `dispose` starts that disposal and completes
 * when the edge has written what it left, within what remains of the disposal's bound; a write
 * still pending then reports StorageFailure. The Runtime's Scope is about to interrupt every
 * fiber.
 */
export const makeDriver = (options: {
  readonly machines: Machines;
  readonly platform: Platform;
  readonly fibers: Fibers;
  readonly persistence: boolean;
  readonly captureMs: number;
  readonly sink: (evidence: ReadonlyArray<Evidence>) => void;
}) => {
  const { machines, fibers } = options;
  const clock = Context.get(options.platform, Clock.Clock);
  const host = Context.get(options.platform, Host);
  let world: World = emptyWorld(options.persistence);
  const inbox: Array<Input> = [];
  let running = false;
  const disposed = Deferred.makeUnsafe<void>();

  const edge = makeEdge(options.platform, fibers, {
    captureMs: options.captureMs,
    answered: (ticket, landed) =>
      input(landed ? Input.Stored({ ticket }) : Input.Refused({ ticket })),
  });

  const defect = (what: string) => {
    // oxlint-disable-next-line lint-bomb/no-throw-in-core -- unreachable from a valid Compiled and step: a call that never settles would hang its lane
    throw new Error(`Defect: ${what}`);
  };

  const operationOf = (machine: string, operation: string) =>
    machines.get(machine)?.operations.get(operation) ??
    defect(`no operation ${machine}.${operation}`);

  // FLOW_STATE_ALLOW_UNKNOWN: a call's value, error and services are the contract's own.
  const call = (id: CallId, effect: () => Effect.Effect<unknown, unknown, unknown>) =>
    fibers.fork(`call/${id}`, provided(Effect.suspend(effect)), (exit) =>
      input(Input.Settled({ call: id, result: resultOf(exit) })),
    );

  const perform = (command: Command) =>
    Command.$match(command, {
      Invoke: ({ call: id, machine, operation, input: given, attempt }) =>
        Operation.$match(operationOf(machine, operation), {
          Write: (op) =>
            call(id, () =>
              op.call.run(given, { attempt: { ...attempt, operation, input: given } }),
            ),
          Read: () => defect(`${machine}.${operation} is not a write`),
        }),
      Lookup: ({ call: id, machine, operation, input: given }) =>
        Operation.$match(operationOf(machine, operation), {
          Read: (op) => call(id, () => op.call.run(given)),
          Write: () => defect(`${machine}.${operation} is not a read`),
        }),
      Interrupt: ({ call }) => fibers.cancel(`call/${call}`),
      Arm: ({ timer, at }) =>
        fibers.fork(
          `timer/${timer}`,
          Effect.sleep(Duration.millis(Math.max(0, at - clock.currentTimeMillisUnsafe()))),
          (exit) => {
            if (Exit.isSuccess(exit)) input(Input.Fired({ timer }));
          },
        ),
      Disarm: ({ timer }) => fibers.cancel(`timer/${timer}`),
      Persist: ({ scope, writes, due }) => edge.accept(scope, writes, due),
    });

  const drainInbox = () => {
    for (let next = inbox.shift(); next !== undefined; next = inbox.shift()) {
      const env: Env = { now: clock.currentTimeMillisUnsafe(), seed: host.sessionSeed };
      const out = step(machines, world, next, env);
      world = out.world;

      if (out.evidence.length > 0) options.sink(out.evidence);

      for (const command of out.commands) perform(command);

      if (Disposal.$is("Disposed")(world.disposal)) Deferred.doneUnsafe(disposed, Exit.void);
    }
  };

  // A defect in a step must not wedge the inbox: the loop is released before the defect is
  // rethrown, so the next input runs.
  const run = () => {
    running = true;
    const drained = Result.try({ try: drainInbox, catch: (defect) => defect });
    running = false;

    if (Result.isFailure(drained))
      // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a step's defect is rethrown to the caller at the host boundary, after the loop is released
      throw drained.failure;
  };

  const input = (next: Input) => {
    if (Disposal.$is("Disposed")(world.disposal)) return;
    inbox.push(next);

    if (!running) run();
  };

  return {
    input,
    machines,
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

      // An internal, unknown or invalid event throws InvalidEvent and starts no turn.
      if (Option.isNone(decoded))
        // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the public send's contract: an invalid event throws InvalidEvent before any turn
        throw new FlowError({
          code: "InvalidEvent",
          problems: [`${actor.machine} ${tag}: not a public event with a valid payload`],
        });

      input(Input.Send({ actor, tag, payload: decoded.value }));
    },
    dispose: Effect.suspend(() => {
      const bound = clock.currentTimeMillisUnsafe() + DISPOSAL_BOUND_MS;
      input(Input.DisposeRuntime());

      return Deferred.await(disposed).pipe(
        Effect.andThen(
          Effect.suspend(() =>
            edge.flush.pipe(
              Effect.timeout(Duration.millis(Math.max(0, bound - clock.currentTimeMillisUnsafe()))),
            ),
          ),
        ),
        Effect.catchTag("TimeoutError", () =>
          Effect.sync(() =>
            options.sink([Evidence.Issue({ code: "StorageFailure", ending: Option.none() })]),
          ),
        ),
        Effect.provideService(Clock.Clock, clock),
      );
    }),
  };
};

/**
 * A Runtime's driver.
 */
export type Driver = ReturnType<typeof makeDriver>;
