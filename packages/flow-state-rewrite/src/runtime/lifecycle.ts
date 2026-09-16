// oxlint-disable-next-line anti-slop/no-large-production-file -- lifecycle, cleanup, and evidence form one owner boundary.
import {
  Clock,
  Cause,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  FiberMap,
  Option,
  Result,
  SynchronizedRef,
} from "effect";

import type { ContextOf } from "../definition/domain.js";
import {
  Defect,
  Diagnostic,
  Failure,
  Interrupt,
  type PublicDiagnostic,
} from "../diagnostic/diagnostic.js";
import type { Machine } from "../machine/machine.js";
import type { MachineDefinition } from "../machine/grammar.js";
import type {
  ActorContextBinding,
  ActorDependencyEdge,
  ActorFence,
  ActorKey,
} from "./actor-admission.js";
import type { OperationOccurrenceFence } from "./turn-plan.js";
import {
  RuntimeEvidence,
  type RuntimeEvidenceService,
  type RuntimeLifecycleEvidence,
  type RuntimeServiceContext,
} from "./runtime-services.js";
import type { ActorRef } from "./actor-ref.js";
import { cancelRuntimeEvidence, prepareLifecycleEvidence } from "./evidence.js";
import { copyArray, copyObject } from "./collection-copies.js";

/** The only actor lifecycle states. */
export type ActorLifecycle = "prepared" | "active" | "suspended" | "disposed";

/** Lifecycle causes are retained as private evidence, never as machine turns. */
export type LifecycleCause<CleanupError> =
  | { _tag: "fresh" }
  | { _tag: "restore" }
  | { _tag: "attachment" }
  | { _tag: "owner-disposal" }
  | { _tag: "runtime-disposal" }
  | {
      _tag: "cleanup-failure";
      exit: Exit.Exit<void, CleanupError>;
      cause: Cause.Cause<CleanupError>;
    };

/** Lifecycle control shares the actor's one serialized mailbox lane. */
export type LifecycleCommand<CleanupError> =
  | { _tag: "actor:start"; cause: LifecycleCause<CleanupError> }
  | { _tag: "actor:restore"; cause: LifecycleCause<CleanupError> }
  | { _tag: "actor:suspend"; cause: LifecycleCause<CleanupError> }
  | { _tag: "actor:resume"; cause: LifecycleCause<CleanupError> }
  | { _tag: "actor:dispose"; cause: LifecycleCause<CleanupError> };

/** A resource is closed by its actor owner and retains its exact finalizer Cause. */
export type LifecycleResource<CleanupError> = {
  name: string;
  close: (exit: Exit.Exit<void, CleanupError>) => Effect.Effect<void, CleanupError>;
  /** Continuing resources provide a fresh owner-scoped resource on resume. */
  reacquire?: () => Effect.Effect<LifecycleResource<CleanupError>, CleanupError>;
  finalization: "pending" | "running" | "done" | "failed";
  cause: Option.Option<Cause.Cause<CleanupError>>;
};

/** Work is interrupted and awaited before any resource finalizer runs. */
export type LifecycleWork<CleanupError> = {
  name: string;
  fiber: Fiber.Fiber<void, CleanupError>;
  cancel: Effect.Effect<void, CleanupError>;
  finalizer: Effect.Effect<void, CleanupError>;
  /** Continuing work provides a fresh owner-scoped work item on resume. */
  reacquire?: () => Effect.Effect<LifecycleWork<CleanupError>, CleanupError>;
  finalization: "pending" | "running" | "done" | "failed";
  cause: Option.Option<Cause.Cause<CleanupError>>;
  completion?: Deferred.Deferred<Exit.Exit<void, CleanupError>>;
  fence?: ActorFence;
};

/** Operation identity is retained as opaque fence data across suspension. */
export type LifecycleOperationRecord<_DefinitionValue extends MachineDefinition, CleanupError> = {
  fence: OperationOccurrenceFence;
  status: "running" | "settled" | "cancelled" | "stale";
  finalization: "pending" | "running" | "done" | "failed";
  cause: Option.Option<Cause.Cause<CleanupError>>;
};

/** Timer identity is an absolute deadline, never a replayed duration. */
export type LifecycleTimer<CleanupError = never> = {
  name: string;
  startedAt: number;
  dueAt: number;
  status: "armed" | "fired" | "cancelled";
  /** A timer from another actor generation is inert on resume. */
  generation?: number;
  /** Optional continuing refresh; finite work is never reconstructed here. */
  refresh?: Effect.Effect<void, CleanupError>;
};

/** A provider-dependent owner cannot dispose while these logical edges remain. */
export type BlockedDisposal<DefinitionValue extends MachineDefinition> = {
  dependentActors: ActorRef<Machine<DefinitionValue>>[];
  bindingKeys: (keyof ContextOf<DefinitionValue> & string)[];
};

/** Detached attachments retain all logical truth while live resources are absent. */
export type LifecycleAttachment<
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  status: "attached" | "detached";
  resources: LifecycleResource<CleanupError>[];
  work: LifecycleWork<CleanupError>[];
  dependencies: ActorDependencyEdge[];
  bindings: ActorContextBinding<DefinitionValue, ProviderDefinition>[];
  providerRevisions: Map<ActorKey, number>;
  cursors: Map<string, number>;
  operations: LifecycleOperationRecord<DefinitionValue, CleanupError>[];
  timers: LifecycleTimer<CleanupError>[];
  /** Optional current-provider fence table used by resume reconciliation. */
  providerFences?: Map<ActorKey, ActorFence>;
  /** Optional registry-provided dependent detail for exact disposal refusal. */
  blockedDisposal?: BlockedDisposal<DefinitionValue>;
};

/** Admitted context metadata installed before the actor crosses its start barrier. */
export type LifecycleAttachmentMetadata<
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  dependencies: ActorDependencyEdge[];
  bindings: ActorContextBinding<DefinitionValue, ProviderDefinition>[];
  providerRevisions: Map<ActorKey, number>;
  providerFences: Map<ActorKey, ActorFence>;
};

/** One owned lifecycle publication cut. */
export type LifecycleSnapshot<
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  lifecycle: ActorLifecycle;
  fence: ActorFence;
  attachment: LifecycleAttachment<DefinitionValue, CleanupError, ProviderDefinition>;
  finalization: "not-started" | "running" | "done" | "failed";
};

/** A legal transition is computed before its effectful cleanup begins. */
export type LifecycleTransition<CleanupError> = {
  from: ActorLifecycle;
  to: ActorLifecycle;
  command: LifecycleCommand<CleanupError>;
  cause: LifecycleCause<CleanupError>;
};

/** Restore is the evidence-only prepared-to-prepared transition. */
export type PreparedRestoreTransition<CleanupError> = LifecycleTransition<CleanupError> & {
  from: "prepared";
  to: "prepared";
  command: Extract<LifecycleCommand<CleanupError>, { _tag: "actor:restore" }>;
};

type LifecycleStateKey = {
  lifecycle: ActorLifecycle;
  fence: ActorFence;
};

type TimerClaim = {
  generation: number;
  status: "claimed" | "fired";
};

/** Mutable lifecycle protocol installed on and owned by one ActorCell. */
export type ActorCellProtocolState<Snapshot extends LifecycleStateKey> = {
  current: Snapshot | undefined;
  publicationRevision: number;
  cleanupCause: Cause.Cause<unknown> | undefined;
  /** The complete terminal result after lifecycle evidence settles. */
  disposalExit: Exit.Exit<Snapshot, PublicDiagnostic> | undefined;
  /** The cleanup-stage result used by direct lifecycle disposal callers. */
  disposalAttempt: Exit.Exit<Snapshot, PublicDiagnostic> | undefined;
  controllerBound: boolean;
  routing: { current: "open" | "blocked"; generation: number };
  timerClaims: Map<string, TimerClaim>;
  overdueGeneration: number | undefined;
};

export type ActorCell<Snapshot extends LifecycleStateKey> = {
  activityFibers: FiberMap.FiberMap<string, void, unknown> | undefined;
  protocol: ActorCellProtocolState<Snapshot> | undefined;
};

const actorCellProtocolOf = <Snapshot extends LifecycleStateKey>(actorCell: ActorCell<Snapshot>) =>
  actorCell.protocol;

const copyFence = (fence: ActorFence) => copyObject({ ...fence });

const sameFence = (left: ActorFence, right: ActorFence) =>
  left.key === right.key &&
  left.incarnation === right.incarnation &&
  left.generation === right.generation &&
  left.leaseEpoch === right.leaseEpoch;

const validFence = (fence: ActorFence) =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- runtime fence validation protects this internal admission seam.
  typeof fence.key === "string" &&
  fence.key.length > 0 &&
  Number.isSafeInteger(fence.incarnation) &&
  fence.incarnation > 0 &&
  Number.isSafeInteger(fence.generation) &&
  fence.generation >= 0 &&
  Number.isSafeInteger(fence.leaseEpoch) &&
  fence.leaseEpoch >= 0;

const transitionFailure = (from: ActorLifecycle, command: LifecycleCommand<unknown>) =>
  Failure({
    code: "InvalidLifecycleTransition",
    path: ["lifecycle", from, command._tag],
    details: { from, command: command._tag },
    summary: "Lifecycle transition is not valid for the current actor state.",
    help: "Use prepared-to-active, active-to-suspended, suspended-to-active, or terminal disposal.",
  });

const invalidSnapshot = (reason: string) =>
  Failure({
    code: "InvalidLifecycleTransition",
    path: ["lifecycle", "snapshot"],
    details: { reason },
    summary: "Lifecycle snapshot is invalid.",
    help: "Use one actor fence and one retained attachment owned by that actor.",
  });

const missingProvider = (key: ActorKey) =>
  Failure({
    code: "MissingContextProvider",
    path: ["lifecycle", "provider", key],
    details: { provider: key },
    summary: "A retained context provider is unavailable during resume.",
    help: "Keep the original provider alive or dispose the suspended consumer.",
  });

const staleProvider = (key: ActorKey) =>
  Failure({
    code: "MismatchedActorRef",
    path: ["lifecycle", "provider", key],
    details: { provider: key },
    summary: "A retained context provider fence is stale.",
    help: "Resume only against the retained provider incarnation and lease fence.",
  });

const blockedByDependents = (dependentActors: (ActorRef | ActorKey)[], bindingKeys: string[]) =>
  Failure({
    code: "BlockedByDependents",
    path: ["lifecycle", "dispose"],
    details: {
      dependents: dependentActors.length,
      dependentActors: dependentActors
        .map((actor) =>
          // oxlint-disable-next-line anti-slop/no-runtime-typeof -- ActorKey and ActorRef are the admitted diagnostic variants.
          typeof actor === "string" ? actor : `${actor.machine.definition.id}:${actor.id}`,
        )
        .join(","),
      bindingKeys: bindingKeys.join(","),
    },
    summary: "Actor disposal is blocked by retained dependent context edges.",
    help: "Release every dependent binding before disposing this actor.",
  });

// RETURN_TYPE: Public cleanup classification deliberately projects full Cause into a Diagnostic.
const cleanupDiagnostic = (cause: Cause.Cause<unknown>): PublicDiagnostic => {
  const defect = cause.reasons.find(Cause.isDieReason);

  if (defect !== undefined) return Defect(defect.defect);
  const failure = cause.reasons.find(Cause.isFailReason);

  if (failure !== undefined && failure.error instanceof Diagnostic) return failure.error;

  if (Cause.hasInterruptsOnly(cause)) return Interrupt();

  return Failure({
    code: "CleanupFailed",
    path: ["lifecycle", "cleanup"],
    details: { reason: failure === undefined ? "unknown" : "typed-failure" },
    summary: "Actor cleanup failed.",
    help: "Inspect the retained cleanup Cause before attempting resume.",
  });
};

const addCause = <Error>(current: Cause.Cause<Error> | undefined, next: Cause.Cause<Error>) =>
  current === undefined
    ? Cause.fromReasons([...next.reasons])
    : Cause.fromReasons([...current.reasons, ...next.reasons]);

const combineCauses = <Error>(
  current: Cause.Cause<Error> | undefined,
  next: Cause.Cause<Error> | undefined,
) => {
  if (current === undefined)
    return next === undefined ? undefined : Cause.fromReasons([...next.reasons]);

  if (next === undefined) return current;

  return Cause.fromReasons([...current.reasons, ...next.reasons]);
};

const makeTerminalEffect = <Value, Error, Requirements>(
  operation: Effect.Effect<Value, Error, Requirements>,
) => {
  let completion: Deferred.Deferred<Exit.Exit<Value, Error>> | undefined;

  const resolve = (exit: Exit.Exit<Value, Error>) =>
    Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(exit.cause);

  return () => {
    return Effect.suspend(() => {
      if (completion !== undefined)
        return Deferred.await(completion).pipe(Effect.flatMap((exit) => resolve(exit)));
      const cell = Deferred.makeUnsafe<Exit.Exit<Value, Error>>();
      completion = cell;

      return Effect.uninterruptible(
        Effect.exit(operation).pipe(
          Effect.flatMap((exit) => Deferred.succeed(cell, exit).pipe(Effect.as(exit))),
          Effect.flatMap((exit) => resolve(exit)),
        ),
      );
    });
  };
};

const rememberState = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  actorCell: ActorCell<LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>>,
  next: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
) => {
  const owner = actorCellProtocolOf(actorCell);

  if (owner !== undefined) owner.current = next;
};

const currentState = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  actorCell: ActorCell<LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>>,
) => {
  const owner = actorCellProtocolOf(actorCell);

  if (owner === undefined) return state;

  if (owner.current === undefined)
    throw new Error("Lifecycle owner lost its authoritative current snapshot");

  const current = owner.current;

  // A lifecycle snapshot is a value projection. Callers may enrich that value with
  // attachment data before the next transition, so only a lifecycle/fence mismatch
  // is treated as an older owner view; matching values remain the explicit input.
  return state.lifecycle === current.lifecycle && sameFence(state.fence, current.fence)
    ? state
    : current;
};

const ownerState = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  actorCell: ActorCell<LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>>,
) => {
  const owner = actorCellProtocolOf(actorCell);

  if (owner === undefined) return state;

  if (owner.current === undefined)
    throw new Error("Lifecycle owner lost its authoritative current snapshot");

  return owner.current;
};

const copyResource = <CleanupError>(
  resource: LifecycleResource<CleanupError>,
  finalization = resource.finalization,
  cause = resource.cause,
) => copyObject({ ...resource, finalization, cause });

const copyWork = <CleanupError>(
  work: LifecycleWork<CleanupError>,
  finalization = work.finalization,
  cause = work.cause,
) => copyObject({ ...work, finalization, cause });

// RETURN_TYPE: Conditional binding types require an explicit owned shallow-copy contract.
const copyBinding = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
  Slot extends keyof ContextOf<ConsumerDefinition> & string,
  ProviderRef extends ActorRef<Machine<ProviderDefinition>>,
>(
  binding: ActorContextBinding<ConsumerDefinition, ProviderDefinition, Slot, ProviderRef>,
): ActorContextBinding<ConsumerDefinition, ProviderDefinition, Slot, ProviderRef> => {
  const copied = copyObject({ ...binding, providerFence: copyFence(binding.providerFence) });

  // SAFETY: copied retains every binding field and replaces its fence with an owned copy.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- conditional binding types cannot express this structural copy.
  return copied;
};

const copyAttachment = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  attachment: LifecycleAttachment<DefinitionValue, CleanupError, ProviderDefinition>,
  status = attachment.status,
) => {
  const copied = {
    ...attachment,
    status,
    resources: copyArray(attachment.resources.map((resource) => copyResource(resource))),
    work: copyArray(attachment.work.map((work) => copyWork(work))),
    dependencies: copyArray(attachment.dependencies.map((edge) => copyObject({ ...edge }))),
    bindings: copyArray(attachment.bindings.map((binding) => copyBinding(binding))),
    providerRevisions: new Map(attachment.providerRevisions.entries()),
    cursors: new Map(attachment.cursors.entries()),
    operations: copyArray(attachment.operations.map((operation) => copyObject({ ...operation }))),
    timers: copyArray(attachment.timers.map((timer) => copyObject({ ...timer }))),
  };

  if (attachment.providerFences !== undefined) {
    copied.providerFences = new Map(
      [...attachment.providerFences].map(([key, fence]) => [key, copyFence(fence)] as const),
    );
  }

  if (attachment.blockedDisposal !== undefined) {
    copied.blockedDisposal = copyObject({
      dependentActors: copyArray(attachment.blockedDisposal.dependentActors),
      bindingKeys: copyArray(attachment.blockedDisposal.bindingKeys),
    });
  }

  return copyObject(copied);
};

const copySnapshot = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  actorCell: ActorCell<LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>>,
  state: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  lifecycle: ActorLifecycle,
  attachment: LifecycleAttachment<DefinitionValue, CleanupError, ProviderDefinition>,
  finalization: LifecycleSnapshot<
    DefinitionValue,
    CleanupError,
    ProviderDefinition
  >["finalization"],
  cleanupCause?: Cause.Cause<CleanupError>,
) => {
  const owner = actorCellProtocolOf(actorCell);

  if (owner === undefined) throw new Error("Lifecycle snapshot has no ActorCell protocol");
  owner.publicationRevision += 1;
  if (cleanupCause !== undefined) owner.cleanupCause = cleanupCause;

  const next = copyObject({
    lifecycle,
    fence: copyFence(state.fence),
    attachment,
    finalization,
  });

  rememberState(actorCell, next);

  return next;
};

// oxlint-disable-next-line anti-slop/no-excessive-cognitive-complexity -- transition legality is one finite lifecycle graph.
const transitionTarget = <CleanupError>(
  state: ActorLifecycle,
  command: LifecycleCommand<CleanupError>,
) => {
  switch (command._tag) {
    case "actor:restore":
      if (state !== "prepared") return undefined;

      return command.cause._tag === "restore" ? "prepared" : undefined;
    case "actor:start":
      if (state !== "prepared") return undefined;

      return command.cause._tag === "fresh" || command.cause._tag === "attachment"
        ? "active"
        : undefined;
    case "actor:suspend":
      return state === "active" ? "suspended" : undefined;
    case "actor:resume":
      return state === "suspended" ? "active" : undefined;
    case "actor:dispose":
      if (state === "disposed") return undefined;

      return command.cause._tag === "owner-disposal" || command.cause._tag === "runtime-disposal"
        ? "disposed"
        : undefined;
  }
};

/** Computes only the legal lifecycle graph; disposal is idempotent at the owner API. */
// RETURN_TYPE: The pure public graph function preserves its diagnostic Result boundary.
export const transitionLifecycle = <CleanupError>(
  state: ActorLifecycle,
  command: LifecycleCommand<CleanupError>,
): Result.Result<LifecycleTransition<CleanupError>, PublicDiagnostic> => {
  const to = transitionTarget(state, command);

  if (to === undefined) return Result.fail(transitionFailure(state, command));

  return Result.succeed({ from: state, to, command, cause: command.cause });
};

/** Creates a prepared actor with no live attachment resources or activity fibers. */
// RETURN_TYPE: The public preparation boundary preserves its generic snapshot type.
export const prepareLifecycle = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  fence: ActorFence,
  cause: LifecycleCause<CleanupError>,
  actorCell: ActorCell<LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>>,
): Result.Result<
  LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic
> => {
  if (!validFence(fence)) return Result.fail(invalidSnapshot("fence"));

  if (cause._tag !== "fresh" && cause._tag !== "restore")
    return Result.fail(invalidSnapshot("prepare-cause"));

  if (actorCell.protocol !== undefined) return Result.fail(invalidSnapshot("actor-cell-in-use"));

  const snapshot = copyObject({
    lifecycle: "prepared" as const,
    fence: copyFence(fence),
    attachment: copyObject({
      status: "detached" as const,
      resources: copyArray<LifecycleResource<CleanupError>>([]),
      work: copyArray<LifecycleWork<CleanupError>>([]),
      dependencies: copyArray<ActorDependencyEdge>([]),
      bindings: copyArray<ActorContextBinding<DefinitionValue, ProviderDefinition>>([]),
      providerRevisions: new Map<ActorKey, number>(),
      cursors: new Map<string, number>(),
      operations: copyArray<LifecycleOperationRecord<DefinitionValue, CleanupError>>([]),
      timers: copyArray<LifecycleTimer>([]),
    }),
    finalization: "not-started" as const,
  });

  const owner: ActorCellProtocolState<
    LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>
  > = {
    current: undefined,
    publicationRevision: 0,
    cleanupCause: undefined,
    disposalExit: undefined,
    disposalAttempt: undefined,
    controllerBound: false,
    routing: { current: "blocked", generation: 0 },
    timerClaims: new Map(),
    overdueGeneration: undefined,
  };

  actorCell.protocol = owner;
  owner.current = snapshot;

  return Result.succeed(snapshot);
};

/** Installs admitted context metadata without creating a lifecycle transition or publication. */
export const installLifecycleMetadata = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  input: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  metadata: LifecycleAttachmentMetadata<DefinitionValue, ProviderDefinition>,
  actorCell: ActorCell<LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>>,
) => {
  if (actorCellProtocolOf(actorCell) === undefined) return Result.fail(invalidSnapshot("owner"));
  const state = currentState(input, actorCell);

  if (state !== input) return Result.fail(invalidSnapshot("stale-snapshot"));

  if (state.lifecycle !== "prepared" && state.lifecycle !== "active")
    return Result.fail(invalidSnapshot("attachment-install-state"));

  const attachment = copyAttachment({
    ...state.attachment,
    dependencies: metadata.dependencies,
    bindings: metadata.bindings,
    providerRevisions: metadata.providerRevisions,
    providerFences: metadata.providerFences,
  });

  const next = copyObject({
    lifecycle: state.lifecycle,
    fence: copyFence(state.fence),
    attachment,
    finalization: state.finalization,
  });

  rememberState(actorCell, next);

  return Result.succeed(next);
};

/** Installs persisted timer projections into the actor-owned lifecycle before start. */
export const installLifecycleTimers = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  input: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  timers: Pick<LifecycleTimer, "name" | "startedAt" | "dueAt">[],
  actorCell: ActorCell<LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>>,
) => {
  if (actorCellProtocolOf(actorCell) === undefined) return Result.fail(invalidSnapshot("owner"));
  const state = currentState(input, actorCell);

  if (state.lifecycle !== "prepared") return Result.fail(invalidSnapshot("timer-install-state"));

  const attachment = copyAttachment({
    ...state.attachment,
    timers: timers.map((timer) =>
      copyObject({
        ...timer,
        status: "armed" as const,
        generation: state.fence.generation,
      }),
    ),
  });

  const next = copyObject({
    lifecycle: state.lifecycle,
    fence: copyFence(state.fence),
    attachment,
    finalization: state.finalization,
  });

  rememberState(actorCell, next);

  return Result.succeed(next);
};

const retainedCleanupCause = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  actorCell: ActorCell<LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>>,
) => {
  const retained = actorCellProtocolOf(actorCell)?.cleanupCause;

  if (retained !== undefined) {
    // SAFETY: the cause is stored by copySnapshot for this exact snapshot and cleanup error.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- private owner metadata erases the generic boundary.
    return retained as Cause.Cause<CleanupError>;
  }

  let cause: Cause.Cause<CleanupError> | undefined;

  for (const item of [...state.attachment.work, ...state.attachment.resources]) {
    if (Option.isSome(item.cause)) cause = addCause(cause, item.cause.value);
  }

  return cause;
};

/** Activates a prepared snapshot after its silent baseline has been installed. */
// RETURN_TYPE: The explicit environment preserves the runtime capability boundary for lifecycle stages.
export const activateLifecycle = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  input: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  actorCell: ActorCell<LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>>,
): Effect.Effect<
  LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic,
  RuntimeServiceContext
> => {
  if (actorCellProtocolOf(actorCell) === undefined) return Effect.fail(invalidSnapshot("owner"));
  const state = currentState(input, actorCell);

  if (state.lifecycle !== "prepared")
    return Effect.fail(
      transitionFailure(state.lifecycle, { _tag: "actor:start", cause: { _tag: "attachment" } }),
    );

  if (
    state.attachment.status !== "detached" ||
    state.attachment.resources.some((resource) => resource.finalization === "running") ||
    state.attachment.work.some((work) => work.finalization === "running")
  )
    return Effect.fail(invalidSnapshot("prepared-live-attachment"));
  const attachment = copyAttachment(state.attachment, "attached");

  return Effect.sync(() => copySnapshot(actorCell, state, "active", attachment, "not-started"));
};

type CleanupRun<
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
> = {
  attachment: LifecycleAttachment<DefinitionValue, CleanupError, ProviderDefinition>;
  cause: Cause.Cause<CleanupError> | undefined;
};

const cleanupWorkItem = <CleanupError>(item: LifecycleWork<CleanupError>) =>
  Effect.gen(function* () {
    let itemCause: Cause.Cause<CleanupError> | undefined;
    const cancelled = yield* Effect.exit(item.cancel);

    if (Exit.isFailure(cancelled)) itemCause = addCause(itemCause, cancelled.cause);

    const completed = yield* Effect.exit(Fiber.await(item.fiber));
    let completion: Exit.Exit<void, CleanupError>;

    if (Exit.isSuccess(completed)) completion = completed.value;
    else {
      // SAFETY: Fiber.await has no typed failure channel; only its Exit is observed here.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- normalize an impossible outer interruption.
      completion = Exit.failCause(completed.cause);
    }

    if (item.completion !== undefined)
      yield* Deferred.succeed(item.completion, completion).pipe(Effect.asVoid);

    if (
      Exit.isFailure(completion) &&
      !(Exit.isSuccess(cancelled) && Cause.hasInterruptsOnly(completion.cause))
    )
      itemCause = addCause(itemCause, completion.cause);

    const finalized = yield* Effect.exit(item.finalizer);

    if (Exit.isFailure(finalized)) itemCause = addCause(itemCause, finalized.cause);

    return {
      item: copyWork(
        item,
        itemCause === undefined ? "done" : "failed",
        itemCause === undefined ? Option.none() : Option.some(itemCause),
      ),
      cause: itemCause,
    };
  });

const cleanupWork = <CleanupError>(items: LifecycleWork<CleanupError>[]) =>
  Effect.gen(function* () {
    let cleanupCause: Cause.Cause<CleanupError> | undefined;
    const work = items.map((item) => copyWork(item));

    for (let index = work.length - 1; index >= 0; index -= 1) {
      const item = work[index];

      if (item === undefined) continue;

      if (item.finalization !== "pending" && item.finalization !== "failed") continue;
      const cleaned = yield* cleanupWorkItem(item);

      if (cleaned.cause !== undefined) cleanupCause = addCause(cleanupCause, cleaned.cause);
      work[index] = cleaned.item;
    }

    return { work: copyArray(work), cause: cleanupCause };
  });

const cleanupResource = <CleanupError>(resource: LifecycleResource<CleanupError>) =>
  Effect.gen(function* () {
    let resourceCause: Cause.Cause<CleanupError> | undefined;
    const closed = yield* Effect.exit(resource.close(Exit.void));

    if (Exit.isFailure(closed)) resourceCause = addCause(resourceCause, closed.cause);

    return {
      resource: copyResource(
        resource,
        resourceCause === undefined ? "done" : "failed",
        resourceCause === undefined ? Option.none() : Option.some(resourceCause),
      ),
      cause: resourceCause,
    };
  });

const cleanupResources = <CleanupError>(items: LifecycleResource<CleanupError>[]) =>
  Effect.gen(function* () {
    let cleanupCause: Cause.Cause<CleanupError> | undefined;
    const resources = items.map((resource) => copyResource(resource));

    for (let index = resources.length - 1; index >= 0; index -= 1) {
      const resource = resources[index];

      if (resource === undefined) continue;

      if (resource.finalization !== "pending" && resource.finalization !== "failed") continue;
      const cleaned = yield* cleanupResource(resource);

      if (cleaned.cause !== undefined) cleanupCause = addCause(cleanupCause, cleaned.cause);
      resources[index] = cleaned.resource;
    }

    return { resources: copyArray(resources), cause: cleanupCause };
  });

// RETURN_TYPE: Ordered cleanup retains full work/resource Cause data before publication.
const cleanupAttachment = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  attachment: LifecycleAttachment<DefinitionValue, CleanupError, ProviderDefinition>,
): Effect.Effect<CleanupRun<DefinitionValue, CleanupError, ProviderDefinition>, never, never> =>
  Effect.uninterruptible(
    Effect.gen(function* () {
      const work = yield* cleanupWork(attachment.work);
      const resources = yield* cleanupResources(attachment.resources);

      return {
        attachment: copyObject({
          ...copyAttachment(attachment, "detached"),
          work: work.work,
          resources: resources.resources,
        }),
        cause: combineCauses(work.cause, resources.cause),
      };
    }),
  );

type ReacquiredAttachment<CleanupError> = {
  resources: LifecycleResource<CleanupError>[];
  work: LifecycleWork<CleanupError>[];
  acquiredResources: LifecycleResource<CleanupError>[];
  acquiredWork: LifecycleWork<CleanupError>[];
};

const rollbackReacquired = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  resources: LifecycleResource<CleanupError>[],
  work: LifecycleWork<CleanupError>[],
) =>
  cleanupAttachment({
    ...copyAttachment(state.attachment, "detached"),
    resources: copyArray(resources),
    work: copyArray(work),
  });

const reacquireResourceItems = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  resources: LifecycleResource<CleanupError>[],
  acquiredResources: LifecycleResource<CleanupError>[],
) =>
  Effect.gen(function* () {
    for (const retained of state.attachment.resources) {
      if (retained.finalization !== "done" || retained.reacquire === undefined) {
        resources.push(copyResource(retained));
        continue;
      }

      const acquired = yield* Effect.exit(retained.reacquire());

      if (Exit.isFailure(acquired)) return acquired.cause;
      const resource = copyResource(acquired.value, "pending", Option.none());
      resources.push(resource);
      acquiredResources.push(resource);
    }

    return undefined;
  });

const reacquireWorkItems = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  work: LifecycleWork<CleanupError>[],
  acquiredWork: LifecycleWork<CleanupError>[],
) =>
  Effect.gen(function* () {
    for (const retained of state.attachment.work) {
      if (retained.name.startsWith("timer:")) continue;

      if (retained.finalization !== "done" || retained.reacquire === undefined) {
        work.push(copyWork(retained));
        continue;
      }

      const acquired = yield* Effect.exit(retained.reacquire());

      if (Exit.isFailure(acquired)) return acquired.cause;
      const item = copyWork(acquired.value, "pending", Option.none());
      work.push(item);
      acquiredWork.push(item);
    }

    return undefined;
  });

// RETURN_TYPE: Continuing attachments roll back atomically when reacquisition fails.
const reacquireAttachment = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  actorCell: ActorCell<LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>>,
): Effect.Effect<ReacquiredAttachment<CleanupError>, PublicDiagnostic, RuntimeServiceContext> =>
  Effect.gen(function* () {
    const owner = actorCellProtocolOf(actorCell);

    if (owner === undefined) return yield* Effect.fail(invalidSnapshot("owner"));
    const resources: LifecycleResource<CleanupError>[] = [];
    const work: LifecycleWork<CleanupError>[] = [];
    const acquiredResources: LifecycleResource<CleanupError>[] = [];
    const acquiredWork: LifecycleWork<CleanupError>[] = [];

    const failAfterRollback = (cause: Cause.Cause<CleanupError>) =>
      Effect.gen(function* () {
        const rolledBack = yield* Effect.exit(
          rollbackReacquired(state, acquiredResources, acquiredWork),
        );

        if (Exit.isFailure(rolledBack))
          return yield* Effect.fail(cleanupDiagnostic(addCause(cause, rolledBack.cause)));

        return yield* Effect.fail(cleanupDiagnostic(cause));
      });

    const resourceFailure = yield* reacquireResourceItems(state, resources, acquiredResources);

    if (resourceFailure !== undefined) return yield* failAfterRollback(resourceFailure);

    const workFailure = yield* reacquireWorkItems(state, work, acquiredWork);

    if (workFailure !== undefined) return yield* failAfterRollback(workFailure);

    return {
      resources: copyArray(resources),
      work: copyArray(work),
      acquiredResources: copyArray(acquiredResources),
      acquiredWork: copyArray(acquiredWork),
    };
  });

// RETURN_TYPE: Provider reconciliation preserves the fail-closed diagnostic Result boundary.
const validateProviders = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  attachment: LifecycleAttachment<DefinitionValue, CleanupError, ProviderDefinition>,
): Result.Result<void, PublicDiagnostic> => {
  for (const binding of attachment.bindings) {
    const key = binding.providerFence.key;
    const current = attachment.providerFences?.get(key);

    if (current === undefined) return Result.fail(missingProvider(key));

    if (!sameFence(current, binding.providerFence)) return Result.fail(staleProvider(key));
    const revision = attachment.providerRevisions.get(key);

    if (revision === undefined || !Number.isSafeInteger(revision) || revision < 0)
      return Result.fail(missingProvider(key));
  }

  return Result.succeed(undefined);
};

/** Suspends only after work interruption/completion and reverse resource cleanup settle. */
// RETURN_TYPE: The explicit environment preserves the runtime capability boundary for lifecycle stages.
export const suspendLifecycle = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  input: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  actorCell: ActorCell<LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>>,
): Effect.Effect<
  LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic,
  RuntimeServiceContext
> => {
  const owner = actorCellProtocolOf(actorCell);

  if (owner === undefined) return Effect.fail(invalidSnapshot("owner"));
  const state = currentState(input, actorCell);

  if (state.lifecycle !== "active")
    return Effect.fail(
      transitionFailure(state.lifecycle, { _tag: "actor:suspend", cause: { _tag: "attachment" } }),
    );

  return cleanupAttachment(state.attachment).pipe(
    Effect.flatMap((cleaned) => {
      const next = copySnapshot(
        actorCell,
        state,
        "suspended",
        cleaned.attachment,
        cleaned.cause === undefined ? "done" : "failed",
        cleaned.cause,
      );

      for (const timer of state.attachment.timers) {
        const timerKey = retainedTimerKey(timer, state.fence.generation);
        const claim = owner.timerClaims.get(timerKey);

        if (claim?.generation === state.fence.generation && claim.status === "claimed")
          owner.timerClaims.delete(timerKey);
      }

      if (cleaned.cause !== undefined) return Effect.fail(cleanupDiagnostic(cleaned.cause));

      return Effect.succeed(next);
    }),
  );
};

const retainedTimerKey = <CleanupError>(timer: LifecycleTimer<CleanupError>, generation: number) =>
  `${timer.name}\u0000${timer.startedAt}\u0000${timer.dueAt}\u0000${timer.generation ?? generation}`;

const claimRetainedTimer = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  owner: ActorCellProtocolState<
    LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>
  >,
  state: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  timer: LifecycleTimer<CleanupError>,
  now: number,
) => {
  if (timer.status !== "armed") return undefined;

  if (timer.generation !== undefined && timer.generation !== state.fence.generation)
    return undefined;

  const timerKey = retainedTimerKey(timer, state.fence.generation);
  const claim = owner.timerClaims.get(timerKey);
  const overdue = now >= timer.dueAt;

  if (claim !== undefined && claim.generation === state.fence.generation) return undefined;

  if (overdue && owner.overdueGeneration === state.fence.generation) return undefined;

  if (overdue) owner.overdueGeneration = state.fence.generation;

  const nextClaim: TimerClaim = {
    generation: state.fence.generation,
    status: "claimed",
  };

  owner.timerClaims.set(timerKey, nextClaim);

  return { timerKey, nextClaim };
};

// RETURN_TYPE: Timer scheduling uses the ActorCell-owned FiberMap and captured Clock capability.
const scheduleRetainedTimers = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  actorCell: ActorCell<LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>>,
): Effect.Effect<LifecycleWork<CleanupError>[], PublicDiagnostic, RuntimeServiceContext> =>
  Effect.gen(function* () {
    const owner = actorCellProtocolOf(actorCell);

    if (owner === undefined) return yield* Effect.fail(invalidSnapshot("owner"));
    const timers = state.attachment.timers.filter(
      (timer) =>
        timer.status === "armed" &&
        (timer.generation === undefined || timer.generation === state.fence.generation),
    );

    if (timers.length === 0) return copyArray<LifecycleWork<CleanupError>>([]);
    const clock = yield* Effect.service(Clock.Clock);
    const now = yield* clock.currentTimeMillis;
    const fibers = actorCell.activityFibers;

    if (fibers === undefined) return yield* Effect.fail(invalidSnapshot("activity-fibers"));
    const timerWork: LifecycleWork<CleanupError>[] = [];

    for (const timer of timers) {
      const claim = claimRetainedTimer(owner, state, timer, now);

      if (claim === undefined) continue;

      const { timerKey, nextClaim } = claim;
      const completion = Deferred.makeUnsafe<Exit.Exit<void, CleanupError>>();

      const work = Effect.gen(function* () {
        const remaining = timer.dueAt - (yield* clock.currentTimeMillis);

        if (remaining > 0) yield* clock.sleep(Duration.millis(remaining));

        if (timer.refresh !== undefined) yield* timer.refresh;
      }).pipe(
        Effect.onExit((exit) =>
          Effect.sync(() => {
            const retained = owner.timerClaims.get(timerKey);

            // A suspended overdue fiber can finish after a later resume has
            // installed a fresh claim for the same retained timer. Only the
            // exact claim that owns this fiber may clear or fire the entry.
            if (retained !== nextClaim) return;

            if (Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause))
              owner.timerClaims.delete(timerKey);
            else retained.status = "fired";
          }),
        ),
      );

      const started = yield* Effect.exit(
        FiberMap.run(fibers, timerKey, {
          startImmediately: true,
          propagateInterruption: true,
        })(
          Effect.scoped(
            work.pipe(
              Effect.onExit((exit) => Deferred.succeed(completion, exit).pipe(Effect.asVoid)),
            ),
          ),
        ),
      );

      if (Exit.isFailure(started)) {
        if (owner.timerClaims.get(timerKey) === nextClaim) owner.timerClaims.delete(timerKey);

        return yield* Effect.fail(cleanupDiagnostic(started.cause));
      }

      timerWork.push(
        copyObject({
          name: `timer:${timer.name}`,
          fiber: started.value,
          cancel: Fiber.interrupt(started.value),
          finalizer: Effect.void,
          finalization: "pending" as const,
          cause: Option.none<Cause.Cause<CleanupError>>(),
          completion,
          fence: state.fence,
        }),
      );
    }

    return copyArray(timerWork);
  });

/** Resumes one retained actor after provider reconciliation and finalization. */
// RETURN_TYPE: The explicit environment preserves the runtime capability boundary for lifecycle stages.
export const resumeLifecycle = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  input: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  actorCell: ActorCell<LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>>,
): Effect.Effect<
  LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic,
  RuntimeServiceContext
> => {
  if (actorCellProtocolOf(actorCell) === undefined) return Effect.fail(invalidSnapshot("owner"));
  const state = currentState(input, actorCell);

  if (state.lifecycle !== "suspended")
    return Effect.fail(
      transitionFailure(state.lifecycle, { _tag: "actor:resume", cause: { _tag: "attachment" } }),
    );

  if (state.finalization === "failed")
    return Effect.fail(
      Failure({
        code: "CleanupFailed",
        path: ["lifecycle", "resume"],
        details: { reason: "retained-cleanup-defect" },
        summary: "Suspended actor cannot resume after a cleanup defect.",
        help: "Dispose the owner or runtime after preserving the cleanup Cause.",
      }),
    );
  const providers = validateProviders(state.attachment);

  if (Result.isFailure(providers)) return Effect.fail(providers.failure);

  return reacquireAttachment(state, actorCell).pipe(
    Effect.flatMap((reacquired) =>
      scheduleRetainedTimers(state, actorCell).pipe(
        Effect.map((timerWork) =>
          copySnapshot(
            actorCell,
            state,
            "active",
            copyObject({
              ...copyAttachment(state.attachment, "attached"),
              resources: reacquired.resources,
              work: copyArray([...reacquired.work, ...timerWork]),
            }),
            "not-started",
          ),
        ),
        Effect.catchCause((cause) =>
          rollbackReacquired(state, reacquired.acquiredResources, reacquired.acquiredWork).pipe(
            Effect.matchCauseEffect({
              onFailure: (rollbackCause) =>
                Effect.fail(cleanupDiagnostic(addCause(cause, rollbackCause))),
              onSuccess: () => Effect.fail(cleanupDiagnostic(cause)),
            }),
          ),
        ),
      ),
    ),
  );
};

/** Disposes in owner order and retains failed cleanup Causes in lifecycle state. */
// RETURN_TYPE: The explicit environment preserves the runtime capability boundary for lifecycle stages.
export const disposeLifecycle = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  input: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  actorCell: ActorCell<LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>>,
): Effect.Effect<
  LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic,
  RuntimeServiceContext
> => {
  const owner = actorCellProtocolOf(actorCell);

  if (owner === undefined) return Effect.fail(invalidSnapshot("owner"));
  if (owner.disposalExit !== undefined) {
    const terminal = owner.disposalExit;

    return Exit.isFailure(terminal)
      ? Effect.failCause(terminal.cause)
      : Effect.succeed(terminal.value);
  }
  if (owner.disposalAttempt !== undefined) {
    const attempt = owner.disposalAttempt;

    return Exit.isFailure(attempt)
      ? Effect.failCause(attempt.cause)
      : Effect.succeed(attempt.value);
  }
  const state = currentState(input, actorCell);

  if (state.lifecycle === "disposed") return Effect.succeed(state);
  const blocked = state.attachment.blockedDisposal;

  const incoming = state.attachment.dependencies.filter(
    (edge) => edge.provider === state.fence.key,
  );

  if (blocked !== undefined && blocked.dependentActors.length > 0)
    return Effect.fail(blockedByDependents(blocked.dependentActors, blocked.bindingKeys));

  if (incoming.length > 0)
    return Effect.fail(
      blockedByDependents(
        incoming.map((edge) => edge.consumer),
        incoming.map((edge) => edge.slot),
      ),
    );
  const cleanup = cleanupAttachment(state.attachment);

  return cleanup.pipe(
    Effect.flatMap((cleaned) => {
      if (cleaned.cause !== undefined) {
        copySnapshot(
          actorCell,
          state,
          state.lifecycle,
          cleaned.attachment,
          "failed",
          cleaned.cause,
        );
        const attempt: Exit.Exit<
          LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
          PublicDiagnostic
        > = Exit.failCause(Cause.fail(cleanupDiagnostic(cleaned.cause)));
        owner.disposalAttempt = attempt;

        return Effect.failCause(Cause.fail(cleanupDiagnostic(cleaned.cause)));
      }

      const disposed = copySnapshot(actorCell, state, "disposed", cleaned.attachment, "done");
      owner.disposalAttempt = Exit.succeed(disposed);

      return Effect.succeed(disposed);
    }),
  );
};

// RETURN_TYPE: This private dispatcher retains the lifecycle stage environment and generic snapshot.
const lifecycleCommandEffect = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  command: LifecycleCommand<CleanupError>,
  actorCell: ActorCell<LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>>,
) => {
  switch (command._tag) {
    case "actor:restore":
      return Effect.sync(() =>
        copySnapshot(
          actorCell,
          state,
          "prepared",
          copyAttachment(state.attachment, "detached"),
          "not-started",
        ),
      );
    case "actor:start":
      return activateLifecycle(state, actorCell);
    case "actor:suspend":
      return suspendLifecycle(state, actorCell);
    case "actor:resume":
      return resumeLifecycle(state, actorCell);
    case "actor:dispose":
      return disposeLifecycle(state, actorCell);
  }
};

const resolveLifecycleExit = <Value>(exit: Exit.Exit<Value, PublicDiagnostic>) =>
  Exit.isFailure(exit) ? Effect.failCause(exit.cause) : Effect.succeed(exit.value);

/** Runs restore/start/suspend/resume/dispose through the one lifecycle command boundary. */
// oxlint-disable-next-line anti-slop/no-excessive-cognitive-complexity -- one publication barrier surrounds the lifecycle stage.
// RETURN_TYPE: This public command boundary intentionally retains all runtime capability requirements.
export const runLifecycleCommand = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  input: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  command: LifecycleCommand<CleanupError>,
  actorCell: ActorCell<LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>>,
): Effect.Effect<
  LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic,
  RuntimeServiceContext
> => {
  const owner = actorCellProtocolOf(actorCell);

  if (owner === undefined) return Effect.fail(invalidSnapshot("owner"));

  if (command._tag === "actor:dispose" && owner.disposalExit !== undefined)
    return resolveLifecycleExit(owner.disposalExit);

  const state = currentState(input, actorCell);
  const transition = transitionLifecycle(state.lifecycle, command);

  if (Result.isFailure(transition)) {
    if (state.lifecycle === "disposed" && command._tag === "actor:dispose")
      return Effect.succeed(state);

    return Effect.fail(transition.failure);
  }

  const transitionEffect: Effect.Effect<
    LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
    PublicDiagnostic,
    RuntimeServiceContext
  > = lifecycleCommandEffect(state, command, actorCell);

  return Effect.exit(transitionEffect).pipe(
    Effect.flatMap((exit) => {
      const after = ownerState(state, actorCell);

      if (after === state) return resolveLifecycleExit(exit);
      const cleanupCause = retainedCleanupCause(after, actorCell);

      const cause: LifecycleCause<CleanupError> =
        after.finalization === "failed" && cleanupCause !== undefined
          ? {
              _tag: "cleanup-failure",
              exit: Exit.failCause(cleanupCause),
              cause: cleanupCause,
            }
          : command.cause;

      let evidenceSequence: number | undefined;
      let evidenceService: RuntimeEvidenceService | undefined;

      return Effect.gen(function* () {
        const clock = yield* Effect.service(Clock.Clock);
        const service = yield* Effect.service(RuntimeEvidence);
        evidenceService = service;

        const fact: Omit<
          RuntimeLifecycleEvidence<DefinitionValue, CleanupError, ProviderDefinition>,
          "evidenceSequence"
        > = {
          _tag: "lifecycle",
          machineTurn: false,
          from: state.lifecycle,
          to: after.lifecycle,
          cause,
          before: state,
          after,
          timestamp: yield* clock.currentTimeMillis,
          publicationRevision: owner.publicationRevision,
          provenance: {
            ...service.provenance,
            actor: {
              key: after.fence.key,
              incarnation: after.fence.incarnation,
              leaseEpoch: after.fence.leaseEpoch,
            },
          },
        };

        const prepared = prepareLifecycleEvidence(service, fact);

        if (Result.isFailure(prepared)) return yield* Effect.fail(prepared.failure);
        evidenceSequence = prepared.success.evidenceSequence;
        yield* service.publish(after);
        yield* service.accept(prepared.success);

        return exit;
      }).pipe(
        Effect.exit,
        Effect.flatMap((evidenceExit) => {
          let evidenceCause: Cause.Cause<PublicDiagnostic> | undefined;
          const lifecycleCause = Exit.isFailure(exit) ? exit.cause : undefined;

          if (evidenceSequence !== undefined && evidenceService !== undefined) {
            const cancelled = cancelRuntimeEvidence(evidenceService, evidenceSequence);

            if (Result.isFailure(cancelled)) evidenceCause = Cause.fail(cancelled.failure);
          }

          if (Exit.isFailure(evidenceExit)) {
            evidenceCause = addCause(evidenceCause, evidenceExit.cause);
          }

          const complete =
            evidenceCause === undefined
              ? exit
              : Exit.failCause(addCause(lifecycleCause, evidenceCause));

          if (command._tag === "actor:dispose") owner.disposalExit = complete;

          return resolveLifecycleExit(complete);
        }),
      );
    }),
  );
};

/** Explicit serialized lifecycle owner for callers that receive concurrent control facts. */
export type LifecycleController<
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  /** Reads the current lifecycle from the serialized controller owner. */
  currentLifecycle: () => ActorLifecycle;
  /** Reports whether the authoritative lifecycle owner admits actor work. */
  isRoutable: () => boolean;
  state: () => Effect.Effect<LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>>;
  command: (
    command: LifecycleCommand<CleanupError>,
  ) => Effect.Effect<
    LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
    PublicDiagnostic,
    RuntimeServiceContext
  >;
  /** Installs admitted attachment metadata without publishing a lifecycle transition. */
  installMetadata: (
    metadata: LifecycleAttachmentMetadata<DefinitionValue, ProviderDefinition>,
  ) => Effect.Effect<
    LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
    PublicDiagnostic,
    RuntimeServiceContext
  >;
};

export type LifecycleRouting = {
  block: () => number;
  open: (generation: number) => void;
};

const lifecycleRoutingSymbol = Symbol("flow-state/lifecycle-routing");

type OwnedLifecycleController<
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = LifecycleController<DefinitionValue, CleanupError, ProviderDefinition> & {
  [lifecycleRoutingSymbol]: LifecycleRouting;
};

export const lifecycleRouting = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  controller: LifecycleController<DefinitionValue, CleanupError, ProviderDefinition>,
) => {
  // SAFETY: makeLifecycleController installs this private capability on every returned controller.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the private symbol restores the owner-only routing capability.
  const routing = (
    controller as Partial<
      OwnedLifecycleController<DefinitionValue, CleanupError, ProviderDefinition>
    >
  )[lifecycleRoutingSymbol];

  if (routing === undefined) throw new Error("Lifecycle controller lost its routing owner");

  return routing;
};

/** One serialized provider publication wave for a retained context binding. */
export type ProviderReconciliation<Value> = {
  changed: boolean;
  revision: number;
  value: Value;
};

export type ProviderReconciliationOptions<Value> = {
  equals?: (left: Value, right: Value) => boolean;
  reconcile: (value: Value) => Effect.Effect<void, PublicDiagnostic>;
};

type ProviderReconcilerOwner<Value> = {
  publish: (value: Value) => Effect.Effect<ProviderReconciliation<Value>, PublicDiagnostic>;
  revision: () => number;
};

/**
 * Serializes provider-derived reconciliation and coalesces values observed
 * while one reconciliation is in flight. Equality is deliberately supplied at
 * this boundary so named-record callers can use their exact field policy.
 */
// RETURN_TYPE: The factory publishes the effectful reconciliation result and its diagnostic channel.
export const makeProviderReconciler = <Value>(
  options: ProviderReconciliationOptions<Value>,
): ProviderReconcilerOwner<Value> => {
  const equals = options.equals ?? Object.is;
  let current: Option.Option<Value> = Option.none();
  let pending: Option.Option<Value> = Option.none();
  let revision = 0;
  let running: (() => Effect.Effect<ProviderReconciliation<Value>, PublicDiagnostic>) | undefined;

  const publish = (value: Value) => {
    if (running === undefined && Option.isSome(current) && equals(current.value, value))
      return Effect.succeed({ changed: false, revision, value });

    pending = Option.some(value);

    if (running !== undefined) return running();

    const operation = Effect.gen(function* () {
      let changed = false;
      let last = value;

      while (Option.isSome(pending)) {
        const next = pending.value;
        pending = Option.none();
        last = next;

        if (Option.isSome(current) && equals(current.value, next)) continue;
        yield* options.reconcile(next);
        current = Option.some(next);
        revision += 1;
        changed = true;
      }

      return { changed, revision, value: last } satisfies ProviderReconciliation<Value>;
    }).pipe(Effect.ensuring(Effect.sync(() => (running = undefined))));

    running = makeTerminalEffect(operation);

    return running();
  };

  return { publish, revision: () => revision };
};

// RETURN_TYPE: The public controller factory preserves serialized lifecycle state and requirements.
export const makeLifecycleController = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  initial: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  actorCell: ActorCell<LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>>,
): LifecycleController<DefinitionValue, CleanupError, ProviderDefinition> => {
  const owner = actorCellProtocolOf(actorCell);

  if (owner === undefined) throw new Error("Lifecycle controller requires an owned snapshot");

  if (owner.controllerBound === false) {
    owner.current = initial;
    owner.controllerBound = true;
  }

  // This ref is a command mutex only. The ActorCellProtocolState above is the sole mutable snapshot
  // authority; keeping the mutex separate prevents a second state copy from going stale.
  const commandLock = SynchronizedRef.makeUnsafe<void>(undefined);

  const routing: LifecycleRouting = {
    block: () => {
      if (owner.routing.current !== "blocked") owner.routing.generation += 1;
      owner.routing.current = "blocked";

      return owner.routing.generation;
    },
    open: (generation) => {
      if (owner.routing.generation !== generation) return;

      owner.routing.current =
        ownerState(initial, actorCell).lifecycle === "active" ? "open" : "blocked";
    },
  };

  const controller: OwnedLifecycleController<DefinitionValue, CleanupError, ProviderDefinition> = {
    [lifecycleRoutingSymbol]: routing,
    currentLifecycle: () => ownerState(initial, actorCell).lifecycle,
    isRoutable: () =>
      owner.routing.current === "open" && ownerState(initial, actorCell).lifecycle === "active",
    state: () => Effect.sync(() => ownerState(initial, actorCell)),
    command: (command) =>
      SynchronizedRef.modifyEffect(commandLock, () =>
        Effect.exit(
          Effect.gen(function* () {
            const generation = routing.block();

            const exit = yield* Effect.exit(
              runLifecycleCommand(ownerState(initial, actorCell), command, actorCell),
            );

            const current = ownerState(initial, actorCell);

            if (current.lifecycle === "active" && command._tag !== "actor:resume")
              routing.open(generation);
            else owner.routing.current = "blocked";

            if (Exit.isFailure(exit)) return yield* Effect.failCause(exit.cause);

            return exit.value;
          }),
        ).pipe(Effect.map((exit) => [exit, undefined] as const)),
      ).pipe(
        Effect.flatMap((exit) =>
          Exit.isFailure(exit) ? Effect.failCause(exit.cause) : Effect.succeed(exit.value),
        ),
      ),
    installMetadata: (metadata) =>
      SynchronizedRef.modifyEffect(commandLock, () =>
        Effect.sync(() =>
          installLifecycleMetadata(ownerState(initial, actorCell), metadata, actorCell),
        ).pipe(Effect.map((result) => [result, undefined] as const)),
      ).pipe(
        Effect.flatMap((result) =>
          Result.isFailure(result) ? Effect.fail(result.failure) : Effect.succeed(result.success),
        ),
      ),
  };

  return controller;
};
