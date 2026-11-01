import { Cause, Data, Deferred, Effect, Exit, Fiber, Option, Scope, SynchronizedRef } from "effect";

import { Failure, type PublicDiagnostic } from "../diagnostic/diagnostic.js";

type Cleanup<Error> = Effect.Effect<void, Error>;

// oxlint-disable-next-line anti-slop/no-readonly -- A registration keeps its stable token and disposal capability paired.
type Registration<Error> = Readonly<{
  token: symbol;
  dispose: () => Cleanup<Error>;
}>;

// oxlint-disable-next-line anti-slop/no-readonly -- Shell phase values are immutable snapshots; transitions replace the synchronized state atomically.
type ShellFields<Error> = Readonly<{
  // oxlint-disable-next-line anti-slop/no-readonly -- Shell phase values are immutable snapshots; transitions replace the synchronized state atomically.
  actors: readonly Registration<Error>[];
  // oxlint-disable-next-line anti-slop/no-readonly -- Shell phase values are immutable snapshots; transitions replace the synchronized state atomically.
  providers: readonly Cleanup<Error>[];
}>;

type Starting<Ready, ReadyError, CloseError> = ShellFields<CloseError> &
  // oxlint-disable-next-line anti-slop/no-readonly -- Shell phase values are immutable snapshots; transitions replace the synchronized state atomically.
  Readonly<{
    _tag: "starting";
    completion: Deferred.Deferred<Exit.Exit<Ready, ReadyError | PublicDiagnostic>>;
    fiber: Effect.Success<typeof Effect.fiber>;
  }>;

type Closing<Ready, ReadyError, CloseError> = ShellFields<CloseError> &
  // oxlint-disable-next-line anti-slop/no-readonly -- Shell phase values are immutable snapshots; transitions replace the synchronized state atomically.
  Readonly<{
    _tag: "closing";
    completion: Deferred.Deferred<Exit.Exit<void, ReadyError | CloseError | PublicDiagnostic>>;
    readyExit: Exit.Exit<Ready, ReadyError | PublicDiagnostic>;
    starting: Option.Option<Starting<Ready, ReadyError, CloseError>>;
    bootstrapCleanupExit: Option.Option<Exit.Exit<void>>;
    acceptingActors: boolean;
    lateRegistrationCount: number;
    includeReadyFailure: boolean;
  }>;

type ShellState<Ready, ReadyError, CloseError> =
  // oxlint-disable-next-line anti-slop/no-readonly -- Shell phase values are immutable snapshots; transitions replace the synchronized state atomically.
  | (ShellFields<CloseError> & Readonly<{ _tag: "cold" }>)
  | Starting<Ready, ReadyError, CloseError>
  | (ShellFields<CloseError> &
      // oxlint-disable-next-line anti-slop/no-readonly -- Shell phase values are immutable snapshots; transitions replace the synchronized state atomically.
      Readonly<{
        _tag: "ready" | "failed";
        readyExit: Exit.Exit<Ready, ReadyError | PublicDiagnostic>;
      }>)
  | Closing<Ready, ReadyError, CloseError>
  | (ShellFields<CloseError> &
      // oxlint-disable-next-line anti-slop/no-readonly -- Shell phase values are immutable snapshots; transitions replace the synchronized state atomically.
      Readonly<{
        _tag: "closed";
        readyExit: Exit.Exit<Ready, ReadyError | PublicDiagnostic>;
        closeExit: Exit.Exit<void, ReadyError | CloseError | PublicDiagnostic>;
      }>);

type ReadyAction<Ready, ReadyError, CloseError> = Data.TaggedEnum<{
  leader: { starting: Starting<Ready, ReadyError, CloseError> };
  wait: { completion: Deferred.Deferred<Exit.Exit<Ready, ReadyError | PublicDiagnostic>> };
  exit: { exit: Exit.Exit<Ready, ReadyError | PublicDiagnostic> };
}>;

interface ReadyActionDef extends Data.TaggedEnum.WithGenerics<3> {
  // oxlint-disable-next-line anti-slop/no-readonly -- Data.TaggedEnum.WithGenerics requires this readonly generic mapping hook.
  readonly taggedEnum: ReadyAction<this["A"], this["B"], this["C"]>;
}

const readyAction = Data.taggedEnum<ReadyActionDef>();

type CloseAction<Ready, ReadyError, CloseError> = Data.TaggedEnum<{
  leader: { closing: Closing<Ready, ReadyError, CloseError> };
  wait: {
    completion: Deferred.Deferred<Exit.Exit<void, ReadyError | CloseError | PublicDiagnostic>>;
  };
  exit: { exit: Exit.Exit<void, ReadyError | CloseError | PublicDiagnostic> };
}>;

interface CloseActionDef extends Data.TaggedEnum.WithGenerics<3> {
  // oxlint-disable-next-line anti-slop/no-readonly -- Data.TaggedEnum.WithGenerics requires this readonly generic mapping hook.
  readonly taggedEnum: CloseAction<this["A"], this["B"], this["C"]>;
}

const closeAction = Data.taggedEnum<CloseActionDef>();

// oxlint-disable-next-line anti-slop/no-readonly -- The registration result keeps its acceptance decision and unregister capability paired.
export type RuntimeRegistration = Readonly<{
  accepted: boolean;
  unregister(): Effect.Effect<void>;
}>;

export interface FlowRuntimeShell<Ready, ReadyError, CloseError> {
  // oxlint-disable-next-line anti-slop/no-readonly -- The shell exposes readiness as a fixed capability, not a replaceable owner field.
  readonly ready: Effect.Effect<Ready, ReadyError | PublicDiagnostic>;
  registerActor(participant: {
    dispose(): Cleanup<CloseError>;
  }): Effect.Effect<RuntimeRegistration>;
  registerProvider(release: Cleanup<CloseError>): Effect.Effect<boolean>;
  isOpen(): Effect.Effect<boolean>;
  close(): Effect.Effect<void, ReadyError | CloseError | PublicDiagnostic>;
}

const disposed = () =>
  Failure({
    code: "RuntimeDisposed",
    path: [],
    details: {},
    summary: "Runtime is disposed",
    help: "Construct a new runtime.",
  });

// oxlint-disable-next-line anti-slop/no-readonly -- Cause aggregation inspects exit values without mutating the caller-owned list.
const combineCauses = <Value, Error>(exits: readonly Exit.Exit<Value, Error>[]) => {
  const reasons = exits.flatMap((exit) => (Exit.isFailure(exit) ? [...exit.cause.reasons] : []));

  return reasons.length === 0 ? undefined : Cause.fromReasons(reasons);
};

/** A closing shell admits a finite chain of participants created by participant disposal. */
const maxLateRegistrations = 2_048;

type ShellOptions<Ready, ReadyError, CloseError> =
  | { bootstrap(scope: Scope.Closeable): Effect.Effect<Ready, ReadyError> }
  | {
      bootstrap(scope: Scope.Closeable): Effect.Effect<Ready, ReadyError>;
      quiesce: Cleanup<CloseError>;
      drain: Cleanup<CloseError>;
      ownerClose: Cleanup<CloseError>;
    };

/** One lifecycle value owns registration, readiness, and terminal cleanup. */
// RETURN_TYPE: Keeps the stable internal shell port while inferred hook absence widens method channels.
export const makeFlowRuntimeShell = <Ready, ReadyError, CloseError>(
  options: ShellOptions<Ready, ReadyError, CloseError>,
): FlowRuntimeShell<Ready, ReadyError, CloseError> => {
  const workScope = Scope.makeUnsafe("sequential");
  const cleanupScope = Scope.makeUnsafe("sequential");

  const state = SynchronizedRef.makeUnsafe<ShellState<Ready, ReadyError, CloseError>>({
    _tag: "cold",
    actors: [],
    providers: [],
  });

  const awaitExit = <Value, Error>(exit: Exit.Exit<Value, Error>) => exit;

  const settleReady = (
    starting: Starting<Ready, ReadyError, CloseError>,
    exit: Exit.Exit<Ready, ReadyError>,
  ) =>
    Effect.gen(function* () {
      const scopeExit = Exit.isFailure(exit)
        ? yield* Effect.exit(Scope.close(workScope, exit))
        : Exit.void;

      const combined = combineCauses<Ready | void, ReadyError | PublicDiagnostic>([
        exit,
        // Scope finalizers have no typed error channel; defects and interruptions still belong to the cached Cause.
        scopeExit,
      ]);

      const readyExit: Exit.Exit<Ready, ReadyError | PublicDiagnostic> =
        combined === undefined ? exit : Exit.failCause(combined);

      yield* SynchronizedRef.update(state, (current) => {
        if (current._tag === "closing") {
          if (Option.isSome(current.starting) && current.starting.value === starting)
            return { ...current, bootstrapCleanupExit: Option.some(scopeExit) };

          return current;
        }

        if (current !== starting) return current;

        const settled: ShellState<Ready, ReadyError, CloseError> = {
          _tag: Exit.isSuccess(readyExit) ? "ready" : "failed",
          actors: current.actors,
          providers: current.providers,
          readyExit,
        };

        return settled;
      });
      yield* Deferred.succeed(starting.completion, readyExit);
    });

  const ready = Effect.gen(function* () {
    const fiber = yield* Effect.fiber;

    const action = yield* SynchronizedRef.modify(
      state,
      // RETURN_TYPE: The claim has three action variants while the state keeps six precise phases.
      (
        current,
        // oxlint-disable-next-line anti-slop/no-readonly -- The synchronized transition returns an immutable action/state pair rather than a mutable tuple.
      ): readonly [
        ReadyAction<Ready, ReadyError, CloseError>,
        ShellState<Ready, ReadyError, CloseError>,
      ] => {
        if (current._tag === "cold") {
          const starting: Starting<Ready, ReadyError, CloseError> = {
            ...current,
            _tag: "starting",
            completion: Deferred.makeUnsafe(),
            fiber,
          };

          return [readyAction.leader({ starting }), starting] as const;
        }

        if (current._tag === "starting")
          return [readyAction.wait({ completion: current.completion }), current] as const;

        return [readyAction.exit({ exit: current.readyExit }), current] as const;
      },
    );

    if (action._tag === "exit") return yield* awaitExit(action.exit);

    if (action._tag === "wait")
      return yield* Deferred.await(action.completion).pipe(Effect.flatMap(awaitExit));

    yield* Effect.suspend(() => options.bootstrap(workScope)).pipe(
      Effect.onExit((exit) => settleReady(action.starting, exit)),
      Effect.exit,
    );

    return yield* Deferred.await(action.starting.completion).pipe(Effect.flatMap(awaitExit));
  });

  const registerActor = (participant: { dispose(): Cleanup<CloseError> }) =>
    SynchronizedRef.modify(
      state,
      // RETURN_TYPE: Both acceptance branches return the same registration port and a complete state value as one atomic pair.
      (
        current,
      ): // oxlint-disable-next-line anti-slop/no-readonly -- SynchronizedRef.modify consumes this action/state tuple as one transition result.
      readonly [RuntimeRegistration, ShellState<Ready, ReadyError, CloseError>] => {
        const accepted =
          current._tag === "cold" ||
          current._tag === "starting" ||
          current._tag === "ready" ||
          (current._tag === "closing" &&
            current.acceptingActors &&
            current.lateRegistrationCount < maxLateRegistrations);

        if (!accepted)
          return [{ accepted: false, unregister: () => Effect.void }, current] as const;

        const token = Symbol();

        const registration: Registration<CloseError> = {
          token,
          dispose: () => participant.dispose(),
        };

        const unregister = () =>
          SynchronizedRef.update(state, (registered) => ({
            ...registered,
            actors: registered.actors.filter((entry) => entry.token !== token),
          }));

        const updated: ShellState<Ready, ReadyError, CloseError> =
          current._tag === "closing"
            ? {
                ...current,
                actors: [...current.actors, registration],
                lateRegistrationCount: current.lateRegistrationCount + 1,
              }
            : { ...current, actors: [...current.actors, registration] };

        return [{ accepted: true, unregister }, updated] as const;
      },
    );

  const registerProvider = (release: Cleanup<CloseError>) =>
    SynchronizedRef.modify(state, (current) => {
      if (current._tag === "failed" || current._tag === "closing" || current._tag === "closed")
        return [false, current] as const;

      return [true, { ...current, providers: [...current.providers, release] }] as const;
    });

  const takeActors = () =>
    SynchronizedRef.modify(state, (current) => {
      if (current._tag !== "closing") {
        const empty: Registration<CloseError>[] = [];

        return [empty, current] as const;
      }

      return [current.actors, { ...current, actors: [] }] as const;
    });

  const disposeActors = Effect.gen(function* () {
    const exits: Exit.Exit<void, CloseError>[] = [];

    for (;;) {
      const actors = yield* takeActors();

      if (actors.length === 0) return exits;

      for (let index = actors.length - 1; index >= 0; index -= 1) {
        exits.push(yield* Effect.exit(Effect.suspend(() => actors[index]!.dispose())));
      }
    }
  });

  const interruptBootstrap = (closing: Closing<Ready, ReadyError, CloseError>) =>
    Effect.gen(function* () {
      if (Option.isNone(closing.starting)) return Exit.void;

      yield* Fiber.interrupt(closing.starting.value.fiber);
      const current = yield* SynchronizedRef.get(state);

      return current._tag === "closing" && Option.isSome(current.bootstrapCleanupExit)
        ? current.bootstrapCleanupExit.value
        : Exit.void;
    });

  const closeWorker = (closing: Closing<Ready, ReadyError, CloseError>) =>
    Effect.gen(function* () {
      const exits: Exit.Exit<void | Ready, ReadyError | CloseError | PublicDiagnostic>[] = [
        yield* interruptBootstrap(closing),
      ];

      if ("quiesce" in options) exits.push(yield* Effect.exit(options.quiesce));
      exits.push(...(yield* disposeActors));

      if ("drain" in options) exits.push(yield* Effect.exit(options.drain));

      // A participant can register another participant during disposal. Keep accepting up to
      // the owner bound until one atomic empty check closes the window.
      for (;;) {
        exits.push(...(yield* disposeActors));

        const closedWindow = yield* SynchronizedRef.modify(state, (current) => {
          if (current._tag !== "closing") return [true, current] as const;

          if (current.actors.length > 0) return [false, current] as const;

          return [true, { ...current, acceptingActors: false }] as const;
        });

        if (closedWindow) break;
      }

      const providers = yield* SynchronizedRef.modify(state, (current) => {
        if (current._tag !== "closing") {
          const empty: Cleanup<CloseError>[] = [];

          return [empty, current] as const;
        }

        return [current.providers, { ...current, providers: [] }] as const;
      });

      for (let index = providers.length - 1; index >= 0; index -= 1) {
        exits.push(yield* Effect.exit(providers[index]!));
      }

      if ("ownerClose" in options) exits.push(yield* Effect.exit(options.ownerClose));
      exits.push(yield* Effect.exit(Scope.close(workScope, closing.readyExit)));
      exits.push(yield* Effect.exit(Scope.close(cleanupScope, Exit.void)));

      // A failed readiness result is retained when close follows an already failed shell.
      if (closing.includeReadyFailure && Exit.isFailure(closing.readyExit))
        exits.unshift(closing.readyExit);

      const cause = combineCauses(exits);

      const closeExit: Exit.Exit<void, ReadyError | CloseError | PublicDiagnostic> =
        cause === undefined ? Exit.void : Exit.failCause(cause);

      yield* SynchronizedRef.update(state, (current) => {
        if (current._tag !== "closing") return current;

        const settled: ShellState<Ready, ReadyError, CloseError> = {
          _tag: "closed",
          actors: current.actors,
          providers: current.providers,
          readyExit: current.readyExit,
          closeExit,
        };

        return settled;
      });
      yield* Deferred.succeed(closing.completion, closeExit);
    });

  const close = () =>
    Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const action = yield* SynchronizedRef.modify(
          state,
          // RETURN_TYPE: The close claim returns one of leader, waiter, or cached Exit without widening the phase state.
          (
            current,
            // oxlint-disable-next-line anti-slop/no-readonly -- The synchronized transition returns an immutable action/state pair rather than a mutable tuple.
          ): readonly [
            CloseAction<Ready, ReadyError, CloseError>,
            ShellState<Ready, ReadyError, CloseError>,
          ] => {
            if (current._tag === "closed")
              return [closeAction.exit({ exit: current.closeExit }), current] as const;

            if (current._tag === "closing")
              return [closeAction.wait({ completion: current.completion }), current] as const;

            const readyExit =
              current._tag === "cold" || current._tag === "starting"
                ? Exit.fail(disposed())
                : current.readyExit;

            const closing: Closing<Ready, ReadyError, CloseError> = {
              ...current,
              _tag: "closing",
              readyExit,
              completion: Deferred.makeUnsafe(),
              starting: current._tag === "starting" ? Option.some(current) : Option.none(),
              bootstrapCleanupExit: Option.none(),
              acceptingActors: current._tag !== "failed",
              lateRegistrationCount: 0,
              includeReadyFailure: current._tag === "failed",
            };

            return [closeAction.leader({ closing }), closing] as const;
          },
        );

        if (action._tag === "exit") return yield* restore(awaitExit(action.exit));

        if (action._tag === "leader") {
          if (Option.isSome(action.closing.starting))
            yield* Deferred.succeed(
              action.closing.starting.value.completion,
              action.closing.readyExit,
            );
          yield* Effect.forkIn(closeWorker(action.closing), cleanupScope, {
            startImmediately: true,
            uninterruptible: false,
          });
        }

        const completion = action._tag === "leader" ? action.closing.completion : action.completion;

        return yield* restore(Deferred.await(completion).pipe(Effect.flatMap(awaitExit)));
      }),
    );

  return {
    ready,
    registerActor,
    registerProvider,
    isOpen: () =>
      SynchronizedRef.get(state).pipe(Effect.map((current) => current._tag === "ready")),
    close,
  };
};
