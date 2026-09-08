// STUB: Replaceable/deletable implementation guidance; this file is not shipped behavior.

import type { Cause, Effect, Exit, Fiber, Option, Result, Scope } from "effect";

import type { ContextOf } from "../definition/domain.js";
import type { Machine } from "../machine/machine.js";
import type { MachineDefinition } from "../machine/grammar.js";
import type {
  ActorContextBinding,
  ActorDependencyEdge,
  ActorFence,
  OperationOccurrenceFence,
} from "./actor-admission.stub.js";
import type { RuntimeServiceContext } from "./runtime-services.stub.js";
import type { ActorRef } from "./actor-ref.js";

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
  readonly close: (exit: Exit.Exit<unknown, CleanupError>) => Effect.Effect<void, CleanupError>;
  readonly finalization: "pending" | "running" | "done" | "failed";
  readonly cause: Option.Option<Cause.Cause<CleanupError>>;
};

/** Work cancellation precedes resource cleanup during suspension and disposal. */
export type LifecycleWork<CleanupError> = {
  readonly name: string;
  readonly fiber: Fiber.Fiber<unknown, CleanupError>;
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
export type LifecycleAttachment<DefinitionValue extends MachineDefinition, CleanupError> = {
  readonly status: "attached" | "detached";
  readonly resources: readonly LifecycleResource<CleanupError>[];
  readonly work: readonly LifecycleWork<CleanupError>[];
  readonly dependencies: readonly ActorDependencyEdge[];
  readonly bindings: readonly ActorContextBinding<DefinitionValue>[];
  readonly cursors: ReadonlyMap<string, number>;
  readonly operations: readonly LifecycleOperationRecord<DefinitionValue, CleanupError>[];
  readonly timers: readonly LifecycleTimer[];
};

/** Full lifecycle evidence is immutable and fenced to one actor incarnation. */
export type LifecycleSnapshot<DefinitionValue extends MachineDefinition, CleanupError> = {
  readonly lifecycle: ActorLifecycle;
  readonly fence: ActorFence;
  readonly attachment: LifecycleAttachment<DefinitionValue, CleanupError>;
  readonly finalization: "not-started" | "running" | "done" | "failed";
};

/** Pure transition failures retain typed cleanup causes and blocked dependent detail. */
export type LifecycleError<DefinitionValue extends MachineDefinition, CleanupError> = {
  readonly _tag: "LifecycleError";
  readonly reason:
    | "invalid-transition"
    | "active-dependents"
    | "cleanup-failed"
    | "provider-unavailable"
    | "already-disposed";
  readonly blocked: Option.Option<BlockedDisposal<DefinitionValue>>;
  readonly cause: Option.Option<Cause.Cause<CleanupError>>;
};

/** Describes one legal lifecycle transition before execution. */
export type LifecycleTransition<CleanupError> = {
  readonly from: ActorLifecycle;
  readonly to: ActorLifecycle;
  readonly command: LifecycleCommand<CleanupError>;
  readonly cause: LifecycleCause<CleanupError>;
};

/** Computes the four-state lifecycle transition without Effects. */
export declare const transitionLifecycle: <DefinitionValue extends MachineDefinition, CleanupError>(
  state: ActorLifecycle,
  command: LifecycleCommand<CleanupError>,
) => Result.Result<
  LifecycleTransition<CleanupError>,
  LifecycleError<DefinitionValue, CleanupError>
>;

/** Prepares a fresh actor with no live subscriptions or work. */
export declare const prepareLifecycle: <DefinitionValue extends MachineDefinition, CleanupError>(
  fence: ActorFence,
  cause: LifecycleCause<CleanupError>,
) => Result.Result<
  LifecycleSnapshot<DefinitionValue, CleanupError>,
  LifecycleError<DefinitionValue, CleanupError>
>;

/** Activates after attachment and starts continuing work under one scope. */
export declare const activateLifecycle: <DefinitionValue extends MachineDefinition, CleanupError>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError>,
) => Effect.Effect<
  LifecycleSnapshot<DefinitionValue, CleanupError>,
  LifecycleError<DefinitionValue, CleanupError>,
  RuntimeServiceContext
>;

/** Suspends in the mailbox lane, cancels work, and retains all logical state. */
export declare const suspendLifecycle: <DefinitionValue extends MachineDefinition, CleanupError>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError>,
) => Effect.Effect<
  LifecycleSnapshot<DefinitionValue, CleanupError>,
  LifecycleError<DefinitionValue, CleanupError>,
  RuntimeServiceContext
>;

/** Resumes only after finalizers complete and reinstalls absolute timers. */
export declare const resumeLifecycle: <DefinitionValue extends MachineDefinition, CleanupError>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError>,
) => Effect.Effect<
  LifecycleSnapshot<DefinitionValue, CleanupError>,
  LifecycleError<DefinitionValue, CleanupError>,
  RuntimeServiceContext
>;

/** Disposes once, after cancellation, cleanup, evidence, and dependent ordering settle. */
export declare const disposeLifecycle: <DefinitionValue extends MachineDefinition, CleanupError>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError>,
) => Effect.Effect<
  LifecycleSnapshot<DefinitionValue, CleanupError>,
  LifecycleError<DefinitionValue, CleanupError>,
  RuntimeServiceContext
>;

/** Runs a lifecycle command in the same serialized lane as actor facts. */
export declare const runLifecycleCommand: <DefinitionValue extends MachineDefinition, CleanupError>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError>,
  command: LifecycleCommand<CleanupError>,
) => Effect.Effect<
  LifecycleSnapshot<DefinitionValue, CleanupError>,
  LifecycleError<DefinitionValue, CleanupError>,
  RuntimeServiceContext
>;
