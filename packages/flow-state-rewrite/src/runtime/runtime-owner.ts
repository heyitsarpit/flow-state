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
  let ownedScope: Scope.Closeable | undefined;
  let bootstrapFiber: Fiber.Fiber<unknown, unknown> | undefined;
  let bootstrapOutcome: Exit.Exit<A, LayerError | ExposureError> | undefined;
  let admissionOpen = true;
  let disposalOutcome: Exit.Exit<void, LayerError | ExposureError | CloseError> | undefined;
  const isAdmissionOpen = () => admissionOpen;

  const retainDisposalOutcome = (
    outcome: Exit.Exit<void, LayerError | ExposureError | CloseError>,
  ) => {
    if (disposalOutcome === undefined) {
      disposalOutcome = outcome;
    } else if (Exit.isFailure(disposalOutcome) && Exit.isFailure(outcome)) {
      disposalOutcome = Exit.failCause(Cause.combine(disposalOutcome.cause, outcome.cause));
    } else if (Exit.isFailure(outcome)) {
      disposalOutcome = outcome;
    }
  };

  const bootstrap = Effect.gen(function* () {
    const scope = yield* Scope.make("sequential");
    const fiber = yield* Effect.fiber;
    yield* Effect.sync(() => {
      ownedScope = scope;
      bootstrapFiber = fiber;
    });

    if (!isAdmissionOpen()) {
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

    if (!isAdmissionOpen()) {
      return yield* Effect.interrupt;
    }

    const exposed = yield* Effect.exit(
      Effect.suspend(() =>
        isAdmissionOpen()
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

    ownedScope = scope;

    return exposed.value;
  }).pipe(
    Effect.onExit((exit) =>
      Exit.isFailure(exit) && ownedScope !== undefined
        ? Scope.close(ownedScope, exit)
        : Effect.void,
    ),
    Effect.onExit((exit) =>
      Effect.sync(() => {
        bootstrapOutcome = exit;
      }),
    ),
  );

  const cachedBootstrap = Effect.cached(bootstrap);

  let cachedReady:
    | Effect.Effect<
        A,
        LayerError | ExposureError,
        RuntimeOwnerExternalRequirements<LayerRequirements, LayerOutput, ExposureRequirements>
      >
    | undefined;

  const ready = Effect.suspend(() => {
    if (cachedReady !== undefined) return cachedReady;

    return cachedBootstrap.pipe(
      Effect.flatMap((effect) =>
        Effect.sync(() => {
          cachedReady = effect;

          return effect;
        }),
      ),
      Effect.flatMap((effect) => effect),
    );
  });

  const closeOnce = Effect.gen(function* () {
    admissionOpen = false;

    const fiber = bootstrapFiber;
    const currentFiber = yield* Effect.fiber;

    if (fiber !== undefined && fiber !== currentFiber) {
      yield* Fiber.interrupt(fiber);
      yield* Fiber.await(fiber);

      if (bootstrapOutcome !== undefined && Exit.isFailure(bootstrapOutcome)) {
        retainDisposalOutcome(Exit.failCause(bootstrapOutcome.cause));
      }
    }

    if (options.close !== undefined) {
      const closeExit = yield* Effect.exit(options.close);
      retainDisposalOutcome(closeExit);
    }

    const scope = ownedScope;

    if (scope !== undefined) {
      const scopeExit = yield* Effect.exit(Scope.close(scope, Exit.void));
      retainDisposalOutcome(scopeExit);
    } else {
      retainDisposalOutcome(Exit.void);
    }

    if (disposalOutcome !== undefined && Exit.isFailure(disposalOutcome)) {
      return yield* Effect.failCause(disposalOutcome.cause);
    }
  });

  const cachedClose = Effect.cached(closeOnce);
  let cachedCloseEffect: Effect.Effect<void, LayerError | ExposureError | CloseError> | undefined;

  const close = Effect.suspend(() => {
    if (cachedCloseEffect !== undefined) return cachedCloseEffect;

    return cachedClose.pipe(
      Effect.flatMap((effect) =>
        Effect.sync(() => {
          cachedCloseEffect = effect;

          return effect;
        }),
      ),
      Effect.flatMap((effect) => effect),
    );
  });

  return { ready: () => ready, close: () => close };
};

export { makeRuntimeOwner };
