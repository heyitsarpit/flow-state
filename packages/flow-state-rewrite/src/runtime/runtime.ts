import { Effect } from "effect";

import {
  implementationEntries,
  type Implementation,
  type ImplementationErrorOf,
  type ImplementationRequirementsOf,
  type ImplementationServices,
} from "../implementation/implementation.js";
import {
  isConstructedApp,
  type App,
  type AppOwner,
  type AppPlan,
  type RequirementsOf,
} from "../app/app.js";

/*
 * Runtime setup:
 *
 * Public contracts and completeness constraints:
 *   Runtime, RuntimeSetup, RuntimeImplementation, CompleteImplementation
 *
 * Constructed-app admission:
 *   admitConstructedApp
 *
 * Provider acquisition:
 *   acquireImplementation
 *
 * Per-instance construction:
 *   constructRuntime
 *
 * Setup assembly:
 *   runtimeSetup
 */

type RuntimeImplementation = Implementation<never, unknown, unknown>;
type RuntimePlan = Pick<AppPlan, "appId" | "persistenceVersion" | "modules">;
type RuntimeApp = Pick<App, "kind" | "id" | "persistenceVersion" | "modules" | "M"> &
  AppOwner & {
    readonly plan: RuntimePlan;
  };

export type Runtime<A extends RuntimeApp, ImplementationError = never> = {
  readonly app: A;
  readonly ready: () => Effect.Effect<void, ImplementationError>;
};

export type RuntimeSetup<A extends RuntimeApp, ImplementationError = never> = {
  readonly app: A;
  readonly construct: () => Runtime<A, ImplementationError>;
};

const admitConstructedApp = <A extends RuntimeApp>(value: A) => {
  if (!isConstructedApp(value))
    throw new TypeError("runtimeSetup app must be constructed by app()");
  return value;
};

type IsCompleteImplementation<
  A extends RuntimeApp,
  I extends RuntimeImplementation,
> = I extends RuntimeImplementation
  ? [unknown] extends [ImplementationServices<I>]
    ? false
    : [RequirementsOf<A>] extends [ImplementationServices<I>]
      ? [ImplementationRequirementsOf<I>] extends [never]
        ? true
        : false
      : false
  : false;

type CompleteImplementation<A extends RuntimeApp, I extends RuntimeImplementation> =
  false extends IsCompleteImplementation<A, I> ? never : I;

// FLOW_STATE_ALLOW_UNKNOWN_EFFECT_CHANNEL: the implementation graph intentionally erases heterogeneous provider channels at its private runtime boundary; Runtime restores the setup error channel after setup has proven that no provider requirements remain.
const acquireImplementation = <ImplementationError>(
  implementation: RuntimeImplementation | undefined,
) =>
  Effect.suspend(() => {
    if (implementation === undefined) return Effect.void;

    // SAFETY: RuntimeSetup admits only provider graphs with no remaining requirements.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the admitted private graph erases heterogeneous error and service channels; readiness restores the setup error channel once at this boundary.
    return Effect.forEach(
      implementationEntries(implementation),
      (entry) => (entry.kind === "succeed" ? Effect.sync(() => entry.value) : entry.acquire),
      { concurrency: 1, discard: true },
    ) as Effect.Effect<void, ImplementationError>;
  });

const constructRuntime = <A extends RuntimeApp, ImplementationError>(
  app: A,
  implementation: RuntimeImplementation | undefined,
) => {
  const readiness = acquireImplementation<ImplementationError>(implementation);
  const cachedReadiness = Effect.cached(readiness);
  let cachedReady: Effect.Effect<void, ImplementationError> | undefined;

  const ready = Effect.suspend(() => {
    if (cachedReady !== undefined) return cachedReady;

    return cachedReadiness.pipe(
      Effect.flatMap((effect) =>
        Effect.sync(() => {
          cachedReady = effect;
          return effect;
        }),
      ),
      Effect.flatMap((effect) => effect),
    );
  });

  return { app, ready: () => ready };
};

export function runtimeSetup<A extends RuntimeApp>(
  options: {
    readonly app: A;
  } & ([RequirementsOf<A>] extends [never]
    ? { readonly implementation?: never }
    : { readonly implementation: never }),
): RuntimeSetup<A>;

export function runtimeSetup<A extends RuntimeApp, I extends RuntimeImplementation>(options: {
  readonly app: A;
  readonly implementation: CompleteImplementation<A, I>;
}): RuntimeSetup<A, ImplementationErrorOf<I>>;

export function runtimeSetup<
  A extends RuntimeApp,
  I extends RuntimeImplementation | undefined,
  ImplementationError,
>(options: { readonly app: A; readonly implementation?: I }) {
  const app = admitConstructedApp(options.app);
  const implementation = options.implementation;

  return {
    app,
    construct: () => constructRuntime<A, ImplementationError>(app, implementation),
  };
}
