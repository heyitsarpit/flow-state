import { asItIs, makeFreezer } from "../core/frozen.ts";
import { Cause, Clock, Context, Deferred, Duration, Effect, Exit, Option, Result } from "effect";
import { admitted } from "../core/boundary.ts";
import { RuntimeDefaults } from "../core/defaults.ts";
import { Operation, operationOf } from "../core/compiled.ts";
import { defect } from "../core/defect.ts";
import type { Values } from "../core/compiled.ts";
import { Evidence } from "../core/evidence.ts";
import { admit, endedBy, isDisposed, Verdict } from "../core/life.ts";
import {
  CallResult,
  type Env,
  Input,
  type Machines,
  owesServe,
  step,
  stopped,
} from "../core/step.ts";
import { type CallId, Command, emptyWorld, type World } from "../core/world.ts";
import { flowError, lifeRejection, raise } from "../error.ts";
import { OutcomeFailure, OutcomeUnknown, reasonOf } from "../flow.ts";
import { makeEdge } from "./edge.ts";
import { type Fibers, sleepUntil } from "./fibers.ts";
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
const resultOf = (exit: Exit.Exit<unknown, unknown>) => {
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
 * Inputs that arrive while a step's commands run are queued and run in order after it; the step
 * runs or drops each as the core's `admit` says. `offer` throws the error a rejected public call
 * names. `ended` completes when the core's life reads Disposed (the core waits for calls on the
 * wire and its own writes, within its bound), or fails with the defect that stopped it.
 * `cleanups` holds each call cleanup that failed after the life left Open.
 */
export const makeDriver = (options: {
  readonly machines: Machines;
  readonly platform: Platform;
  readonly fibers: Fibers;
  readonly persistence: boolean;
  readonly captureMs: number;
  readonly sink: (evidence: ReadonlyArray<Evidence>) => void;
  readonly admit: (evidence: ReadonlyArray<Evidence>) => void;
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
    capture: (tickets, again) => input(Input.Capture({ tickets, again })),
    answered: (ticket, landed) =>
      input(landed ? Input.Stored({ ticket }) : Input.Refused({ ticket })),
  });

  // A command names only operations its Compiled holds: a call that never settles would hang its
  // lane.
  const operationAt = (machine: string, operation: string) =>
    Option.getOrElse(operationOf(machines, machine, operation), () =>
      defect(`no operation ${machine}.${operation}`),
    );

  // The whole Cause of each call interrupted once the Runtime runs no more calls (its life left
  // Open) whose cleanup died: a late result is dropped, so its Exit is judged here, before
  // admission.
  // FLOW_STATE_ALLOW_UNKNOWN: a call's error is the contract's own.
  const cleanups: Array<Cause.Cause<unknown>> = [];

  // FLOW_STATE_ALLOW_UNKNOWN: a call's value, error and services are the contract's own.
  const call = (id: CallId, effect: () => Effect.Effect<unknown, unknown, unknown>) =>
    fibers.fork(`call/${id}`, provided(Effect.suspend(effect)), (exit) => {
      if (
        Exit.isFailure(exit) &&
        Cause.hasInterrupts(exit.cause) &&
        Cause.hasDies(exit.cause) &&
        !Verdict.$is("Run")(admit(world.life, Input.Run()))
      )
        cleanups.push(exit.cause);

      input(Input.Settled({ call: id, result: resultOf(exit) }));
    });

  const perform = (command: Command) =>
    Command.$match(command, {
      Invoke: ({ call: id, machine, operation, input: given, attempt }) =>
        Operation.$match(operationAt(machine, operation), {
          Write: (op) =>
            call(id, () =>
              op.call.run(given, { attempt: { ...attempt, operation, input: given } }),
            ),
          Read: () => defect(`${machine}.${operation} is not a write`),
        }),
      Lookup: ({ call: id, machine, operation, input: given }) =>
        Operation.$match(operationAt(machine, operation), {
          Read: (op) => call(id, () => op.call.run(given)),
          Write: () => defect(`${machine}.${operation} is not a read`),
        }),
      Interrupt: ({ call }) => fibers.cancel(`call/${call}`),
      Arm: ({ timer, at }) =>
        fibers.fork(`timer/${timer}`, sleepUntil(clock, at), (exit) => {
          if (Exit.isSuccess(exit)) input(Input.Fired({ timer }));
        }),
      Disarm: ({ timer }) => fibers.cancel(`timer/${timer}`),
      Persist: ({ due, refused }) => edge.accept(due, refused),
      Write: ({ writes, marks, tickets, refused }) => edge.write(writes, marks, tickets, refused),
    });

  // One freezer for the Runtime's life, so a part it froze once is never walked again.
  const admitValue = host.freezeValues ? makeFreezer() : asItIs;

  // A defect in a step leaves its world half written, so the Runtime's life ends Stopped at the
  // first one: no input runs again, the defect is the Runtime's failure, which ready and dispose
  // report, and the host's close, waiting on `ended`, closes its Scope.
  // FLOW_STATE_ALLOW_UNKNOWN: a defect is whatever the step threw.
  const stop = (defect: unknown) => {
    world = stopped(world);
    inbox.length = 0;
    Deferred.doneUnsafe(disposed, Exit.die(defect));
  };

  const budgetMs = Duration.toMillis(RuntimeDefaults.slowWorkBudget);

  // Dev only: a step slower than the budget, as SlowWork evidence; a host with no work clock
  // times nothing.
  const slowWork = (next: Input, started: Option.Option<number>) =>
    Option.filter(
      Option.zipWith(host.workClock, started, (now, at) => now() - at),
      (ms) => ms > budgetMs,
    ).pipe(
      Option.map((ms) =>
        Evidence.SlowWork({
          work: Input.$is("Capture")(next) ? "capture" : "turn",
          input: next._tag,
          ms,
          budgetMs,
        }),
      ),
    );

  // Runs each queued input's step and performs its work. A defect in the step, or a throw while
  // its work is performed, stops the Runtime; a throw from the host's admit hook (or its work clock)
  // stops it too and is returned, for the host that raised it.
  const drainInbox = () => {
    for (let next = inbox.shift(); next !== undefined; next = inbox.shift()) {
      const current = next;

      const stepped = Result.try({
        try: () => {
          const started = Option.map(host.workClock, (now) => now());

          const env: Env = {
            now: clock.currentTimeMillisUnsafe(),
            seed: host.sessionSeed,
            admit: admitValue,
          };

          return { out: step(machines, world, current, env), started };
        },
        catch: (defect) => defect,
      });

      if (Result.isFailure(stepped)) {
        stop(stepped.failure);

        return Option.none();
      }

      const { out, started } = stepped.success;

      const admitted = Result.try({
        try: () => {
          const evidence = Option.match(slowWork(current, started), {
            onNone: () => out.evidence,
            onSome: (slow) => [...out.evidence, slow],
          });

          options.admit(evidence);

          return evidence;
        },
        catch: (fault) => fault,
      });

      if (Result.isFailure(admitted)) {
        stop(admitted.failure);

        return Option.some({ fault: admitted.failure });
      }

      const evidence = admitted.success;
      world = out.world;

      if (evidence.length > 0) options.sink(evidence);

      const performed = Result.try({
        try: () => {
          for (const command of out.commands) perform(command);
        },
        catch: (defect) => defect,
      });

      if (Result.isFailure(performed)) {
        stop(performed.failure);

        return Option.none();
      }

      // Mail the step's drain left is served by a later step, after a yield to the host's tasks.
      if (owesServe(world))
        fibers.fork("serve", Effect.yieldNow, (exit) => {
          if (Exit.isSuccess(exit)) input(Input.Serve());
        });

      if (isDisposed(world.life)) Deferred.doneUnsafe(disposed, Exit.void);
    }

    return Option.none();
  };

  // The loop is released before a host callback's throw goes back to its caller, so the inbox is
  // never wedged.
  const run = () => {
    running = true;
    const fault = drainInbox();
    running = false;

    if (Option.isSome(fault))
      // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a host callback's throw goes back to its caller, after the loop is released
      throw fault.value.fault;
  };

  const input = (next: Input) => {
    inbox.push(next);

    if (!running) run();
  };

  // A public call the Runtime's life rejects throws the error its verdict names and runs nothing.
  const check = (next: Input, what: string) => {
    const verdict = admit(world.life, next);

    if (Verdict.$is("Reject")(verdict))
      return raise(
        flowError([lifeRejection(verdict.code, what, what, "ready()", endedBy(world.life))]),
      );
  };

  const offer = (next: Input, what: string) => {
    check(next, what);
    input(next);
  };

  return {
    input,
    offer,
    verdict: (next: Input) => admit(world.life, next),
    // The Runtime's failure, once its life is Stopped: the defect that stopped it.
    ended: Deferred.await(disposed),
    machines,
    world: () => world,
    pending: () => inbox.length > 0,
    stored: () => edge.settled(),
    send: (
      actor: { readonly machine: string; readonly name: string },
      tag: string,
      payload: Values,
    ) => {
      const event = machines.get(actor.machine)?.events.get(tag);

      const decoded =
        event !== undefined && event.public
          ? admitted(event.walk, event.names, payload)
          : Option.none<Values>();

      check(Input.Send({ actor, tag, payload }), `send ${tag} to ${actor.name}`);

      // An internal, unknown or invalid event throws InvalidEvent and starts no turn.
      if (Option.isNone(decoded))
        return raise(
          flowError([
            {
              code: "InvalidEvent",
              path: [actor.machine, tag],
              summary: `${tag} is not a public event of ${actor.machine} with a valid payload`,
              help: "Send a public event of this machine with a payload its Schema accepts.",
            },
          ]),
        );

      input(Input.Send({ actor, tag, payload: decoded.value }));
    },
    // Every interrupt cleanup that failed once the life left Open, oldest first, read only.
    cleanups: () => cleanups.slice(),
  };
};

/**
 * A Runtime's driver.
 */
export type Driver = ReturnType<typeof makeDriver>;
