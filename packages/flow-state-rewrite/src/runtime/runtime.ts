// oxlint-disable-next-line anti-slop/no-large-production-file -- runtime assembly owns admission, context, lifecycle, and evidence composition at one boundary.
import {
  Cause,
  Clock,
  Context,
  Deferred,
  Effect,
  Exit,
  Layer,
  Option,
  Predicate,
  Result,
  Scope,
  Semaphore,
  Stream,
} from "effect";

import {
  implementationLayer,
  type Implementation,
  type ImplementationErrorOf,
  type ImplementationRequirementsOf,
  type ImplementationServices,
} from "../implementation/implementation.js";
import {
  appPlan,
  isConstructedApp,
  isOwnedMachineFactsFor,
  type App,
  type RequirementsOf,
} from "../app/app.js";
import { Failure, type PublicDiagnostic } from "../diagnostic/diagnostic.js";
import {
  captureActorContextBindings,
  captureActorRef,
  captureAdmissionProperty,
  captureAdmissionRecord,
  makeActorIdentityRegistry,
  makeActorLease,
  completeActorAdmissionExit,
  normalizeActorAdmissionExit,
  normalizeValidatedActorAdmission,
  rollbackActorAdmission,
  resolveActorAdmissionMode,
  validateActorAdmission,
  type ActorAdmissionInput,
  type ActorAdmissionConstruction,
  type ActorAdmissionValidationContext,
  type ActorContextBinding,
  type ActorContextSnapshot,
  type ActorKey,
  type ActorDependencyEdge,
  type AdmissionRollbackStep,
  type ActorIdentityRegistry,
  type ActorFence,
  type ActorIdentity,
  type ActorAdmissionMode,
  type ActorLease,
  type ValidatedActorAdmission,
} from "./actor-admission.js";
import {
  actorHandle,
  prepareActorSnapshot,
  prepareActorEngine,
  verifyPreparedActorSnapshot,
  type ActorCommand,
  type ActorEngine,
  type ActorEngineInput,
  type ActorPublication,
  type ActorSnapshot,
  type PreparedActorSnapshot,
  type ActorStore,
  type DispatchReceipt,
} from "./actor-engine.js";
import { makeRuntimeEvidenceOwner } from "./evidence.js";
import {
  activateContextBaseline,
  buildContextGraph,
  installContextBaseline,
  planContextWave,
  applyContextWave,
  type ContextBinding,
  type ContextWave,
} from "./context-wave.js";
import {
  makeLifecycleController,
  makeLifecycleRuntimeOwner,
  lifecycleRouting,
  prepareLifecycle,
  installLifecycleMetadata,
  installLifecycleTimers,
  type LifecycleController,
  type LifecycleCommand,
  type LifecycleRuntimeOwner,
  type LifecycleRuntimeRegistration,
} from "./lifecycle.js";
import { makeRuntimeOwner } from "./runtime-owner.js";
import {
  makeRuntimeClock,
  makeRuntimeScheduler,
  makeRuntimeServicesLayer,
  type RuntimeServiceContext,
} from "./runtime-services.js";
import type { ContextProjectionCarrier } from "./turn-plan.js";
import type { MachineDefinition } from "../machine/grammar.js";
import { isConstructedMachine, type Machine, type MachineRecordValue } from "../machine/machine.js";
import type { ActorRef } from "./actor-ref.js";
import type { InputOf } from "../definition/domain.js";

/*
 * Runtime setup:
 *
 * Public contracts and completeness constraints:
 *   Runtime, RuntimeSetup, RuntimeImplementation, CompleteImplementation
 *
 * Constructed-app admission:
 *   admitConstructedApp
 *
 * Per-instance construction:
 *   constructRuntime
 *
 * Setup assembly:
 *   runtimeSetup
 */

type RuntimeImplementation = Implementation<never, unknown, unknown>;

type RuntimeApp = App;

const appendCleanupCause = <Error>(
  current: Cause.Cause<Error> | undefined,
  next: Cause.Cause<Error>,
) =>
  current === undefined
    ? Cause.fromReasons([...next.reasons])
    : Cause.fromReasons([...current.reasons, ...next.reasons]);

type RuntimeActorOptionBase<
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  ref: ActorRef<Machine<DefinitionValue>>;
  store?: ActorStore<DefinitionValue>;
  onSnapshot?: ActorEngineInput<DefinitionValue>["onSnapshot"];
  onCommand?: (
    command: ActorCommand<DefinitionValue>,
  ) => Effect.Effect<void, PublicDiagnostic, RuntimeServiceContext | Scope.Scope>;
  // oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: accepts const-inferred caller bindings before runtime capture owns a copy.
  bindings?: readonly ActorContextBinding<DefinitionValue, ProviderDefinition>[];
};

type RuntimeFreshActorOptions<
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = RuntimeActorOptionBase<DefinitionValue, ProviderDefinition> & {
  initial: PreparedActorSnapshot<DefinitionValue>;
  input?: InputOf<DefinitionValue>;
  restore?: never;
};

type RuntimeRestoredActorOptions<
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = RuntimeActorOptionBase<DefinitionValue, ProviderDefinition> & {
  restore: PreparedActorSnapshot<DefinitionValue>;
  initial?: never;
  input?: never;
};

type RuntimeLocalActorOptions<
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = Omit<RuntimeFreshActorOptions<DefinitionValue, ProviderDefinition>, "ref">;

type RuntimeEnsureActorOptions<
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> =
  | Omit<RuntimeFreshActorOptions<DefinitionValue, ProviderDefinition>, "ref">
  | Omit<RuntimeRestoredActorOptions<DefinitionValue, ProviderDefinition>, "ref">;

/** Package-private runtime readiness seam; the public root exposes neither construction lane. */
export type RuntimeActorOptions<
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> =
  | RuntimeFreshActorOptions<DefinitionValue, ProviderDefinition>
  | RuntimeRestoredActorOptions<DefinitionValue, ProviderDefinition>;

export type RuntimeActor<
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  identity: ActorIdentity<DefinitionValue>;
  fence: ActorFence;
  engine: ActorEngine<DefinitionValue>;
  lifecycle: LifecycleController<DefinitionValue, PublicDiagnostic, ProviderDefinition>;
  handle: ReturnType<typeof actorHandle<DefinitionValue>>;
  dispose: () => Effect.Effect<void, PublicDiagnostic, RuntimeServiceContext>;
};

type RuntimeAssembly = {
  context: Context.Context<RuntimeServiceContext>;
  evidence: ReturnType<typeof makeRuntimeEvidenceOwner>;
  lifecycle: LifecycleRuntimeOwner;
  ensureActor: {
    <
      DefinitionValue extends MachineDefinition,
      ProviderDefinition extends MachineDefinition = DefinitionValue,
    >(
      ref: ActorRef<Machine<DefinitionValue>>,
      options: RuntimeEnsureActorOptions<DefinitionValue, ProviderDefinition>,
    ): Effect.Effect<RuntimeActor<DefinitionValue, ProviderDefinition>, PublicDiagnostic>;
    <
      DefinitionValue extends MachineDefinition,
      ProviderDefinition extends MachineDefinition = DefinitionValue,
    >(
      options: RuntimeActorOptions<DefinitionValue, ProviderDefinition>,
    ): Effect.Effect<RuntimeActor<DefinitionValue, ProviderDefinition>, PublicDiagnostic>;
  };
  getActor: <
    DefinitionValue extends MachineDefinition,
    ProviderDefinition extends MachineDefinition = DefinitionValue,
  >(
    ref: ActorRef<Machine<DefinitionValue>>,
  ) => Effect.Effect<
    RuntimeActor<DefinitionValue, ProviderDefinition> | undefined,
    PublicDiagnostic
  >;
  createActor: {
    <
      DefinitionValue extends MachineDefinition,
      ProviderDefinition extends MachineDefinition = DefinitionValue,
    >(
      machine: Machine<DefinitionValue>,
      options: RuntimeLocalActorOptions<DefinitionValue, ProviderDefinition>,
    ): Effect.Effect<RuntimeActor<DefinitionValue, ProviderDefinition>, PublicDiagnostic>;
    /** Compatibility seam for package-internal callers migrating to ensureActor. */
    <
      DefinitionValue extends MachineDefinition,
      ProviderDefinition extends MachineDefinition = DefinitionValue,
    >(
      options: RuntimeActorOptions<DefinitionValue, ProviderDefinition>,
    ): Effect.Effect<RuntimeActor<DefinitionValue, ProviderDefinition>, PublicDiagnostic>;
  };
  dispose: () => Effect.Effect<void, PublicDiagnostic>;
};

export type RuntimeAdmissionPhase =
  | "reserve"
  | "prepare"
  | "attach"
  | "activate"
  | "register"
  | "expose";

export type RuntimeAdmissionProbe = {
  beforePrepare?: Effect.Effect<void>;
  afterPrepareScope?: (scope: Scope.Scope) => Effect.Effect<void, PublicDiagnostic>;
  beforeExpose?: Effect.Effect<void>;
  onPhase?: (phase: RuntimeAdmissionPhase) => void;
  onJoin?: () => void;
  onPendingCleared?: () => void;
  onAllocation?: (kind: "incarnation" | "local-ordinal") => void;
};

type RuntimeConstructionOwner = {
  admissionProbe?: RuntimeAdmissionProbe;
};

type RuntimeAdmissionActor<
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = RuntimeActor<DefinitionValue, ProviderDefinition> &
  RuntimeRegisteredActor & {
    ref: ActorRef<Machine<DefinitionValue>>;
  };

type RuntimeSnapshot = {
  state: unknown;
  memory: unknown;
  context: unknown;
  revision: number;
};

type RuntimeRegisteredActor = {
  fence: ActorFence;
  snapshot: () => RuntimeSnapshot;
  addDependency: (
    edge: ActorDependencyEdge,
  ) => Effect.Effect<void, PublicDiagnostic, RuntimeServiceContext>;
  removeDependency: (
    edge: ActorDependencyEdge,
  ) => Effect.Effect<void, PublicDiagnostic, RuntimeServiceContext>;
  addDependent: (dependent: RuntimeContextDependent) => void;
  removeDependent: (dependent: RuntimeContextDependent) => void;
  notifyDependents: (snapshot: RuntimeSnapshot) => void;
};

type RuntimeContextDependent = {
  edge: ActorDependencyEdge;
  receive: (
    providerFence: ActorFence,
    snapshot: RuntimeSnapshot,
  ) => Result.Result<void, PublicDiagnostic>;
};

const runtimeContextConsumerKey = <
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  bindings: ActorContextBinding<DefinitionValue, ProviderDefinition>[],
  identity: ActorIdentity<DefinitionValue> | undefined,
  machineFacts: MachineRecordValue | undefined,
  ref: ActorRef<Machine<DefinitionValue>>,
  registry: ActorIdentityRegistry<RuntimeRegisteredActor>,
) => {
  if (bindings.length === 0) return undefined;

  if (identity !== undefined) return identity.key;

  return isOwnedMachineFactsFor(machineFacts, ref.machine)
    ? registry.stableKey(ref, machineFacts)
    : undefined;
};

const captureRuntimeContextProviders = <
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  bindings: ContextBinding<DefinitionValue, ProviderDefinition>[],
  registry: ActorIdentityRegistry<RuntimeRegisteredActor>,
  incoming?: { providerFence: ActorFence; snapshot: RuntimeSnapshot },
) => {
  const snapshots = new Map<ActorKey, ActorContextSnapshot<ProviderDefinition>>();
  const revisions = new Map<ActorKey, number>();

  for (const binding of bindings) {
    const provider = registry.lookup(binding.provider);

    if (Result.isFailure(provider)) return Result.fail(provider.failure);

    const snapshot =
      incoming?.providerFence.key === binding.providerFence.key
        ? incoming.snapshot
        : provider.success.actor.snapshot();

    // SAFETY: each registry result is the provider named by its validated binding fence; incoming is that provider's live publication.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the heterogeneous registry erases the provider definition at this context projection boundary.
    snapshots.set(binding.providerFence.key, snapshot as ActorContextSnapshot<ProviderDefinition>);
    revisions.set(binding.providerFence.key, snapshot.revision);
  }

  return Result.succeed({ snapshots, revisions });
};

type CapturedRuntimeActorOptions<
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
> = {
  ref: ActorRef<Machine<DefinitionValue>>;
  construction: ActorAdmissionConstruction<DefinitionValue, InputOf<DefinitionValue>>;
  admissionMode: ActorAdmissionMode;
  store: ActorStore<DefinitionValue> | undefined;
  onSnapshot: RuntimeActorOptions<DefinitionValue, ProviderDefinition>["onSnapshot"];
  onCommand: RuntimeActorOptions<DefinitionValue, ProviderDefinition>["onCommand"];
  bindings: ActorContextBinding<DefinitionValue, ProviderDefinition>[];
};

const invalidRuntimeOption = (path: string) =>
  Failure({
    code: "SchemaValidation",
    path: ["actorOptions", path],
    details: { reason: "shape" },
    summary: "Runtime actor options are invalid.",
    help: "Provide stable actor options with the required private admission values.",
  });

type CapturedRuntimeConstruction<DefinitionValue extends MachineDefinition> = {
  construction: ActorAdmissionConstruction<DefinitionValue, InputOf<DefinitionValue>>;
  admissionMode: ActorAdmissionMode;
};

// RETURN_TYPE: Keeps the fresh input correlated with the exact machine whose prepared snapshot was verified.
const captureRuntimeConstruction = <DefinitionValue extends MachineDefinition>(
  values: Map<PropertyKey, unknown>,
  ref: ActorRef<Machine<DefinitionValue>>,
  identityMode: "stable" | "local" = "stable",
): Result.Result<CapturedRuntimeConstruction<DefinitionValue>, PublicDiagnostic> => {
  const hasInitial = values.has("initial");
  const hasRestore = values.has("restore");

  if (hasInitial === hasRestore)
    return Result.fail(invalidRuntimeOption(hasInitial ? "restore" : "initial"));

  if (hasRestore && values.has("input")) return Result.fail(invalidRuntimeOption("input"));

  const suppliedSnapshot = hasRestore ? values.get("restore") : values.get("initial");
  const admittedSnapshot = verifyPreparedActorSnapshot(ref.machine, suppliedSnapshot);

  if (Result.isFailure(admittedSnapshot)) return Result.fail(admittedSnapshot.failure);

  const construction: ActorAdmissionConstruction<
    DefinitionValue,
    InputOf<DefinitionValue>
  > = hasRestore
    ? { _tag: "restore", snapshot: admittedSnapshot.success }
    : {
        _tag: "fresh",
        initial: admittedSnapshot.success,
        // SAFETY: the option record was captured once; fresh input is trusted by the existing prepared-snapshot seam and is never reread.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the private runtime seam retains the machine-derived input type after structural capture.
        input: values.get("input") as InputOf<DefinitionValue> | undefined,
      };

  const admissionMode = resolveActorAdmissionMode(ref, construction, identityMode);

  if (Result.isFailure(admissionMode)) return Result.fail(admissionMode.failure);

  return Result.succeed({
    construction,
    admissionMode: admissionMode.success,
  });
};

const captureRuntimeBindings = <
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  value: unknown,
) =>
  value === undefined
    ? // SAFETY: undefined is the captured absence of optional bindings; the empty typed array is the canonical owned value for that branch.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      Result.succeed([] as ActorContextBinding<DefinitionValue, ProviderDefinition>[])
    : captureActorContextBindings<DefinitionValue, ProviderDefinition>(value);

// RETURN_TYPE: Keeps the captured commit action/result channels tied to the machine definition.
const captureRuntimeStore = <DefinitionValue extends MachineDefinition>(
  value: unknown,
): Result.Result<ActorStore<DefinitionValue> | undefined, PublicDiagnostic> => {
  if (value === undefined) return Result.succeed(undefined);
  const commit = captureAdmissionProperty(value, "commit");

  if (Result.isFailure(commit)) return Result.fail(commit.failure);

  if (!Predicate.isFunction(commit.success)) return Result.fail(invalidRuntimeOption("store"));
  // SAFETY: the commit function is captured from the stable store record once; the public
  // ActorStore type supplies its precise action/result channel at this private boundary.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const capturedCommit = commit.success as ActorStore<DefinitionValue>["commit"];

  return Result.succeed({ commit: (actions) => capturedCommit(actions) });
};

type CapturedRuntimeCallbacks<
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
> = Pick<
  CapturedRuntimeActorOptions<DefinitionValue, ProviderDefinition>,
  "onSnapshot" | "onCommand"
>;

const captureRuntimeCallbacks = <
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  values: Map<PropertyKey, unknown>,
) => {
  const onSnapshotValue = values.get("onSnapshot");

  if (onSnapshotValue !== undefined && !Predicate.isFunction(onSnapshotValue))
    return Result.fail(invalidRuntimeOption("onSnapshot"));
  const onCommandValue = values.get("onCommand");

  if (onCommandValue !== undefined && !Predicate.isFunction(onCommandValue))
    return Result.fail(invalidRuntimeOption("onCommand"));

  // SAFETY: only captured function values cross this boundary; later runtime stages do not
  // reread the caller's options record.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const onSnapshot = onSnapshotValue as CapturedRuntimeCallbacks<
    DefinitionValue,
    ProviderDefinition
  >["onSnapshot"];

  // SAFETY: only captured function values cross this boundary; later runtime stages do not
  // reread the caller's options record.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const onCommand = onCommandValue as CapturedRuntimeCallbacks<
    DefinitionValue,
    ProviderDefinition
  >["onCommand"];

  return Result.succeed({ onSnapshot, onCommand });
};

const runtimeActorOptionKeys = [
  "initial",
  "restore",
  "input",
  "store",
  "onSnapshot",
  "onCommand",
  "bindings",
] as const;

// RETURN_TYPE: Keeps every captured option channel correlated across the admission stages.
const captureRuntimeActorOptionsFromValues = <
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  values: Map<PropertyKey, unknown>,
  ref: ActorRef<Machine<DefinitionValue>>,
  identityMode: "stable" | "local" = "stable",
): Result.Result<
  CapturedRuntimeActorOptions<DefinitionValue, ProviderDefinition>,
  PublicDiagnostic
> => {
  const construction = captureRuntimeConstruction(values, ref, identityMode);

  if (Result.isFailure(construction)) return Result.fail(construction.failure);

  const bindings = captureRuntimeBindings<DefinitionValue, ProviderDefinition>(
    values.get("bindings"),
  );

  if (Result.isFailure(bindings)) return Result.fail(bindings.failure);

  const store = captureRuntimeStore<DefinitionValue>(values.get("store"));

  if (Result.isFailure(store)) return Result.fail(store.failure);

  const callbacks = captureRuntimeCallbacks<DefinitionValue, ProviderDefinition>(values);

  if (Result.isFailure(callbacks)) return Result.fail(callbacks.failure);

  return Result.succeed({
    ref,
    construction: construction.success.construction,
    admissionMode: construction.success.admissionMode,
    store: store.success,
    onSnapshot: callbacks.success.onSnapshot,
    onCommand: callbacks.success.onCommand,
    bindings: bindings.success,
  });
};

// RETURN_TYPE: Captures every caller-owned actor option before admission can reserve or run asynchronously.
const captureRuntimeActorOptions = <
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  options: unknown,
  identityMode: "stable" | "local" = "stable",
  isOpaqueLocalRef?: (value: unknown) => boolean,
): Result.Result<
  CapturedRuntimeActorOptions<DefinitionValue, ProviderDefinition>,
  PublicDiagnostic
> => {
  const captured = captureAdmissionRecord(options, ["ref"], runtimeActorOptionKeys);

  if (Result.isFailure(captured)) return Result.fail(captured.failure);

  if (isOpaqueLocalRef?.(captured.success.get("ref")) === true)
    return Result.fail(opaqueLocalActorRef());

  const ref = captureActorRef<DefinitionValue>(captured.success.get("ref"));

  if (Result.isFailure(ref)) return Result.fail(ref.failure);

  return captureRuntimeActorOptionsFromValues(captured.success, ref.success, identityMode);
};

// RETURN_TYPE: Preserves the machine/provider option channels after capturing the separately supplied ref.
const captureRuntimeActorOptionsForRef = <
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  ref: unknown,
  options: unknown,
  identityMode: "stable" | "local",
): Result.Result<
  CapturedRuntimeActorOptions<DefinitionValue, ProviderDefinition>,
  PublicDiagnostic
> => {
  const captured = captureAdmissionRecord(options, [], runtimeActorOptionKeys);

  if (Result.isFailure(captured)) return Result.fail(captured.failure);

  const capturedRef = captureActorRef<DefinitionValue>(ref);

  if (Result.isFailure(capturedRef)) return Result.fail(capturedRef.failure);

  return captureRuntimeActorOptionsFromValues(captured.success, capturedRef.success, identityMode);
};

// The actor engine exposes synchronous snapshot callbacks; invokeResult captures this thrown diagnostic at that boundary.
const notifyRuntimeDependents = (
  dependents: RuntimeContextDependent[],
  providerFence: ActorFence,
  snapshot: RuntimeSnapshot,
) => {
  for (const dependent of dependents) {
    const received = dependent.receive(providerFence, snapshot);

    if (Result.isFailure(received)) throw received.failure;
  }
};

// FLOW_STATE_ALLOW_UNKNOWN: the runtime retains this exact Deferred as an opaque join token and restores it only at the matching stable ref.
type RuntimeAdmissionCompletion = Deferred.Deferred<Exit.Exit<unknown, PublicDiagnostic>>;

const eraseRuntimeAdmissionCompletion = <Value>(
  completion: Deferred.Deferred<Exit.Exit<Value, PublicDiagnostic>>,
) => {
  // SAFETY: the pending registry stores this exact cell only as an opaque join token; the leader retains and completes its precise generic cell.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the runtime-only pending index erases the admission result type while preserving the exact Deferred identity.
  return completion as RuntimeAdmissionCompletion;
};

const duplicateStableClaim = () =>
  Failure({
    code: "DuplicateActorClaim",
    path: ["actorRef"],
    details: { claim: "duplicate" },
    summary: "This stable actor is already claimed incompatibly.",
    help: "Join the existing ensure or use a distinct stable identity.",
  });

const closedActorAdmission = () =>
  Failure({
    code: "InvariantViolation",
    path: ["mailbox", "closed"],
    details: { reason: "lifecycle" },
    summary: "Actor mailbox admission is closed by lifecycle state.",
    help: "Send only while the actor lifecycle is active.",
  });

const opaqueLocalActorRef = () =>
  Failure({
    code: "MissingActorRef",
    path: ["actorRef"],
    details: { local: true, stable: false },
    summary: "A local actor ref cannot be used for stable actor admission.",
    help: "Use the explicit local-actor creation path for opaque local refs.",
  });

const sendWithAdmissionGate =
  <DefinitionValue extends MachineDefinition>(
    engine: ActorEngine<DefinitionValue>,
    isAdmissionOpen: () => boolean,
  ) =>
  (command: ActorCommand<DefinitionValue>) => {
    if (!isAdmissionOpen()) throw closedActorAdmission();
    engine.send(command);
  };

export type Runtime<A extends RuntimeApp, ImplementationError = never> = {
  app: A;
  ready: () => Effect.Effect<void, ImplementationError>;
};

export type RuntimeSetup<A extends RuntimeApp, ImplementationError = never> = {
  app: A;
  construct: () => Runtime<A, ImplementationError>;
};

const admitConstructedApp = <A extends RuntimeApp>(value: A) => {
  if (!isConstructedApp(value))
    throw new TypeError("runtimeSetup app must be constructed by app()");
  appPlan(value);

  return value;
};

type IsCompleteImplementation<
  A extends RuntimeApp,
  I extends RuntimeImplementation,
> = I extends RuntimeImplementation
  ? [unknown] extends [ImplementationServices<I>]
    ? false
    : [RequirementsOf<A>] extends [ImplementationServices<I>]
      ? [Exclude<ImplementationRequirementsOf<I>, Scope.Scope>] extends [never]
        ? true
        : false
      : false
  : false;

type CompleteImplementation<A extends RuntimeApp, I extends RuntimeImplementation> =
  false extends IsCompleteImplementation<A, I> ? never : I;

type AttachedRuntimeOwner<ImplementationError> = {
  ready: () => Effect.Effect<void, ImplementationError>;
  close: () => Effect.Effect<void, ImplementationError | PublicDiagnostic>;
  assembly: () => RuntimeAssembly;
};

const attachedRuntimeOwners = new WeakMap<
  Runtime<RuntimeApp, unknown>,
  AttachedRuntimeOwner<unknown>
>();

export const runtimeOwner = <A extends RuntimeApp, ImplementationError>(
  runtime: Runtime<A, ImplementationError>,
) => {
  const owner = attachedRuntimeOwners.get(runtime);

  if (owner === undefined) throw new TypeError("Runtime has no attached owner");

  // SAFETY: constructRuntime stores exactly the owner whose ImplementationError parameter creates this Runtime.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- WeakMap erases the Runtime generic; the invariant is restored by its exact Runtime key.
  return owner as AttachedRuntimeOwner<ImplementationError>;
};

const constructRuntime = <A extends RuntimeApp, ImplementationError>(
  app: A,
  implementation: RuntimeImplementation | undefined,
  constructionOwner?: RuntimeConstructionOwner,
) => {
  const admissionProbe = constructionOwner?.admissionProbe;

  const runAfterPrepareScope = (scope: Scope.Scope) => {
    const afterPrepareScope = admissionProbe?.afterPrepareScope;

    if (afterPrepareScope === undefined) return Effect.void;

    return afterPrepareScope(scope);
  };

  let assembly: RuntimeAssembly | undefined;

  const exposed = Effect.gen(function* () {
    const clock = makeRuntimeClock(yield* Clock.Clock);
    const evidence = makeRuntimeEvidenceOwner({ app, plan: appPlan(app), clock });
    const implementationContext = yield* Effect.context();

    const context = Context.merge(
      implementationContext,
      yield* Layer.build(
        makeRuntimeServicesLayer({
          clock,
          scheduler: makeRuntimeScheduler(),
          evidence: evidence.service,
        }),
      ),
    );

    const lifecycleOwner = makeLifecycleRuntimeOwner({
      drain: evidence.service.drain,
    });

    lifecycleOwner.registerProvider(evidence.close().pipe(Effect.asVoid));

    const registry = makeActorIdentityRegistry<RuntimeRegisteredActor>(
      admissionProbe?.onAllocation === undefined ? {} : { onAllocate: admissionProbe.onAllocation },
    );

    const providerFences = new Map<ActorKey, ActorFence>();

    const runtimeScope = yield* Effect.scope;

    const pendingFor = <DefinitionValue extends MachineDefinition>(
      ref: ActorRef<Machine<DefinitionValue>>,
    ) => {
      const pending = registry.pending(ref);

      if (Option.isNone(pending)) return undefined;

      // SAFETY: ActorDirectory stores only the completion installed for this runtime's acquisition.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the exact ref slot restores the erased completion payload.
      return pending.value;
    };

    const rememberPending = <DefinitionValue extends MachineDefinition>(
      identity: ActorIdentity<DefinitionValue>,
      completion: RuntimeAdmissionCompletion,
    ) => registry.attachPending(identity, completion);

    // Test instrumentation observes Directory transitions but cannot change their committed result.
    const notifyPendingCleared = () => {
      const notify = admissionProbe?.onPendingCleared;

      if (notify === undefined) return;

      void Result.try({ try: notify, catch: () => undefined });
    };

    const forgetPending = <DefinitionValue extends MachineDefinition>(
      identity: ActorIdentity<DefinitionValue>,
      completion: RuntimeAdmissionCompletion,
    ) => {
      registry.clearPending(identity, completion);
      notifyPendingCleared();
    };

    const acquireActor = <
      DefinitionValue extends MachineDefinition,
      ProviderDefinition extends MachineDefinition = DefinitionValue,
    >(
      options: unknown,
      identityMode: "stable" | "local" = "stable",
      localIdentity?: ActorIdentity<DefinitionValue>,
      suppliedRef?: unknown,
    ) =>
      Effect.gen(function* () {
        if (!lifecycleOwner.isOpen()) return yield* Effect.fail(closedActorAdmission());

        if (
          identityMode === "stable" &&
          suppliedRef !== undefined &&
          registry.isLocalRef(suppliedRef)
        )
          return yield* Effect.fail(opaqueLocalActorRef());

        const capturedOptions =
          suppliedRef === undefined
            ? captureRuntimeActorOptions<DefinitionValue, ProviderDefinition>(
                options,
                identityMode,
                registry.isLocalRef,
              )
            : captureRuntimeActorOptionsForRef<DefinitionValue, ProviderDefinition>(
                suppliedRef,
                options,
                identityMode,
              );

        if (Result.isFailure(capturedOptions)) return yield* Effect.fail(capturedOptions.failure);
        const bindings = capturedOptions.success.bindings;
        const construction = capturedOptions.success.construction;

        const admittedInitialSnapshot =
          construction._tag === "restore" ? construction.snapshot : construction.initial;

        let projectVisibleSnapshot = (snapshot: ActorSnapshot<DefinitionValue>) => snapshot;

        let previous: ActorSnapshot<DefinitionValue> = admittedInitialSnapshot;

        const machineFacts = appPlan(app).resolveMachineFacts(capturedOptions.success.ref.machine);

        const consumerKey = runtimeContextConsumerKey(
          bindings,
          localIdentity,
          machineFacts,
          capturedOptions.success.ref,
          registry,
        );

        const dependencies: ActorDependencyEdge[] = bindings.map((binding) => ({
          consumer: consumerKey!,
          provider: binding.providerFence.key,
          slot: binding.slot,
        }));

        const admissionInput = {
          app,
          implementation,
          ref: capturedOptions.success.ref,
          // SAFETY: the tagged construction was verified against the exact ref machine before this admission record was assembled.
          input: construction._tag === "fresh" ? construction.input : undefined,
          bindings,
          dependencies,
        } satisfies ActorAdmissionInput<
          A,
          DefinitionValue,
          RuntimeImplementation | undefined,
          ProviderDefinition
        >;

        type AdmissionActor = RuntimeAdmissionActor<DefinitionValue, ProviderDefinition>;

        type AdmissionResult = {
          actor: AdmissionActor;
          lease: ActorLease<
            A,
            DefinitionValue,
            RuntimeImplementation | undefined,
            PublicDiagnostic,
            AdmissionActor,
            ProviderDefinition
          >;
        };

        type AdmissionCompletion = Deferred.Deferred<Exit.Exit<AdmissionResult, PublicDiagnostic>>;

        const contextDependents: RuntimeContextDependent[] = [];

        const reconcileContext = <
          Prepared extends {
            contextCoordinator: {
              reconcile: (
                engine: ActorEngine<DefinitionValue>,
              ) => Effect.Effect<void, PublicDiagnostic>;
            };
          },
        >(
          prepared: Prepared,
          engine: ActorEngine<DefinitionValue>,
        ) => prepared.contextCoordinator.reconcile(engine);

        const validationContextBase: Omit<
          ActorAdmissionValidationContext<A, DefinitionValue, RuntimeImplementation | undefined>,
          "consumerKey"
        > = {
          app,
          implementation,
          lookup: registry.lookup,
          plan: appPlan(app),
          providerFences,
          isAdmissionInFlight: (ref) => pendingFor(ref) !== undefined,
        };

        const reserveOrJoin = (
          validated: ValidatedActorAdmission<
            A,
            DefinitionValue,
            RuntimeImplementation | undefined,
            ProviderDefinition
          >,
        ) =>
          Effect.gen(function* () {
            const pending = pendingFor(validated.input.ref);

            if (pending !== undefined) {
              admissionProbe?.onJoin?.();

              // SAFETY: the pending cell is indexed by the exact stable machine/id slot;
              // concurrent callers receive the same admission result for that slot.
              return {
                mode: "joined",
                // SAFETY: pending.complete is the exact deferred cell for this stable machine/id slot; only its payload type is erased in the runtime index.
                // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- joining restores the current admission's precise deferred payload.
                existing: pending as AdmissionCompletion,
              } as const;
            }

            const existing = registry.lookup(validated.input.ref);

            if (Result.isSuccess(existing)) return yield* Effect.fail(duplicateStableClaim());

            if (existing.failure.code !== "MissingActorRef")
              return yield* Effect.fail(existing.failure);

            const reserved =
              localIdentity !== undefined && validated.identity !== undefined
                ? registry.reserveLocal(validated.identity)
                : registry.reserveStable(validated.input.ref, validated.input.machineFacts);

            if (Result.isFailure(reserved)) return yield* Effect.fail(reserved.failure);
            const reservedIdentity = reserved.success;

            const normalized = normalizeValidatedActorAdmission(validated, reservedIdentity.key);

            if (Result.isFailure(normalized)) {
              registry.rollback(reservedIdentity);

              return yield* Effect.fail(normalized.failure);
            }

            const actualFence: ActorFence = {
              key: reservedIdentity.key,
              incarnation: reservedIdentity.incarnation,
              generation: 0,
              leaseEpoch: reservedIdentity.leaseEpoch,
            };

            const created = yield* Deferred.make<Exit.Exit<AdmissionResult, PublicDiagnostic>>();
            const pendingCompletion = eraseRuntimeAdmissionCompletion(created);

            if (localIdentity === undefined) {
              const remembered = rememberPending(reservedIdentity, pendingCompletion);

              if (Result.isFailure(remembered)) return yield* Effect.fail(remembered.failure);
            }

            admissionProbe?.onPhase?.("reserve");

            const actualValidated: ValidatedActorAdmission<
              A,
              DefinitionValue,
              RuntimeImplementation | undefined,
              ProviderDefinition
            > & { identity: ActorIdentity<DefinitionValue>; fence: ActorFence } = {
              ...normalized.success,
              identity: reservedIdentity,
              fence: actualFence,
            };

            const reservationRollback: AdmissionRollbackStep = {
              name: "reservation",
              release: Effect.sync(() => {
                if (localIdentity === undefined) forgetPending(reservedIdentity, pendingCompletion);
                registry.rollback(reservedIdentity);
              }),
            };

            return {
              mode: "leader",
              admissionMode: capturedOptions.success.admissionMode,
              validated: actualValidated,
              rollback: [reservationRollback],
              complete: created,
            } as const;
          });

        const prepareAdmission = (
          validated: Extract<
            Effect.Success<ReturnType<typeof reserveOrJoin>>,
            { mode: "leader" }
          >["validated"],
          mode: ActorAdmissionMode,
        ) =>
          (() => {
            let preparedScope: Scope.Scope | undefined;

            const preparation = Effect.gen(function* () {
              admissionProbe?.onPhase?.("prepare");

              if (admissionProbe?.beforePrepare !== undefined) yield* admissionProbe.beforePrepare;
              const currentFence = validated.fence;

              const preparedLifecycle = prepareLifecycle<
                DefinitionValue,
                PublicDiagnostic,
                ProviderDefinition
              >(currentFence, { _tag: mode === "restored-stable" ? "restore" : "fresh" });

              if (Result.isFailure(preparedLifecycle))
                return yield* Effect.fail(preparedLifecycle.failure);

              const contextBindings = validated.input.bindings.map(
                (binding) =>
                  ({
                    ...binding,
                    consumer: currentFence.key,
                    consumerIncarnation: currentFence.incarnation,
                  }) satisfies ContextBinding<DefinitionValue, ProviderDefinition>,
              );

              const graph = buildContextGraph(contextBindings, validated.graph);

              if (Result.isFailure(graph)) return yield* Effect.fail(graph.failure);

              const capturedProviders = captureRuntimeContextProviders(contextBindings, registry);

              if (Result.isFailure(capturedProviders))
                return yield* Effect.fail(capturedProviders.failure);

              const { snapshots: providerSnapshots, revisions: providerRevisions } =
                capturedProviders.success;

              const installed = installContextBaseline(
                graph.success,
                providerSnapshots,
                providerRevisions,
              );

              if (Result.isFailure(installed)) return yield* Effect.fail(installed.failure);

              const providerFences = new Map<ActorKey, ActorFence>(
                contextBindings.map((binding) => [
                  binding.providerFence.key,
                  binding.providerFence,
                ]),
              );

              const lifecycleMetadata = installLifecycleMetadata(preparedLifecycle.success, {
                dependencies: validated.edges,
                bindings: contextBindings,
                providerRevisions,
                providerFences,
              });

              if (Result.isFailure(lifecycleMetadata))
                return yield* Effect.fail(lifecycleMetadata.failure);

              const lifecycleWithTimers = installLifecycleTimers(
                lifecycleMetadata.success,
                admittedInitialSnapshot.timers,
              );

              if (Result.isFailure(lifecycleWithTimers))
                return yield* Effect.fail(lifecycleWithTimers.failure);
              let activeEngine: ActorEngine<DefinitionValue> | undefined;

              const lifecycleController = makeLifecycleController(lifecycleWithTimers.success, {
                machineTurnRevision: () => activeEngine?.machineTurnRevision() ?? 0,
              });

              projectVisibleSnapshot = (snapshot: ActorSnapshot<DefinitionValue>) => {
                const lifecycle = lifecycleController.currentLifecycle();

                if (snapshot.lifecycle === lifecycle) return snapshot;

                return { ...snapshot, lifecycle };
              };

              let initialCandidate: ActorSnapshot<DefinitionValue> = admittedInitialSnapshot;

              const projection = installed.success.projections.find(
                (candidate) => candidate.consumer === currentFence.key,
              );

              if (projection !== undefined) {
                const contextSnapshot = { ...initialCandidate.context };

                for (const [slot, value] of projection.values)
                  Object.assign(contextSnapshot, { [slot]: value });
                initialCandidate = { ...initialCandidate, context: contextSnapshot };
              }

              const initialSnapshot = yield* Effect.fromResult(
                prepareActorSnapshot(
                  validated.input.machineFacts ?? validated.input.ref.machine,
                  initialCandidate,
                ),
              );

              const contextCoordinator = (() => {
                let open = false;
                let previousWave = Option.none<ContextWave>();
                let ledger = installed.success.ledger;

                let revisions = new Map<
                  ActorKey,
                  { publicationRevision: number; machineTurnRevision: number }
                >();

                const receive = (
                  providerFence: ActorFence,
                  incoming: RuntimeSnapshot,
                  dispatchFact: ActorEngine<DefinitionValue>["dispatchFact"],
                ) => {
                  if (!open) return Result.succeed(undefined);

                  const capturedProviders = captureRuntimeContextProviders(
                    contextBindings,
                    registry,
                    { providerFence, snapshot: incoming },
                  );

                  if (Result.isFailure(capturedProviders))
                    return Result.fail(capturedProviders.failure);

                  const { snapshots: providerSnapshots, revisions: providerRevision } =
                    capturedProviders.success;

                  const wave = planContextWave(
                    graph.success,
                    providerRevision,
                    new Set([providerFence.key]),
                    previousWave,
                  );

                  if (Result.isFailure(wave)) return Result.fail(wave.failure);

                  const applied = applyContextWave(
                    wave.success,
                    graph.success,
                    providerSnapshots,
                    ledger,
                    revisions,
                  );

                  if (Result.isFailure(applied)) return Result.fail(applied.failure);
                  const nextRevisions = new Map(revisions);

                  for (const publication of applied.success.publications) {
                    nextRevisions.set(publication.consumer, {
                      publicationRevision: publication.publicationRevision,
                      machineTurnRevision: publication.machineTurnRevision,
                    });

                    if (
                      !applied.success.projections.some(
                        (candidate) => candidate.consumer === publication.consumer,
                      )
                    )
                      continue;

                    const providerEntries = contextBindings.map((binding) => ({
                      fence: binding.providerFence,
                      slot: binding.slot,
                      revision: providerRevision.get(binding.providerFence.key) ?? 0,
                      value: publication.projection.values.get(binding.slot),
                    }));

                    const firstProvider = providerEntries[0];

                    if (firstProvider === undefined)
                      return Result.fail(
                        Failure({
                          code: "InvariantViolation",
                          path: ["context", "consumer", "providers"],
                          details: { reason: "empty" },
                          summary: "Context propagation produced an empty provider carrier.",
                          help: "Keep every admitted context binding in the aggregate publication.",
                        }),
                      );

                    const carrier: ContextProjectionCarrier = {
                      providers: providerEntries,
                      issueOnly: publication.issueOnly,
                      selectorDefects: publication.selectorDefects,
                    };

                    const dispatched = dispatchFact({
                      _tag: "context-projection",
                      provider: { ...firstProvider, value: carrier },
                      projection: carrier,
                    });

                    if (Result.isFailure(dispatched)) return Result.fail(dispatched.failure);
                  }

                  previousWave = Option.some(wave.success);
                  ledger = applied.success.ledger;
                  revisions = nextRevisions;

                  return Result.succeed(undefined);
                };

                return {
                  bindings: contextBindings,
                  setOpen: (value: boolean) => (open = value),
                  receive,
                  reconcile: (engine: ActorEngine<DefinitionValue>) =>
                    Effect.gen(function* () {
                      const seenProviders = new Set<ActorKey>();

                      for (const binding of contextBindings) {
                        if (seenProviders.has(binding.providerFence.key)) continue;
                        seenProviders.add(binding.providerFence.key);
                        const provider = registry.lookup(binding.provider);

                        if (Result.isFailure(provider)) return yield* Effect.fail(provider.failure);

                        const received = receive(
                          binding.providerFence,
                          provider.success.actor.snapshot(),
                          engine.dispatchFact,
                        );

                        if (Result.isFailure(received)) return yield* Effect.fail(received.failure);
                      }

                      yield* engine.drain();
                    }),
                };
              })();

              const scope = yield* Scope.make("sequential");
              preparedScope = scope;

              yield* runAfterPrepareScope(scope);
              previous = projectVisibleSnapshot(initialSnapshot);

              const actorInput: ActorEngineInput<DefinitionValue> = {
                initial: initialSnapshot,
                identity: validated.identity,
                machine: validated.input.machineFacts ?? validated.input.ref.machine,
                fence: currentFence,
                scope,
                acceptEvidence: (publication: ActorPublication<DefinitionValue>) => {
                  evidence.projectPublication(publication, projectVisibleSnapshot);

                  const accepted = evidence.acceptPublication(
                    validated.identity,
                    currentFence,
                    previous,
                    publication,
                  );

                  return accepted;
                },
                onSnapshot: (snapshot) => {
                  const visibleSnapshot = projectVisibleSnapshot(snapshot);
                  // Evidence preparation happens before the store cut commits. Advance the
                  // previous committed snapshot only after the engine publishes this snapshot.
                  previous = visibleSnapshot;

                  const runtimeSnapshot: RuntimeSnapshot = {
                    state: visibleSnapshot.state,
                    memory: visibleSnapshot.memory,
                    context: visibleSnapshot.context,
                    revision: visibleSnapshot.revision,
                  };

                  notifyRuntimeDependents(contextDependents, currentFence, runtimeSnapshot);
                  capturedOptions.success.onSnapshot?.(visibleSnapshot);
                },
              };

              if (capturedOptions.success.store !== undefined)
                Object.assign(actorInput, { store: capturedOptions.success.store });

              if (capturedOptions.success.onCommand !== undefined)
                Object.assign(actorInput, {
                  onCommand: (command: ActorCommand<DefinitionValue>) =>
                    Effect.updateContext((current) => Context.merge(context, current))(
                      capturedOptions.success.onCommand!(command),
                    ),
                });
              const prepared = yield* prepareActorEngine(actorInput);

              const preparedRollback: AdmissionRollbackStep = {
                name: "prepared",
                release: Effect.uninterruptible(
                  Effect.sync(() => prepared.abandon()).pipe(
                    Effect.flatMap(() => Scope.close(scope, Exit.void)),
                  ),
                ),
              };

              return {
                validated,
                scope,
                prepared,
                silentBaseline: installed.success,
                controller: lifecycleController,
                setEngine: (engine: ActorEngine<DefinitionValue>) => (activeEngine = engine),
                contextCoordinator,
                rollback: [preparedRollback],
              };
            });

            return preparation.pipe(
              Effect.onExit((exit) => {
                if (Exit.isSuccess(exit)) return Effect.void;

                return preparedScope === undefined ? Effect.void : Scope.close(preparedScope, exit);
              }),
            );
          })();

        const registerAdmission = (
          preparation: Effect.Success<ReturnType<typeof prepareAdmission>>,
          currentEngine: ActorEngine<DefinitionValue>,
          activationRollback: AdmissionRollbackStep,
        ) =>
          // oxlint-disable-next-line complexity, anti-slop/no-excessive-cognitive-complexity -- the scoped admission workflow keeps registration and every rollback obligation together.
          Effect.gen(function* () {
            admissionProbe?.onPhase?.("register");
            const currentIdentity = preparation.validated.identity;
            const currentFence = preparation.validated.fence;
            const currentController = preparation.controller;
            const currentRouting = lifecycleRouting(currentController);
            const propagation = preparation.contextCoordinator;

            const dependencies: Array<{
              owner: RuntimeRegisteredActor;
              edge: ActorDependencyEdge;
            }> = [];

            const dependents: Array<{
              owner: RuntimeRegisteredActor;
              dependent: RuntimeContextDependent;
            }> = [];

            let started = false;
            let actorScopeClosed = false;

            const startedOwner = {
              read: () => started,
              set: (value: boolean) => (started = value),
            };

            const visibleSnapshot = () => {
              return projectVisibleSnapshot(currentEngine.snapshot());
            };

            const engine: ActorEngine<DefinitionValue> = {
              ...currentEngine,
              snapshot: visibleSnapshot,
              snapshots: Stream.map(currentEngine.snapshots, projectVisibleSnapshot),
              send: sendWithAdmissionGate(currentEngine, currentController.isRoutable),
              dispatch: (command) => {
                if (currentController.isRoutable()) return currentEngine.dispatch(command);
                const completion = Deferred.makeUnsafe<DispatchReceipt, PublicDiagnostic>();
                Deferred.doneUnsafe(completion, Effect.fail(closedActorAdmission()));

                return { admitted: false, completion };
              },
              dispatchFact: (fact) =>
                currentController.isRoutable()
                  ? currentEngine.dispatchFact(fact)
                  : Result.fail(closedActorAdmission()),
              shutdown: (mode) => currentEngine.shutdown(mode),
            };

            const lifecycleCommandGate = Semaphore.makeUnsafe(1);

            const restoreRuntimeRoutingAfterFailure = (
              routingGeneration: number | undefined,
              reopenRouting: boolean,
            ) => {
              if (currentController.currentLifecycle() !== "active") return;

              if (reopenRouting && routingGeneration !== undefined)
                currentRouting.open(routingGeneration);

              propagation.setOpen(true);
            };

            const lifecycleCommandEffect = (command: LifecycleCommand<PublicDiagnostic>) =>
              Effect.gen(function* () {
                let routingGeneration: number | undefined;

                const routingPreparation = yield* Effect.exit(
                  Effect.gen(function* () {
                    if (command._tag === "actor:suspend") {
                      routingGeneration = currentRouting.block();
                      propagation.setOpen(false);
                      yield* currentEngine.drain();
                    } else if (command._tag === "actor:dispose") {
                      routingGeneration = currentRouting.block();
                      propagation.setOpen(false);
                    } else if (command._tag === "actor:resume") {
                      routingGeneration = currentRouting.block();
                    }
                  }),
                );

                if (Exit.isFailure(routingPreparation)) {
                  restoreRuntimeRoutingAfterFailure(routingGeneration, true);

                  return yield* Effect.failCause(routingPreparation.cause);
                }

                const commanded = yield* Effect.exit(
                  Effect.gen(function* () {
                    const result = yield* currentController.command(command);

                    if (command._tag === "actor:resume") {
                      propagation.setOpen(true);

                      const reconciled = yield* Effect.exit(
                        reconcileContext(preparation, currentEngine),
                      );

                      if (Exit.isFailure(reconciled)) {
                        propagation.setOpen(false);

                        return yield* Effect.failCause(reconciled.cause);
                      }

                      if (routingGeneration !== undefined) currentRouting.open(routingGeneration);
                    }

                    return result;
                  }),
                );

                previous = projectVisibleSnapshot(previous);

                if (Exit.isFailure(commanded)) {
                  restoreRuntimeRoutingAfterFailure(
                    routingGeneration,
                    command._tag !== "actor:resume",
                  );

                  return yield* Effect.failCause(commanded.cause);
                }

                const next = commanded.value;

                if (command._tag === "actor:start") {
                  propagation.setOpen(true);
                }

                return next;
              });

            const internalLifecycleCommand = (command: LifecycleCommand<PublicDiagnostic>) =>
              lifecycleCommandGate.withPermit(lifecycleCommandEffect(command));

            const publicLifecycleCommand = (command: LifecycleCommand<PublicDiagnostic>) =>
              Effect.gen(function* () {
                const lifecycle = currentController.currentLifecycle();

                const mayEnter =
                  currentController.isRoutable() ||
                  lifecycle === "prepared" ||
                  (lifecycle === "suspended" && command._tag === "actor:resume");

                if (!mayEnter) return yield* Effect.fail(closedActorAdmission());

                const acquired = yield* lifecycleCommandGate.withPermitsIfAvailable(1)(
                  Effect.gen(function* () {
                    const currentLifecycle = currentController.currentLifecycle();

                    const stillAdmitted =
                      currentController.isRoutable() ||
                      currentLifecycle === "prepared" ||
                      (currentLifecycle === "suspended" && command._tag === "actor:resume");

                    if (!stillAdmitted) return yield* Effect.fail(closedActorAdmission());

                    return yield* lifecycleCommandEffect(command);
                  }),
                );

                if (Option.isNone(acquired)) return yield* Effect.fail(closedActorAdmission());

                return acquired.value;
              });

            const lifecycle: LifecycleController<
              DefinitionValue,
              PublicDiagnostic,
              ProviderDefinition
            > = {
              currentLifecycle: currentController.currentLifecycle,
              isRoutable: currentController.isRoutable,
              state: currentController.state,
              command: publicLifecycleCommand,
              installMetadata: (metadata) =>
                lifecycleCommandGate.withPermit(currentController.installMetadata(metadata)),
            };

            const registeredProviderKeys = new Set<ActorKey>();

            for (const edge of preparation.validated.edges) {
              const binding = propagation.bindings.find(
                (candidate) =>
                  candidate.providerFence.key === edge.provider && candidate.slot === edge.slot,
              );

              if (binding === undefined)
                return yield* Effect.die(new Error("actor dependency binding is missing"));
              const provider = registry.lookup(binding.provider);

              if (Result.isFailure(provider))
                return yield* Effect.fail(
                  Failure({
                    code: "DisposedActorRef",
                    path: ["actor", "dependencies", edge.provider],
                    details: { provider: edge.provider },
                    summary: "A context provider is no longer active.",
                    help: "Keep every admitted provider active while creating its consumer.",
                  }),
                );
              const owner = provider.success.actor;

              const dependent: RuntimeContextDependent = {
                edge,
                receive: (providerFence, snapshot) =>
                  propagation.receive(providerFence, snapshot, engine.dispatchFact),
              };

              dependencies.push({ owner, edge });

              if (!registeredProviderKeys.has(binding.providerFence.key)) {
                registeredProviderKeys.add(binding.providerFence.key);
                dependents.push({ owner, dependent });
              }
            }

            const updateDependency = (edge: ActorDependencyEdge, add: boolean) =>
              Effect.gen(function* () {
                const current = yield* currentController.state();

                const existing = current.attachment.dependencies.some(
                  (candidate) =>
                    candidate.consumer === edge.consumer &&
                    candidate.provider === edge.provider &&
                    candidate.slot === edge.slot,
                );

                let dependencies: ActorDependencyEdge[];

                if (!add) {
                  dependencies = current.attachment.dependencies.filter(
                    (candidate) =>
                      candidate.consumer !== edge.consumer ||
                      candidate.provider !== edge.provider ||
                      candidate.slot !== edge.slot,
                  );
                } else if (existing) {
                  dependencies = current.attachment.dependencies;
                } else {
                  dependencies = [...current.attachment.dependencies, edge];
                }

                yield* currentController.installMetadata({
                  dependencies,
                  bindings: current.attachment.bindings,
                  providerRevisions: current.attachment.providerRevisions,
                  providerFences: current.attachment.providerFences ?? new Map(),
                });
              });

            const cleanup: Effect.Effect<void, PublicDiagnostic> = Effect.provideContext(
              Effect.gen(function* () {
                let cleanupCause: Cause.Cause<PublicDiagnostic> | undefined;

                const observe = (
                  effect: Effect.Effect<unknown, PublicDiagnostic, RuntimeServiceContext>,
                ) =>
                  Effect.gen(function* () {
                    const result = yield* Effect.exit(effect);

                    if (Exit.isFailure(result))
                      cleanupCause = appendCleanupCause(cleanupCause, result.cause);
                  });

                if (started)
                  yield* observe(
                    internalLifecycleCommand({
                      _tag: "actor:dispose",
                      cause: { _tag: "runtime-disposal" },
                    }),
                  );
                yield* observe(engine.shutdown("hard"));

                if (!actorScopeClosed) {
                  const scopeExit = yield* Effect.exit(Scope.close(preparation.scope, Exit.void));

                  if (Exit.isSuccess(scopeExit)) actorScopeClosed = true;
                  else cleanupCause = appendCleanupCause(cleanupCause, scopeExit.cause);
                }

                for (const registration of dependents)
                  yield* observe(
                    Effect.sync(() => registration.owner.removeDependent(registration.dependent)),
                  );

                for (const registration of dependencies)
                  yield* observe(
                    Effect.provideContext(
                      registration.owner.removeDependency(registration.edge),
                      context,
                    ),
                  );
                yield* observe(Effect.sync(() => providerFences.delete(currentIdentity.key)));

                if (cleanupCause !== undefined) yield* Effect.failCause(cleanupCause);
              }),
              context,
            );

            const tombstone = () => registry.tombstone(currentIdentity, evidence.hub.sequence());

            const disposeWithoutLease: Effect.Effect<void, PublicDiagnostic> = cleanup.pipe(
              Effect.flatMap(() => {
                const result = tombstone();

                return Result.isSuccess(result)
                  ? Effect.succeed(undefined)
                  : Effect.fail(result.failure);
              }),
            );

            let installedLease: AdmissionResult["lease"] | undefined;
            let lifecycleRegistration: LifecycleRuntimeRegistration | undefined;

            let parentFinalizer:
              | (() => Effect.Effect<void, PublicDiagnostic, RuntimeServiceContext>)
              | undefined;

            let actorReleased = false;

            const unregisterActor = () => {
              actorReleased = true;
              lifecycleRegistration?.unregister();
              lifecycleRegistration = undefined;
              parentFinalizer = undefined;
            };

            const disposeActor = () => {
              if (actorReleased) return Effect.void;

              return (installedLease?.dispose() ?? disposeWithoutLease).pipe(
                Effect.tap(() => Effect.sync(unregisterActor)),
              );
            };

            const abortRegistration = () => {
              if (actorReleased) return Effect.void;

              return Effect.provideContext(
                Effect.gen(function* () {
                  for (const registration of dependents)
                    registration.owner.removeDependent(registration.dependent);

                  for (const registration of dependencies)
                    yield* registration.owner.removeDependency(registration.edge);
                  providerFences.delete(currentIdentity.key);
                  unregisterActor();
                }),
                context,
              );
            };

            const handle = actorHandle(engine);

            const actorWithRef: AdmissionActor = {
              ref: preparation.validated.input.ref,
              identity: currentIdentity,
              fence: currentFence,
              engine,
              lifecycle,
              handle,
              dispose: disposeActor,
              snapshot: visibleSnapshot,
              addDependency: (edge) => updateDependency(edge, true),
              removeDependency: (edge) => updateDependency(edge, false),
              addDependent: (dependent) => {
                if (!contextDependents.includes(dependent)) contextDependents.push(dependent);
              },
              removeDependent: (dependent) => {
                const index = contextDependents.indexOf(dependent);

                if (index >= 0) contextDependents.splice(index, 1);
              },
              notifyDependents: (snapshot) => {
                notifyRuntimeDependents(contextDependents, currentFence, snapshot);
              },
            };

            const registered = registry.register(currentIdentity, actorWithRef);

            if (Result.isFailure(registered)) return yield* Effect.fail(registered.failure);
            providerFences.set(currentIdentity.key, currentFence);

            const lease = makeActorLease<
              A,
              DefinitionValue,
              RuntimeImplementation | undefined,
              PublicDiagnostic,
              AdmissionActor,
              ProviderDefinition
            >({
              actor: actorWithRef,
              admission: preparation.validated,
              cleanup,
              tombstone,
            });

            installedLease = lease;

            const registrationRollback: AdmissionRollbackStep = {
              name: "registration",
              release: Effect.suspend(abortRegistration),
            };

            rollback = includeReservation([
              ...preparation.rollback,
              activationRollback,
              registrationRollback,
            ]);

            if (admissionProbe?.beforeExpose !== undefined) yield* admissionProbe.beforeExpose;
            admissionProbe?.onPhase?.("expose");
            const currentLifecycle = actorWithRef.lifecycle;

            for (const registration of dependencies) {
              yield* Effect.provideContext(
                registration.owner.addDependency(registration.edge),
                context,
              );
            }

            for (const registration of dependents) {
              registration.owner.addDependent(registration.dependent);
            }

            if (capturedOptions.success.admissionMode === "restored-stable") {
              yield* Effect.provideContext(
                currentLifecycle.command({
                  _tag: "actor:restore",
                  cause: { _tag: "restore" },
                }),
                context,
              );
              startedOwner.set(true);
            }

            yield* Effect.provideContext(
              currentLifecycle.command({
                _tag: "actor:start",
                cause: {
                  _tag:
                    capturedOptions.success.admissionMode === "restored-stable"
                      ? "attachment"
                      : "fresh",
                },
              }),
              context,
            );
            startedOwner.set(true);
            yield* reconcileContext(preparation, actorWithRef.engine);

            const registration = lifecycleOwner.registerActor({
              dispose: actorWithRef.dispose,
            });

            if (!registration.accepted) return yield* Effect.fail(closedActorAdmission());

            lifecycleRegistration = registration;
            parentFinalizer = actorWithRef.dispose;
            yield* Scope.addFinalizer(
              runtimeScope,
              Effect.suspend(() => {
                const dispose = parentFinalizer;

                return dispose === undefined
                  ? Effect.void
                  : Effect.provideContext(Effect.exit(dispose()).pipe(Effect.asVoid), context);
              }),
            );

            const exposed = registry.expose(currentIdentity);

            if (Result.isFailure(exposed)) return yield* Effect.fail(exposed.failure);

            if (localIdentity === undefined) notifyPendingCleared();

            return {
              actor: actorWithRef,
              lease,
            } satisfies AdmissionResult;
          });

        const validationContext: ActorAdmissionValidationContext<
          A,
          DefinitionValue,
          RuntimeImplementation | undefined
        > =
          consumerKey === undefined
            ? validationContextBase
            : { ...validationContextBase, consumerKey };

        if (localIdentity !== undefined)
          Object.assign(validationContext, { identity: localIdentity });

        const validation = validateActorAdmission(admissionInput, validationContext);

        if (Result.isFailure(validation)) return yield* Effect.fail(validation.failure);

        const reservation = yield* Effect.uninterruptible(reserveOrJoin(validation.success));

        if (reservation.mode === "joined") {
          const terminal = yield* Deferred.await(reservation.existing);
          const joined = yield* completeActorAdmissionExit(terminal);

          return joined.actor;
        }

        let rollback: AdmissionRollbackStep[] = [...reservation.rollback];
        let exposedActor = false;

        const includeReservation = (steps: AdmissionRollbackStep[]) =>
          steps[0] === reservation.rollback[0] ? steps : [...reservation.rollback, ...steps];

        const acquisition = Effect.gen(function* () {
          yield* Effect.yieldNow;

          const preparation = yield* prepareAdmission(
            reservation.validated,
            reservation.admissionMode,
          );

          rollback = includeReservation(preparation.rollback);
          admissionProbe?.onPhase?.("attach");
          admissionProbe?.onPhase?.("activate");
          activateContextBaseline(preparation.silentBaseline);
          const engine = yield* preparation.prepared.activate();
          preparation.setEngine(engine);

          const activationRollback: AdmissionRollbackStep = {
            name: "activation",
            release: engine.shutdown("hard"),
          };

          rollback = includeReservation([...preparation.rollback, activationRollback]);
          const admitted = yield* registerAdmission(preparation, engine, activationRollback);
          exposedActor = true;

          return admitted;
        });

        const completed = yield* Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const primary = yield* Effect.exit(restore(acquisition));

            if (Exit.isSuccess(primary) || exposedActor) return primary;
            const cleanup = yield* Effect.exit(rollbackActorAdmission(rollback));

            if (Exit.isFailure(cleanup))
              return Exit.failCause(
                Cause.fromReasons([...primary.cause.reasons, ...cleanup.cause.reasons]),
              );

            return primary;
          }).pipe(
            Effect.flatMap((terminal) => {
              const normalized = normalizeActorAdmissionExit(terminal);

              return Deferred.succeed(reservation.complete, normalized).pipe(Effect.as(normalized));
            }),
          ),
        );

        const admitted = yield* completeActorAdmissionExit(completed);

        return admitted.actor;
      });

    const ensureActor: RuntimeAssembly["ensureActor"] = <
      DefinitionValue extends MachineDefinition,
      ProviderDefinition extends MachineDefinition = DefinitionValue,
    >(
      refOrOptions:
        | ActorRef<Machine<DefinitionValue>>
        | RuntimeActorOptions<DefinitionValue, ProviderDefinition>,
      options?: RuntimeEnsureActorOptions<DefinitionValue, ProviderDefinition>,
    ) => {
      if (options === undefined) {
        return acquireActor<DefinitionValue, ProviderDefinition>(refOrOptions, "stable");
      }

      return acquireActor<DefinitionValue, ProviderDefinition>(
        options,
        "stable",
        undefined,
        refOrOptions,
      );
    };

    const getActor = <
      DefinitionValue extends MachineDefinition,
      ProviderDefinition extends MachineDefinition = DefinitionValue,
    >(
      ref: ActorRef<Machine<DefinitionValue>>,
    ) =>
      Effect.gen(function* () {
        const opaqueLocal = registry.isLocalRef(ref);
        const captured = captureActorRef<DefinitionValue>(ref);

        if (Result.isFailure(captured)) return yield* Effect.fail(captured.failure);
        const found = registry.lookup(captured.success);

        if (Result.isFailure(found)) {
          if (opaqueLocal) return yield* Effect.fail(found.failure);

          if (found.failure.code === "MissingActorRef") return undefined;

          return yield* Effect.fail(found.failure);
        }

        // SAFETY: the registry stores RuntimeAdmissionActor values; this lookup restores the
        // exact machine/provider generic carried by the captured ref.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        return found.success.actor as unknown as RuntimeActor<DefinitionValue, ProviderDefinition>;
      });

    const createLocalActor = <
      DefinitionValue extends MachineDefinition,
      ProviderDefinition extends MachineDefinition = DefinitionValue,
    >(
      machine: Machine<DefinitionValue>,
      options: RuntimeLocalActorOptions<DefinitionValue, ProviderDefinition>,
    ) =>
      Effect.gen(function* () {
        if (!lifecycleOwner.isOpen()) return yield* Effect.fail(closedActorAdmission());

        const local = registry.createLocal(machine, { deferAllocationNotification: true });

        if (Result.isFailure(local)) return yield* Effect.fail(local.failure);

        const admitted = yield* Effect.exit(
          acquireActor<DefinitionValue, ProviderDefinition>(
            options,
            "local",
            local.success,
            local.success.ref,
          ),
        );

        if (Exit.isSuccess(admitted)) {
          const committed = registry.commitLocal(local.success);

          if (Result.isFailure(committed)) return yield* Effect.fail(committed.failure);

          return admitted.value;
        }

        registry.rollback(local.success);

        return yield* Effect.failCause(admitted.cause);
      });

    // RETURN_TYPE: Preserves the machine overload's definition generic after constructed-owner validation.
    const isRuntimeActorMachine = <
      DefinitionValue extends MachineDefinition,
      ProviderDefinition extends MachineDefinition,
    >(
      value: Machine<DefinitionValue> | RuntimeActorOptions<DefinitionValue, ProviderDefinition>,
    ): value is Machine<DefinitionValue> => isConstructedMachine(value);

    const createActor: RuntimeAssembly["createActor"] = <
      DefinitionValue extends MachineDefinition,
      ProviderDefinition extends MachineDefinition = DefinitionValue,
    >(
      machineOrOptions:
        | Machine<DefinitionValue>
        | RuntimeActorOptions<DefinitionValue, ProviderDefinition>,
      options?: RuntimeLocalActorOptions<DefinitionValue, ProviderDefinition>,
    ) => {
      if (options === undefined) {
        return acquireActor<DefinitionValue, ProviderDefinition>(machineOrOptions, "stable");
      }

      return Effect.gen(function* () {
        if (!isRuntimeActorMachine<DefinitionValue, ProviderDefinition>(machineOrOptions))
          return yield* Effect.fail(invalidRuntimeOption("machine"));

        return yield* createLocalActor<DefinitionValue, ProviderDefinition>(
          machineOrOptions,
          options,
        );
      });
    };

    assembly = {
      context,
      evidence,
      lifecycle: lifecycleOwner,
      ensureActor,
      getActor,
      createActor,
      dispose: () => Effect.provideContext(lifecycleOwner.dispose(), context),
    };

    return undefined;
  });

  const owner = makeRuntimeOwner({
    layer: implementation === undefined ? Layer.empty : implementationLayer(implementation),
    expose: exposed,
    close: Effect.suspend(() => assembly?.dispose() ?? Effect.void),
  });

  // SAFETY: RuntimeSetup proves that the admitted Implementation has no residual requirements and its erased private entries have exactly ImplementationError.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the heterogeneous graph erases entry channels; RuntimeSetup restores its proven error channel once at owner assembly.
  const attachedOwner = {
    ...owner,
    assembly: () => {
      if (assembly === undefined) throw new TypeError("Runtime is not ready");

      return assembly;
    },
  } as AttachedRuntimeOwner<ImplementationError>;

  const runtime: Runtime<A, ImplementationError> = { app, ready: attachedOwner.ready };
  attachedRuntimeOwners.set(runtime, attachedOwner);

  return runtime;
};

/** @internal Test-only construction route; public runtimeSetup remains provider-complete. */
export const runtimeSetupForAdmissionTestInternal = <A extends RuntimeApp>(
  value: A,
  constructionOwner: RuntimeConstructionOwner,
) => {
  const app = admitConstructedApp(value);

  return {
    app,
    construct: () => constructRuntime<A, never>(app, undefined, constructionOwner),
  };
};

export function runtimeSetup<A extends RuntimeApp>(
  options: {
    app: A;
  } & ([RequirementsOf<A>] extends [never]
    ? { implementation?: never }
    : { implementation: never }),
): RuntimeSetup<A>;

export function runtimeSetup<A extends RuntimeApp, I extends RuntimeImplementation>(options: {
  app: A;
  implementation: CompleteImplementation<A, I>;
}): RuntimeSetup<A, ImplementationErrorOf<I>>;

export function runtimeSetup<
  A extends RuntimeApp,
  I extends RuntimeImplementation | undefined,
  ImplementationError,
>(options: { app: A; implementation?: I }) {
  const app = admitConstructedApp(options.app);
  const implementation = options.implementation;

  return {
    app,
    construct: () => constructRuntime<A, ImplementationError>(app, implementation),
  };
}
