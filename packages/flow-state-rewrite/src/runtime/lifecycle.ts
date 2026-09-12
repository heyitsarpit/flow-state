// oxlint-disable-next-line anti-slop/no-large-production-file -- lifecycle, cleanup, and evidence form one owner boundary.
import {
  Cause,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Option,
  Result,
  Scope,
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
import {
  makeRuntimeDisposalOwner,
  type ActorContextBinding,
  type ActorDependencyEdge,
  type ActorFence,
  type ActorKey,
} from "./actor-admission.js";
import type { OperationOccurrenceFence } from "./turn-plan.js";
import {
  RuntimeClock,
  RuntimeEvidence,
  RuntimeScheduler,
  type RuntimeRunningFiber,
  type RuntimeEvidenceService,
  type RuntimeLifecycleEvidence,
  type RuntimeServiceContext,
} from "./runtime-services.js";
import type { ActorRef } from "./actor-ref.js";
import { cancelRuntimeEvidence, prepareLifecycleEvidence } from "./evidence.js";
import { immutableArray, immutableRecord, readonlyMap } from "./readonly-collections.js";

/** The only actor lifecycle states. */
export type ActorLifecycle = "prepared" | "active" | "suspended" | "disposed";

/** Lifecycle causes are retained as private evidence, never as machine turns. */
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

/** Lifecycle control shares the actor's one serialized mailbox lane. */
export type LifecycleCommand<CleanupError> =
  | { readonly _tag: "actor:start"; readonly cause: LifecycleCause<CleanupError> }
  | { readonly _tag: "actor:restore"; readonly cause: LifecycleCause<CleanupError> }
  | { readonly _tag: "actor:suspend"; readonly cause: LifecycleCause<CleanupError> }
  | { readonly _tag: "actor:resume"; readonly cause: LifecycleCause<CleanupError> }
  | { readonly _tag: "actor:dispose"; readonly cause: LifecycleCause<CleanupError> };

/** A resource is closed by its actor owner and retains its exact finalizer Cause. */
export type LifecycleResource<CleanupError> = {
  readonly name: string;
  readonly scope: Scope.Scope;
  readonly close: (exit: Exit.Exit<void, CleanupError>) => Effect.Effect<void, CleanupError>;
  /** Continuing resources provide a fresh owner-scoped resource on resume. */
  readonly reacquire?: () => Effect.Effect<LifecycleResource<CleanupError>, CleanupError>;
  readonly finalization: "pending" | "running" | "done" | "failed";
  readonly cause: Option.Option<Cause.Cause<CleanupError>>;
};

/** Work is interrupted and awaited before any resource finalizer runs. */
export type LifecycleWork<CleanupError> = {
  readonly name: string;
  readonly fiber: Fiber.Fiber<void, CleanupError>;
  readonly cancel: Effect.Effect<void, CleanupError>;
  readonly finalizer: Effect.Effect<void, CleanupError>;
  /** Continuing work provides a fresh owner-scoped work item on resume. */
  readonly reacquire?: () => Effect.Effect<LifecycleWork<CleanupError>, CleanupError>;
  readonly finalization: "pending" | "running" | "done" | "failed";
  readonly cause: Option.Option<Cause.Cause<CleanupError>>;
  readonly completion?: Deferred.Deferred<Exit.Exit<void, CleanupError>>;
  readonly fence?: ActorFence;
};

/** Operation identity is retained as opaque fence data across suspension. */
export type LifecycleOperationRecord<_DefinitionValue extends MachineDefinition, CleanupError> = {
  readonly fence: OperationOccurrenceFence;
  readonly status: "running" | "settled" | "cancelled" | "stale";
  readonly finalization: "pending" | "running" | "done" | "failed";
  readonly cause: Option.Option<Cause.Cause<CleanupError>>;
};

/** Timer identity is an absolute deadline, never a replayed duration. */
export type LifecycleTimer<CleanupError = never> = {
  readonly name: string;
  readonly startedAt: number;
  readonly dueAt: number;
  readonly status: "armed" | "fired" | "cancelled";
  /** A timer from another actor generation is inert on resume. */
  readonly generation?: number;
  /** Optional continuing refresh; finite work is never reconstructed here. */
  readonly refresh?: Effect.Effect<void, CleanupError>;
};

/** A provider-dependent owner cannot dispose while these logical edges remain. */
export type BlockedDisposal<DefinitionValue extends MachineDefinition> = {
  readonly dependentActors: readonly ActorRef<Machine<DefinitionValue>>[];
  readonly bindingKeys: readonly (keyof ContextOf<DefinitionValue> & string)[];
};

/** Detached attachments retain all logical truth while live resources are absent. */
export type LifecycleAttachment<
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  readonly status: "attached" | "detached";
  readonly resources: readonly LifecycleResource<CleanupError>[];
  readonly work: readonly LifecycleWork<CleanupError>[];
  readonly dependencies: readonly ActorDependencyEdge[];
  readonly bindings: readonly Readonly<ActorContextBinding<DefinitionValue, ProviderDefinition>>[];
  readonly providerRevisions: ReadonlyMap<ActorKey, number>;
  readonly cursors: ReadonlyMap<string, number>;
  readonly operations: readonly LifecycleOperationRecord<DefinitionValue, CleanupError>[];
  readonly timers: readonly LifecycleTimer<CleanupError>[];
  /** Optional current-provider fence table used by resume reconciliation. */
  readonly providerFences?: ReadonlyMap<ActorKey, ActorFence>;
  /** Optional registry-provided dependent detail for exact disposal refusal. */
  readonly blockedDisposal?: BlockedDisposal<DefinitionValue>;
};

/** Admitted context metadata installed before the actor crosses its start barrier. */
export type LifecycleAttachmentMetadata<
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  readonly dependencies: readonly ActorDependencyEdge[];
  readonly bindings: readonly Readonly<ActorContextBinding<DefinitionValue, ProviderDefinition>>[];
  readonly providerRevisions: ReadonlyMap<ActorKey, number>;
  readonly providerFences: ReadonlyMap<ActorKey, ActorFence>;
};

/** One immutable lifecycle publication cut. */
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

/** A legal transition is computed before its effectful cleanup begins. */
export type LifecycleTransition<CleanupError> = {
  readonly from: ActorLifecycle;
  readonly to: ActorLifecycle;
  readonly command: LifecycleCommand<CleanupError>;
  readonly cause: LifecycleCause<CleanupError>;
};

/** Restore is the evidence-only prepared-to-prepared transition. */
export type PreparedRestoreTransition<CleanupError> = LifecycleTransition<CleanupError> & {
  readonly from: "prepared";
  readonly to: "prepared";
  readonly command: Extract<LifecycleCommand<CleanupError>, { readonly _tag: "actor:restore" }>;
};

type LifecycleStateKey = { readonly lifecycle: ActorLifecycle };

const scopes = new WeakMap<LifecycleStateKey, Scope.Closeable>();

const latestStates = new WeakMap<LifecycleStateKey, LifecycleStateKey>();

const closedScopes = new WeakSet<Scope.Closeable>();

const cleanupCauses = new WeakMap<LifecycleStateKey, Cause.Cause<unknown>>();

const publicationRevisions = new WeakMap<LifecycleStateKey, number>();

const copyFence = (fence: ActorFence) => immutableRecord({ ...fence });

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

const blockedByDependents = (
  dependentActors: readonly (ActorRef | ActorKey)[],
  bindingKeys: readonly string[],
) =>
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
  current === undefined ? next : Cause.combine(current, next);

const combineCauses = <Error>(
  current: Cause.Cause<Error> | undefined,
  next: Cause.Cause<Error> | undefined,
) => {
  if (current === undefined) return next;

  if (next === undefined) return current;

  return Cause.combine(current, next);
};

const makeTerminalEffect = <Value, Error, Requirements>(
  operation: Effect.Effect<Value, Error, Requirements>,
) => {
  let completion: Deferred.Deferred<Exit.Exit<Value, Error>> | undefined;

  const resolve = (exit: Exit.Exit<Value, Error>) =>
    Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(exit.cause);

  return () => {
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
  };
};

const rememberState = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  input: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  next: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
) => {
  latestStates.set(input, next);
  latestStates.set(next, next);
  const scope = scopes.get(input);

  if (scope !== undefined) scopes.set(next, scope);
};

const currentState = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
) => {
  const retained = latestStates.get(state);

  if (retained === undefined) return state;

  // SAFETY: latestStates is written only by rememberState with the same generic snapshot key.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- WeakMap erases the private generic boundary.
  return retained as LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>;
};

const copyResource = <CleanupError>(
  resource: LifecycleResource<CleanupError>,
  finalization = resource.finalization,
  cause = resource.cause,
) => immutableRecord({ ...resource, finalization, cause });

const copyWork = <CleanupError>(
  work: LifecycleWork<CleanupError>,
  finalization = work.finalization,
  cause = work.cause,
) => immutableRecord({ ...work, finalization, cause });

// RETURN_TYPE: Conditional binding types require an explicit immutable copy contract.
const copyBinding = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
  Slot extends keyof ContextOf<ConsumerDefinition> & string,
  ProviderRef extends ActorRef<Machine<ProviderDefinition>>,
>(
  binding: Readonly<ActorContextBinding<ConsumerDefinition, ProviderDefinition, Slot, ProviderRef>>,
): Readonly<ActorContextBinding<ConsumerDefinition, ProviderDefinition, Slot, ProviderRef>> => {
  const copied = immutableRecord({ ...binding, providerFence: copyFence(binding.providerFence) });

  // SAFETY: copied retains every binding field and replaces only its mutable fence with an immutable copy.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- conditional binding types cannot express this structural copy.
  return copied as Readonly<
    ActorContextBinding<ConsumerDefinition, ProviderDefinition, Slot, ProviderRef>
  >;
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
    resources: immutableArray(attachment.resources.map((resource) => copyResource(resource))),
    work: immutableArray(attachment.work.map((work) => copyWork(work))),
    dependencies: immutableArray(
      attachment.dependencies.map((edge) => immutableRecord({ ...edge })),
    ),
    bindings: immutableArray(attachment.bindings.map((binding) => copyBinding(binding))),
    providerRevisions: readonlyMap(attachment.providerRevisions.entries()),
    cursors: readonlyMap(attachment.cursors.entries()),
    operations: immutableArray(
      attachment.operations.map((operation) => immutableRecord({ ...operation })),
    ),
    timers: immutableArray(attachment.timers.map((timer) => immutableRecord({ ...timer }))),
  };

  if (attachment.providerFences !== undefined) {
    copied.providerFences = readonlyMap(
      [...attachment.providerFences].map(([key, fence]) => [key, copyFence(fence)] as const),
    );
  }

  if (attachment.blockedDisposal !== undefined) {
    copied.blockedDisposal = immutableRecord({
      dependentActors: immutableArray(attachment.blockedDisposal.dependentActors),
      bindingKeys: immutableArray(attachment.blockedDisposal.bindingKeys),
    });
  }

  return immutableRecord(copied);
};

const copySnapshot = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
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
  const next = immutableRecord({
    lifecycle,
    fence: copyFence(state.fence),
    attachment,
    finalization,
  });

  rememberState(state, next);
  publicationRevisions.set(next, (publicationRevisions.get(state) ?? 0) + 1);

  if (cleanupCause !== undefined) cleanupCauses.set(next, cleanupCause);

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

/** Creates a prepared actor with no live attachment resources and one actor Scope. */
// RETURN_TYPE: The public preparation boundary preserves its generic snapshot type.
export const prepareLifecycle = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  fence: ActorFence,
  cause: LifecycleCause<CleanupError>,
): Result.Result<
  LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic
> => {
  if (!validFence(fence)) return Result.fail(invalidSnapshot("fence"));

  if (cause._tag !== "fresh" && cause._tag !== "restore")
    return Result.fail(invalidSnapshot("prepare-cause"));

  const snapshot = immutableRecord({
    lifecycle: "prepared" as const,
    fence: copyFence(fence),
    attachment: immutableRecord({
      status: "detached" as const,
      resources: immutableArray<LifecycleResource<CleanupError>>([]),
      work: immutableArray<LifecycleWork<CleanupError>>([]),
      dependencies: immutableArray<ActorDependencyEdge>([]),
      bindings: immutableArray<ActorContextBinding<DefinitionValue, ProviderDefinition>>([]),
      providerRevisions: readonlyMap<ActorKey, number>([]),
      cursors: readonlyMap<string, number>([]),
      operations: immutableArray<LifecycleOperationRecord<DefinitionValue, CleanupError>>([]),
      timers: immutableArray<LifecycleTimer>([]),
    }),
    finalization: "not-started" as const,
  });

  scopes.set(snapshot, Scope.makeUnsafe("sequential"));
  latestStates.set(snapshot, snapshot);
  publicationRevisions.set(snapshot, 0);

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
): Result.Result<
  LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic
> => {
  const state = currentState(input);

  if (state.lifecycle !== "prepared" && state.lifecycle !== "active")
    return Result.fail(invalidSnapshot("attachment-install-state"));

  const attachment = copyAttachment({
    ...state.attachment,
    dependencies: metadata.dependencies,
    bindings: metadata.bindings,
    providerRevisions: metadata.providerRevisions,
    providerFences: metadata.providerFences,
  });

  const next = immutableRecord({
    lifecycle: state.lifecycle,
    fence: copyFence(state.fence),
    attachment,
    finalization: state.finalization,
  });

  rememberState(state, next);
  publicationRevisions.set(next, publicationRevisions.get(state) ?? 0);
  const cleanupCause = cleanupCauses.get(state);

  if (cleanupCause !== undefined) cleanupCauses.set(next, cleanupCause);

  return Result.succeed(next);
};

// RETURN_TYPE: Scope closure retains the lifecycle cleanup error channel for Cause classification.
const closeScope = <CleanupError>(state: LifecycleStateKey): Effect.Effect<void, CleanupError> => {
  const scope = scopes.get(state);

  if (scope === undefined || closedScopes.has(scope)) return Effect.succeed(undefined);

  return Effect.gen(function* () {
    const result = yield* Effect.exit(Scope.close(scope, Exit.void));
    closedScopes.add(scope);

    if (Exit.isFailure(result)) {
      // SAFETY: Scope finalizer failures are projected into this lifecycle's cleanup channel.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Scope has no generic cleanup error parameter.
      return yield* Effect.failCause(result.cause);
    }
  });
};

const retainedCleanupCause = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
) => {
  const retained = cleanupCauses.get(state);

  if (retained !== undefined) {
    // SAFETY: the cause is stored by copySnapshot for this exact snapshot and cleanup error.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- WeakMap erases the private generic boundary.
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
): Effect.Effect<
  LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic,
  RuntimeServiceContext
> => {
  const state = currentState(input);

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

  return Effect.succeed(copySnapshot(state, "active", attachment, "not-started"));
};

type CleanupRun<
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
> = {
  readonly attachment: LifecycleAttachment<DefinitionValue, CleanupError, ProviderDefinition>;
  readonly cause: Cause.Cause<CleanupError> | undefined;
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

const cleanupWork = <CleanupError>(items: readonly LifecycleWork<CleanupError>[]) =>
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

    return { work: immutableArray(work), cause: cleanupCause };
  });

const cleanupResource = <CleanupError>(resource: LifecycleResource<CleanupError>) =>
  Effect.gen(function* () {
    let resourceCause: Cause.Cause<CleanupError> | undefined;
    const closed = yield* Effect.exit(resource.close(Exit.void));

    if (Exit.isFailure(closed)) resourceCause = addCause(resourceCause, closed.cause);
    const scopeClosed = yield* Effect.exit(Scope.close(resource.scope, Exit.void));

    if (Exit.isFailure(scopeClosed)) {
      // SAFETY: Scope.close has no typed failure channel; its defects are retained in Cause.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- preserve scope cleanup Cause with the resource error type.
      resourceCause = addCause(resourceCause, scopeClosed.cause as Cause.Cause<CleanupError>);
    }

    return {
      resource: copyResource(
        resource,
        resourceCause === undefined ? "done" : "failed",
        resourceCause === undefined ? Option.none() : Option.some(resourceCause),
      ),
      cause: resourceCause,
    };
  });

const cleanupResources = <CleanupError>(items: readonly LifecycleResource<CleanupError>[]) =>
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

    return { resources: immutableArray(resources), cause: cleanupCause };
  });

// RETURN_TYPE: Ordered cleanup retains full work/resource Cause data before publication.
const cleanupAttachment = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  attachment: LifecycleAttachment<DefinitionValue, CleanupError, ProviderDefinition>,
): Effect.Effect<CleanupRun<DefinitionValue, CleanupError, ProviderDefinition>> =>
  Effect.uninterruptible(
    Effect.gen(function* () {
      const work = yield* cleanupWork(attachment.work);
      const resources = yield* cleanupResources(attachment.resources);

      return {
        attachment: immutableRecord({
          ...copyAttachment(attachment, "detached"),
          work: work.work,
          resources: resources.resources,
        }),
        cause: combineCauses(work.cause, resources.cause),
      };
    }),
  );

type ReacquiredAttachment<CleanupError> = {
  readonly resources: readonly LifecycleResource<CleanupError>[];
  readonly work: readonly LifecycleWork<CleanupError>[];
  readonly acquiredResources: readonly LifecycleResource<CleanupError>[];
  readonly acquiredWork: readonly LifecycleWork<CleanupError>[];
};

const rollbackReacquired = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  resources: readonly LifecycleResource<CleanupError>[],
  work: readonly LifecycleWork<CleanupError>[],
) =>
  cleanupAttachment({
    ...copyAttachment(state.attachment, "detached"),
    resources: immutableArray(resources),
    work: immutableArray(work),
  });

// RETURN_TYPE: Continuing attachments are reacquired under the actor Scope and roll back atomically.
const reacquireAttachment = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
): Effect.Effect<ReacquiredAttachment<CleanupError>, PublicDiagnostic, RuntimeServiceContext> =>
  Effect.gen(function* () {
    const scope = scopes.get(state) ?? Scope.makeUnsafe("sequential");

    if (!scopes.has(state)) scopes.set(state, scope);
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
          return yield* Effect.fail(cleanupDiagnostic(Cause.combine(cause, rolledBack.cause)));

        return yield* Effect.fail(cleanupDiagnostic(cause));
      });

    for (const retained of state.attachment.resources) {
      if (retained.finalization !== "done" || retained.reacquire === undefined) {
        resources.push(copyResource(retained));
        continue;
      }

      const acquired = yield* Effect.exit(Scope.provide(scope)(retained.reacquire()));

      if (Exit.isFailure(acquired)) return yield* failAfterRollback(acquired.cause);
      const resource = copyResource(acquired.value, "pending", Option.none());
      resources.push(resource);
      acquiredResources.push(resource);
    }

    for (const retained of state.attachment.work) {
      if (retained.finalization !== "done" || retained.reacquire === undefined) {
        work.push(copyWork(retained));
        continue;
      }

      const acquired = yield* Effect.exit(Scope.provide(scope)(retained.reacquire()));

      if (Exit.isFailure(acquired)) return yield* failAfterRollback(acquired.cause);
      const item = copyWork(acquired.value, "pending", Option.none());
      work.push(item);
      acquiredWork.push(item);
    }

    return {
      resources: immutableArray(resources),
      work: immutableArray(work),
      acquiredResources: immutableArray(acquiredResources),
      acquiredWork: immutableArray(acquiredWork),
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
): Effect.Effect<
  LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic,
  RuntimeServiceContext
> => {
  const state = currentState(input);

  if (state.lifecycle !== "active")
    return Effect.fail(
      transitionFailure(state.lifecycle, { _tag: "actor:suspend", cause: { _tag: "attachment" } }),
    );

  return cleanupAttachment(state.attachment).pipe(
    Effect.flatMap((cleaned) => {
      const next = copySnapshot(
        state,
        "suspended",
        cleaned.attachment,
        cleaned.cause === undefined ? "done" : "failed",
        cleaned.cause,
      );

      if (cleaned.cause !== undefined) return Effect.fail(cleanupDiagnostic(cleaned.cause));

      return Effect.succeed(next);
    }),
  );
};

// RETURN_TYPE: Timer scheduling retains the runtime clock/scheduler requirements.
const scheduleRetainedTimers = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition,
>(
  state: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
): Effect.Effect<readonly LifecycleWork<CleanupError>[], PublicDiagnostic, RuntimeServiceContext> =>
  Effect.gen(function* () {
    const clock = yield* Effect.service(RuntimeClock);
    const scheduler = yield* Effect.service(RuntimeScheduler);
    const now = yield* clock.now;
    const scope = scopes.get(state) ?? Scope.makeUnsafe("sequential");

    if (!scopes.has(state)) scopes.set(state, scope);
    const running: RuntimeRunningFiber<void, CleanupError>[] = [];
    const timerWork: LifecycleWork<CleanupError>[] = [];
    const scheduled = new Set<string>();
    let overdueRefreshScheduled = false;

    for (const timer of state.attachment.timers) {
      if (timer.status !== "armed") continue;

      if (timer.generation !== undefined && timer.generation !== state.fence.generation) continue;
      const timerKey = `${timer.name}\u0000${timer.startedAt}\u0000${timer.dueAt}\u0000${timer.generation ?? state.fence.generation}`;

      if (scheduled.has(timerKey)) continue;
      const overdue = now >= timer.dueAt;

      if (overdue && overdueRefreshScheduled) continue;
      scheduled.add(timerKey);

      if (overdue) overdueRefreshScheduled = true;
      const completion = Deferred.makeUnsafe<Exit.Exit<void, CleanupError>>();

      const work = Effect.gen(function* () {
        yield* clock.sleepUntil(timer.dueAt);

        if (overdue && timer.refresh !== undefined) yield* timer.refresh;
      });

      const started = yield* Effect.exit(
        Scope.provide(scope)(scheduler.start({ completion, work })),
      );

      if (Exit.isFailure(started)) {
        yield* Effect.uninterruptible(
          Effect.forEach(running, (item) => item.interrupt, { discard: true, concurrency: 1 }),
        );

        return yield* Effect.fail(cleanupDiagnostic(started.cause));
      }

      running.push(started.value);
      timerWork.push(
        immutableRecord({
          name: `timer:${timer.name}`,
          fiber: started.value.fiber,
          cancel: started.value.interrupt,
          finalizer: Effect.void,
          finalization: "pending" as const,
          cause: Option.none<Cause.Cause<CleanupError>>(),
          completion,
          fence: state.fence,
        }),
      );
    }

    return immutableArray(timerWork);
  });

/** Resumes one retained actor after provider reconciliation and finalization. */
// RETURN_TYPE: The explicit environment preserves the runtime capability boundary for lifecycle stages.
export const resumeLifecycle = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  input: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
): Effect.Effect<
  LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic,
  RuntimeServiceContext
> => {
  const state = currentState(input);

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

  return reacquireAttachment(state).pipe(
    Effect.flatMap((reacquired) =>
      scheduleRetainedTimers(state).pipe(
        Effect.map((timerWork) =>
          copySnapshot(
            state,
            "active",
            immutableRecord({
              ...copyAttachment(state.attachment, "attached"),
              resources: reacquired.resources,
              work: immutableArray([...reacquired.work, ...timerWork]),
            }),
            "not-started",
          ),
        ),
        Effect.catchCause((cause) =>
          rollbackReacquired(state, reacquired.acquiredResources, reacquired.acquiredWork).pipe(
            Effect.matchCauseEffect({
              onFailure: (rollbackCause) =>
                Effect.fail(cleanupDiagnostic(Cause.combine(cause, rollbackCause))),
              onSuccess: () => Effect.fail(cleanupDiagnostic(cause)),
            }),
          ),
        ),
      ),
    ),
  );
};

/** Disposes in owner order; failed cleanup remains active and retryable until it succeeds. */
// RETURN_TYPE: The explicit environment preserves the runtime capability boundary for lifecycle stages.
export const disposeLifecycle = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  input: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
): Effect.Effect<
  LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic,
  RuntimeServiceContext
> => {
  const state = currentState(input);

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
    Effect.flatMap((cleaned) =>
      closeScope(state).pipe(
        Effect.flatMap(() => {
          const failed = cleaned.cause !== undefined;

          const next = copySnapshot(
            state,
            failed ? state.lifecycle : "disposed",
            cleaned.attachment,
            failed ? "failed" : "done",
            cleaned.cause,
          );

          return failed ? Effect.fail(cleanupDiagnostic(cleaned.cause)) : Effect.succeed(next);
        }),
        Effect.catchCause((cause) => {
          // SAFETY: closeScope projects its owner-scope Cause into CleanupError before this handler.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Effect.catchCause widens the retained Cause.
          const retained = addCause(cleaned.cause, cause as Cause.Cause<CleanupError>);
          copySnapshot(state, state.lifecycle, cleaned.attachment, "failed", retained);

          return Effect.fail(cleanupDiagnostic(retained));
        }),
      ),
    ),
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
) => {
  switch (command._tag) {
    case "actor:restore":
      return Effect.succeed(
        copySnapshot(
          state,
          "prepared",
          copyAttachment(state.attachment, "detached"),
          "not-started",
        ),
      );
    case "actor:start":
      return activateLifecycle(state);
    case "actor:suspend":
      return suspendLifecycle(state);
    case "actor:resume":
      return resumeLifecycle(state);
    case "actor:dispose":
      return disposeLifecycle(state);
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
): Effect.Effect<
  LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic,
  RuntimeServiceContext
> => {
  const state = currentState(input);
  const transition = transitionLifecycle(state.lifecycle, command);

  if (Result.isFailure(transition)) {
    if (state.lifecycle === "disposed" && command._tag === "actor:dispose")
      return Effect.succeed(state);

    return Effect.fail(transition.failure);
  }

  const transitionEffect = lifecycleCommandEffect(state, command);

  return Effect.exit(transitionEffect).pipe(
    Effect.flatMap((exit) => {
      const after = currentState(state);

      if (after === state) return resolveLifecycleExit(exit);
      const cleanupCause = retainedCleanupCause(after);

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
        const clock = yield* Effect.service(RuntimeClock);
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
          timestamp: yield* clock.now,
          publicationRevision: publicationRevisions.get(after) ?? 0,
          machineTurnRevision: service.machineTurnRevision,
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
          if (evidenceSequence !== undefined && evidenceService !== undefined) {
            const cancelled = cancelRuntimeEvidence(evidenceService, evidenceSequence);

            if (Result.isFailure(cancelled)) return Effect.fail(cancelled.failure);
          }

          if (Exit.isFailure(evidenceExit)) return Effect.failCause(evidenceExit.cause);

          return resolveLifecycleExit(evidenceExit.value);
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
  readonly state: () => Effect.Effect<
    LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>
  >;
  readonly command: (
    command: LifecycleCommand<CleanupError>,
  ) => Effect.Effect<
    LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
    PublicDiagnostic,
    RuntimeServiceContext
  >;
  /** Installs admitted attachment metadata without publishing a lifecycle transition. */
  readonly installMetadata: (
    metadata: LifecycleAttachmentMetadata<DefinitionValue, ProviderDefinition>,
  ) => Effect.Effect<
    LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
    PublicDiagnostic,
    RuntimeServiceContext
  >;
};

/** One serialized provider publication wave for a retained context binding. */
export type ProviderReconciliation<Value> = {
  readonly changed: boolean;
  readonly revision: number;
  readonly value: Value;
};

export type ProviderReconciliationOptions<Value> = {
  readonly equals?: (left: Value, right: Value) => boolean;
  readonly reconcile: (value: Value) => Effect.Effect<void, PublicDiagnostic>;
};

type ProviderReconcilerOwner<Value> = {
  readonly publish: (
    value: Value,
  ) => Effect.Effect<ProviderReconciliation<Value>, PublicDiagnostic>;
  readonly revision: () => number;
};

/** Runtime disposal participant; actor cleanup remains the participant's owner. */
export type LifecycleRuntimeParticipant = {
  readonly dispose: () => Effect.Effect<void, PublicDiagnostic, RuntimeServiceContext>;
};

export type LifecycleRuntimeOwner = {
  readonly registerActor: (participant: LifecycleRuntimeParticipant) => void;
  readonly registerProvider: (
    release: Effect.Effect<void, PublicDiagnostic, RuntimeServiceContext>,
  ) => void;
  readonly dispose: () => Effect.Effect<void, PublicDiagnostic, RuntimeServiceContext>;
  readonly generation: () => number;
  readonly isCurrent: (generation: number) => boolean;
};

/** Accepted evidence is drained after actors and before runtime providers. */
export type LifecycleRuntimeOwnerOptions = {
  readonly drain?: Effect.Effect<void, PublicDiagnostic, RuntimeServiceContext>;
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

/**
 * Owns runtime shutdown ordering while delegating actor cleanup to each actor
 * owner. Disposal fences new completions immediately, joins repeated callers,
 * drains accepted evidence, and releases providers only after actors settle.
 */
// RETURN_TYPE: The runtime owner preserves the runtime service capability boundary.
export const makeLifecycleRuntimeOwner = (
  options: LifecycleRuntimeOwnerOptions = {},
): LifecycleRuntimeOwner => {
  const owner =
    options.drain === undefined
      ? makeRuntimeDisposalOwner<RuntimeServiceContext>()
      : makeRuntimeDisposalOwner<RuntimeServiceContext>({ drain: options.drain });

  return {
    registerActor: (participant) => owner.registerLease(participant),
    registerProvider: (release) => owner.registerProvider(release),
    dispose: owner.dispose,
    generation: owner.generation,
    isCurrent: owner.isCurrent,
  };
};

// RETURN_TYPE: The public controller factory preserves serialized lifecycle state and requirements.
export const makeLifecycleController = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  initial: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
): LifecycleController<DefinitionValue, CleanupError, ProviderDefinition> => {
  const state = SynchronizedRef.makeUnsafe(initial);

  return {
    state: () => SynchronizedRef.get(state),
    command: (command) =>
      SynchronizedRef.modifyEffect(state, (current) =>
        Effect.exit(runLifecycleCommand(current, command)).pipe(
          Effect.map((exit) => [exit, currentState(current)] as const),
        ),
      ).pipe(
        Effect.flatMap((exit) =>
          Exit.isFailure(exit) ? Effect.failCause(exit.cause) : Effect.succeed(exit.value),
        ),
      ),
    installMetadata: (metadata) =>
      SynchronizedRef.modifyEffect(state, (current) =>
        Effect.succeed(installLifecycleMetadata(current, metadata)).pipe(
          Effect.map((result) => [result, currentState(current)] as const),
        ),
      ).pipe(
        Effect.flatMap((result) =>
          Result.isFailure(result) ? Effect.fail(result.failure) : Effect.succeed(result.success),
        ),
      ),
  };
};
