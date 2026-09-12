import { Cause, Context, Effect, Exit, Fiber, Scope } from "effect";

type RuntimeOwnerOptions<
  AcquireError,
  AcquireRequirements,
  Providers extends readonly RuntimeProvider<AcquireError, AcquireRequirements>[],
  A,
  ExposureError,
  ExposureRequirements,
  CloseError = AcquireError | ExposureError,
> = {
  readonly providers: Providers & readonly RuntimeProvider<AcquireError, AcquireRequirements>[];
  readonly expose: Effect.Effect<A, ExposureError, ExposureRequirements>;
  readonly close?: Effect.Effect<void, CloseError>;
};

type RuntimeProvider<AcquireError, AcquireRequirements> =
  | {
      readonly service: Context.Key<unknown, unknown>;
      readonly acquire: Effect.Effect<unknown, AcquireError, AcquireRequirements>;
    }
  | {
      readonly kind: "succeed";
      readonly service: Context.Key<unknown, unknown>;
      readonly value: unknown;
    };

type RuntimeProviderService<Provider> = Provider extends {
  readonly service: Context.Key<infer Identifier, unknown>;
}
  ? Identifier
  : never;

type RuntimeOwnerProvidedServices<Providers extends readonly RuntimeProvider<unknown, unknown>[]> =
  RuntimeProviderService<Providers[number]>;

type RuntimeOwnerExternalRequirements<ProvidedServices, ExposureRequirements> = Exclude<
  Exclude<ExposureRequirements, ProvidedServices>,
  Scope.Scope
>;

const makeRuntimeOwner = <
  AcquireError,
  AcquireRequirements,
  Providers extends readonly RuntimeProvider<AcquireError, AcquireRequirements>[],
  A,
  ExposureError,
  ExposureRequirements,
  CloseError = AcquireError | ExposureError,
>(
  options: RuntimeOwnerOptions<
    AcquireError,
    AcquireRequirements,
    Providers,
    A,
    ExposureError,
    ExposureRequirements,
    CloseError
  >,
) => {
  let ownedScope: Scope.Closeable | undefined;
  let bootstrapFiber: Fiber.Fiber<unknown, unknown> | undefined;
  let bootstrapOutcome: Exit.Exit<A, AcquireError | ExposureError> | undefined;
  let admissionOpen = true;
  let disposalOutcome: Exit.Exit<void, AcquireError | ExposureError | CloseError> | undefined;
  const isAdmissionOpen = () => admissionOpen;

  const retainDisposalOutcome = (
    outcome: Exit.Exit<void, AcquireError | ExposureError | CloseError>,
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

    let context = Context.makeUnsafe<unknown>(new Map<string, never>());

    const acquired = yield* Effect.exit(
      Scope.provide(scope)(
        Effect.gen(function* () {
          for (const provider of options.providers) {
            const acquire =
              "acquire" in provider ? provider.acquire : Effect.sync(() => provider.value);

            const service = yield* Effect.provideContext(context)(acquire);
            context = Context.add(context, provider.service, service);
          }

          return context;
        }),
      ).pipe(
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
        AcquireError | ExposureError,
        RuntimeOwnerExternalRequirements<
          RuntimeOwnerProvidedServices<Providers>,
          ExposureRequirements
        >
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
  let cachedCloseEffect: Effect.Effect<void, AcquireError | ExposureError | CloseError> | undefined;

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
