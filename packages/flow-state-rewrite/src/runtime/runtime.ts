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
  admitActor,
  captureActorContextBindings,
  captureActorRef,
  captureAdmissionProperty,
  captureAdmissionRecord,
  makeActorIdentityRegistry,
  makeActorLease,
  normalizeValidatedActorAdmission,
  resolveActorAdmissionMode,
  type ActorAdmissionInput,
  type ActorAdmissionConstruction,
  type ActorAdmissionTransactionAuthority,
  type ActorContextBinding,
  type ActorContextSnapshot,
  type ActorKey,
  type ActorDependencyEdge,
  type AdmissionRollbackStep,
  type ActorFence,
  type ActorIdentity,
  type ActorAdmissionMode,
  type ActorAdmissionPhaseOwners,
  type ActorLease,
  type ExposedActorAdmission,
  type ValidatedActorAdmission,
} from "./actor-admission.js";
import {
  actorHandle,
  prepareActorSnapshot,
  prepareActorEngine,
  verifyPreparedActorSnapshot,
  type PreparedActorEngine,
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
  type ActiveContextBaseline,
  type ContextBaseline,
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
import type { Machine, MachineRecordValue } from "../machine/machine.js";
import type { ActorRef } from "./actor-ref.js";
import type { ContextOf, InputOf } from "../definition/domain.js";

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
): Cause.Cause<Error> =>
  current === undefined
    ? Cause.fromReasons([...next.reasons])
    : Cause.fromReasons([...current.reasons, ...next.reasons]);

type RuntimeActorOptionBase<
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  readonly ref: ActorRef<Machine<DefinitionValue>>;
  readonly store?: ActorStore<DefinitionValue>;
  readonly onSnapshot?: ActorEngineInput<DefinitionValue>["onSnapshot"];
  readonly onCommand?: (
    command: ActorCommand<DefinitionValue>,
  ) => Effect.Effect<void, PublicDiagnostic, RuntimeServiceContext | Scope.Scope>;
  readonly bindings?: readonly ActorContextBinding<DefinitionValue, ProviderDefinition>[];
};

type RuntimeFreshActorOptions<
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = RuntimeActorOptionBase<DefinitionValue, ProviderDefinition> & {
  readonly initial: PreparedActorSnapshot<DefinitionValue>;
  readonly input?: InputOf<DefinitionValue>;
  readonly restore?: never;
};

type RuntimeRestoredActorOptions<
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = RuntimeActorOptionBase<DefinitionValue, ProviderDefinition> & {
  readonly restore: PreparedActorSnapshot<DefinitionValue>;
  readonly initial?: never;
  readonly input?: never;
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
  readonly identity: ActorIdentity<DefinitionValue>;
  readonly fence: ActorFence;
  readonly engine: ActorEngine<DefinitionValue>;
  readonly lifecycle: LifecycleController<DefinitionValue, PublicDiagnostic, ProviderDefinition>;
  readonly handle: ReturnType<typeof actorHandle<DefinitionValue>>;
  readonly dispose: () => Effect.Effect<void, PublicDiagnostic, RuntimeServiceContext>;
};

type RuntimeAssembly = {
  readonly context: Context.Context<RuntimeServiceContext>;
  readonly evidence: ReturnType<typeof makeRuntimeEvidenceOwner>;
  readonly lifecycle: LifecycleRuntimeOwner;
  readonly ensureActor: {
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
  readonly getActor: <
    DefinitionValue extends MachineDefinition,
    ProviderDefinition extends MachineDefinition = DefinitionValue,
  >(
    ref: ActorRef<Machine<DefinitionValue>>,
  ) => Effect.Effect<
    RuntimeActor<DefinitionValue, ProviderDefinition> | undefined,
    PublicDiagnostic
  >;
  readonly createActor: {
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
  readonly dispose: () => Effect.Effect<void, PublicDiagnostic>;
};

type RuntimeLifecycleRegistrationSlot = {
  current: LifecycleRuntimeRegistration | undefined;
};

type RuntimeParentFinalizer = {
  current: (() => Effect.Effect<void, PublicDiagnostic, RuntimeServiceContext>) | undefined;
};

type RuntimeLeaseState<Lease> =
  | { readonly _tag: "empty" }
  | { readonly _tag: "installed"; readonly lease: Lease };

type RuntimeLeaseOwner<Lease> = {
  readonly read: () => Lease | undefined;
  readonly install: (lease: Lease) => void;
};

type RuntimeScopeOwner = {
  readonly read: () => Scope.Scope | undefined;
  readonly install: (scope: Scope.Scope) => void;
};

const makeRuntimeScopeOwner = (): RuntimeScopeOwner => {
  let scope: Scope.Scope | undefined;

  return {
    read: () => scope,
    install: (next) => {
      if (scope !== undefined) throw new Error("Runtime actor scope was installed twice");

      scope = next;
    },
  };
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

const makeRuntimeLeaseOwner = <Lease>(): RuntimeLeaseOwner<Lease> => {
  let state: RuntimeLeaseState<Lease> = { _tag: "empty" };

  return {
    read: () => (state._tag === "installed" ? state.lease : undefined),
    install: (lease) => {
      if (state._tag === "installed") throw new Error("Runtime actor lease was installed twice");

      state = { _tag: "installed", lease };
    },
  };
};

type RuntimeAdmissionActor<
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = RuntimeActor<DefinitionValue, ProviderDefinition> &
  RuntimeRegisteredActor & {
    readonly ref: ActorRef<Machine<DefinitionValue>>;
  };

type RuntimeSnapshot = {
  readonly state: unknown;
  readonly memory: unknown;
  readonly context: unknown;
  readonly revision: number;
};

type RuntimeRegisteredActor = {
  readonly fence: ActorFence;
  readonly snapshot: () => RuntimeSnapshot;
  readonly addDependency: (
    edge: ActorDependencyEdge,
  ) => Effect.Effect<void, PublicDiagnostic, RuntimeServiceContext>;
  readonly removeDependency: (
    edge: ActorDependencyEdge,
  ) => Effect.Effect<void, PublicDiagnostic, RuntimeServiceContext>;
  readonly addDependent: (dependent: RuntimeContextDependent) => void;
  readonly removeDependent: (dependent: RuntimeContextDependent) => void;
  readonly notifyDependents: (snapshot: RuntimeSnapshot) => void;
};

type RuntimeContextDependent = {
  readonly edge: ActorDependencyEdge;
  readonly receive: (
    providerFence: ActorFence,
    snapshot: RuntimeSnapshot,
  ) => Result.Result<void, PublicDiagnostic>;
};

type CapturedRuntimeActorOptions<
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
> = {
  readonly ref: ActorRef<Machine<DefinitionValue>>;
  readonly construction: ActorAdmissionConstruction<DefinitionValue, InputOf<DefinitionValue>>;
  readonly admissionMode: ActorAdmissionMode;
  readonly store: ActorStore<DefinitionValue> | undefined;
  readonly onSnapshot: RuntimeActorOptions<DefinitionValue, ProviderDefinition>["onSnapshot"];
  readonly onCommand: RuntimeActorOptions<DefinitionValue, ProviderDefinition>["onCommand"];
  readonly bindings: readonly ActorContextBinding<DefinitionValue, ProviderDefinition>[];
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
  readonly construction: ActorAdmissionConstruction<DefinitionValue, InputOf<DefinitionValue>>;
  readonly admissionMode: ActorAdmissionMode;
};

const captureRuntimeConstruction = <DefinitionValue extends MachineDefinition>(
  values: ReadonlyMap<PropertyKey, unknown>,
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

  return Result.succeed({ construction, admissionMode: admissionMode.success });
};

const captureRuntimeBindings = <
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  value: unknown,
): Result.Result<
  readonly ActorContextBinding<DefinitionValue, ProviderDefinition>[],
  PublicDiagnostic
> =>
  value === undefined
    ? // SAFETY: undefined is the captured absence of optional bindings; the empty typed array is the canonical owned value for that branch.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      Result.succeed([] as readonly ActorContextBinding<DefinitionValue, ProviderDefinition>[])
    : captureActorContextBindings<DefinitionValue, ProviderDefinition>(value);

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
  values: ReadonlyMap<PropertyKey, unknown>,
): Result.Result<
  CapturedRuntimeCallbacks<DefinitionValue, ProviderDefinition>,
  PublicDiagnostic
> => {
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

const captureRuntimeActorOptionsFromValues = <
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  values: ReadonlyMap<PropertyKey, unknown>,
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
  options: RuntimeActorOptions<DefinitionValue, ProviderDefinition>,
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

const captureRuntimeActorOptionsForRef = <
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  ref: ActorRef<Machine<DefinitionValue>>,
  options:
    | RuntimeEnsureActorOptions<DefinitionValue, ProviderDefinition>
    | RuntimeLocalActorOptions<DefinitionValue, ProviderDefinition>,
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
  dependents: readonly RuntimeContextDependent[],
  providerFence: ActorFence,
  snapshot: RuntimeSnapshot,
) => {
  for (const dependent of dependents) {
    const received = dependent.receive(providerFence, snapshot);

    if (Result.isFailure(received)) throw received.failure;
  }
};

type RuntimeAdmissionCompletion = Deferred.Deferred<Exit.Exit<unknown, PublicDiagnostic>>;

type RuntimePendingAdmission = {
  /** The cell itself is the stable identity token; its generic payload stays per admission. */
  readonly complete: RuntimeAdmissionCompletion;
};

const eraseRuntimeAdmissionCompletion = <Value>(
  completion: Deferred.Deferred<Exit.Exit<Value, PublicDiagnostic>>,
) => {
  // SAFETY: the pending registry stores this exact cell only as an opaque join token; the leader retains and completes its precise generic cell.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the runtime-only pending index erases the admission result type while preserving the exact Deferred identity.
  return completion as RuntimeAdmissionCompletion;
};

type RuntimeValidatedAdmission<
  A extends RuntimeApp,
  DefinitionValue extends MachineDefinition,
  I,
  ProviderDefinition extends MachineDefinition,
  Owner,
> = ValidatedActorAdmission<A, DefinitionValue, I, ProviderDefinition> &
  Owner & {
    readonly identity: ActorIdentity<DefinitionValue>;
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
  readonly ready: () => Effect.Effect<void, ImplementationError>;
  readonly close: () => Effect.Effect<void, ImplementationError | PublicDiagnostic>;
  readonly assembly: () => RuntimeAssembly;
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

    const pendingByMachine = new WeakMap<
      MachineRecordValue,
      Map<string, RuntimePendingAdmission>
    >();

    const runtimeScope = yield* Effect.scope;

    const pendingFor = <DefinitionValue extends MachineDefinition>(
      ref: ActorRef<Machine<DefinitionValue>>,
    ) => pendingByMachine.get(ref.machine)?.get(ref.id);

    const rememberPending = <DefinitionValue extends MachineDefinition>(
      ref: ActorRef<Machine<DefinitionValue>>,
      pending: RuntimePendingAdmission,
    ) => {
      let byId = pendingByMachine.get(ref.machine);

      if (byId === undefined) {
        byId = new Map();
        pendingByMachine.set(ref.machine, byId);
      }

      byId.set(ref.id, pending);
    };

    const forgetPending = <DefinitionValue extends MachineDefinition>(
      ref: ActorRef<Machine<DefinitionValue>>,
      completion: RuntimeAdmissionCompletion,
    ) => {
      const byId = pendingByMachine.get(ref.machine);

      if (byId?.get(ref.id)?.complete !== completion) return;
      byId.delete(ref.id);

      admissionProbe?.onPendingCleared?.();

      if (byId.size === 0) pendingByMachine.delete(ref.machine);
    };

    const admitRuntimeActor = <
      DefinitionValue extends MachineDefinition,
      ProviderDefinition extends MachineDefinition = DefinitionValue,
    >(
      options:
        | RuntimeActorOptions<DefinitionValue, ProviderDefinition>
        | RuntimeEnsureActorOptions<DefinitionValue, ProviderDefinition>
        | RuntimeLocalActorOptions<DefinitionValue, ProviderDefinition>,
      identityMode: "stable" | "local" = "stable",
      localIdentity?: ActorIdentity<DefinitionValue>,
      suppliedRef?: ActorRef<Machine<DefinitionValue>>,
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
            ? captureRuntimeActorOptions(
                // SAFETY: an absent suppliedRef selects the options-object overload, which requires and captures its own ref.
                // oxlint-disable-next-line anti-slop/require-safety-comment-for-type-assertion
                options as RuntimeActorOptions<DefinitionValue, ProviderDefinition>,
                identityMode,
                registry.isLocalRef,
              )
            : captureRuntimeActorOptionsForRef(suppliedRef, options, identityMode);

        if (Result.isFailure(capturedOptions)) return yield* Effect.fail(capturedOptions.failure);
        const bindings = capturedOptions.success.bindings;
        const construction = capturedOptions.success.construction;

        const admittedInitialSnapshot =
          construction._tag === "restore" ? construction.snapshot : construction.initial;

        let projectVisibleSnapshot = (
          snapshot: ActorSnapshot<DefinitionValue>,
        ): ActorSnapshot<DefinitionValue> => snapshot;

        let previous: ActorSnapshot<DefinitionValue> = admittedInitialSnapshot;

        const machineFacts = appPlan(app).resolveMachineFacts(capturedOptions.success.ref.machine);

        // SAFETY: stableKey is a pure runtime/app-machine/ref tuple; deriving it does not reserve an incarnation or mutate the registry.
        let consumerKey: ActorKey | undefined;

        if (bindings.length !== 0) {
          if (localIdentity !== undefined) consumerKey = localIdentity.key;
          else if (isOwnedMachineFactsFor(machineFacts, capturedOptions.success.ref.machine))
            consumerKey = registry.stableKey(capturedOptions.success.ref, machineFacts);
        }

        const dependencies: readonly ActorDependencyEdge[] = bindings.map((binding) => ({
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

        type AdmissionResult = ExposedActorAdmission<
          A,
          DefinitionValue,
          RuntimeImplementation | undefined,
          PublicDiagnostic,
          AdmissionActor,
          ProviderDefinition
        >;

        type AdmissionCompletion = Deferred.Deferred<Exit.Exit<AdmissionResult, PublicDiagnostic>>;

        type RuntimePropagationOwner = {
          readonly bindings: readonly ContextBinding<DefinitionValue, ProviderDefinition>[];
          readonly setOpen: (open: boolean) => void;
          readonly receive: (
            providerFence: ActorFence,
            snapshot: RuntimeSnapshot,
            dispatchFact: ActorEngine<DefinitionValue>["dispatchFact"],
          ) => Result.Result<void, PublicDiagnostic>;
          readonly reconcile: (
            engine: ActorEngine<DefinitionValue>,
          ) => Effect.Effect<void, PublicDiagnostic>;
        };

        type RuntimeEngineRevisionOwner = {
          readonly read: () => number;
          readonly set: (engine: ActorEngine<DefinitionValue>) => void;
        };

        type RuntimeAdmissionCarrierPhase =
          | "reserved"
          | "prepared"
          | "attached"
          | "activated"
          | "registered";

        type RuntimeAdmissionCarrier<Phase extends RuntimeAdmissionCarrierPhase> = {
          readonly phase: Phase;
          readonly identity: ActorIdentity<DefinitionValue>;
          readonly fence: ActorFence;
          readonly pendingCompletion: RuntimeAdmissionCompletion;
        } & (Phase extends "reserved"
          ? {}
          : {
              readonly rollback: readonly AdmissionRollbackStep[];
              readonly validated: RuntimeValidatedAdmission<
                A,
                DefinitionValue,
                RuntimeImplementation | undefined,
                ProviderDefinition,
                RuntimeAdmissionCarrier<"reserved">
              >;
              readonly scope: Scope.Scope;
              readonly snapshot: PreparedActorSnapshot<DefinitionValue>;
              readonly prepared: PreparedActorEngine<DefinitionValue>;
              readonly silentBaseline: ContextBaseline<DefinitionValue, ProviderDefinition>;
              readonly controller: LifecycleController<
                DefinitionValue,
                PublicDiagnostic,
                ProviderDefinition
              >;
              readonly engineRevision: RuntimeEngineRevisionOwner;
              readonly propagation: RuntimePropagationOwner;
              readonly mailbox: PreparedActorEngine<DefinitionValue>["mailbox"];
            }) &
          (Phase extends "attached" | "activated" | "registered"
            ? {
                readonly context: Readonly<ContextOf<DefinitionValue>>;
                readonly edges: readonly ActorDependencyEdge[];
              }
            : {}) &
          (Phase extends "activated" | "registered"
            ? {
                readonly baseline: ActiveContextBaseline<DefinitionValue, ProviderDefinition>;
                readonly engine: ActorEngine<DefinitionValue>;
              }
            : {}) &
          (Phase extends "registered"
            ? {
                readonly dependencies: readonly {
                  readonly owner: RuntimeRegisteredActor;
                  readonly edge: ActorDependencyEdge;
                }[];
                readonly dependents: readonly {
                  readonly owner: RuntimeRegisteredActor;
                  readonly dependent: RuntimeContextDependent;
                }[];
                readonly started: {
                  readonly read: () => boolean;
                  readonly set: (value: boolean) => void;
                };
                readonly leaseOwner: RuntimeLeaseOwner<
                  ActorLease<
                    A,
                    DefinitionValue,
                    RuntimeImplementation | undefined,
                    PublicDiagnostic,
                    AdmissionActor,
                    ProviderDefinition
                  >
                >;
                readonly lifecycleRegistration: RuntimeLifecycleRegistrationSlot;
                readonly parentFinalizer: RuntimeParentFinalizer;
                readonly cleanup: Effect.Effect<void, PublicDiagnostic>;
                readonly sealed: true;
                readonly actor: RuntimeAdmissionActor<DefinitionValue, ProviderDefinition>;
                readonly lease: ActorLease<
                  A,
                  DefinitionValue,
                  RuntimeImplementation | undefined,
                  PublicDiagnostic,
                  AdmissionActor,
                  ProviderDefinition
                >;
              }
            : {});

        type RuntimeAdmissionCarriers = ActorAdmissionPhaseOwners<
          RuntimeAdmissionCarrier<"reserved">,
          RuntimeAdmissionCarrier<"prepared">,
          RuntimeAdmissionCarrier<"attached">,
          RuntimeAdmissionCarrier<"activated">,
          RuntimeAdmissionCarrier<"registered">
        >;

        const contextDependents: RuntimeContextDependent[] = [];

        const reconcileContext = (
          prepared: Pick<RuntimeAdmissionCarrier<"prepared">, "propagation">,
          engine: ActorEngine<DefinitionValue>,
        ): Effect.Effect<void, PublicDiagnostic> => prepared.propagation.reconcile(engine);

        type RuntimeAuthority = ActorAdmissionTransactionAuthority<
          A,
          DefinitionValue,
          RuntimeImplementation | undefined,
          PublicDiagnostic,
          AdmissionActor,
          ProviderDefinition,
          RuntimeAdmissionCarriers
        >;

        const authorityBase: Omit<RuntimeAuthority, "consumerKey"> = {
          app,
          implementation,
          lookup: registry.lookup,
          plan: appPlan(app),
          providerFences,
          isAdmissionInFlight: (ref) => pendingFor(ref) !== undefined,
          reserveOrJoin: (validated) =>
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
                  existing: pending.complete as AdmissionCompletion,
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
              rememberPending(validated.input.ref, { complete: pendingCompletion });

              const reservationCarrier: RuntimeAdmissionCarrier<"reserved"> = {
                phase: "reserved",
                identity: reservedIdentity,
                fence: actualFence,
                pendingCompletion,
              };

              admissionProbe?.onPhase?.("reserve");

              const actualValidated: RuntimeValidatedAdmission<
                A,
                DefinitionValue,
                RuntimeImplementation | undefined,
                ProviderDefinition,
                RuntimeAdmissionCarrier<"reserved">
              > = {
                ...normalized.success,
                ...reservationCarrier,
              };

              const reservationRollback: AdmissionRollbackStep = {
                name: "reservation",
                release: Effect.sync(() => {
                  forgetPending(validated.input.ref, pendingCompletion);
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
            }),
          prepare: (validated, mode) =>
            (() => {
              const preparedScope = makeRuntimeScopeOwner();

              const preparation = Effect.gen(function* () {
                admissionProbe?.onPhase?.("prepare");

                if (admissionProbe?.beforePrepare !== undefined)
                  yield* admissionProbe.beforePrepare;
                const reservationCarrier = validated;
                const currentFence = reservationCarrier.fence;

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

                const providerSnapshots = new Map<
                  ActorKey,
                  ActorContextSnapshot<ProviderDefinition>
                >();

                const providerRevisions = new Map<ActorKey, number>();

                for (const binding of contextBindings) {
                  const provider = registry.lookup(binding.provider);

                  if (Result.isFailure(provider)) return yield* Effect.fail(provider.failure);
                  const snapshot = provider.success.actor.snapshot();
                  // SAFETY: registry lookup returns the exact registered provider named by this
                  // validated binding, and its snapshot is produced by that provider engine.
                  providerSnapshots.set(
                    binding.providerFence.key,
                    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the heterogeneous registry erases the provider definition at this boundary.
                    snapshot as ActorContextSnapshot<ProviderDefinition>,
                  );
                  providerRevisions.set(binding.providerFence.key, snapshot.revision);
                }

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

                const engineRevision: RuntimeEngineRevisionOwner = {
                  read: () => activeEngine?.machineTurnRevision() ?? 0,
                  set: (engine) => (activeEngine = engine),
                };

                const lifecycleController = makeLifecycleController(lifecycleWithTimers.success, {
                  machineTurnRevision: engineRevision.read,
                });

                projectVisibleSnapshot = (
                  snapshot: ActorSnapshot<DefinitionValue>,
                ): ActorSnapshot<DefinitionValue> => {
                  const lifecycle = lifecycleController.currentLifecycle();

                  if (snapshot.lifecycle === lifecycle) return snapshot;

                  // oxlint-disable-next-line anti-slop/no-object-freeze -- lifecycle overlay is an immutable runtime snapshot.
                  return Object.freeze({ ...snapshot, lifecycle });
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

                const propagation: RuntimePropagationOwner = (() => {
                  let open = false;
                  let previousWave = Option.none<ContextWave>();
                  let ledger = installed.success.ledger;

                  let revisions = new Map<
                    ActorKey,
                    { readonly publicationRevision: number; readonly machineTurnRevision: number }
                  >();

                  const receive = (
                    providerFence: ActorFence,
                    incoming: RuntimeSnapshot,
                    dispatchFact: ActorEngine<DefinitionValue>["dispatchFact"],
                  ): Result.Result<void, PublicDiagnostic> => {
                    if (!open) return Result.succeed(undefined);

                    const providerSnapshots = new Map<
                      ActorKey,
                      ActorContextSnapshot<ProviderDefinition>
                    >();

                    const providerRevision = new Map<ActorKey, number>();

                    for (const binding of contextBindings) {
                      const provider = registry.lookup(binding.provider);

                      if (Result.isFailure(provider)) return Result.fail(provider.failure);

                      const snapshot =
                        binding.providerFence.key === providerFence.key
                          ? incoming
                          : provider.success.actor.snapshot();

                      providerSnapshots.set(
                        binding.providerFence.key,
                        // SAFETY: the provider registry entry is checked against the validated binding fence before this heterogeneous snapshot is projected.
                        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the heterogeneous registry erases the provider definition at this boundary.
                        snapshot as ActorContextSnapshot<ProviderDefinition>,
                      );
                      providerRevision.set(binding.providerFence.key, snapshot.revision);
                    }

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
                    setOpen: (value) => (open = value),
                    receive,
                    reconcile: (engine: ActorEngine<DefinitionValue>) =>
                      Effect.gen(function* () {
                        const seenProviders = new Set<ActorKey>();

                        for (const binding of contextBindings) {
                          if (seenProviders.has(binding.providerFence.key)) continue;
                          seenProviders.add(binding.providerFence.key);
                          const provider = registry.lookup(binding.provider);

                          if (Result.isFailure(provider))
                            return yield* Effect.fail(provider.failure);

                          const received = receive(
                            binding.providerFence,
                            provider.success.actor.snapshot(),
                            engine.dispatchFact,
                          );

                          if (Result.isFailure(received))
                            return yield* Effect.fail(received.failure);
                        }

                        yield* engine.drain();
                      }),
                  };
                })();

                const scope = yield* Scope.make("sequential");
                preparedScope.install(scope);

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
                  ...reservationCarrier,
                  phase: "prepared" as const,
                  validated,
                  scope,
                  snapshot: initialSnapshot,
                  prepared,
                  silentBaseline: installed.success,
                  controller: lifecycleController,
                  engineRevision,
                  propagation,
                  mailbox: prepared.mailbox,
                  rollback: [preparedRollback],
                } satisfies RuntimeAdmissionCarrier<"prepared">;
              });

              return preparation.pipe(
                Effect.onExit((exit) => {
                  if (Exit.isSuccess(exit)) return Effect.void;

                  const scope = preparedScope.read();

                  return scope === undefined ? Effect.void : Scope.close(scope, exit);
                }),
              );
            })(),
          attach: (prepared) =>
            Effect.sync(() => {
              admissionProbe?.onPhase?.("attach");

              return {
                ...prepared,
                phase: "attached" as const,
                // SAFETY: prepareActorEngine admitted this snapshot against the exact DefinitionValue machine before attachment.
                context: prepared.snapshot.context,
                edges: prepared.validated.edges,
                rollback: prepared.rollback,
              } satisfies RuntimeAdmissionCarrier<"attached">;
            }),
          activate: (attached) =>
            Effect.gen(function* () {
              admissionProbe?.onPhase?.("activate");
              const prepared = attached;
              const activeBaseline = activateContextBaseline(prepared.silentBaseline);
              const engine = yield* prepared.prepared.activate();
              prepared.engineRevision.set(engine);

              const activationRollback: AdmissionRollbackStep = {
                name: "activation",
                release: engine.shutdown("hard"),
              };

              return {
                ...attached,
                phase: "activated" as const,
                baseline: activeBaseline,
                engine,
                rollback: [...attached.rollback, activationRollback],
              } satisfies RuntimeAdmissionCarrier<"activated">;
            }),
          register: (activated) =>
            Effect.gen(function* () {
              admissionProbe?.onPhase?.("register");
              const activatedCarrier = activated;
              const currentIdentity = activatedCarrier.identity;
              const currentFence = activatedCarrier.fence;
              const currentEngine = activatedCarrier.engine;
              const currentController = activatedCarrier.controller;
              const currentRouting = lifecycleRouting(currentController);
              const propagation = activatedCarrier.propagation;

              const dependencies: Array<{
                readonly owner: RuntimeRegisteredActor;
                readonly edge: ActorDependencyEdge;
              }> = [];

              const dependents: Array<{
                readonly owner: RuntimeRegisteredActor;
                readonly dependent: RuntimeContextDependent;
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

              const lifecycleCommandEffect = (command: LifecycleCommand<PublicDiagnostic>) =>
                Effect.gen(function* () {
                  let routingGeneration: number | undefined;

                  const preparation = yield* Effect.exit(
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

                  if (Exit.isFailure(preparation)) {
                    if (currentController.currentLifecycle() === "active") {
                      if (routingGeneration !== undefined) currentRouting.open(routingGeneration);

                      propagation.setOpen(true);
                    }

                    return yield* Effect.failCause(preparation.cause);
                  }

                  const commanded = yield* Effect.exit(
                    Effect.gen(function* () {
                      const result = yield* currentController.command(command);

                      if (command._tag === "actor:resume") {
                        propagation.setOpen(true);

                        const reconciled = yield* Effect.exit(
                          reconcileContext(activatedCarrier, currentEngine),
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
                    if (currentController.currentLifecycle() === "active") {
                      if (command._tag !== "actor:resume" && routingGeneration !== undefined)
                        currentRouting.open(routingGeneration);

                      propagation.setOpen(true);
                    }

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

              for (const edge of activated.validated.edges) {
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

                  let dependencies: readonly ActorDependencyEdge[];

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
                    const scopeExit = yield* Effect.exit(
                      Scope.close(activatedCarrier.scope, Exit.void),
                    );

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

              const leaseOwner =
                makeRuntimeLeaseOwner<
                  ActorLease<
                    A,
                    DefinitionValue,
                    RuntimeImplementation | undefined,
                    PublicDiagnostic,
                    AdmissionActor,
                    ProviderDefinition
                  >
                >();

              const lifecycleRegistration: RuntimeLifecycleRegistrationSlot = {
                current: undefined,
              };

              const parentFinalizer: RuntimeParentFinalizer = {
                current: undefined,
              };

              let actorReleased = false;

              const disposeActor = () => {
                if (actorReleased) return Effect.void;

                return (leaseOwner.read()?.dispose() ?? disposeWithoutLease).pipe(
                  Effect.tap(() =>
                    Effect.sync(() => {
                      actorReleased = true;
                      lifecycleRegistration.current?.unregister();
                      lifecycleRegistration.current = undefined;
                      parentFinalizer.current = undefined;
                    }),
                  ),
                );
              };

              const handle = actorHandle(engine);

              const actorWithRef: AdmissionActor = {
                ref: activated.validated.input.ref,
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
                admission: activated.validated,
                cleanup,
                tombstone,
              });

              leaseOwner.install(lease);

              const registrationRollback: AdmissionRollbackStep = {
                name: "registration",
                release: Effect.suspend(disposeActor),
              };

              return {
                ...activated,
                phase: "registered" as const,
                dependencies,
                dependents,
                started: startedOwner,
                leaseOwner,
                lifecycleRegistration,
                parentFinalizer,
                cleanup,
                sealed: true as const,
                actor: actorWithRef,
                lease,
                rollback: [...activated.rollback, registrationRollback],
              } satisfies RuntimeAdmissionCarrier<"registered">;
            }),
          expose: (registered) =>
            Effect.gen(function* () {
              if (admissionProbe?.beforeExpose !== undefined) yield* admissionProbe.beforeExpose;
              admissionProbe?.onPhase?.("expose");
              const registeredCarrier = registered;
              const currentLifecycle = registered.actor.lifecycle;

              for (const registration of registeredCarrier.dependencies) {
                yield* Effect.provideContext(
                  registration.owner.addDependency(registration.edge),
                  context,
                );
              }

              for (const registration of registeredCarrier.dependents) {
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
                registeredCarrier.started.set(true);
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
              registeredCarrier.started.set(true);
              yield* reconcileContext(registeredCarrier, registered.actor.engine);

              const lifecycleRegistration = lifecycleOwner.registerActor({
                dispose: registered.actor.dispose,
              });

              if (!lifecycleRegistration.accepted) {
                const rejected = yield* Effect.exit(
                  Effect.provideContext(registered.actor.dispose(), context),
                );

                if (Exit.isFailure(rejected))
                  return yield* Effect.failCause(
                    appendCleanupCause(Cause.fail(closedActorAdmission()), rejected.cause),
                  );

                return yield* Effect.fail(closedActorAdmission());
              }

              registeredCarrier.lifecycleRegistration.current = lifecycleRegistration;
              const parentFinalizer = registeredCarrier.parentFinalizer;
              parentFinalizer.current = registered.actor.dispose;
              yield* Scope.addFinalizer(
                runtimeScope,
                Effect.suspend(() => {
                  const dispose = parentFinalizer.current;

                  return dispose === undefined
                    ? Effect.void
                    : Effect.provideContext(Effect.exit(dispose()).pipe(Effect.asVoid), context);
                }),
              );

              forgetPending(registered.actor.ref, registeredCarrier.pendingCompletion);

              return {
                phase: "exposed" as const,
                actor: registered.actor,
                lease: registered.lease,
              } satisfies AdmissionResult;
            }),
        };

        let authority: RuntimeAuthority;

        if (consumerKey === undefined) {
          authority =
            localIdentity === undefined
              ? authorityBase
              : { ...authorityBase, identity: localIdentity };
        } else if (localIdentity === undefined) {
          authority = { ...authorityBase, consumerKey };
        } else {
          authority = { ...authorityBase, consumerKey, identity: localIdentity };
        }

        const admitted = yield* admitActor<
          A,
          DefinitionValue,
          RuntimeImplementation | undefined,
          PublicDiagnostic,
          AdmissionActor,
          ProviderDefinition,
          RuntimeAdmissionCarriers
        >(admissionInput, authority);

        return admitted.actor;
      });

    const ensureActor: RuntimeAssembly["ensureActor"] = (
      refOrOptions: unknown,
      options?: unknown,
    ) => {
      if (options === undefined) {
        // SAFETY: the one-argument compatibility seam retains the former package-private shape.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        return admitRuntimeActor(refOrOptions as RuntimeActorOptions<MachineDefinition>, "stable");
      }

      // SAFETY: the two-argument overload is the stable production ensure path; the ref is captured separately from its options.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      return admitRuntimeActor(
        options as RuntimeEnsureActorOptions<MachineDefinition>,
        "stable",
        undefined,
        refOrOptions as ActorRef<Machine>,
      );
    };

    const getActor = <
      DefinitionValue extends MachineDefinition,
      ProviderDefinition extends MachineDefinition = DefinitionValue,
    >(
      ref: ActorRef<Machine<DefinitionValue>>,
    ): Effect.Effect<
      RuntimeActor<DefinitionValue, ProviderDefinition> | undefined,
      PublicDiagnostic
    > =>
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
          admitRuntimeActor(options, "local", local.success, local.success.ref),
        );

        if (Exit.isSuccess(admitted)) {
          const committed = registry.commitLocal(local.success);

          if (Result.isFailure(committed)) return yield* Effect.fail(committed.failure);

          return admitted.value;
        }

        registry.rollback(local.success);

        return yield* Effect.failCause(admitted.cause);
      });

    const createActor: RuntimeAssembly["createActor"] = (
      machineOrOptions: unknown,
      options?: unknown,
    ) => {
      if (options === undefined) {
        // SAFETY: the one-argument compatibility seam is the former package-private stable path;
        // production callers use ensureActor for this operation.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        return ensureActor(machineOrOptions as RuntimeActorOptions<MachineDefinition>);
      }

      // SAFETY: the two-argument overload is the local machine-first production path.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      return createLocalActor(
        machineOrOptions as Machine,
        options as RuntimeLocalActorOptions<MachineDefinition>,
      );
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
): RuntimeSetup<A> => {
  const app = admitConstructedApp(value);

  return {
    app,
    construct: () => constructRuntime<A, never>(app, undefined, constructionOwner),
  };
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
