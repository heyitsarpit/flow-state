import { Cause, Effect, Exit, Fiber, Layer, Scope } from "effect";

type RuntimeOwnerOptions<
  LayerOutput,
  LayerError,
  LayerRequirements,
  A,
  ExposureError,
  ExposureRequirements,
  CloseError = LayerError | ExposureError,
> = {
  readonly layer: Layer.Layer<LayerOutput, LayerError, LayerRequirements>;
  readonly expose: Effect.Effect<A, ExposureError, ExposureRequirements>;
  readonly close?: Effect.Effect<void, CloseError>;
};

type RuntimeOwnerExternalRequirements<LayerRequirements, ProvidedServices, ExposureRequirements> =
  | LayerRequirements
  | Exclude<Exclude<ExposureRequirements, ProvidedServices>, Scope.Scope>;

type RuntimeOwnerState<A, LayerError, ExposureError, CloseError, ReadyRequirements> = {
  scope?: Scope.Closeable;
  bootstrap?: Fiber.Fiber<unknown, unknown>;
  bootstrapExit?: Exit.Exit<A, LayerError | ExposureError>;
  accepting: boolean;
  disposal?: Exit.Exit<void, LayerError | ExposureError | CloseError>;
  readyEffect?: Effect.Effect<A, LayerError | ExposureError, ReadyRequirements>;
  closeEffect?: Effect.Effect<void, LayerError | ExposureError | CloseError>;
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
  type ReadyRequirements = RuntimeOwnerExternalRequirements<
    LayerRequirements,
    LayerOutput,
    ExposureRequirements
  >;

  const state: RuntimeOwnerState<A, LayerError, ExposureError, CloseError, ReadyRequirements> = {
    accepting: true,
  };

  const retainDisposalOutcome = (
    outcome: Exit.Exit<void, LayerError | ExposureError | CloseError>,
  ) => {
    if (state.disposal === undefined) {
      state.disposal = outcome;
    } else if (Exit.isFailure(state.disposal) && Exit.isFailure(outcome)) {
      state.disposal = Exit.failCause(Cause.combine(state.disposal.cause, outcome.cause));
    } else if (Exit.isFailure(outcome)) {
      state.disposal = outcome;
    }
  };

  const bootstrap = Effect.gen(function* () {
    const scope = yield* Scope.make("sequential");
    const fiber = yield* Effect.fiber;
    yield* Effect.sync(() => {
      state.scope = scope;
      state.bootstrap = fiber;
    });

    if (!state.accepting) {
      return yield* Effect.interrupt;
    }

    const acquired = yield* Effect.exit(
      Layer.buildWithScope(options.layer, scope).pipe(
        Effect.onExit((exit) => (Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void)),
      ),
    );

    if (Exit.isFailure(acquired)) {
      yield* Scope.close(scope, acquired);

      return yield* Effect.failCause(acquired.cause);
    }

    if (!state.accepting) {
      return yield* Effect.interrupt;
    }

    const exposed = yield* Effect.exit(
      Effect.suspend(() =>
        state.accepting
          ? Scope.provide(scope)(Effect.provideContext(acquired.value)(options.expose))
          : Effect.interrupt,
      ).pipe(
        Effect.onExit((exit) => (Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void)),
      ),
    );

    if (Exit.isFailure(exposed)) {
      yield* Scope.close(scope, exposed);

      return yield* Effect.failCause(exposed.cause);
    }

    state.scope = scope;

    return exposed.value;
  }).pipe(
    Effect.onExit((exit) =>
      Exit.isFailure(exit) && state.scope !== undefined
        ? Scope.close(state.scope, exit)
        : Effect.void,
    ),
    Effect.onExit((exit) =>
      Effect.sync(() => {
        state.bootstrapExit = exit;
      }),
    ),
  );

  const ready = Effect.suspend(() => {
    if (state.readyEffect !== undefined) return state.readyEffect;

    return Effect.cached(bootstrap).pipe(
      Effect.flatMap((effect) =>
        Effect.sync(() => {
          state.readyEffect = effect;

          return effect;
        }),
      ),
      Effect.flatMap((effect) => effect),
    );
  });

  const closeOnce = Effect.gen(function* () {
    state.accepting = false;

    const fiber = state.bootstrap;
    const currentFiber = yield* Effect.fiber;

    if (fiber !== undefined && fiber !== currentFiber) {
      yield* Fiber.interrupt(fiber);
      yield* Fiber.await(fiber);

      if (state.bootstrapExit !== undefined && Exit.isFailure(state.bootstrapExit)) {
        retainDisposalOutcome(Exit.failCause(state.bootstrapExit.cause));
      }
    }

    if (options.close !== undefined) {
      const closeExit = yield* Effect.exit(options.close);
      retainDisposalOutcome(closeExit);
    }

    const scope = state.scope;

    if (scope !== undefined) {
      const scopeExit = yield* Effect.exit(Scope.close(scope, Exit.void));
      retainDisposalOutcome(scopeExit);
    } else {
      retainDisposalOutcome(Exit.void);
    }

    if (state.disposal !== undefined && Exit.isFailure(state.disposal)) {
      return yield* Effect.failCause(state.disposal.cause);
    }
  });

  const close = Effect.suspend(() => {
    if (state.closeEffect !== undefined) return state.closeEffect;

    return Effect.cached(closeOnce).pipe(
      Effect.flatMap((effect) =>
        Effect.sync(() => {
          state.closeEffect = effect;

          return effect;
        }),
      ),
      Effect.flatMap((effect) => effect),
    );
  });

  return { ready: () => ready, close: () => close };
};

export { makeRuntimeOwner };
