import { Clock, Context, Deferred, Duration, Effect, Exit, Fiber, Layer, Scope } from "effect";

import type { App, appPlan } from "../app/app.js";
import type { MachineDefinition } from "../machine/grammar.js";
import type { PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type { ActorIdentity } from "./actor-admission.js";
import type { ActorLifecycle, LifecycleCause, LifecycleSnapshot } from "./lifecycle.js";

/** Identifies the clock capability supplied by a runtime composition root. */
export interface RuntimeClockIdentity {
  readonly _tag: "RuntimeClock";
}

/** Reads runtime time and schedules work against absolute deadlines. */
export interface RuntimeClockService {
  readonly now: Effect.Effect<number>;
  /** Synchronous read for evidence preparation from the captured Clock service. */
  readonly timestamp: () => number;
  readonly sleepUntil: (dueAt: number) => Effect.Effect<void>;
}

/** Completion is allocated before a scheduler can start the requested work. */
export type RuntimeWorkRequest<Success, Failure> = {
  readonly completion: Deferred.Deferred<Exit.Exit<Success, Failure>>;
  readonly work: Effect.Effect<Success, Failure>;
};

/** A running request has one owner-scoped fiber and one cancellation authority. */
export type RuntimeRunningFiber<Success, Failure> = {
  readonly fiber: Fiber.Fiber<Success, Failure>;
  readonly completion: Deferred.Deferred<Exit.Exit<Success, Failure>>;
  readonly interrupt: Effect.Effect<void>;
};

/** Identifies the scheduling capability supplied by a runtime composition root. */
export interface RuntimeSchedulerIdentity {
  readonly _tag: "RuntimeScheduler";
}

/** Starts only pre-registered work under the caller's actor Scope. */
export interface RuntimeSchedulerService {
  readonly start: <Success, Failure>(
    request: RuntimeWorkRequest<Success, Failure>,
  ) => Effect.Effect<RuntimeRunningFiber<Success, Failure>, PublicDiagnostic, Scope.Scope>;
}

/** One lifecycle publication is evidence, never a machine-turn record. */
type RuntimeEvidenceProvenance = {
  readonly app: App;
  readonly plan: ReturnType<typeof appPlan>;
  readonly actor: Pick<ActorIdentity, "key" | "incarnation" | "leaseEpoch">;
};

type RuntimeEvidenceServiceProvenance = Omit<RuntimeEvidenceProvenance, "actor">;

type RuntimeLifecycleEvidenceMetadata = {
  readonly timestamp: number;
  readonly publicationRevision: number;
  readonly machineTurnRevision: number;
  readonly evidenceSequence: number;
  readonly provenance: RuntimeEvidenceProvenance;
};

export type RuntimeLifecycleEvidence<
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  readonly _tag: "lifecycle";
  readonly machineTurn: false;
  readonly from: ActorLifecycle;
  readonly to: ActorLifecycle;
  readonly cause: LifecycleCause<CleanupError>;
  readonly before: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>;
  readonly after: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>;
} & RuntimeLifecycleEvidenceMetadata;

/** The evidence owner accepts lifecycle records without executing machine work. */
export type RuntimeEvidenceService<
  _A extends App = App,
  _DefinitionValue extends MachineDefinition = MachineDefinition,
  _CleanupError = PublicDiagnostic,
> = {
  readonly hub: unknown;
  readonly provenance: RuntimeEvidenceServiceProvenance;
  readonly publish: <
    DefinitionValue extends MachineDefinition,
    CleanupError,
    ProviderDefinition extends MachineDefinition = DefinitionValue,
  >(
    snapshot: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  ) => Effect.Effect<void, PublicDiagnostic>;
  readonly accept: <
    DefinitionValue extends MachineDefinition,
    CleanupError,
    ProviderDefinition extends MachineDefinition = DefinitionValue,
  >(
    record: RuntimeLifecycleEvidence<DefinitionValue, CleanupError, ProviderDefinition>,
  ) => Effect.Effect<void, PublicDiagnostic>;
  readonly drain: Effect.Effect<unknown, PublicDiagnostic>;
};

/** Identifies the evidence capability supplied by a runtime composition root. */
export interface RuntimeEvidenceIdentity {
  readonly _tag: "RuntimeEvidence";
}

export const RuntimeClock = Context.Service<RuntimeClockIdentity, RuntimeClockService>(
  "flow-state/runtime/RuntimeClock",
);

export const RuntimeScheduler = Context.Service<RuntimeSchedulerIdentity, RuntimeSchedulerService>(
  "flow-state/runtime/RuntimeScheduler",
);

export const RuntimeEvidence = Context.Service<RuntimeEvidenceIdentity, RuntimeEvidenceService>(
  "flow-state/runtime/RuntimeEvidence",
);

/** The three replaceable capabilities available inside one runtime owner. */
export type RuntimeServiceContext =
  | RuntimeClockIdentity
  | RuntimeSchedulerIdentity
  | RuntimeEvidenceIdentity;

/** Builds capabilities only; it does not construct an actor or start a fiber. */
export type RuntimeServicesLayer = Layer.Layer<RuntimeServiceContext>;

// RETURN_TYPE: The composition boundary deliberately exposes one concrete capability Layer.
export const makeRuntimeServicesLayer = <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(services: {
  readonly clock: RuntimeClockService;
  readonly scheduler: RuntimeSchedulerService;
  readonly evidence: RuntimeEvidenceService<A, DefinitionValue, CleanupError>;
}): RuntimeServicesLayer =>
  Layer.mergeAll(
    Layer.succeed(RuntimeClock)(services.clock),
    Layer.succeed(RuntimeScheduler)(services.scheduler),
    Layer.succeed(RuntimeEvidence)(services.evidence),
  );

/** The captured Effect Clock is the only runtime time authority. */
// RETURN_TYPE: The clock factory preserves the captured service boundary.
export const makeRuntimeClock = (clock: Clock.Clock): RuntimeClockService => {
  const now = clock.currentTimeMillis;

  const sleepUntil = (dueAt: number) =>
    Effect.gen(function* () {
      const remaining = dueAt - (yield* now);

      if (remaining > 0) yield* clock.sleep(Duration.millis(remaining));
    });

  return { now, timestamp: () => clock.currentTimeMillisUnsafe(), sleepUntil };
};

/**
 * The scheduler registers completion observation in the same forked recipe as
 * the work. `forkIn` installs the fiber in the supplied Scope before the work
 * is allowed to run, including for synchronously completing Effects.
 */
// RETURN_TYPE: The public scheduler factory preserves the owner-scoped service contract.
export const makeRuntimeScheduler = (): RuntimeSchedulerService => ({
  start: <Success, Failure>(request: RuntimeWorkRequest<Success, Failure>) =>
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const started = Deferred.makeUnsafe<void>();

      const observed = Effect.gen(function* () {
        yield* Deferred.succeed(started, undefined);

        return yield* request.work;
      }).pipe(
        Effect.onExit((exit) => Deferred.succeed(request.completion, exit).pipe(Effect.asVoid)),
      );

      const fiber = yield* Effect.forkIn(observed, scope);
      yield* Deferred.await(started);
      yield* Effect.yieldNow;

      return {
        fiber,
        completion: request.completion,
        interrupt: Fiber.interrupt(fiber),
      } satisfies RuntimeRunningFiber<Success, Failure>;
    }),
});
