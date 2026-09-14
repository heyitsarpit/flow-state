// oxlint-disable-next-line anti-slop/no-large-production-file -- runtime assembly owns admission, context, lifecycle, and evidence composition at one boundary.
import {
  Cause,
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
import { appPlan, isConstructedApp, type App, type RequirementsOf } from "../app/app.js";
import { Failure, type PublicDiagnostic } from "../diagnostic/diagnostic.js";
import {
  admitActor,
  captureActorContextBindings,
  captureActorRef,
  captureAdmissionProperty,
  captureAdmissionRecord,
  makeActorIdentityRegistry,
  makeActorLease,
  resolveActorAdmissionMode,
  type ActorAdmissionInput,
  type ActorAdmissionConstruction,
  type ActorAdmissionTransactionAuthority,
  type ActorContextBinding,
  type ActorContextSnapshot,
  type ActorKey,
  type ActorDependencyGraph,
  type ActorDependencyEdge,
  type AdmissionRollbackStep,
  type AttachedActorAdmission,
  type ActivatedActorAdmission,
  type ActorFence,
  type ActorIdentity,
  type ActorAdmissionMode,
  type ActorLease,
  type ExposedActorAdmission,
  type PreparedActorAdmission,
  type RegisteredActorAdmission,
  type ValidatedActorAdmission,
} from "./actor-admission.js";
import { immutableArray, immutableRecord, readonlyMap } from "./readonly-collections.js";
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
  type ContextGraph,
  type ContextSelectionLedger,
  type ContextWave,
} from "./context-wave.js";
import {
  makeLifecycleController,
  makeLifecycleRuntimeOwner,
  prepareLifecycle,
  installLifecycleMetadata,
  type LifecycleController,
  type LifecycleRuntimeOwner,
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

type RuntimeActorOptionBase<
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  readonly ref: ActorRef<Machine<DefinitionValue>>;
  readonly store?: ActorStore<DefinitionValue>;
  readonly onSnapshot?: ActorEngineInput<DefinitionValue>["onSnapshot"];
  readonly onCommand?: (
    command: ActorCommand<DefinitionValue>,
  ) => Effect.Effect<void, PublicDiagnostic, RuntimeServiceContext>;
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
  readonly createActor: <
    DefinitionValue extends MachineDefinition,
    ProviderDefinition extends MachineDefinition = DefinitionValue,
  >(
    options: RuntimeActorOptions<DefinitionValue, ProviderDefinition>,
  ) => Effect.Effect<RuntimeActor<DefinitionValue, ProviderDefinition>, PublicDiagnostic>;
  readonly dispose: () => Effect.Effect<void, PublicDiagnostic>;
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

  const admissionMode = resolveActorAdmissionMode(ref, construction);

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

// RETURN_TYPE: Captures every caller-owned actor option before admission can reserve or run asynchronously.
const captureRuntimeActorOptions = <
  DefinitionValue extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  options: RuntimeActorOptions<DefinitionValue, ProviderDefinition>,
): Result.Result<
  CapturedRuntimeActorOptions<DefinitionValue, ProviderDefinition>,
  PublicDiagnostic
> => {
  const captured = captureAdmissionRecord(
    options,
    ["ref"],
    ["initial", "restore", "input", "store", "onSnapshot", "onCommand", "bindings"],
  );

  if (Result.isFailure(captured)) return Result.fail(captured.failure);

  const ref = captureActorRef<DefinitionValue>(captured.success.get("ref"));

  if (Result.isFailure(ref)) return Result.fail(ref.failure);

  const construction = captureRuntimeConstruction(captured.success, ref.success);

  if (Result.isFailure(construction)) return Result.fail(construction.failure);

  const bindings = captureRuntimeBindings<DefinitionValue, ProviderDefinition>(
    captured.success.get("bindings"),
  );

  if (Result.isFailure(bindings)) return Result.fail(bindings.failure);

  const store = captureRuntimeStore<DefinitionValue>(captured.success.get("store"));

  if (Result.isFailure(store)) return Result.fail(store.failure);

  const callbacks = captureRuntimeCallbacks<DefinitionValue, ProviderDefinition>(captured.success);

  if (Result.isFailure(callbacks)) return Result.fail(callbacks.failure);

  return Result.succeed({
    ref: ref.success,
    construction: construction.success.construction,
    admissionMode: construction.success.admissionMode,
    store: store.success,
    onSnapshot: callbacks.success.onSnapshot,
    onCommand: callbacks.success.onCommand,
    bindings: bindings.success,
  });
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
> = ValidatedActorAdmission<A, DefinitionValue, I, ProviderDefinition> & {
  readonly identity: ActorIdentity<DefinitionValue>;
};

export const rebaseDependencyGraph = (
  graph: ActorDependencyGraph,
  from: ActorKey,
  to: ActorKey,
) => {
  const rebaseEdge = (edge: ActorDependencyEdge) =>
    immutableRecord({
      ...edge,
      consumer: edge.consumer === from ? to : edge.consumer,
    });

  const rebaseMap = (source: ReadonlyMap<ActorKey, readonly ActorDependencyEdge[]>) =>
    readonlyMap(
      [...source.entries()].map(
        ([key, edges]) => [key === from ? to : key, immutableArray(edges.map(rebaseEdge))] as const,
      ),
    );

  return immutableRecord({
    forward: rebaseMap(graph.forward),
    reverse: rebaseMap(graph.reverse),
    order: immutableArray(graph.order.map((key) => (key === from ? to : key))),
  });
};

const closedActorAdmission = () =>
  Failure({
    code: "InvariantViolation",
    path: ["mailbox", "closed"],
    details: { reason: "lifecycle" },
    summary: "Actor mailbox admission is closed by lifecycle state.",
    help: "Send only while the actor lifecycle is active.",
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
) => {
  let assembly: RuntimeAssembly | undefined;

  const exposed = Effect.gen(function* () {
    const clock = makeRuntimeClock();
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

    const lifecycleOwner = makeLifecycleRuntimeOwner({ drain: evidence.service.drain });
    lifecycleOwner.registerProvider(evidence.close().pipe(Effect.asVoid));
    const registry = makeActorIdentityRegistry<RuntimeRegisteredActor>();
    const providerFences = new Map<ActorKey, ActorFence>();

    const pendingByMachine = new WeakMap<
      MachineRecordValue,
      Map<string, RuntimePendingAdmission>
    >();

    let validationOrdinal = 0;
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

      if (byId.size === 0) pendingByMachine.delete(ref.machine);
    };

    const createActor = <
      DefinitionValue extends MachineDefinition,
      ProviderDefinition extends MachineDefinition = DefinitionValue,
    >(
      options: RuntimeActorOptions<DefinitionValue, ProviderDefinition>,
    ) =>
      Effect.gen(function* () {
        const capturedOptions = captureRuntimeActorOptions(options);

        if (Result.isFailure(capturedOptions)) return yield* Effect.fail(capturedOptions.failure);
        const bindings = capturedOptions.success.bindings;
        const construction = capturedOptions.success.construction;

        const admittedInitialSnapshot =
          construction._tag === "restore" ? construction.snapshot : construction.initial;

        let visibleLifecycle: ActorSnapshot<DefinitionValue>["lifecycle"] =
          admittedInitialSnapshot.lifecycle;

        const projectVisibleSnapshot = (
          snapshot: ActorSnapshot<DefinitionValue>,
        ): ActorSnapshot<DefinitionValue> => {
          if (snapshot.lifecycle === visibleLifecycle) return snapshot;

          // oxlint-disable-next-line anti-slop/no-object-freeze -- lifecycle overlay is an immutable runtime snapshot.
          return Object.freeze({ ...snapshot, lifecycle: visibleLifecycle });
        };

        let previous: ActorSnapshot<DefinitionValue> =
          projectVisibleSnapshot(admittedInitialSnapshot);

        // SAFETY: this temporary key is used only for pre-reservation graph validation and is rebased to the registry-issued ActorKey before staging.
        const validationConsumerKey =
          bindings.length === 0
            ? undefined
            : // SAFETY: the temporary key is replaced with the registry-issued key before exposure.
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- graph validation needs a private pre-reservation key.
              (`runtime-validation-${validationOrdinal++}` as ActorKey);

        const dependencies: readonly ActorDependencyEdge[] = bindings.map((binding) => ({
          consumer: validationConsumerKey!,
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

        let completionToken: RuntimeAdmissionCompletion | undefined;
        let identity: ActorIdentity<DefinitionValue> | undefined;
        let fence: ActorFence | undefined;
        let actorScope: Scope.Scope | undefined;
        let preparedEngine: PreparedActorEngine<DefinitionValue> | undefined;
        let initial: PreparedActorSnapshot<DefinitionValue> | undefined;
        let baseline: ContextBaseline<DefinitionValue, ProviderDefinition> | undefined;
        let activeBaseline: ActiveContextBaseline<DefinitionValue, ProviderDefinition> | undefined;
        let contextGraph: ContextGraph<DefinitionValue, ProviderDefinition> | undefined;
        let contextLedger: ContextSelectionLedger<DefinitionValue, ProviderDefinition> | undefined;
        let previousContextWave: Option.Option<ContextWave> = Option.none();

        let contextRevisions = new Map<
          ActorKey,
          { readonly publicationRevision: number; readonly machineTurnRevision: number }
        >();

        let admittedBindings: readonly ContextBinding<DefinitionValue, ProviderDefinition>[] = [];

        let controller:
          | LifecycleController<DefinitionValue, PublicDiagnostic, ProviderDefinition>
          | undefined;

        let rawEngine: ActorEngine<DefinitionValue> | undefined;
        let runtimeActor: AdmissionActor | undefined;
        let contextPropagationOpen = false;
        const contextDependents: RuntimeContextDependent[] = [];

        let receiveProviderSnapshot: (
          providerFence: ActorFence,
          snapshot: RuntimeSnapshot,
        ) => Result.Result<void, PublicDiagnostic> = () => Result.succeed(undefined);

        // RETURN_TYPE: The admission handshake must be reusable by exposure and resume while preserving its diagnostic channel.
        const reconcileContext = (): Effect.Effect<void, PublicDiagnostic> =>
          Effect.gen(function* () {
            const engine = rawEngine;

            if (engine === undefined)
              return yield* Effect.die(new Error("actor engine is not activated"));
            const seenProviders = new Set<ActorKey>();

            for (const binding of admittedBindings) {
              if (seenProviders.has(binding.providerFence.key)) continue;
              seenProviders.add(binding.providerFence.key);
              const provider = registry.lookup(binding.provider);

              if (Result.isFailure(provider)) return yield* Effect.fail(provider.failure);

              const received = receiveProviderSnapshot(
                binding.providerFence,
                provider.success.actor.snapshot(),
              );

              if (Result.isFailure(received)) return yield* Effect.fail(received.failure);
            }

            yield* engine.drain();
          });

        let dependencyRegistrations: Array<{
          readonly owner: RuntimeRegisteredActor;
          readonly edge: ActorDependencyEdge;
        }> = [];

        let dependentRegistrations: Array<{
          readonly owner: RuntimeRegisteredActor;
          readonly dependent: RuntimeContextDependent;
        }> = [];

        let lease:
          | ActorLease<
              A,
              DefinitionValue,
              RuntimeImplementation | undefined,
              PublicDiagnostic,
              AdmissionActor,
              ProviderDefinition
            >
          | undefined;

        let lifecycleStarted = false;

        type RuntimeAuthority = Omit<
          ActorAdmissionTransactionAuthority<
            A,
            DefinitionValue,
            RuntimeImplementation | undefined,
            PublicDiagnostic,
            AdmissionActor,
            ProviderDefinition
          >,
          "consumerKey"
        > & {
          consumerKey?: ActorKey;
        };

        const authority: RuntimeAuthority = {
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
                // SAFETY: the pending cell is indexed by the exact stable machine/id slot;
                // concurrent callers receive the same admission result for that slot.
                return {
                  mode: "joined",
                  // SAFETY: pending.complete is the exact deferred cell for this stable machine/id slot; only its payload type is erased in the runtime index.
                  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- joining restores the current admission's precise deferred payload.
                  existing: pending.complete as AdmissionCompletion,
                } as const;
              }

              const reserved = registry.reserveStable(validated.input.ref);

              if (Result.isFailure(reserved)) return yield* Effect.fail(reserved.failure);
              const reservedIdentity = reserved.success;
              const actualConsumerKey = reservedIdentity.key;

              const actualEdges = validated.edges.map((edge) => ({
                ...edge,
                consumer:
                  edge.consumer === validationConsumerKey ? actualConsumerKey : edge.consumer,
              }));

              const actualValidated: RuntimeValidatedAdmission<
                A,
                DefinitionValue,
                RuntimeImplementation | undefined,
                ProviderDefinition
              > = {
                ...validated,
                input: { ...validated.input, dependencies: actualEdges },
                identity: reservedIdentity,
                edges: actualEdges,
                graph:
                  validationConsumerKey === undefined
                    ? validated.graph
                    : rebaseDependencyGraph(
                        validated.graph,
                        validationConsumerKey,
                        actualConsumerKey,
                      ),
              };

              const actualFence: ActorFence = {
                key: reservedIdentity.key,
                incarnation: reservedIdentity.incarnation,
                generation: 0,
                leaseEpoch: reservedIdentity.leaseEpoch,
              };

              const created = yield* Deferred.make<Exit.Exit<AdmissionResult, PublicDiagnostic>>();
              const pendingCompletion = eraseRuntimeAdmissionCompletion(created);
              completionToken = pendingCompletion;
              identity = reservedIdentity;
              fence = actualFence;
              rememberPending(validated.input.ref, { complete: pendingCompletion });

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
            Effect.gen(function* () {
              const currentFence = fence;

              if (currentFence === undefined)
                return yield* Effect.die(new Error("actor admission identity was not reserved"));

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

              admittedBindings = contextBindings;
              const graph = buildContextGraph(contextBindings, validated.graph);

              if (Result.isFailure(graph)) return yield* Effect.fail(graph.failure);
              contextGraph = graph.success;

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
              baseline = installed.success;
              contextLedger = installed.success.ledger;

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
              controller = makeLifecycleController(lifecycleMetadata.success);

              let initialCandidate: ActorSnapshot<DefinitionValue> = admittedInitialSnapshot;

              const projection = baseline.projections.find(
                (candidate) => candidate.consumer === currentFence.key,
              );

              if (projection !== undefined) {
                const contextSnapshot = { ...initialCandidate.context };

                for (const [slot, value] of projection.values)
                  Object.assign(contextSnapshot, { [slot]: value });
                initialCandidate = { ...initialCandidate, context: contextSnapshot };
              }

              const initialSnapshot = yield* Effect.fromResult(
                prepareActorSnapshot(validated.input.ref.machine, initialCandidate),
              );

              initial = initialSnapshot;
              // oxlint-disable-next-line anti-slop/no-excessive-cognitive-complexity -- one synchronous callback preserves the complete provider-first wave boundary.
              receiveProviderSnapshot = (providerFence: ActorFence, incoming: RuntimeSnapshot) => {
                if (!contextPropagationOpen) return Result.succeed(undefined);
                const graphValue = contextGraph;
                const ledger = contextLedger;

                if (graphValue === undefined || ledger === undefined)
                  return Result.succeed(undefined);

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

                  // SAFETY: each binding was admitted against this exact provider definition,
                  // and the callback is installed only on that provider's registered actor.
                  providerSnapshots.set(
                    binding.providerFence.key,
                    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the heterogeneous registry erases the provider definition at this boundary.
                    snapshot as ActorContextSnapshot<ProviderDefinition>,
                  );
                  providerRevision.set(binding.providerFence.key, snapshot.revision);
                }

                const wave = planContextWave(
                  graphValue,
                  providerRevision,
                  new Set([providerFence.key]),
                  previousContextWave,
                );

                if (Result.isFailure(wave)) return Result.fail(wave.failure);

                const applied = applyContextWave(
                  wave.success,
                  graphValue,
                  providerSnapshots,
                  ledger,
                  contextRevisions,
                );

                if (Result.isFailure(applied)) return Result.fail(applied.failure);
                const nextContextLedger = applied.success.ledger;
                const nextContextRevisions = new Map(contextRevisions);

                for (const publication of applied.success.publications) {
                  nextContextRevisions.set(publication.consumer, {
                    publicationRevision: publication.publicationRevision,
                    machineTurnRevision: publication.machineTurnRevision,
                  });
                  const actor = runtimeActor;

                  if (actor === undefined)
                    return Result.fail(
                      Failure({
                        code: "InvariantViolation",
                        path: ["context", "consumer"],
                        details: { reason: "unregistered" },
                        summary: "Context propagation reached an unregistered consumer.",
                        help: "Complete actor registration before publishing provider snapshots.",
                      }),
                    );

                  if (
                    !applied.success.projections.some(
                      (projection) => projection.consumer === publication.consumer,
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

                  const dispatched = actor.engine.dispatchFact({
                    _tag: "context-projection",
                    provider: {
                      ...firstProvider,
                      value: carrier,
                    },
                    projection: carrier,
                  });

                  if (Result.isFailure(dispatched)) return Result.fail(dispatched.failure);
                }

                previousContextWave = Option.some(wave.success);
                contextLedger = nextContextLedger;
                contextRevisions = nextContextRevisions;

                return Result.succeed(undefined);
              };

              actorScope = yield* Scope.make("sequential");
              previous = projectVisibleSnapshot(initialSnapshot);

              const actorInput: ActorEngineInput<DefinitionValue> = {
                initial: initialSnapshot,
                identity: validated.identity,
                fence: currentFence,
                scope: actorScope,
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
                    Effect.provideContext(capturedOptions.success.onCommand!(command), context),
                });
              preparedEngine = yield* prepareActorEngine(actorInput);

              const preparedRollback: AdmissionRollbackStep = {
                name: "prepared",
                release: Effect.uninterruptible(
                  Effect.sync(() => preparedEngine?.abandon()).pipe(
                    Effect.flatMap(() => Scope.close(actorScope!, Exit.void)),
                  ),
                ),
              };

              return {
                phase: "prepared" as const,
                validated,
                snapshot: initialSnapshot,
                mailbox: preparedEngine.mailbox,
                rollback: [preparedRollback],
              } satisfies PreparedActorAdmission<
                A,
                DefinitionValue,
                RuntimeImplementation | undefined,
                ProviderDefinition
              >;
            }),
          attach: (prepared) =>
            Effect.succeed({
              phase: "attached" as const,
              prepared,
              // SAFETY: admitActor invokes attach only after prepare assigns initial from this admission's exact ActorSnapshot.
              context: initial!.context as Readonly<ContextOf<DefinitionValue>>,
              edges: prepared.validated.edges,
              rollback: prepared.rollback,
            } satisfies AttachedActorAdmission<
              A,
              DefinitionValue,
              RuntimeImplementation | undefined,
              ProviderDefinition
            >),
          activate: (attached) =>
            Effect.gen(function* () {
              const prepared = preparedEngine;
              const installed = baseline;

              if (prepared === undefined || installed === undefined)
                return yield* Effect.die(new Error("actor admission baseline is not prepared"));
              activeBaseline = activateContextBaseline(installed);
              rawEngine = yield* prepared.activate();

              const activationRollback: AdmissionRollbackStep = {
                name: "activation",
                release: rawEngine.shutdown("hard"),
              };

              return {
                phase: "activated" as const,
                attached,
                activation: { baseline: activeBaseline, engine: rawEngine },
                rollback: [...attached.rollback, activationRollback],
              } satisfies ActivatedActorAdmission<
                A,
                DefinitionValue,
                RuntimeImplementation | undefined,
                ProviderDefinition
              >;
            }),
          register: (activated) =>
            Effect.gen(function* () {
              const currentIdentity = identity;
              const currentFence = fence;
              const currentEngine = rawEngine;
              const currentController = controller;

              if (
                currentIdentity === undefined ||
                currentFence === undefined ||
                currentEngine === undefined ||
                currentController === undefined
              )
                return yield* Effect.die(new Error("actor admission registration is incomplete"));

              const visibleSnapshot = () => {
                return projectVisibleSnapshot(currentEngine.snapshot());
              };

              let admissionOpen = false;

              const admissionGate = (open: boolean) => {
                admissionOpen = open;
              };

              const engine: ActorEngine<DefinitionValue> = {
                ...currentEngine,
                snapshot: visibleSnapshot,
                snapshots: Stream.map(currentEngine.snapshots, projectVisibleSnapshot),
                send: sendWithAdmissionGate(currentEngine, () => admissionOpen),
                dispatch: (command) => {
                  if (admissionOpen) return currentEngine.dispatch(command);
                  const completion = Deferred.makeUnsafe<DispatchReceipt, PublicDiagnostic>();
                  Deferred.doneUnsafe(completion, Effect.fail(closedActorAdmission()));

                  return { admitted: false, completion };
                },
                dispatchFact: (fact) =>
                  admissionOpen
                    ? currentEngine.dispatchFact(fact)
                    : Result.fail(closedActorAdmission()),
                shutdown: (mode) =>
                  Effect.sync(() => admissionGate(false)).pipe(
                    Effect.flatMap(() => currentEngine.shutdown(mode)),
                  ),
              };

              const lifecycleCommandGate = Semaphore.makeUnsafe(1);

              const lifecycle: LifecycleController<
                DefinitionValue,
                PublicDiagnostic,
                ProviderDefinition
              > = {
                state: currentController.state,
                command: (command) =>
                  lifecycleCommandGate.withPermit(
                    Effect.gen(function* () {
                      if (command._tag === "actor:suspend") {
                        contextPropagationOpen = false;
                        admissionGate(false);
                        yield* currentEngine.drain();
                      } else if (command._tag === "actor:dispose") {
                        contextPropagationOpen = false;
                        admissionGate(false);
                      }

                      const commanded = yield* Effect.exit(currentController.command(command));
                      const retained = yield* currentController.state();
                      visibleLifecycle = retained.lifecycle;
                      previous = projectVisibleSnapshot(previous);

                      if (Exit.isFailure(commanded))
                        return yield* Effect.failCause(commanded.cause);
                      const next = commanded.value;

                      if (command._tag === "actor:start") {
                        contextPropagationOpen = true;
                        admissionGate(true);
                      } else if (command._tag === "actor:resume") {
                        contextPropagationOpen = true;
                        admissionGate(true);
                        yield* reconcileContext();
                      }

                      return next;
                    }),
                  ),
                installMetadata: (metadata) =>
                  lifecycleCommandGate.withPermit(currentController.installMetadata(metadata)),
              };

              dependencyRegistrations = [];
              dependentRegistrations = [];
              const registeredProviderKeys = new Set<ActorKey>();

              for (const edge of activated.attached.prepared.validated.edges) {
                const binding = admittedBindings.find(
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
                  receive: receiveProviderSnapshot,
                };

                dependencyRegistrations.push({ owner, edge });

                if (!registeredProviderKeys.has(binding.providerFence.key)) {
                  registeredProviderKeys.add(binding.providerFence.key);
                  dependentRegistrations.push({ owner, dependent });
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
                        cleanupCause =
                          cleanupCause === undefined
                            ? result.cause
                            : Cause.combine(cleanupCause, result.cause);
                    });

                  if (lifecycleStarted)
                    yield* observe(
                      lifecycle.command({
                        _tag: "actor:dispose",
                        cause: { _tag: "runtime-disposal" },
                      }),
                    );
                  else admissionGate(false);
                  yield* observe(engine.shutdown("hard"));

                  for (const registration of dependentRegistrations)
                    yield* observe(
                      Effect.sync(() => registration.owner.removeDependent(registration.dependent)),
                    );

                  for (const registration of dependencyRegistrations)
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

              const disposeActor = () =>
                lease === undefined ? disposeWithoutLease : lease.dispose();

              const handle = actorHandle(engine);

              const actorWithRef: AdmissionActor = {
                ref: activated.attached.prepared.validated.input.ref,
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

              const createdLease = makeActorLease<
                A,
                DefinitionValue,
                RuntimeImplementation | undefined,
                PublicDiagnostic,
                AdmissionActor,
                ProviderDefinition
              >({
                actor: actorWithRef,
                admission: activated.attached.prepared.validated,
                cleanup,
                tombstone,
              });

              lease = createdLease;
              runtimeActor = actorWithRef;

              const registrationRollback: AdmissionRollbackStep = {
                name: "registration",
                release: Effect.suspend(disposeActor),
              };

              return {
                phase: "registered" as const,
                sealed: true as const,
                activated,
                actor: actorWithRef,
                lease: createdLease,
                rollback: [...activated.rollback, registrationRollback],
              } satisfies RegisteredActorAdmission<
                A,
                DefinitionValue,
                RuntimeImplementation | undefined,
                PublicDiagnostic,
                AdmissionActor,
                ProviderDefinition
              >;
            }),
          expose: (registered) =>
            Effect.gen(function* () {
              const currentLifecycle = runtimeActor?.lifecycle;

              if (currentLifecycle === undefined)
                return yield* Effect.die(new Error("actor lifecycle is not registered"));

              for (const registration of dependencyRegistrations) {
                yield* Effect.provideContext(
                  registration.owner.addDependency(registration.edge),
                  context,
                );
              }

              for (const registration of dependentRegistrations) {
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
                lifecycleStarted = true;
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
              lifecycleStarted = true;
              yield* reconcileContext();
              lifecycleOwner.registerActor({ dispose: () => registered.lease.dispose() });
              yield* Scope.addFinalizer(runtimeScope, Scope.close(actorScope!, Exit.void));

              if (completionToken !== undefined)
                forgetPending(registered.actor.ref, completionToken);

              return {
                phase: "exposed" as const,
                registered,
                actor: registered.actor,
                lease: registered.lease,
              } satisfies AdmissionResult;
            }),
        };

        if (validationConsumerKey !== undefined) authority.consumerKey = validationConsumerKey;

        const admitted = yield* admitActor(admissionInput, authority);

        return admitted.actor;
      });

    assembly = {
      context,
      evidence,
      lifecycle: lifecycleOwner,
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
