// STUB: Replaceable/deletable implementation guidance; this file is not shipped behavior.

import type { Context, Deferred, Effect, Exit, Fiber, Layer, Scope } from "effect";

import type { App } from "../app/app.js";
import type { MachineDefinition } from "../machine/grammar.js";
import type {
  EvidenceAcceptance,
  EvidenceDrain,
  EvidenceHub,
  EvidenceRecord,
  EvidenceError,
} from "./evidence.stub.js";

/** Identifies the clock capability supplied by a runtime composition root. */
export interface RuntimeClockIdentity {
  readonly _tag: "RuntimeClock";
}

/** Reads and schedules absolute runtime time without owning actor state. */
export interface RuntimeClockService {
  readonly now: Effect.Effect<number>;
  readonly sleepUntil: (dueAt: number) => Effect.Effect<void>;
}

/** Identifies the scheduling capability supplied by a runtime composition root. */
export interface RuntimeSchedulerIdentity {
  readonly _tag: "RuntimeScheduler";
}

/** Completion is registered before the owner-scoped fiber is forked or started. */
export type RuntimeWorkRequest<Success, Failure> = {
  // oxlint-disable-next-line typescript/no-unnecessary-type-arguments -- explicit never error channel makes registration non-failing.
  readonly completion: Deferred.Deferred<Exit.Exit<Success, Failure>, never>;
  readonly work: Effect.Effect<Success, Failure>;
};

/** Running handles, rather than Effect recipes, are the only cancellation authority. */
export type RuntimeRunningFiber<Success, Failure> = {
  readonly fiber: Fiber.Fiber<Success, Failure>;
  // oxlint-disable-next-line typescript/no-unnecessary-type-arguments -- explicit never error channel makes registered completion non-failing.
  readonly completion: Deferred.Deferred<Exit.Exit<Success, Failure>, never>;
  readonly interrupt: Effect.Effect<void, RuntimeSchedulerError>;
};

export interface RuntimeSchedulerService {
  readonly start: <Success, Failure>(
    request: RuntimeWorkRequest<Success, Failure>,
  ) => Effect.Effect<RuntimeRunningFiber<Success, Failure>, RuntimeSchedulerError, Scope.Scope>;
}

/** Typed scheduler failures retain the owner boundary. */
export type RuntimeSchedulerError = {
  readonly _tag: "RuntimeSchedulerError";
  readonly reason: "start-failed" | "interrupt-failed";
};

/** Identifies the runtime evidence capability used by internal boundaries. */
export interface RuntimeEvidenceIdentity {
  readonly _tag: "RuntimeEvidence";
}

/** Evidence capability delegates to the one typed hub and record vocabulary. */
export interface RuntimeEvidenceService<
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
> {
  readonly hub: EvidenceHub<A, DefinitionValue, CleanupError>;
  readonly accept: (
    record: EvidenceRecord<A, DefinitionValue, CleanupError>,
  ) => Effect.Effect<EvidenceAcceptance<A, DefinitionValue, CleanupError>, EvidenceError>;
  readonly drain: Effect.Effect<EvidenceDrain, EvidenceError>;
}

/** Typed construction failures from capability layers. */
export type RuntimeServiceError = {
  readonly _tag: "RuntimeServiceError";
  readonly message: string;
};

/** Service keys are declarations only; a composition root supplies implementations. */
export declare const RuntimeClock: Context.Service<RuntimeClockIdentity, RuntimeClockService>;

/** Service keys are declarations only; a composition root supplies implementations. */
export declare const RuntimeScheduler: Context.Service<
  RuntimeSchedulerIdentity,
  RuntimeSchedulerService
>;

/** Service keys are declarations only; a composition root supplies implementations. */
export declare const RuntimeEvidence: Context.Service<
  RuntimeEvidenceIdentity,
  RuntimeEvidenceService<App, MachineDefinition, unknown>
>;

/** The capability identities available to a runtime owner. */
export type RuntimeServiceContext =
  | RuntimeClockIdentity
  | RuntimeSchedulerIdentity
  | RuntimeEvidenceIdentity;

/** A Layer is the replaceable construction boundary for runtime capabilities. */
export type RuntimeServicesLayer = Layer.Layer<RuntimeServiceContext, RuntimeServiceError>;

/** Constructs a capability layer without creating a runtime or starting work. */
export declare const makeRuntimeServicesLayer: <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(services: {
  readonly clock: RuntimeClockService;
  readonly scheduler: RuntimeSchedulerService;
  readonly evidence: RuntimeEvidenceService<A, DefinitionValue, CleanupError>;
}) => RuntimeServicesLayer;
