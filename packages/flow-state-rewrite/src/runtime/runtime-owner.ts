import { Cause, Deferred, Effect, Exit, Fiber, Layer, Scope, SynchronizedRef } from "effect";

type RuntimeOwnerOptions<
  LayerOutput,
  LayerError,
  LayerRequirements,
  A,
  ExposureError,
  ExposureRequirements,
  CloseError = LayerError | ExposureError,
> = {
  layer: Layer.Layer<LayerOutput, LayerError, LayerRequirements>;
  expose: Effect.Effect<A, ExposureError, ExposureRequirements>;
  close?: Effect.Effect<void, CloseError>;
};

type RuntimeOwnerExternalRequirements<LayerRequirements, ProvidedServices, ExposureRequirements> =
  | LayerRequirements
  | Exclude<Exclude<ExposureRequirements, ProvidedServices>, Scope.Scope>;

type RuntimeOwnerReadyError<LayerError, ExposureError> = LayerError | ExposureError;

type RuntimeOwnerError<LayerError, ExposureError, CloseError> =
  | LayerError
  | ExposureError
  | CloseError;

type RuntimeOwnerStarting<A, ReadyError> = {
  _tag: "starting";
  ready: Deferred.Deferred<Exit.Exit<A, ReadyError>>;
  scope: Scope.Closeable | undefined;
  fiber: Fiber.Fiber<unknown, unknown> | undefined;
  scopeClosed: boolean;
};

type RuntimeOwnerClosing<A, ReadyError, OwnerError> = {
  _tag: "closing";
  ready: Deferred.Deferred<Exit.Exit<A, ReadyError>>;
  close: Deferred.Deferred<Exit.Exit<void, OwnerError>>;
  starting?: RuntimeOwnerStarting<A, ReadyError>;
  readyExit: Exit.Exit<A, ReadyError> | undefined;
  includeReadyFailure: boolean;
  scope: Scope.Closeable | undefined;
  scopeClosed: boolean;
};

type RuntimeOwnerState<A, ReadyError, OwnerError> =
  | { _tag: "cold" }
  | RuntimeOwnerStarting<A, ReadyError>
  | {
      _tag: "ready";
      readyExit: Exit.Exit<A, ReadyError>;
      scope: Scope.Closeable;
      scopeClosed: boolean;
    }
  | {
      _tag: "failed";
      readyExit: Exit.Exit<A, ReadyError>;
      retainFailureOnClose: boolean;
    }
  | RuntimeOwnerClosing<A, ReadyError, OwnerError>
  | {
      _tag: "closed";
      readyExit: Exit.Exit<A, ReadyError>;
      closeExit: Exit.Exit<void, OwnerError>;
    }
  | {
      _tag: "close-failed";
      readyExit: Exit.Exit<A, ReadyError>;
      closeExit: Exit.Exit<void, OwnerError>;
      includeReadyFailure: boolean;
      scope: Scope.Closeable | undefined;
      scopeClosed: boolean;
    };

const resolveExit = <A, E>(exit: Exit.Exit<A, E>) => exit;

const appendCause = <Error>(current: Cause.Cause<Error> | undefined, next: Cause.Cause<Error>) =>
  current === undefined
    ? Cause.fromReasons([...next.reasons])
    : Cause.fromReasons([...current.reasons, ...next.reasons]);

const makeRuntimeOwner = <
  LayerOutput,
  LayerError,
  LayerRequirements,
  A,
  ExposureError,
  ExposureRequirements,
  CloseError = LayerError | ExposureError,
>(
  options: RuntimeOwnerOptions<
    LayerOutput,
    LayerError,
    LayerRequirements,
    A,
    ExposureError,
    ExposureRequirements,
    CloseError
  >,
) => {
  type ReadyError = RuntimeOwnerReadyError<LayerError, ExposureError>;

  type OwnerError = RuntimeOwnerError<LayerError, ExposureError, CloseError>;

  type ReadyRequirements = RuntimeOwnerExternalRequirements<
    LayerRequirements,
    LayerOutput,
    ExposureRequirements
  >;

  const state = SynchronizedRef.makeUnsafe<RuntimeOwnerState<A, ReadyError, OwnerError>>({
    _tag: "cold",
  });

  const currentState = () => SynchronizedRef.getUnsafe(state);

  const closeOwnedScope = (
    owner: RuntimeOwnerStarting<A, ReadyError> | RuntimeOwnerClosing<A, ReadyError, OwnerError>,
    exit: Exit.Exit<unknown, unknown>,
  ) => {
    if (owner.scope === undefined || owner.scopeClosed) return Effect.succeed(Exit.void);

    owner.scopeClosed = true;

    return Effect.exit(Scope.close(owner.scope, exit));
  };

  const bootstrap = (starting: RuntimeOwnerStarting<A, ReadyError>) =>
    Effect.gen(function* () {
      const scope = yield* Scope.make("sequential");
      const fiber = yield* Effect.fiber;
      starting.scope = scope;
      starting.fiber = fiber;

      const current = currentState();

      if (current !== starting && !(current._tag === "closing" && current.starting === starting))
        return yield* Effect.interrupt;

      const acquired = yield* Layer.buildWithScope(options.layer, scope).pipe(
        Effect.onExit((exit) =>
          Exit.isFailure(exit) ? closeOwnedScope(starting, exit).pipe(Effect.asVoid) : Effect.void,
        ),
      );

      if (currentState() !== starting) return yield* Effect.interrupt;

      const exposed = yield* Effect.suspend(() =>
        currentState() === starting
          ? Scope.provide(scope)(Effect.provideContext(acquired)(options.expose))
          : Effect.interrupt,
      );

      return exposed;
    });

  const settleReady = (
    starting: RuntimeOwnerStarting<A, ReadyError>,
    exit: Exit.Exit<A, ReadyError>,
  ) =>
    Effect.uninterruptible(
      Effect.gen(function* () {
        const scopeExit = Exit.isFailure(exit) ? yield* closeOwnedScope(starting, exit) : Exit.void;

        const readyExit =
          Exit.isFailure(exit) && Exit.isFailure(scopeExit)
            ? Exit.failCause(
                appendCause(
                  exit.cause,
                  // SAFETY: Scope.close has no typed failure channel; its Cause is retained as the owner's readiness Cause.
                  scopeExit.cause as Cause.Cause<ReadyError>,
                ),
              )
            : exit;

        yield* SynchronizedRef.update(state, (current) => {
          if (current === starting) {
            const settled: RuntimeOwnerState<A, ReadyError, OwnerError> = Exit.isSuccess(readyExit)
              ? { _tag: "ready", readyExit, scope: starting.scope!, scopeClosed: false }
              : {
                  _tag: "failed",
                  readyExit,
                  retainFailureOnClose: Cause.hasInterrupts(readyExit.cause),
                };

            return settled;
          }

          if (current._tag === "closing" && current.starting === starting) {
            current.readyExit = readyExit;
            current.scope = starting.scope;
            current.scopeClosed = starting.scopeClosed;
          }

          return current;
        });

        yield* Deferred.succeed(starting.ready, readyExit);

        return readyExit;
      }),
    );

  const readyLeader = (starting: RuntimeOwnerStarting<A, ReadyError>) =>
    bootstrap(starting).pipe(
      Effect.onExit((exit) => settleReady(starting, exit).pipe(Effect.asVoid)),
    );

  const awaitStartingOwner = (closing: RuntimeOwnerClosing<A, ReadyError, OwnerError>) =>
    Effect.gen(function* () {
      const starting = closing.starting;
      const currentFiber = yield* Effect.fiber;

      if (starting?.fiber !== undefined && starting.fiber !== currentFiber) {
        yield* Fiber.interrupt(starting.fiber);
        yield* Fiber.await(starting.fiber);
      }

      if (starting !== undefined) {
        const readyExit = yield* Deferred.await(starting.ready);
        closing.readyExit = readyExit;
        closing.scope = starting.scope;
        closing.scopeClosed = starting.scopeClosed;
      }
    });

  const closeResources = (closing: RuntimeOwnerClosing<A, ReadyError, OwnerError>) =>
    Effect.gen(function* () {
      let cleanupCause: Cause.Cause<OwnerError> | undefined;
      const readyExit = closing.readyExit;

      if (closing.includeReadyFailure && readyExit !== undefined && Exit.isFailure(readyExit))
        cleanupCause = readyExit.cause;

      if (options.close !== undefined) {
        const closeExit = yield* Effect.exit(options.close);

        if (Exit.isFailure(closeExit)) cleanupCause = appendCause(cleanupCause, closeExit.cause);
      }

      if (closing.scope !== undefined && !closing.scopeClosed) {
        closing.scopeClosed = true;
        const scopeExit = yield* Effect.exit(Scope.close(closing.scope, Exit.void));

        if (Exit.isFailure(scopeExit))
          cleanupCause = appendCause(
            cleanupCause,
            // SAFETY: Scope.close has no typed failure channel; its Cause is retained as the owner's cleanup Cause.
            scopeExit.cause as Cause.Cause<OwnerError>,
          );
      }

      return cleanupCause;
    });

  const settleClosing = (
    closing: RuntimeOwnerClosing<A, ReadyError, OwnerError>,
    cleanupCause: Cause.Cause<OwnerError> | undefined,
  ) =>
    Effect.gen(function* () {
      const readyExit = closing.readyExit;

      const closeExit: Exit.Exit<void, OwnerError> =
        cleanupCause === undefined ? Exit.void : Exit.failCause(cleanupCause);

      const retainedReadyExit =
        readyExit ??
        Exit.failCause(
          Cause.die(new Error("Runtime owner was closed before readiness was requested")),
        );

      yield* Deferred.succeed(closing.ready, retainedReadyExit);
      yield* SynchronizedRef.set(
        state,
        Exit.isSuccess(closeExit)
          ? {
              _tag: "closed",
              readyExit: retainedReadyExit,
              closeExit,
            }
          : {
              _tag: "close-failed",
              readyExit: retainedReadyExit,
              closeExit,
              includeReadyFailure: closing.includeReadyFailure,
              scope: closing.scope,
              scopeClosed: closing.scopeClosed,
            },
      );
      yield* Deferred.succeed(closing.close, closeExit);

      return yield* resolveExit(closeExit);
    });

  const closeLeader = (closing: RuntimeOwnerClosing<A, ReadyError, OwnerError>) =>
    Effect.uninterruptible(
      Effect.gen(function* () {
        yield* awaitStartingOwner(closing);
        const cleanupCause = yield* closeResources(closing);

        return yield* settleClosing(closing, cleanupCause);
      }),
    );

  // RETURN_TYPE: Keeps Layer output and the owner Scope out of callers' requirements while preserving unprovided Layer and exposure services.
  const ready = (): Effect.Effect<A, ReadyError, ReadyRequirements> =>
    SynchronizedRef.modify(state, (current) => {
      switch (current._tag) {
        case "cold": {
          const starting: RuntimeOwnerStarting<A, ReadyError> = {
            _tag: "starting",
            ready: Deferred.makeUnsafe<Exit.Exit<A, ReadyError>>(),
            scope: undefined,
            fiber: undefined,
            scopeClosed: false,
          };

          return [readyLeader(starting), starting] as const;
        }

        case "starting":
          return [
            Deferred.await(current.ready).pipe(Effect.flatMap(resolveExit)),
            current,
          ] as const;
        case "ready":
        case "failed":
          return [resolveExit(current.readyExit), current] as const;
        case "closing":
          return [
            Deferred.await(current.ready).pipe(Effect.flatMap(resolveExit)),
            current,
          ] as const;
        case "closed":
        case "close-failed":
          return [resolveExit(current.readyExit), current] as const;
      }
    }).pipe(Effect.flatMap((effect) => effect));

  const close = () =>
    SynchronizedRef.modify(state, (current) => {
      if (current._tag === "closed") return [resolveExit(current.closeExit), current] as const;

      if (current._tag === "closing")
        return [Deferred.await(current.close).pipe(Effect.flatMap(resolveExit)), current] as const;

      const closeDeferred = Deferred.makeUnsafe<Exit.Exit<void, OwnerError>>();

      if (current._tag === "cold") {
        const closing: RuntimeOwnerClosing<A, ReadyError, OwnerError> = {
          _tag: "closing",
          ready: Deferred.makeUnsafe<Exit.Exit<A, ReadyError>>(),
          close: closeDeferred,
          includeReadyFailure: false,
          readyExit: undefined,
          scope: undefined,
          scopeClosed: false,
        };

        return [closeLeader(closing), closing] as const;
      }

      if (current._tag === "starting") {
        const closing: RuntimeOwnerClosing<A, ReadyError, OwnerError> = {
          _tag: "closing",
          ready: current.ready,
          close: closeDeferred,
          starting: current,
          includeReadyFailure: true,
          readyExit: undefined,
          scope: current.scope,
          scopeClosed: current.scopeClosed,
        };

        return [closeLeader(closing), closing] as const;
      }

      if (current._tag === "close-failed") {
        const closing: RuntimeOwnerClosing<A, ReadyError, OwnerError> = {
          _tag: "closing",
          ready: Deferred.makeUnsafe<Exit.Exit<A, ReadyError>>(),
          close: closeDeferred,
          readyExit: current.readyExit,
          includeReadyFailure: current.includeReadyFailure,
          scope: current.scope,
          scopeClosed: current.scopeClosed,
        };

        return [closeLeader(closing), closing] as const;
      }

      const closing: RuntimeOwnerClosing<A, ReadyError, OwnerError> = {
        _tag: "closing",
        ready: Deferred.makeUnsafe<Exit.Exit<A, ReadyError>>(),
        close: closeDeferred,
        readyExit: current.readyExit,
        includeReadyFailure: current._tag === "failed" ? current.retainFailureOnClose : false,
        scope: current._tag === "ready" ? current.scope : undefined,
        scopeClosed: current._tag === "ready" ? current.scopeClosed : true,
      };

      return [closeLeader(closing), closing] as const;
    }).pipe(Effect.flatMap((effect) => effect));

  return { ready, close };
};

export { makeRuntimeOwner };
