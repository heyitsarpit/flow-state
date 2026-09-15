import { assert, describe, it } from "@effect/vitest";
import { Cause, Context, Deferred, Effect, Exit, Fiber, Option, Queue, Result } from "effect";

import { app, module } from "../../app/app.js";
import { Failure, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import { definition } from "../../definition/definition.js";
import { Implementation } from "../../implementation/implementation.js";
import { machine, type Machine } from "../../machine/machine.js";
import type { MachineDefinition } from "../../machine/grammar.js";
import { actorRef } from "../actor-ref.js";
import type { ActorRef } from "../actor-ref.js";
import { prepareActorSnapshot } from "../actor-engine.js";
import { makeLifecycleRuntimeOwner } from "../lifecycle.js";
import { runtimeOwner, runtimeSetup } from "../runtime.js";
import {
  decodeActorAdmissionEnvelope,
  admitActor,
  makeActorIdentityRegistry,
  makeActorLease,
  validateActorAdmission,
  type ActorAdmissionMode,
  type ActorAdmissionPhaseOwners,
  type ActorAdmissionTransactionAuthority,
  type ActorAdmissionInput,
  type ActorHandle,
  type AdmissionRollbackStep,
  type AttachedActorAdmission,
  type ActorContextBinding,
  type ActorDependencyEdge,
  type ActorFence,
  type ActorKey,
  type ActivatedActorAdmission,
  type ExposedActorAdmission,
  type PreparedActorAdmission,
  type RegisteredActorAdmission,
} from "../actor-admission.js";

type DeterministicGcHost = typeof globalThis & {
  gc?: () => void;
};

const resultSuccess = <Value, Error>(result: Result.Result<Value, Error>) => {
  if (Result.isFailure(result)) throw result.failure;

  return result.success;
};

const editorDefinitionResult = definition({
  id: "actor-admission/editor",
  states: ["ready"],
  events: { opened: "bare" },
});

const editorDefinition = resultSuccess(editorDefinitionResult);

const editorMachine = resultSuccess(
  machine(editorDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const providerDefinitionResult = definition({
  id: "actor-admission/provider",
  states: ["ready"],
  events: {},
});

const providerDefinition = resultSuccess(providerDefinitionResult);

const consumerDefinitionResult = definition({
  id: "actor-admission/consumer",
  states: ["ready"],
  events: {},
  context: {
    providerState: providerDefinition.select(({ state }) => state),
  },
});

const consumerDefinition = resultSuccess(consumerDefinitionResult);

const providerMachine = resultSuccess(
  machine(providerDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const cycleConsumerDefinitionResult = definition({
  id: "actor-admission/cycle-consumer",
  states: ["ready"],
  events: {},
  context: {
    left: providerDefinition.select(({ state }) => state),
    right: providerDefinition.select(({ state }) => state),
  },
});

const cycleConsumerDefinition = resultSuccess(cycleConsumerDefinitionResult);

const consumerMachine = resultSuccess(
  machine(consumerDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const cycleConsumerMachine = resultSuccess(
  machine(cycleConsumerDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const admissionApp = app({
  id: "actor-admission/app",
  persistenceVersion: "1",
  modules: [
    module({
      id: "actor-admission/module",
      machines: { provider: providerMachine, consumer: consumerMachine },
    }),
  ],
});

const noContextApp = app({
  id: "actor-admission/no-context-app",
  persistenceVersion: "1",
  modules: [
    module({
      id: "actor-admission/no-context-module",
      machines: { editor: editorMachine },
    }),
  ],
});

const cycleApp = app({
  id: "actor-admission/cycle-app",
  persistenceVersion: "1",
  modules: [
    module({
      id: "actor-admission/cycle-module",
      machines: { provider: providerMachine, consumer: cycleConsumerMachine },
    }),
  ],
});

const implementation = { kind: "implementation" } as const;

class PendingImplementationService extends Context.Service<
  PendingImplementationService,
  { ready: true }
>()("ActorAdmission/PendingImplementation") {}

const makeProviderFence = (identity: {
  key: ActorKey;
  incarnation: ActorFence["incarnation"];
  leaseEpoch: number;
}): ActorFence => ({
  key: identity.key,
  incarnation: identity.incarnation,
  generation: 0,
  leaseEpoch: identity.leaseEpoch,
});

type ProviderIdentity = {
  key: ActorKey;
  incarnation: ActorFence["incarnation"];
  leaseEpoch: number;
};

const makeAdmission = (
  consumerRef: ActorRef<Machine<typeof consumerDefinition>>,
  providerRef: ActorRef<Machine<typeof providerDefinition>>,
  providerIdentity: ProviderIdentity,
  dependencies: ActorDependencyEdge[],
  selector: () => never = () => {
    throw new Error("context selector executed during validation");
  },
) => {
  const binding = {
    slot: "providerState",
    provider: providerRef,
    providerFence: makeProviderFence(providerIdentity),
    select: selector,
  } satisfies ActorContextBinding<typeof consumerDefinition, typeof providerDefinition>;

  return {
    app: admissionApp,
    implementation,
    ref: consumerRef,
    input: undefined,
    bindings: [binding],
    dependencies,
  } satisfies ActorAdmissionInput<
    typeof admissionApp,
    typeof consumerDefinition,
    typeof implementation,
    typeof providerDefinition
  >;
};

type TransactionActor = { label: string };

type TransactionSnapshot = { baseline: "silent" };

type TransactionMailbox = { capacity: 1 };

type TransactionActivation = { barrier: "crossed" };

type TransactionInput = ActorAdmissionInput<
  typeof noContextApp,
  typeof editorDefinition,
  typeof implementation
>;

type TransactionPrepared = PreparedActorAdmission<
  typeof noContextApp,
  typeof editorDefinition,
  typeof implementation,
  typeof editorDefinition,
  TransactionSnapshot,
  TransactionMailbox
>;

type TransactionAttached = AttachedActorAdmission<typeof editorDefinition>;

type TransactionActivated = ActivatedActorAdmission<
  typeof editorDefinition,
  typeof editorDefinition,
  TransactionActivation
>;

type TransactionRegistered = RegisteredActorAdmission<
  typeof noContextApp,
  typeof editorDefinition,
  typeof implementation,
  PublicDiagnostic,
  TransactionActor,
  typeof editorDefinition
>;

type TransactionExposed = ExposedActorAdmission<
  typeof noContextApp,
  typeof editorDefinition,
  typeof implementation,
  PublicDiagnostic,
  TransactionActor,
  typeof editorDefinition
>;

type TransactionOwners = ActorAdmissionPhaseOwners<
  TransactionPrepared["validated"],
  TransactionPrepared,
  TransactionAttached,
  TransactionActivated,
  TransactionRegistered
>;

type AssertTrue<Value extends true> = Value;

type _PreparedPhaseHasOneFlatCarrier = AssertTrue<
  "value" extends keyof TransactionPrepared ? false : true
>;

type _RegisteredPhaseHasOneFlatCarrier = AssertTrue<
  "owner" extends keyof TransactionRegistered ? false : true
>;

const preparedPhaseHasOneFlatCarrier: _PreparedPhaseHasOneFlatCarrier = true;

const registeredPhaseHasOneFlatCarrier: _RegisteredPhaseHasOneFlatCarrier = true;

void preparedPhaseHasOneFlatCarrier;

void registeredPhaseHasOneFlatCarrier;

type TransactionAuthority = ActorAdmissionTransactionAuthority<
  typeof noContextApp,
  typeof editorDefinition,
  typeof implementation,
  PublicDiagnostic,
  TransactionActor,
  typeof editorDefinition,
  TransactionOwners
>;

type PhaseOwner<Tag extends string> = { tag: Tag };

type TypedValidatedOwner = PhaseOwner<"validated">;

type TypedPreparedOwner = PhaseOwner<"prepared">;

type TypedAttachedOwner = PhaseOwner<"attached">;

type TypedActivatedOwner = PhaseOwner<"activated">;

type TypedRegisteredOwner = PhaseOwner<"registered">;

type TypedPrepared = TransactionPrepared & TypedPreparedOwner;

type WrongPhasePrepared = TransactionPrepared & TypedAttachedOwner;

type TypedOwners = ActorAdmissionPhaseOwners<
  TransactionPrepared["validated"] & TypedValidatedOwner,
  TypedPrepared,
  TransactionAttached & TypedAttachedOwner,
  TransactionActivated & TypedActivatedOwner,
  TransactionRegistered & TypedRegisteredOwner
>;

type TypedAuthority = ActorAdmissionTransactionAuthority<
  typeof noContextApp,
  typeof editorDefinition,
  typeof implementation,
  PublicDiagnostic,
  TransactionActor,
  typeof editorDefinition,
  TypedOwners
>;

type TypedAttachInput = Parameters<TypedAuthority["attach"]>[0];

const acceptTypedPrepared = (prepared: TypedAttachInput) => prepared;

const acceptExactPrepared = (prepared: TypedPrepared): TypedAttachInput =>
  acceptTypedPrepared(prepared);

const rejectCrossPhaseOwner = (prepared: WrongPhasePrepared): TypedAttachInput => {
  // @ts-expect-error A prepared phase cannot accept an attached-phase owner.
  return acceptTypedPrepared(prepared);
};

type ErasedOwners = ActorAdmissionPhaseOwners<
  unknown,
  TypedPreparedOwner,
  TypedAttachedOwner,
  TypedActivatedOwner,
  TypedRegisteredOwner
>;

type ErasedPhaseAuthority = ActorAdmissionTransactionAuthority<
  typeof noContextApp,
  typeof editorDefinition,
  typeof implementation,
  PublicDiagnostic,
  TransactionActor,
  typeof editorDefinition,
  // @ts-expect-error An erased owner cannot satisfy the typed phase-owner boundary.
  ErasedOwners
>;

const rejectErasedPhaseAuthority = (_authority: ErasedPhaseAuthority) => undefined;

void acceptExactPrepared;

void rejectCrossPhaseOwner;

void rejectErasedPhaseAuthority;

type TransactionStage = "prepare" | "attach" | "activate" | "register" | "expose";

type TransactionFailure = {
  stage: TransactionStage;
  kind: "typed" | "defect" | "interrupt" | "empty";
  message: string;
};

type TransactionStagedState = {
  snapshot: unknown;
  mailbox: unknown;
  activation: unknown;
  graph: ActorDependencyEdge[] | undefined;
  tombstone: boolean;
};

type TransactionHarnessOptions = {
  mode: ActorAdmissionMode;
  failure?: TransactionFailure;
  cleanupFailure?: {
    name: string;
    kind: "typed" | "defect" | "interrupt";
    message: string;
  };
  registeredEntered?: Deferred.Deferred<void>;
  registerGate?: Deferred.Deferred<void>;
};

const transactionDiagnostic = (message: string): PublicDiagnostic =>
  Failure({
    code: "InvariantViolation",
    path: ["admission"],
    details: { message },
    summary: message,
    help: message,
  });

const makeTransactionHarness = (
  ref: ActorRef<Machine<typeof editorDefinition>>,
  options: TransactionHarnessOptions,
) => {
  const registry = makeActorIdentityRegistry<TransactionActor>();
  const identity = resultSuccess(registry.reserveStable(ref));
  const calls: string[] = [];
  const cleanups: string[] = [];

  let completion: Deferred.Deferred<Exit.Exit<TransactionExposed, PublicDiagnostic>> | undefined;

  let exposedCount = 0;
  let initializationCount = 0;
  let registeredInRegistry = false;
  let exposed = false;
  let currentValidated: TransactionPrepared["validated"] | undefined;

  const stagedState: TransactionStagedState = {
    snapshot: undefined,
    mailbox: undefined,
    activation: undefined,
    graph: undefined,
    tombstone: false,
  };

  const failureEffect = (
    kind: TransactionFailure["kind"],
    message: string,
  ): Effect.Effect<never, PublicDiagnostic> => {
    if (kind === "typed") return Effect.fail(transactionDiagnostic(message));

    if (kind === "defect") return Effect.die(new Error(message));

    if (kind === "empty") return Effect.failCause(Cause.empty);

    return Effect.failCause(Cause.interrupt(17));
  };

  const stageFailure = (stage: TransactionStage) => {
    const failure = options.failure;

    return failure?.stage === stage ? failureEffect(failure.kind, failure.message) : undefined;
  };

  const rollbackStep = (name: string): AdmissionRollbackStep => ({
    name,
    release: Effect.gen(function* () {
      cleanups.push(name);

      if (name === "prepared") {
        stagedState.snapshot = undefined;
        stagedState.mailbox = undefined;
      }

      if (name === "attached") stagedState.graph = undefined;

      if (name === "registered") registeredInRegistry = false;
      const failure = options.cleanupFailure;

      if (failure?.name !== name) return;
      yield* failureEffect(failure.kind, failure.message);
    }),
  });

  const extendRollback = (
    previous: AdmissionRollbackStep[],
    name: string,
  ): AdmissionRollbackStep[] => [...previous, rollbackStep(name)];

  const authority: TransactionAuthority = {
    app: noContextApp,
    implementation,
    lookup: registry.lookup,
    isAdmissionInFlight: (candidateRef) => candidateRef === ref && registeredInRegistry && !exposed,
    reserveOrJoin: (validated) =>
      Effect.gen(function* () {
        calls.push("reserve");

        if (completion !== undefined) return { mode: "joined", existing: completion } as const;
        const complete = yield* Deferred.make<Exit.Exit<TransactionExposed, PublicDiagnostic>>();
        completion = complete;

        return {
          mode: "leader",
          admissionMode: options.mode,
          validated: { ...validated, identity },
          rollback: [rollbackStep("reservation")],
          complete,
        } as const;
      }),
    prepare: (validated, mode) => {
      calls.push(`prepare:${mode}`);

      if (mode !== "restored-stable") initializationCount += 1;
      const failure = stageFailure("prepare");

      if (failure !== undefined) return failure;
      const snapshot = { baseline: "silent" } as const;
      const mailbox = { capacity: 1 } as const;
      currentValidated = validated;
      stagedState.snapshot = snapshot;
      stagedState.mailbox = mailbox;

      return Effect.succeed({
        phase: "prepared",
        validated,
        snapshot,
        mailbox,
        rollback: extendRollback([], "prepared"),
      } satisfies TransactionPrepared);
    },
    attach: (prepared) => {
      calls.push("attach");
      const failure = stageFailure("attach");

      if (failure !== undefined) return failure;
      stagedState.graph = prepared.validated.edges;

      return Effect.succeed({
        phase: "attached",
        context: {},
        edges: prepared.validated.edges,
        rollback: extendRollback(prepared.rollback, "attached"),
      } satisfies TransactionAttached);
    },
    activate: (attached) => {
      calls.push("activate");
      const failure = stageFailure("activate");

      if (failure !== undefined) return failure;

      const activation = { barrier: "crossed" } as const;
      stagedState.activation = activation;

      return Effect.succeed({
        phase: "activated",
        ...activation,
        rollback: extendRollback(attached.rollback, "activated"),
      } satisfies TransactionActivated);
    },
    register: (activated) =>
      Effect.gen(function* () {
        calls.push("register");
        const failure = stageFailure("register");

        if (failure !== undefined) return yield* failure;

        if (currentValidated === undefined)
          return yield* Effect.die(new Error("validated admission was not retained"));
        const validated = currentValidated;

        const actor: ActorHandle<typeof editorDefinition, TransactionActor> = {
          label: "actor",
          ref: validated.input.ref,
        };

        const registration = registry.register(validated.identity, actor);

        if (Result.isFailure(registration)) return yield* Effect.fail(registration.failure);
        registeredInRegistry = true;

        if (options.registeredEntered !== undefined)
          yield* Deferred.succeed(options.registeredEntered, undefined);

        if (options.registerGate !== undefined) yield* Deferred.await(options.registerGate);

        const lease = {
          actor,
          admission: validated,
          cleanup: Option.none(),
          dispose: () => Effect.void,
        } satisfies TransactionRegistered["lease"];

        return {
          phase: "registered",
          sealed: true,
          actor,
          lease,
          rollback: extendRollback(activated.rollback, "registered"),
        } satisfies TransactionRegistered;
      }),
    expose: (registered) => {
      calls.push("expose");
      const failure = stageFailure("expose");

      if (failure !== undefined) return failure;
      exposedCount += 1;
      exposed = true;

      return Effect.succeed({
        phase: "exposed",
        actor: registered.actor,
        lease: registered.lease,
      } satisfies TransactionExposed);
    },
  };

  return {
    authority,
    identity,
    calls,
    cleanups,
    get completion() {
      return completion;
    },
    get exposedCount() {
      return exposedCount;
    },
    get initializationCount() {
      return initializationCount;
    },
    registry,
    stagedState,
  };
};

const makeTransactionInput = (
  ref: ActorRef<Machine<typeof editorDefinition>>,
): TransactionInput => ({
  app: noContextApp,
  implementation,
  ref,
  input: undefined,
  bindings: [],
  dependencies: [],
});

const preparedProviderSnapshot = () =>
  resultSuccess(
    prepareActorSnapshot(providerMachine, {
      state: providerDefinition.S.ready,
      memory: {},
      context: {},
      lifecycle: "prepared",
      operations: [],
      timers: [],
      issues: [],
      revision: 0,
      observedStoreRevision: 0,
    }),
  );

const preparedEditorSnapshot = (revision = 0) =>
  resultSuccess(
    prepareActorSnapshot(editorMachine, {
      state: editorDefinition.S.ready,
      memory: {},
      context: {},
      lifecycle: "prepared",
      operations: [],
      timers: [],
      issues: [],
      revision,
      observedStoreRevision: 0,
    }),
  );

const preparedConsumerSnapshot = () =>
  resultSuccess(
    prepareActorSnapshot(consumerMachine, {
      state: consumerDefinition.S.ready,
      memory: {},
      context: { providerState: providerDefinition.S.ready },
      lifecycle: "prepared",
      operations: [],
      timers: [],
      issues: [],
      revision: 0,
      observedStoreRevision: 0,
    }),
  );

const makeStatefulAdmissionInput = (input: TransactionInput, isLate: () => boolean) =>
  new Proxy(input, {
    get: (target, property) => {
      if (
        (property === "ref" || property === "bindings" || property === "dependencies") &&
        isLate()
      )
        throw new Error("late admission input read");

      if (property === "app") return target.app;

      if (property === "implementation") return target.implementation;

      if (property === "ref") return target.ref;

      if (property === "input") return target.input;

      if (property === "bindings") return target.bindings;

      if (property === "dependencies") return target.dependencies;

      return undefined;
    },
  });

const admitTransaction = (input: TransactionInput, authority: TransactionAuthority) =>
  admitActor<
    typeof noContextApp,
    typeof editorDefinition,
    typeof implementation,
    PublicDiagnostic,
    TransactionActor,
    typeof editorDefinition,
    TransactionOwners
  >(input, authority);

describe("actor identity admission", () => {
  it("allocates runtime-local stable keys and fresh local identities", () => {
    const stableRef = actorRef(editorMachine, "stable");
    const firstRuntime = makeActorIdentityRegistry<{ name: string }>();
    const secondRuntime = makeActorIdentityRegistry<{ name: string }>();

    const firstStable = resultSuccess(firstRuntime.reserveStable(stableRef));
    const repeatedStable = resultSuccess(firstRuntime.reserveStable(stableRef));
    const secondStable = resultSuccess(secondRuntime.reserveStable(stableRef));
    const firstLocal = resultSuccess(firstRuntime.createLocal(editorMachine));
    const secondLocal = resultSuccess(firstRuntime.createLocal(editorMachine));

    assert.strictEqual(repeatedStable, firstStable);
    assert.notStrictEqual(firstStable.key, secondStable.key);
    assert.strictEqual(firstStable.incarnation, secondStable.incarnation);
    assert.notStrictEqual(firstLocal.ref, secondLocal.ref);
    assert.notStrictEqual(firstLocal.key, secondLocal.key);
    assert.ok(firstLocal.incarnation < secondLocal.incarnation);
    assert.strictEqual(firstLocal.ref.persist, false);
    assert.strictEqual(Result.isFailure(firstRuntime.reserveStable(firstLocal.ref)), true);

    const foreignLocal = secondRuntime.reserveStable(firstLocal.ref);

    if (Result.isSuccess(foreignLocal)) throw new Error("foreign local ref was admitted");
    assert.strictEqual(foreignLocal.failure.code, "InvariantViolation");

    const secondRuntimeFirstStable = resultSuccess(
      secondRuntime.reserveStable(actorRef(editorMachine, "second-runtime-first")),
    );

    assert.strictEqual(secondRuntimeFirstStable.incarnation, 2);
  });

  it("registers exact actors and keeps lookup passive", () => {
    const registry = makeActorIdentityRegistry<{ name: string }>();
    const ref = actorRef(editorMachine, "passive");
    const identity = resultSuccess(registry.reserveStable(ref));

    assert.strictEqual(Result.isFailure(registry.lookup(ref)), true);
    const actor = { name: "passive" } as const;
    const registered = resultSuccess(registry.register(identity, actor));
    const lookedUp = resultSuccess(registry.lookup(actorRef(editorMachine, "passive")));

    assert.strictEqual(registered.actor, actor);
    assert.strictEqual(lookedUp.actor, actor);
    assert.strictEqual(lookedUp.identity, identity);
    assert.strictEqual(Result.isFailure(registry.register(identity, actor)), true);
  });

  it("does not reuse an incarnation after reservation rollback or disposal", () => {
    const registry = makeActorIdentityRegistry();
    const ref = actorRef(editorMachine, "retry");
    const first = resultSuccess(registry.reserveStable(ref));

    registry.rollback(first);
    assert.strictEqual(Result.isFailure(registry.lookup(ref)), true);
    assert.strictEqual(Result.isFailure(registry.register(first, undefined)), true);

    const second = resultSuccess(registry.reserveStable(ref));
    assert.strictEqual(second.key, first.key);
    assert.ok(second.incarnation > first.incarnation);
    resultSuccess(registry.register(second, { name: "retry" }));
    resultSuccess(registry.tombstone(second, 1));

    assert.strictEqual(Result.isFailure(registry.lookup(ref)), true);
    assert.strictEqual(Result.isFailure(registry.reserveStable(ref)), true);
    assert.strictEqual(Result.isFailure(registry.tombstone(second, 2)), true);
  });

  it("releases a tombstoned actor reference when deterministic GC is available", async () => {
    const registry = makeActorIdentityRegistry<{ name: string }>();
    const identity = resultSuccess(registry.reserveStable(actorRef(editorMachine, "gc")));

    const weakActor = (() => {
      const actor = { name: "gc" } as const;
      resultSuccess(registry.register(identity, actor));

      return new WeakRef(actor);
    })();

    resultSuccess(registry.tombstone(identity, 1));
    // SAFETY: Node --expose-gc supplies this optional host method; default test hosts omit it.
    const maybeGc = (globalThis as DeterministicGcHost).gc;

    if (maybeGc === undefined) return;

    for (let attempt = 0; attempt < 16; attempt += 1) {
      maybeGc();
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    assert.strictEqual(weakActor.deref(), undefined);
  });

  it("fails before counter wrap without a partial identity", () => {
    const registry = makeActorIdentityRegistry({ initialIncarnation: Number.MAX_SAFE_INTEGER });
    const first = resultSuccess(registry.createLocal(editorMachine));
    const second = registry.createLocal(editorMachine);

    assert.strictEqual(first.incarnation, Number.MAX_SAFE_INTEGER);
    assert.strictEqual(Result.isFailure(second), true);
    assert.strictEqual(Result.isFailure(registry.lookup(first.ref)), true);
  });

  it("decodes one exact envelope without decoding or executing input and selectors", () => {
    const input = { draftId: "draft-1" };

    const decoded = decodeActorAdmissionEnvelope({
      app: admissionApp,
      implementation,
      ref: "ref-is-decoded-later",
      input,
      bindings: [],
      dependencies: [],
    });

    const envelope = resultSuccess(decoded);
    assert.strictEqual(envelope.app, admissionApp);
    assert.strictEqual(envelope.implementation, implementation);
    assert.strictEqual(envelope.input, input);
    assert.deepStrictEqual(envelope.bindings, []);
    assert.strictEqual(
      Result.isFailure(
        decodeActorAdmissionEnvelope({
          app: admissionApp,
          implementation,
          ref: "ref",
          input,
          bindings: [],
          dependencies: [],
          extra: true,
        }),
      ),
      true,
    );

    const malformed = decodeActorAdmissionEnvelope({
      app: admissionApp,
      implementation,
      ref: "ref",
      input,
      bindings: {},
      dependencies: [],
    });

    if (Result.isSuccess(malformed)) throw new Error("malformed envelope was admitted");
    assert.strictEqual(malformed.failure.code, "SchemaValidation");
  });

  it("contains hostile reflection without mutating admission state", () => {
    const registry = makeActorIdentityRegistry();
    const ref = actorRef(editorMachine, "hostile");

    const hostileRef = new Proxy(ref, {
      ownKeys: () => {
        throw new Error("hostile ownKeys trap");
      },
    });

    const input = {
      app: noContextApp,
      implementation,
      ref: hostileRef,
      input: undefined,
      bindings: [],
      dependencies: [],
    } satisfies ActorAdmissionInput<
      typeof noContextApp,
      typeof editorDefinition,
      typeof implementation
    >;

    const validation = validateActorAdmission(input, {
      app: noContextApp,
      implementation,
      lookup: registry.lookup,
      providerFences: new Map(),
    });

    assert.ok(Result.isFailure(validation));

    if (Result.isFailure(validation)) {
      assert.strictEqual(validation.failure.code, "SchemaValidation");
      assert.deepStrictEqual(validation.failure.path, ["actorAdmission"]);
    }

    assert.strictEqual(Result.isFailure(registry.lookup(ref)), true);

    const envelope = new Proxy(
      {
        app: admissionApp,
        implementation,
        ref,
        input: undefined,
        bindings: [],
        dependencies: [],
      },
      {
        getOwnPropertyDescriptor: () => {
          throw new Error("hostile descriptor trap");
        },
      },
    );

    const decoded = decodeActorAdmissionEnvelope(envelope);
    assert.ok(Result.isFailure(decoded));

    if (Result.isFailure(decoded)) assert.strictEqual(decoded.failure.code, "SchemaValidation");
  });

  it("maps own-key, descriptor, prototype, and property traps to typed admission failures", () => {
    const ref = actorRef(editorMachine, "reflection-traps");

    const traps = [
      {
        name: "ownKeys",
        ref: new Proxy(ref, {
          ownKeys: () => {
            throw new Error("hostile ownKeys trap");
          },
        }),
      },
      {
        name: "descriptor",
        ref: new Proxy(ref, {
          getOwnPropertyDescriptor: () => {
            throw new Error("hostile descriptor trap");
          },
        }),
      },
      {
        name: "prototype",
        ref: new Proxy(ref, {
          getPrototypeOf: () => {
            throw new Error("hostile prototype trap");
          },
        }),
      },
      {
        name: "property",
        ref: new Proxy(ref, {
          get: (target, key) => {
            if (key === "id") throw new Error("hostile property trap");

            if (key === "machine") return target.machine;

            if (key === "persist") return target.persist;

            return undefined;
          },
        }),
      },
    ] as const;

    for (const trap of traps) {
      const registry = makeActorIdentityRegistry();

      const validation = validateActorAdmission(
        {
          app: noContextApp,
          implementation,
          ref: trap.ref,
          input: undefined,
          bindings: [],
          dependencies: [],
        },
        {
          app: noContextApp,
          implementation,
          lookup: registry.lookup,
          providerFences: new Map(),
        },
      );

      assert.ok(Result.isFailure(validation), `${trap.name} trap was admitted`);

      if (Result.isFailure(validation)) {
        assert.strictEqual(validation.failure.code, "SchemaValidation");
        assert.deepStrictEqual(validation.failure.path, ["actorAdmission"]);
      }

      assert.strictEqual(Result.isFailure(registry.lookup(ref)), true);
    }
  });

  it.effect("uses one captured admission snapshot before a later typed failure", () =>
    Effect.gen(function* () {
      const ref = actorRef(editorMachine, "stateful-reflection");
      const harness = makeTransactionHarness(ref, { mode: "fresh-stable" });
      const beforeIdentity = resultSuccess(harness.registry.reserveStable(ref));
      let admissionStage = false;

      const hostileInput = makeStatefulAdmissionInput(
        makeTransactionInput(ref),
        () => admissionStage,
      );

      const authority: TransactionAuthority = {
        ...harness.authority,
        prepare: (validated, mode) => {
          harness.calls.push(`prepare:${mode}`);
          admissionStage = true;
          void validated.input.ref;
          void validated.input.bindings;
          void validated.input.dependencies;

          return Effect.fail(transactionDiagnostic("late-stage failure"));
        },
      };

      const terminal = yield* Effect.exit(admitTransaction(hostileInput, authority));

      assert.ok(Exit.isFailure(terminal));

      if (Exit.isFailure(terminal)) {
        const failure = Cause.findError(terminal.cause);
        assert.ok(Result.isSuccess(failure));

        if (Result.isSuccess(failure)) {
          assert.strictEqual(failure.success.code, "InvariantViolation");
          assert.deepStrictEqual(failure.success.details, { message: "late-stage failure" });
        }
      }

      assert.deepStrictEqual(harness.calls, ["reserve", "prepare:fresh-stable"]);
      assert.deepStrictEqual(harness.cleanups, ["reservation"]);
      assert.strictEqual(harness.exposedCount, 0);
      assert.strictEqual(resultSuccess(harness.registry.reserveStable(ref)), beforeIdentity);
      assert.strictEqual(Result.isFailure(harness.registry.lookup(ref)), true);
      assert.deepStrictEqual(harness.stagedState, {
        snapshot: undefined,
        mailbox: undefined,
        activation: undefined,
        graph: undefined,
        tombstone: false,
      });
    }),
  );

  it("maps hostile thrown causes without escaping diagnostic conversion", () => {
    const ref = actorRef(editorMachine, "thrown-proxy");

    const thrownCause = new Proxy(
      {},
      {
        getPrototypeOf: () => {
          throw new Error("cause prototype trap");
        },
      },
    );

    const hostileRef = new Proxy(ref, {
      ownKeys: () => {
        throw thrownCause;
      },
    });

    const registry = makeActorIdentityRegistry();

    const reflection = validateActorAdmission(
      {
        ...makeTransactionInput(ref),
        ref: hostileRef,
      },
      {
        app: noContextApp,
        implementation,
        lookup: registry.lookup,
        providerFences: new Map(),
      },
    );

    assert.ok(Result.isFailure(reflection));

    if (Result.isFailure(reflection)) {
      assert.strictEqual(reflection.failure.code, "SchemaValidation");
      assert.deepStrictEqual(reflection.failure.path, ["actorAdmission"]);
    }

    assert.strictEqual(Result.isFailure(registry.lookup(ref)), true);

    const escapedLookup = validateActorAdmission(makeTransactionInput(ref), {
      app: noContextApp,
      implementation,
      lookup: () => {
        throw thrownCause;
      },
      providerFences: new Map(),
    });

    assert.ok(Result.isFailure(escapedLookup));

    if (Result.isFailure(escapedLookup)) {
      assert.strictEqual(escapedLookup.failure.code, "SchemaValidation");
      assert.deepStrictEqual(escapedLookup.failure.path, ["actorAdmission"]);
    }
  });

  it.effect(
    "rejects hostile reflection before staging registry, graph, mailbox, or snapshot state",
    () =>
      Effect.gen(function* () {
        const ref = actorRef(editorMachine, "reflection-rollback");
        const harness = makeTransactionHarness(ref, { mode: "fresh-stable" });
        const beforeIdentity = resultSuccess(harness.registry.reserveStable(ref));

        const hostileRef = new Proxy(ref, {
          getPrototypeOf: () => {
            // oxlint-disable-next-line anti-slop/no-throw-in-effect-gen -- the proxy trap is the hostile input under test.
            throw new Error("hostile prototype trap");
          },
        });

        const terminal = yield* Effect.exit(
          admitTransaction({ ...makeTransactionInput(ref), ref: hostileRef }, harness.authority),
        );

        assert.ok(Exit.isFailure(terminal));

        if (Exit.isFailure(terminal)) {
          const failure = Cause.findError(terminal.cause);
          assert.ok(Result.isSuccess(failure));

          if (Result.isSuccess(failure))
            assert.strictEqual(failure.success.code, "SchemaValidation");
        }

        assert.deepStrictEqual(harness.calls, []);
        assert.deepStrictEqual(harness.cleanups, []);
        assert.strictEqual(harness.exposedCount, 0);
        assert.strictEqual(resultSuccess(harness.registry.reserveStable(ref)), beforeIdentity);
        assert.strictEqual(Result.isFailure(harness.registry.lookup(ref)), true);
        assert.deepStrictEqual(harness.stagedState, {
          snapshot: undefined,
          mailbox: undefined,
          activation: undefined,
          graph: undefined,
          tombstone: false,
        });
      }),
  );

  it("validates exact provenance and publishes copied forward and reverse topology", () => {
    const registry = makeActorIdentityRegistry();
    const providerRef = actorRef(providerMachine, "provider");
    const providerIdentity = resultSuccess(registry.reserveStable(providerRef));
    resultSuccess(registry.register(providerIdentity, { name: "provider" }));
    const consumerRef = actorRef(consumerMachine, "consumer");

    const consumerKey = resultSuccess(
      registry.reserveStable(actorRef(consumerMachine, "consumer-key")),
    ).key;

    const edge = {
      consumer: consumerKey,
      provider: providerIdentity.key,
      slot: "providerState",
    } as const;

    const input = makeAdmission(consumerRef, providerRef, providerIdentity, [edge]);

    const validated = resultSuccess(
      validateActorAdmission(input, {
        app: admissionApp,
        implementation,
        lookup: registry.lookup,
        consumerKey,
        providerFences: new Map([[providerIdentity.key, makeProviderFence(providerIdentity)]]),
      }),
    );

    assert.notStrictEqual(validated.input, input);
    assert.notStrictEqual(validated.input.ref, input.ref);
    assert.strictEqual(validated.input.ref.machine, input.ref.machine);
    assert.strictEqual(validated.input.ref.id, input.ref.id);
    assert.strictEqual(validated.input.ref.persist, input.ref.persist);
    assert.notStrictEqual(validated.input.bindings, input.bindings);
    assert.strictEqual(validated.identity, undefined);
    assert.deepStrictEqual(validated.edges, [edge]);
    assert.deepStrictEqual(validated.graph.forward.get(consumerKey), [edge]);
    assert.deepStrictEqual(validated.graph.reverse.get(providerIdentity.key), [edge]);
    assert.deepStrictEqual(validated.graph.order, [providerIdentity.key, consumerKey]);
    assert.ok(validated.graph.forward instanceof Map);
    assert.ok(validated.graph.reverse instanceof Map);
    const forwardEdges = validated.graph.forward.get(consumerKey);

    if (forwardEdges === undefined) throw new Error("missing forward dependency edges");
    assert.notStrictEqual(forwardEdges[0], edge);

    Object.assign(edge, { slot: "mutated" });
    assert.strictEqual(validated.graph.forward.get(consumerKey)?.[0]?.slot, "providerState");
    assert.deepStrictEqual(validated.graph.order, [providerIdentity.key, consumerKey]);

    const foreignRegistry = makeActorIdentityRegistry();
    const foreignProviderIdentity = resultSuccess(foreignRegistry.reserveStable(providerRef));

    const extra = validateActorAdmission(
      {
        ...input,
        dependencies: [edge, { ...edge, provider: foreignProviderIdentity.key }],
      },
      {
        app: admissionApp,
        implementation,
        lookup: registry.lookup,
        consumerKey,
        providerFences: new Map([[providerIdentity.key, makeProviderFence(providerIdentity)]]),
      },
    );

    if (Result.isSuccess(extra)) throw new Error("extra dependency edge was admitted");
    assert.strictEqual(extra.failure.code, "InvariantViolation");
    assert.strictEqual(Result.isFailure(registry.lookup(consumerRef)), true);
    assert.strictEqual(resultSuccess(registry.lookup(providerRef)).identity, providerIdentity);
  });

  it("canonicalizes bindings from the captured authority values", () => {
    const registry = makeActorIdentityRegistry();
    const providerRef = actorRef(providerMachine, "provider-canonicalization");
    const providerIdentity = resultSuccess(registry.reserveStable(providerRef));
    resultSuccess(registry.register(providerIdentity, { name: "provider" }));
    const consumerRef = actorRef(consumerMachine, "consumer-canonicalization");

    const consumerKey = resultSuccess(
      registry.reserveStable(actorRef(consumerMachine, "consumer-canonicalization-key")),
    ).key;

    const edge = {
      consumer: consumerKey,
      provider: providerIdentity.key,
      slot: "providerState",
    } as const;

    const selector = (): never => {
      throw new Error("captured selector must not execute during validation");
    };

    const input = makeAdmission(consumerRef, providerRef, providerIdentity, [edge], selector);
    const binding = input.bindings[0];

    if (binding === undefined) throw new Error("missing canonicalization binding");

    const lookup = <ProviderDefinition extends MachineDefinition>(
      ref: ActorRef<Machine<ProviderDefinition>>,
    ) => {
      if (Object.is(ref.machine, providerRef.machine) && ref.id === providerRef.id) {
        Object.defineProperty(binding, "slot", {
          configurable: true,
          enumerable: true,
          value: "mutated",
          writable: true,
        });
        Object.defineProperty(binding, "select", {
          configurable: true,
          enumerable: true,
          value: () => {
            throw new Error("mutated selector executed");
          },
          writable: true,
        });
      }

      return registry.lookup(ref);
    };

    const validated = resultSuccess(
      validateActorAdmission(input, {
        app: admissionApp,
        implementation,
        lookup,
        consumerKey,
        providerFences: new Map([[providerIdentity.key, makeProviderFence(providerIdentity)]]),
      }),
    );

    const canonicalBinding = validated.input.bindings[0];

    if (canonicalBinding === undefined) throw new Error("missing canonical binding");

    assert.notStrictEqual(canonicalBinding, binding);
    assert.strictEqual(canonicalBinding.slot, "providerState");
    assert.strictEqual(canonicalBinding.select, selector);
    assert.strictEqual(canonicalBinding.provider, providerRef);
    assert.deepStrictEqual(validated.edges, [edge]);
    assert.deepStrictEqual(validated.graph.forward.get(consumerKey), [edge]);
  });

  it("rejects a consumer-key mismatch without mutating the reserved identity", () => {
    const registry = makeActorIdentityRegistry();
    const providerRef = actorRef(providerMachine, "provider");
    const providerIdentity = resultSuccess(registry.reserveStable(providerRef));
    resultSuccess(registry.register(providerIdentity, { name: "provider" }));
    const consumerRef = actorRef(consumerMachine, "consumer");
    const consumerIdentity = resultSuccess(registry.reserveStable(consumerRef));

    const wrongConsumerKey = resultSuccess(
      registry.reserveStable(actorRef(consumerMachine, "wrong-consumer-key")),
    ).key;

    const edge = {
      consumer: consumerIdentity.key,
      provider: providerIdentity.key,
      slot: "providerState",
    } as const;

    const mismatch = validateActorAdmission(
      makeAdmission(consumerRef, providerRef, providerIdentity, [edge]),
      {
        app: admissionApp,
        implementation,
        lookup: registry.lookup,
        identity: consumerIdentity,
        consumerKey: wrongConsumerKey,
        providerFences: new Map([[providerIdentity.key, makeProviderFence(providerIdentity)]]),
      },
    );

    if (Result.isSuccess(mismatch)) throw new Error("consumer-key mismatch was admitted");
    assert.strictEqual(mismatch.failure.code, "ForeignActorRef");
    assert.deepStrictEqual(mismatch.failure.details, { reason: "fence" });
    assert.strictEqual(Result.isFailure(registry.lookup(consumerRef)), true);
    assert.strictEqual(resultSuccess(registry.lookup(providerRef)).identity, providerIdentity);
  });

  it("rejects a consumer-key mismatch before empty context validation", () => {
    const registry = makeActorIdentityRegistry();
    const ref = actorRef(editorMachine, "no-context");
    const identity = resultSuccess(registry.reserveStable(ref));

    const consumerKey = resultSuccess(
      registry.reserveStable(actorRef(editorMachine, "wrong-consumer-key")),
    ).key;

    const input = {
      app: noContextApp,
      implementation,
      ref,
      input: undefined,
      bindings: [],
      dependencies: [],
    } satisfies ActorAdmissionInput<
      typeof noContextApp,
      typeof editorDefinition,
      typeof implementation
    >;

    const mismatch = validateActorAdmission(input, {
      app: noContextApp,
      implementation,
      lookup: registry.lookup,
      identity,
      consumerKey,
      providerFences: new Map(),
    });

    if (Result.isSuccess(mismatch)) throw new Error("no-context mismatch was admitted");
    assert.strictEqual(mismatch.failure.code, "ForeignActorRef");
    assert.deepStrictEqual(mismatch.failure.details, { reason: "fence" });
    assert.strictEqual(Result.isFailure(registry.lookup(ref)), true);
    assert.deepStrictEqual(input.bindings, []);
    assert.deepStrictEqual(input.dependencies, []);
  });

  it("rejects missing, stale, foreign, duplicate, and tombstoned claims without mutation", () => {
    const providerRef = actorRef(providerMachine, "provider");
    const consumerRef = actorRef(consumerMachine, "consumer");
    const missingRegistry = makeActorIdentityRegistry();
    const missingIdentity = resultSuccess(missingRegistry.reserveStable(providerRef));

    const missingConsumerKey = resultSuccess(
      missingRegistry.reserveStable(actorRef(consumerMachine, "consumer-key")),
    ).key;

    const missing = validateActorAdmission(
      makeAdmission(consumerRef, providerRef, missingIdentity, [
        {
          consumer: missingConsumerKey,
          provider: missingIdentity.key,
          slot: "providerState",
        },
      ]),
      { app: admissionApp, implementation, lookup: missingRegistry.lookup },
    );

    if (Result.isSuccess(missing)) throw new Error("missing provider was admitted");
    assert.strictEqual(missing.failure.code, "MissingContextProvider");
    assert.strictEqual(Result.isFailure(missingRegistry.lookup(consumerRef)), true);

    const staleRegistry = makeActorIdentityRegistry();
    const staleIdentity = resultSuccess(staleRegistry.reserveStable(providerRef));
    resultSuccess(staleRegistry.register(staleIdentity, { name: "provider" }));
    const staleBefore = resultSuccess(staleRegistry.lookup(providerRef));

    const staleConsumerKey = resultSuccess(
      staleRegistry.reserveStable(actorRef(consumerMachine, "consumer-key")),
    ).key;

    const staleInput = makeAdmission(consumerRef, providerRef, staleIdentity, [
      { consumer: staleConsumerKey, provider: staleIdentity.key, slot: "providerState" },
    ]);

    const staleBinding = staleInput.bindings[0];

    if (staleBinding === undefined) throw new Error("missing test binding");

    const stale = validateActorAdmission(
      {
        ...staleInput,
        bindings: [
          {
            ...staleBinding,
            providerFence: {
              ...staleBinding.providerFence,
              generation: 1,
            },
          },
        ],
      },
      {
        app: admissionApp,
        implementation,
        lookup: staleRegistry.lookup,
        providerFences: new Map([[staleIdentity.key, makeProviderFence(staleIdentity)]]),
      },
    );

    if (Result.isSuccess(stale)) throw new Error("stale provider was admitted");
    assert.strictEqual(stale.failure.code, "MissingContextProvider");
    assert.deepStrictEqual(stale.failure.details, { provider: "stale" });
    assert.strictEqual(
      resultSuccess(staleRegistry.lookup(providerRef)).identity,
      staleBefore.identity,
    );

    const missingFence = validateActorAdmission(staleInput, {
      app: admissionApp,
      implementation,
      lookup: staleRegistry.lookup,
      providerFences: new Map(),
    });

    if (Result.isSuccess(missingFence)) throw new Error("missing provider fence was admitted");
    assert.strictEqual(missingFence.failure.code, "MissingContextProvider");
    assert.deepStrictEqual(missingFence.failure.details, { provider: "missing" });

    const foreignRegistry = makeActorIdentityRegistry();
    const foreignIdentity = resultSuccess(foreignRegistry.reserveStable(providerRef));
    resultSuccess(foreignRegistry.register(foreignIdentity, { name: "provider" }));

    const foreign = validateActorAdmission(
      makeAdmission(consumerRef, providerRef, foreignIdentity, [
        {
          consumer: resultSuccess(
            foreignRegistry.reserveStable(actorRef(consumerMachine, "consumer-key")),
          ).key,
          provider: foreignIdentity.key,
          slot: "providerState",
        },
      ]),
      {
        app: admissionApp,
        implementation,
        lookup: () =>
          Result.fail(
            Failure({
              code: "ForeignActorRef",
              path: ["actorRef"],
              details: { reason: "foreign" },
              summary: "foreign",
              help: "foreign",
            }),
          ),
      },
    );

    if (Result.isSuccess(foreign)) throw new Error("foreign provider was admitted");
    assert.strictEqual(foreign.failure.code, "ForeignActorRef");

    const duplicateRegistry = makeActorIdentityRegistry();
    const duplicateProviderIdentity = resultSuccess(duplicateRegistry.reserveStable(providerRef));
    resultSuccess(duplicateRegistry.register(duplicateProviderIdentity, { name: "provider" }));
    const duplicateConsumerIdentity = resultSuccess(duplicateRegistry.reserveStable(consumerRef));
    resultSuccess(duplicateRegistry.register(duplicateConsumerIdentity, { name: "consumer" }));

    const duplicate = validateActorAdmission(
      makeAdmission(consumerRef, providerRef, duplicateProviderIdentity, [
        {
          consumer: duplicateConsumerIdentity.key,
          provider: duplicateProviderIdentity.key,
          slot: "providerState",
        },
      ]),
      { app: admissionApp, implementation, lookup: duplicateRegistry.lookup },
    );

    if (Result.isSuccess(duplicate)) throw new Error("duplicate actor claim was admitted");
    assert.strictEqual(duplicate.failure.code, "DuplicateActorClaim");

    const tombstoneRegistry = makeActorIdentityRegistry();
    const tombstoneIdentity = resultSuccess(tombstoneRegistry.reserveStable(providerRef));
    resultSuccess(tombstoneRegistry.register(tombstoneIdentity, { name: "provider" }));
    resultSuccess(tombstoneRegistry.tombstone(tombstoneIdentity, 1));

    const tombstoned = validateActorAdmission(
      makeAdmission(consumerRef, providerRef, tombstoneIdentity, [
        {
          consumer: resultSuccess(
            tombstoneRegistry.reserveStable(actorRef(consumerMachine, "consumer-key")),
          ).key,
          provider: tombstoneIdentity.key,
          slot: "providerState",
        },
      ]),
      { app: admissionApp, implementation, lookup: tombstoneRegistry.lookup },
    );

    if (Result.isSuccess(tombstoned)) throw new Error("tombstoned provider was admitted");
    assert.strictEqual(tombstoned.failure.code, "DisposedActorRef");
  });

  it("rejects a cyclic fixed graph before any edge becomes visible", () => {
    const registry = makeActorIdentityRegistry();
    const leftRef = actorRef(providerMachine, "left");
    const rightRef = actorRef(providerMachine, "right");
    const leftIdentity = resultSuccess(registry.reserveStable(leftRef));
    const rightIdentity = resultSuccess(registry.reserveStable(rightRef));
    resultSuccess(registry.register(leftIdentity, { name: "left" }));
    resultSuccess(registry.register(rightIdentity, { name: "right" }));
    const consumerRef = actorRef(cycleConsumerMachine, "cycle-consumer");
    const cycleConsumerKey = rightIdentity.key;

    const bindings = [
      {
        slot: "left",
        provider: rightRef,
        providerFence: makeProviderFence(rightIdentity),
        select: () => providerMachine.definition.S.ready,
      },
      {
        slot: "right",
        provider: leftRef,
        providerFence: makeProviderFence(leftIdentity),
        select: () => providerMachine.definition.S.ready,
      },
    ] satisfies ActorContextBinding<typeof cycleConsumerDefinition, typeof providerDefinition>[];

    const dependencies = [
      { consumer: cycleConsumerKey, provider: rightIdentity.key, slot: "left" },
      { consumer: cycleConsumerKey, provider: leftIdentity.key, slot: "right" },
    ] as const;

    const result = validateActorAdmission(
      {
        app: cycleApp,
        implementation,
        ref: consumerRef,
        input: undefined,
        bindings,
        dependencies,
      },
      {
        app: cycleApp,
        implementation,
        lookup: registry.lookup,
        consumerKey: cycleConsumerKey,
        providerFences: new Map([
          [leftIdentity.key, makeProviderFence(leftIdentity)],
          [rightIdentity.key, makeProviderFence(rightIdentity)],
        ]),
      },
    );

    if (Result.isSuccess(result)) throw new Error("cyclic graph was admitted");
    assert.strictEqual(result.failure.code, "ContextDependencyCycle");
    assert.strictEqual(result.failure.details.cycle, `${rightIdentity.key}>${rightIdentity.key}`);
    assert.strictEqual(Result.isFailure(registry.lookup(consumerRef)), true);
  });

  it.effect(
    "runs fresh-local, fresh-stable, and restored-stable through one ordered transaction",
    () =>
      Effect.gen(function* () {
        const modes = ["fresh-local", "fresh-stable", "restored-stable"] as const;

        for (const mode of modes) {
          const ref =
            mode === "fresh-local"
              ? actorRef(editorMachine, `local-${mode}`)
              : actorRef(editorMachine, `stable-${mode}`, { persist: true });

          const harness = makeTransactionHarness(ref, { mode });

          const terminal = yield* Effect.exit(
            admitTransaction(makeTransactionInput(ref), harness.authority),
          );

          assert.ok(Exit.isSuccess(terminal));

          if (Exit.isFailure(terminal)) continue;
          assert.strictEqual(terminal.value.phase, "exposed");
          assert.notStrictEqual(terminal.value.actor.ref, ref);
          assert.strictEqual(terminal.value.actor.ref.machine, ref.machine);
          assert.strictEqual(terminal.value.actor.ref.id, ref.id);
          assert.strictEqual(terminal.value.actor.ref.persist, ref.persist);
          assert.strictEqual(terminal.value.lease.actor, terminal.value.actor);
          assert.deepStrictEqual(harness.calls, [
            "reserve",
            `prepare:${mode}`,
            "attach",
            "activate",
            "register",
            "expose",
          ]);
          assert.strictEqual(harness.initializationCount, mode === "restored-stable" ? 0 : 1);
          assert.strictEqual(harness.exposedCount, 1);
          assert.deepStrictEqual(harness.cleanups, []);
        }
      }),
  );

  it.effect("joins concurrent stable ensures without replaying preparation", () =>
    Effect.gen(function* () {
      const registeredEntered = yield* Deferred.make<void>();
      const registerGate = yield* Deferred.make<void>();
      const ref = actorRef(editorMachine, "concurrent-stable", { persist: true });

      const harness = makeTransactionHarness(ref, {
        mode: "fresh-stable",
        registeredEntered,
        registerGate,
      });

      const input = makeTransactionInput(ref);

      const first = yield* Effect.forkChild(
        Effect.exit(admitTransaction(input, harness.authority)),
        {
          startImmediately: true,
        },
      );

      yield* Deferred.await(registeredEntered);

      const second = yield* Effect.forkChild(
        Effect.exit(admitTransaction(input, harness.authority)),
        {
          startImmediately: true,
        },
      );

      yield* Effect.yieldNow;
      assert.strictEqual(harness.calls.filter((call) => call === "reserve").length, 2);
      assert.strictEqual(harness.initializationCount, 1);
      assert.strictEqual(harness.exposedCount, 0);

      yield* Deferred.succeed(registerGate, undefined);
      const firstTerminal = yield* Fiber.join(first);
      const secondTerminal = yield* Fiber.join(second);
      assert.ok(Exit.isSuccess(firstTerminal));
      assert.ok(Exit.isSuccess(secondTerminal));

      if (Exit.isSuccess(firstTerminal) && Exit.isSuccess(secondTerminal)) {
        assert.strictEqual(firstTerminal.value.actor, secondTerminal.value.actor);
        assert.strictEqual(firstTerminal.value.lease, secondTerminal.value.lease);
        assert.strictEqual(firstTerminal.value.lease.admission.identity, harness.identity);
        assert.strictEqual(
          firstTerminal.value.lease.admission.identity.incarnation,
          secondTerminal.value.lease.admission.identity.incarnation,
        );
      }

      assert.strictEqual(harness.exposedCount, 1);
      assert.deepStrictEqual(harness.calls, [
        "reserve",
        "prepare:fresh-stable",
        "attach",
        "activate",
        "register",
        "reserve",
        "expose",
      ]);
      const completion = harness.completion;

      if (completion === undefined)
        return yield* Effect.die(new Error("leader completion was not retained"));
      const sharedTerminal = yield* Deferred.await(completion);
      assert.ok(Exit.isSuccess(sharedTerminal));

      if (Exit.isSuccess(sharedTerminal) && Exit.isSuccess(firstTerminal))
        assert.strictEqual(sharedTerminal.value.actor, firstTerminal.value.actor);
    }),
  );

  it.effect("retains primary typed, defect, and interruption causes while rolling back once", () =>
    Effect.gen(function* () {
      const scenarios = [
        { kind: "typed", message: "typed-primary" },
        { kind: "defect", message: "defect-primary" },
        { kind: "interrupt", message: "interrupt-primary" },
        { kind: "empty", message: "empty-primary" },
      ] as const;

      for (const scenario of scenarios) {
        const ref = actorRef(editorMachine, `failure-${scenario.kind}`);

        const harness = makeTransactionHarness(
          ref,
          scenario.kind === "empty"
            ? {
                mode: "fresh-stable",
                failure: { stage: "activate", ...scenario },
              }
            : {
                mode: "fresh-stable",
                failure: { stage: "activate", ...scenario },
                cleanupFailure: {
                  name: "attached",
                  kind: "typed",
                  message: `cleanup-${scenario.kind}`,
                },
              },
        );

        const terminal = yield* Effect.exit(
          admitTransaction(makeTransactionInput(ref), harness.authority),
        );

        assert.ok(Exit.isFailure(terminal));

        if (Exit.isSuccess(terminal)) continue;

        if (scenario.kind === "empty") {
          assert.ok(Cause.hasDies(terminal.cause));
          const defect = Cause.findDefect(terminal.cause);
          assert.ok(Result.isSuccess(defect));
          assert.ok(defect.success instanceof Error);

          if (defect.success instanceof Error)
            assert.strictEqual(
              defect.success.message,
              "Actor admission completed with an empty Cause",
            );
        } else {
          assert.ok(Cause.hasFails(terminal.cause));

          if (scenario.kind === "defect") {
            assert.ok(Cause.hasDies(terminal.cause));
            const defect = Cause.findDefect(terminal.cause);
            assert.ok(Result.isSuccess(defect));
            assert.ok(defect.success instanceof Error);

            if (defect.success instanceof Error)
              assert.strictEqual(defect.success.message, scenario.message);
          }

          if (scenario.kind === "interrupt") assert.ok(Cause.hasInterrupts(terminal.cause));

          if (scenario.kind === "typed") {
            const primary = Cause.findError(terminal.cause);
            assert.ok(Result.isSuccess(primary));
            assert.strictEqual(primary.success.summary, scenario.message);
          }

          const cleanup = terminal.cause.reasons.find(
            (reason) =>
              Cause.isFailReason(reason) && reason.error.summary === `cleanup-${scenario.kind}`,
          );

          assert.ok(cleanup !== undefined);
        }

        assert.deepStrictEqual(harness.cleanups, ["attached", "prepared", "reservation"]);
        assert.strictEqual(harness.exposedCount, 0);
        const completion = harness.completion;

        if (completion === undefined)
          return yield* Effect.die(new Error("leader completion was not retained"));
        const sharedTerminal = yield* Deferred.await(completion);
        assert.ok(Exit.isFailure(sharedTerminal));

        if (Exit.isFailure(sharedTerminal))
          assert.deepStrictEqual(sharedTerminal.cause, terminal.cause);
      }
    }),
  );

  it.effect(
    "joins lease disposal, tombstones only after cleanup, and keeps failures untombstoned",
    () =>
      Effect.gen(function* () {
        const ref = actorRef(editorMachine, "lease-owner", { persist: true });
        const registry = makeActorIdentityRegistry<{ label: string }>();
        const identity = resultSuccess(registry.reserveStable(ref));
        const input = makeTransactionInput(ref);

        const validated = resultSuccess(
          validateActorAdmission(input, {
            app: noContextApp,
            implementation,
            lookup: registry.lookup,
            identity,
          }),
        );

        resultSuccess(registry.register(identity, { label: "lease-owner" }));
        const cleanupGate = yield* Deferred.make<void>();
        let cleanupRuns = 0;

        const lease = makeActorLease({
          actor: { label: "lease-owner", ref },
          admission: { ...validated, identity },
          cleanup: Effect.gen(function* () {
            cleanupRuns += 1;
            yield* Deferred.await(cleanupGate);
          }),
          tombstone: () => registry.tombstone(identity, 1),
        });

        const first = yield* Effect.forkChild(Effect.exit(lease.dispose()));
        yield* Effect.yieldNow;
        const second = yield* Effect.forkChild(Effect.exit(lease.dispose()));
        yield* Effect.yieldNow;
        assert.strictEqual(cleanupRuns, 1);
        assert.strictEqual(Result.isSuccess(registry.lookup(ref)), true);

        yield* Deferred.succeed(cleanupGate, undefined);
        const firstExit = yield* Fiber.join(first);
        const secondExit = yield* Fiber.join(second);
        assert.ok(Exit.isSuccess(firstExit));
        assert.ok(Exit.isSuccess(secondExit));
        assert.strictEqual(cleanupRuns, 1);
        const disposed = registry.lookup(ref);
        assert.ok(Result.isFailure(disposed));

        if (Result.isFailure(disposed))
          assert.strictEqual(disposed.failure.code, "DisposedActorRef");

        const failedRef = actorRef(editorMachine, "lease-failure", { persist: true });
        const failedIdentity = resultSuccess(registry.reserveStable(failedRef));
        const failedInput = makeTransactionInput(failedRef);

        const failedValidated = resultSuccess(
          validateActorAdmission(failedInput, {
            app: noContextApp,
            implementation,
            lookup: registry.lookup,
            identity: failedIdentity,
          }),
        );

        resultSuccess(registry.register(failedIdentity, { label: "lease-failure" }));
        let failedCleanupRuns = 0;
        let tombstoneRuns = 0;

        const failed = makeActorLease({
          actor: { label: "lease-failure", ref: failedRef },
          admission: { ...failedValidated, identity: failedIdentity },
          cleanup: Effect.suspend(() => {
            failedCleanupRuns += 1;

            return failedCleanupRuns === 1
              ? Effect.fail(transactionDiagnostic("cleanup-failure"))
              : Effect.succeed(undefined);
          }),
          tombstone: () => {
            tombstoneRuns += 1;

            return registry.tombstone(failedIdentity, 2);
          },
        });

        const failedExit = yield* Effect.exit(failed.dispose());
        assert.ok(Exit.isFailure(failedExit));
        assert.strictEqual(failedCleanupRuns, 1);
        assert.strictEqual(tombstoneRuns, 0);
        assert.ok(Result.isSuccess(registry.lookup(failedRef)));

        const retriedExit = yield* Effect.exit(failed.dispose());
        assert.ok(Exit.isSuccess(retriedExit));
        assert.strictEqual(failedCleanupRuns, 2);
        assert.strictEqual(tombstoneRuns, 1);
        const tombstoned = registry.lookup(failedRef);
        assert.ok(Result.isFailure(tombstoned));

        if (Result.isFailure(tombstoned))
          assert.strictEqual(tombstoned.failure.code, "DisposedActorRef");
      }),
  );

  it.effect("disposes runtime leases before evidence and providers, once", () =>
    Effect.gen(function* () {
      const order: Array<string> = [];

      const owner = makeLifecycleRuntimeOwner<never>({
        drain: Effect.sync(() => order.push("drain")),
      });

      owner.registerActor({ dispose: () => Effect.sync(() => order.push("consumer")) });
      owner.registerActor({ dispose: () => Effect.sync(() => order.push("provider-actor")) });
      owner.registerProvider(Effect.sync(() => order.push("provider-resource")));
      owner.registerProvider(Effect.sync(() => order.push("provider-scope")));
      const before = owner.generation();
      const first = yield* Effect.forkChild(Effect.exit(owner.dispose()));
      const second = yield* Effect.forkChild(Effect.exit(owner.dispose()));
      const firstExit = yield* Fiber.join(first);
      const secondExit = yield* Fiber.join(second);
      assert.ok(Exit.isSuccess(firstExit));
      assert.ok(Exit.isSuccess(secondExit));
      assert.deepStrictEqual(order, [
        "provider-actor",
        "consumer",
        "drain",
        "provider-scope",
        "provider-resource",
      ]);
      assert.strictEqual(owner.isCurrent(before), false);
      assert.strictEqual(owner.isCurrent(owner.generation()), false);
    }),
  );

  it.effect("keeps runtime disposal cold and includes leases registered after construction", () =>
    Effect.gen(function* () {
      const owner = makeLifecycleRuntimeOwner<never>();
      let releases = 0;
      const disposal = owner.dispose();

      owner.registerActor({
        dispose: () =>
          Effect.sync(() => {
            releases += 1;
          }),
      });

      assert.strictEqual(releases, 0);
      const closed = yield* Effect.exit(disposal);
      assert.ok(Exit.isSuccess(closed));
      assert.strictEqual(releases, 1);
    }),
  );

  it("prepares one actor with exact nominal identities", () => {
    const ref = actorRef(editorMachine, "exact-prepared", { persist: true });
    const harness = makeTransactionHarness(ref, { mode: "fresh-stable" });

    const prepared = resultSuccess(
      validateActorAdmission(makeTransactionInput(ref), harness.authority),
    );

    assert.strictEqual(prepared.input.app, noContextApp);
    assert.strictEqual(prepared.input.implementation, implementation);
    assert.strictEqual(prepared.input.ref.machine, editorMachine);
    assert.strictEqual(prepared.input.ref.id, ref.id);
    assert.strictEqual(prepared.input.ref.persist, true);
    assert.strictEqual(prepared.identity, undefined);
  });

  it("rejects a foreign machine before registry mutation", () => {
    const ref = actorRef(editorMachine, "foreign-machine");
    const harness = makeTransactionHarness(ref, { mode: "fresh-stable" });
    const foreignRef = actorRef(providerMachine, "foreign-machine");
    const foreignInputRef: unknown = foreignRef;

    const input = {
      ...makeTransactionInput(ref),
      // SAFETY: A provider-machine ref intentionally crosses the typed input boundary to prove runtime provenance rejection.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the negative proof must present a foreign machine at this boundary.
      ref: foreignInputRef as typeof ref,
    };

    const result = validateActorAdmission(input, harness.authority);
    assert.ok(Result.isFailure(result));
    assert.ok(Result.isFailure(harness.registry.lookup(foreignRef)));
  });

  it("rejects duplicate actor identity without replacing its lease", () => {
    const ref = actorRef(editorMachine, "duplicate-identity");
    const harness = makeTransactionHarness(ref, { mode: "fresh-stable" });
    const actor = { label: "existing" } satisfies TransactionActor;
    resultSuccess(harness.registry.register(harness.identity, actor));
    const result = validateActorAdmission(makeTransactionInput(ref), harness.authority);
    assert.ok(Result.isFailure(result));

    if (Result.isFailure(result)) assert.strictEqual(result.failure.code, "DuplicateActorClaim");
    const existing = resultSuccess(harness.registry.lookup(ref));
    assert.strictEqual(existing.actor, actor);
    assert.strictEqual(existing.identity, harness.identity);
  });

  it("preserves tombstones across actor reincarnation", () => {
    const registry = makeActorIdentityRegistry<{ label: string }>();
    const ref = actorRef(editorMachine, "tombstone");
    const first = resultSuccess(registry.reserveStable(ref));
    resultSuccess(registry.register(first, { label: "first" }));
    resultSuccess(registry.tombstone(first, 12));
    const replacement = registry.reserveStable(ref);
    assert.ok(Result.isFailure(replacement));

    if (Result.isFailure(replacement))
      assert.strictEqual(replacement.failure.code, "DisposedActorRef");
    const lookup = registry.lookup(ref);
    assert.ok(Result.isFailure(lookup));

    if (Result.isFailure(lookup))
      assert.deepStrictEqual(lookup.failure.details, { disposed: true });
  });

  it("attaches a context binding with its provider fence", () => {
    const registry = makeActorIdentityRegistry();
    const providerRef = actorRef(providerMachine, "binding-provider");
    const providerIdentity = resultSuccess(registry.reserveStable(providerRef));
    resultSuccess(registry.register(providerIdentity, { name: "provider" }));
    const consumerRef = actorRef(consumerMachine, "binding-consumer");
    const consumerIdentity = resultSuccess(registry.reserveStable(consumerRef));

    const edge = {
      consumer: consumerIdentity.key,
      provider: providerIdentity.key,
      slot: "providerState",
    } as const;

    const admitted = resultSuccess(
      validateActorAdmission(makeAdmission(consumerRef, providerRef, providerIdentity, [edge]), {
        app: admissionApp,
        implementation,
        lookup: registry.lookup,
        identity: consumerIdentity,
        providerFences: new Map([[providerIdentity.key, makeProviderFence(providerIdentity)]]),
      }),
    );

    const binding = admitted.input.bindings[0];

    if (binding === undefined) throw new Error("binding was not retained");
    assert.strictEqual(binding.provider.machine, providerMachine);
    assert.deepStrictEqual(binding.providerFence, makeProviderFence(providerIdentity));
    assert.deepStrictEqual(admitted.edges, [edge]);
  });

  it("admits selected null as an ordinary context value", () => {
    const registry = makeActorIdentityRegistry();
    const providerRef = actorRef(providerMachine, "null-provider");
    const providerIdentity = resultSuccess(registry.reserveStable(providerRef));
    resultSuccess(registry.register(providerIdentity, { name: "provider" }));
    const consumerRef = actorRef(consumerMachine, "null-consumer");

    const edge = {
      consumer: resultSuccess(registry.reserveStable(consumerRef)).key,
      provider: providerIdentity.key,
      slot: "providerState",
    } as const;

    const input = makeAdmission(
      consumerRef,
      providerRef,
      providerIdentity,
      [edge],
      // SAFETY: This negative runtime proof returns null outside the selector's declared context output.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- preserve the runtime proof for a value excluded by the static context type.
      () => null as never,
    );

    const admitted = resultSuccess(
      validateActorAdmission(input, {
        app: admissionApp,
        implementation,
        lookup: registry.lookup,
        consumerKey: edge.consumer,
        providerFences: new Map([[providerIdentity.key, makeProviderFence(providerIdentity)]]),
      }),
    );

    assert.strictEqual(
      admitted.input.bindings[0]?.select({
        state: providerDefinition.S.ready,
        memory: {},
        context: {},
      }),
      null,
    );
  });

  it("keeps selected undefined distinct from missing context metadata", () => {
    const registry = makeActorIdentityRegistry();
    const providerRef = actorRef(providerMachine, "undefined-provider");
    const providerIdentity = resultSuccess(registry.reserveStable(providerRef));
    resultSuccess(registry.register(providerIdentity, { name: "provider" }));
    const consumerRef = actorRef(consumerMachine, "undefined-consumer");

    const edge = {
      consumer: resultSuccess(registry.reserveStable(consumerRef)).key,
      provider: providerIdentity.key,
      slot: "providerState",
    } as const;

    const input = makeAdmission(
      consumerRef,
      providerRef,
      providerIdentity,
      [edge],
      // SAFETY: This negative runtime proof returns undefined outside the selector's declared context output.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- preserve the runtime proof for a value excluded by the static context type.
      () => undefined as never,
    );

    const admitted = resultSuccess(
      validateActorAdmission(input, {
        app: admissionApp,
        implementation,
        lookup: registry.lookup,
        consumerKey: edge.consumer,
        providerFences: new Map([[providerIdentity.key, makeProviderFence(providerIdentity)]]),
      }),
    );

    assert.strictEqual(
      admitted.input.bindings[0]?.select({
        state: providerDefinition.S.ready,
        memory: {},
        context: {},
      }),
      undefined,
    );
    assert.strictEqual(admitted.input.bindings.length, 1);
  });

  it("rejects context dependency cycles before activation", () => {
    const registry = makeActorIdentityRegistry();
    const leftRef = actorRef(providerMachine, "cycle-left");
    const rightRef = actorRef(providerMachine, "cycle-right");
    const left = resultSuccess(registry.reserveStable(leftRef));
    const right = resultSuccess(registry.reserveStable(rightRef));
    resultSuccess(registry.register(left, { name: "left" }));
    resultSuccess(registry.register(right, { name: "right" }));
    const consumerRef = actorRef(cycleConsumerMachine, "cycle-admission");

    const bindings = [
      {
        slot: "left",
        provider: leftRef,
        providerFence: makeProviderFence(left),
        select: () => providerDefinition.S.ready,
      },
      {
        slot: "right",
        provider: rightRef,
        providerFence: makeProviderFence(right),
        select: () => providerDefinition.S.ready,
      },
    ] satisfies ActorContextBinding<typeof cycleConsumerDefinition, typeof providerDefinition>[];

    const result = validateActorAdmission(
      {
        app: cycleApp,
        implementation,
        ref: consumerRef,
        input: undefined,
        bindings,
        dependencies: [
          { consumer: left.key, provider: left.key, slot: "left" },
          { consumer: left.key, provider: right.key, slot: "right" },
        ],
      },
      {
        app: cycleApp,
        implementation,
        lookup: registry.lookup,
        consumerKey: left.key,
        providerFences: new Map([
          [left.key, makeProviderFence(left)],
          [right.key, makeProviderFence(right)],
        ]),
      },
    );

    assert.ok(Result.isFailure(result));

    if (Result.isFailure(result)) assert.strictEqual(result.failure.code, "ContextDependencyCycle");
  });

  it("rejects a context slot outside the consumer vocabulary", () => {
    const registry = makeActorIdentityRegistry();
    const providerRef = actorRef(providerMachine, "invalid-slot-provider");
    const providerIdentity = resultSuccess(registry.reserveStable(providerRef));
    resultSuccess(registry.register(providerIdentity, { name: "provider" }));
    const consumerRef = actorRef(consumerMachine, "invalid-slot-consumer");
    const valid = makeAdmission(consumerRef, providerRef, providerIdentity, []);

    const invalid = {
      ...valid,
      bindings: [{ ...valid.bindings[0]!, slot: "not-a-slot" }],
      dependencies: [
        {
          consumer: "actor:invalid",
          provider: providerIdentity.key,
          slot: "not-a-slot",
        },
      ],
    };

    // SAFETY: This fixture deliberately violates the typed slot and branded-key contracts so runtime admission must reject it.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- exercise malformed data at the typed validation boundary.
    const invalidInput = invalid as never;

    const result = validateActorAdmission(invalidInput, {
      app: admissionApp,
      implementation,
      lookup: registry.lookup,
      providerFences: new Map([[providerIdentity.key, makeProviderFence(providerIdentity)]]),
    });

    assert.ok(Result.isFailure(result));
  });

  it("rejects a stale provider fence during attachment", () => {
    const registry = makeActorIdentityRegistry();
    const providerRef = actorRef(providerMachine, "stale-provider");
    const providerIdentity = resultSuccess(registry.reserveStable(providerRef));
    resultSuccess(registry.register(providerIdentity, { name: "provider" }));
    const consumerRef = actorRef(consumerMachine, "stale-consumer");
    const consumerIdentity = resultSuccess(registry.reserveStable(consumerRef));

    const valid = makeAdmission(consumerRef, providerRef, providerIdentity, [
      {
        consumer: consumerIdentity.key,
        provider: providerIdentity.key,
        slot: "providerState",
      },
    ]);

    // SAFETY: The fixture increments a valid provider fence to prove stale-fence rejection.
    const stale = {
      ...valid,
      bindings: [
        {
          ...valid.bindings[0]!,
          providerFence: { ...valid.bindings[0]!.providerFence, generation: 1 },
        },
      ],
    } satisfies typeof valid;

    const result = validateActorAdmission(stale, {
      app: admissionApp,
      implementation,
      lookup: registry.lookup,
      providerFences: new Map([[providerIdentity.key, makeProviderFence(providerIdentity)]]),
    });

    assert.ok(Result.isFailure(result));

    if (Result.isFailure(result)) assert.strictEqual(result.failure.details.provider, "stale");
  });

  it.effect("prepares resources before attachment and activation", () =>
    Effect.gen(function* () {
      const ref = actorRef(editorMachine, "bounded-mailbox");
      const harness = makeTransactionHarness(ref, { mode: "fresh-stable" });
      yield* admitTransaction(makeTransactionInput(ref), harness.authority);
      assert.deepStrictEqual(harness.stagedState.mailbox, { capacity: 1 });
      assert.deepStrictEqual(harness.calls.slice(0, 4), [
        "reserve",
        "prepare:fresh-stable",
        "attach",
        "activate",
      ]);
      assert.strictEqual(harness.stagedState.tombstone, false);
    }),
  );

  it.effect("rolls back staged resources after mailbox allocation failure", () =>
    Effect.gen(function* () {
      const ref = actorRef(editorMachine, "allocation-failure");

      const harness = makeTransactionHarness(ref, {
        mode: "fresh-stable",
        failure: { stage: "prepare", kind: "typed", message: "mailbox allocation failed" },
      });

      const exit = yield* Effect.exit(
        admitTransaction(makeTransactionInput(ref), harness.authority),
      );

      assert.ok(Exit.isFailure(exit));
      assert.deepStrictEqual(harness.cleanups, ["reservation"]);
      assert.strictEqual(harness.stagedState.snapshot, undefined);
      assert.strictEqual(harness.exposedCount, 0);
    }),
  );

  it.effect("rolls back pre-exposure activation without consuming an exposed lease", () =>
    Effect.gen(function* () {
      const ref = actorRef(editorMachine, "activation-failure");

      const harness = makeTransactionHarness(ref, {
        mode: "fresh-stable",
        failure: { stage: "activate", kind: "typed", message: "activation failed" },
      });

      const exit = yield* Effect.exit(
        admitTransaction(makeTransactionInput(ref), harness.authority),
      );

      assert.ok(Exit.isFailure(exit));
      assert.deepStrictEqual(harness.cleanups, ["attached", "prepared", "reservation"]);
      assert.strictEqual(harness.exposedCount, 0);
      assert.strictEqual(harness.stagedState.graph, undefined);
    }),
  );

  it.effect("crosses the initial snapshot barrier exactly once", () =>
    Effect.gen(function* () {
      const ref = actorRef(editorMachine, "initial-barrier");
      const harness = makeTransactionHarness(ref, { mode: "fresh-stable" });
      yield* admitTransaction(makeTransactionInput(ref), harness.authority);
      assert.strictEqual(harness.calls.filter((call) => call === "activate").length, 1);
      assert.strictEqual(harness.calls.filter((call) => call === "expose").length, 1);
      assert.deepStrictEqual(harness.stagedState.activation, { barrier: "crossed" });
      assert.strictEqual(harness.exposedCount, 1);
    }),
  );

  it.effect("blocks individual disposal while dependent edges remain", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: admissionApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const providerRef = actorRef(providerMachine, "dependent-provider");

      const provider = yield* assembly.createActor({
        ref: providerRef,
        initial: preparedProviderSnapshot(),
      });

      const binding = {
        slot: "providerState",
        provider: providerRef,
        providerFence: provider.fence,
        select: ({ state }) => state,
      } satisfies ActorContextBinding<
        typeof consumerDefinition,
        typeof providerDefinition,
        "providerState"
      >;

      const consumer = yield* assembly.createActor({
        ref: actorRef(consumerMachine, "dependent-consumer"),
        initial: preparedConsumerSnapshot(),
        bindings: [binding],
      });

      const before = provider.engine.snapshot();

      const result = yield* Effect.exit(
        Effect.provideContext(provider.dispose(), assembly.context),
      );

      assert.ok(Exit.isFailure(result));

      if (Exit.isFailure(result)) {
        const reason = result.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error.code, "BlockedByDependents");
        assert.deepStrictEqual(reason.error.details, {
          dependents: 1,
          dependentActors: consumer.fence.key,
          bindingKeys: "providerState",
        });
      }

      assert.strictEqual(provider.engine.snapshot().lifecycle, "active");
      assert.strictEqual(provider.engine.snapshot().revision, before.revision);

      const duplicate = yield* Effect.exit(
        assembly.createActor({ ref: providerRef, initial: preparedProviderSnapshot() }),
      );

      assert.ok(Exit.isFailure(duplicate));

      if (Exit.isFailure(duplicate)) {
        const reason = duplicate.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error.code, "DuplicateActorClaim");
      }

      yield* Effect.provideContext(consumer.dispose(), assembly.context);
      yield* Effect.provideContext(provider.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it("detaches context bindings before late provider facts can apply", () => {
    const registry = makeActorIdentityRegistry();
    const providerRef = actorRef(providerMachine, "detach-provider");
    const providerIdentity = resultSuccess(registry.reserveStable(providerRef));
    resultSuccess(registry.register(providerIdentity, { name: "provider" }));
    const consumerRef = actorRef(consumerMachine, "detach-consumer");
    const consumerIdentity = resultSuccess(registry.reserveStable(consumerRef));

    const edge = {
      consumer: consumerIdentity.key,
      provider: providerIdentity.key,
      slot: "providerState",
    } as const;

    const input = makeAdmission(consumerRef, providerRef, providerIdentity, [edge]);

    const admitted = resultSuccess(
      validateActorAdmission(input, {
        app: admissionApp,
        implementation,
        lookup: registry.lookup,
        consumerKey: edge.consumer,
        providerFences: new Map([[providerIdentity.key, makeProviderFence(providerIdentity)]]),
      }),
    );

    assert.deepStrictEqual(admitted.edges, [edge]);
    assert.strictEqual(admitted.input.bindings.length, 1);
  });

  it.effect("restores a persisted actor through the same admission checks", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: noContextApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const ref = actorRef(editorMachine, "restored-persisted", { persist: true });
      const restored = preparedEditorSnapshot(7);

      const actor = yield* assembly.createActor({
        ref,
        restore: restored,
      });

      assert.strictEqual(actor.identity.ref.machine, editorMachine);
      assert.strictEqual(actor.identity.ref.persist, true);
      assert.strictEqual(actor.engine.snapshot().lifecycle, "active");
      assert.strictEqual(actor.engine.snapshot().state, editorDefinition.S.ready);
      assert.strictEqual(actor.engine.snapshot().revision, restored.revision);
      assert.deepStrictEqual(actor.engine.snapshot().memory, restored.memory);
      assert.deepStrictEqual(actor.engine.snapshot().context, restored.context);
      yield* Effect.provideContext(actor.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("rejects restore data for a non-persisted actor", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: noContextApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const sentinel = yield* assembly.createActor({
        ref: actorRef(editorMachine, "restore-sentinel", { persist: false }),
        initial: preparedEditorSnapshot(),
      });

      const sentinelBefore = sentinel.engine.snapshot();
      const mailboxBefore = yield* Queue.size(sentinel.engine.mailbox);
      let snapshots = 0;
      let commands = 0;
      const ref = actorRef(editorMachine, "non-persisted-restore", { persist: false });

      const failed = yield* Effect.exit(
        assembly.createActor({
          ref,
          restore: preparedEditorSnapshot(3),
          onSnapshot: () => {
            snapshots += 1;
          },
          onCommand: () => {
            commands += 1;

            return Effect.void;
          },
        }),
      );

      assert.ok(Exit.isFailure(failed));

      if (Exit.isFailure(failed)) {
        const reason = failed.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error.code, "SchemaValidation");
        assert.deepStrictEqual(reason.error.path, ["actorAdmission", "restore"]);
        assert.deepStrictEqual(reason.error.details, { reason: "non-persisted-ref" });
        assert.strictEqual(Cause.hasDies(failed.cause), false);
      }

      assert.strictEqual(snapshots, 0);
      assert.strictEqual(commands, 0);
      assert.deepStrictEqual(sentinel.engine.snapshot(), sentinelBefore);
      assert.strictEqual(yield* Queue.size(sentinel.engine.mailbox), mailboxBefore);

      const fresh = yield* assembly.createActor({ ref, initial: preparedEditorSnapshot(4) });
      assert.strictEqual(fresh.identity.ref.machine, ref.machine);
      assert.strictEqual(fresh.identity.ref.id, ref.id);
      assert.strictEqual(fresh.identity.ref.persist, ref.persist);
      assert.strictEqual(fresh.engine.snapshot().revision, 4);
      yield* Effect.provideContext(fresh.dispose(), assembly.context);
      yield* Effect.provideContext(sentinel.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("keeps actor admission behind pending implementation readiness", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();

      const setup = runtimeSetup({
        app: noContextApp,
        implementation: Implementation.effect(
          PendingImplementationService,
          Effect.gen(function* () {
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);

            return { ready: true } as const;
          }),
        ),
      });

      const runtime = setup.construct();
      assert.throws(() => runtimeOwner(runtime).assembly(), /Runtime is not ready/u);

      const readiness = yield* Effect.forkChild(Effect.exit(runtime.ready()), {
        startImmediately: true,
      });

      yield* Deferred.await(entered);
      assert.throws(() => runtimeOwner(runtime).assembly(), /Runtime is not ready/u);
      yield* Deferred.succeed(release, undefined);
      const ready = yield* Fiber.join(readiness);
      assert.ok(Exit.isSuccess(ready));
      const assembly = runtimeOwner(runtime).assembly();

      const actor = yield* assembly.createActor({
        ref: actorRef(editorMachine, "after-readiness"),
        initial: preparedEditorSnapshot(),
      });

      assert.strictEqual(actor.engine.snapshot().lifecycle, "active");
      yield* Effect.provideContext(actor.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it("allocates a correlated operation occurrence fence", () => {
    const ref = actorRef(editorMachine, "occurrence-fence");
    const registry = makeActorIdentityRegistry();
    const identity = resultSuccess(registry.reserveStable(ref));

    const fence = {
      key: identity.key,
      incarnation: identity.incarnation,
      generation: 2,
      leaseEpoch: identity.leaseEpoch,
    } satisfies ActorFence;

    const occurrence = {
      actor: fence,
      descriptor: { id: "operation", key: (value: number) => [value] as const },
      key: [1] as const,
      ordinal: 1,
    };

    assert.strictEqual(occurrence.actor, fence);
    assert.strictEqual(occurrence.ordinal, 1);
    assert.deepStrictEqual(occurrence.key, [1]);
  });

  it("allocates and settles distinct live operation occurrences", () => {
    const ref = actorRef(editorMachine, "live-occurrences");
    const registry = makeActorIdentityRegistry();
    const identity = resultSuccess(registry.reserveStable(ref));
    const actorFence = makeProviderFence(identity);
    const descriptor = { id: "operation", key: (value: number) => [value] as const };
    const first = { actor: actorFence, descriptor, key: [1] as const, ordinal: 1 };
    const second = { actor: actorFence, descriptor, key: [1] as const, ordinal: 2 };
    const settled = new Set([second.ordinal, first.ordinal]);
    assert.notStrictEqual(first.ordinal, second.ordinal);
    assert.strictEqual(settled.size, 2);
    assert.strictEqual(first.actor.incarnation, second.actor.incarnation);
  });

  it.effect("maps expected admission refusal to the public diagnostic channel", () =>
    Effect.gen(function* () {
      const ref = actorRef(editorMachine, "expected-refusal");

      const harness = makeTransactionHarness(ref, {
        mode: "fresh-stable",
        failure: { stage: "prepare", kind: "typed", message: "expected refusal" },
      });

      const exit = yield* Effect.exit(
        admitTransaction(makeTransactionInput(ref), harness.authority),
      );

      assert.ok(Exit.isFailure(exit));

      if (Exit.isFailure(exit)) {
        assert.strictEqual(Cause.hasFails(exit.cause), true);
        assert.strictEqual(Cause.hasDies(exit.cause), false);
      }
    }),
  );

  it.effect("retains admission defects while releasing reservations", () =>
    Effect.gen(function* () {
      const ref = actorRef(editorMachine, "defective-admission");

      const harness = makeTransactionHarness(ref, {
        mode: "fresh-stable",
        failure: { stage: "activate", kind: "defect", message: "admission defect" },
      });

      const exit = yield* Effect.exit(
        admitTransaction(makeTransactionInput(ref), harness.authority),
      );

      assert.ok(Exit.isFailure(exit));

      if (Exit.isFailure(exit)) assert.strictEqual(Cause.hasDies(exit.cause), true);
      assert.deepStrictEqual(harness.cleanups, ["attached", "prepared", "reservation"]);
    }),
  );

  it.effect("linearizes attachment against owner disposal", () =>
    Effect.gen(function* () {
      const order: string[] = [];
      const owner = makeLifecycleRuntimeOwner<never>();
      const lease = owner.registerActor({ dispose: () => Effect.sync(() => order.push("lease")) });
      const first = yield* Effect.forkChild(Effect.exit(owner.dispose()));
      const second = yield* Effect.forkChild(Effect.exit(owner.dispose()));
      assert.ok(Exit.isSuccess(yield* Fiber.join(first)));
      assert.ok(Exit.isSuccess(yield* Fiber.join(second)));
      const late = owner.registerActor({ dispose: () => Effect.sync(() => order.push("late")) });
      assert.deepStrictEqual(order, ["lease"]);
      assert.strictEqual(lease.accepted, true);
      assert.strictEqual(late.accepted, false);
      assert.strictEqual(owner.isCurrent(owner.generation()), false);
    }),
  );

  it.effect("retains a failed actor registration for a later disposal retry", () =>
    Effect.gen(function* () {
      const failure = Failure({
        code: "InvariantViolation" as const,
        path: ["actor", "dispose"],
        details: { reason: "retry" },
        summary: "Actor disposal failed.",
        help: "Retry actor disposal.",
      });

      let attempts = 0;
      const owner = makeLifecycleRuntimeOwner<never>();

      const registration = owner.registerActor({
        dispose: () =>
          Effect.sync(() => {
            attempts += 1;

            return attempts === 1 ? Effect.fail(failure) : Effect.void;
          }).pipe(Effect.flatten),
      });

      const first = yield* Effect.exit(owner.dispose());
      assert.ok(Exit.isFailure(first));
      assert.strictEqual(registration.accepted, true);
      assert.strictEqual(attempts, 1);

      const second = yield* owner.dispose();
      assert.strictEqual(second, undefined);
      assert.strictEqual(attempts, 2);
      registration.unregister();
      assert.strictEqual(owner.isCurrent(owner.generation()), false);
    }),
  );

  it.effect("joins actor registration that races an active runtime close", () =>
    Effect.gen(function* () {
      const order: string[] = [];
      const gate = yield* Deferred.make<void>();
      const owner = makeLifecycleRuntimeOwner<never>();

      const completed = owner.registerActor({
        dispose: () =>
          Effect.gen(function* () {
            order.push("completed-start");
            yield* Deferred.await(gate);
            order.push("completed-end");
          }),
      });

      const closing = yield* Effect.forkChild(Effect.exit(owner.dispose()), {
        startImmediately: true,
      });

      yield* Effect.yieldNow;

      let lateDisposals = 0;

      const late = owner.registerActor({
        dispose: () =>
          Effect.sync(() => {
            lateDisposals += 1;
            order.push("late");
          }),
      });

      yield* Deferred.succeed(gate, undefined);
      const closed = yield* Fiber.join(closing);
      assert.ok(Exit.isSuccess(closed));
      assert.strictEqual(completed.accepted, true);
      assert.strictEqual(late.accepted, true);
      assert.deepStrictEqual(order, ["completed-start", "completed-end", "late"]);
      assert.strictEqual(lateDisposals, 1);

      completed.unregister();
      late.unregister();
      assert.ok(Exit.isSuccess(yield* Effect.exit(owner.dispose())));
      assert.deepStrictEqual(order, ["completed-start", "completed-end", "late"]);
    }),
  );

  it.effect("recursively drains actors registered by late actor disposal", () =>
    Effect.gen(function* () {
      const order: string[] = [];
      const owner = makeLifecycleRuntimeOwner<never>();

      owner.registerActor({
        dispose: () =>
          Effect.sync(() => {
            order.push("first");
            owner.registerActor({
              dispose: () =>
                Effect.sync(() => {
                  order.push("late1");
                  owner.registerActor({
                    dispose: () => Effect.sync(() => order.push("late2")),
                  });
                }),
            });
          }),
      });
      owner.registerProvider(Effect.sync(() => order.push("provider")));

      const closed = yield* Effect.exit(owner.dispose());

      assert.ok(Exit.isSuccess(closed));
      assert.deepStrictEqual(order, ["first", "late1", "late2", "provider"]);
    }),
  );

  it.effect("fences a public handle after its actor lease is released", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: noContextApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const ref = actorRef(editorMachine, "released-handle", { persist: true });

      const actor = yield* assembly.createActor({
        ref,
        initial: preparedEditorSnapshot(),
      });

      yield* Effect.provideContext(actor.dispose(), assembly.context);
      assert.strictEqual(actor.engine.snapshot().lifecycle, "disposed");
      assert.throws(() => actor.handle.send(resultSuccess(editorDefinition.E.opened())));

      const recreated = yield* Effect.exit(
        assembly.createActor({ ref, initial: preparedEditorSnapshot() }),
      );

      assert.ok(Exit.isFailure(recreated));

      if (Exit.isFailure(recreated)) {
        const reason = recreated.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error.code, "DisposedActorRef");
      }

      yield* runtimeOwner(runtime).close();
    }),
  );

  it("contains hostile reflection during actor admission", () => {
    const ref = actorRef(editorMachine, "hostile-reflection-parity");
    const harness = makeTransactionHarness(ref, { mode: "fresh-stable" });

    const hostileRef = new Proxy(ref, {
      ownKeys: () => {
        throw new Error("hostile ownKeys");
      },
    });

    const hostile = { ...makeTransactionInput(ref), ref: hostileRef };
    const result = validateActorAdmission(hostile, harness.authority);
    assert.ok(Result.isFailure(result));
    assert.ok(Result.isFailure(harness.registry.lookup(ref)));
  });
});

describe("pending regression scenarios", () => {
  // Setup: Hold the leader's stable `admitActor` transaction after reservation or preparation with a Deferred, then start a second `admitActor` call for the identical stable ref so both callers share one completion.
  // Action: Interrupt only the joined waiter, release the leader gate, and await the leader's terminal admission followed by the authority registry lookup of the ref.
  // Assert: The leader succeeds once with one prepare, activation, exposure, and cleanup owner; the interrupted waiter does not replay preparation or cancel the shared transaction, and no pending reservation remains.
  it.effect(
    "interrupting a joined stable admission waiter does not replay or strand the leader",
    () =>
      Effect.gen(function* () {
        const ref = actorRef(editorMachine, "joined-waiter", { persist: true });
        const registered = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();

        const harness = makeTransactionHarness(ref, {
          mode: "fresh-stable",
          registeredEntered: registered,
          registerGate: release,
        });

        const leader = yield* Effect.forkChild(
          Effect.exit(admitTransaction(makeTransactionInput(ref), harness.authority)),
          { startImmediately: true },
        );

        yield* Deferred.await(registered);

        const waiter = yield* Effect.forkChild(
          Effect.exit(admitTransaction(makeTransactionInput(ref), harness.authority)),
          { startImmediately: true },
        );

        yield* Effect.yieldNow;
        yield* Fiber.interrupt(waiter);
        const interrupted = yield* Effect.exit(Fiber.join(waiter));
        assert.ok(Exit.isFailure(interrupted));

        yield* Deferred.succeed(release, undefined);
        const terminal = yield* Fiber.join(leader);

        assert.ok(Exit.isSuccess(terminal));

        if (Exit.isFailure(terminal)) return;
        assert.strictEqual(terminal.value.actor.ref.id, ref.id);
        assert.deepStrictEqual(harness.calls, [
          "reserve",
          "prepare:fresh-stable",
          "attach",
          "activate",
          "register",
          "reserve",
          "expose",
        ]);
        assert.strictEqual(harness.exposedCount, 1);
        assert.strictEqual(Result.isSuccess(harness.registry.lookup(ref)), true);
      }),
  );

  // Setup: Use the real makeActorLease with a cleanup Deferred and counter; construct and discard one lease.dispose() Effect without executing it.
  // Action: Execute a later disposal, wait for cleanup to begin, join from another caller and interrupt only that follower; release cleanup, await the owner and call disposal again after completion.
  // Assert: Unexecuted Effect construction reserves nothing; cleanup starts exactly once, the interrupted follower cannot strand or cancel its owner, and the late caller receives the cached terminal Exit without replay or an uncompleted Deferred.
  it.effect("constructing a disposal Effect does not reserve a cleanup attempt", () =>
    Effect.gen(function* () {
      const ref = actorRef(editorMachine, "cold-disposal", { persist: true });
      const registry = makeActorIdentityRegistry<{ label: string }>();
      const identity = resultSuccess(registry.reserveStable(ref));

      const validated = resultSuccess(
        validateActorAdmission(makeTransactionInput(ref), {
          app: noContextApp,
          implementation,
          lookup: registry.lookup,
          identity,
        }),
      );

      resultSuccess(registry.register(identity, { label: "cold-disposal" }));
      let cleanupRuns = 0;
      let tombstoneRuns = 0;

      const lease = makeActorLease({
        actor: { label: "cold-disposal", ref },
        admission: { ...validated, identity },
        cleanup: Effect.sync(() => {
          cleanupRuns += 1;
        }),
        tombstone: () => {
          tombstoneRuns += 1;

          return registry.tombstone(identity, 1);
        },
      });

      void lease.dispose();
      assert.strictEqual(cleanupRuns, 0);
      assert.strictEqual(tombstoneRuns, 0);
      assert.strictEqual(Result.isSuccess(registry.lookup(ref)), true);

      const first = yield* Effect.exit(lease.dispose());
      const second = yield* Effect.exit(lease.dispose());
      assert.ok(Exit.isSuccess(first));
      assert.ok(Exit.isSuccess(second));
      assert.strictEqual(cleanupRuns, 1);
      assert.strictEqual(tombstoneRuns, 1);
      assert.ok(Result.isFailure(registry.lookup(ref)));
    }),
  );

  // Setup: Register two real runtime-disposal participants that fail with the same diagnostic value and a later participant that records successful cleanup; also exercise the admission rollback path.
  // Action: Run disposal or rollback through the production owner and retain its complete Exit plus the release trace.
  // Assert: Both identical failure reasons remain present in execution order, later cleanup still executes, and diagnostic classification does not squash the retained Cause.
  it.effect("preserves repeated cleanup failures in execution order", () =>
    Effect.gen(function* () {
      const order: string[] = [];
      const owner = makeLifecycleRuntimeOwner<never>();

      const repeated = Failure({
        code: "InvariantViolation",
        path: ["cleanup"],
        details: { reason: "repeated" },
        summary: "Repeated cleanup failure.",
        help: "Retain every cleanup failure.",
      });

      owner.registerActor({
        dispose: () =>
          Effect.failCause(
            Cause.fromReasons([Cause.makeFailReason(repeated), Cause.makeFailReason(repeated)]),
          ),
      });
      owner.registerActor({
        dispose: () =>
          Effect.gen(function* () {
            order.push("later");
            yield* Effect.die(new Error("later-defect"));
          }),
      });

      const closed = yield* Effect.exit(owner.dispose());
      assert.ok(Exit.isFailure(closed));
      assert.deepStrictEqual(order, ["later"]);

      if (Exit.isFailure(closed)) {
        assert.deepStrictEqual(
          closed.cause.reasons.map((reason) => reason._tag),
          ["Die", "Fail", "Fail"],
        );
        assert.strictEqual(closed.cause.reasons.filter(Cause.isFailReason).length, 2);
      }
    }),
  );
});
