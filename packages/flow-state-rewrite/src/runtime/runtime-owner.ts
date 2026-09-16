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
  drain?: Effect.Effect<void, CloseError>;
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

type RuntimeCloseActor<OwnerError> = {
  participant: { dispose: () => Effect.Effect<void, OwnerError> };
  active: boolean;
};

type RuntimeOwnerStateFields<OwnerError> = {
  actors: RuntimeCloseActor<OwnerError>[];
  providers: Array<Effect.Effect<void, OwnerError>>;
  acceptingActors: boolean;
  acceptingProviders: boolean;
  scope: Scope.Closeable | undefined;
  scopeClosed: boolean;
};

type RuntimeOwnerStarting<A, ReadyError, OwnerError> = RuntimeOwnerStateFields<OwnerError> & {
  _tag: "starting";
  ready: Deferred.Deferred<Exit.Exit<A, ReadyError>>;
  fiber: Fiber.Fiber<unknown, unknown> | undefined;
};

type RuntimeOwnerClosing<A, ReadyError, OwnerError> = RuntimeOwnerStateFields<OwnerError> & {
  _tag: "closing";
  ready: Deferred.Deferred<Exit.Exit<A, ReadyError>>;
  close: Deferred.Deferred<Exit.Exit<void, OwnerError>>;
  starting?: RuntimeOwnerStarting<A, ReadyError, OwnerError>;
  readyExit: Exit.Exit<A, ReadyError> | undefined;
  includeReadyFailure: boolean;
};

export type RuntimeOwnerCloseRegistration = {
  accepted: boolean;
  unregister: () => void;
};

export type RuntimeOwnerCloseRegistry<OwnerError> = {
  registerActor: (participant: {
    dispose: () => Effect.Effect<void, OwnerError>;
  }) => RuntimeOwnerCloseRegistration;
  registerProvider: (release: Effect.Effect<void, OwnerError>) => void;
  isOpen: () => boolean;
};

type RuntimeOwnerState<A, ReadyError, OwnerError> =
  | (RuntimeOwnerStateFields<OwnerError> & { _tag: "cold" })
  | RuntimeOwnerStarting<A, ReadyError, OwnerError>
  | (RuntimeOwnerStateFields<OwnerError> & {
      _tag: "ready";
      readyExit: Exit.Exit<A, ReadyError>;
      scope: Scope.Closeable;
    })
  | (RuntimeOwnerStateFields<OwnerError> & {
      _tag: "failed";
      readyExit: Exit.Exit<A, ReadyError>;
      retainFailureOnClose: boolean;
    })
  | RuntimeOwnerClosing<A, ReadyError, OwnerError>
  | (RuntimeOwnerStateFields<OwnerError> & {
      _tag: "closed";
      readyExit: Exit.Exit<A, ReadyError>;
      closeExit: Exit.Exit<void, OwnerError>;
    });

const resolveExit = <A, E>(exit: Exit.Exit<A, E>) => exit;

const causeFromExits = <Error>(exits: readonly Exit.Exit<unknown, Error>[]) => {
  const reasons = exits.flatMap((exit) => (Exit.isFailure(exit) ? [...exit.cause.reasons] : []));

  return reasons.length === 0 ? undefined : Cause.fromReasons(reasons);
};

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
    actors: [],
    providers: [],
    acceptingActors: true,
    acceptingProviders: true,
    scope: undefined,
    scopeClosed: false,
  });

  const currentState = () => SynchronizedRef.getUnsafe(state);

  const canRegisterCloseActor = () => {
    const current = currentState();

    return (
      current._tag === "cold" ||
      current._tag === "starting" ||
      current._tag === "ready" ||
      current._tag === "failed" ||
      (current._tag === "closing" && current.acceptingActors)
    );
  };

  const registerActor = (participant: {
    dispose: () => Effect.Effect<void, OwnerError>;
  }): RuntimeOwnerCloseRegistration => {
    const accepted = canRegisterCloseActor();
    const registration: RuntimeCloseActor<OwnerError> = { participant, active: accepted };
    const current = currentState();

    if (accepted) current.actors.push(registration);

    return {
      accepted,
      unregister: () => {
        if (!registration.active) return;
        registration.active = false;
        const index = currentState().actors.indexOf(registration);

        if (index >= 0) currentState().actors.splice(index, 1);
      },
    };
  };

  const registerProvider = (release: Effect.Effect<void, OwnerError>) => {
    const current = currentState();

    if (
      current.acceptingProviders &&
      (current._tag === "cold" ||
        current._tag === "starting" ||
        current._tag === "ready" ||
        current._tag === "failed")
    )
      current.providers.push(release);
  };

  const closeOwnedScope = (
    owner:
      | RuntimeOwnerStarting<A, ReadyError, OwnerError>
      | RuntimeOwnerClosing<A, ReadyError, OwnerError>,
    exit: Exit.Exit<unknown, unknown>,
  ) => {
    if (owner.scope === undefined || owner.scopeClosed) return Effect.succeed(Exit.void);

    owner.scopeClosed = true;

    return Effect.exit(Scope.close(owner.scope, exit));
  };

  const bootstrap = (starting: RuntimeOwnerStarting<A, ReadyError, OwnerError>) =>
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
    starting: RuntimeOwnerStarting<A, ReadyError, OwnerError>,
    exit: Exit.Exit<A, ReadyError>,
  ) =>
    Effect.uninterruptible(
      Effect.gen(function* () {
        const scopeExit = Exit.isFailure(exit) ? yield* closeOwnedScope(starting, exit) : Exit.void;

        const readyExit =
          Exit.isFailure(exit) && Exit.isFailure(scopeExit)
            ? Exit.failCause(
                causeFromExits([
                  exit,
                  // SAFETY: Scope.close has no typed failure channel; its Cause is retained as the owner's readiness Cause.
                  Exit.failCause(scopeExit.cause as Cause.Cause<ReadyError>),
                ])!,
              )
            : exit;

        yield* SynchronizedRef.update(state, (current) => {
          if (current === starting) {
            const settled: RuntimeOwnerState<A, ReadyError, OwnerError> = Exit.isSuccess(readyExit)
              ? {
                  ...starting,
                  _tag: "ready",
                  readyExit,
                  scope: starting.scope!,
                  scopeClosed: false,
                }
              : {
                  ...starting,
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

  const readyLeader = (starting: RuntimeOwnerStarting<A, ReadyError, OwnerError>) =>
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
      const readyExit = closing.readyExit;
      const disposeActors = () =>
        Effect.forEach([...closing.actors].reverse(), (registration) => {
          if (!registration.active) return Effect.succeed(Exit.void);

          registration.active = false;

          return Effect.exit(registration.participant.dispose());
        });
      const disposeActorsUntilSettled = (): Effect.Effect<
        Exit.Exit<void, OwnerError>[],
        never,
        never
      > =>
        Effect.gen(function* () {
          if (!closing.actors.some((registration) => registration.active)) return [];

          const exits = yield* disposeActors();

          return [...exits, ...(yield* disposeActorsUntilSettled())];
        });
      const actorExits = yield* disposeActorsUntilSettled();
      const drainExit = options.drain === undefined ? Exit.void : yield* Effect.exit(options.drain);
      const lateActorExits = yield* disposeActorsUntilSettled();
      closing.acceptingActors = false;
      closing.acceptingProviders = false;
      const providerReleases = [...closing.providers].reverse();
      closing.providers = [];
      const providerExits = yield* Effect.forEach(providerReleases, (release) =>
        Effect.exit(release),
      );
      const closeExit = options.close === undefined ? Exit.void : yield* Effect.exit(options.close);
      const ownedScope = closing.scope;
      const scopeExit =
        ownedScope !== undefined && !closing.scopeClosed
          ? yield* Effect.gen(function* () {
              closing.scopeClosed = true;
              const closed = yield* Effect.exit(Scope.close(ownedScope, Exit.void));

              return Exit.isFailure(closed)
                ? // SAFETY: Scope.close has no typed failure channel; its Cause is retained as the owner's cleanup Cause.
                  Exit.failCause(closed.cause as Cause.Cause<OwnerError>)
                : Exit.void;
            })
          : Exit.void;
      const exits = [
        ...(closing.includeReadyFailure && readyExit !== undefined && Exit.isFailure(readyExit)
          ? [readyExit]
          : []),
        ...actorExits,
        drainExit,
        ...lateActorExits,
        ...providerExits,
        closeExit,
        scopeExit,
      ];

      return causeFromExits(exits);
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
      yield* SynchronizedRef.set(state, {
        ...closing,
        _tag: "closed",
        readyExit: retainedReadyExit,
        closeExit,
      });
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
          const starting: RuntimeOwnerStarting<A, ReadyError, OwnerError> = {
            _tag: "starting",
            ready: Deferred.makeUnsafe<Exit.Exit<A, ReadyError>>(),
            actors: current.actors,
            providers: current.providers,
            acceptingActors: current.acceptingActors,
            acceptingProviders: current.acceptingProviders,
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
          actors: current.actors,
          providers: current.providers,
          acceptingActors: current.acceptingActors,
          acceptingProviders: current.acceptingProviders,
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
          actors: current.actors,
          providers: current.providers,
          acceptingActors: current.acceptingActors,
          acceptingProviders: current.acceptingProviders,
          includeReadyFailure: true,
          readyExit: undefined,
          scope: current.scope,
          scopeClosed: current.scopeClosed,
        };

        return [closeLeader(closing), closing] as const;
      }

      const closing: RuntimeOwnerClosing<A, ReadyError, OwnerError> = {
        _tag: "closing",
        ready: Deferred.makeUnsafe<Exit.Exit<A, ReadyError>>(),
        close: closeDeferred,
        actors: current.actors,
        providers: current.providers,
        acceptingActors: current.acceptingActors,
        acceptingProviders: current.acceptingProviders,
        readyExit: current.readyExit,
        includeReadyFailure: current._tag === "failed" ? current.retainFailureOnClose : false,
        scope: current._tag === "ready" ? current.scope : undefined,
        scopeClosed: current._tag === "ready" ? current.scopeClosed : true,
      };

      return [closeLeader(closing), closing] as const;
    }).pipe(Effect.flatMap((effect) => effect));

  const isOpen = () => currentState()._tag === "ready";

  return { ready, close, registerActor, registerProvider, isOpen };
};

export { makeRuntimeOwner };
