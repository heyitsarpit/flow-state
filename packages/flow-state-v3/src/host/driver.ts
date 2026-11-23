import { asItIs, makeFreezer } from "../core/frozen.ts";
import {
  Cause,
  Clock,
  Context,
  Data,
  Deferred,
  Duration,
  Effect,
  Exit,
  Option,
  Result,
} from "effect";
import { admitted } from "../core/boundary.ts";
import { RuntimeDefaults, TIMER_LIMIT_MS } from "../core/defaults.ts";
import { makeScheduleSteps } from "./owners/schedule-steps.ts";
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
import {
  type ActorId,
  actorKey,
  type CallId,
  Command,
  emptyWorld,
  type World,
} from "../core/world.ts";
import { flowError, flowErrorOf, lifeRejection, raise } from "../error.ts";
import { OutcomeFailure, OutcomeUnknown, reasonOf } from "../flow.ts";
import { makeEdge } from "./edge.ts";
import { Ending, type Owner, type RuntimeReport, sleepUntil } from "./owners/owners.ts";
import { Host, type Platform } from "./host.ts";
import type { Store } from "./store.ts";

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
 * How a call ended, as the core hears it: Flow's own marks, then a plain error as a failure; an
 * interrupted call is Interrupted, its cleanup's failure being its Owner's. A write's
 * `Cause.TimeoutError` is unknown, since a write that timed out may still have happened; a read's
 * is a failure like any other.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a call's value and error are the contract's own.
const resultOf = (kind: "read" | "write") => (ending: Ending<unknown>) =>
  Ending.$match(ending, {
    Done: ({ value }) => CallResult.Success({ value }),
    Died: () => CallResult.Defect(),
    Interrupted: () => CallResult.Interrupted(),
    Failed: ({ error }) => {
      if (error instanceof OutcomeUnknown)
        return CallResult.Unknown({ reason: reasonOf(error.error), error: error.error });

      if (error instanceof OutcomeFailure)
        return CallResult.Failure({ reason: reasonOf(error.error), error: error.error });

      if (kind === "write" && Cause.isTimeoutError(error))
        return CallResult.Unknown({ reason: "TimeoutError", error });

      return CallResult.Failure({ reason: reasonOf(error), error });
    },
  });

// A ref whose ended actors' cleanups failed: failures no ensure has reported, failures one has, or
// both, when a failure lands after an ensure reported the earlier ones.
type Quarantine = Data.TaggedEnum<{
  // FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it threw.
  Unheard: { unheard: Cause.Cause<unknown> };
  // FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it threw.
  Heard: { heard: Cause.Cause<unknown> };
  // FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it threw.
  Partly: { heard: Cause.Cause<unknown>; unheard: Cause.Cause<unknown> };
}>;

const Quarantine = Data.taggedEnum<Quarantine>();

// The quarantine once a cleanup failure lands: it joins the failures no ensure has reported.
// FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it threw.
const failedIn = (held: Option.Option<Quarantine>, cause: Cause.Cause<unknown>) =>
  Option.match(held, {
    onNone: () => Quarantine.Unheard({ unheard: cause }),
    onSome: Quarantine.$match({
      Unheard: ({ unheard }) => Quarantine.Unheard({ unheard: Cause.combine(unheard, cause) }),
      Heard: ({ heard }) => Quarantine.Partly({ heard, unheard: cause }),
      Partly: ({ heard, unheard }) =>
        Quarantine.Partly({ heard, unheard: Cause.combine(unheard, cause) }),
    }),
  });

// Every failure a quarantine holds, in the order they landed: what an ensure reports.
const wholeOf = Quarantine.$match({
  Unheard: ({ unheard }) => unheard,
  Heard: ({ heard }) => heard,
  Partly: ({ heard, unheard }) => Cause.combine(heard, unheard),
});

// The failures no ensure has reported, if any: what a lift or the Runtime's close reports.
const unheardOf = Quarantine.$match({
  Unheard: ({ unheard }) => Option.some(unheard),
  Heard: () => Option.none(),
  Partly: ({ unheard }) => Option.some(unheard),
});

/**
 * The one impure loop: it owns the world, runs each step, and performs the step's commands with
 * Effect: calls and timers as keyed tasks of an Owner, writes through the persistence edge.
 *
 * **Details**
 *
 * Inputs that arrive while a step's commands run are queued and run in order after it; the step
 * runs or drops each as the core's `admit` says. `offer` throws the error a rejected public call
 * names. `ended` completes when the core's life reads Disposed (the core waits for calls on the
 * wire and its own writes, within its bound), or fails with the defect that stopped it.
 * Every task runs in an Owner: writes, timers and store writes in the Runtime's work, each read in
 * its incarnation's. Each failed cleanup is an Issue as it is judged; an incarnation's end
 * quarantines its ref with its failures, and the Runtime's disposal reports them to `report`.
 */
export const makeDriver = (options: {
  readonly machines: Machines;
  readonly platform: Platform;
  readonly work: Owner;
  readonly report: RuntimeReport;
  readonly persistence: boolean;
  readonly store: () => Store["Service"];
  readonly captureMs: number;
  readonly sink: (evidence: ReadonlyArray<Evidence>) => void;
  readonly admit: (evidence: ReadonlyArray<Evidence>) => void;
}) => {
  const { machines } = options;
  const clock = Context.get(options.platform, Clock.Clock);
  const host = Context.get(options.platform, Host);
  let world: World = emptyWorld(options.persistence);
  const inbox: Array<Input> = [];
  let running = false;
  const disposed = Deferred.makeUnsafe<void>();

  const { work, report } = options;

  // Each ref whose ended actor's cleanup failed, by identity: an ensure reports it until a
  // disposeActor of that identity lifts it.
  const quarantined = new Map<string, Quarantine>();

  // The Owner of each incarnation's reads, made at its first read, until its work ends.
  const incarnations = new Map<string, { readonly owner: Owner; readonly actor: ActorId }>();

  // FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it threw.
  const quarantine = (actor: ActorId, failures: ReadonlyArray<Cause.Cause<unknown>>) => {
    if (failures.length === 0) return;

    // Once no ensure can run, no ensure can report it: the Runtime's report hears it instead.
    if (!Verdict.$is("Run")(admit(world.life, Input.Run()))) return report.hear(failures);

    const key = actorKey(actor);

    quarantined.set(
      key,
      failedIn(
        Option.fromUndefinedOr(quarantined.get(key)),
        failures.reduce((all, cause) => Cause.combine(all, cause)),
      ),
    );
  };

  const ownerOf = (id: string, actor: ActorId) =>
    Option.getOrElse(
      Option.map(Option.fromUndefinedOr(incarnations.get(id)), (held) => held.owner),
      () => {
        const owner = work.child(`incarnation ${id}`);
        incarnations.set(id, { owner, actor });

        return owner;
      },
    );

  const edge = makeEdge(options.platform, work, {
    captureMs: options.captureMs,
    store: options.store,
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

  const call = (
    kind: "read" | "write",
    owner: Owner,
    id: CallId,
    // FLOW_STATE_ALLOW_UNKNOWN: a call's value, error and services are the contract's own.
    effect: () => Effect.Effect<unknown, unknown, unknown>,
  ) =>
    owner.fork(`call/${id}`, provided(Effect.suspend(effect)), (ending) =>
      input(Input.Settled({ call: id, result: resultOf(kind)(ending) })),
    );

  // A task that only wakes the core when it runs to its end: a sleep or a yield.
  // FLOW_STATE_ALLOW_UNKNOWN: whatever the task returns, which only its end matters.
  const onDone = (then: () => void) => (ending: Ending<unknown>) => {
    if (Ending.$is("Done")(ending)) then();
  };

  const perform = (command: Command) =>
    Command.$match(command, {
      Invoke: ({ call: id, machine, operation, input: given, attempt }) =>
        Operation.$match(operationAt(machine, operation), {
          Write: (op) =>
            call("write", work, id, () =>
              op.call.run(given, {
                attempt: { ...attempt, operation, input: given },
                progress: (value) => input(Input.Progress({ call: id, value })),
              }),
            ),
          Read: () => defect(`${machine}.${operation} is not a write`),
        }),
      Lookup: ({ call: id, actor, operation, input: given, owner }) =>
        Operation.$match(operationAt(actor.machine, operation), {
          Read: (op) => call("read", ownerOf(owner, actor), id, () => op.call.run(given)),
          Write: () => defect(`${actor.machine}.${operation} is not a read`),
        }),
      Interrupt: ({ call }) => work.cancel(`call/${call}`),
      // Each named incarnation's Owner closes in turn; the Runtime's close takes over any not yet
      // closing, and then hears them itself.
      EndWork: ({ owners, reportTo }) => {
        const ending = owners.flatMap((id) => {
          const held = Option.fromUndefinedOr(incarnations.get(id));
          incarnations.delete(id);

          return Option.toArray(held);
        });

        if (ending.length > 0)
          work.fork(
            `end/${owners.join(",")}`,
            Effect.forEach(
              ending,
              ({ owner, actor }) =>
                owner.end(
                  reportTo === "ref" ? (failures) => quarantine(actor, failures) : report.hear,
                ),
              { concurrency: 1, discard: true },
            ),
            () => undefined,
          );
      },
      // The one wake replaces the last: a deadline past the host timer's limit would fire at once,
      // and the core never sets one.
      Wake: ({ at }) =>
        at - clock.currentTimeMillisUnsafe() > TIMER_LIMIT_MS
          ? defect(`a wake at ${String(at)} is past the host timer's limit`)
          : work.fork(
              "alarm",
              sleepUntil(clock, at),
              onDone(() => input(Input.Tick())),
            ),
      Sleep: () => work.cancel("alarm"),
      Persist: ({ due, refused }) => edge.accept(due, refused),
      Write: ({ writes, marks, tickets, refused }) => edge.write(writes, marks, tickets, refused),
    });

  // One freezer for the Runtime's life, so a part it froze once is never walked again.
  const admitValue = host.freezeValues ? makeFreezer() : asItIs;

  // One stepper for the Runtime's life: each Effect Schedule series keeps its step function.
  const stepSchedule = makeScheduleSteps();

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
            step: stepSchedule,
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
        work.fork(
          "serve",
          Effect.yieldNow,
          onDone(() => input(Input.Serve())),
        );

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
    // The Runtime's work, whose tasks are judged as the driver's own are: a host's Effect runs here.
    work,
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
    // The CleanupFailed an identity's ensure reports, with the whole Cause its ended actor's reads
    // left, if any; the failure is heard from then on.
    quarantine: (actor: ActorId) => {
      const key = actorKey(actor);

      return Option.map(Option.fromUndefinedOr(quarantined.get(key)), (held) => {
        const cause = wholeOf(held);
        quarantined.set(key, Quarantine.Heard({ heard: cause }));

        return flowErrorOf(
          [
            {
              code: "CleanupFailed",
              path: [actor.machine, actor.name],
              summary: `${actor.name}'s cleanup failed when its actor ended`,
              help: "Fix the failing cleanup; disposeActor on this ref lifts the quarantine.",
            },
          ],
          cause,
        );
      });
    },
    // A disposeActor of the identity lifts its quarantine; a failure no ensure reported goes to the
    // Runtime's report, so it is never lost.
    lift: (actor: ActorId) => {
      const key = actorKey(actor);

      report.hear(
        Option.toArray(Option.flatMap(Option.fromUndefinedOr(quarantined.get(key)), unheardOf)),
      );

      quarantined.delete(key);
    },
    // Every quarantined failure no ensure reported, for the Runtime's close.
    unheard: () => [...quarantined.values()].flatMap((q) => Option.toArray(unheardOf(q))),
  };
};

/**
 * A Runtime's driver.
 */
export type Driver = ReturnType<typeof makeDriver>;
