import {
  Cause,
  type Clock,
  Context,
  Data,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  FiberMap,
  Option,
  Scheduler,
  Scope,
} from "effect";

/**
 * How a task ended, as the one who forked it hears it: never a raw Cause to misread.
 *
 * **Details**
 *
 * `Failed` is the work's own typed failure, `Died` its own defect. `Interrupted` means someone ended
 * it; any failure of its cleanup went to its Owner, never to this caller.
 */
export type Ending<A> = Data.TaggedEnum<{
  Done: { value: A };
  // FLOW_STATE_ALLOW_UNKNOWN: a task's error and defect are its own.
  Failed: { error: unknown; cause: Cause.Cause<unknown> };
  // FLOW_STATE_ALLOW_UNKNOWN: a task's defect is its own.
  Died: { cause: Cause.Cause<unknown> };
  Interrupted: {};
}>;

interface EndingOf extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: Ending<this["A"]>;
}

/**
 * Constructors and matchers for {@link Ending}.
 */
export const Ending = Data.taggedEnum<EndingOf>();

// A cleanup's Cause is a failure unless it is a pure interrupt; it is kept whole.
// FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it threw.
const cleanupOf = (cause: Cause.Cause<unknown>) =>
  Cause.hasInterruptsOnly(cause) ? Option.none() : Option.some(cause);

/**
 * The one rule every task's Exit goes through, once, inside its fiber: how it ended, and the failed
 * cleanup an interrupted task leaves, if any.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a task's error and defect are its own.
export const judge = <A>(exit: Exit.Exit<A, unknown>) => {
  if (Exit.isSuccess(exit))
    return { ending: Ending.Done({ value: exit.value }), failure: Option.none() };

  const { cause } = exit;

  // Interrupted: any Fail or Die beside the interrupt is a failed cleanup.
  if (Cause.hasInterrupts(cause))
    return { ending: Ending.Interrupted<A>(), failure: cleanupOf(cause) };

  if (Cause.hasDies(cause)) return { ending: Ending.Died<A>({ cause }), failure: Option.none() };

  return Option.match(Cause.findErrorOption(cause), {
    onNone: () => ({ ending: Ending.Died<A>({ cause }), failure: Option.none() }),
    onSome: (error) => ({ ending: Ending.Failed<A>({ error, cause }), failure: Option.none() }),
  });
};

const notAnEffect = <A, E>(work: Effect.Effect<A, E>) =>
  Effect.suspend(() =>
    Effect.isEffect(work) ? work : Effect.die(new TypeError(`Not a valid effect: ${String(work)}`)),
  );

/**
 * Who hears the failed cleanups an Owner's close collected: the one who started that close.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it threw.
export type Hear = (failures: ReadonlyArray<Cause.Cause<unknown>>) => void;

/**
 * What an Owner tells a dev trace: each task as it starts and as it ends, and each close's report.
 *
 * **Details**
 *
 * A `Task` names its Owner, its number in that Owner (from 0, in the order tasks start), its key and
 * its phase: `started`, or the tag of its {@link Ending}; `failed` is whether its cleanup failed.
 * An Owner's close releases its own Scope as one more task, keyed `scope`, so its finalizers'
 * failures are counted as every task's are. A `Report` is what one close heard: `causes` in all.
 * `heardBy` is `parent` when the close was started by its parent's close, whose report counts these
 * causes again, and `closer` when it went to whoever else started it. `parent` names the Owner
 * this one is nested in.
 */
export type OwnerRecord = Data.TaggedEnum<{
  Task: {
    owner: string;
    task: number;
    key: string;
    phase: "started" | Ending<never>["_tag"];
    failed: boolean;
  };
  Report: {
    owner: string;
    parent: Option.Option<string>;
    heardBy: "closer" | "parent";
    causes: number;
  };
}>;

/**
 * Constructors and matchers for {@link OwnerRecord}.
 */
export const OwnerRecord = Data.taggedEnum<OwnerRecord>();

/**
 * Where an Owner's records go: a dev trace's hook, or none in production, which builds no record.
 */
export type Traced = Option.Option<(record: OwnerRecord) => void>;

// An Owner runs work until its close starts; every later closer only waits for the first.
type Phase = Data.TaggedEnum<{
  Open: {};
  Closing: { done: Deferred.Deferred<void> };
}>;

const Phase = Data.taggedEnum<Phase>();

// Who started a close: the Owner's parent, as its own close, or anyone else.
type HeardBy = "closer" | "parent";

/**
 * An Owner: an Effect Scope, the keyed tasks forked in it, the Owners nested in it, and the failed
 * cleanups judged in it.
 *
 * **When to use**
 *
 * The host forks every task through an Owner and nowhere else: the Runtime's work, each
 * incarnation's reads, each `runPromise` call.
 *
 * **Details**
 *
 * - `fork` runs a task under a key; forking under a live key interrupts that key's task. The caller
 *   hears an {@link Ending}; a failed cleanup goes to the Owner's ledger and to `judged` at once.
 * - `end(hear)` starts the close once, on its own fiber: each nested Owner is closed in turn, then
 *   the Scope, which interrupts and awaits every task. `hear` gets every failure judged in this
 *   Owner and in each nested Owner this close started. A second `end` only waits.
 * - A closed Owner runs nothing: a task forked into it never starts and is heard as Interrupted.
 * - `name` names the Owner in `traced`'s records; a nested Owner's name follows its parent's.
 *
 * **Gotchas**
 *
 * - `onEnding` runs inside the task's fiber, before the fiber ends, so a close that awaits the task
 *   has heard its ending.
 */
// RETURN_TYPE: the Owner contract, without the close its parent holds.
export const makeOwner = (
  parent: Scope.Scope,
  context: () => Context.Context<never>,
  // FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it threw.
  judged: (failure: Cause.Cause<unknown>) => void,
  name: string,
  traced: Traced,
): Owner =>
  build(parent, context, judged, { name, parent: Option.none() }, traced, () => undefined);

// An Owner as its parent holds it: with the close the parent's own close starts.
type Held = Owner & { readonly close: (hear: Hear, by: HeardBy) => Deferred.Deferred<void> };

// RETURN_TYPE: an Owner makes Owners nested in it, so its type is named, not inferred.
const build = (
  parent: Scope.Scope,
  context: () => Context.Context<never>,
  // FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it threw.
  judged: (failure: Cause.Cause<unknown>) => void,
  named: { readonly name: string; readonly parent: Option.Option<string> },
  traced: Traced,
  closed: () => void,
): Held => {
  // oxlint-disable-next-line lint-bomb/no-unmanaged-effect-scope -- an Owner's Scope is a child of its parent's, closed by the Owner's own close
  const scope = Scope.forkUnsafe(parent);
  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- an Owner is built synchronously, in its parent's Scope
  const tasks = Effect.runSync(FiberMap.make<string>().pipe(Scope.provide(scope)));
  // FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it threw.
  const failures: Array<Cause.Cause<unknown>> = [];
  const children = new Set<Held>();
  let phase: Phase = Phase.Open();
  let numbered = 0;

  const run = <A, E>(effect: Effect.Effect<A, E>) => detach(effect, context);

  const forkJudged = <A, E>(
    key: string,
    work: Effect.Effect<A, E>,
    onEnd: (ending: Ending<A>, exit: Exit.Exit<A, E>) => void,
  ) => {
    if (Phase.$is("Closing")(phase)) return onEnd(Ending.Interrupted(), Exit.interrupt());

    const task = numbered;
    numbered += 1;

    if (Option.isSome(traced))
      traced.value(
        OwnerRecord.Task({ owner: named.name, task, key, phase: "started", failed: false }),
      );

    // A value that is not an Effect (a host's runPromise of anything) dies inside the task, so it
    // is judged too: Effect's own loop ends such a fiber without running its finalizers.
    const fiber = run(
      Effect.onExit(notAnEffect(work), (exit) =>
        Effect.sync(() => {
          const { ending, failure } = judge(exit);

          if (Option.isSome(traced))
            traced.value(
              OwnerRecord.Task({
                owner: named.name,
                task,
                key,
                phase: ending._tag,
                failed: Option.isSome(failure),
              }),
            );

          for (const cause of Option.toArray(failure)) {
            failures.push(cause);
            judged(cause);
          }

          onEnd(ending, exit);
        }),
      ),
    );

    FiberMap.setUnsafe(tasks, key, fiber);
  };

  // Starts the close once and returns what it completes; a later start returns the first's.
  const stop = (hear: Hear, by: HeardBy) => {
    if (Phase.$is("Closing")(phase)) return phase.done;

    const done = Deferred.makeUnsafe<void>();
    phase = Phase.Closing({ done });

    run(
      Effect.gen(function* () {
        // FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it threw.
        const nested: Array<Cause.Cause<unknown>> = [];

        for (const child of children)
          yield* Deferred.await(child.close((found) => void nested.push(...found), "parent"));

        const task = numbered;
        numbered += 1;
        const own = yield* releaseTraced(scope, traced, named.name, task);

        for (const cause of own) judged(cause);

        const heard = [...failures, ...nested, ...own];

        if (Option.isSome(traced))
          traced.value(
            OwnerRecord.Report({
              owner: named.name,
              parent: named.parent,
              heardBy: by,
              causes: heard.length,
            }),
          );

        hear(heard);
      }).pipe(
        // A hearer that throws still ends the close, so no closer waits for ever.
        Effect.ensuring(
          Effect.sync(() => {
            closed();
            Deferred.doneUnsafe(done, Exit.void);
          }),
        ),
      ),
    );

    return done;
  };

  const owner: Held = {
    fork: (key, work, onEnding) => forkJudged(key, work, (ending) => onEnding(ending)),
    forkWhole: (key, work, onExit) => forkJudged(key, work, (_, exit) => onExit(exit)),
    cancel: (key) => {
      // oxlint-disable-next-line lint-bomb/no-unsafe-fiber-methods -- a cancel interrupts at once; the task's own judgement settles it
      for (const fiber of Option.toArray(FiberMap.getUnsafe(tasks, key))) fiber.interruptUnsafe();

      for (const child of children) child.cancel(key);
    },
    child: (name) => {
      const made = build(
        scope,
        context,
        judged,
        { name: `${named.name}/${name}`, parent: Option.some(named.name) },
        traced,
        () => void children.delete(made),
      );

      if (Phase.$is("Closing")(phase)) made.stop(() => undefined);
      else children.add(made);

      return made;
    },
    finalize: (cleanup) =>
      // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- construct() is synchronous; an Owner registers its cleanups as the host builds
      Effect.runSync(Scope.addFinalizer(scope, Effect.sync(cleanup))),
    stop: (hear) => void stop(hear, "closer"),
    end: (hear) => Deferred.await(stop(hear, "closer")),
    close: stop,
  };

  return owner;
};

/**
 * An Owner of host tasks: see {@link makeOwner}.
 */
export type Owner = {
  readonly fork: <A, E>(
    key: string,
    work: Effect.Effect<A, E>,
    onEnding: (ending: Ending<A>) => void,
  ) => void;
  // The task's whole Exit, for the one caller whose contract keeps the whole Cause: runPromise.
  readonly forkWhole: <A, E>(
    key: string,
    work: Effect.Effect<A, E>,
    onExit: (exit: Exit.Exit<A, E>) => void,
  ) => void;
  // Interrupts the task under a key, in this Owner or any nested one.
  readonly cancel: (key: string) => void;
  // An Owner nested in this one, named under this one's name.
  readonly child: (name: string) => Owner;
  readonly finalize: (cleanup: () => void) => void;
  // Starts the close, heard by `hear` unless another close started first.
  readonly stop: (hear: Hear) => void;
  // Starts the close as `stop` does, and waits for it.
  readonly end: (hear: Hear) => Effect.Effect<void>;
};

/**
 * Runs an Effect on the Runtime's services and scheduler as a fiber no Owner holds, so no close
 * interrupts it: the Runtime's own close and its timed wait.
 */
export const detach = <A, E>(
  effect: Effect.Effect<A, E>,
  context: () => Context.Context<never>,
) => {
  const services = context();

  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the host boundary runs the Runtime's close as its own fiber
  return Effect.runForkWith(services)(effect, {
    scheduler: Context.get(services, Scheduler.Scheduler),
  });
};

/**
 * Waits for a detached fiber at most `bound`, never interrupting it: its Exit, or none once the
 * bound passed. A fiber that already ended is read without a timer, so a close with nothing to
 * wait for stays synchronous.
 */
export const waitAtMost = <A, E>(fiber: Fiber.Fiber<A, E>, bound: Duration.Duration) =>
  Option.match(
    // oxlint-disable-next-line lint-bomb/no-unsafe-fiber-methods -- a fiber that already ended is read without a timer
    Option.fromUndefinedOr(fiber.pollUnsafe()),
    {
      onSome: (exit) => Effect.succeed(Option.some(exit)),
      onNone: () => Fiber.await(fiber).pipe(Effect.timeoutOption(bound)),
    },
  );

/**
 * Closes a Scope that holds no tasks (the services' root), judged by the rule every task's cleanup
 * is: the failures its finalizers left, none for a pure interrupt.
 */
export const releaseScope = (scope: Scope.Closeable) =>
  Effect.map(Effect.exit(Scope.close(scope, Exit.void)), (released) =>
    Exit.isFailure(released) ? Option.toArray(cleanupOf(released.cause)) : [],
  );

/**
 * {@link releaseScope}, told to a dev trace as the Owner's task `scope`: started, then `Died` with a
 * failed cleanup when a finalizer failed (a finalizer has no typed error), else `Done`.
 */
export const releaseTraced = (
  scope: Scope.Closeable,
  traced: Traced,
  owner: string,
  task: number,
) => {
  const record = (phase: Extract<OwnerRecord, { _tag: "Task" }>["phase"], failed: boolean) => {
    if (Option.isSome(traced))
      traced.value(OwnerRecord.Task({ owner, task, key: "scope", phase, failed }));
  };

  return Effect.suspend(() => {
    record("started", false);

    return Effect.tap(releaseScope(scope), (own) =>
      Effect.sync(() => record(own.length > 0 ? "Died" : "Done", own.length > 0)),
    );
  });
};

/**
 * Where the failures heard by the Runtime's own close go: into its rejection while it waits, to the
 * host's report once it has stopped waiting.
 */
type Hearing = Data.TaggedEnum<{
  // FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it threw.
  Waiting: { failures: ReadonlyArray<Cause.Cause<unknown>> };
  Late: {};
}>;

const Hearing = Data.taggedEnum<Hearing>();

/**
 * The Runtime's report of failed cleanups: `hear` collects them while dispose waits; `late` ends
 * the wait, returning what was collected, and every later failure goes to `report`.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a cleanup fails with whatever it threw.
export const makeRuntimeReport = (report: (cause: Cause.Cause<unknown>) => void) => {
  let hearing: Hearing = Hearing.Waiting({ failures: [] });

  return {
    hear: ((found) => {
      if (found.length === 0) return;

      hearing = Hearing.$match(hearing, {
        Waiting: ({ failures }) => Hearing.Waiting({ failures: [...failures, ...found] }),
        Late: (late) => {
          for (const cause of found) report(cause);

          return late;
        },
      });
    }) satisfies Hear,
    collected: () =>
      Hearing.$match(hearing, { Waiting: ({ failures }) => failures, Late: () => [] }),
    late: () => {
      const collected = Hearing.$match(hearing, {
        Waiting: ({ failures }) => failures,
        Late: () => [],
      });

      hearing = Hearing.Late();

      return collected;
    },
  };
};

/**
 * The Runtime's report of failed cleanups.
 */
export type RuntimeReport = ReturnType<typeof makeRuntimeReport>;

/**
 * Sleeps on a Clock until an instant, read now: at once when it has passed.
 */
export const sleepUntil = (clock: Clock.Clock, at: number) =>
  Effect.sleep(Duration.millis(Math.max(0, at - clock.currentTimeMillisUnsafe())));
