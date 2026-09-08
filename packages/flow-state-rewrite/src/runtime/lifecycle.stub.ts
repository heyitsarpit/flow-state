// STUB: Replaceable/deletable implementation guidance; this file is not shipped behavior.

import type { Cause, Effect, Exit, Fiber, Option, Result, Scope } from "effect";

import type { ContextOf } from "../definition/domain.js";
import type { PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type { Machine } from "../machine/machine.js";
import type { MachineDefinition } from "../machine/grammar.js";
import type {
  ActorContextBinding,
  ActorDependencyEdge,
  ActorFence,
  ActorKey,
  OperationOccurrenceFence,
} from "./actor-admission.stub.js";
import type { RuntimeServiceContext } from "./runtime-services.stub.js";
import type { ActorRef } from "./actor-ref.js";

/*
 * Data
 *
 * Lifecycle snapshots retain the actor fence, logical dependency bindings,
 * operation occurrences, absolute timers, resources, and owned work. Causes
 * distinguish fresh, restore, attachment, owner disposal, and cleanup truth.
 *
 * Admission and invariants
 *
 * Legal transitions include prepared → prepared for actor:restore, prepared →
 * active for actor:start, active → suspended → active, and disposal from a
 * live state. Restore validates and installs the snapshot without activating
 * work; start then performs attachment and activation. Suspension rejects new
 * commands, cancels work before cleanup, and retains dependencies, cursors,
 * operations, and dueAt values. Dependents block owner disposal until their
 * edges are released.
 *
 * Pure data operations
 *
 * Transition validation and snapshot shaping are Result operations. Option
 * represents absent cleanup causes and blocked metadata; defects, interruption,
 * and cleanup failure remain distinguishable in the retained Cause.
 *
 * Effect execution
 *
 * Activation, suspension, resume, and disposal run in the mailbox lane with
 * the supplied runtime services. Scope owns work and resources; cancellation,
 * finalization, evidence drain, and reverse cleanup stay reachable from the
 * same lifecycle owner.
 */

/** The only actor lifecycle states. */
export type ActorLifecycle = "prepared" | "active" | "suspended" | "disposed";

/** Lifecycle causes remain explicit for ordered evidence and cleanup diagnostics. */
export type LifecycleCause<CleanupError> =
  | { readonly _tag: "fresh" }
  | { readonly _tag: "restore" }
  | { readonly _tag: "attachment" }
  | { readonly _tag: "owner-disposal" }
  | { readonly _tag: "runtime-disposal" }
  | {
      readonly _tag: "cleanup-failure";
      readonly exit: Exit.Exit<void, CleanupError>;
      readonly cause: Cause.Cause<CleanupError>;
    };

/** Commands enter one serialized lane with the actor mailbox. */
export type LifecycleCommand<CleanupError> =
  | { readonly _tag: "actor:start"; readonly cause: LifecycleCause<CleanupError> }
  | { readonly _tag: "actor:restore"; readonly cause: LifecycleCause<CleanupError> }
  | { readonly _tag: "actor:suspend"; readonly cause: LifecycleCause<CleanupError> }
  | { readonly _tag: "actor:resume"; readonly cause: LifecycleCause<CleanupError> }
  | { readonly _tag: "actor:dispose"; readonly cause: LifecycleCause<CleanupError> };

/** Resources and fibers are attached to the lifecycle scope and released exactly once. */
export type LifecycleResource<CleanupError> = {
  readonly name: string;
  readonly scope: Scope.Scope;
  readonly close: (exit: Exit.Exit<void, CleanupError>) => Effect.Effect<void, CleanupError>;
  readonly finalization: "pending" | "running" | "done" | "failed";
  readonly cause: Option.Option<Cause.Cause<CleanupError>>;
};

/** Work cancellation precedes resource cleanup during suspension and disposal. */
export type LifecycleWork<CleanupError> = {
  readonly name: string;
  readonly fiber: Fiber.Fiber<void, CleanupError>;
  readonly cancel: Effect.Effect<void, CleanupError>;
  readonly finalizer: Effect.Effect<void, CleanupError>;
  readonly finalization: "pending" | "running" | "done" | "failed";
  readonly cause: Option.Option<Cause.Cause<CleanupError>>;
};

/** Operation records retain occurrence fences and store generations while suspended. */
export type LifecycleOperationRecord<DefinitionValue extends MachineDefinition, CleanupError> = {
  readonly fence: OperationOccurrenceFence<DefinitionValue>;
  readonly status: "running" | "settled" | "cancelled" | "stale";
  readonly finalization: "pending" | "running" | "done" | "failed";
  readonly cause: Option.Option<Cause.Cause<CleanupError>>;
};

/** Timers are absolute and are restored from dueAt rather than replayed from delay. */
export type LifecycleTimer = {
  readonly name: string;
  readonly startedAt: number;
  readonly dueAt: number;
  readonly status: "armed" | "fired" | "cancelled";
};

/** Blocked disposal reports dependent actors and exact binding keys to the owner. */
export type BlockedDisposal<DefinitionValue extends MachineDefinition> = {
  readonly dependentActors: readonly ActorRef<Machine<DefinitionValue>>[];
  readonly bindingKeys: readonly (keyof ContextOf<DefinitionValue> & string)[];
};

/** Detached attachments retain identity, dependency edges, cursors, operations, and deadlines. */
export type LifecycleAttachment<
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  readonly status: "attached" | "detached";
  readonly resources: readonly LifecycleResource<CleanupError>[];
  readonly work: readonly LifecycleWork<CleanupError>[];
  readonly dependencies: readonly ActorDependencyEdge[];
  readonly bindings: readonly ActorContextBinding<DefinitionValue, ProviderDefinition>[];
  /** Provider publication revisions are retained separately from provider actor fences. */
  readonly providerRevisions: ReadonlyMap<ActorKey, number>;
  readonly cursors: ReadonlyMap<string, number>;
  readonly operations: readonly LifecycleOperationRecord<DefinitionValue, CleanupError>[];
  readonly timers: readonly LifecycleTimer[];
};

/** Full lifecycle evidence is immutable and fenced to one actor incarnation. */
export type LifecycleSnapshot<
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  readonly lifecycle: ActorLifecycle;
  readonly fence: ActorFence;
  readonly attachment: LifecycleAttachment<DefinitionValue, CleanupError, ProviderDefinition>;
  readonly finalization: "not-started" | "running" | "done" | "failed";
};

/** Describes one legal lifecycle transition before execution. */
export type LifecycleTransition<CleanupError> = {
  readonly from: ActorLifecycle;
  readonly to: ActorLifecycle;
  readonly command: LifecycleCommand<CleanupError>;
  readonly cause: LifecycleCause<CleanupError>;
};

/** Restore validates a prepared snapshot without starting work or changing lifecycle state. */
export type PreparedRestoreTransition<CleanupError> = LifecycleTransition<CleanupError> & {
  readonly from: "prepared";
  readonly to: "prepared";
  readonly command: Extract<LifecycleCommand<CleanupError>, { readonly _tag: "actor:restore" }>;
};

/** Computes the four-state lifecycle transition without Effects. */
export declare const transitionLifecycle: <CleanupError>(
  state: ActorLifecycle,
  command: LifecycleCommand<CleanupError>,
) => Result.Result<LifecycleTransition<CleanupError>, PublicDiagnostic>;

/** Prepares a fresh actor with no live subscriptions or work. */
export declare const prepareLifecycle: <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  fence: ActorFence,
  cause: LifecycleCause<CleanupError>,
) => Result.Result<
  LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic
>;

/** Activates after attachment and starts continuing work under one scope. */
export declare const activateLifecycle: <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
) => Effect.Effect<
  LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic,
  RuntimeServiceContext
>;

/** Suspends in the mailbox lane, cancels work, and retains all logical state. */
export declare const suspendLifecycle: <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
) => Effect.Effect<
  LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic,
  RuntimeServiceContext
>;

/** Resumes only after finalizers complete and reinstalls absolute timers. */
export declare const resumeLifecycle: <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
) => Effect.Effect<
  LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic,
  RuntimeServiceContext
>;

/** Disposes once, after cancellation, cleanup, evidence, and dependent ordering settle. */
export declare const disposeLifecycle: <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
) => Effect.Effect<
  LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic,
  RuntimeServiceContext
>;

/** Runs a lifecycle command in the same serialized lane as actor facts. */
export declare const runLifecycleCommand: <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  command: LifecycleCommand<CleanupError>,
) => Effect.Effect<
  LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic,
  RuntimeServiceContext
>;
