// oxlint-disable anti-slop/no-large-production-file -- This is the executable runtime-assembly matrix: one real App with provider, bound-consumer, standalone, and nested actors is exercised across admission/rollback, event and context delivery, suspend/resume/dispose/shutdown, and snapshot/store/stream/callback/evidence observations, including failure and concurrency lanes. Each case stays at the assembled owner boundary so these combinations use the production ownership graph rather than duplicated or mocked owners.
import { assert, describe, it } from "@effect/vitest";
import {
  Cause,
  Clock,
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Predicate,
  Result,
  Scope,
  Stream,
} from "effect";
import { TestClock } from "effect/testing";

import { app, appPlan, isOwnedMachineFactsFor, module } from "../../app/app.js";
import { definition } from "../../definition/definition.js";
import { Failure } from "../../diagnostic/diagnostic.js";
import { Implementation } from "../../implementation/implementation.js";
import { machine } from "../../machine/machine.js";
import { resource } from "../../operation/resource.js";
import { actorRef } from "../actor-ref.js";
import type { ActorContextBinding, ActorContextSnapshot, ActorFence } from "../actor-admission.js";
import { makeActorIdentityRegistry } from "../actor-admission.js";
import { makeContextCoordinator } from "../context-coordinator.js";
import { makeEvidenceSink } from "../evidence-sink.js";
import { ACTOR_MAILBOX_CAPACITY, prepareActorSnapshot } from "../actor-engine.js";
import type { ActorSnapshot, ActorStore, PreparedActorSnapshot } from "../actor-engine.js";
import type { EvidenceRecord } from "../evidence.js";
import { RuntimeEvidence } from "../runtime-services.js";
import { runtimeOwner, runtimeSetup } from "../runtime.js";
import { runtimeSetupForAdmissionTest, type RuntimeAdmissionPhase } from "../runtime-test-seam.js";

type IntegrationService = {
  name: "runtime-integration";
};

class IntegrationServiceKey extends Context.Service<IntegrationServiceKey, IntegrationService>()(
  "RuntimeIntegration/Service",
) {}

const throwPendingClearProbe = () => {
  throw new Error("pending-clear probe failed");
};

const IntegrationResource = resource({
  id: "runtime-integration/item",
  key: (id: string) => [id] as const,
  lookup: (id: string) => Effect.succeed(id),
});

const IntegrationProviderDefinitionResult = definition({
  id: "runtime-integration/provider",
  states: ["ready", "changed", "final"],
  events: { advance: "bare" },
});

const IntegrationProviderDefinition = Result.getOrThrow(IntegrationProviderDefinitionResult);

const IntegrationProviderMachine = Result.getOrThrow(
  machine(IntegrationProviderDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: {
      ready: { on: { advance: { target: S.changed } } },
      changed: { on: { advance: { target: S.final } } },
      final: {},
    },
  })),
);

const IntegrationConsumerDefinitionResult = definition({
  id: "runtime-integration/consumer",
  states: ["ready", "done"],
  events: { opened: "bare" },
  context: {
    providerState: IntegrationProviderDefinition.select(({ state }) => state),
    providerChanged: IntegrationProviderDefinition.select(
      ({ state }) => state === IntegrationProviderDefinition.S.changed,
    ),
  },
  operations: { item: IntegrationResource },
});

const IntegrationConsumerDefinition = Result.getOrThrow(IntegrationConsumerDefinitionResult);

const IntegrationConsumerMachine = Result.getOrThrow(
  machine(IntegrationConsumerDefinitionResult, ({ S, O }) => ({
    default: S.ready,
    states: {
      ready: {
        on: {
          opened: {
            target: S.done,
            actions: () => O.item.lookup("runtime-integration"),
          },
        },
      },
      done: {},
    },
  })),
);

const MutableContextConsumerDefinitionResult = definition({
  id: "runtime-integration/mutable-context-consumer",
  states: ["ready", "done"],
  events: { opened: "bare" },
  context: {
    providerState: IntegrationProviderDefinition.select(({ state }) => ({ state })),
    providerChanged: IntegrationProviderDefinition.select(
      ({ state }) => state === IntegrationProviderDefinition.S.changed,
    ),
  },
});

const MutableContextConsumerDefinition = Result.getOrThrow(MutableContextConsumerDefinitionResult);

const MutableContextConsumerMachine = Result.getOrThrow(
  machine(MutableContextConsumerDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: {
      ready: { on: { opened: { target: S.done } } },
      done: { on: { opened: { target: S.ready } } },
    },
  })),
);

const IntegrationStandaloneDefinitionResult = definition({
  id: "runtime-integration/standalone",
  states: ["ready", "done"],
  events: { opened: "bare" },
});

const IntegrationStandaloneDefinition = Result.getOrThrow(IntegrationStandaloneDefinitionResult);

const IntegrationStandaloneMachine = Result.getOrThrow(
  machine(IntegrationStandaloneDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: {
      ready: { on: { opened: { target: S.done } } },
      done: {},
    },
  })),
);

const IntegrationNestedDefinitionResult = definition({
  id: "runtime-integration/nested",
  states: ["idle", { active: ["editing", { dialog: ["open", "closed"] }] }, "__proto__"],
  events: {},
});

const IntegrationNestedDefinition = Result.getOrThrow(IntegrationNestedDefinitionResult);

const IntegrationNestedMachine = Result.getOrThrow(
  machine(IntegrationNestedDefinitionResult, ({ S }) => ({
    default: S.idle,
    states: {
      idle: {},
      active: {
        default: S.active.S.editing,
        states: {
          editing: {},
          dialog: {
            default: S.active.S.dialog.S.open,
            states: { open: {}, closed: {} },
          },
        },
      },
      ["__proto__"]: {},
    },
  })),
);

const IntegrationModule = module({
  id: "runtime-integration/module",
  machines: {
    provider: IntegrationProviderMachine,
    consumer: IntegrationConsumerMachine,
    standalone: IntegrationStandaloneMachine,
    nested: IntegrationNestedMachine,
  },
});

const IntegrationApp = app({
  id: "runtime-integration/app",
  persistenceVersion: "1",
  modules: [IntegrationModule],
});

const MutableContextApp = app({
  id: "runtime-integration/mutable-context-app",
  persistenceVersion: "1",
  modules: [
    module({
      id: "runtime-integration/mutable-context-module",
      machines: {
        provider: IntegrationProviderMachine,
        consumer: IntegrationConsumerMachine,
        mutableContextConsumer: MutableContextConsumerMachine,
      },
    }),
  ],
});

const IntegrationProviderEvent = Result.getOrThrow(IntegrationProviderDefinition.E.advance());

const IntegrationConsumerEvent = Result.getOrThrow(IntegrationConsumerDefinition.E.opened());

const MutableContextConsumerEvent = Result.getOrThrow(MutableContextConsumerDefinition.E.opened());

const IntegrationStandaloneEvent = Result.getOrThrow(IntegrationStandaloneDefinition.E.opened());

type IntegrationConsumerSnapshot = ActorSnapshot<typeof IntegrationConsumerDefinition>;

type IntegrationAssembly = ReturnType<ReturnType<typeof runtimeOwner>["assembly"]>;

const defectOnChanged = (
  state: ActorContextSnapshot<typeof IntegrationProviderDefinition>["state"],
) => {
  if (state === IntegrationProviderDefinition.S.changed) throw new Error("sibling selector defect");

  return false;
};

const makeContextDiamond = (
  assembly: IntegrationAssembly,
  suffix: string,
  // oxlint-disable-next-line anti-slop/no-optional-domain-properties -- only mailbox-failure fixtures need a gated command callback.
  options?: {
    bOnCommand: () => Effect.Effect<void>;
    cOnSnapshot: (snapshot: IntegrationConsumerSnapshot) => void;
    bOnSnapshot?: (snapshot: IntegrationConsumerSnapshot) => void;
  },
) =>
  Effect.gen(function* () {
    const providerRef = actorRef(IntegrationProviderMachine, `${suffix}-a`);
    const a = yield* assembly.createActor({ ref: providerRef, initial: initialProviderSnapshot() });
    const bRef = actorRef(IntegrationConsumerMachine, `${suffix}-b`);
    const cRef = actorRef(IntegrationConsumerMachine, `${suffix}-c`);
    const bSnapshots: IntegrationConsumerSnapshot[] = [];
    const cSnapshots: IntegrationConsumerSnapshot[] = [];
    const dSnapshots: IntegrationConsumerSnapshot[] = [];
    const bSelectionAttempts: string[] = [];

    const fromA = (recordSelection: (slot: string) => void) => [
      {
        slot: "providerState" as const,
        provider: providerRef,
        providerFence: a.fence,
        select: ({ state }: ActorContextSnapshot<typeof IntegrationProviderDefinition>) => {
          recordSelection("providerState");

          return state;
        },
      },
      {
        slot: "providerChanged" as const,
        provider: providerRef,
        providerFence: a.fence,
        select: ({ state }: ActorContextSnapshot<typeof IntegrationProviderDefinition>) => {
          recordSelection("providerChanged");

          return state === IntegrationProviderDefinition.S.changed;
        },
      },
    ];

    const bOptions = {
      ref: bRef,
      initial: initialConsumerSnapshot(),
      bindings: fromA((slot) => {
        bSelectionAttempts.push(slot);
      }),
      onSnapshot: (snapshot: IntegrationConsumerSnapshot) => {
        bSnapshots.push(snapshot);
        options?.bOnSnapshot?.(snapshot);
      },
    };

    const b = yield* options?.bOnCommand === undefined
      ? assembly.createActor(bOptions)
      : assembly.createActor({ ...bOptions, onCommand: options.bOnCommand });

    const c = yield* assembly.createActor({
      ref: cRef,
      initial: initialConsumerSnapshot(),
      bindings: fromA(() => {}),
      onSnapshot: (snapshot) => {
        cSnapshots.push(snapshot);
        options?.cOnSnapshot(snapshot);
      },
    });

    const d = yield* assembly.createActor({
      ref: actorRef(IntegrationConsumerMachine, `${suffix}-d`),
      initial: initialConsumerSnapshot(),
      bindings: [
        {
          slot: "providerState",
          provider: bRef,
          providerFence: b.fence,
          select: ({ context }) => context.providerState,
        },
        {
          slot: "providerChanged",
          provider: cRef,
          providerFence: c.fence,
          select: ({ context }) => context.providerChanged,
        },
      ],
      onSnapshot: (snapshot) => dSnapshots.push(snapshot),
    });

    return { a, b, c, d, bSnapshots, cSnapshots, dSnapshots, bSelectionAttempts };
  });

const makeMutableContextChain = (
  assembly: IntegrationAssembly,
  suffix: string,
  onBCommand: () => Effect.Effect<void>,
) =>
  Effect.gen(function* () {
    const aRef = actorRef(IntegrationProviderMachine, `${suffix}-a`);
    const a = yield* assembly.createActor({ ref: aRef, initial: initialProviderSnapshot() });
    const bRef = actorRef(MutableContextConsumerMachine, `${suffix}-b`);
    const bSnapshots: ActorSnapshot<typeof MutableContextConsumerDefinition>[] = [];
    const dSnapshots: IntegrationConsumerSnapshot[] = [];
    const bSelectionAttempts: string[] = [];

    const b = yield* assembly.createActor({
      ref: bRef,
      initial: initialMutableContextConsumerSnapshot(),
      bindings: [
        {
          slot: "providerState",
          provider: aRef,
          providerFence: a.fence,
          select: ({ state }) => {
            bSelectionAttempts.push("providerState");

            return { state };
          },
        },
        {
          slot: "providerChanged",
          provider: aRef,
          providerFence: a.fence,
          select: ({ state }) => {
            bSelectionAttempts.push("providerChanged");

            return state === IntegrationProviderDefinition.S.changed;
          },
        },
      ],
      onCommand: onBCommand,
      onSnapshot: (snapshot) => bSnapshots.push(snapshot),
    });

    const d = yield* assembly.createActor({
      ref: actorRef(IntegrationConsumerMachine, `${suffix}-d`),
      initial: initialConsumerSnapshot(),
      bindings: [
        {
          slot: "providerState",
          provider: bRef,
          providerFence: b.fence,
          select: ({ context }) => context.providerState.state,
        },
        {
          slot: "providerChanged",
          provider: bRef,
          providerFence: b.fence,
          select: ({ context }) => context.providerChanged,
        },
      ],
      onSnapshot: (snapshot) => dSnapshots.push(snapshot),
    });

    return { a, b, d, bSnapshots, dSnapshots, bSelectionAttempts };
  });

// RETURN_TYPE: This fixture pins the exact actor snapshot family used by runtime assembly.
const initialProviderSnapshot = (): PreparedActorSnapshot<typeof IntegrationProviderDefinition> =>
  Result.getOrThrow(
    prepareActorSnapshot(IntegrationProviderMachine, {
      state: IntegrationProviderDefinition.S.ready,
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

// RETURN_TYPE: This fixture pins the exact actor snapshot family used by runtime assembly.
const initialConsumerSnapshot = (): PreparedActorSnapshot<typeof IntegrationConsumerDefinition> =>
  Result.getOrThrow(
    prepareActorSnapshot(IntegrationConsumerMachine, {
      state: IntegrationConsumerDefinition.S.ready,
      memory: {},
      context: {
        providerState: IntegrationProviderDefinition.S.ready,
        providerChanged: false,
      },
      lifecycle: "prepared",
      operations: [],
      timers: [],
      issues: [],
      revision: 0,
      observedStoreRevision: 0,
    }),
  );

// RETURN_TYPE: This fixture pins the nested context snapshot family used by ticket forgery proofs.
const initialMutableContextConsumerSnapshot = (): PreparedActorSnapshot<
  typeof MutableContextConsumerDefinition
> =>
  Result.getOrThrow(
    prepareActorSnapshot(MutableContextConsumerMachine, {
      state: MutableContextConsumerDefinition.S.ready,
      memory: {},
      context: {
        providerState: { state: IntegrationProviderDefinition.S.ready },
        providerChanged: false,
      },
      lifecycle: "prepared",
      operations: [],
      timers: [],
      issues: [],
      revision: 0,
      observedStoreRevision: 0,
    }),
  );

const restoredStandaloneSnapshot = () =>
  Result.getOrThrow(
    prepareActorSnapshot(IntegrationStandaloneMachine, {
      state: IntegrationStandaloneDefinition.S.done,
      memory: {},
      context: {},
      lifecycle: "prepared",
      operations: [],
      timers: [],
      issues: [],
      revision: 9,
      observedStoreRevision: 6,
    }),
  );

const initialStandaloneSnapshot = (
  timers: {
    name: string;
    startedAt: number;
    dueAt: number;
  }[] = [],
) =>
  Result.getOrThrow(
    prepareActorSnapshot(IntegrationStandaloneMachine, {
      state: IntegrationStandaloneDefinition.S.ready,
      memory: {},
      context: {},
      lifecycle: "prepared",
      operations: [],
      timers,
      issues: [],
      revision: 0,
      observedStoreRevision: 0,
    }),
  );

const makeImplementation = (counts: { acquisitions: number; releases: number }) =>
  Implementation.effect(
    IntegrationServiceKey,
    Effect.acquireRelease(
      Effect.sync(() => {
        counts.acquisitions += 1;

        return { name: "runtime-integration" } as const;
      }),
      () =>
        Effect.sync(() => {
          counts.releases += 1;
        }),
    ),
  );

const sequenceOf = (record: {
  _tag: "turn" | "lifecycle";
  sequence?: number;
  evidenceSequence?: number;
}) => (record._tag === "turn" ? record.sequence : record.evidenceSequence);

describe("runtime assembly integration", () => {
  it.effect("rejects malformed prepared snapshots before registry or publication", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const ref = actorRef(IntegrationProviderMachine, "prepared-admission");
      const valid = initialProviderSnapshot();

      const forgedByDescriptor = new Proxy(
        { ...valid },
        {
          getOwnPropertyDescriptor(target, property) {
            const descriptor = Reflect.getOwnPropertyDescriptor(target, property);

            if (property === "state" && descriptor !== undefined && "value" in descriptor)
              return { ...descriptor, value: { forged: true } };

            return descriptor;
          },
        },
      );

      const malformed = [
        { ...valid },
        { ...valid, state: { forged: true } },
        { ...valid, lifecycle: "active" },
        { ...valid, context: { forged: true } },
        { ...valid, revision: -1 },
        forgedByDescriptor,
      ];

      let snapshots = 0;

      for (const snapshot of malformed) {
        const failed = yield* Effect.exit(
          assembly.createActor({
            ref,
            // SAFETY: This helper deliberately crosses the runtime's unknown-input negative-test boundary.
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- malformed prepared snapshot proof.
            initial: snapshot as PreparedActorSnapshot<typeof IntegrationProviderDefinition>,
            onSnapshot: () => {
              snapshots += 1;
            },
          }),
        );

        assert.ok(Exit.isFailure(failed));

        if (Exit.isFailure(failed)) {
          const reason = failed.cause.reasons.find(Cause.isFailReason);
          assert.ok(reason !== undefined);
          assert.strictEqual(reason.error.code, "InvariantViolation");
        }
      }

      assert.strictEqual(snapshots, 0);

      const actor = yield* assembly.createActor({ ref, initial: valid });
      assert.strictEqual(actor.engine.snapshot().state, IntegrationProviderDefinition.S.ready);
      yield* Effect.provideContext(actor.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("restores the exact prepared snapshot before the active lifecycle start", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const records: EvidenceRecord[] = [];

      const sink = yield* makeEvidenceSink({
        id: "runtime-restore-admission",
        capacity: 8,
        deliver: (record) => Effect.sync(() => records.push(record)),
      });

      assert.ok(Result.isSuccess(assembly.evidence.journal.attach(sink)));

      let snapshots = 0;
      let commands = 0;
      const ref = actorRef(IntegrationStandaloneMachine, "restored", { persist: true });
      const restored = restoredStandaloneSnapshot();

      const actor = yield* assembly.createActor({
        ref,
        restore: restored,
        restoredMachineTurnRevision: 3,
        onSnapshot: () => {
          snapshots += 1;
        },
        onCommand: () => {
          commands += 1;

          return Effect.void;
        },
      });

      const visible = actor.engine.snapshot();
      assert.strictEqual(actor.engine.machineTurnRevision(), 3);
      assert.strictEqual(actor.identity.ref.machine, IntegrationStandaloneMachine);
      assert.strictEqual(actor.identity.ref.persist, true);
      assert.strictEqual(visible.lifecycle, "active");
      assert.strictEqual(visible.state, restored.state);
      assert.strictEqual(visible.revision, restored.revision);
      assert.strictEqual(visible.observedStoreRevision, restored.observedStoreRevision);
      assert.deepStrictEqual(visible.memory, restored.memory);
      assert.deepStrictEqual(visible.context, restored.context);
      assert.deepStrictEqual(visible.operations, restored.operations);
      assert.deepStrictEqual(visible.timers, restored.timers);
      assert.deepStrictEqual(visible.issues, restored.issues);
      assert.strictEqual(snapshots, 0);
      assert.strictEqual(commands, 0);

      yield* assembly.evidence.journal.drain();

      const lifecycleRecords = records.filter(
        // RETURN_TYPE: The provenance conjunction leaves the lifecycle fields inaccessible without an explicit evidence-union predicate.
        (record): record is Extract<EvidenceRecord, { _tag: "lifecycle" }> =>
          record._tag === "lifecycle" && record.provenance.actor.key === actor.fence.key,
      );

      assert.strictEqual(lifecycleRecords.length, 2);
      assert.deepStrictEqual(
        lifecycleRecords.map((record) => [record.from, record.to]),
        [
          ["prepared", "prepared"],
          ["prepared", "active"],
        ],
      );
      assert.deepStrictEqual(lifecycleRecords[0]?.cause, { _tag: "restore" });

      yield* Effect.provideContext(actor.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("captures actor options before admission and preserves failed reservations", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const ref = actorRef(IntegrationStandaloneMachine, "stateful-options");

      const initial = Result.getOrThrow(
        prepareActorSnapshot(IntegrationStandaloneMachine, {
          state: IntegrationStandaloneDefinition.S.ready,
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

      let refDescriptorReads = 0;

      const unstable = new Proxy(
        { ref, initial },
        {
          getOwnPropertyDescriptor(target, property) {
            const descriptor = Reflect.getOwnPropertyDescriptor(target, property);

            if (property === "ref" && descriptor !== undefined && "value" in descriptor) {
              refDescriptorReads += 1;

              if (refDescriptorReads === 2)
                return { ...descriptor, value: actorRef(IntegrationStandaloneMachine, "forged") };
            }

            return descriptor;
          },
        },
      );

      const failed = yield* Effect.exit(assembly.createActor(unstable));
      assert.ok(Exit.isFailure(failed));

      const optionReads = new Map<string, number>();
      const committed: number[] = [];
      let snapshots = 0;
      let commands = 0;

      const store: ActorStore<typeof IntegrationStandaloneDefinition> = {
        commit: (actions) => {
          committed.push(actions.length);

          return Result.succeed({ revision: 1, changed: [] });
        },
      };

      const stableOptions = new Proxy(
        {
          ref,
          initial,
          input: undefined,
          store,
          onSnapshot: () => {
            snapshots += 1;
          },
          onCommand: () => {
            commands += 1;

            return Effect.void;
          },
          bindings: [] as const,
        },
        {
          get(target, property, receiver) {
            // oxlint-disable-next-line anti-slop/no-runtime-typeof -- this hostile proxy test counts only named actor-option properties.
            if (typeof property === "string" && property in target) {
              const reads = (optionReads.get(property) ?? 0) + 1;
              optionReads.set(property, reads);

              // oxlint-disable-next-line anti-slop/no-throw-in-effect-gen -- the proxy trap deliberately defects on a late caller-owned read.
              if (reads > 1) throw new Error(`late actor option read: ${property}`);
            }

            // oxlint-disable-next-line anti-slop/no-reflect-get -- the proxy test forwards an arbitrary property without widening the production boundary.
            return Reflect.get(target, property, receiver);
          },
        },
      );

      const actor = yield* assembly.createActor(stableOptions);

      for (const key of ["ref", "initial", "input", "store", "onSnapshot", "onCommand", "bindings"])
        assert.strictEqual(optionReads.get(key), 1);

      const dispatch = actor.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(dispatch.admitted, true);
      yield* Deferred.await(dispatch.completion);
      yield* actor.engine.drain();
      assert.deepStrictEqual(committed, [0]);
      assert.strictEqual(commands, 1);
      assert.strictEqual(snapshots, 1);
      assert.strictEqual(actor.engine.snapshot().state, IntegrationStandaloneDefinition.S.done);

      yield* Effect.provideContext(actor.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("sends through the real owner, context, store cut, evidence, and acknowledgement", () =>
    Effect.gen(function* () {
      const counts = { acquisitions: 0, releases: 0 };

      const runtime = runtimeSetup({
        app: IntegrationApp,
        implementation: makeImplementation(counts),
      }).construct();

      assert.strictEqual(runtime.app, IntegrationApp);
      assert.throws(() => runtimeOwner(runtime).assembly(), /Runtime is not ready/u);
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const records: Array<{ tag: string; sequence: number | undefined }> = [];

      const sink = yield* makeEvidenceSink({
        id: "runtime-integration",
        capacity: 16,
        deliver: (record) =>
          Effect.sync(() => records.push({ tag: record._tag, sequence: sequenceOf(record) })),
      });

      assert.ok(Result.isSuccess(assembly.evidence.journal.attach(sink)));

      const committed: number[] = [];

      const store: ActorStore<typeof IntegrationConsumerDefinition> = {
        commit: (actions) => {
          committed.push(actions.length);

          return Result.succeed({ revision: 1, changed: [] });
        },
      };

      const providerRef = actorRef(IntegrationProviderMachine, "provider");

      const provider = yield* assembly.createActor({
        ref: providerRef,
        initial: initialProviderSnapshot(),
      });

      const consumerRef = actorRef(IntegrationConsumerMachine, "consumer");

      const providerStateBinding = {
        slot: "providerState",
        provider: providerRef,
        providerFence: provider.fence,
        select: ({ state }) => state,
      } satisfies ActorContextBinding<
        typeof IntegrationConsumerDefinition,
        typeof IntegrationProviderDefinition,
        "providerState"
      >;

      const providerChangedBinding = {
        slot: "providerChanged",
        provider: providerRef,
        providerFence: provider.fence,
        select: ({ state }) => state === IntegrationProviderDefinition.S.changed,
      } satisfies ActorContextBinding<
        typeof IntegrationConsumerDefinition,
        typeof IntegrationProviderDefinition,
        "providerChanged"
      >;

      const commandSeen = yield* Deferred.make<void>();
      const consumerSnapshots: IntegrationConsumerSnapshot[] = [];

      const serviceObservations: Array<{
        evidenceHub: unknown;
        clock: Clock.Clock;
      }> = [];

      const actor = yield* assembly.createActor({
        ref: consumerRef,
        initial: initialConsumerSnapshot(),
        store,
        bindings: [providerStateBinding, providerChangedBinding],
        onSnapshot: (snapshot) => consumerSnapshots.push(snapshot),
        onCommand: () =>
          Effect.gen(function* () {
            const evidence = yield* Effect.service(RuntimeEvidence);
            const clock = yield* Effect.service(Clock.Clock);
            serviceObservations.push({
              evidenceHub: evidence.journal,
              clock,
            });
            yield* Deferred.succeed(commandSeen, undefined);
          }),
      });

      assert.strictEqual(
        actor.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.ready,
      );
      assert.strictEqual(actor.engine.snapshot().context.providerChanged, false);
      const providerDispatch = provider.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(providerDispatch.admitted, true);
      yield* Deferred.await(providerDispatch.completion);
      yield* provider.engine.drain();
      const providerAfter = provider.engine.snapshot();
      assert.strictEqual(providerAfter.state, IntegrationProviderDefinition.S.changed);
      yield* assembly.contextCoordinator.drain();
      yield* actor.engine.drain();
      assert.strictEqual(
        actor.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.changed,
      );
      assert.strictEqual(actor.engine.snapshot().context.providerChanged, true);
      assert.strictEqual(actor.engine.snapshot().revision, 1);
      assert.strictEqual(consumerSnapshots.length, 1);
      assert.strictEqual(consumerSnapshots[0]?.revision, 1);
      assert.strictEqual(
        consumerSnapshots[0]?.context.providerState,
        IntegrationProviderDefinition.S.changed,
      );
      assert.strictEqual(consumerSnapshots[0]?.context.providerChanged, true);

      const dispatch = actor.engine.dispatch(IntegrationConsumerEvent);
      assert.strictEqual(dispatch.admitted, true);
      const receipt = yield* Deferred.await(dispatch.completion);
      yield* Deferred.await(commandSeen);
      yield* actor.engine.drain();

      assert.deepStrictEqual(committed, [1]);
      assert.strictEqual(actor.engine.snapshot().state, IntegrationConsumerDefinition.S.done);
      assert.strictEqual(actor.engine.snapshot().revision, 2);
      assert.strictEqual(actor.engine.snapshot().observedStoreRevision, 1);
      assert.deepStrictEqual(receipt, {
        publicationRevision: 2,
        evidenceSequence: assembly.evidence.journal.sequence(),
      });
      assert.strictEqual(serviceObservations.length, 1);
      assert.strictEqual(serviceObservations[0]?.evidenceHub, assembly.evidence.journal);
      assert.strictEqual(serviceObservations[0]?.clock, Context.get(assembly.context, Clock.Clock));

      const suspended = yield* Effect.provideContext(
        actor.lifecycle.command({
          _tag: "actor:suspend",
          cause: { _tag: "attachment" },
        }),
        assembly.context,
      );

      assert.strictEqual(suspended.lifecycle, "suspended");
      assert.strictEqual(actor.engine.snapshot().lifecycle, "suspended");

      const providerFinalDispatch = provider.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(providerFinalDispatch.admitted, true);
      yield* Deferred.await(providerFinalDispatch.completion);
      yield* provider.engine.drain();
      yield* actor.engine.drain();
      assert.strictEqual(
        actor.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.changed,
      );
      assert.strictEqual(actor.engine.snapshot().context.providerChanged, true);

      const resumed = yield* Effect.provideContext(
        actor.lifecycle.command({
          _tag: "actor:resume",
          cause: { _tag: "attachment" },
        }),
        assembly.context,
      );

      assert.strictEqual(resumed.lifecycle, "active");
      assert.strictEqual(actor.engine.snapshot().lifecycle, "active");
      assert.strictEqual(actor.lifecycle.isRoutable(), true);
      assert.strictEqual(
        actor.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.final,
      );
      assert.strictEqual(actor.engine.snapshot().context.providerChanged, false);

      const providerBlocked = yield* Effect.exit(
        Effect.provideContext(
          provider.lifecycle.command({
            _tag: "actor:dispose",
            cause: { _tag: "owner-disposal" },
          }),
          assembly.context,
        ),
      );

      assert.ok(Exit.isFailure(providerBlocked));

      if (Exit.isFailure(providerBlocked)) {
        const reason = providerBlocked.cause.reasons[0];

        if (reason?._tag === "Fail") {
          assert.strictEqual(reason.error.code, "BlockedByDependents");
          assert.strictEqual(
            reason.error.details.dependentActors,
            `${actor.fence.key},${actor.fence.key}`,
          );
          assert.strictEqual(reason.error.details.bindingKeys, "providerState,providerChanged");
        }
      }

      const actorDisposed = yield* Effect.provideContext(actor.dispose(), assembly.context);
      const providerDisposed = yield* Effect.provideContext(provider.dispose(), assembly.context);
      const closed = yield* Effect.exit(runtimeOwner(runtime).close());
      assert.ok(actorDisposed === undefined);
      assert.ok(providerDisposed === undefined);
      assert.ok(Exit.isSuccess(closed));
      assert.strictEqual(counts.acquisitions, 1);
      assert.strictEqual(counts.releases, 1);
      assert.deepStrictEqual(
        records.map((record) => record.tag),
        [
          "lifecycle",
          "lifecycle",
          "turn",
          "turn",
          "lifecycle",
          "turn",
          "lifecycle",
          "lifecycle",
          "lifecycle",
        ],
      );
      assert.deepStrictEqual(
        records.map((record) => record.sequence),
        [1, 2, 3, 4, 5, 6, 7, 8, 9],
      );
    }),
  );

  it.effect("keeps failed store evidence anchored to the last committed snapshot", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const records: EvidenceRecord[] = [];

      const sink = yield* makeEvidenceSink({
        id: "runtime-store-failure",
        capacity: 16,
        deliver: (record) => Effect.sync(() => records.push(record)),
      });

      assert.ok(Result.isSuccess(assembly.evidence.journal.attach(sink)));

      const storeFailure = Failure({
        code: "InvariantViolation" as const,
        path: ["store", "commit"],
        details: { reason: "store-test" },
        summary: "Store commit failed.",
        help: "Retry after the store owner recovers.",
      });

      let failNextCommit = true;
      let commits = 0;

      const store: ActorStore<typeof IntegrationStandaloneDefinition> = {
        commit: () => {
          commits += 1;

          if (failNextCommit) {
            failNextCommit = false;

            return Result.fail(storeFailure);
          }

          return Result.succeed({ revision: 1, changed: [] });
        },
      };

      const actor = yield* assembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "store-failure"),
        initial: initialStandaloneSnapshot(),
        store,
      });

      const failedDispatch = actor.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(failedDispatch.admitted, true);
      const failedExit = yield* Effect.exit(Deferred.await(failedDispatch.completion));
      assert.ok(Exit.isFailure(failedExit));

      if (Exit.isFailure(failedExit)) {
        const reason = failedExit.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error, storeFailure);
      }

      yield* actor.engine.drain();
      yield* assembly.evidence.journal.drain();

      const turnRecords = records.filter((record) => record._tag === "turn");

      assert.strictEqual(commits, 1);
      assert.strictEqual(turnRecords.length, 1);
      const failedRecord = turnRecords[0];
      assert.ok(failedRecord !== undefined);
      assert.strictEqual(failedRecord.before.state, IntegrationStandaloneDefinition.S.ready);
      assert.strictEqual(failedRecord.after.state, IntegrationStandaloneDefinition.S.ready);
      assert.deepStrictEqual(failedRecord.after.issues, [storeFailure]);
      assert.strictEqual(failedRecord.publicationRevision, 1);
      assert.strictEqual(failedRecord.store.revision, 0);
      assert.strictEqual(failedRecord.machineTurnRevision, 0);
      assert.strictEqual(failedRecord.cause._tag, "event");

      const retryDispatch = actor.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(retryDispatch.admitted, true);
      const retryReceipt = yield* Deferred.await(retryDispatch.completion);
      yield* actor.engine.drain();
      yield* assembly.evidence.journal.drain();

      const allTurnRecords = records.filter((record) => record._tag === "turn");

      assert.strictEqual(commits, 2);
      assert.deepStrictEqual(retryReceipt, { publicationRevision: 2, evidenceSequence: 3 });
      assert.strictEqual(allTurnRecords.length, 2);
      const retriedRecord = allTurnRecords[1];
      assert.ok(retriedRecord !== undefined);
      assert.strictEqual(retriedRecord.before.state, IntegrationStandaloneDefinition.S.ready);
      assert.deepStrictEqual(retriedRecord.before.issues, [storeFailure]);
      assert.strictEqual(retriedRecord.after.state, IntegrationStandaloneDefinition.S.done);
      assert.strictEqual(retriedRecord.publicationRevision, 2);
      assert.strictEqual(retriedRecord.store.revision, 1);
      assert.strictEqual(retriedRecord.machineTurnRevision, 1);

      yield* Effect.provideContext(actor.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect(
    "projects lifecycle consistently through snapshot, stream, callback, and evidence",
    () =>
      Effect.gen(function* () {
        const runtime = runtimeSetup({ app: IntegrationApp }).construct();
        yield* runtime.ready();
        const assembly = runtimeOwner(runtime).assembly();
        const records: EvidenceRecord[] = [];

        const sink = yield* makeEvidenceSink({
          id: "runtime-visible-lifecycle",
          capacity: 16,
          deliver: (record) => Effect.sync(() => records.push(record)),
        });

        assert.ok(Result.isSuccess(assembly.evidence.journal.attach(sink)));

        const callbackSnapshots: ActorSnapshot<typeof IntegrationStandaloneDefinition>[] = [];

        const actor = yield* assembly.createActor({
          ref: actorRef(IntegrationStandaloneMachine, "visible-lifecycle"),
          initial: initialStandaloneSnapshot(),
          onSnapshot: (snapshot) => callbackSnapshots.push(snapshot),
        });

        assert.strictEqual(actor.engine.snapshot().lifecycle, "active");

        const streamFiber = yield* Effect.forkChild(
          Stream.take(actor.engine.snapshots, 2).pipe(Stream.runCollect),
          { startImmediately: true },
        );

        const dispatch = actor.engine.dispatch(IntegrationStandaloneEvent);
        assert.strictEqual(dispatch.admitted, true);
        yield* Deferred.await(dispatch.completion);
        yield* actor.engine.drain();
        const streamedSnapshots = yield* Fiber.join(streamFiber);
        assert.deepStrictEqual(
          streamedSnapshots.map((snapshot) => snapshot.lifecycle),
          ["active", "active"],
        );
        assert.deepStrictEqual(
          callbackSnapshots.map((snapshot) => snapshot.lifecycle),
          ["active"],
        );

        yield* assembly.evidence.journal.drain();

        const turnRecords = records.filter((record) => record._tag === "turn");

        assert.strictEqual(turnRecords.length, 1);
        const turn = turnRecords[0];
        assert.ok(turn !== undefined);
        assert.strictEqual(turn.before.lifecycle, "active");
        assert.strictEqual(turn.after.lifecycle, "active");
        assert.strictEqual(turn.after.state, IntegrationStandaloneDefinition.S.done);

        const visible = actor.engine.snapshot();
        assert.strictEqual(visible.lifecycle, "active");
        assert.strictEqual(callbackSnapshots[0]?.lifecycle, visible.lifecycle);
        assert.strictEqual(streamedSnapshots[0]?.lifecycle, visible.lifecycle);
        assert.strictEqual(turn.after.lifecycle, visible.lifecycle);

        yield* Effect.provideContext(actor.dispose(), assembly.context);
        yield* runtimeOwner(runtime).close();
      }),
  );

  it.effect("keeps a committed resumed actor routable after a lifecycle callback defect", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const records: EvidenceRecord[] = [];

      const sink = yield* makeEvidenceSink({
        id: "lifecycle-callback-defect",
        capacity: 16,
        deliver: (record) => Effect.sync(() => records.push(record)),
      });

      assert.ok(Result.isSuccess(assembly.evidence.journal.attach(sink)));
      let failNext = false;

      const actor = yield* assembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "lifecycle-callback-defect"),
        initial: initialStandaloneSnapshot(),
        onSnapshot: () => {
          if (!failNext) return;
          failNext = false;
          throw new Error("lifecycle callback defect");
        },
      });

      yield* Effect.provideContext(
        actor.lifecycle.command({ _tag: "actor:suspend", cause: { _tag: "attachment" } }),
        assembly.context,
      );
      failNext = true;

      const resumed = yield* Effect.exit(
        Effect.provideContext(
          actor.lifecycle.command({ _tag: "actor:resume", cause: { _tag: "attachment" } }),
          assembly.context,
        ),
      );

      assert.ok(Exit.isSuccess(resumed));
      assert.strictEqual(actor.engine.snapshot().lifecycle, "active");
      assert.strictEqual(actor.lifecycle.isRoutable(), true);
      const dispatch = actor.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(dispatch.admitted, true);
      yield* Deferred.await(dispatch.completion);
      yield* actor.engine.drain();
      yield* assembly.evidence.journal.drain();
      assert.ok(records.some((record) => record._tag === "lifecycle" && record.to === "active"));
      assert.strictEqual(actor.engine.snapshot().state, IntegrationStandaloneDefinition.S.done);

      yield* Effect.provideContext(actor.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("blocks assembled actor admission while suspend drains an in-flight command", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const commandStarted = yield* Deferred.make<void>();
      const commandRelease = yield* Deferred.make<void>();

      const actor = yield* assembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "routing-fence"),
        initial: initialStandaloneSnapshot(),
        onCommand: () =>
          Effect.gen(function* () {
            yield* Deferred.succeed(commandStarted, undefined);
            yield* Deferred.await(commandRelease);
          }),
      });

      const first = actor.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(first.admitted, true);
      yield* Deferred.await(commandStarted);

      const suspending = yield* Effect.forkChild(
        Effect.exit(
          Effect.provideContext(
            actor.lifecycle.command({
              _tag: "actor:suspend",
              cause: { _tag: "attachment" },
            }),
            assembly.context,
          ),
        ),
        { startImmediately: true },
      );

      yield* Effect.yieldNow;
      assert.strictEqual(actor.lifecycle.isRoutable(), false);
      const rejected = actor.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(rejected.admitted, false);
      yield* Deferred.succeed(commandRelease, undefined);
      yield* Deferred.await(first.completion);
      yield* actor.engine.drain();

      const suspended = yield* Fiber.join(suspending);
      assert.ok(Exit.isSuccess(suspended));
      assert.strictEqual(actor.engine.snapshot().lifecycle, "suspended");
      assert.strictEqual(actor.lifecycle.isRoutable(), false);

      yield* Effect.provideContext(actor.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("drains admitted work before publishing assembled disposal", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const records: EvidenceRecord[] = [];

      const sink = yield* makeEvidenceSink({
        id: "disposal-drain-race",
        capacity: 16,
        deliver: (record) => Effect.sync(() => records.push(record)),
      });

      assert.ok(Result.isSuccess(assembly.evidence.journal.attach(sink)));
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();

      const actor = yield* assembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "disposal-drain-race"),
        initial: initialStandaloneSnapshot(),
        onCommand: () =>
          Effect.gen(function* () {
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);
          }),
      });

      const admitted = actor.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(admitted.admitted, true);
      yield* Deferred.await(entered);

      const disposing = yield* Effect.forkChild(
        Effect.exit(Effect.provideContext(actor.dispose(), assembly.context)),
        { startImmediately: true },
      );

      yield* Effect.yieldNow;
      assert.strictEqual(actor.lifecycle.isRoutable(), false);
      assert.strictEqual(actor.engine.dispatch(IntegrationStandaloneEvent).admitted, false);
      assert.strictEqual(actor.engine.snapshot().lifecycle, "active");

      yield* Deferred.succeed(release, undefined);
      const accepted = yield* Deferred.await(admitted.completion);
      const disposed = yield* Fiber.join(disposing);
      assert.ok(Exit.isSuccess(disposed));
      assert.strictEqual(actor.engine.snapshot().lifecycle, "disposed");
      assert.strictEqual(actor.engine.snapshot().state, IntegrationStandaloneDefinition.S.done);
      assert.strictEqual(actor.engine.dispatch(IntegrationStandaloneEvent).admitted, false);
      yield* assembly.evidence.journal.drain();
      const turnIndex = records.findIndex((record) => record._tag === "turn");

      const disposeIndex = records.findIndex(
        (record) => record._tag === "lifecycle" && record.to === "disposed",
      );

      assert.ok(turnIndex >= 0 && disposeIndex > turnIndex);
      const turnRecord = records[turnIndex];
      assert.ok(turnRecord?._tag === "turn");
      assert.strictEqual(accepted.evidenceSequence, turnRecord.sequence);

      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("keeps assembled disposal gated when a public lifecycle command is invoked", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const finalizerEntered = yield* Deferred.make<void>();
      const finalizerRelease = yield* Deferred.make<void>();
      let finalizations = 0;

      const actor = yield* assembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "routing-gated-disposal"),
        initial: initialStandaloneSnapshot(),
        onCommand: () =>
          Effect.gen(function* () {
            const scope = yield* Effect.scope;

            yield* Scope.addFinalizer(
              scope,
              Effect.gen(function* () {
                finalizations += 1;
                yield* Deferred.succeed(finalizerEntered, undefined);
                yield* Deferred.await(finalizerRelease);
              }),
            );
          }),
      });

      const dispatched = actor.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(dispatched.admitted, true);
      yield* Deferred.await(dispatched.completion);
      yield* actor.engine.drain();

      const disposing = yield* Effect.forkChild(
        Effect.exit(Effect.provideContext(actor.dispose(), assembly.context)),
        { startImmediately: true },
      );

      yield* Deferred.await(finalizerEntered);
      assert.strictEqual(actor.lifecycle.isRoutable(), false);

      const publicCommand = yield* Effect.exit(
        Effect.provideContext(
          actor.lifecycle.command({
            _tag: "actor:dispose",
            cause: { _tag: "owner-disposal" },
          }),
          assembly.context,
        ),
      );

      assert.ok(Exit.isFailure(publicCommand));

      const rejected = actor.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(rejected.admitted, false);
      yield* Deferred.succeed(finalizerRelease, undefined);

      const disposed = yield* Fiber.join(disposing);
      assert.ok(Exit.isSuccess(disposed));
      assert.strictEqual(finalizations, 1);
      yield* runtimeOwner(runtime).close();
      assert.strictEqual(finalizations, 1);
    }),
  );

  it.effect("preserves provider truth when the real consumer mailbox is full", () =>
    Effect.gen(function* () {
      const counts = { acquisitions: 0, releases: 0 };

      const runtime = runtimeSetup({
        app: IntegrationApp,
        implementation: makeImplementation(counts),
      }).construct();

      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const providerRef = actorRef(IntegrationProviderMachine, "overflow-provider");

      const provider = yield* assembly.createActor({
        ref: providerRef,
        initial: initialProviderSnapshot(),
      });

      const providerStateBinding = {
        slot: "providerState",
        provider: providerRef,
        providerFence: provider.fence,
        select: ({ state }) => state,
      } satisfies ActorContextBinding<
        typeof IntegrationConsumerDefinition,
        typeof IntegrationProviderDefinition,
        "providerState"
      >;

      const providerChangedBinding = {
        slot: "providerChanged",
        provider: providerRef,
        providerFence: provider.fence,
        select: ({ state }) => state === IntegrationProviderDefinition.S.changed,
      } satisfies ActorContextBinding<
        typeof IntegrationConsumerDefinition,
        typeof IntegrationProviderDefinition,
        "providerChanged"
      >;

      const firstCommandStarted = yield* Deferred.make<void>();
      const releaseFirstCommand = yield* Deferred.make<void>();

      const consumer = yield* assembly.createActor({
        ref: actorRef(IntegrationConsumerMachine, "overflow-consumer"),
        initial: initialConsumerSnapshot(),
        bindings: [providerStateBinding, providerChangedBinding],
        onCommand: () =>
          Effect.gen(function* () {
            yield* Deferred.succeed(firstCommandStarted, undefined);
            yield* Deferred.await(releaseFirstCommand);
          }),
      });

      const first = consumer.engine.dispatch(IntegrationConsumerEvent);
      assert.strictEqual(first.admitted, true);
      yield* Deferred.await(firstCommandStarted);
      assert.strictEqual(consumer.engine.snapshot().state, IntegrationConsumerDefinition.S.done);
      assert.strictEqual(consumer.engine.snapshot().revision, 1);
      assert.strictEqual(
        consumer.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.ready,
      );

      for (let index = 0; index < ACTOR_MAILBOX_CAPACITY; index += 1)
        consumer.engine.send(IntegrationConsumerEvent);

      const overflow = consumer.engine.dispatchFact({
        _tag: "context-projection",
        provider: {
          fence: provider.fence,
          slot: "providerState",
          revision: 1,
          value: IntegrationProviderDefinition.S.changed,
        },
      });

      assert.ok(Result.isFailure(overflow));

      if (Result.isFailure(overflow)) {
        assert.strictEqual(overflow.failure.code, "InvariantViolation");
        assert.deepStrictEqual(overflow.failure.path, ["mailbox", "full"]);
        assert.strictEqual(overflow.failure.details.reason, "full");
      }

      const providerDispatch = provider.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(providerDispatch.admitted, true);
      yield* Deferred.await(providerDispatch.completion);
      yield* provider.engine.drain();
      assert.strictEqual(provider.engine.snapshot().state, IntegrationProviderDefinition.S.changed);
      assert.strictEqual(provider.engine.snapshot().revision, 1);
      assert.strictEqual(
        consumer.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.ready,
      );
      assert.strictEqual(consumer.engine.snapshot().context.providerChanged, false);
      assert.strictEqual(consumer.engine.snapshot().revision, 1);

      yield* Deferred.succeed(releaseFirstCommand, undefined);
      yield* consumer.engine.drain();
      assert.strictEqual(
        consumer.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.ready,
      );
      assert.strictEqual(consumer.engine.snapshot().context.providerChanged, false);

      yield* Effect.provideContext(
        consumer.lifecycle.command({
          _tag: "actor:suspend",
          cause: { _tag: "attachment" },
        }),
        assembly.context,
      );
      yield* Effect.provideContext(
        consumer.lifecycle.command({
          _tag: "actor:resume",
          cause: { _tag: "attachment" },
        }),
        assembly.context,
      );
      assert.strictEqual(
        consumer.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.changed,
      );
      assert.strictEqual(consumer.engine.snapshot().context.providerChanged, true);

      yield* Effect.provideContext(consumer.dispose(), assembly.context);
      yield* Effect.provideContext(provider.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
      assert.strictEqual(counts.acquisitions, 1);
      assert.strictEqual(counts.releases, 1);
    }),
  );

  it.effect("publishes one selector issue through the real context consumer", () =>
    Effect.gen(function* () {
      const counts = { acquisitions: 0, releases: 0 };

      const runtime = runtimeSetup({
        app: IntegrationApp,
        implementation: makeImplementation(counts),
      }).construct();

      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const evidenceRecords: EvidenceRecord[] = [];

      const sink = yield* makeEvidenceSink({
        id: "runtime-context-selector-defect",
        capacity: 16,
        deliver: (record) => Effect.sync(() => evidenceRecords.push(record)),
      });

      assert.ok(Result.isSuccess(assembly.evidence.journal.attach(sink)));

      const providerRef = actorRef(IntegrationProviderMachine, "selector-provider");

      const provider = yield* assembly.createActor({
        ref: providerRef,
        initial: initialProviderSnapshot(),
      });

      let shouldDefect = false;

      const selectorDiagnostic = Failure({
        code: "InvariantViolation" as const,
        path: ["context", "providerState"],
        details: { reason: "selector" },
        summary: "providerState selector failed",
        help: "Inspect the providerState selector.",
      });

      const providerStateBinding = {
        slot: "providerState",
        provider: providerRef,
        providerFence: provider.fence,
        select: ({ state }) => {
          // oxlint-disable-next-line anti-slop/no-throw-in-effect-gen -- this fixture proves selector defects remain issue-only context publications.
          if (shouldDefect) throw selectorDiagnostic;

          return state;
        },
      } satisfies ActorContextBinding<
        typeof IntegrationConsumerDefinition,
        typeof IntegrationProviderDefinition,
        "providerState"
      >;

      const providerChangedBinding = {
        slot: "providerChanged",
        provider: providerRef,
        providerFence: provider.fence,
        select: ({ state }) => state === IntegrationProviderDefinition.S.changed,
      } satisfies ActorContextBinding<
        typeof IntegrationConsumerDefinition,
        typeof IntegrationProviderDefinition,
        "providerChanged"
      >;

      const consumerSnapshots: IntegrationConsumerSnapshot[] = [];

      const actor = yield* assembly.createActor({
        ref: actorRef(IntegrationConsumerMachine, "selector-consumer"),
        initial: initialConsumerSnapshot(),
        bindings: [providerStateBinding, providerChangedBinding],
        onSnapshot: (snapshot) => consumerSnapshots.push(snapshot),
      });

      shouldDefect = true;
      const providerDispatch = provider.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(providerDispatch.admitted, true);
      yield* Deferred.await(providerDispatch.completion);
      yield* provider.engine.drain();
      yield* assembly.contextCoordinator.drain();
      yield* actor.engine.drain();

      assert.strictEqual(
        actor.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.ready,
      );
      assert.strictEqual(actor.engine.snapshot().context.providerChanged, false);
      assert.strictEqual(actor.engine.snapshot().revision, 1);
      assert.strictEqual(actor.engine.snapshot().issues.length, 1);
      assert.strictEqual(actor.engine.snapshot().issues[0], selectorDiagnostic);
      assert.deepStrictEqual(actor.engine.snapshot().issues[0], selectorDiagnostic);
      assert.strictEqual(consumerSnapshots.length, 1);
      assert.strictEqual(consumerSnapshots[0]?.revision, 1);
      assert.strictEqual(
        consumerSnapshots[0]?.context.providerState,
        IntegrationProviderDefinition.S.ready,
      );
      assert.strictEqual(consumerSnapshots[0]?.context.providerChanged, false);
      assert.strictEqual(consumerSnapshots[0]?.issues.length, 1);
      assert.strictEqual(consumerSnapshots[0]?.issues[0], selectorDiagnostic);

      yield* assembly.evidence.journal.drain();

      const selectorIssueRecords = evidenceRecords.filter(
        (record) => record._tag === "turn" && record.provenance.actor.key === actor.fence.key,
      );

      assert.strictEqual(selectorIssueRecords.length, 1);
      const selectorIssueRecord = selectorIssueRecords[0];

      if (selectorIssueRecord?._tag !== "turn")
        return yield* Effect.die(new Error("Expected selector issue turn evidence"));
      assert.strictEqual(selectorIssueRecord.machineTurnRevision, 0);
      assert.strictEqual(selectorIssueRecord.publicationRevision, 1);
      assert.strictEqual(selectorIssueRecord.store.changed.length, 0);
      assert.strictEqual(
        selectorIssueRecord.after.context.providerState,
        IntegrationProviderDefinition.S.ready,
      );
      assert.strictEqual(selectorIssueRecord.after.context.providerChanged, false);
      assert.strictEqual(selectorIssueRecord.after.issues.length, 1);
      assert.strictEqual(selectorIssueRecord.after.issues[0], selectorDiagnostic);
      assert.deepStrictEqual(selectorIssueRecord.after.issues[0], selectorDiagnostic);

      shouldDefect = false;
      const retry = provider.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(retry.admitted, true);
      yield* Deferred.await(retry.completion);
      yield* provider.engine.drain();
      yield* assembly.contextCoordinator.drain();
      yield* actor.engine.drain();

      assert.strictEqual(
        actor.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.final,
      );
      assert.strictEqual(actor.engine.snapshot().context.providerChanged, false);
      assert.strictEqual(actor.engine.snapshot().revision, 2);
      assert.strictEqual(actor.engine.snapshot().issues.length, 0);
      assert.strictEqual(actor.engine.snapshot().observedStoreRevision, 0);
      assert.strictEqual(consumerSnapshots.length, 2);
      assert.strictEqual(consumerSnapshots[1]?.revision, 2);
      assert.strictEqual(
        consumerSnapshots[1]?.context.providerState,
        IntegrationProviderDefinition.S.final,
      );
      assert.strictEqual(consumerSnapshots[1]?.issues.length, 0);

      yield* assembly.evidence.journal.drain();

      const consumerTurnRecords = evidenceRecords.filter(
        // RETURN_TYPE: The issue assertions need the turn envelope, which inference leaves unioned with lifecycle snapshots.
        (record): record is Extract<EvidenceRecord, { _tag: "turn" }> =>
          record._tag === "turn" && record.provenance.actor.key === actor.fence.key,
      );

      assert.strictEqual(
        consumerTurnRecords.filter((record) => record.after.issues.length === 1).length,
        1,
      );
      assert.strictEqual(
        consumerTurnRecords.filter((record) => record.after.issues.length === 0).length,
        0,
      );
      assert.strictEqual(
        actor.engine.snapshot().revision,
        selectorIssueRecord.publicationRevision + 1,
      );
      assert.strictEqual(actor.engine.machineTurnRevision(), 0);

      yield* Effect.provideContext(actor.dispose(), assembly.context);
      yield* Effect.provideContext(provider.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  // SETUP: Create one actor under a runtime with recording provider acquisition, release and evidence.
  // ACTION: Suspend, try a command, resume, complete a command, then close the runtime twice.
  // ASSERT: Suspended admission fails, resumed work commits, close is idempotent, the provider releases once, and lifecycle/turn evidence retains its order.
  it.effect("walkthrough: suspension rejects commands and resume restores admission", () =>
    Effect.gen(function* () {
      const counts = { acquisitions: 0, releases: 0 };

      const runtime = runtimeSetup({
        app: IntegrationApp,
        implementation: makeImplementation(counts),
      }).construct();

      yield* runtime.ready();
      const owner = runtimeOwner(runtime);
      const assembly = owner.assembly();
      const records: Array<{ tag: string; sequence: number | undefined }> = [];

      const sink = yield* makeEvidenceSink({
        id: "runtime-lifecycle-integration",
        capacity: 8,
        deliver: (record) =>
          Effect.sync(() => records.push({ tag: record._tag, sequence: sequenceOf(record) })),
      });

      assert.ok(Result.isSuccess(assembly.evidence.journal.attach(sink)));

      const actor = yield* assembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "lifecycle-actor"),
        initial: Result.getOrThrow(
          prepareActorSnapshot(IntegrationStandaloneMachine, {
            state: IntegrationStandaloneDefinition.S.ready,
            memory: {},
            context: {},
            lifecycle: "prepared",
            operations: [],
            timers: [],
            issues: [],
            revision: 0,
            observedStoreRevision: 0,
          }),
        ),
      });

      const suspended = yield* Effect.provideContext(
        actor.lifecycle.command({
          _tag: "actor:suspend",
          cause: { _tag: "attachment" },
        }),
        assembly.context,
      );

      assert.strictEqual(suspended.lifecycle, "suspended");
      assert.strictEqual(actor.lifecycle.currentLifecycle(), "suspended");
      assert.strictEqual(actor.engine.snapshot().lifecycle, "suspended");
      const suspendedDispatch = actor.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(suspendedDispatch.admitted, false);
      assert.ok(Exit.isFailure(yield* Effect.exit(Deferred.await(suspendedDispatch.completion))));

      const resumed = yield* Effect.provideContext(
        actor.lifecycle.command({
          _tag: "actor:resume",
          cause: { _tag: "attachment" },
        }),
        assembly.context,
      );

      assert.strictEqual(resumed.lifecycle, "active");
      assert.strictEqual(actor.lifecycle.currentLifecycle(), "active");
      assert.strictEqual(actor.engine.snapshot().lifecycle, "active");
      const resumedDispatch = actor.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(resumedDispatch.admitted, true);
      yield* Deferred.await(resumedDispatch.completion);
      yield* actor.engine.drain();
      assert.strictEqual(actor.engine.snapshot().state, IntegrationStandaloneDefinition.S.done);

      const firstClose = yield* Effect.exit(owner.close());
      const secondClose = yield* Effect.exit(owner.close());
      assert.ok(Exit.isSuccess(firstClose));
      assert.deepStrictEqual(secondClose, firstClose);
      assert.strictEqual((yield* actor.lifecycle.state()).lifecycle, "disposed");

      const postClose = yield* Effect.exit(
        assembly.createActor({
          ref: actorRef(IntegrationStandaloneMachine, "post-close-admission"),
          initial: initialStandaloneSnapshot(),
        }),
      );

      assert.ok(Exit.isFailure(postClose));

      if (Exit.isFailure(postClose)) {
        const reason = postClose.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error.code, "InvariantViolation");
        assert.deepStrictEqual(reason.error.path, ["mailbox", "closed"]);
      }

      assert.strictEqual(counts.acquisitions, 1);
      assert.strictEqual(counts.releases, 1);
      assert.deepStrictEqual(records, [
        { tag: "lifecycle", sequence: 1 },
        { tag: "lifecycle", sequence: 2 },
        { tag: "lifecycle", sequence: 3 },
        { tag: "turn", sequence: 4 },
        { tag: "lifecycle", sequence: 5 },
      ]);
    }),
  );

  it.effect("continues runtime cleanup after lifecycle evidence failure", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const providerRef = actorRef(IntegrationProviderMachine, "cleanup-provider");

      const provider = yield* assembly.createActor({
        ref: providerRef,
        initial: initialProviderSnapshot(),
      });

      const consumerRef = actorRef(IntegrationConsumerMachine, "cleanup-consumer");

      const binding = {
        slot: "providerState",
        provider: providerRef,
        providerFence: provider.fence,
        select: ({ state }) => state,
      } satisfies ActorContextBinding<
        typeof IntegrationConsumerDefinition,
        typeof IntegrationProviderDefinition,
        "providerState"
      >;

      const changedBinding = {
        slot: "providerChanged",
        provider: providerRef,
        providerFence: provider.fence,
        select: ({ state }) => state === IntegrationProviderDefinition.S.changed,
      } satisfies ActorContextBinding<
        typeof IntegrationConsumerDefinition,
        typeof IntegrationProviderDefinition,
        "providerChanged"
      >;

      const consumer = yield* assembly.createActor({
        ref: consumerRef,
        initial: initialConsumerSnapshot(),
        bindings: [binding, changedBinding],
      });

      assert.strictEqual((yield* provider.lifecycle.state()).attachment.dependencies.length, 2);

      const runtimeEvidence = Context.get(assembly.context, RuntimeEvidence);
      const originalAccept = runtimeEvidence.accept;

      const cleanupFailure = Failure({
        code: "InvariantViolation" as const,
        path: ["evidence", "accept"],
        details: { reason: "cleanup-test" },
        summary: "Lifecycle evidence acceptance failed.",
        help: "Retry cleanup after the evidence owner recovers.",
      });

      runtimeEvidence.accept = (record, preparation) =>
        record.after.fence.key === consumer.fence.key && record.after.lifecycle === "disposed"
          ? Effect.fail(cleanupFailure)
          : originalAccept(record, preparation);

      const firstDispose = yield* Effect.exit(
        Effect.provideContext(consumer.dispose(), assembly.context),
      );

      assert.ok(Exit.isFailure(firstDispose));

      if (Exit.isFailure(firstDispose)) {
        const reason = firstDispose.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error, cleanupFailure);
        assert.deepStrictEqual(reason.error.path, ["evidence", "accept"]);
      }

      assert.strictEqual(consumer.engine.snapshot().lifecycle, "disposed");
      assert.strictEqual((yield* consumer.lifecycle.state()).lifecycle, "disposed");
      assert.strictEqual(consumer.engine.dispatch(IntegrationConsumerEvent).admitted, false);
      assert.strictEqual((yield* provider.lifecycle.state()).attachment.dependencies.length, 0);

      runtimeEvidence.accept = originalAccept;

      const repeatedDispose = yield* Effect.exit(
        Effect.provideContext(consumer.dispose(), assembly.context),
      );

      assert.ok(Exit.isFailure(repeatedDispose));
      assert.deepStrictEqual(repeatedDispose, firstDispose);

      const recreated = yield* Effect.exit(
        assembly.createActor({
          ref: consumerRef,
          initial: initialConsumerSnapshot(),
          bindings: [binding, changedBinding],
        }),
      );

      assert.ok(Exit.isFailure(recreated));

      if (Exit.isFailure(recreated)) {
        const reason = recreated.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error.code, "DuplicateActorClaim");
      }

      yield* Effect.provideContext(provider.dispose(), assembly.context);
      const shutdown = yield* Effect.exit(runtimeOwner(runtime).close());
      assert.ok(Exit.isFailure(shutdown));
    }),
  );
});

describe("pending regression scenarios", () => {
  // Setup: Assemble provider P with active consumer C1 and suspended consumer C2, both bound to P; retain P's fence and C2's logical dependency edge.
  // Action: Attempt P.lifecycle.command({ _tag: "actor:dispose" }) and P's owner lease dispose; after each rejection dispatch P's advance event and resume C2.
  // Assert: Both attempts fail before mutation and identify every dependent actor ref and bound context key; P remains active and dispatchable, C1 receives the newest provider state, C2 resumes from its retained edge, and no tombstone or duplicate cleanup is emitted. Use separate route subcases so each begins with both active and suspended dependents.
  it.effect("rejected provider disposal leaves active and suspended dependents live", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const providerRef = actorRef(IntegrationProviderMachine, "guarded-provider", {
        persist: true,
      });

      const provider = yield* assembly.createActor({
        ref: providerRef,
        initial: initialProviderSnapshot(),
      });

      const makeBindings = () => {
        const providerStateBinding = {
          slot: "providerState",
          provider: providerRef,
          providerFence: provider.fence,
          select: ({ state }) => state,
        } satisfies ActorContextBinding<
          typeof IntegrationConsumerDefinition,
          typeof IntegrationProviderDefinition,
          "providerState"
        >;

        const providerChangedBinding = {
          slot: "providerChanged",
          provider: providerRef,
          providerFence: provider.fence,
          select: ({ state }) => state === IntegrationProviderDefinition.S.changed,
        } satisfies ActorContextBinding<
          typeof IntegrationConsumerDefinition,
          typeof IntegrationProviderDefinition,
          "providerChanged"
        >;

        return [providerStateBinding, providerChangedBinding];
      };

      const active = yield* assembly.createActor({
        ref: actorRef(IntegrationConsumerMachine, "active-dependent", { persist: true }),
        initial: initialConsumerSnapshot(),
        bindings: makeBindings(),
      });

      const suspended = yield* assembly.createActor({
        ref: actorRef(IntegrationConsumerMachine, "suspended-dependent", { persist: true }),
        initial: initialConsumerSnapshot(),
        bindings: makeBindings(),
      });

      const suspendedSnapshot = yield* Effect.provideContext(
        suspended.lifecycle.command({
          _tag: "actor:suspend",
          cause: { _tag: "attachment" },
        }),
        assembly.context,
      );

      assert.strictEqual(suspendedSnapshot.lifecycle, "suspended");

      const before = provider.engine.snapshot();

      const lifecycleRejected = yield* Effect.exit(
        Effect.provideContext(
          provider.lifecycle.command({
            _tag: "actor:dispose",
            cause: { _tag: "owner-disposal" },
          }),
          assembly.context,
        ),
      );

      assert.ok(Exit.isFailure(lifecycleRejected));

      if (Exit.isFailure(lifecycleRejected)) {
        const reason = lifecycleRejected.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error.code, "BlockedByDependents");
        assert.deepStrictEqual(reason.error.path, ["actorRef"]);
      }

      assert.strictEqual(provider.lifecycle.isRoutable(), true);
      assert.strictEqual(provider.lifecycle.currentLifecycle(), "active");
      assert.deepStrictEqual(provider.engine.snapshot(), before);
      assert.strictEqual(suspended.lifecycle.currentLifecycle(), "suspended");

      const leaseRejected = yield* Effect.exit(
        Effect.provideContext(provider.dispose(), assembly.context),
      );

      assert.ok(Exit.isFailure(leaseRejected));

      if (Exit.isFailure(leaseRejected)) {
        const reason = leaseRejected.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error.code, "BlockedByDependents");
        assert.deepStrictEqual(reason.error.path, ["actorRef"]);
        assert.deepStrictEqual(reason.error.details, {
          dependents: 4,
          dependentActors: `${active.fence.key},${active.fence.key},${suspended.fence.key},${suspended.fence.key}`,
          bindingKeys: "providerState,providerChanged,providerState,providerChanged",
        });
      }

      assert.strictEqual(provider.engine.snapshot().lifecycle, "active");
      assert.strictEqual(provider.engine.snapshot().revision, before.revision);
      assert.strictEqual(provider.lifecycle.isRoutable(), true);

      // The blocked lease attempt must retain the provider's Journal credit for the retry after
      // dependent edges are released; this probe uses the assembled production Journal.
      const retainedCreditProbe = assembly.evidence.journal.prepareLifecycle(provider.fence.key);
      assert.ok(Result.isSuccess(retainedCreditProbe));

      if (Result.isSuccess(retainedCreditProbe))
        assert.ok(Result.isSuccess(assembly.evidence.journal.cancel(retainedCreditProbe.success)));

      const dispatch = provider.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(dispatch.admitted, true);
      yield* Deferred.await(dispatch.completion);
      yield* provider.engine.drain();
      yield* assembly.contextCoordinator.drain();
      yield* active.engine.drain();
      assert.strictEqual(
        active.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.changed,
      );

      const resumed = yield* Effect.provideContext(
        suspended.lifecycle.command({
          _tag: "actor:resume",
          cause: { _tag: "attachment" },
        }),
        assembly.context,
      );

      assert.strictEqual(resumed.lifecycle, "active");
      yield* suspended.engine.drain();
      assert.strictEqual(
        suspended.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.changed,
      );

      yield* Effect.provideContext(active.dispose(), assembly.context);
      yield* Effect.provideContext(suspended.dispose(), assembly.context);
      const shutdown = yield* Effect.exit(runtimeOwner(runtime).close());
      assert.ok(Exit.isSuccess(shutdown));
    }),
  );

  // Setup: Extend the existing active actor fixture with a pre-existing snapshot stream, onSnapshot callback, getter read, and evidence sink; capture the active snapshot and revisions before suspension.
  // Action: Issue actor:suspend through the assembled lifecycle controller, drain the pre-existing stream, callback, getter read, and evidence, then subscribe a late stream and collect its replay.
  // Assert: Every observer and the late subscriber report suspended from one captured cut, the public revision advances exactly once, the machine-turn revision is unchanged, and the retained active snapshot remains unchanged.
  it.effect("publishes lifecycle transitions through one coherent snapshot cut", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const records: EvidenceRecord[] = [];
      const callbacks: ActorSnapshot<typeof IntegrationStandaloneDefinition>[] = [];

      const sink = yield* makeEvidenceSink({
        id: "lifecycle-coherent-cut",
        capacity: 16,
        deliver: (record) => Effect.sync(() => records.push(record)),
      });

      assert.ok(Result.isSuccess(assembly.evidence.journal.attach(sink)));

      const actor = yield* assembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "lifecycle-coherent-cut"),
        initial: initialStandaloneSnapshot(),
        onSnapshot: (snapshot) => callbacks.push(snapshot),
      });

      const before = actor.engine.snapshot();

      const existing = yield* Effect.forkChild(
        Stream.take(actor.engine.snapshots, 2).pipe(Stream.runCollect),
        { startImmediately: true },
      );

      yield* Effect.provideContext(
        actor.lifecycle.command({ _tag: "actor:suspend", cause: { _tag: "attachment" } }),
        assembly.context,
      );
      const current = actor.engine.snapshot();
      assert.strictEqual(current.lifecycle, "suspended");
      assert.strictEqual(current.revision, before.revision + 1);
      const streamed = yield* Fiber.join(existing);
      const late = yield* Stream.take(actor.engine.snapshots, 1).pipe(Stream.runCollect);
      yield* assembly.evidence.journal.drain();

      const lifecycle = records.filter(
        (record): record is Extract<EvidenceRecord, { _tag: "lifecycle" }> =>
          record._tag === "lifecycle" && record.to === "suspended",
      );

      assert.strictEqual(lifecycle.length, 1);
      assert.deepStrictEqual(
        streamed.map((snapshot) => snapshot.revision),
        [before.revision, current.revision],
      );
      assert.strictEqual(streamed[1], current);
      assert.strictEqual(streamed[1]?.lifecycle, "suspended");
      assert.strictEqual(late[0], current);
      assert.strictEqual(late[0]?.revision, current.revision);
      assert.strictEqual(late[0]?.lifecycle, "suspended");
      assert.notStrictEqual(callbacks.at(-1), current);
      assert.deepStrictEqual(callbacks.at(-1), current);
      assert.strictEqual(callbacks.at(-1)?.revision, current.revision);
      assert.strictEqual(callbacks.at(-1)?.lifecycle, "suspended");
      assert.strictEqual(lifecycle[0]?.publicationRevision, current.revision);
      assert.strictEqual(lifecycle[0]?.to, current.lifecycle);
      assert.strictEqual(before.lifecycle, "active");
      yield* Effect.provideContext(actor.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  // Setup: Create independent actors A and B in one assembled runtime and attach one evidence sink; leave B untouched while A processes one ordinary machine event.
  // Action: Drain A's turn evidence, suspend B, and drain the lifecycle evidence without resetting either actor or the runtime-global sequence allocator.
  // Assert: A's machine-turn revision advances only for A, B's suspend record retains B's prior machine-turn revision while its publication revision advances, and evidence sequences remain globally monotonic with actor-specific provenance.
  it.effect("F3 keeps lifecycle evidence machine-turn revision actor-local", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const records: EvidenceRecord[] = [];

      const sink = yield* makeEvidenceSink({
        id: "actor-local-machine-turn-revision",
        capacity: 16,
        deliver: (record) => Effect.sync(() => records.push(record)),
      });

      assert.ok(Result.isSuccess(assembly.evidence.journal.attach(sink)));

      const actorA = yield* assembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "machine-revision-a"),
        initial: initialStandaloneSnapshot(),
      });

      const actorB = yield* assembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "machine-revision-b"),
        initial: initialStandaloneSnapshot(),
      });

      const dispatched = actorA.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(dispatched.admitted, true);
      yield* Deferred.await(dispatched.completion);
      yield* actorA.engine.drain();

      yield* Effect.provideContext(
        actorB.lifecycle.command({
          _tag: "actor:suspend",
          cause: { _tag: "attachment" },
        }),
        assembly.context,
      );
      yield* assembly.evidence.journal.drain();

      const actorATurn = records.find(
        (record): record is Extract<EvidenceRecord, { _tag: "turn" }> =>
          record._tag === "turn" && record.provenance.actor.key === actorA.fence.key,
      );

      const actorBSuspend = records.find(
        (record): record is Extract<EvidenceRecord, { _tag: "lifecycle" }> =>
          record._tag === "lifecycle" &&
          record.provenance.actor.key === actorB.fence.key &&
          record.to === "suspended",
      );

      assert.ok(actorATurn !== undefined);
      assert.ok(actorBSuspend !== undefined);

      assert.strictEqual(actorATurn.machineTurnRevision, 1);
      assert.strictEqual(actorBSuspend.machineTurnRevision, 0);
      assert.ok(actorBSuspend.publicationRevision > 0);

      const sequences = records.map(sequenceOf);
      assert.deepStrictEqual(
        sequences,
        [...sequences].sort((left, right) => left! - right!),
      );
      assert.strictEqual(new Set(sequences).size, sequences.length);

      yield* Effect.provideContext(actorA.dispose(), assembly.context);
      yield* Effect.provideContext(actorB.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  // Setup: Run the assembled runtime's readiness and lifecycle operations under the provided TestClock with a known virtual time, then attach an evidence sink before lifecycle publication.
  // Action: Read the assembled Effect Clock and publish an actor lifecycle transition, then drain lifecycle evidence without consulting wall time.
  // Assert: The supplied Clock and LifecycleRecord timestamp equal the virtual clock value, and no Date.now epoch value appears in assembled lifecycle evidence.
  it.effect("uses the provided Effect Clock for assembled lifecycle evidence", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const records: EvidenceRecord[] = [];

      const sink = yield* makeEvidenceSink({
        id: "provided-clock-lifecycle",
        capacity: 8,
        deliver: (record) => Effect.sync(() => records.push(record)),
      });

      assert.ok(Result.isSuccess(assembly.evidence.journal.attach(sink)));

      const actor = yield* assembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "provided-clock"),
        initial: initialStandaloneSnapshot(),
      });

      const runtimeClock = Context.get(assembly.context, Clock.Clock);
      const expected = yield* Clock.currentTimeMillis;

      assert.strictEqual(yield* runtimeClock.currentTimeMillis, expected);
      yield* Effect.provideContext(
        actor.lifecycle.command({
          _tag: "actor:suspend",
          cause: { _tag: "attachment" },
        }),
        assembly.context,
      );
      yield* assembly.evidence.journal.drain();

      const lifecycle = records.find(
        (record) => record._tag === "lifecycle" && record.provenance.actor.key === actor.fence.key,
      );

      assert.ok(lifecycle !== undefined);
      assert.strictEqual(lifecycle.timestamp, expected);
      assert.ok(
        records.every((record) => record._tag !== "lifecycle" || record.timestamp < 10_000),
      );

      yield* Effect.provideContext(actor.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }).pipe(Effect.provide(TestClock.layer())),
  );

  // Setup: Create a persist-enabled stable actor in runtime R1, retain its ref, fence, and lease, and verify the actor is registered and active.
  // Action: Dispose the lease in R1, then assert a second `assembly.createActor` call for the same ref fails; construct and ready a separate runtime R2 and create the same stable ref there.
  // Assert: R1 retains a DisposedActorRef tombstone and the stale engine rejects dispatch, while R2 receives a fresh incarnation and can dispatch independently.
  it.effect("reuses a disposed stable ref only in a fresh runtime incarnation", () =>
    Effect.gen(function* () {
      const ref = actorRef(IntegrationStandaloneMachine, "fresh-incarnation", { persist: true });
      const firstRuntime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* firstRuntime.ready();
      const firstAssembly = runtimeOwner(firstRuntime).assembly();

      const first = yield* firstAssembly.createActor({
        ref,
        initial: initialStandaloneSnapshot(),
      });

      const firstKey = first.identity.key;
      const firstIncarnation = first.identity.incarnation;

      yield* Effect.provideContext(first.dispose(), firstAssembly.context);
      assert.strictEqual(first.engine.snapshot().lifecycle, "disposed");

      const stale = yield* Effect.exit(
        firstAssembly.createActor({ ref, initial: initialStandaloneSnapshot() }),
      );

      assert.ok(Exit.isFailure(stale));

      if (Exit.isFailure(stale)) {
        const reason = stale.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error.code, "DisposedActorRef");
      }

      yield* runtimeOwner(firstRuntime).close();

      const secondRuntime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* secondRuntime.ready();
      const secondAssembly = runtimeOwner(secondRuntime).assembly();

      const second = yield* secondAssembly.createActor({
        ref,
        initial: initialStandaloneSnapshot(),
      });

      assert.notStrictEqual(second.identity.key, firstKey);
      // Incarnation counters are runtime-local; the runtime nonce in the key scopes the new lifetime.
      assert.strictEqual(second.identity.incarnation, firstIncarnation);
      yield* Effect.provideContext(second.dispose(), secondAssembly.context);
      yield* runtimeOwner(secondRuntime).close();
    }),
  );

  // Setup: Admit stable ref S through the assembled runtime and capture its actor snapshot, fence, lease, and accepted evidence count.
  // Action: Call the actual assembled `assembly.createActor` method a second time for S with a distinct initial snapshot while the first actor remains active and dispatchable; leave shared stable ensure joining to the existing admission proof.
  // Assert: The second admission fails as DuplicateActorClaim before exposure, the original lease and snapshot remain unchanged and dispatchable, and no duplicate actor, edge, mailbox, or evidence record is created.
  it.effect("rejects duplicate stable create without replacing the existing lease", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const ref = actorRef(IntegrationStandaloneMachine, "duplicate-stable", { persist: true });

      const actor = yield* assembly.createActor({
        ref,
        initial: initialStandaloneSnapshot(),
      });

      const before = actor.engine.snapshot();

      const duplicate = yield* Effect.exit(
        assembly.createActor({ ref, initial: initialStandaloneSnapshot() }),
      );

      assert.ok(Exit.isFailure(duplicate));

      if (Exit.isFailure(duplicate)) {
        const reason = duplicate.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error.code, "DuplicateActorClaim");
      }

      assert.deepStrictEqual(actor.engine.snapshot(), before);

      const dispatch = actor.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(dispatch.admitted, true);
      yield* Deferred.await(dispatch.completion);
      yield* actor.engine.drain();
      assert.strictEqual(actor.engine.snapshot().state, IntegrationStandaloneDefinition.S.done);

      yield* Effect.provideContext(actor.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  // Setup: Gate the real leader after directory registration but before public exposure, then join one follower on the stable slot completion.
  // Action: Prove lookup is blind, interrupt the leader, await both shared terminal causes, then retry the same stable ref.
  // Assert: Pre-exposure abort preserves interruption, clears the slot without tombstoning, permits retry, and leaves runtime close successful.
  it.effect("aborts a registered unexposed leader without tombstoning its stable ref", () =>
    Effect.gen(function* () {
      const exposeGate = yield* Deferred.make<void>();
      const joinSignal = yield* Deferred.make<void>();
      const registered = yield* Deferred.make<void>();
      const pendingCleared = yield* Deferred.make<void>();
      let exposeAttempts = 0;

      const runtime = runtimeSetupForAdmissionTest({
        app: IntegrationApp,
        admissionProbe: {
          beforeExpose: Effect.gen(function* () {
            exposeAttempts += 1;

            if (exposeAttempts === 1) {
              yield* Deferred.succeed(registered, undefined);
              yield* Effect.interruptible(Deferred.await(exposeGate));
            }
          }),
          onJoin: () => Deferred.doneUnsafe(joinSignal, Effect.succeed(undefined)),
          onPendingCleared: () => Deferred.doneUnsafe(pendingCleared, Effect.succeed(undefined)),
        },
      }).construct();

      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const ref = actorRef(IntegrationStandaloneMachine, "registered-unexposed-abort", {
        persist: true,
      });

      const create = () => assembly.createActor({ ref, initial: initialStandaloneSnapshot() });

      const leader = yield* Effect.forkChild(create(), { startImmediately: true });
      yield* Deferred.await(registered);
      const follower = yield* Effect.forkChild(Effect.exit(create()), { startImmediately: true });
      yield* Deferred.await(joinSignal);

      const hidden = yield* Effect.exit(assembly.getActor(ref));
      assert.ok(Exit.isSuccess(hidden));

      if (Exit.isSuccess(hidden)) assert.strictEqual(hidden.value, undefined);

      yield* Effect.exit(Fiber.interrupt(leader));
      const leaderExit = yield* Fiber.await(leader);
      yield* Deferred.await(pendingCleared);
      const followerExit = yield* Fiber.join(follower);

      for (const terminal of [leaderExit, followerExit]) {
        assert.ok(Exit.isFailure(terminal));

        if (Exit.isFailure(terminal)) {
          assert.strictEqual(Cause.hasInterrupts(terminal.cause), true);
          assert.strictEqual(Cause.hasFails(terminal.cause), false);
          assert.strictEqual(terminal.cause.reasons.some(Cause.isFailReason), false);
        }
      }

      if (Exit.isFailure(leaderExit) && Exit.isFailure(followerExit))
        assert.deepStrictEqual(followerExit.cause, leaderExit.cause);
      assert.strictEqual(yield* assembly.getActor(ref), undefined);

      const retried = yield* create();
      assert.deepStrictEqual(retried.identity.ref, ref);
      assert.strictEqual(exposeAttempts, 2);
      const close = yield* Effect.exit(runtimeOwner(runtime).close());
      assert.ok(Exit.isSuccess(close));
    }),
  );

  // Setup: Gate a real actor after directory registration, then close its runtime owner before exposure can register the actor lifecycle.
  // Action: Release the exposure gate and await the original createActor result plus the directory pending-clear signal.
  // Assert: Lifecycle rejection remains RuntimeDisposed, adds no invariant failure, clears the unexposed slot, and does not tombstone the ref.
  it.effect("rolls back lifecycle rejection after internal registration", () =>
    Effect.gen(function* () {
      const exposeEntered = yield* Deferred.make<void>();
      const exposeGate = yield* Deferred.make<void>();
      const pendingCleared = yield* Deferred.make<void>();

      const runtime = runtimeSetupForAdmissionTest({
        app: IntegrationApp,
        admissionProbe: {
          beforeExpose: Effect.gen(function* () {
            yield* Deferred.succeed(exposeEntered, undefined);
            yield* Deferred.await(exposeGate);
          }),
          onPendingCleared: () => Deferred.doneUnsafe(pendingCleared, Effect.succeed(undefined)),
        },
      }).construct();

      yield* runtime.ready();
      const owner = runtimeOwner(runtime);
      const assembly = owner.assembly();

      const ref = actorRef(IntegrationStandaloneMachine, "lifecycle-rejection", {
        persist: true,
      });

      const leader = yield* Effect.forkChild(
        Effect.exit(assembly.createActor({ ref, initial: initialStandaloneSnapshot() })),
        { startImmediately: true },
      );

      yield* Deferred.await(exposeEntered);
      assert.ok(Exit.isSuccess(yield* Effect.exit(owner.close())));
      yield* Deferred.succeed(exposeGate, undefined);
      const terminal = yield* Fiber.join(leader);
      yield* Deferred.await(pendingCleared);
      assert.ok(Exit.isFailure(terminal));

      if (Exit.isFailure(terminal)) {
        const failures = terminal.cause.reasons.filter(Cause.isFailReason);
        assert.deepStrictEqual(
          failures.map((reason) => reason.error.code),
          ["RuntimeDisposed"],
        );
      }

      assert.strictEqual(yield* assembly.getActor(ref), undefined);
    }),
  );

  // Setup: Gate a real stable admission before exposure, join one follower, and make the pending-clear instrumentation throw synchronously.
  // Action: Release exposure, await both callers, look up the committed actor, and dispose it through the production runtime context.
  // Assert: Instrumentation cannot reverse committed exposure; leader, follower, lookup, disposal, and runtime close stay coherent.
  it.effect("keeps exposed admission coherent when pending-clear instrumentation throws", () =>
    Effect.gen(function* () {
      const exposeEntered = yield* Deferred.make<void>();
      const exposeGate = yield* Deferred.make<void>();
      const joinSignal = yield* Deferred.make<void>();
      let pendingClearNotifications = 0;

      const runtime = runtimeSetupForAdmissionTest({
        app: IntegrationApp,
        admissionProbe: {
          beforeExpose: Effect.gen(function* () {
            yield* Deferred.succeed(exposeEntered, undefined);
            yield* Deferred.await(exposeGate);
          }),
          onJoin: () => Deferred.doneUnsafe(joinSignal, Effect.succeed(undefined)),
          onPendingCleared: () => {
            pendingClearNotifications += 1;
            throwPendingClearProbe();
          },
        },
      }).construct();

      yield* runtime.ready();
      const owner = runtimeOwner(runtime);
      const assembly = owner.assembly();

      const ref = actorRef(IntegrationStandaloneMachine, "throwing-pending-clear", {
        persist: true,
      });

      const create = () =>
        Effect.exit(assembly.createActor({ ref, initial: initialStandaloneSnapshot() }));

      const leader = yield* Effect.forkChild(create(), { startImmediately: true });
      yield* Deferred.await(exposeEntered);
      const follower = yield* Effect.forkChild(create(), { startImmediately: true });
      yield* Deferred.await(joinSignal);
      yield* Deferred.succeed(exposeGate, undefined);
      const leaderExit = yield* Fiber.join(leader);
      const followerExit = yield* Fiber.join(follower);

      assert.ok(Exit.isSuccess(leaderExit));
      assert.ok(Exit.isSuccess(followerExit));
      assert.strictEqual(pendingClearNotifications, 1);

      if (Exit.isFailure(leaderExit) || Exit.isFailure(followerExit)) return;
      assert.strictEqual(followerExit.value, leaderExit.value);
      assert.strictEqual(yield* assembly.getActor(ref), leaderExit.value);
      yield* Effect.provideContext(leaderExit.value.dispose(), assembly.context);
      const disposedLookup = yield* Effect.exit(assembly.getActor(ref));
      assert.ok(Exit.isFailure(disposedLookup));

      if (Exit.isFailure(disposedLookup)) {
        const reason = disposedLookup.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error.code, "DisposedActorRef");
      }

      assert.ok(Exit.isSuccess(yield* Effect.exit(owner.close())));
    }),
  );

  // Setup: Gate one real ensureActor leader in preparation and wait until a second ensureActor call joins its stable Directory slot.
  // Action: Interrupt only the joined follower, prove the leader remains pending, then release preparation and await the leader.
  // Assert: The follower reports interruption while one leader completes every admission step once, owns lookup identity, and closes cleanly.
  it.effect("interrupts only a joined stable ensureActor follower", () =>
    Effect.gen(function* () {
      const prepareEntered = yield* Deferred.make<void>();
      const prepareGate = yield* Deferred.make<void>();
      const joinSignal = yield* Deferred.make<void>();
      const phases: RuntimeAdmissionPhase[] = [];
      let prepareAttempts = 0;
      let joined = 0;

      const runtime = runtimeSetupForAdmissionTest({
        app: IntegrationApp,
        admissionProbe: {
          beforePrepare: Effect.gen(function* () {
            prepareAttempts += 1;
            yield* Deferred.succeed(prepareEntered, undefined);
            yield* Effect.interruptible(Deferred.await(prepareGate));
          }),
          onPhase: (phase) => phases.push(phase),
          onJoin: () => {
            joined += 1;
            Deferred.doneUnsafe(joinSignal, Effect.succeed(undefined));
          },
        },
      }).construct();

      yield* runtime.ready();
      const owner = runtimeOwner(runtime);
      const assembly = owner.assembly();

      const ref = actorRef(IntegrationStandaloneMachine, "joined-ensure-follower", {
        persist: true,
      });

      const ensure = () => assembly.ensureActor(ref, { initial: initialStandaloneSnapshot() });

      const leader = yield* Effect.forkChild(Effect.exit(ensure()), { startImmediately: true });
      yield* Deferred.await(prepareEntered);
      const follower = yield* Effect.forkChild(Effect.exit(ensure()), { startImmediately: true });
      yield* Deferred.await(joinSignal);
      yield* Effect.exit(Fiber.interrupt(follower));
      const followerExit = yield* Fiber.await(follower);

      assert.ok(Exit.isFailure(followerExit));

      if (Exit.isFailure(followerExit)) {
        assert.strictEqual(Cause.hasInterrupts(followerExit.cause), true);
        assert.strictEqual(Cause.hasFails(followerExit.cause), false);
        assert.strictEqual(followerExit.cause.reasons.some(Cause.isFailReason), false);
      }

      assert.strictEqual(joined, 1);
      assert.strictEqual(prepareAttempts, 1);
      assert.deepStrictEqual(phases, ["reserve", "prepare"]);
      assert.strictEqual(yield* assembly.getActor(ref), undefined);

      yield* Deferred.succeed(prepareGate, undefined);
      const leaderExit = yield* Fiber.join(leader);
      assert.ok(Exit.isSuccess(leaderExit));

      if (Exit.isFailure(leaderExit)) return;
      assert.deepStrictEqual(phases, [
        "reserve",
        "prepare",
        "attach",
        "activate",
        "register",
        "expose",
      ]);
      assert.strictEqual(prepareAttempts, 1);
      assert.strictEqual(yield* assembly.getActor(ref), leaderExit.value);
      assert.ok(Exit.isSuccess(yield* Effect.exit(owner.close())));
    }),
  );

  // Setup: Ready one assembled runtime and pause the real leader immediately after its stable reservation enters prepare.
  // Action: Start two real follower admissions, interrupt only the reserved leader, and await every terminal result plus the owner-cleared signal.
  // Assert: Reservation rollback completes the followers with interruption, never DuplicateActorClaim, clears pending state, and allocates exactly one incarnation before retry.
  it.effect("rolls back an interrupted assembled admission leader", () =>
    Effect.gen(function* () {
      const prepareEntered = yield* Deferred.make<void>();
      const prepareGate = yield* Deferred.make<void>();
      const joinSignal = yield* Deferred.make<void>();
      const pendingCleared = yield* Deferred.make<void>();
      const allocations: Array<"incarnation" | "local-ordinal"> = [];
      const phases: RuntimeAdmissionPhase[] = [];
      let joined = 0;
      let prepareAttempts = 0;

      const runtime = runtimeSetupForAdmissionTest({
        app: IntegrationApp,
        admissionProbe: {
          beforePrepare: Effect.gen(function* () {
            prepareAttempts += 1;

            if (prepareAttempts === 1) {
              yield* Deferred.succeed(prepareEntered, undefined);
              yield* Effect.interruptible(Deferred.await(prepareGate));
            }
          }),
          onPhase: (phase) => phases.push(phase),
          onJoin: () => {
            joined += 1;

            if (joined === 2) Deferred.doneUnsafe(joinSignal, Effect.succeed(undefined));
          },
          onPendingCleared: () => Deferred.doneUnsafe(pendingCleared, Effect.succeed(undefined)),
          onAllocation: (kind) => allocations.push(kind),
        },
      }).construct();

      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const ref = actorRef(IntegrationStandaloneMachine, "interrupted-leader/reserved:1", {
        persist: true,
      });

      const create = () => assembly.createActor({ ref, initial: initialStandaloneSnapshot() });

      const leader = yield* Effect.forkChild(create(), { startImmediately: true });
      yield* Deferred.await(prepareEntered);

      const follower = yield* Effect.forkChild(create(), { startImmediately: true });
      const laterFollower = yield* Effect.forkChild(create(), { startImmediately: true });
      yield* Deferred.await(joinSignal);

      yield* Effect.exit(Fiber.interrupt(leader));
      const leaderExit = yield* Fiber.await(leader);
      yield* Deferred.await(pendingCleared);
      const followerExit = yield* Fiber.await(follower);
      const laterFollowerExit = yield* Fiber.await(laterFollower);

      for (const terminal of [leaderExit, followerExit, laterFollowerExit]) {
        assert.ok(Exit.isFailure(terminal));

        if (Exit.isFailure(terminal)) {
          assert.strictEqual(Cause.hasInterrupts(terminal.cause), true);
          assert.strictEqual(Cause.hasFails(terminal.cause), false);
        }
      }

      assert.deepStrictEqual(phases, ["reserve", "prepare"]);
      assert.deepStrictEqual(allocations, ["incarnation"]);

      const retried = yield* create();
      assert.strictEqual(retried.identity.incarnation, 2);
      assert.deepStrictEqual(allocations, ["incarnation", "incarnation"]);
      yield* Effect.provideContext(retried.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  // Setup: Ready one assembled runtime and install a finalizer on the newly acquired actor Scope during the first prepare attempt.
  // Action: Fail that prepare through the private test seam, retain its original failure, then retry the same real assembly admission.
  // Assert: The failed prepare closes its Scope exactly once and the later admission succeeds in the same runtime.
  it.effect("closes a prepared actor Scope on failure before retry", () =>
    Effect.gen(function* () {
      const scopeEntered = yield* Deferred.make<void>();
      let prepareAttempts = 0;
      let finalizations = 0;

      const prepareFailure = Failure({
        code: "InvariantViolation" as const,
        path: ["actorAdmission", "prepare"],
        details: { reason: "test-prepare-failure" },
        summary: "The prepared actor test failed before attachment.",
        help: "Retry the admission after the failed preparation is finalized.",
      });

      const runtime = runtimeSetupForAdmissionTest({
        app: IntegrationApp,
        admissionProbe: {
          afterPrepareScope: (scope) =>
            Effect.gen(function* () {
              prepareAttempts += 1;

              if (prepareAttempts !== 1) return;

              yield* Scope.addFinalizer(
                scope,
                Effect.sync(() => (finalizations += 1)),
              );
              yield* Deferred.succeed(scopeEntered, undefined);

              return yield* Effect.fail(prepareFailure);
            }),
        },
      }).construct();

      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const ref = actorRef(IntegrationStandaloneMachine, "prepare-scope/retry:1", {
        persist: true,
      });

      const first = yield* Effect.forkChild(
        assembly.createActor({ ref, initial: initialStandaloneSnapshot() }),
        { startImmediately: true },
      );

      yield* Deferred.await(scopeEntered);
      const firstExit = yield* Fiber.await(first);

      assert.ok(Exit.isFailure(firstExit));

      if (Exit.isFailure(firstExit)) {
        assert.strictEqual(Cause.hasFails(firstExit.cause), true);
        const reason = firstExit.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error, prepareFailure);
      }

      assert.strictEqual(finalizations, 1);

      const retried = yield* assembly.createActor({ ref, initial: initialStandaloneSnapshot() });
      assert.strictEqual(prepareAttempts, 2);

      yield* Effect.provideContext(retried.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
      assert.strictEqual(finalizations, 1);
    }),
  );

  // Setup: Build two independent test-owned runtime constructions for the same App before constructing them in reverse order.
  // Action: Admit one actor through each assembled runtime and observe each private probe's allocation and phase trace.
  // Assert: Construction ownership is per runtime; neither runtime can consume the other's probe instrumentation.
  it.effect("keeps admission test instrumentation isolated per runtime construction", () =>
    Effect.gen(function* () {
      const firstAllocations: Array<"incarnation" | "local-ordinal"> = [];
      const secondAllocations: Array<"incarnation" | "local-ordinal"> = [];
      const firstPhases: RuntimeAdmissionPhase[] = [];
      const secondPhases: RuntimeAdmissionPhase[] = [];

      const firstSetup = runtimeSetupForAdmissionTest({
        app: IntegrationApp,
        admissionProbe: {
          onAllocation: (kind) => firstAllocations.push(kind),
          onPhase: (phase) => firstPhases.push(phase),
        },
      });

      const secondSetup = runtimeSetupForAdmissionTest({
        app: IntegrationApp,
        admissionProbe: {
          onAllocation: (kind) => secondAllocations.push(kind),
          onPhase: (phase) => secondPhases.push(phase),
        },
      });

      const secondRuntime = secondSetup.construct();
      const firstRuntime = firstSetup.construct();
      yield* secondRuntime.ready();
      yield* firstRuntime.ready();

      const secondAssembly = runtimeOwner(secondRuntime).assembly();
      const firstAssembly = runtimeOwner(firstRuntime).assembly();

      const secondActor = yield* secondAssembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "probe-owner/second:1"),
        initial: initialStandaloneSnapshot(),
      });

      const firstActor = yield* firstAssembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "probe-owner/first:1"),
        initial: initialStandaloneSnapshot(),
      });

      assert.deepStrictEqual(firstAllocations, ["incarnation"]);
      assert.deepStrictEqual(secondAllocations, ["incarnation"]);
      assert.deepStrictEqual(firstPhases, [
        "reserve",
        "prepare",
        "attach",
        "activate",
        "register",
        "expose",
      ]);
      assert.deepStrictEqual(secondPhases, [
        "reserve",
        "prepare",
        "attach",
        "activate",
        "register",
        "expose",
      ]);

      yield* Effect.provideContext(secondActor.dispose(), secondAssembly.context);
      yield* Effect.provideContext(firstActor.dispose(), firstAssembly.context);
      yield* runtimeOwner(secondRuntime).close();
      yield* runtimeOwner(firstRuntime).close();
    }),
  );

  // Setup: Ready one assembled runtime with the real admission allocation observer and prepare malformed and valid stable options for the same ref.
  // Action: Submit malformed options first, then submit valid options through assembly.createActor.
  // Assert: Reflection validation fails before any incarnation or ordinal allocation; the valid stable admission allocates exactly one incarnation and exposes the actor.
  it.effect("validates malformed admission before stable allocation", () =>
    Effect.gen(function* () {
      const allocations: Array<"incarnation" | "local-ordinal"> = [];

      const runtime = runtimeSetupForAdmissionTest({
        app: IntegrationApp,
        admissionProbe: { onAllocation: (kind) => allocations.push(kind) },
      }).construct();

      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const ref = actorRef(IntegrationStandaloneMachine, "malformed-admission", { persist: true });

      const malformed = {
        ref,
        initial: initialStandaloneSnapshot(),
        bindings: [] as const,
      };

      Reflect.set(malformed, "bindings", {});

      const invalid = yield* Effect.exit(assembly.createActor(malformed));
      assert.ok(Exit.isFailure(invalid));

      if (Exit.isFailure(invalid)) {
        const reason = invalid.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error.code, "SchemaValidation");
        assert.deepStrictEqual(reason.error.path, ["actorAdmission"]);
        assert.deepStrictEqual(reason.error.details, { reason: "reflection" });
      }

      assert.deepStrictEqual(allocations, []);

      const actor = yield* assembly.createActor({ ref, initial: initialStandaloneSnapshot() });
      assert.deepStrictEqual(allocations, ["incarnation"]);
      assert.strictEqual(actor.identity.incarnation, 1);
      assert.strictEqual(
        actor.identity.key.endsWith(
          `/stable/${IntegrationStandaloneDefinition.id.length}:${IntegrationStandaloneDefinition.id}/${ref.id.length}:${ref.id}`,
        ),
        true,
      );

      yield* Effect.provideContext(actor.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("turns hostile overload proxies into typed admission failures", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();

      yield* runtime.ready();

      const assembly = runtimeOwner(runtime).assembly();
      const ref = actorRef(IntegrationStandaloneMachine, "hostile-overload");

      const hostileOptions = new Proxy(
        { ref, initial: initialStandaloneSnapshot() },
        {
          has() {
            // oxlint-disable-next-line anti-slop/no-throw-in-effect-gen -- the overload regression proof needs a hostile `in` trap.
            throw new Error("hostile has trap");
          },
          ownKeys() {
            // oxlint-disable-next-line anti-slop/no-throw-in-effect-gen -- runtime capture must convert reflection traps to diagnostics.
            throw new Error("hostile ownKeys trap");
          },
        },
      );

      const optionsFailure = yield* Effect.exit(assembly.ensureActor(hostileOptions));

      assert.ok(Exit.isFailure(optionsFailure));

      if (Exit.isFailure(optionsFailure)) {
        const reason = optionsFailure.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error.code, "SchemaValidation");
        assert.deepStrictEqual(reason.error.details, { reason: "reflection" });
      }

      const hostileMachine = new Proxy(IntegrationStandaloneMachine, {
        has() {
          // oxlint-disable-next-line anti-slop/no-throw-in-effect-gen -- the local overload regression proof supplies a throwing `in` trap.
          throw new Error("hostile machine has trap");
        },
      });

      const machineFailure = yield* Effect.exit(
        assembly.createActor(hostileMachine, { initial: initialStandaloneSnapshot() }),
      );

      assert.ok(Exit.isFailure(machineFailure));

      if (Exit.isFailure(machineFailure)) {
        const reason = machineFailure.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error.code, "SchemaValidation");
        assert.deepStrictEqual(reason.error.path, ["actorOptions", "machine"]);
      }

      yield* runtimeOwner(runtime).close();
    }),
  );

  // Setup: Ready one assembled runtime with deferred local allocation observation and malformed local options.
  // Action: Submit the malformed options through the machine-first local path, then admit a valid local actor.
  // Assert: Failed local validation leaves no allocation observation or consumed identity; the next valid local actor starts at the original incarnation and ordinal.
  it.effect("rolls back malformed local admission before allocation publication", () =>
    Effect.gen(function* () {
      const allocations: Array<"incarnation" | "local-ordinal"> = [];

      const runtime = runtimeSetupForAdmissionTest({
        app: IntegrationApp,
        admissionProbe: { onAllocation: (kind) => allocations.push(kind) },
      }).construct();

      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const malformed = {
        initial: initialStandaloneSnapshot(),
        bindings: [] as const,
      };

      Reflect.set(malformed, "bindings", {});

      const invalid = yield* Effect.exit(
        assembly.createActor(IntegrationStandaloneMachine, malformed),
      );

      assert.ok(Exit.isFailure(invalid));

      if (Exit.isFailure(invalid)) {
        const reason = invalid.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error.code, "SchemaValidation");
        assert.deepStrictEqual(reason.error.path, ["actorAdmission"]);
        assert.deepStrictEqual(reason.error.details, { reason: "reflection" });
      }

      assert.deepStrictEqual(allocations, []);

      const actor = yield* assembly.createActor(IntegrationStandaloneMachine, {
        initial: initialStandaloneSnapshot(),
      });

      assert.deepStrictEqual(allocations, ["incarnation", "local-ordinal"]);
      assert.strictEqual(actor.identity.incarnation, 1);
      assert.strictEqual(actor.identity.key.endsWith("/local/1"), true);
      yield* Effect.provideContext(actor.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  // Setup: Build delimiter-heavy stable refs for distinct machines, one real provider/consumer graph, and the production identity owner.
  // Action: Admit the graph through assembly.createActor, derive stable keys without reservation, and allocate one local identity.
  // Assert: Machine/ref tuple keys stay injective, provider edges stay separated, local keys are disjoint, and validation does not allocate.
  it.effect("keeps production stable ensure and local create lanes distinct", () =>
    Effect.gen(function* () {
      const allocations: Array<"incarnation" | "local-ordinal"> = [];

      const runtime = runtimeSetupForAdmissionTest({
        app: IntegrationApp,
        admissionProbe: { onAllocation: (kind) => allocations.push(kind) },
      }).construct();

      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const stableRef = actorRef(IntegrationStandaloneMachine, "production-stable", {
        persist: true,
      });

      const stable = yield* assembly.ensureActor(stableRef, {
        initial: initialStandaloneSnapshot(),
      });

      assert.strictEqual(stable.identity.ref.machine, stableRef.machine);
      assert.strictEqual(stable.identity.ref.id, stableRef.id);
      assert.strictEqual(stable.identity.ref.persist, true);
      assert.strictEqual(yield* assembly.getActor(stableRef), stable);

      const duplicate = yield* Effect.exit(
        assembly.ensureActor(stableRef, { initial: initialStandaloneSnapshot() }),
      );

      assert.ok(Exit.isFailure(duplicate));

      if (Exit.isFailure(duplicate)) {
        const reason = duplicate.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error.code, "DuplicateActorClaim");
      }

      const local = yield* assembly.createActor(IntegrationStandaloneMachine, {
        initial: initialStandaloneSnapshot(),
      });

      const secondLocal = yield* assembly.createActor(IntegrationStandaloneMachine, {
        initial: initialStandaloneSnapshot(),
      });

      assert.strictEqual(local.identity.ref.persist, false);
      const allocationsBeforeLocalEnsure = allocations.slice();

      const localEnsure = yield* Effect.exit(
        assembly.ensureActor(local.identity.ref, { initial: initialStandaloneSnapshot() }),
      );

      assert.ok(Exit.isFailure(localEnsure));

      if (Exit.isFailure(localEnsure)) {
        const reason = localEnsure.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error.code, "MissingActorRef");
        assert.deepStrictEqual(reason.error.details, { local: true, stable: false });
      }

      assert.deepStrictEqual(allocations, allocationsBeforeLocalEnsure);
      assert.strictEqual(secondLocal.identity.ref.persist, false);
      assert.notStrictEqual(local.identity.ref, secondLocal.identity.ref);
      assert.notStrictEqual(local.identity.key, secondLocal.identity.key);
      assert.strictEqual(secondLocal.identity.incarnation, local.identity.incarnation + 1);
      const opaqueLocalLookup = yield* Effect.exit(assembly.getActor(local.identity.ref));
      assert.ok(Exit.isFailure(opaqueLocalLookup));

      if (Exit.isFailure(opaqueLocalLookup)) {
        const reason = opaqueLocalLookup.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error.code, "MissingActorRef");
      }

      yield* Effect.provideContext(stable.dispose(), assembly.context);
      yield* Effect.provideContext(local.dispose(), assembly.context);
      yield* Effect.provideContext(secondLocal.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("keeps delimiter-heavy admission identity and provider keys separated", () =>
    Effect.gen(function* () {
      const allocations: Array<"incarnation" | "local-ordinal"> = [];

      const runtime = runtimeSetupForAdmissionTest({
        app: IntegrationApp,
        admissionProbe: { onAllocation: (kind) => allocations.push(kind) },
      }).construct();

      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const delimiterHeavyId = "machine/provider|consumer:/:1";

      const providerRef = actorRef(IntegrationProviderMachine, delimiterHeavyId, {
        persist: true,
      });

      const consumerRef = actorRef(IntegrationConsumerMachine, delimiterHeavyId, {
        persist: true,
      });

      const provider = yield* assembly.createActor({
        ref: providerRef,
        initial: initialProviderSnapshot(),
      });

      const providerStateBinding = {
        slot: "providerState",
        provider: providerRef,
        providerFence: provider.fence,
        select: ({ state }) => state,
      } satisfies ActorContextBinding<
        typeof IntegrationConsumerDefinition,
        typeof IntegrationProviderDefinition,
        "providerState"
      >;

      const providerChangedBinding = {
        slot: "providerChanged",
        provider: providerRef,
        providerFence: provider.fence,
        select: ({ state }) => state === IntegrationProviderDefinition.S.changed,
      } satisfies ActorContextBinding<
        typeof IntegrationConsumerDefinition,
        typeof IntegrationProviderDefinition,
        "providerChanged"
      >;

      const consumer = yield* assembly.createActor({
        ref: consumerRef,
        initial: initialConsumerSnapshot(),
        bindings: [providerStateBinding, providerChangedBinding],
      });

      const sameMachineOtherRef = yield* assembly.createActor({
        ref: actorRef(IntegrationProviderMachine, "machine/provider|consumer:/:2", {
          persist: true,
        }),
        initial: initialProviderSnapshot(),
      });

      assert.notStrictEqual(provider.identity.key, consumer.identity.key);
      assert.notStrictEqual(provider.identity.key, sameMachineOtherRef.identity.key);
      assert.deepStrictEqual(allocations, ["incarnation", "incarnation", "incarnation"]);

      const consumerState = yield* consumer.lifecycle.state();
      assert.strictEqual(consumerState.attachment.dependencies.length, 2);
      assert.ok(
        consumerState.attachment.dependencies.every(
          (edge) => edge.consumer === consumer.fence.key && edge.provider === provider.fence.key,
        ),
      );

      const identityAllocations: Array<"incarnation" | "local-ordinal"> = [];

      const registry = makeActorIdentityRegistry({
        onAllocate: (kind) => identityAllocations.push(kind),
      });

      const stableLeft = actorRef(IntegrationStandaloneMachine, "a/b:|c", { persist: true });
      const stableRight = actorRef(IntegrationStandaloneMachine, "a/b:|c/2", { persist: true });
      const leftKey = registry.stableKey(stableLeft, IntegrationStandaloneMachine);
      const rightKey = registry.stableKey(stableRight, IntegrationStandaloneMachine);

      assert.notStrictEqual(leftKey, rightKey);
      assert.deepStrictEqual(identityAllocations, []);

      const local = registry.createLocal(IntegrationStandaloneMachine);
      assert.ok(Result.isSuccess(local));

      if (Result.isSuccess(local)) {
        assert.notStrictEqual(leftKey, local.success.key);
        assert.notStrictEqual(rightKey, local.success.key);
        assert.strictEqual(local.success.key.includes("/local/"), true);
      }

      assert.deepStrictEqual(identityAllocations, ["incarnation", "local-ordinal"]);
      yield* Effect.provideContext(consumer.dispose(), assembly.context);
      yield* Effect.provideContext(provider.dispose(), assembly.context);
      yield* Effect.provideContext(sameMachineOtherRef.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  // TIM1: Assemble persisted timer projections through the runtime owner, interrupt the owner-held claim before its deadline, then resume after the deadline and let the same owner observe the overdue claim. The final resume must not replay the fired claim.
  it.effect("TIM1 assembled runtime owns interrupted and overdue timer claims", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const actor = yield* assembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "assembled-retained-timer"),
        initial: initialStandaloneSnapshot([
          { name: "assembled-refresh", startedAt: 0, dueAt: 100 },
        ]),
      });

      const started = yield* actor.lifecycle.state();
      assert.strictEqual(started.lifecycle, "active");
      assert.strictEqual(started.attachment.timers.length, 1);

      const suspendedAtStart = yield* Effect.provideContext(
        actor.lifecycle.command({
          _tag: "actor:suspend",
          cause: { _tag: "attachment" },
        }),
        assembly.context,
      );

      assert.strictEqual(suspendedAtStart.attachment.work.length, 0);

      const resumedBeforeDue = yield* Effect.provideContext(
        actor.lifecycle.command({
          _tag: "actor:resume",
          cause: { _tag: "attachment" },
        }),
        assembly.context,
      );

      assert.strictEqual(resumedBeforeDue.attachment.work.length, 1);

      yield* TestClock.adjust(10);

      const interrupted = yield* Effect.provideContext(
        actor.lifecycle.command({
          _tag: "actor:suspend",
          cause: { _tag: "attachment" },
        }),
        assembly.context,
      );

      assert.strictEqual(interrupted.attachment.work.length, 1);
      assert.strictEqual(interrupted.attachment.work[0]?.finalization, "done");

      yield* TestClock.adjust(90);

      const overdue = yield* Effect.provideContext(
        actor.lifecycle.command({
          _tag: "actor:resume",
          cause: { _tag: "attachment" },
        }),
        assembly.context,
      );

      const overdueWork = overdue.attachment.work[0];
      assert.ok(overdueWork !== undefined);
      const completed = yield* Fiber.await(overdueWork.fiber);
      assert.ok(Exit.isSuccess(completed));

      const suspendedAfterDue = yield* Effect.provideContext(
        actor.lifecycle.command({
          _tag: "actor:suspend",
          cause: { _tag: "attachment" },
        }),
        assembly.context,
      );

      assert.strictEqual(suspendedAfterDue.attachment.work[0]?.finalization, "done");

      const resumedAfterDue = yield* Effect.provideContext(
        actor.lifecycle.command({
          _tag: "actor:resume",
          cause: { _tag: "attachment" },
        }),
        assembly.context,
      );

      assert.deepStrictEqual(resumedAfterDue.attachment.work, []);
      assert.strictEqual(resumedAfterDue.attachment.timers[0]?.dueAt, 100);

      yield* runtimeOwner(runtime).close();
      assert.strictEqual((yield* actor.lifecycle.state()).lifecycle, "disposed");
    }).pipe(Effect.provide(TestClock.layer())),
  );

  // RET2: Use the assembled runtime owner with real actor scopes, a real evidence sink, and a registered provider failure. One close attempt releases actors, drains evidence, releases providers, and caches the complete Cause.
  it.effect("RET2 assembled runtime retains ordered shutdown Causes", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const order: string[] = [];
      const firstDefect = new Error("assembled-first-actor");
      const secondDefect = new Error("assembled-second-actor");
      const providerDefect = new Error("assembled-provider");
      const firstEntered = yield* Deferred.make<void>();
      const secondEntered = yield* Deferred.make<void>();

      const sink = yield* makeEvidenceSink({
        id: "assembled-ret2",
        capacity: 16,
        deliver: () => Effect.sync(() => order.push("sink-delivery")),
      });

      assert.ok(Result.isSuccess(assembly.evidence.journal.attach(sink)));

      const makeActorWithDefect = (id: string, defect: Error, entered: Deferred.Deferred<void>) =>
        assembly.createActor({
          ref: actorRef(IntegrationStandaloneMachine, id),
          initial: initialStandaloneSnapshot(),
          onCommand: () =>
            Effect.gen(function* () {
              const scope = yield* Effect.scope;
              yield* Scope.addFinalizer(
                scope,
                Effect.gen(function* () {
                  order.push(id);
                  // oxlint-disable-next-line anti-slop/no-expected-failure-as-defect -- this finalizer deliberately defects so runtime close proves full Cause retention.
                  yield* Effect.die(defect);
                }),
              );
              yield* Deferred.succeed(entered, undefined);
            }),
        });

      const first = yield* makeActorWithDefect("assembled-first", firstDefect, firstEntered);
      const second = yield* makeActorWithDefect("assembled-second", secondDefect, secondEntered);

      const firstDispatch = first.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(firstDispatch.admitted, true);
      yield* Deferred.await(firstDispatch.completion);
      yield* Deferred.await(firstEntered);
      yield* first.engine.drain();

      const secondDispatch = second.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(secondDispatch.admitted, true);
      yield* Deferred.await(secondDispatch.completion);
      yield* Deferred.await(secondEntered);
      yield* second.engine.drain();

      runtimeOwner(runtime).registerProvider(
        Effect.gen(function* () {
          order.push("provider");
          // oxlint-disable-next-line anti-slop/no-expected-failure-as-defect -- this provider deliberately defects so runtime close proves ordered defect-Cause retention.
          yield* Effect.die(providerDefect);
        }),
      );

      const shutdown = yield* Effect.exit(runtimeOwner(runtime).close());
      assert.ok(Exit.isFailure(shutdown));
      assert.deepStrictEqual(order.slice(0, 2), ["assembled-second", "assembled-first"]);
      assert.strictEqual(order.at(-1), "provider");
      assert.ok(order.slice(2, -1).length > 0);
      assert.ok(order.slice(2, -1).every((entry) => entry === "sink-delivery"));

      if (Exit.isFailure(shutdown)) {
        const defects = shutdown.cause.reasons
          .filter(Cause.isDieReason)
          .map((reason) => reason.defect);

        assert.deepStrictEqual(defects, [secondDefect, firstDefect, providerDefect]);
      }

      const retry = yield* Effect.exit(runtimeOwner(runtime).close());
      assert.ok(Exit.isFailure(retry));
      assert.deepStrictEqual(retry, shutdown);
      assert.strictEqual(order.filter((entry) => entry === "provider").length, 1);
    }),
  );

  // Setup: Assemble one real actor Scope whose finalizer fails during runtime shutdown and a real evidence sink.
  // Action: Close the runtime twice and inspect both terminal Exits and the release trace.
  // Assert: The first close retains the actor Cause and drains evidence before provider close; the second close returns the same cached Exit without replaying cleanup.
  it.effect("caches a failed assembled actor release before evidence close", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const order: string[] = [];
      const defect = new Error("terminal-assembled-actor");
      const entered = yield* Deferred.make<void>();

      const sink = yield* makeEvidenceSink({
        id: "assembled-retryable-release",
        capacity: 16,
        deliver: () => Effect.sync(() => order.push("sink-delivery")),
      });

      assert.ok(Result.isSuccess(assembly.evidence.journal.attach(sink)));

      const actor = yield* assembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "assembled-retryable-release"),
        initial: initialStandaloneSnapshot(),
        onCommand: () =>
          Effect.gen(function* () {
            const scope = yield* Effect.scope;
            yield* Scope.addFinalizer(
              scope,
              Effect.gen(function* () {
                order.push("actor-finalizer");
                yield* Deferred.succeed(entered, undefined);
                // oxlint-disable-next-line anti-slop/no-expected-failure-as-defect -- this one-shot finalizer defect proves the owner retains cleanup Cause.
                yield* Effect.die(defect);
              }),
            );
          }),
      });

      const dispatch = actor.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(dispatch.admitted, true);
      yield* Deferred.await(dispatch.completion);
      yield* actor.engine.drain();

      const first = yield* Effect.exit(runtimeOwner(runtime).close());
      assert.ok(Exit.isFailure(first));
      assert.deepStrictEqual(order.slice(0, 1), ["actor-finalizer"]);
      assert.strictEqual(Deferred.isDoneUnsafe(entered), true);

      if (Exit.isFailure(first)) {
        const defects = first.cause.reasons
          .filter(Cause.isDieReason)
          .map((reason) => reason.defect);

        assert.deepStrictEqual(defects, [defect]);
      }

      const second = yield* Effect.exit(runtimeOwner(runtime).close());
      assert.ok(Exit.isFailure(second));
      assert.deepStrictEqual(second, first);
      assert.strictEqual(order.filter((entry) => entry === "actor-finalizer").length, 1);
    }),
  );

  // Setup: Ready one assembled runtime, create an active actor, attach a gated real evidence sink, and retain the actor lease and runtime owner as concurrent disposal authorities.
  // Action: Hold the actor Scope finalizer at a Deferred, start actor lease disposal, start runtime close while that lease is active, then release the finalizer and sink delivery.
  // Assert: The two authorities share one actor cleanup, actor finalization precedes sink delivery and runtime close, and a completed actor is not replayed by runtime close.
  it.effect("linearizes actor lease disposal against runtime shutdown", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const order: string[] = [];
      const finalizerEntered = yield* Deferred.make<void>();
      const finalizerRelease = yield* Deferred.make<void>();
      const deliveryEntered = yield* Deferred.make<void>();
      const deliveryRelease = yield* Deferred.make<void>();

      const sink = yield* makeEvidenceSink({
        id: "actor-runtime-shutdown-race",
        capacity: 16,
        deliver: () =>
          Effect.gen(function* () {
            order.push("sink-delivery");
            yield* Deferred.succeed(deliveryEntered, undefined);
            yield* Deferred.await(deliveryRelease);
          }),
      });

      assert.ok(Result.isSuccess(assembly.evidence.journal.attach(sink)));

      const actor = yield* assembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "runtime-shutdown-race"),
        initial: initialStandaloneSnapshot(),
        onCommand: () =>
          Effect.gen(function* () {
            const scope = yield* Effect.scope;
            yield* Scope.addFinalizer(
              scope,
              Effect.gen(function* () {
                order.push("actor-finalizer");
                yield* Deferred.succeed(finalizerEntered, undefined);
                yield* Deferred.await(finalizerRelease);
              }),
            );
          }),
      });

      const dispatch = actor.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(dispatch.admitted, true);
      yield* Deferred.await(dispatch.completion);
      yield* actor.engine.drain();

      const actorClose = yield* Effect.forkChild(
        Effect.exit(Effect.provideContext(actor.dispose(), assembly.context)),
        { startImmediately: true },
      );

      yield* Deferred.await(finalizerEntered);

      const runtimeClose = yield* Effect.forkChild(Effect.exit(runtimeOwner(runtime).close()), {
        startImmediately: true,
      });

      yield* Effect.yieldNow;
      yield* Deferred.succeed(finalizerRelease, undefined);
      yield* Deferred.await(deliveryEntered);
      assert.deepStrictEqual(order.slice(0, 2), ["actor-finalizer", "sink-delivery"]);

      yield* Deferred.succeed(deliveryRelease, undefined);
      const actorExit = yield* Fiber.join(actorClose);
      const runtimeExit = yield* Fiber.join(runtimeClose);
      assert.ok(Exit.isSuccess(actorExit));
      assert.ok(Exit.isSuccess(runtimeExit));
      order.push("runtime-closed");
      assert.strictEqual(order[0], "actor-finalizer");
      assert.strictEqual(order.at(-1), "runtime-closed");
      assert.ok(order.slice(1, -1).every((entry) => entry === "sink-delivery"));
    }),
  );

  // Setup: Assemble one actor with a gated Scope finalizer and attach its real Journal sink; start
  // one owner disposal and one concurrent follower while the actor's terminal lifecycle credit is
  // still retained.
  // Action: Interrupt only the follower, start Journal close, then release the actor finalizer.
  // Assert: The follower reports interruption without releasing the actor credit, Journal close
  // waits for the owner outcome, and the assembled runtime closes after the same terminal result.
  it.effect("CREDIT-FOLLOWER preserves assembled actor credit during interrupted disposal", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const order: string[] = [];
      const finalizerEntered = yield* Deferred.make<void>();
      const finalizerRelease = yield* Deferred.make<void>();
      const finalizerCompleted = yield* Deferred.make<void>();

      const sink = yield* makeEvidenceSink({
        id: "assembled-credit-follower",
        capacity: 16,
        deliver: () => Effect.sync(() => order.push("sink-delivery")),
      });

      assert.ok(Result.isSuccess(assembly.evidence.journal.attach(sink)));

      const actor = yield* assembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "assembled-credit-follower"),
        initial: initialStandaloneSnapshot(),
        onCommand: () =>
          Effect.gen(function* () {
            const scope = yield* Effect.scope;
            yield* Scope.addFinalizer(
              scope,
              Effect.gen(function* () {
                order.push("actor-finalizer-entered");
                yield* Deferred.succeed(finalizerEntered, undefined);
                yield* Deferred.await(finalizerRelease);
                order.push("actor-finalizer-completed");
                yield* Deferred.succeed(finalizerCompleted, undefined);
              }),
            );
          }),
      });

      const dispatch = actor.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(dispatch.admitted, true);
      yield* Deferred.await(dispatch.completion);
      yield* actor.engine.drain();

      const leader = yield* Effect.forkChild(
        Effect.exit(Effect.provideContext(actor.dispose(), assembly.context)),
        { startImmediately: true },
      );

      yield* Deferred.await(finalizerEntered);

      const follower = yield* Effect.forkChild(
        Effect.exit(Effect.provideContext(actor.dispose(), assembly.context)),
        { startImmediately: true },
      );

      yield* Effect.exit(Fiber.interrupt(follower));
      const followerExit = yield* Fiber.await(follower);

      assert.ok(Exit.isFailure(followerExit));

      if (Exit.isFailure(followerExit))
        assert.strictEqual(Cause.hasInterrupts(followerExit.cause), true);

      const closing = yield* Effect.forkChild(Effect.exit(assembly.evidence.journal.close()), {
        startImmediately: true,
      });

      yield* Effect.yieldNow;
      assert.deepStrictEqual(order, ["actor-finalizer-entered"]);

      yield* Deferred.succeed(finalizerRelease, undefined);
      yield* Deferred.await(finalizerCompleted);
      const leaderExit = yield* Fiber.join(leader);
      const journalExit = yield* Fiber.join(closing);

      assert.ok(Exit.isSuccess(leaderExit));
      assert.ok(Exit.isSuccess(journalExit));
      assert.deepStrictEqual(order.slice(0, 2), [
        "actor-finalizer-entered",
        "actor-finalizer-completed",
      ]);
      assert.ok(order.slice(2).length > 0);
      assert.ok(order.slice(2).every((entry) => entry === "sink-delivery"));
      yield* runtimeOwner(runtime).close();
    }),
  );

  // Setup: Attach a real runtime evidence sink whose first delivery blocks, capture the accepted prefix, and start a Journal drain at that prefix.
  // Action: While delivery of the captured record is blocked, commit a newer provider turn, then release the first delivery.
  // Assert: The drain completes at the captured prefix, the newer record remains queued for the next drain, and sink delivery never blocks Journal acceptance.
  it.effect("drains a captured evidence prefix while newer runtime records arrive", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const delivered: number[] = [];
      const firstDeliveryEntered = yield* Deferred.make<void>();
      const firstDeliveryRelease = yield* Deferred.make<void>();
      let blockNextDelivery = false;

      const sink = yield* makeEvidenceSink({
        id: "evidence-prefix-concurrent",
        capacity: 16,
        deliver: (record) =>
          Effect.gen(function* () {
            if (record._tag !== "turn") return;

            delivered.push(record.sequence);

            if (!blockNextDelivery) return;
            blockNextDelivery = false;
            yield* Deferred.succeed(firstDeliveryEntered, undefined);
            yield* Deferred.await(firstDeliveryRelease);
          }),
      });

      assert.ok(Result.isSuccess(assembly.evidence.journal.attach(sink)));

      const actor = yield* assembly.createActor({
        ref: actorRef(IntegrationProviderMachine, "evidence-prefix-concurrent"),
        initial: initialProviderSnapshot(),
      });

      yield* assembly.evidence.journal.drain();
      delivered.length = 0;
      blockNextDelivery = true;

      const firstDispatch = actor.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(firstDispatch.admitted, true);
      yield* Deferred.await(firstDispatch.completion);
      yield* actor.engine.drain();
      const firstSequence = assembly.evidence.journal.sequence();

      const firstDrain = yield* Effect.forkChild(Effect.exit(assembly.evidence.journal.drain()), {
        startImmediately: true,
      });

      yield* Deferred.await(firstDeliveryEntered);

      const secondDispatch = actor.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(secondDispatch.admitted, true);
      yield* Deferred.await(secondDispatch.completion);
      yield* actor.engine.drain();
      const secondSequence = assembly.evidence.journal.sequence();
      assert.deepStrictEqual(delivered.length, 1);

      yield* Deferred.succeed(firstDeliveryRelease, undefined);
      const firstDrainExit = yield* Fiber.join(firstDrain);
      assert.ok(Exit.isSuccess(firstDrainExit));

      if (Exit.isSuccess(firstDrainExit)) {
        assert.strictEqual(firstDrainExit.value.through, firstSequence);
        assert.strictEqual(firstDrainExit.value.attachments[0]?.status, "drained");
      }

      const secondDrain = yield* assembly.evidence.journal.drain();
      assert.strictEqual(secondDrain.through, secondSequence);
      assert.deepStrictEqual(delivered, [firstSequence, secondSequence]);
      assert.strictEqual(secondDrain.attachments[0]?.status, "drained");

      yield* Effect.provideContext(actor.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  // SETUP: Assemble a real runtime with one actor, an attached bounded evidence sink whose deliver callback is gated, and an onCommand callback that records when user work begins.
  // ACTION: Dispatch one event and await its private acknowledgement before starting the evidence hub drain; then drain the sink and release its callback.
  // ASSERT: The receipt contains the committed publication/evidence sequence, user work has started after acknowledgement, sink delivery has not started before the explicit drain, and sink failure or delay cannot change the committed actor/store snapshot.
  it.effect("keeps sink delivery after the committed-turn acknowledgement", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const delivered: EvidenceRecord[] = [];
      let commandStarted = false;

      const sink = yield* makeEvidenceSink({
        id: "ack-before-sink",
        capacity: 16,
        deliver: (record) => Effect.sync(() => delivered.push(record)),
      });

      assert.ok(Result.isSuccess(assembly.evidence.journal.attach(sink)));

      const actor = yield* assembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "ack-before-sink"),
        initial: initialStandaloneSnapshot(),
        onCommand: () =>
          Effect.sync(() => {
            commandStarted = true;
          }),
      });

      const dispatched = actor.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(dispatched.admitted, true);
      const receipt = yield* Deferred.await(dispatched.completion);
      const committed = actor.engine.snapshot();
      assert.strictEqual(receipt.publicationRevision, committed.revision);
      assert.strictEqual(receipt.evidenceSequence, assembly.evidence.journal.sequence());
      assert.deepStrictEqual(delivered, []);
      yield* actor.engine.drain();
      assert.strictEqual(commandStarted, true);
      yield* assembly.evidence.journal.drain();
      assert.strictEqual(delivered.filter((record) => record._tag === "turn").length, 1);
      assert.strictEqual(actor.engine.snapshot(), committed);
      yield* Effect.provideContext(actor.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect(
    "retains all last-valid context slots through a sibling selector defect and recovers on a newer provider revision",
    () =>
      Effect.gen(function* () {
        const runtime = runtimeSetup({ app: IntegrationApp }).construct();
        yield* runtime.ready();
        const assembly = runtimeOwner(runtime).assembly();
        const providerRef = actorRef(IntegrationProviderMachine, "f4-provider");

        const provider = yield* assembly.createActor({
          ref: providerRef,
          initial: initialProviderSnapshot(),
        });

        const snapshots: IntegrationConsumerSnapshot[] = [];

        const consumer = yield* assembly.createActor({
          ref: actorRef(IntegrationConsumerMachine, "f4-consumer"),
          initial: initialConsumerSnapshot(),
          bindings: [
            {
              slot: "providerState",
              provider: providerRef,
              providerFence: provider.fence,
              select: ({ state }) =>
                state === IntegrationProviderDefinition.S.ready
                  ? IntegrationProviderDefinition.S.ready
                  : IntegrationProviderDefinition.S.changed,
            },
            {
              slot: "providerChanged",
              provider: providerRef,
              providerFence: provider.fence,
              select: ({ state }) => defectOnChanged(state),
            },
          ],
          onSnapshot: (snapshot) => snapshots.push(snapshot),
        });

        for (const state of [
          IntegrationProviderDefinition.S.changed,
          IntegrationProviderDefinition.S.final,
        ]) {
          const dispatched = provider.engine.dispatch(IntegrationProviderEvent);
          assert.strictEqual(dispatched.admitted, true);
          yield* Deferred.await(dispatched.completion);
          yield* provider.engine.drain();
          yield* assembly.contextCoordinator.drain();
          yield* consumer.engine.drain();
          assert.strictEqual(provider.engine.snapshot().state, state);

          if (state === IntegrationProviderDefinition.S.changed) {
            assert.strictEqual(
              consumer.engine.snapshot().context.providerState,
              IntegrationProviderDefinition.S.ready,
            );
            assert.strictEqual(consumer.engine.snapshot().context.providerChanged, false);
            assert.strictEqual(consumer.engine.snapshot().issues.length, 1);
          }
        }

        assert.strictEqual(
          consumer.engine.snapshot().context.providerState,
          IntegrationProviderDefinition.S.changed,
        );
        assert.strictEqual(consumer.engine.snapshot().context.providerChanged, false);
        assert.strictEqual(consumer.engine.snapshot().issues.length, 0);
        assert.strictEqual(snapshots.length, 2);
        yield* Effect.provideContext(consumer.dispose(), assembly.context);
        yield* Effect.provideContext(provider.dispose(), assembly.context);
        yield* runtimeOwner(runtime).close();
      }),
  );

  it.effect("propagates one diamond wave without an intermediate context cut", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const { a, b, c, d, bSnapshots, cSnapshots, dSnapshots } = yield* makeContextDiamond(
        assembly,
        "diamond",
      );

      type TicketAttestation = Parameters<typeof b.engine.dispatchContextTicket>[1];

      const offers: Array<{ key: string; attestation: TicketAttestation }> = [];

      for (const actor of [b, c, d]) {
        const actual = actor.engine.dispatchContextTicket;
        actor.engine.dispatchContextTicket = (fact, attestation) => {
          offers.push({ key: actor.fence.key, attestation });

          return actual(fact, attestation);
        };
      }

      const dispatched = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(dispatched.admitted, true);
      yield* Deferred.await(dispatched.completion);
      yield* a.engine.drain();
      const receipts = yield* assembly.contextCoordinator.drain();
      yield* d.engine.drain();
      assert.strictEqual(
        b.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.changed,
      );
      assert.strictEqual(c.engine.snapshot().context.providerChanged, true);
      assert.strictEqual(
        d.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.changed,
      );
      assert.strictEqual(d.engine.snapshot().context.providerChanged, true);
      assert.strictEqual(bSnapshots.length, 1);
      assert.strictEqual(cSnapshots.length, 1);
      assert.strictEqual(dSnapshots.length, 1);
      assert.strictEqual(receipts.length, 1);
      const receipt = receipts[0]!;
      assert.strictEqual(receipt.origin.fence.key, a.fence.key);
      assert.ok(receipt.origin.generation > 0);
      assert.strictEqual(receipt.vector.get(a.fence.key), receipt.origin.revision);
      assert.deepStrictEqual(
        [b, c, d].map((actor) => receipt.vector.get(actor.fence.key)),
        [0, 0, 0],
      );
      assert.strictEqual(offers.length, 3);

      for (const { key, attestation } of offers) {
        assert.deepStrictEqual(attestation.origin, receipt.origin);
        assert.strictEqual(attestation.graphGeneration, receipt.graphGeneration);
        assert.strictEqual(attestation.consumerFence.key, key);
        assert.ok(attestation.validate(attestation.origin, attestation.graphGeneration));

        const expected =
          key === d.fence.key
            ? [
                [b.fence.key, 1],
                [c.fence.key, 1],
              ]
            : [[a.fence.key, 1]];

        assert.deepStrictEqual([...attestation.requiredVector], expected);
      }

      assert.deepStrictEqual(
        [...receipt.outcomes.values()],
        ["published", "published", "published"],
      );
      yield* Effect.provideContext(d.dispose(), assembly.context);
      yield* Effect.provideContext(c.dispose(), assembly.context);
      yield* Effect.provideContext(b.dispose(), assembly.context);
      yield* Effect.provideContext(a.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("offers a healthy diamond sibling before awaiting a gated peer", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const bStarted = yield* Deferred.make<void>();
      const releaseB = yield* Deferred.make<void>();
      const cPublished = yield* Deferred.make<void>();

      const { a, b, c, d, dSnapshots } = yield* makeContextDiamond(assembly, "gated-siblings", {
        bOnCommand: () =>
          Effect.gen(function* () {
            yield* Deferred.succeed(bStarted, undefined);
            yield* Deferred.await(releaseB);
          }),
        cOnSnapshot: (snapshot) => {
          if (snapshot.context.providerState === IntegrationProviderDefinition.S.changed)
            Deferred.doneUnsafe(cPublished, Effect.void);
        },
      });

      const held = b.engine.dispatch(IntegrationConsumerEvent);
      assert.strictEqual(held.admitted, true);
      yield* Deferred.await(bStarted);
      const published = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(published.admitted, true);
      yield* Deferred.await(published.completion);
      yield* Deferred.await(cPublished);
      assert.strictEqual(
        c.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.changed,
      );
      assert.strictEqual(
        b.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.ready,
      );
      assert.strictEqual(dSnapshots.length, 0);

      yield* Deferred.succeed(releaseB, undefined);
      yield* Deferred.await(held.completion);
      yield* assembly.contextCoordinator.drain();
      assert.strictEqual(dSnapshots.length, 1);
      assert.strictEqual(
        d.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.changed,
      );
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("isolates one full context dependent while preserving a healthy fanout peer", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();

      const { a, b, c, d, cSnapshots } = yield* makeContextDiamond(assembly, "fanout", {
        cOnSnapshot: () => {},
        bOnCommand: () =>
          Effect.gen(function* () {
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(release);
          }),
      });

      const executing = b.engine.dispatch(IntegrationConsumerEvent);
      assert.strictEqual(executing.admitted, true);
      yield* Deferred.await(started);
      yield* assembly.contextCoordinator.drain();

      for (let index = 0; index < ACTOR_MAILBOX_CAPACITY; index += 1)
        assert.strictEqual(b.engine.dispatch(IntegrationConsumerEvent).admitted, true);

      const first = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(first.admitted, true);
      yield* Deferred.await(first.completion);
      yield* a.engine.drain();
      const firstReceipts = yield* assembly.contextCoordinator.drain();
      assert.strictEqual(firstReceipts.length, 1);
      assert.strictEqual(firstReceipts[0]?.outcomes.get(b.fence.key), "rejected");
      assert.strictEqual(firstReceipts[0]?.outcomes.get(c.fence.key), "published");
      assert.strictEqual(firstReceipts[0]?.outcomes.get(d.fence.key), "blocked");
      const failure = firstReceipts[0]?.failures.get(b.fence.key);
      assert.strictEqual(failure?.code, "InvariantViolation");
      assert.deepStrictEqual(failure?.path, ["mailbox", "full"]);
      assert.strictEqual(
        b.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.ready,
      );
      assert.strictEqual(
        c.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.changed,
      );
      assert.strictEqual(cSnapshots.length, 1);
      assert.strictEqual(
        d.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.ready,
      );
      assert.strictEqual(d.engine.snapshot().context.providerChanged, false);
      yield* Deferred.succeed(release, undefined);
      yield* b.engine.drain();
      const second = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(second.admitted, true);
      yield* Deferred.await(second.completion);
      yield* a.engine.drain();
      yield* assembly.contextCoordinator.drain();
      assert.strictEqual(
        b.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.final,
      );
      assert.strictEqual(
        c.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.final,
      );
      assert.strictEqual(
        d.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.final,
      );
      yield* Effect.provideContext(d.dispose(), assembly.context);
      yield* Effect.provideContext(c.dispose(), assembly.context);
      yield* Effect.provideContext(b.dispose(), assembly.context);
      yield* Effect.provideContext(a.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  // Setup: Assemble a provider/consumer pair and suspend the consumer; use the new selected internal ContextCoordinator reconciliation capability introduced by this refactor, decorated with a Deferred while delegating the real production projection path.
  // Action: Change the provider while the consumer is suspended, start consumer resume, attempt send while reconciliation is gated, then release the projection and await resume.
  // Assert: Send rejects while reconciliation is pending; the same ref/handle resumes only after one current complete context cut is committed. Failed reconciliation rolls back newly acquired attachments and stays suspended. The capability is an internal production seam, not a public test-only hook.
  it.todo("keeps admission closed until resume reconciliation commits");

  // Setup: Create and dispose multiple real actors through assembly in one live runtime; decorate the new selected internal ActorInstance.make acquisition capability so it delegates actual mailbox/subscription acquisition and records a Scope finalizer.
  // Action: Await each actor lease disposal before creating the next actor, observe its real lifetime release, then close the runtime.
  // Assert: Actual actor fibers/registrations and the delegated acquisition finalizer release before each disposal returns, each finalizer runs once, and runtime close does not replay completed actor cleanup. Do not replace acquisition with a fabricated owner, use a public test hook, or query garbage collection.
  it.effect("releases each actor lifetime before runtime shutdown", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const finalizers: string[] = [];

      for (const [index, id] of ["one", "two", "three"].entries()) {
        const actor = yield* assembly.createActor({
          ref: actorRef(IntegrationStandaloneMachine, `actor-lifetime-finalizer-${id}`),
          initial: initialStandaloneSnapshot(),
          onCommand: () =>
            Effect.gen(function* () {
              const scope = yield* Effect.scope;
              yield* Scope.addFinalizer(
                scope,
                Effect.sync(() => finalizers.push(id)),
              );
            }),
        });

        const dispatch = actor.engine.dispatch(IntegrationStandaloneEvent);
        assert.strictEqual(dispatch.admitted, true);
        yield* Deferred.await(dispatch.completion);
        yield* actor.engine.drain();
        assert.strictEqual(finalizers.length, index);

        yield* Effect.provideContext(actor.dispose(), assembly.context);
        assert.strictEqual(finalizers.at(-1), id);
      }

      yield* runtimeOwner(runtime).close();
      assert.deepStrictEqual(finalizers, ["one", "two", "three"]);
    }),
  );

  it.effect("holds diamond descendants when an upstream context delivery is rejected", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();

      const { a, b, c, d, dSnapshots } = yield* makeContextDiamond(assembly, "blocked", {
        cOnSnapshot: () => {},
        bOnCommand: () =>
          Effect.gen(function* () {
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(release);
          }),
      });

      const f = yield* assembly.createActor({
        ref: actorRef(IntegrationConsumerMachine, "blocked-f"),
        initial: initialConsumerSnapshot(),
        bindings: [
          {
            slot: "providerState",
            provider: c.identity.ref,
            providerFence: c.fence,
            select: ({ context }) => context.providerState,
          },
          {
            slot: "providerChanged",
            provider: c.identity.ref,
            providerFence: c.fence,
            select: ({ context }) => context.providerChanged,
          },
        ],
      });

      assert.strictEqual(b.engine.dispatch(IntegrationConsumerEvent).admitted, true);
      yield* Deferred.await(started);
      yield* assembly.contextCoordinator.drain();

      for (let index = 0; index < ACTOR_MAILBOX_CAPACITY; index += 1)
        assert.strictEqual(b.engine.dispatch(IntegrationConsumerEvent).admitted, true);

      const first = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(first.admitted, true);
      yield* Deferred.await(first.completion);
      yield* a.engine.drain();
      const receipts = yield* assembly.contextCoordinator.drain();
      assert.strictEqual(receipts[0]?.outcomes.get(b.fence.key), "rejected");
      assert.strictEqual(receipts[0]?.outcomes.get(d.fence.key), "blocked");
      assert.strictEqual(
        f.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.changed,
      );
      assert.strictEqual(dSnapshots.length, 0);
      yield* Deferred.succeed(release, undefined);
      yield* b.engine.drain();
      const unrelated = c.engine.dispatch(IntegrationConsumerEvent);
      assert.strictEqual(unrelated.admitted, true);
      yield* Deferred.await(unrelated.completion);
      yield* c.engine.drain();
      yield* assembly.contextCoordinator.drain();
      assert.strictEqual(
        d.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.ready,
      );
      assert.strictEqual(dSnapshots.length, 0);
      const second = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(second.admitted, true);
      yield* Deferred.await(second.completion);
      yield* a.engine.drain();
      yield* assembly.contextCoordinator.drain();
      assert.strictEqual(
        d.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.final,
      );
      assert.strictEqual(d.engine.snapshot().context.providerChanged, false);
      assert.strictEqual(dSnapshots.length, 1);
      yield* Effect.provideContext(f.dispose(), assembly.context);
      yield* Effect.provideContext(d.dispose(), assembly.context);
      yield* Effect.provideContext(c.dispose(), assembly.context);
      yield* Effect.provideContext(b.dispose(), assembly.context);
      yield* Effect.provideContext(a.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  // Setup: Construct a machine, add an allowed descriptor before app construction, build the app, then mutate exposed machine definition, compiled containers, and plan arrays afterward.
  // Action: Admit and dispatch an actor through that app, then construct a second app from the current authored inputs.
  // Assert: The first runtime uses its captured app-time identities and compiled behavior, including the descriptor added before construction; mutations cannot change its admitted vocabulary, and the second app independently captures its own current inputs.
  it.effect("uses app-time machine facts despite later exposed-container mutation", () =>
    Effect.gen(function* () {
      const plan = appPlan(IntegrationApp);
      const exposedMachines = plan.machines;
      const exposedDescriptors = plan.descriptors;
      const originalMachines = [...exposedMachines];
      const originalDescriptors = [...exposedDescriptors];

      // SAFETY: this fixture mutates only the exposed operations container to prove app-time copying.
      const definition = IntegrationStandaloneMachine.definition as {
        operations: typeof IntegrationStandaloneMachine.definition.operations;
      };

      // SAFETY: this fixture mutates only the exposed states container to prove app-time copying.
      const compiled = IntegrationStandaloneMachine.compiled as {
        states: typeof IntegrationStandaloneMachine.compiled.states;
      };

      // SAFETY: this fixture mutates only the exposed nested state table to prove recursive app-time copying.
      const nestedDefinition = IntegrationNestedMachine.definition as {
        S: typeof IntegrationNestedMachine.definition.S;
      };

      // SAFETY: this fixture mutates only the exposed nested compiled state containers to prove recursive app-time copying.
      const nestedCompiled = IntegrationNestedMachine.compiled as {
        states: typeof IntegrationNestedMachine.compiled.states;
      };

      const nestedActiveCompiled = nestedCompiled.states["S.active"];
      const nestedDialogCompiled = nestedCompiled.states["S.active.S.dialog"];

      if (nestedActiveCompiled === undefined || nestedDialogCompiled === undefined)
        return yield* Effect.die(new Error("nested integration states are missing"));

      const originalOperations = definition.operations;
      const originalStates = compiled.states;
      const nestedFacts = plan.resolveMachineFacts(IntegrationNestedMachine);
      const originalStandaloneFacts = plan.resolveMachineFacts(IntegrationStandaloneMachine);
      const originalStandaloneId = IntegrationStandaloneMachine.definition.id;
      const originalNestedEditing = IntegrationNestedDefinition.S.active.S.editing;
      const originalNestedChildren = nestedActiveCompiled.children;
      const originalNestedDialogChildren = nestedDialogCompiled.children;
      const initial = initialStandaloneSnapshot();

      assert.ok(isOwnedMachineFactsFor(nestedFacts, IntegrationNestedMachine));

      if (isOwnedMachineFactsFor(nestedFacts, IntegrationNestedMachine))
        assert.strictEqual(
          Object.prototype.hasOwnProperty.call(nestedFacts.definition.S, "__proto__"),
          true,
        );

      Reflect.set(exposedMachines, "length", 0);
      Reflect.set(exposedDescriptors, "length", 0);
      Reflect.set(definition, "operations", {});
      Reflect.set(compiled, "states", {});
      Reflect.set(nestedDefinition.S.active.S, "editing", undefined);
      Reflect.set(nestedActiveCompiled, "children", []);
      Reflect.set(nestedDialogCompiled, "children", []);

      try {
        const runtime = runtimeSetup({ app: IntegrationApp }).construct();
        yield* runtime.ready();
        const assembly = runtimeOwner(runtime).assembly();

        const actor = yield* assembly.createActor({
          ref: actorRef(IntegrationStandaloneMachine, "captured-facts"),
          initial,
        });

        assert.deepStrictEqual(originalMachines, [
          IntegrationProviderMachine,
          IntegrationConsumerMachine,
          IntegrationStandaloneMachine,
          IntegrationNestedMachine,
        ]);
        assert.deepStrictEqual(originalDescriptors, [IntegrationResource]);
        const dispatch = actor.engine.dispatch(IntegrationStandaloneEvent);
        assert.strictEqual(dispatch.admitted, true);
        yield* Deferred.await(dispatch.completion);
        yield* actor.engine.drain();
        assert.strictEqual(actor.engine.snapshot().state, IntegrationStandaloneDefinition.S.done);

        const nestedRuntime = runtimeSetup({ app: IntegrationApp }).construct();
        yield* nestedRuntime.ready();
        const nestedAssembly = runtimeOwner(nestedRuntime).assembly();

        const nestedActor = yield* nestedAssembly.createActor({
          ref: actorRef(IntegrationNestedMachine, "captured-nested-facts"),
          initial: Result.getOrThrow(
            prepareActorSnapshot(IntegrationNestedMachine, {
              state: originalNestedEditing,
              memory: {},
              context: {},
              lifecycle: "prepared",
              operations: [],
              timers: [],
              issues: [],
              revision: 0,
              observedStoreRevision: 0,
            }),
          ),
        });

        assert.strictEqual(nestedActor.engine.snapshot().state, originalNestedEditing);

        yield* Effect.provideContext(actor.dispose(), assembly.context);
        yield* runtimeOwner(runtime).close();
        yield* Effect.provideContext(nestedActor.dispose(), nestedAssembly.context);
        yield* runtimeOwner(nestedRuntime).close();

        Reflect.set(exposedMachines, "length", originalMachines.length);

        for (const [index, machine] of originalMachines.entries())
          Reflect.set(exposedMachines, index, machine);
        Reflect.set(exposedDescriptors, "length", originalDescriptors.length);

        for (const [index, descriptor] of originalDescriptors.entries())
          Reflect.set(exposedDescriptors, index, descriptor);

        const freshStandaloneId = `${originalStandaloneId}/fresh-app`;
        Reflect.set(IntegrationStandaloneMachine.definition, "id", freshStandaloneId);

        try {
          const freshApp = app({
            id: "runtime-integration/fresh-app",
            persistenceVersion: "1",
            modules: [IntegrationModule],
          });

          const freshFacts = appPlan(freshApp).resolveMachineFacts(IntegrationStandaloneMachine);

          assert.ok(isOwnedMachineFactsFor(originalStandaloneFacts, IntegrationStandaloneMachine));
          assert.ok(isOwnedMachineFactsFor(freshFacts, IntegrationStandaloneMachine));

          if (
            isOwnedMachineFactsFor(originalStandaloneFacts, IntegrationStandaloneMachine) &&
            isOwnedMachineFactsFor(freshFacts, IntegrationStandaloneMachine)
          ) {
            assert.notStrictEqual(originalStandaloneFacts, freshFacts);
            assert.strictEqual(originalStandaloneFacts.definition.id, originalStandaloneId);
            assert.strictEqual(freshFacts.definition.id, freshStandaloneId);
          }
        } finally {
          Reflect.set(IntegrationStandaloneMachine.definition, "id", originalStandaloneId);
        }
      } finally {
        Reflect.set(IntegrationStandaloneMachine.definition, "id", originalStandaloneId);
        Reflect.set(definition, "operations", originalOperations);
        Reflect.set(compiled, "states", originalStates);
        Reflect.set(nestedDefinition.S.active.S, "editing", originalNestedEditing);
        Reflect.set(nestedActiveCompiled, "children", originalNestedChildren);
        Reflect.set(nestedDialogCompiled, "children", originalNestedDialogChildren);
      }
    }),
  );

  it.effect("keeps bound-consumer identity and lifecycle edges on captured machine facts", () =>
    Effect.gen(function* () {
      const plan = appPlan(IntegrationApp);
      const capturedFacts = plan.resolveMachineFacts(IntegrationConsumerMachine);
      assert.ok(isOwnedMachineFactsFor(capturedFacts, IntegrationConsumerMachine));

      if (!isOwnedMachineFactsFor(capturedFacts, IntegrationConsumerMachine))
        return yield* Effect.die(new Error("consumer app facts are missing"));

      const originalId = IntegrationConsumerMachine.definition.id;
      const mutatedId = `${originalId}/mutated-after-app`;
      Reflect.set(IntegrationConsumerMachine.definition, "id", mutatedId);

      try {
        const runtime = runtimeSetup({ app: IntegrationApp }).construct();

        try {
          yield* runtime.ready();
          const assembly = runtimeOwner(runtime).assembly();

          const providerRef = actorRef(IntegrationProviderMachine, "identity-split-provider", {
            persist: true,
          });

          const provider = yield* assembly.createActor({
            ref: providerRef,
            initial: initialProviderSnapshot(),
          });

          const providerStateBinding = {
            slot: "providerState",
            provider: providerRef,
            providerFence: provider.fence,
            select: ({ state }) => state,
          } satisfies ActorContextBinding<
            typeof IntegrationConsumerDefinition,
            typeof IntegrationProviderDefinition,
            "providerState"
          >;

          const providerChangedBinding = {
            slot: "providerChanged",
            provider: providerRef,
            providerFence: provider.fence,
            select: ({ state }) => state === IntegrationProviderDefinition.S.changed,
          } satisfies ActorContextBinding<
            typeof IntegrationConsumerDefinition,
            typeof IntegrationProviderDefinition,
            "providerChanged"
          >;

          const consumerRef = actorRef(IntegrationConsumerMachine, "identity-split-consumer", {
            persist: true,
          });

          const consumer = yield* assembly.createActor({
            ref: consumerRef,
            initial: initialConsumerSnapshot(),
            bindings: [providerStateBinding, providerChangedBinding],
          });

          assert.strictEqual(consumer.identity.key, consumer.fence.key);
          assert.strictEqual(
            consumer.fence.key.endsWith(
              `/stable/${originalId.length}:${originalId}/${consumerRef.id.length}:${consumerRef.id}`,
            ),
            true,
          );
          assert.strictEqual(consumer.fence.key.includes(mutatedId), false);

          const lifecycleState = yield* consumer.lifecycle.state();
          assert.strictEqual(lifecycleState.attachment.dependencies.length, 2);
          assert.deepStrictEqual(
            lifecycleState.attachment.dependencies.map(
              ({ consumer: edgeConsumer, provider: edgeProvider }) => ({
                consumer: edgeConsumer,
                provider: edgeProvider,
              }),
            ),
            [
              { consumer: consumer.fence.key, provider: provider.fence.key },
              { consumer: consumer.fence.key, provider: provider.fence.key },
            ],
          );
          assert.strictEqual(
            consumer.engine.snapshot().context.providerState,
            IntegrationProviderDefinition.S.ready,
          );
          assert.strictEqual(consumer.engine.snapshot().context.providerChanged, false);

          const providerDispatch = provider.engine.dispatch(IntegrationProviderEvent);
          assert.strictEqual(providerDispatch.admitted, true);
          yield* Deferred.await(providerDispatch.completion);
          yield* provider.engine.drain();
          yield* assembly.contextCoordinator.drain();
          yield* consumer.engine.drain();

          assert.strictEqual(
            consumer.engine.snapshot().context.providerState,
            IntegrationProviderDefinition.S.changed,
          );
          assert.strictEqual(consumer.engine.snapshot().context.providerChanged, true);

          yield* Effect.provideContext(consumer.dispose(), assembly.context);
          yield* Effect.provideContext(provider.dispose(), assembly.context);
        } finally {
          yield* Effect.exit(runtimeOwner(runtime).close());
        }
      } finally {
        Reflect.set(IntegrationConsumerMachine.definition, "id", originalId);
      }
    }),
  );

  // Setup: Create one fresh actor and restore one actor with nonzero publication and machine-turn revisions; attach snapshot and evidence observers before exposure.
  // Action: Observe initial activation, then suspend and resume each actor without dispatching a machine event.
  // Assert: The first fresh snapshot has revision zero, restore retains both persisted revisions, later lifecycle publications increment only publication revision, and start or restore creates lifecycle evidence without replaying events or finite work.
  it.effect("preserves fresh and restored revision baselines before later lifecycle cuts", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const records: EvidenceRecord[] = [];

      const sink = yield* makeEvidenceSink({
        id: "cut-initial-evidence",
        deliver: (record) => Effect.sync(() => records.push(record)),
      });

      assert.ok(Result.isSuccess(assembly.evidence.journal.attach(sink)));

      const fresh = yield* assembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "cut-initial-fresh"),
        initial: initialStandaloneSnapshot(),
      });

      const restored = yield* assembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "cut-initial-restored", { persist: true }),
        restore: restoredStandaloneSnapshot(),
        restoredMachineTurnRevision: 4,
      });

      const freshBaseline = fresh.engine.snapshot();
      const restoredBaseline = restored.engine.snapshot();
      assert.strictEqual(freshBaseline.revision, 0);
      assert.strictEqual(freshBaseline.observedStoreRevision, 0);
      assert.strictEqual(fresh.engine.machineTurnRevision(), 0);
      assert.strictEqual(restoredBaseline.revision, 9);
      assert.strictEqual(restoredBaseline.observedStoreRevision, 6);
      assert.strictEqual(restored.engine.machineTurnRevision(), 4);

      for (const actor of [fresh, restored]) {
        const before = actor.engine.snapshot();
        yield* Effect.provideContext(
          actor.lifecycle.command({ _tag: "actor:suspend", cause: { _tag: "attachment" } }),
          assembly.context,
        );
        const suspended = actor.engine.snapshot();
        assert.strictEqual(suspended.revision, before.revision + 1);
        assert.strictEqual(suspended.observedStoreRevision, before.observedStoreRevision);
        assert.strictEqual(actor.engine.machineTurnRevision(), actor === fresh ? 0 : 4);
      }

      yield* assembly.evidence.journal.drain();

      const restoredLifecycle = records.filter(
        (record) => record._tag === "lifecycle" && record.after.fence.key === restored.fence.key,
      );

      assert.ok(restoredLifecycle.length >= 2);
      assert.ok(restoredLifecycle.every((record) => record.machineTurnRevision === 4));

      const suspendedEvidence = restoredLifecycle.find(
        (record) => record._tag === "lifecycle" && record.to === "suspended",
      );

      assert.ok(suspendedEvidence !== undefined);
      assert.strictEqual(suspendedEvidence.publicationRevision, restoredBaseline.revision + 1);

      yield* Effect.provideContext(fresh.dispose(), assembly.context);
      yield* Effect.provideContext(restored.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  // Setup: Use an active real actor with a scoped finalizer and a provided Clock whose lifecycle read can fail.
  // Action: Reject one direct lifecycle disposal before its transition, then clear the clock fault and retry through the same owner.
  // Assert: The rejected preflight leaves lifecycle state, evidence sequence, and the actor Scope untouched; the valid attempt performs one lifecycle cut and runtime close runs the retained finalizer once.
  it.effect("rejects lifecycle publication preflight before changing admission or resources", () =>
    Effect.gen(function* () {
      const baseClock = yield* Clock.Clock;
      let failClockRead = false;
      let routableAtFailedRead: boolean | undefined;
      let isRoutable = () => false;
      let finalizations = 0;

      const providedClock: Clock.Clock = {
        ...baseClock,
        currentTimeMillis: Effect.suspend(() => {
          if (failClockRead) {
            routableAtFailedRead = isRoutable();

            return Effect.die(new Error("lifecycle clock read failed"));
          }

          return Effect.succeed(baseClock.currentTimeMillisUnsafe());
        }),
      };

      const runtime = runtimeSetup({ app: IntegrationApp }).construct();

      yield* Effect.provide(runtime.ready(), Layer.succeed(Clock.Clock)(providedClock));
      const owner = runtimeOwner(runtime);
      const assembly = owner.assembly();

      const actor = yield* assembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "lifecycle-preflight"),
        initial: initialStandaloneSnapshot(),
        onCommand: () =>
          Effect.gen(function* () {
            const scope = yield* Effect.scope;

            yield* Scope.addFinalizer(
              scope,
              Effect.sync(() => (finalizations += 1)),
            );
          }),
      });

      isRoutable = actor.lifecycle.isRoutable;

      const dispatched = actor.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(dispatched.admitted, true);
      yield* Deferred.await(dispatched.completion);
      yield* actor.engine.drain();

      const before = yield* actor.lifecycle.state();
      const publishedBefore = actor.engine.snapshot();
      const sequence = assembly.evidence.journal.sequence();
      failClockRead = true;

      const rejected = yield* Effect.exit(
        Effect.provideContext(
          actor.lifecycle.command({
            _tag: "actor:dispose",
            cause: { _tag: "owner-disposal" },
          }),
          assembly.context,
        ),
      );

      assert.ok(Exit.isFailure(rejected));
      assert.strictEqual(routableAtFailedRead, true);
      assert.strictEqual(actor.lifecycle.isRoutable(), true);
      assert.strictEqual(actor.engine.snapshot(), publishedBefore);
      assert.deepStrictEqual(yield* actor.lifecycle.state(), before);
      assert.strictEqual(assembly.evidence.journal.sequence(), sequence);
      assert.strictEqual(finalizations, 0);

      failClockRead = false;

      const accepted = yield* Effect.provideContext(
        actor.lifecycle.command({
          _tag: "actor:dispose",
          cause: { _tag: "owner-disposal" },
        }),
        assembly.context,
      );

      assert.strictEqual(accepted.lifecycle, "disposed");
      assert.strictEqual(finalizations, 0);
      yield* Effect.provideContext(actor.dispose(), assembly.context);
      yield* owner.close();
      assert.strictEqual(finalizations, 1);
    }),
  );

  it.effect("blocks stale or suspended diamond tickets without substituting a newer live cut", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const { a, b, c, d, dSnapshots } = yield* makeContextDiamond(assembly, "stale");
      const actualOffer = b.engine.dispatchContextTicket;
      let injected = 0;
      b.engine.dispatchContextTicket = (...args) => {
        injected += 1;
        assert.strictEqual(b.engine.dispatch(IntegrationConsumerEvent).admitted, true);

        return actualOffer(...args);
      };

      const first = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(first.admitted, true);
      yield* Deferred.await(first.completion);
      yield* a.engine.drain();
      const receipts = yield* assembly.contextCoordinator.drain();
      const root = receipts.find((receipt) => receipt.origin.fence.key === a.fence.key);
      assert.strictEqual(injected, 1);
      assert.strictEqual(root?.outcomes.get(b.fence.key), "stale");
      assert.strictEqual(root?.outcomes.get(c.fence.key), "published");
      assert.strictEqual(root?.outcomes.get(d.fence.key), "blocked");
      assert.strictEqual(
        d.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.ready,
      );
      assert.strictEqual(dSnapshots.length, 0);
      b.engine.dispatchContextTicket = actualOffer;
      yield* assembly.contextCoordinator.drain();
      const second = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(second.admitted, true);
      yield* Deferred.await(second.completion);
      yield* a.engine.drain();
      yield* assembly.contextCoordinator.drain();
      assert.strictEqual(
        d.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.final,
      );
      assert.strictEqual(d.engine.snapshot().context.providerChanged, false);
      assert.strictEqual(dSnapshots.length, 1);
      yield* Effect.provideContext(d.dispose(), assembly.context);
      yield* Effect.provideContext(c.dispose(), assembly.context);
      yield* Effect.provideContext(b.dispose(), assembly.context);
      yield* Effect.provideContext(a.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("rejects mismatched vector, stale consumer fence, and foreign provider tickets", () =>
    Effect.gen(function* () {
      for (const rejection of ["vector", "fence", "foreign-provider"] as const) {
        const runtime = runtimeSetup({ app: IntegrationApp }).construct();
        yield* runtime.ready();
        const assembly = runtimeOwner(runtime).assembly();

        const { a, b, c, d, dSnapshots } = yield* makeContextDiamond(
          assembly,
          `reject-${rejection}`,
        );

        const actualOffer = b.engine.dispatchContextTicket;
        b.engine.dispatchContextTicket = (fact, attestation) => {
          if (rejection === "vector")
            return actualOffer(fact, {
              ...attestation,
              requiredVector: new Map([
                [a.fence.key, attestation.requiredVector.get(a.fence.key)! + 1],
              ]),
            });

          if (rejection === "fence")
            return actualOffer(fact, {
              ...attestation,
              consumerFence: {
                ...attestation.consumerFence,
                generation: attestation.consumerFence.generation + 1,
              },
            });
          assert.ok(fact.projection);

          const projection = {
            ...fact.projection,
            providers: fact.projection.providers.map((provider) => ({
              ...provider,
              fence: c.fence,
            })),
          };

          return actualOffer(
            {
              ...fact,
              provider: { ...fact.provider, fence: c.fence, value: projection },
              projection,
            },
            attestation,
          );
        };

        const dispatched = a.engine.dispatch(IntegrationProviderEvent);
        assert.strictEqual(dispatched.admitted, true);
        yield* Deferred.await(dispatched.completion);
        yield* a.engine.drain();
        const receipts = yield* assembly.contextCoordinator.drain();
        assert.strictEqual(receipts.length, 1);
        assert.strictEqual(receipts[0]?.outcomes.get(b.fence.key), "stale", rejection);
        assert.strictEqual(receipts[0]?.outcomes.get(c.fence.key), "published", rejection);
        assert.strictEqual(receipts[0]?.outcomes.get(d.fence.key), "blocked", rejection);
        assert.strictEqual(
          b.engine.snapshot().context.providerState,
          IntegrationProviderDefinition.S.ready,
        );
        assert.strictEqual(dSnapshots.length, 0);
        yield* runtimeOwner(runtime).close();
      }
    }),
  );

  it.effect("rejects a ticket with a mutated captured origin before descendant publication", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const { a, b, d, bSnapshots, dSnapshots } = yield* makeContextDiamond(
        assembly,
        "origin-attestation",
      );

      const actualOffer = b.engine.dispatchContextTicket;
      b.engine.dispatchContextTicket = (fact, attestation) =>
        actualOffer(fact, {
          ...attestation,
          origin: { ...attestation.origin, generation: attestation.origin.generation + 1 },
        });

      const dispatched = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(dispatched.admitted, true);
      yield* Deferred.await(dispatched.completion);
      yield* a.engine.drain();
      const receipts = yield* assembly.contextCoordinator.drain();
      assert.strictEqual(receipts[0]?.outcomes.get(b.fence.key), "stale");
      assert.strictEqual(receipts[0]?.outcomes.get(d.fence.key), "blocked");
      assert.strictEqual(
        b.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.ready,
      );
      assert.strictEqual(bSnapshots.length, 0);
      assert.strictEqual(dSnapshots.length, 0);

      b.engine.dispatchContextTicket = actualOffer;
      const next = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(next.admitted, true);
      yield* Deferred.await(next.completion);
      yield* a.engine.drain();
      const retried = yield* assembly.contextCoordinator.drain();
      assert.strictEqual(retried[0]?.outcomes.get(b.fence.key), "published");
      assert.strictEqual(bSnapshots.length, 1);
      assert.strictEqual(
        d.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.final,
      );
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("rejects a ticket with a mutated graph generation before descendant publication", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const { a, b, d, bSnapshots, dSnapshots } = yield* makeContextDiamond(
        assembly,
        "graph-attestation",
      );

      const actualOffer = b.engine.dispatchContextTicket;
      b.engine.dispatchContextTicket = (fact, attestation) =>
        actualOffer(fact, {
          ...attestation,
          graphGeneration: attestation.graphGeneration + 1,
        });

      const dispatched = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(dispatched.admitted, true);
      yield* Deferred.await(dispatched.completion);
      yield* a.engine.drain();
      const receipts = yield* assembly.contextCoordinator.drain();
      assert.strictEqual(receipts[0]?.outcomes.get(b.fence.key), "stale");
      assert.strictEqual(receipts[0]?.outcomes.get(d.fence.key), "blocked");
      assert.strictEqual(
        b.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.ready,
      );
      assert.strictEqual(bSnapshots.length, 0);
      assert.strictEqual(dSnapshots.length, 0);

      b.engine.dispatchContextTicket = actualOffer;
      const next = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(next.admitted, true);
      yield* Deferred.await(next.completion);
      yield* a.engine.drain();
      const retried = yield* assembly.contextCoordinator.drain();
      assert.strictEqual(retried[0]?.outcomes.get(b.fence.key), "published");
      assert.strictEqual(bSnapshots.length, 1);
      assert.strictEqual(
        d.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.final,
      );
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("rejects an in-place origin mutation without consuming the selected cut", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const { a, b, d, bSnapshots, dSnapshots, bSelectionAttempts } = yield* makeContextDiamond(
        assembly,
        "in-place-origin",
      );

      const before = bSelectionAttempts.length;

      const actualOffer = b.engine.dispatchContextTicket;
      b.engine.dispatchContextTicket = (fact, attestation) => {
        attestation.origin.revision += 1;

        return actualOffer(fact, attestation);
      };

      const dispatched = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(dispatched.admitted, true);
      yield* Deferred.await(dispatched.completion);
      yield* a.engine.drain();
      const receipts = yield* assembly.contextCoordinator.drain();
      assert.strictEqual(receipts[0]?.outcomes.get(b.fence.key), "stale");
      assert.strictEqual(receipts[0]?.outcomes.get(d.fence.key), "blocked");
      assert.strictEqual(bSnapshots.length, 0);
      assert.strictEqual(dSnapshots.length, 0);
      assert.deepStrictEqual(bSelectionAttempts.slice(before), [
        "providerState",
        "providerChanged",
      ]);

      b.engine.dispatchContextTicket = actualOffer;
      assembly.contextCoordinator.notify(a.fence, a.engine.snapshot());
      const retried = yield* assembly.contextCoordinator.drain();

      const retryRoot = retried.find(
        (receipt) =>
          receipt.origin.fence.key === a.fence.key &&
          receipt.outcomes.get(b.fence.key) === "published",
      );

      assert.ok(retryRoot);
      assert.strictEqual(retryRoot.origin.revision, receipts[0]?.origin.revision);
      assert.deepStrictEqual(bSelectionAttempts.slice(before), [
        "providerState",
        "providerChanged",
        "providerState",
        "providerChanged",
      ]);
      assert.strictEqual(bSnapshots.length, 1);
      assert.strictEqual(dSnapshots.length, 1);
      assert.strictEqual(
        b.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.changed,
      );
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("rejects a replaced ticket validator without consuming the selected cut", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const { a, b, d, bSnapshots, dSnapshots, bSelectionAttempts } = yield* makeContextDiamond(
        assembly,
        "replaced-validator",
      );

      const before = bSelectionAttempts.length;

      const actualOffer = b.engine.dispatchContextTicket;
      b.engine.dispatchContextTicket = (fact, attestation) => {
        attestation.graphGeneration += 1;
        attestation.validate = () => true;

        return actualOffer(fact, attestation);
      };

      const dispatched = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(dispatched.admitted, true);
      yield* Deferred.await(dispatched.completion);
      yield* a.engine.drain();
      const receipts = yield* assembly.contextCoordinator.drain();
      assert.strictEqual(receipts[0]?.outcomes.get(b.fence.key), "stale");
      assert.strictEqual(receipts[0]?.outcomes.get(d.fence.key), "blocked");
      assert.strictEqual(bSnapshots.length, 0);
      assert.strictEqual(dSnapshots.length, 0);
      assert.deepStrictEqual(bSelectionAttempts.slice(before), [
        "providerState",
        "providerChanged",
      ]);

      b.engine.dispatchContextTicket = actualOffer;
      assembly.contextCoordinator.notify(a.fence, a.engine.snapshot());
      const retried = yield* assembly.contextCoordinator.drain();

      const retryRoot = retried.find(
        (receipt) =>
          receipt.origin.fence.key === a.fence.key &&
          receipt.outcomes.get(b.fence.key) === "published",
      );

      assert.ok(retryRoot);
      assert.strictEqual(retryRoot.origin.revision, receipts[0]?.origin.revision);
      assert.deepStrictEqual(bSelectionAttempts.slice(before), [
        "providerState",
        "providerChanged",
        "providerState",
        "providerChanged",
      ]);
      assert.strictEqual(bSnapshots.length, 1);
      assert.strictEqual(dSnapshots.length, 1);
      assert.strictEqual(
        b.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.changed,
      );
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("rejects a constructor-forged context witness without committing its ledger", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const { a, b, d, bSnapshots, dSnapshots, bSelectionAttempts } = yield* makeContextDiamond(
        assembly,
        "forged-witness",
      );

      const before = bSelectionAttempts.length;
      const actualOffer = b.engine.dispatchContextTicket;
      let constructorRejected = false;

      b.engine.dispatchContextTicket = (fact, attestation) => {
        const forgedOrigin = {
          ...attestation.origin,
          revision: attestation.origin.revision + 1,
        };

        const forgedGeneration = attestation.graphGeneration + 1;
        let witness = attestation.witness;

        try {
          witness = Reflect.construct(attestation.witness.constructor, [
            forgedOrigin,
            forgedGeneration,
            () => true,
          ]);
        } catch {
          constructorRejected = true;
        }

        return actualOffer(fact, {
          ...attestation,
          origin: forgedOrigin,
          graphGeneration: forgedGeneration,
          witness,
          validate: () => true,
        });
      };

      const dispatched = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(dispatched.admitted, true);
      yield* Deferred.await(dispatched.completion);
      yield* a.engine.drain();
      const receipts = yield* assembly.contextCoordinator.drain();
      assert.strictEqual(receipts[0]?.outcomes.get(b.fence.key), "stale");
      assert.strictEqual(receipts[0]?.outcomes.get(d.fence.key), "blocked");
      assert.strictEqual(constructorRejected, true);
      assert.strictEqual(bSnapshots.length, 0);
      assert.strictEqual(dSnapshots.length, 0);
      assert.deepStrictEqual(bSelectionAttempts.slice(before), [
        "providerState",
        "providerChanged",
      ]);

      b.engine.dispatchContextTicket = actualOffer;
      assembly.contextCoordinator.notify(a.fence, a.engine.snapshot());
      const retried = yield* assembly.contextCoordinator.drain();

      const retryRoot = retried.find(
        (receipt) =>
          receipt.origin.fence.key === a.fence.key &&
          receipt.outcomes.get(b.fence.key) === "published",
      );

      assert.ok(retryRoot);
      assert.strictEqual(retryRoot.origin.revision, receipts[0]?.origin.revision);
      assert.deepStrictEqual(bSelectionAttempts.slice(before), [
        "providerState",
        "providerChanged",
        "providerState",
        "providerChanged",
      ]);
      assert.strictEqual(bSnapshots.length, 1);
      assert.strictEqual(dSnapshots.length, 1);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("rejects cloned and proxied context witnesses", () =>
    Effect.gen(function* () {
      for (const substitution of ["clone", "proxy"] as const) {
        const runtime = runtimeSetup({ app: IntegrationApp }).construct();
        yield* runtime.ready();
        const assembly = runtimeOwner(runtime).assembly();

        const { a, b, d, bSnapshots, dSnapshots } = yield* makeContextDiamond(
          assembly,
          `substituted-witness-${substitution}`,
        );

        const actualOffer = b.engine.dispatchContextTicket;

        b.engine.dispatchContextTicket = (fact, attestation) => {
          const witness =
            substitution === "clone"
              ? Object.assign(
                  Object.create(Object.getPrototypeOf(attestation.witness)),
                  attestation.witness,
                )
              : new Proxy(attestation.witness, {});

          return actualOffer(fact, { ...attestation, witness });
        };

        const dispatched = a.engine.dispatch(IntegrationProviderEvent);
        assert.strictEqual(dispatched.admitted, true);
        yield* Deferred.await(dispatched.completion);
        yield* a.engine.drain();
        const receipts = yield* assembly.contextCoordinator.drain();
        assert.strictEqual(receipts[0]?.outcomes.get(b.fence.key), "stale", substitution);
        assert.strictEqual(receipts[0]?.outcomes.get(d.fence.key), "blocked", substitution);
        assert.strictEqual(bSnapshots.length, 0, substitution);
        assert.strictEqual(dSnapshots.length, 0, substitution);
        yield* runtimeOwner(runtime).close();
      }
    }),
  );

  it.effect("rejects an in-place forged context carrier before descendant publication", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const { a, b, d, bSnapshots, dSnapshots } = yield* makeContextDiamond(
        assembly,
        "carrier-forgery",
      );

      const actualOffer = b.engine.dispatchContextTicket;

      b.engine.dispatchContextTicket = (fact, attestation) => {
        assert.ok(fact.projection);
        fact.projection.providers[0]!.value = IntegrationProviderDefinition.S.final;

        return actualOffer(fact, attestation);
      };

      const dispatched = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(dispatched.admitted, true);
      yield* Deferred.await(dispatched.completion);
      yield* a.engine.drain();
      const receipts = yield* assembly.contextCoordinator.drain();
      assert.strictEqual(receipts[0]?.outcomes.get(b.fence.key), "stale");
      assert.strictEqual(receipts[0]?.outcomes.get(d.fence.key), "blocked");
      assert.strictEqual(bSnapshots.length, 0);
      assert.strictEqual(dSnapshots.length, 0);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("rejects forged carrier methods and iterators before descendant publication", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const { a, b, d, bSnapshots, dSnapshots } = yield* makeContextDiamond(
        assembly,
        "carrier-method-forgery",
      );

      const actualOffer = b.engine.dispatchContextTicket;

      b.engine.dispatchContextTicket = (fact, attestation) => {
        assert.ok(fact.projection);
        fact.projection.providers[0]!.value = IntegrationProviderDefinition.S.final;
        Object.defineProperty(fact.projection.providers, "every", { value: () => true });
        Object.defineProperty(fact.projection.providers, "map", { value: () => [] });
        Object.defineProperty(fact.projection.providers, Symbol.iterator, {
          value: () => ({
            next: () => ({ done: true, value: undefined }),
          }),
        });

        return actualOffer(fact, attestation);
      };

      const dispatched = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(dispatched.admitted, true);
      yield* Deferred.await(dispatched.completion);
      yield* a.engine.drain();
      const receipts = yield* assembly.contextCoordinator.drain();
      assert.strictEqual(receipts[0]?.outcomes.get(b.fence.key), "stale");
      assert.strictEqual(receipts[0]?.outcomes.get(d.fence.key), "blocked");
      assert.strictEqual(bSnapshots.length, 0);
      assert.strictEqual(dSnapshots.length, 0);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("stales a mutated selector-defect carrier and retries at the same revision", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const providerRef = actorRef(IntegrationProviderMachine, "selector-carrier-provider");

      const provider = yield* assembly.createActor({
        ref: providerRef,
        initial: initialProviderSnapshot(),
      });

      const selectorDiagnostic = Failure({
        code: "InvariantViolation" as const,
        path: ["context", "providerState"],
        details: { reason: "selector" },
        summary: "providerState selector failed",
        help: "Inspect the providerState selector.",
      });

      let shouldDefect = false;
      const consumerSnapshots: IntegrationConsumerSnapshot[] = [];

      const consumer = yield* assembly.createActor({
        ref: actorRef(IntegrationConsumerMachine, "selector-carrier-consumer"),
        initial: initialConsumerSnapshot(),
        bindings: [
          {
            slot: "providerState",
            provider: providerRef,
            providerFence: provider.fence,
            select: ({ state }) => {
              if (shouldDefect) throw selectorDiagnostic;

              return state;
            },
          },
          {
            slot: "providerChanged",
            provider: providerRef,
            providerFence: provider.fence,
            select: ({ state }) => state === IntegrationProviderDefinition.S.changed,
          },
        ],
        onSnapshot: (snapshot) => consumerSnapshots.push(snapshot),
      });

      const actualOffer = consumer.engine.dispatchContextTicket;
      let forgeCarrier = true;

      consumer.engine.dispatchContextTicket = (fact, attestation) => {
        if (forgeCarrier) {
          forgeCarrier = false;
          assert.ok(fact.projection);
          const defect = fact.projection.selectorDefects[0];

          assert.ok(defect);
          assert.strictEqual(Reflect.set(defect, "classification", "Defect"), true);
          assert.strictEqual(Reflect.set(defect, "code", "SemanticValidation"), true);
          assert.strictEqual(Reflect.set(defect, "summary", "forged summary"), true);
          assert.strictEqual(Reflect.set(defect, "help", "forged help"), true);
          assert.strictEqual(Reflect.set(defect.path, 1, "forged"), true);
          assert.strictEqual(Reflect.set(defect.details, "reason", "forged"), true);
        }

        return actualOffer(fact, attestation);
      };

      shouldDefect = true;
      const first = provider.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(first.admitted, true);
      yield* Deferred.await(first.completion);
      yield* provider.engine.drain();
      const staleReceipts = yield* assembly.contextCoordinator.drain();
      yield* consumer.engine.drain();

      assert.strictEqual(provider.engine.snapshot().revision, 1);
      assert.strictEqual(staleReceipts.length, 1);
      assert.strictEqual(staleReceipts[0]?.outcomes.get(consumer.fence.key), "stale");
      assert.strictEqual(consumerSnapshots.length, 0);
      assert.strictEqual(consumer.engine.snapshot().revision, 0);
      assert.strictEqual(consumer.engine.snapshot().issues.length, 0);

      assert.strictEqual(Reflect.set(selectorDiagnostic, "classification", "Failure"), true);
      assert.strictEqual(Reflect.set(selectorDiagnostic, "code", "InvariantViolation"), true);
      assert.strictEqual(
        Reflect.set(selectorDiagnostic, "summary", "providerState selector failed"),
        true,
      );
      assert.strictEqual(
        Reflect.set(selectorDiagnostic, "help", "Inspect the providerState selector."),
        true,
      );
      assert.strictEqual(Reflect.set(selectorDiagnostic.path, 1, "providerState"), true);
      assert.strictEqual(Reflect.set(selectorDiagnostic.details, "reason", "selector"), true);
      assembly.contextCoordinator.notify(provider.fence, provider.engine.snapshot());
      const retryReceipts = yield* assembly.contextCoordinator.drain();
      yield* consumer.engine.drain();

      assert.strictEqual(retryReceipts.length, 1);
      assert.strictEqual(retryReceipts[0]?.outcomes.get(consumer.fence.key), "defect");
      assert.strictEqual(consumer.engine.snapshot().revision, 1);
      assert.strictEqual(consumer.engine.snapshot().issues.length, 1);
      assert.strictEqual(consumer.engine.snapshot().issues[0], selectorDiagnostic);
      assert.deepStrictEqual(consumer.engine.snapshot().issues[0], selectorDiagnostic);
      assert.strictEqual(consumerSnapshots.length, 1);
      assert.strictEqual(consumerSnapshots[0]?.revision, 1);

      yield* Effect.provideContext(consumer.dispose(), assembly.context);
      yield* Effect.provideContext(provider.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("keeps accepted provider fences owned after ticket settlement", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const { a, b, d, bSnapshots } = yield* makeContextDiamond(assembly, "provider-fence-copy");
      const originalGeneration = a.fence.generation;
      const retainedFences: ActorFence[] = [];
      const actualOffer = b.engine.dispatchContextTicket;

      b.engine.dispatchContextTicket = (fact, attestation) => {
        const provider = fact.projection?.providers[0];
        assert.ok(provider);
        retainedFences.push(provider.fence);

        return actualOffer(fact, attestation);
      };

      const first = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(first.admitted, true);
      yield* Deferred.await(first.completion);
      yield* a.engine.drain();
      const settled = yield* assembly.contextCoordinator.drain();
      assert.strictEqual(settled[0]?.outcomes.get(b.fence.key), "published");
      assert.strictEqual(bSnapshots.length, 1);
      const acceptedFence = retainedFences[0];
      assert.ok(acceptedFence);
      acceptedFence.generation += 1;
      assert.strictEqual(a.fence.generation, originalGeneration);

      b.engine.dispatchContextTicket = actualOffer;
      const second = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(second.admitted, true);
      yield* Deferred.await(second.completion);
      yield* a.engine.drain();
      const retried = yield* assembly.contextCoordinator.drain();
      assert.strictEqual(retried[0]?.outcomes.get(b.fence.key), "published");
      assert.strictEqual(bSnapshots.length, 2);
      assert.strictEqual(
        d.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.final,
      );
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("rejects an in-place nested carrier mutation and retries the unconsumed cut", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: MutableContextApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const { a, b, d, bSnapshots, dSnapshots, bSelectionAttempts } =
        yield* makeMutableContextChain(assembly, "nested-carrier", () => Effect.void);

      yield* assembly.contextCoordinator.drain();
      const before = bSelectionAttempts.length;
      const beforeB = bSnapshots.length;
      const beforeD = dSnapshots.length;
      const actualOffer = b.engine.dispatchContextTicket;

      b.engine.dispatchContextTicket = (fact, attestation) => {
        const value = fact.projection?.providers[0]?.value;
        assert.ok(Predicate.isObject(value));
        Reflect.set(value, "state", IntegrationProviderDefinition.S.final);

        return actualOffer(fact, attestation);
      };

      const first = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(first.admitted, true);
      yield* Deferred.await(first.completion);
      yield* a.engine.drain();
      const receipts = yield* assembly.contextCoordinator.drain();
      assert.strictEqual(receipts[0]?.outcomes.get(b.fence.key), "stale");
      assert.strictEqual(receipts[0]?.outcomes.get(d.fence.key), "blocked");
      assert.strictEqual(bSnapshots.length, beforeB);
      assert.strictEqual(dSnapshots.length, beforeD);
      assert.deepStrictEqual(bSelectionAttempts.slice(before), [
        "providerState",
        "providerChanged",
      ]);

      b.engine.dispatchContextTicket = actualOffer;
      assembly.contextCoordinator.notify(a.fence, a.engine.snapshot());
      const retried = yield* assembly.contextCoordinator.drain();

      const retryRoot = retried.find(
        (receipt) => receipt.outcomes.get(b.fence.key) === "published",
      );

      assert.ok(retryRoot);
      assert.strictEqual(retryRoot.origin.revision, receipts[0]?.origin.revision);
      assert.ok(bSelectionAttempts.length - before >= 4);
      assert.strictEqual(bSnapshots.length, beforeB + 1);
      assert.strictEqual(dSnapshots.length, beforeD + 1);
      assert.strictEqual(
        b.engine.snapshot().context.providerState.state,
        IntegrationProviderDefinition.S.changed,
      );
      assert.strictEqual(
        d.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.changed,
      );
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("rejects each forged outer context lead without issuing or consuming the cut", () =>
    Effect.gen(function* () {
      for (const field of ["fence", "slot", "revision"] as const) {
        const runtime = runtimeSetup({ app: MutableContextApp }).construct();
        yield* runtime.ready();
        const assembly = runtimeOwner(runtime).assembly();

        const { a, b, d, bSnapshots, dSnapshots, bSelectionAttempts } =
          yield* makeMutableContextChain(assembly, `lead-${field}`, () => Effect.void);

        yield* assembly.contextCoordinator.drain();
        const beforeB = bSnapshots.length;
        const beforeD = dSnapshots.length;
        const beforeSelection = bSelectionAttempts.length;
        const beforeRevision = b.engine.snapshot().revision;
        const beforeIssues = b.engine.snapshot().issues.length;
        const actualOffer = b.engine.dispatchContextTicket;

        b.engine.dispatchContextTicket = (fact, attestation) => {
          if (field === "fence") fact.provider.fence.generation += 1;
          else if (field === "slot") fact.provider.slot = "forged-slot";
          else fact.provider.revision += 1;

          return actualOffer(fact, attestation);
        };

        const first = a.engine.dispatch(IntegrationProviderEvent);
        assert.strictEqual(first.admitted, true);
        yield* Deferred.await(first.completion);
        yield* a.engine.drain();
        const receipts = yield* assembly.contextCoordinator.drain();
        assert.strictEqual(receipts[0]?.outcomes.get(b.fence.key), "stale", field);
        assert.strictEqual(receipts[0]?.outcomes.get(d.fence.key), "blocked", field);
        assert.strictEqual(b.engine.snapshot().revision, beforeRevision, field);
        assert.strictEqual(b.engine.snapshot().issues.length, beforeIssues, field);
        assert.strictEqual(bSnapshots.length, beforeB, field);
        assert.strictEqual(dSnapshots.length, beforeD, field);
        assert.deepStrictEqual(bSelectionAttempts.slice(beforeSelection), [
          "providerState",
          "providerChanged",
        ]);

        b.engine.dispatchContextTicket = actualOffer;
        assembly.contextCoordinator.notify(a.fence, a.engine.snapshot());
        const retried = yield* assembly.contextCoordinator.drain();

        const retryRoot = retried.find(
          (receipt) => receipt.outcomes.get(b.fence.key) === "published",
        );

        assert.ok(retryRoot, field);
        assert.strictEqual(retryRoot.origin.revision, receipts[0]?.origin.revision, field);
        assert.ok(bSelectionAttempts.length - beforeSelection >= 4, field);
        assert.strictEqual(bSnapshots.length, beforeB + 1, field);
        assert.strictEqual(dSnapshots.length, beforeD + 1, field);
        assert.strictEqual(
          d.engine.snapshot().context.providerState,
          IntegrationProviderDefinition.S.changed,
        );
        yield* runtimeOwner(runtime).close();
      }
    }),
  );

  it.effect("owns settled nested context against retained carrier and snapshot mutation", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: MutableContextApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const { a, b, d, bSnapshots, dSnapshots } = yield* makeMutableContextChain(
        assembly,
        "settled-carrier",
        () => Effect.void,
      );

      yield* assembly.contextCoordinator.drain();
      const actualOffer = b.engine.dispatchContextTicket;
      let mutateRetained = () => false;

      b.engine.dispatchContextTicket = (fact, attestation) => {
        const value = fact.projection?.providers[0]?.value;
        assert.ok(Predicate.isObject(value));
        mutateRetained = () => Reflect.set(value, "state", IntegrationProviderDefinition.S.final);

        return actualOffer(fact, attestation);
      };

      const first = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(first.admitted, true);
      yield* Deferred.await(first.completion);
      yield* a.engine.drain();
      const receipts = yield* assembly.contextCoordinator.drain();
      assert.strictEqual(receipts[0]?.outcomes.get(b.fence.key), "published");
      assert.strictEqual(receipts[0]?.outcomes.get(d.fence.key), "published");
      yield* assembly.contextCoordinator.drain();
      const bRevision = b.engine.snapshot().revision;
      const dRevision = d.engine.snapshot().revision;
      const bCount = bSnapshots.length;
      const dCount = dSnapshots.length;

      assert.strictEqual(mutateRetained(), true);
      assert.strictEqual(
        b.engine.snapshot().context.providerState.state,
        IntegrationProviderDefinition.S.changed,
      );
      const exposed = b.engine.snapshot();
      Reflect.set(exposed.context.providerState, "state", IntegrationProviderDefinition.S.final);
      yield* assembly.contextCoordinator.drain();

      assert.strictEqual(
        b.engine.snapshot().context.providerState.state,
        IntegrationProviderDefinition.S.changed,
      );
      assert.strictEqual(
        d.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.changed,
      );
      assert.strictEqual(b.engine.snapshot().revision, bRevision);
      assert.strictEqual(d.engine.snapshot().revision, dRevision);
      assert.strictEqual(bSnapshots.length, bCount);
      assert.strictEqual(dSnapshots.length, dCount);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("rejects a forged expected revision behind a queued consumer command", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: MutableContextApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const offered = yield* Deferred.make<void>();
      let commands = 0;

      const { a, b, d, dSnapshots } = yield* makeMutableContextChain(
        assembly,
        "expected-revision",
        () =>
          Effect.gen(function* () {
            commands += 1;

            if (commands === 1) {
              yield* Deferred.succeed(started, undefined);
              yield* Deferred.await(release);
            }
          }),
      );

      yield* assembly.contextCoordinator.drain();
      const beforeD = dSnapshots.length;
      const firstCommand = b.engine.dispatch(MutableContextConsumerEvent);
      assert.strictEqual(firstCommand.admitted, true);
      yield* Deferred.await(started);
      const secondCommand = b.engine.dispatch(MutableContextConsumerEvent);
      assert.strictEqual(secondCommand.admitted, true);
      const expectedRevision = b.engine.snapshot().revision;
      const actualOffer = b.engine.dispatchContextTicket;

      b.engine.dispatchContextTicket = (fact, attestation) => {
        assert.strictEqual(attestation.expectedRevision, expectedRevision);
        attestation.expectedRevision += 1;
        Deferred.doneUnsafe(offered, Effect.void);

        return actualOffer(fact, attestation);
      };

      const providerEvent = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(providerEvent.admitted, true);
      yield* Deferred.await(providerEvent.completion);
      yield* a.engine.drain();
      yield* Deferred.await(offered);

      const waiting = yield* Effect.forkChild(assembly.contextCoordinator.drain(), {
        startImmediately: true,
      });

      yield* Effect.yieldNow;
      yield* Deferred.succeed(release, undefined);
      yield* b.engine.drain();
      const receipts = yield* Fiber.join(waiting);

      assert.strictEqual(b.engine.snapshot().revision, expectedRevision + 1);
      assert.strictEqual(receipts[0]?.outcomes.get(b.fence.key), "stale");
      assert.strictEqual(receipts[0]?.outcomes.get(d.fence.key), "blocked");
      assert.strictEqual(
        b.engine.snapshot().context.providerState.state,
        IntegrationProviderDefinition.S.ready,
      );
      assert.strictEqual(dSnapshots.length, beforeD);
      b.engine.dispatchContextTicket = actualOffer;
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("rejects an in-place consumer fence mutation without changing actor identity", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const { a, b, d, bSnapshots, dSnapshots } = yield* makeContextDiamond(
        assembly,
        "fence-alias",
      );

      const generation = b.fence.generation;
      const actualOffer = b.engine.dispatchContextTicket;

      b.engine.dispatchContextTicket = (fact, attestation) => {
        attestation.consumerFence.generation += 1;

        return actualOffer(fact, attestation);
      };

      const dispatched = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(dispatched.admitted, true);
      yield* Deferred.await(dispatched.completion);
      yield* a.engine.drain();
      const receipts = yield* assembly.contextCoordinator.drain();
      assert.strictEqual(receipts[0]?.outcomes.get(b.fence.key), "stale");
      assert.strictEqual(receipts[0]?.outcomes.get(d.fence.key), "blocked");
      assert.strictEqual(b.fence.generation, generation);
      assert.strictEqual(bSnapshots.length, 0);
      assert.strictEqual(dSnapshots.length, 0);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("rejects an old fence after production stable-ref re-admission", () =>
    Effect.gen(function* () {
      const registered = yield* Deferred.make<void>();
      const exposeGate = yield* Deferred.make<void>();
      const pendingCleared = yield* Deferred.make<void>();
      let exposeAttempts = 0;

      const runtime = runtimeSetupForAdmissionTest({
        app: IntegrationApp,
        admissionProbe: {
          beforeExpose: Effect.gen(function* () {
            exposeAttempts += 1;

            if (exposeAttempts === 1) {
              yield* Deferred.succeed(registered, undefined);
              yield* Effect.interruptible(Deferred.await(exposeGate));
            }
          }),
          onPendingCleared: () => Deferred.doneUnsafe(pendingCleared, Effect.succeed(undefined)),
        },
      }).construct();

      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const providerRef = actorRef(IntegrationProviderMachine, "production-replacement-provider", {
        persist: true,
      });

      const actualRegister = assembly.contextCoordinator.register;
      let oldFence: ActorFence | undefined;

      assembly.contextCoordinator.register = (node) => {
        oldFence = { ...node.fence };
        actualRegister(node);
      };

      const first = yield* Effect.forkChild(
        assembly.ensureActor(providerRef, { initial: initialProviderSnapshot() }),
        { startImmediately: true },
      );

      yield* Deferred.await(registered);
      assert.ok(oldFence !== undefined);
      yield* Effect.exit(Fiber.interrupt(first));
      const firstExit = yield* Fiber.await(first);
      assert.ok(Exit.isFailure(firstExit));
      yield* Deferred.await(pendingCleared);

      assembly.contextCoordinator.register = actualRegister;

      const replacement = yield* assembly.ensureActor(providerRef, {
        initial: initialProviderSnapshot(),
      });

      assert.strictEqual(exposeAttempts, 2);
      assert.deepStrictEqual(replacement.identity.ref, providerRef);
      assert.strictEqual(replacement.fence.key, oldFence.key);
      assert.notStrictEqual(replacement.fence.incarnation, oldFence.incarnation);

      assembly.contextCoordinator.notify(oldFence, replacement.engine.snapshot());
      assert.deepStrictEqual(yield* assembly.contextCoordinator.drain(), []);

      assembly.contextCoordinator.notify(replacement.fence, replacement.engine.snapshot());
      const receipts = yield* assembly.contextCoordinator.drain();
      assert.strictEqual(receipts.length, 1);
      assert.strictEqual(receipts[0]?.origin.fence.key, replacement.fence.key);
      assert.strictEqual(receipts[0]?.origin.fence.incarnation, replacement.fence.incarnation);
      assert.strictEqual(receipts[0]?.origin.revision, replacement.engine.snapshot().revision);

      yield* Effect.provideContext(replacement.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("isolates onSnapshot mutation from coordinator publication state", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const callbackSnapshots: IntegrationConsumerSnapshot[] = [];

      const { a, b, d, dSnapshots } = yield* makeContextDiamond(assembly, "snapshot-callback", {
        bOnCommand: () => Effect.void,
        cOnSnapshot: () => {},
        bOnSnapshot: (snapshot) => {
          callbackSnapshots.push(snapshot);
          assert.strictEqual(
            Reflect.set(snapshot.context, "providerState", IntegrationProviderDefinition.S.final),
            true,
          );
          snapshot.revision = 99;
        },
      });

      const dispatched = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(dispatched.admitted, true);
      yield* Deferred.await(dispatched.completion);
      yield* a.engine.drain();
      yield* assembly.contextCoordinator.drain();
      yield* b.engine.drain();
      yield* d.engine.drain();

      assert.strictEqual(callbackSnapshots.length, 1);
      assert.strictEqual(
        callbackSnapshots[0]?.context.providerState,
        IntegrationProviderDefinition.S.final,
      );
      assert.strictEqual(callbackSnapshots[0]?.revision, 99);
      assert.notStrictEqual(callbackSnapshots[0], b.engine.snapshot());
      assert.strictEqual(
        b.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.changed,
      );
      assert.strictEqual(
        d.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.changed,
      );
      assert.strictEqual(dSnapshots.length, 1);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("deeply owns diagnostic data across an onSnapshot callback", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const callbackSnapshots: ActorSnapshot<typeof IntegrationStandaloneDefinition>[] = [];
      const mutationResults: boolean[] = [];

      const actor = yield* assembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "nested-diagnostic-callback"),
        initial: initialStandaloneSnapshot(),
        onSnapshot: (snapshot) => {
          if (snapshot.issues.length === 0) return;
          callbackSnapshots.push(snapshot);
          const issue = snapshot.issues[0];

          if (issue === undefined) return;
          mutationResults.push(Reflect.set(issue.path, 0, "callback-mutated"));
          mutationResults.push(Reflect.set(issue.details, "reason", "callback-mutated"));
        },
      });

      const dispatched = actor.engine.dispatchFact({
        _tag: "timer-projection",
        fence: actor.fence,
        name: "invalid",
        startedAt: 2,
        dueAt: 1,
      });

      assert.ok(Result.isSuccess(dispatched));
      yield* actor.engine.drain();
      assert.strictEqual(callbackSnapshots.length, 1);
      assert.deepStrictEqual(mutationResults, [false, false]);
      assert.deepStrictEqual(actor.engine.snapshot().issues[0]?.path, ["projection", "timer"]);
      assert.deepStrictEqual(actor.engine.snapshot().issues[0]?.details, {});
      assert.deepStrictEqual(callbackSnapshots[0]?.issues[0]?.path, ["projection", "timer"]);
      assert.deepStrictEqual(callbackSnapshots[0]?.issues[0]?.details, {});

      yield* Effect.provideContext(actor.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("always owns empty-context snapshots across query and callback boundaries", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const callbackSnapshots: ActorSnapshot<typeof IntegrationStandaloneDefinition>[] = [];

      const actor = yield* assembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "empty-context-snapshot-copy"),
        initial: initialStandaloneSnapshot(),
        onSnapshot: (snapshot) => {
          callbackSnapshots.push(snapshot);
          Reflect.set(snapshot.memory, "callbackNested", { value: "forged" });
          snapshot.revision = 99;
        },
      });

      const queried = actor.engine.snapshot();
      assert.strictEqual(Reflect.set(queried.memory, "queryNested", { value: "forged" }), false);
      assert.strictEqual(Reflect.set(queried, "revision", 77), false);
      const afterQuery = actor.engine.snapshot();

      assert.strictEqual(afterQuery.revision, 0);
      assert.strictEqual(Reflect.has(afterQuery.memory, "queryNested"), false);

      const dispatched = actor.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(dispatched.admitted, true);
      yield* Deferred.await(dispatched.completion);
      yield* actor.engine.drain();

      const committed = actor.engine.snapshot();
      assert.strictEqual(committed.revision, 1);
      assert.strictEqual(Reflect.has(committed.memory, "callbackNested"), false);
      assert.ok(callbackSnapshots.length > 0);
      const callbackSnapshot = callbackSnapshots[callbackSnapshots.length - 1];
      assert.ok(callbackSnapshot !== undefined);
      assert.strictEqual(callbackSnapshot.revision, 99);
      assert.strictEqual(Reflect.has(callbackSnapshot.memory, "callbackNested"), true);

      yield* Effect.provideContext(actor.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("does not commit a no-projection selection after its provider is invalidated", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const { a, b, d } = yield* makeContextDiamond(assembly, "no-projection-invalidation");
      const scope = yield* Scope.make("sequential");
      const coordinator = yield* makeContextCoordinator(scope);
      let commits = 0;

      const unusedOffer = () =>
        Result.fail(
          Failure({
            code: "MissingContextProvider",
            path: ["context", "provider"],
            details: {},
            summary: "No projection should be offered.",
            help: "Keep this path in the no-projection phase.",
          }),
        );

      coordinator.register({
        ref: a.engine.ref,
        fence: a.fence,
        providers: [],
        snapshot: a.engine.snapshot,
        plan: () =>
          Result.succeed({ phase: "no-projection" as const, commit: () => {}, defective: false }),
        offer: unusedOffer,
      });
      coordinator.register({
        ref: b.engine.ref,
        fence: b.fence,
        providers: [{ key: a.fence.key, slot: "providerState" }],
        snapshot: b.engine.snapshot,
        plan: () => {
          coordinator.setOpen(a.fence.key, false);

          return Result.succeed({
            phase: "no-projection" as const,
            commit: () => {
              commits += 1;
            },
            defective: false,
          });
        },
        offer: unusedOffer,
      });
      coordinator.register({
        ref: d.engine.ref,
        fence: d.fence,
        providers: [{ key: b.fence.key, slot: "providerState" }],
        snapshot: d.engine.snapshot,
        plan: () =>
          Result.succeed({ phase: "no-projection" as const, commit: () => {}, defective: false }),
        offer: unusedOffer,
      });
      coordinator.setOpen(a.fence.key, true);
      coordinator.setOpen(b.fence.key, true);
      coordinator.setOpen(d.fence.key, true);
      coordinator.notify(a.fence, a.engine.snapshot());
      const receipts = yield* coordinator.drain();
      assert.strictEqual(receipts[0]?.outcomes.get(b.fence.key), "stale");
      assert.strictEqual(receipts[0]?.outcomes.get(d.fence.key), "blocked");
      assert.strictEqual(commits, 0);
      yield* coordinator.close();
      yield* Scope.close(scope, Exit.void);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("invalidates an offered wave when its provider is unregistered", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const offered = yield* Deferred.make<void>();

      const { a, b, d, dSnapshots } = yield* makeContextDiamond(assembly, "unregister", {
        cOnSnapshot: () => {},
        bOnCommand: () =>
          Effect.gen(function* () {
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(release);
          }),
      });

      assert.strictEqual(b.engine.dispatch(IntegrationConsumerEvent).admitted, true);
      yield* Deferred.await(started);
      yield* assembly.contextCoordinator.drain();
      const actualOffer = b.engine.dispatchContextTicket;
      b.engine.dispatchContextTicket = (...args) => {
        Deferred.doneUnsafe(offered, Effect.void);

        return actualOffer(...args);
      };

      const dispatched = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(dispatched.admitted, true);
      yield* Deferred.await(dispatched.completion);
      yield* a.engine.drain();
      yield* Deferred.await(offered);

      const waiting = yield* Effect.forkChild(assembly.contextCoordinator.drain(), {
        startImmediately: true,
      });

      yield* Effect.yieldNow;
      assembly.contextCoordinator.unregister(b.fence.key);
      const receipts = yield* Fiber.join(waiting);
      assert.strictEqual(receipts[0]?.outcomes.get(b.fence.key), "stale");
      assert.strictEqual(receipts[0]?.outcomes.get(d.fence.key), "blocked");
      assert.strictEqual(dSnapshots.length, 0);
      yield* Deferred.succeed(release, undefined);
      yield* b.engine.drain();
      assert.strictEqual(
        b.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.ready,
      );
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("settles captured context receipts across graph changes and shutdown", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const offered = yield* Deferred.make<void>();

      const { a, b, c, d, dSnapshots } = yield* makeContextDiamond(assembly, "invalidate", {
        cOnSnapshot: () => {},
        bOnCommand: () =>
          Effect.gen(function* () {
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(release);
          }),
      });

      assert.strictEqual(b.engine.dispatch(IntegrationConsumerEvent).admitted, true);
      yield* Deferred.await(started);
      yield* assembly.contextCoordinator.drain();
      const actualOffer = b.engine.dispatchContextTicket;
      b.engine.dispatchContextTicket = (...args) => {
        Deferred.doneUnsafe(offered, Effect.void);

        return actualOffer(...args);
      };

      const published = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(published.admitted, true);
      yield* Deferred.await(published.completion);
      yield* a.engine.drain();
      yield* Deferred.await(offered);

      const waiting = yield* Effect.forkChild(assembly.contextCoordinator.drain(), {
        startImmediately: true,
      });

      yield* Effect.yieldNow;
      assembly.contextCoordinator.setOpen(b.fence.key, false);
      const graphReceipts = yield* Fiber.join(waiting);
      assert.strictEqual(graphReceipts[0]?.outcomes.get(b.fence.key), "stale");
      assert.strictEqual(graphReceipts[0]?.outcomes.get(c.fence.key), "stale");
      assert.strictEqual(graphReceipts[0]?.outcomes.get(d.fence.key), "blocked");
      yield* Deferred.succeed(release, undefined);
      yield* b.engine.drain();
      assert.strictEqual(
        b.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.ready,
      );
      assert.strictEqual(dSnapshots.length, 0);
      b.engine.dispatchContextTicket = actualOffer;
      yield* runtimeOwner(runtime).close();
      assert.strictEqual(d.engine.snapshot().lifecycle, "disposed");

      const secondRuntime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* secondRuntime.ready();
      const secondAssembly = runtimeOwner(secondRuntime).assembly();
      const secondStarted = yield* Deferred.make<void>();
      const secondRelease = yield* Deferred.make<void>();
      const secondOffered = yield* Deferred.make<void>();

      const second = yield* makeContextDiamond(secondAssembly, "shutdown", {
        cOnSnapshot: () => {},
        bOnCommand: () =>
          Effect.gen(function* () {
            yield* Deferred.succeed(secondStarted, undefined);
            yield* Deferred.await(secondRelease);
          }),
      });

      assert.strictEqual(second.b.engine.dispatch(IntegrationConsumerEvent).admitted, true);
      yield* Deferred.await(secondStarted);
      yield* secondAssembly.contextCoordinator.drain();
      const secondOffer = second.b.engine.dispatchContextTicket;
      second.b.engine.dispatchContextTicket = (...args) => {
        Deferred.doneUnsafe(secondOffered, Effect.void);

        return secondOffer(...args);
      };

      const firstRoot = second.a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(firstRoot.admitted, true);
      yield* Deferred.await(firstRoot.completion);
      yield* second.a.engine.drain();
      yield* Deferred.await(secondOffered);
      const pendingRoot = second.a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(pendingRoot.admitted, true);
      yield* Deferred.await(pendingRoot.completion);
      yield* second.a.engine.drain();

      const captured = yield* Effect.forkChild(
        Effect.exit(secondAssembly.contextCoordinator.drain()),
        { startImmediately: true },
      );

      yield* Effect.yieldNow;

      const closing = yield* Effect.forkChild(runtimeOwner(secondRuntime).close(), {
        startImmediately: true,
      });

      const drainExit = yield* Fiber.join(captured);
      assert.ok(Exit.isFailure(drainExit));
      yield* Deferred.succeed(secondRelease, undefined);
      yield* Fiber.join(closing);
      assert.strictEqual(second.b.engine.snapshot().lifecycle, "disposed");
      assert.strictEqual(second.d.engine.snapshot().lifecycle, "disposed");
    }),
  );

  it.effect("tracks queued reconcile waves through drain and close", () =>
    Effect.gen(function* () {
      for (const mode of ["drain", "close"] as const) {
        const runtime = runtimeSetup({ app: IntegrationApp }).construct();
        yield* runtime.ready();
        const assembly = runtimeOwner(runtime).assembly();
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const offered = yield* Deferred.make<void>();

        const { a, b, d } = yield* makeContextDiamond(assembly, `reconcile-${mode}`, {
          cOnSnapshot: () => {},
          bOnCommand: () =>
            Effect.gen(function* () {
              yield* Deferred.succeed(started, undefined);
              yield* Deferred.await(release);
            }),
        });

        assert.strictEqual(b.engine.dispatch(IntegrationConsumerEvent).admitted, true);
        yield* Deferred.await(started);
        yield* assembly.contextCoordinator.drain();
        const actualOffer = b.engine.dispatchContextTicket;
        b.engine.dispatchContextTicket = (...args) => {
          Deferred.doneUnsafe(offered, Effect.void);

          return actualOffer(...args);
        };

        const dispatched = a.engine.dispatch(IntegrationProviderEvent);
        assert.strictEqual(dispatched.admitted, true);
        yield* Deferred.await(dispatched.completion);
        yield* a.engine.drain();
        yield* Deferred.await(offered);

        const reconciling = yield* Effect.forkChild(
          Effect.exit(assembly.contextCoordinator.reconcile(d.fence.key)),
          { startImmediately: true },
        );

        yield* Effect.yieldNow;

        const draining = yield* Effect.forkChild(Effect.exit(assembly.contextCoordinator.drain()), {
          startImmediately: true,
        });

        yield* Effect.yieldNow;

        if (mode === "drain") {
          yield* Deferred.succeed(release, undefined);
          const drained = yield* Fiber.join(draining);
          assert.ok(Exit.isSuccess(drained));

          if (Exit.isSuccess(drained)) {
            assert.strictEqual(drained.value.length, 2);
            assert.ok(drained.value[0]!.origin.generation < drained.value[1]!.origin.generation);
          }

          yield* Fiber.join(reconciling);
          yield* runtimeOwner(runtime).close();
        } else {
          const closing = yield* Effect.forkChild(runtimeOwner(runtime).close(), {
            startImmediately: true,
          });

          assert.ok(Exit.isFailure(yield* Fiber.join(draining)));
          yield* Deferred.succeed(release, undefined);
          yield* Fiber.join(closing);
          assert.ok(Exit.isFailure(yield* Fiber.join(reconciling)));
          assert.strictEqual(d.engine.snapshot().lifecycle, "disposed");
        }
      }
    }),
  );

  it.effect("drains captured context generations while newer roots continue arriving", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const bStarted = yield* Deferred.make<void>();
      const bRelease = yield* Deferred.make<void>();
      const fStarted = yield* Deferred.make<void>();
      const fRelease = yield* Deferred.make<void>();
      const bOffered = yield* Deferred.make<void>();

      const { a, b, c, d } = yield* makeContextDiamond(assembly, "drain", {
        cOnSnapshot: () => {},
        bOnCommand: () =>
          Effect.gen(function* () {
            yield* Deferred.succeed(bStarted, undefined);
            yield* Deferred.await(bRelease);
          }),
      });

      const eRef = actorRef(IntegrationProviderMachine, "drain-e");
      const e = yield* assembly.createActor({ ref: eRef, initial: initialProviderSnapshot() });

      const f = yield* assembly.createActor({
        ref: actorRef(IntegrationConsumerMachine, "drain-f"),
        initial: initialConsumerSnapshot(),
        bindings: [
          {
            slot: "providerState",
            provider: eRef,
            providerFence: e.fence,
            select: ({ state }) => state,
          },
          {
            slot: "providerChanged",
            provider: eRef,
            providerFence: e.fence,
            select: ({ state }) => state === IntegrationProviderDefinition.S.changed,
          },
        ],
        onCommand: () =>
          Effect.gen(function* () {
            yield* Deferred.succeed(fStarted, undefined);
            yield* Deferred.await(fRelease);
          }),
      });

      assert.strictEqual(b.engine.dispatch(IntegrationConsumerEvent).admitted, true);
      assert.strictEqual(f.engine.dispatch(IntegrationConsumerEvent).admitted, true);
      yield* Deferred.await(bStarted);
      yield* Deferred.await(fStarted);
      yield* assembly.contextCoordinator.drain();
      const actualOffer = b.engine.dispatchContextTicket;
      b.engine.dispatchContextTicket = (...args) => {
        Deferred.doneUnsafe(bOffered, Effect.void);

        return actualOffer(...args);
      };

      const first = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(first.admitted, true);
      yield* Deferred.await(first.completion);
      yield* a.engine.drain();
      yield* Deferred.await(bOffered);
      const second = a.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(second.admitted, true);
      yield* Deferred.await(second.completion);
      yield* a.engine.drain();

      const draining = yield* Effect.forkChild(assembly.contextCoordinator.drain(), {
        startImmediately: true,
      });

      yield* Effect.yieldNow;
      // The real provider has reached its final state; a duplicate notification still owns a distinct latest root.
      assembly.contextCoordinator.notify(a.fence, a.engine.snapshot());

      const drainingLatest = yield* Effect.forkChild(assembly.contextCoordinator.drain(), {
        startImmediately: true,
      });

      yield* Effect.yieldNow;
      const later = e.engine.dispatch(IntegrationProviderEvent);
      assert.strictEqual(later.admitted, true);
      yield* Deferred.await(later.completion);
      yield* e.engine.drain();
      yield* Deferred.succeed(bRelease, undefined);
      const captured = yield* Fiber.join(draining);
      assert.deepStrictEqual(
        captured.map((receipt) => receipt.origin.revision),
        [1, 2],
      );
      const includingLatest = yield* Fiber.join(drainingLatest);
      assert.deepStrictEqual(
        includingLatest.map((receipt) => receipt.origin.revision),
        [1, 2, 2],
      );
      assert.strictEqual(
        f.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.ready,
      );
      yield* Deferred.succeed(fRelease, undefined);
      yield* assembly.contextCoordinator.drain();
      assert.strictEqual(
        f.engine.snapshot().context.providerState,
        IntegrationProviderDefinition.S.changed,
      );
      b.engine.dispatchContextTicket = actualOffer;
      yield* Effect.provideContext(f.dispose(), assembly.context);
      yield* Effect.provideContext(e.dispose(), assembly.context);
      yield* Effect.provideContext(d.dispose(), assembly.context);
      yield* Effect.provideContext(c.dispose(), assembly.context);
      yield* Effect.provideContext(b.dispose(), assembly.context);
      yield* Effect.provideContext(a.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("settles a captured latest root when its provider unregisters or quiesces", () =>
    Effect.gen(function* () {
      for (const mode of ["unregister", "quiesce"] as const) {
        const runtime = runtimeSetup({ app: IntegrationApp }).construct();
        yield* runtime.ready();
        const assembly = runtimeOwner(runtime).assembly();
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const offered = yield* Deferred.make<void>();

        const { a, b, dSnapshots } = yield* makeContextDiamond(assembly, `latest-${mode}`, {
          cOnSnapshot: () => {},
          bOnCommand: () =>
            Effect.gen(function* () {
              yield* Deferred.succeed(started, undefined);
              yield* Deferred.await(release);
            }),
        });

        assert.strictEqual(b.engine.dispatch(IntegrationConsumerEvent).admitted, true);
        yield* Deferred.await(started);
        yield* assembly.contextCoordinator.drain();
        const actualOffer = b.engine.dispatchContextTicket;
        b.engine.dispatchContextTicket = (...args) => {
          Deferred.doneUnsafe(offered, Effect.void);

          return actualOffer(...args);
        };

        const first = a.engine.dispatch(IntegrationProviderEvent);
        assert.strictEqual(first.admitted, true);
        yield* Deferred.await(first.completion);
        yield* a.engine.drain();
        yield* Deferred.await(offered);
        const second = a.engine.dispatch(IntegrationProviderEvent);
        assert.strictEqual(second.admitted, true);
        yield* Deferred.await(second.completion);
        yield* a.engine.drain();

        const capturedPending = yield* Effect.forkChild(
          Effect.exit(assembly.contextCoordinator.drain()),
          { startImmediately: true },
        );

        yield* Effect.yieldNow;
        assembly.contextCoordinator.notify(a.fence, a.engine.snapshot());

        const capturedLatest = yield* Effect.forkChild(
          Effect.exit(assembly.contextCoordinator.drain()),
          { startImmediately: true },
        );

        yield* Effect.yieldNow;

        if (mode === "unregister") assembly.contextCoordinator.unregister(a.fence.key);
        else yield* assembly.contextCoordinator.quiesce();

        yield* Deferred.succeed(release, undefined);
        const pendingExit = yield* Fiber.join(capturedPending);
        const latestExit = yield* Fiber.join(capturedLatest);

        for (const settled of [pendingExit, latestExit]) {
          if (Exit.isSuccess(settled))
            assert.ok(
              settled.value.every((receipt) => receipt.outcomes.get(b.fence.key) !== "published"),
              mode,
            );
        }

        assert.strictEqual(dSnapshots.length, 0);
        b.engine.dispatchContextTicket = actualOffer;
        yield* runtimeOwner(runtime).close();
      }
    }),
  );

  // Setup: Use the real diamond with B still inheriting A revision 0 and C inheriting A revision 1 after a rejected delivery; retain a suspended D and a fresh D ref with the same authored bindings.
  // Action: Attempt fresh D admission and existing D resume, then explicitly suspend/resume B to reconcile its current A revision-1 cut and retry both D routes.
  // Assert: Incoherent attempts fail finitely before exposure/admission opening with MissingContextProvider at the first authored conflicting contextBindings slot, provider=stale and coherent-cut details. B reconciliation reuses cached selection for A revision 1, advances private lineage even on no-op, and lets both D routes succeed coherently without a new A event.
  it.todo("rejects incoherent admission and resume until provider lineage reconciles");

  // Setup: Subscribe to a real assembled actor stream in its own Scope; use the first observed snapshot as a subscription handshake, then gate the reader with a Deferred. Record actual subscriber Scope finalization.
  // Action: While the reader is paused, complete several acknowledged actor turns and successful actor disposal; require disposal to finish before releasing the reader, then collect the remaining stream and close the subscriber Scope.
  // Assert: The reader receives the promised snapshots in publication order through disposed and then completes; actor disposal never waits for consumption, the subscriber lifetime releases once, and no drop/coalescing policy is invented to bound unread lag.
  it.effect(
    "preserves ordered snapshot delivery without making disposal wait for a slow reader",
    () =>
      Effect.gen(function* () {
        const runtime = runtimeSetup({ app: IntegrationApp }).construct();
        yield* runtime.ready();
        const assembly = runtimeOwner(runtime).assembly();

        const actor = yield* assembly.createActor({
          ref: actorRef(IntegrationProviderMachine, "slow-snapshot-reader"),
          initial: initialProviderSnapshot(),
        });

        const subscribed = yield* Deferred.make<void>();
        const releaseReader = yield* Deferred.make<void>();
        let subscriberFinalizations = 0;
        let reads = 0;

        const reader = Stream.unwrap(
          Effect.gen(function* () {
            const scope = yield* Effect.service(Scope.Scope);
            yield* Scope.addFinalizer(
              scope,
              Effect.sync(() => {
                subscriberFinalizations += 1;
              }),
            );

            return Stream.mapEffect(actor.engine.snapshots, (snapshot) =>
              Effect.gen(function* () {
                reads += 1;

                if (reads === 1) {
                  yield* Deferred.succeed(subscribed, undefined);
                  yield* Deferred.await(releaseReader);
                }

                return snapshot;
              }),
            );
          }),
        );

        const readerFiber = yield* Effect.forkChild(Stream.runCollect(reader), {
          startImmediately: true,
        });

        yield* Deferred.await(subscribed);

        const first = actor.engine.dispatch(IntegrationProviderEvent);
        assert.strictEqual(first.admitted, true);
        yield* Deferred.await(first.completion);
        const second = actor.engine.dispatch(IntegrationProviderEvent);
        assert.strictEqual(second.admitted, true);
        yield* Deferred.await(second.completion);
        yield* actor.engine.drain();
        yield* Effect.provideContext(actor.dispose(), assembly.context);
        assert.strictEqual(actor.engine.snapshot().lifecycle, "disposed");
        assert.strictEqual(reads, 1);
        yield* Deferred.succeed(releaseReader, undefined);

        const snapshots = yield* Fiber.join(readerFiber);
        assert.deepStrictEqual(
          snapshots.map((snapshot) => [snapshot.lifecycle, snapshot.state]),
          [
            ["active", IntegrationProviderDefinition.S.ready],
            ["active", IntegrationProviderDefinition.S.changed],
            ["active", IntegrationProviderDefinition.S.final],
            ["disposed", IntegrationProviderDefinition.S.final],
          ],
        );
        assert.deepStrictEqual(
          snapshots.map((snapshot) => snapshot.revision),
          [0, 1, 2, 3],
        );
        assert.strictEqual(subscriberFinalizations, 1);
        yield* runtimeOwner(runtime).close();
      }),
  );

  // Setup: Initialize the selected real private Journal near counter exhaustion through its construction input; start actual actor admission, observe its terminal-credit acquisition, then fail a later delegated attachment/acquisition before activation or acceptance of the start record.
  // Action: Await complete reverse rollback, create another real actor using the reclaimed capacity, accept an ordinary turn when headroom permits, and dispose the actor and runtime.
  // Assert: Failed admission releases its unused credit exactly once and exposes no actor or partial record; the next owner can use that headroom, accepted sequences remain contiguous in commit order, and close never waits on a credit whose acquisition was rolled back. Observe the real credit/acquisition capability, not a fabricated counter or public test setter.
  it.todo("releases unused terminal credit when actor admission rolls back");
});
