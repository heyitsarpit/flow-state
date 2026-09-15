import { Clock, Context, Deferred, Duration, Effect, Exit, Fiber, Layer, Scope } from "effect";

import type { App, appPlan } from "../app/app.js";
import type { MachineDefinition } from "../machine/grammar.js";
import type { PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type { ActorIdentity } from "./actor-admission.js";
import type { ActorLifecycle, LifecycleCause, LifecycleSnapshot } from "./lifecycle.js";

/** Identifies the clock capability supplied by a runtime composition root. */
export interface RuntimeClockIdentity {
  _tag: "RuntimeClock";
}

/** Reads runtime time and schedules work against absolute deadlines. */
export interface RuntimeClockService {
  now: Effect.Effect<number>;
  /** Synchronous read for evidence preparation from the captured Clock service. */
  timestamp: () => number;
  sleepUntil: (dueAt: number) => Effect.Effect<void>;
}

/** Completion is allocated before a scheduler can start the requested work. */
export type RuntimeWorkRequest<Success, Failure> = {
  completion: Deferred.Deferred<Exit.Exit<Success, Failure>>;
  work: Effect.Effect<Success, Failure>;
};

/** A running request has one owner-scoped fiber and one cancellation authority. */
export type RuntimeRunningFiber<Success, Failure> = {
  fiber: Fiber.Fiber<Success, Failure>;
  completion: Deferred.Deferred<Exit.Exit<Success, Failure>>;
  interrupt: Effect.Effect<void>;
};

/** Identifies the scheduling capability supplied by a runtime composition root. */
export interface RuntimeSchedulerIdentity {
  _tag: "RuntimeScheduler";
}

/** Starts only pre-registered work under the caller's actor Scope. */
export interface RuntimeSchedulerService {
  start: <Success, Failure>(
    request: RuntimeWorkRequest<Success, Failure>,
  ) => Effect.Effect<RuntimeRunningFiber<Success, Failure>, PublicDiagnostic, Scope.Scope>;
}

/** One lifecycle publication is evidence, never a machine-turn record. */
type RuntimeEvidenceProvenance = {
  app: App;
  plan: ReturnType<typeof appPlan>;
  actor: Pick<ActorIdentity, "key" | "incarnation" | "leaseEpoch">;
};

type RuntimeEvidenceServiceProvenance = Omit<RuntimeEvidenceProvenance, "actor">;

type RuntimeLifecycleEvidenceMetadata = {
  timestamp: number;
  publicationRevision: number;
  machineTurnRevision: number;
  evidenceSequence: number;
  provenance: RuntimeEvidenceProvenance;
};

export type RuntimeLifecycleEvidence<
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  _tag: "lifecycle";
  machineTurn: false;
  from: ActorLifecycle;
  to: ActorLifecycle;
  cause: LifecycleCause<CleanupError>;
  before: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>;
  after: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>;
} & RuntimeLifecycleEvidenceMetadata;

/** The evidence owner accepts lifecycle records without executing machine work. */
export type RuntimeEvidenceService<
  _A extends App = App,
  _DefinitionValue extends MachineDefinition = MachineDefinition,
  _CleanupError = PublicDiagnostic,
> = {
  hub: unknown;
  provenance: RuntimeEvidenceServiceProvenance;
  publish: <
    DefinitionValue extends MachineDefinition,
    CleanupError,
    ProviderDefinition extends MachineDefinition = DefinitionValue,
  >(
    snapshot: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  ) => Effect.Effect<void, PublicDiagnostic>;
  accept: <
    DefinitionValue extends MachineDefinition,
    CleanupError,
    ProviderDefinition extends MachineDefinition = DefinitionValue,
  >(
    record: RuntimeLifecycleEvidence<DefinitionValue, CleanupError, ProviderDefinition>,
  ) => Effect.Effect<void, PublicDiagnostic>;
  drain: Effect.Effect<unknown, PublicDiagnostic>;
};

/** Identifies the evidence capability supplied by a runtime composition root. */
export interface RuntimeEvidenceIdentity {
  _tag: "RuntimeEvidence";
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
  clock: RuntimeClockService;
  scheduler: RuntimeSchedulerService;
  evidence: RuntimeEvidenceService<A, DefinitionValue, CleanupError>;
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
