import { Context, Effect, Exit, Scope } from "effect";

type RuntimeOwnerOptions<
  AcquireError,
  AcquireRequirements,
  Providers extends readonly RuntimeProvider<AcquireError, AcquireRequirements>[],
  A,
  ExposureError,
  ExposureRequirements,
> = {
  readonly providers: Providers & readonly RuntimeProvider<AcquireError, AcquireRequirements>[];
  readonly expose: Effect.Effect<A, ExposureError, ExposureRequirements>;
};

type RuntimeProvider<AcquireError, AcquireRequirements> = {
  readonly service: Context.Key<unknown, unknown>;
  readonly acquire: Effect.Effect<unknown, AcquireError, AcquireRequirements>;
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
>(
  options: RuntimeOwnerOptions<
    AcquireError,
    AcquireRequirements,
    Providers,
    A,
    ExposureError,
    ExposureRequirements
  >,
) => {
  let ownedScope: Scope.Closeable | undefined;

  const bootstrap = Effect.gen(function* () {
    const scope = yield* Scope.make("sequential");
    let context = Context.makeUnsafe<unknown>(new Map<string, never>());
    
    const acquired = yield* Effect.exit(
      Scope.provide(scope)(
        Effect.gen(function* () {
          for (const provider of options.providers) {
            const service = yield* Effect.provideContext(context)(provider.acquire);
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

    const exposed = yield* Effect.exit(
      Scope.provide(scope)(Effect.provideContext(acquired.value)(options.expose)).pipe(
        Effect.onExit((exit) => (Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void)),
      ),
    );
    if (Exit.isFailure(exposed)) {
      yield* Scope.close(scope, exposed);
      return yield* Effect.failCause(exposed.cause);
    }

    ownedScope = scope;
    return exposed.value;
  });

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

  const close = Effect.suspend(() =>
    ownedScope === undefined ? Effect.void : Scope.close(ownedScope, Exit.void),
  );

  return { ready: () => ready, close: () => close };
};

export { makeRuntimeOwner };
