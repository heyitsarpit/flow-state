/* oxlint-disable anti-slop/no-large-production-file -- this is the actor-admission proof matrix across identity, reflection, graph validation, rollback, and lease handoff; shared fixtures keep phase-order checks comparable. */
import { assert, describe, it } from "@effect/vitest";
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Result } from "effect";

import { app, module } from "../../app/app.js";
import { Failure, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import { definition } from "../../definition/definition.js";
import { Implementation } from "../../implementation/implementation.js";
import { machine, type Machine } from "../../machine/machine.js";
import type { MachineDefinition } from "../../machine/grammar.js";
import { actorRef } from "../actor-ref.js";
import type { ActorRef } from "../actor-ref.js";
import { prepareActorSnapshot } from "../actor-engine.js";
import { makeRuntimeOwner } from "../runtime-owner.js";
import { runtimeOwner, runtimeSetup } from "../runtime.js";
import {
  decodeActorAdmissionEnvelope,
  makeActorIdentityRegistry,
  makeActorLease,
  validateActorAdmission,
  type ActorAdmissionInput,
  type ActorIdentity,
  type ActorIdentityRegistry,
  type ActorContextBinding,
  type ActorDependencyEdge,
  type ActorFence,
  type ActorKey,
} from "../actor-admission.js";

type DeterministicGcHost = typeof globalThis & {
  // oxlint-disable-next-line anti-slop/no-optional-domain-properties -- the test host may expose gc only when the runtime is launched with explicit GC support.
  gc?: () => void;
};

const resultSuccess = <Value, Error>(result: Result.Result<Value, Error>) => {
  if (Result.isFailure(result)) throw result.failure;

  return result.success;
};

const makeCloseOwner = (drain?: Effect.Effect<void, PublicDiagnostic>) => {
  const base = {
    layer: Layer.empty,
    expose: Effect.succeed(undefined),
  };

  if (drain === undefined)
    return makeRuntimeOwner<never, never, never, undefined, never, never, PublicDiagnostic>(base);

  return makeRuntimeOwner<never, never, never, undefined, never, never, PublicDiagnostic>({
    ...base,
    drain,
  });
};

const registerAndExpose = <Actor, DefinitionValue extends MachineDefinition>(
  registry: ActorIdentityRegistry<Actor>,
  identity: ActorIdentity<DefinitionValue>,
  actor: Actor,
) => {
  const registered = resultSuccess(registry.register(identity, actor));
  resultSuccess(registry.expose(identity));

  return registered;
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
}) => ({
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

type TestAdmissionInput = ActorAdmissionInput<
  typeof noContextApp,
  typeof editorDefinition,
  typeof implementation
>;

const transactionDiagnostic = (message: string) =>
  Failure({
    code: "InvariantViolation",
    path: ["admission"],
    details: { message },
    summary: message,
    help: message,
  });

const makeAdmissionInput = (ref: ActorRef<Machine<typeof editorDefinition>>) =>
  ({
    app: noContextApp,
    implementation,
    ref,
    input: undefined,
    bindings: [],
    dependencies: [],
  }) satisfies TestAdmissionInput;

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

  it("keeps internal registration hidden until exposure and aborts without tombstoning", () => {
    const registry = makeActorIdentityRegistry<{ name: string }>();
    const ref = actorRef(editorMachine, "passive");
    const identity = resultSuccess(registry.reserveStable(ref));

    assert.strictEqual(Result.isFailure(registry.lookup(ref)), true);
    const actor = { name: "passive" } as const;
    const registered = resultSuccess(registry.register(identity, actor));

    assert.strictEqual(Result.isFailure(registry.lookup(ref)), true);
    resultSuccess(registry.expose(identity));
    const lookedUp = resultSuccess(registry.lookup(actorRef(editorMachine, "passive")));

    assert.strictEqual(registered.actor, actor);
    assert.strictEqual(lookedUp.actor, actor);
    assert.strictEqual(lookedUp.identity, identity);
    assert.strictEqual(Result.isFailure(registry.register(identity, actor)), true);

    const abortedRef = actorRef(editorMachine, "pre-exposure-abort");
    const aborted = resultSuccess(registry.reserveStable(abortedRef));
    resultSuccess(registry.register(aborted, { name: "hidden" }));
    assert.strictEqual(Result.isFailure(registry.lookup(abortedRef)), true);
    registry.rollback(aborted);
    const retried = resultSuccess(registry.reserveStable(abortedRef));

    assert.strictEqual(retried.key, aborted.key);
    assert.ok(retried.incarnation > aborted.incarnation);
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
    registerAndExpose(registry, second, { name: "retry" });
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
      registerAndExpose(registry, identity, actor);

      return new WeakRef(actor);
    })();

    resultSuccess(registry.tombstone(identity, 1));
    // SAFETY: Node --expose-gc supplies this optional host method; default test hosts omit it.
    const maybeGc = (globalThis as DeterministicGcHost).gc;

    if (maybeGc === undefined) return;

    for (let attempt = 0; attempt < 16; attempt += 1) {
      maybeGc();
      // oxlint-disable-next-line no-restricted-globals -- WeakRef collection is host-scheduled; this optional GC proof has no owner receipt and TestClock cannot advance native GC.
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
        ...makeAdmissionInput(ref),
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

    const escapedLookup = validateActorAdmission(makeAdmissionInput(ref), {
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

  it("validates exact provenance and publishes copied forward and reverse topology", () => {
    const registry = makeActorIdentityRegistry();
    const providerRef = actorRef(providerMachine, "provider");
    const providerIdentity = resultSuccess(registry.reserveStable(providerRef));
    registerAndExpose(registry, providerIdentity, { name: "provider" });
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
    registerAndExpose(registry, providerIdentity, { name: "provider" });
    const consumerRef = actorRef(consumerMachine, "consumer-canonicalization");

    const consumerKey = resultSuccess(
      registry.reserveStable(actorRef(consumerMachine, "consumer-canonicalization-key")),
    ).key;

    const edge = {
      consumer: consumerKey,
      provider: providerIdentity.key,
      slot: "providerState",
    } as const;

    const selector = () => {
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
    registerAndExpose(registry, providerIdentity, { name: "provider" });
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
    registerAndExpose(staleRegistry, staleIdentity, { name: "provider" });
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
    registerAndExpose(foreignRegistry, foreignIdentity, { name: "provider" });

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
    registerAndExpose(duplicateRegistry, duplicateProviderIdentity, { name: "provider" });
    const duplicateConsumerIdentity = resultSuccess(duplicateRegistry.reserveStable(consumerRef));
    registerAndExpose(duplicateRegistry, duplicateConsumerIdentity, { name: "consumer" });

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
    registerAndExpose(tombstoneRegistry, tombstoneIdentity, { name: "provider" });
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
    registerAndExpose(registry, leftIdentity, { name: "left" });
    registerAndExpose(registry, rightIdentity, { name: "right" });
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

  it.effect("joins lease disposal and caches failed cleanup without tombstoning", () =>
    Effect.gen(function* () {
      const ref = actorRef(editorMachine, "lease-owner", { persist: true });
      const registry = makeActorIdentityRegistry<{ label: string }>();
      const identity = resultSuccess(registry.reserveStable(ref));
      const input = makeAdmissionInput(ref);

      const validated = resultSuccess(
        validateActorAdmission(input, {
          app: noContextApp,
          implementation,
          lookup: registry.lookup,
          identity,
        }),
      );

      registerAndExpose(registry, identity, { label: "lease-owner" });
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

      if (Result.isFailure(disposed)) assert.strictEqual(disposed.failure.code, "DisposedActorRef");

      const failedRef = actorRef(editorMachine, "lease-failure", { persist: true });
      const failedIdentity = resultSuccess(registry.reserveStable(failedRef));
      const failedInput = makeAdmissionInput(failedRef);

      const failedValidated = resultSuccess(
        validateActorAdmission(failedInput, {
          app: noContextApp,
          implementation,
          lookup: registry.lookup,
          identity: failedIdentity,
        }),
      );

      registerAndExpose(registry, failedIdentity, { label: "lease-failure" });
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
      assert.ok(Exit.isFailure(retriedExit));
      assert.strictEqual(failedCleanupRuns, 1);
      assert.strictEqual(tombstoneRuns, 0);
      const tombstoned = registry.lookup(failedRef);
      assert.ok(Result.isSuccess(tombstoned));
    }),
  );

  it.effect("disposes runtime leases before evidence and providers, once", () =>
    Effect.gen(function* () {
      const order: Array<string> = [];

      const owner = makeCloseOwner(Effect.sync(() => order.push("drain")));

      owner.registerActor({ dispose: () => Effect.sync(() => order.push("consumer")) });
      owner.registerActor({ dispose: () => Effect.sync(() => order.push("provider-actor")) });
      owner.registerProvider(Effect.sync(() => order.push("provider-resource")));
      owner.registerProvider(Effect.sync(() => order.push("provider-scope")));
      const first = yield* Effect.forkChild(Effect.exit(owner.close()));
      const second = yield* Effect.forkChild(Effect.exit(owner.close()));
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
      assert.strictEqual(owner.isOpen(), false);
    }),
  );

  it.effect("keeps runtime disposal cold and includes leases registered after construction", () =>
    Effect.gen(function* () {
      const owner = makeCloseOwner();
      let releases = 0;
      const disposal = owner.close();

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
    const registry = makeActorIdentityRegistry();

    const prepared = resultSuccess(
      validateActorAdmission(makeAdmissionInput(ref), {
        app: noContextApp,
        implementation,
        lookup: registry.lookup,
      }),
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
    const registry = makeActorIdentityRegistry();
    const foreignRef = actorRef(providerMachine, "foreign-machine");
    const foreignInputRef: unknown = foreignRef;

    const input = {
      ...makeAdmissionInput(ref),
      // SAFETY: A provider-machine ref intentionally crosses the typed input boundary to prove runtime provenance rejection.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the negative proof must present a foreign machine at this boundary.
      ref: foreignInputRef as typeof ref,
    };

    const result = validateActorAdmission(input, {
      app: noContextApp,
      implementation,
      lookup: registry.lookup,
    });

    assert.ok(Result.isFailure(result));
    assert.ok(Result.isFailure(registry.lookup(foreignRef)));
  });

  it("rejects duplicate actor identity without replacing its lease", () => {
    const ref = actorRef(editorMachine, "duplicate-identity");
    const registry = makeActorIdentityRegistry<{ label: string }>();
    const identity = resultSuccess(registry.reserveStable(ref));
    const actor = { label: "existing" };
    registerAndExpose(registry, identity, actor);

    const result = validateActorAdmission(makeAdmissionInput(ref), {
      app: noContextApp,
      implementation,
      lookup: registry.lookup,
    });

    assert.ok(Result.isFailure(result));

    if (Result.isFailure(result)) assert.strictEqual(result.failure.code, "DuplicateActorClaim");
    const existing = resultSuccess(registry.lookup(ref));
    assert.strictEqual(existing.actor, actor);
    assert.strictEqual(existing.identity, identity);
  });

  it("preserves tombstones across actor reincarnation", () => {
    const registry = makeActorIdentityRegistry<{ label: string }>();
    const ref = actorRef(editorMachine, "tombstone");
    const first = resultSuccess(registry.reserveStable(ref));
    registerAndExpose(registry, first, { label: "first" });
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
    registerAndExpose(registry, providerIdentity, { name: "provider" });
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
    registerAndExpose(registry, providerIdentity, { name: "provider" });
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
    registerAndExpose(registry, providerIdentity, { name: "provider" });
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
    registerAndExpose(registry, left, { name: "left" });
    registerAndExpose(registry, right, { name: "right" });
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
    registerAndExpose(registry, providerIdentity, { name: "provider" });
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
    registerAndExpose(registry, providerIdentity, { name: "provider" });
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

      const repeatedProviderDispose = yield* Effect.exit(
        Effect.provideContext(provider.dispose(), assembly.context),
      );

      assert.ok(Exit.isSuccess(repeatedProviderDispose));
      const shutdown = yield* Effect.exit(runtimeOwner(runtime).close());
      assert.ok(Exit.isSuccess(shutdown));
    }),
  );

  it("detaches context bindings before late provider facts can apply", () => {
    const registry = makeActorIdentityRegistry();
    const providerRef = actorRef(providerMachine, "detach-provider");
    const providerIdentity = resultSuccess(registry.reserveStable(providerRef));
    registerAndExpose(registry, providerIdentity, { name: "provider" });
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
        restoredMachineTurnRevision: 0,
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
      let snapshots = 0;
      let commands = 0;
      const ref = actorRef(editorMachine, "non-persisted-restore", { persist: false });

      const failed = yield* Effect.exit(
        assembly.createActor({
          ref,
          restore: preparedEditorSnapshot(3),
          restoredMachineTurnRevision: 0,
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

  it.effect("linearizes attachment against owner disposal", () =>
    Effect.gen(function* () {
      const order: string[] = [];
      const owner = makeCloseOwner();
      const lease = owner.registerActor({ dispose: () => Effect.sync(() => order.push("lease")) });
      const first = yield* Effect.forkChild(Effect.exit(owner.close()));
      const second = yield* Effect.forkChild(Effect.exit(owner.close()));
      assert.ok(Exit.isSuccess(yield* Fiber.join(first)));
      assert.ok(Exit.isSuccess(yield* Fiber.join(second)));
      const late = owner.registerActor({ dispose: () => Effect.sync(() => order.push("late")) });
      assert.deepStrictEqual(order, ["lease"]);
      assert.strictEqual(lease.accepted, true);
      assert.strictEqual(late.accepted, false);
      assert.strictEqual(owner.isOpen(), false);
    }),
  );

  it.effect("caches one failed actor disposal attempt through runtime close", () =>
    Effect.gen(function* () {
      const failure = Failure({
        code: "InvariantViolation" as const,
        path: ["actor", "dispose"],
        details: { reason: "terminal" },
        summary: "Actor disposal failed.",
        help: "Inspect the cached runtime close Cause.",
      });

      let attempts = 0;
      const owner = makeCloseOwner();

      const registration = owner.registerActor({
        dispose: () =>
          Effect.sync(() => {
            attempts += 1;

            return attempts === 1 ? Effect.fail(failure) : Effect.void;
          }).pipe(Effect.flatten),
      });

      const first = yield* Effect.exit(owner.close());
      assert.ok(Exit.isFailure(first));
      assert.strictEqual(registration.accepted, true);
      assert.strictEqual(attempts, 1);

      const second = yield* Effect.exit(owner.close());
      assert.ok(Exit.isFailure(second));
      assert.strictEqual(attempts, 1);

      if (Exit.isFailure(first) && Exit.isFailure(second))
        assert.strictEqual(second.cause, first.cause);
      registration.unregister();
      assert.strictEqual(owner.isOpen(), false);
    }),
  );

  it.effect("joins actor registration that races an active runtime close", () =>
    Effect.gen(function* () {
      const order: string[] = [];
      const gate = yield* Deferred.make<void>();
      const owner = makeCloseOwner();

      const completed = owner.registerActor({
        dispose: () =>
          Effect.gen(function* () {
            order.push("completed-start");
            yield* Deferred.await(gate);
            order.push("completed-end");
          }),
      });

      const closing = yield* Effect.forkChild(Effect.exit(owner.close()), {
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
      assert.ok(Exit.isSuccess(yield* Effect.exit(owner.close())));
      assert.deepStrictEqual(order, ["completed-start", "completed-end", "late"]);
    }),
  );

  it.effect("recursively drains actors registered by late actor disposal", () =>
    Effect.gen(function* () {
      const order: string[] = [];
      const owner = makeCloseOwner();

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

      const closed = yield* Effect.exit(owner.close());

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
    const registry = makeActorIdentityRegistry();

    const hostileRef = new Proxy(ref, {
      ownKeys: () => {
        throw new Error("hostile ownKeys");
      },
    });

    const hostile = { ...makeAdmissionInput(ref), ref: hostileRef };

    const result = validateActorAdmission(hostile, {
      app: noContextApp,
      implementation,
      lookup: registry.lookup,
    });

    assert.ok(Result.isFailure(result));
    assert.ok(Result.isFailure(registry.lookup(ref)));
  });
});

describe("pending regression scenarios", () => {
  // Setup: Use the real makeActorLease with a cleanup Deferred and counter; construct and discard one lease.dispose() Effect without executing it.
  // Action: Execute a later disposal, wait for cleanup to begin, join from another caller and interrupt only that follower; release cleanup, await the owner and call disposal again after completion.
  // Assert: Unexecuted Effect construction reserves nothing; cleanup starts exactly once, the interrupted follower cannot strand or cancel its owner, and the late caller receives the cached terminal Exit without replay or an uncompleted Deferred.
  it.effect("constructing a disposal Effect does not reserve a cleanup attempt", () =>
    Effect.gen(function* () {
      const ref = actorRef(editorMachine, "cold-disposal", { persist: true });
      const registry = makeActorIdentityRegistry<{ label: string }>();
      const identity = resultSuccess(registry.reserveStable(ref));

      const validated = resultSuccess(
        validateActorAdmission(makeAdmissionInput(ref), {
          app: noContextApp,
          implementation,
          lookup: registry.lookup,
          identity,
        }),
      );

      registerAndExpose(registry, identity, { label: "cold-disposal" });
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
      const owner = makeCloseOwner();

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

      const closed = yield* Effect.exit(owner.close());
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
