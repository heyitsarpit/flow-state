import { assert, describe, it } from "@effect/vitest";
import {
  Cause,
  Clock,
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Queue,
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
import type { ActorContextBinding } from "../actor-admission.js";
import { makeActorIdentityRegistry } from "../actor-admission.js";
import { makeEvidenceSink } from "../evidence.js";
import { ACTOR_MAILBOX_CAPACITY, prepareActorSnapshot } from "../actor-engine.js";
import type { ActorSnapshot, ActorStore, PreparedActorSnapshot } from "../actor-engine.js";
import type { EvidenceRecord } from "../evidence.js";
import { RuntimeClock, RuntimeEvidence, RuntimeScheduler } from "../runtime-services.js";
import { runtimeOwner, runtimeSetup } from "../runtime.js";
import { runtimeSetupForAdmissionTest, type RuntimeAdmissionPhase } from "../runtime-test-seam.js";

type IntegrationService = {
  name: "runtime-integration";
};

class IntegrationServiceKey extends Context.Service<IntegrationServiceKey, IntegrationService>()(
  "RuntimeIntegration/Service",
) {}

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

const IntegrationProviderEvent = Result.getOrThrow(IntegrationProviderDefinition.E.advance());

const IntegrationConsumerEvent = Result.getOrThrow(IntegrationConsumerDefinition.E.opened());

const IntegrationStandaloneEvent = Result.getOrThrow(IntegrationStandaloneDefinition.E.opened());

type IntegrationConsumerSnapshot = ActorSnapshot<typeof IntegrationConsumerDefinition>;

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

const restoredStandaloneSnapshot = (): PreparedActorSnapshot<
  typeof IntegrationStandaloneDefinition
> =>
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
): PreparedActorSnapshot<typeof IntegrationStandaloneDefinition> =>
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

      assert.ok(Result.isSuccess(assembly.evidence.hub.attach(sink)));

      let snapshots = 0;
      let commands = 0;
      const ref = actorRef(IntegrationStandaloneMachine, "restored", { persist: true });
      const restored = restoredStandaloneSnapshot();

      const actor = yield* assembly.createActor({
        ref,
        restore: restored,
        onSnapshot: () => {
          snapshots += 1;
        },
        onCommand: () => {
          commands += 1;

          return Effect.void;
        },
      });

      const visible = actor.engine.snapshot();
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

      yield* assembly.evidence.hub.drain();

      const lifecycleRecords = records.filter(
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

      assert.ok(Result.isSuccess(assembly.evidence.hub.attach(sink)));

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
        clock: unknown;
        scheduler: unknown;
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
            const clock = yield* Effect.service(RuntimeClock);
            const scheduler = yield* Effect.service(RuntimeScheduler);
            serviceObservations.push({
              evidenceHub: evidence.hub,
              clock,
              scheduler,
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
      assert.deepStrictEqual(receipt, { publicationRevision: 2, evidenceSequence: 5 });
      assert.strictEqual(serviceObservations.length, 1);
      assert.strictEqual(serviceObservations[0]?.evidenceHub, assembly.evidence.hub);
      assert.strictEqual(
        serviceObservations[0]?.clock,
        Context.get(assembly.context, RuntimeClock),
      );
      assert.strictEqual(
        serviceObservations[0]?.scheduler,
        Context.get(assembly.context, RuntimeScheduler),
      );

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
          "turn",
          "lifecycle",
          "turn",
          "lifecycle",
          "turn",
          "lifecycle",
          "lifecycle",
        ],
      );
      assert.deepStrictEqual(
        records.map((record) => record.sequence),
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
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

      assert.ok(Result.isSuccess(assembly.evidence.hub.attach(sink)));

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
      yield* assembly.evidence.hub.drain();

      const turnRecords = records.filter(
        (record): record is Extract<EvidenceRecord, { _tag: "turn" }> => record._tag === "turn",
      );

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
      yield* assembly.evidence.hub.drain();

      const allTurnRecords = records.filter(
        (record): record is Extract<EvidenceRecord, { _tag: "turn" }> => record._tag === "turn",
      );

      assert.strictEqual(commits, 2);
      assert.deepStrictEqual(retryReceipt, { publicationRevision: 2, evidenceSequence: 4 });
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

        assert.ok(Result.isSuccess(assembly.evidence.hub.attach(sink)));

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

        yield* assembly.evidence.hub.drain();

        const turnRecords = records.filter(
          (record): record is Extract<EvidenceRecord, { _tag: "turn" }> => record._tag === "turn",
        );

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

      assert.ok(Result.isSuccess(assembly.evidence.hub.attach(sink)));

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

      yield* assembly.evidence.hub.drain();

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

      yield* assembly.evidence.hub.drain();

      const consumerTurnRecords = evidenceRecords.filter(
        (record): record is Extract<EvidenceRecord, { _tag: "turn" }> =>
          record._tag === "turn" && record.provenance.actor.key === actor.fence.key,
      );

      assert.strictEqual(
        consumerTurnRecords.filter((record) => record.after.issues.length === 1).length,
        1,
      );
      assert.strictEqual(
        consumerTurnRecords.filter((record) => record.after.issues.length === 0).length,
        1,
      );
      assert.strictEqual(
        consumerTurnRecords[1]?.publicationRevision,
        selectorIssueRecord.publicationRevision + 1,
      );
      assert.strictEqual(consumerTurnRecords[1]?.machineTurnRevision, 0);

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

      assert.ok(Result.isSuccess(assembly.evidence.hub.attach(sink)));

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

      let dependentCleanups = 0;

      type ProviderRegistrationHooks = {
        removeDependent: (dependent: never) => void;
      };

      // SAFETY: The live runtime actor retains this package-private hook for the provider owner.
      // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- this proof observes the exact registered provider cleanup boundary.
      const providerRegistrationHooks = provider as unknown as ProviderRegistrationHooks;
      const originalRemoveDependent = providerRegistrationHooks.removeDependent;
      providerRegistrationHooks.removeDependent = (dependent) => {
        dependentCleanups += 1;
        originalRemoveDependent(dependent);
      };

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
      const originalPublish = runtimeEvidence.publish;

      const cleanupFailure = Failure({
        code: "InvariantViolation" as const,
        path: ["evidence", "publish"],
        details: { reason: "cleanup-test" },
        summary: "Lifecycle evidence publication failed.",
        help: "Retry cleanup after the evidence owner recovers.",
      });

      runtimeEvidence.publish = (snapshot) =>
        snapshot.fence.key === consumer.fence.key && snapshot.lifecycle === "disposed"
          ? Effect.fail(cleanupFailure)
          : originalPublish(snapshot);

      const firstDispose = yield* Effect.exit(
        Effect.provideContext(consumer.dispose(), assembly.context),
      );

      assert.ok(Exit.isFailure(firstDispose));

      if (Exit.isFailure(firstDispose)) {
        const reason = firstDispose.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        assert.strictEqual(reason.error, cleanupFailure);
        assert.deepStrictEqual(reason.error.path, ["evidence", "publish"]);
      }

      assert.strictEqual(consumer.engine.snapshot().lifecycle, "disposed");
      assert.strictEqual((yield* consumer.lifecycle.state()).lifecycle, "disposed");
      assert.strictEqual(
        Queue.offerUnsafe(consumer.engine.mailbox, {
          _tag: "command",
          fence: consumer.fence,
          command: IntegrationConsumerEvent,
        }),
        false,
      );
      assert.strictEqual(dependentCleanups, 1);
      assert.strictEqual((yield* provider.lifecycle.state()).attachment.dependencies.length, 0);

      runtimeEvidence.publish = originalPublish;
      yield* Effect.provideContext(consumer.dispose(), assembly.context);

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
        assert.strictEqual(reason.error.code, "DisposedActorRef");
      }

      yield* Effect.provideContext(provider.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
    }),
  );
});

describe("pending regression scenarios", () => {
  // Setup: Assemble provider P with active consumer C1 and suspended consumer C2, both bound to P; retain P's fence and C2's logical dependency edge.
  // Action: Attempt P.lifecycle.command({ _tag: "actor:dispose" }) and P's owner lease dispose; after each rejection dispatch P's advance event and resume C2.
  // Assert: Both attempts fail before mutation and identify every dependent actor ref and bound context key; P remains active and dispatchable, C1 receives the newest provider state, C2 resumes from its retained edge, and no tombstone or duplicate cleanup is emitted. Use separate route subcases so each begins with both active and suspended dependents.
  it.todo("rejected provider disposal leaves active and suspended dependents live");

  // Setup: Extend the existing active actor fixture with a pre-existing snapshot stream, onSnapshot callback, getter read, and evidence sink; capture the active snapshot and revisions before suspension.
  // Action: Issue actor:suspend through the assembled lifecycle controller, drain the pre-existing stream, callback, getter read, and evidence, then subscribe a late stream and collect its replay.
  // Assert: Every observer and the late subscriber report suspended from one captured cut, the public revision advances exactly once, the machine-turn revision is unchanged, and the retained active snapshot remains unchanged.
  it.todo("publishes lifecycle transitions through one coherent snapshot cut");

  // Setup: Create independent actors A and B in one assembled runtime and attach one evidence sink; leave B untouched while A processes one ordinary machine event.
  // Action: Drain A's turn evidence, suspend B, and drain the lifecycle evidence without resetting either actor or the runtime-global sequence allocator.
  // Assert: A's machine-turn revision advances only for A, B's suspend record retains B's prior machine-turn revision while its publication revision advances, and evidence sequences remain globally monotonic with actor-specific provenance.
  it.effect("keeps lifecycle evidence machine-turn revision actor-local", () =>
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

      assert.ok(Result.isSuccess(assembly.evidence.hub.attach(sink)));

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
      yield* assembly.evidence.hub.drain();

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
  // Action: Read the assembled RuntimeClock and publish an actor lifecycle transition, then drain lifecycle evidence without consulting wall time.
  // Assert: RuntimeClock.now and the LifecycleRecord timestamp equal the virtual clock value, and no Date.now epoch value appears in the assembled lifecycle evidence.
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

      assert.ok(Result.isSuccess(assembly.evidence.hub.attach(sink)));

      const actor = yield* assembly.createActor({
        ref: actorRef(IntegrationStandaloneMachine, "provided-clock"),
        initial: initialStandaloneSnapshot(),
      });

      const runtimeClock = Context.get(assembly.context, RuntimeClock);
      const expected = yield* Clock.currentTimeMillis;

      assert.strictEqual(yield* runtimeClock.now, expected);
      yield* Effect.provideContext(
        actor.lifecycle.command({
          _tag: "actor:suspend",
          cause: { _tag: "attachment" },
        }),
        assembly.context,
      );
      yield* assembly.evidence.hub.drain();

      const lifecycle = records.find(
        (record): record is Extract<EvidenceRecord, { _tag: "lifecycle" }> =>
          record._tag === "lifecycle" && record.provenance.actor.key === actor.fence.key,
      );

      assert.ok(lifecycle !== undefined);

      if (lifecycle !== undefined) assert.strictEqual(lifecycle.timestamp, expected);
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

        if (reason !== undefined) assert.strictEqual(reason.error.code, "DisposedActorRef");
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

        if (reason !== undefined) assert.strictEqual(reason.error.code, "DuplicateActorClaim");
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

  // Setup: Ready one assembled runtime, gate the leader after registration, and start a second createActor call for the same stable ref.
  // Action: Confirm the follower entered the shared Deferred join path, interrupt only that follower, then release the leader's exposure gate.
  // Assert: The follower reports interruption without DuplicateActorClaim; one leader runs each admission phase, clears pending state, exposes once, and remains discoverable by later lookup.
  it.effect("interrupts only a joined stable-admission follower", () =>
    Effect.gen(function* () {
      const exposeGate = yield* Deferred.make<void>();
      const joinSignal = yield* Deferred.make<void>();
      const phaseReady = yield* Deferred.make<void>();
      const pendingCleared = yield* Deferred.make<void>();
      const phases: RuntimeAdmissionPhase[] = [];
      let joined = 0;

      const runtime = runtimeSetupForAdmissionTest({
        app: IntegrationApp,
        admissionProbe: {
          beforeExpose: Deferred.await(exposeGate),
          onPhase: (phase) => {
            phases.push(phase);

            if (phase === "register") Deferred.doneUnsafe(phaseReady, Effect.succeed(undefined));
          },
          onJoin: () => {
            joined += 1;
            Deferred.doneUnsafe(joinSignal, Effect.succeed(undefined));
          },
          onPendingCleared: () => Deferred.doneUnsafe(pendingCleared, Effect.succeed(undefined)),
        },
      }).construct();

      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();

      const ref = actorRef(IntegrationStandaloneMachine, "joined-runtime-admission", {
        persist: true,
      });

      let exposures = 0;

      const leader = yield* Effect.forkChild(
        Effect.exit(
          assembly.createActor({
            ref,
            initial: initialStandaloneSnapshot(),
            onSnapshot: () => {
              exposures += 1;
            },
          }),
        ),
        { startImmediately: true },
      );

      const follower = yield* Effect.forkChild(
        Effect.exit(assembly.createActor({ ref, initial: initialStandaloneSnapshot() })),
        { startImmediately: true },
      );

      yield* Deferred.await(joinSignal);
      yield* Deferred.await(phaseReady);
      assert.strictEqual(joined, 1);
      assert.deepStrictEqual(phases, ["reserve", "prepare", "attach", "activate", "register"]);

      yield* Fiber.interrupt(follower);
      const followerExit = yield* Fiber.await(follower);
      assert.ok(Exit.isFailure(followerExit));

      if (Exit.isFailure(followerExit)) {
        assert.strictEqual(Cause.hasInterrupts(followerExit.cause), true);
        assert.strictEqual(Cause.hasFails(followerExit.cause), false);
        assert.strictEqual(followerExit.cause.reasons.some(Cause.isFailReason), false);
      }

      yield* Deferred.succeed(exposeGate, undefined);

      const leaderExit = yield* Fiber.join(leader);
      assert.ok(Exit.isSuccess(leaderExit));
      yield* Deferred.await(pendingCleared);

      if (Exit.isFailure(leaderExit)) return;
      const actor = leaderExit.value;
      assert.deepStrictEqual(phases, [
        "reserve",
        "prepare",
        "attach",
        "activate",
        "register",
        "expose",
      ]);
      assert.strictEqual(exposures, 0);

      const lookup = yield* Effect.exit(
        assembly.createActor({ ref, initial: initialStandaloneSnapshot() }),
      );

      assert.ok(Exit.isFailure(lookup));

      if (Exit.isFailure(lookup)) {
        const reason = lookup.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);

        if (reason !== undefined) assert.strictEqual(reason.error.code, "DuplicateActorClaim");
      }

      const dispatch = actor.engine.dispatch(IntegrationStandaloneEvent);
      assert.strictEqual(dispatch.admitted, true);
      yield* Deferred.await(dispatch.completion);
      yield* actor.engine.drain();
      assert.strictEqual(exposures, 1);
      yield* Effect.provideContext(actor.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
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

        if (reason !== undefined) assert.strictEqual(reason.error, prepareFailure);
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

        if (reason !== undefined) {
          assert.strictEqual(reason.error.code, "SchemaValidation");
          assert.deepStrictEqual(reason.error.path, ["actorAdmission"]);
          assert.deepStrictEqual(reason.error.details, { reason: "reflection" });
        }
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

        if (reason !== undefined) {
          assert.strictEqual(reason.error.code, "SchemaValidation");
          assert.deepStrictEqual(reason.error.path, ["actorAdmission"]);
          assert.deepStrictEqual(reason.error.details, { reason: "reflection" });
        }
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

        if (reason !== undefined) assert.strictEqual(reason.error.code, "DuplicateActorClaim");
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

        if (reason !== undefined) {
          assert.strictEqual(reason.error.code, "MissingActorRef");
          assert.deepStrictEqual(reason.error.details, { local: true, stable: false });
        }
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

        if (reason !== undefined) assert.strictEqual(reason.error.code, "MissingActorRef");
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

      if (overdueWork !== undefined) {
        const completed = yield* Fiber.await(overdueWork.fiber);
        assert.ok(Exit.isSuccess(completed));
      }

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

  // RET2: Use the assembled runtime owner with real actor scopes, a real evidence sink, and a registered provider failure. A failed actor release retains the actors and defers evidence/providers; the retry then drains evidence before providers and retains the later Cause.
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

      assert.ok(Result.isSuccess(assembly.evidence.hub.attach(sink)));

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

      assembly.lifecycle.registerProvider(
        Effect.gen(function* () {
          order.push("provider");
          yield* Effect.die(providerDefect);
        }),
      );

      const shutdown = yield* Effect.exit(runtimeOwner(runtime).close());
      assert.ok(Exit.isFailure(shutdown));
      assert.deepStrictEqual(order, ["assembled-second", "assembled-first"]);

      if (Exit.isFailure(shutdown)) {
        const defects = shutdown.cause.reasons
          .filter(Cause.isDieReason)
          .map((reason) => reason.defect);

        assert.deepStrictEqual(defects, [secondDefect, firstDefect]);
      }

      const retry = yield* Effect.exit(runtimeOwner(runtime).close());
      assert.ok(Exit.isFailure(retry));
      assert.deepStrictEqual(order.slice(0, 2), ["assembled-second", "assembled-first"]);
      assert.strictEqual(order.at(-1), "provider");
      assert.ok(order.slice(2, -1).length > 0);
      assert.ok(order.slice(2, -1).every((entry) => entry === "sink-delivery"));

      if (Exit.isFailure(retry)) {
        const defects = retry.cause.reasons
          .filter(Cause.isDieReason)
          .map((reason) => reason.defect);

        assert.deepStrictEqual(defects, [providerDefect]);
      }
    }),
  );

  // Setup: Assemble one real actor Scope whose finalizer fails once during runtime shutdown and a real evidence sink.
  // Action: Close the runtime, retain the failed actor Exit, then retry the same production owner close.
  // Assert: The first close retains the actor Cause and does not drain the sink; the retry releases the retained actor registration, drains evidence, and does not replay the actor finalizer.
  it.effect("retries a failed assembled actor release before evidence close", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: IntegrationApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const order: string[] = [];
      const defect = new Error("retryable-assembled-actor");
      const entered = yield* Deferred.make<void>();

      const sink = yield* makeEvidenceSink({
        id: "assembled-retryable-release",
        capacity: 16,
        deliver: () => Effect.sync(() => order.push("sink-delivery")),
      });

      assert.ok(Result.isSuccess(assembly.evidence.hub.attach(sink)));

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
      assert.deepStrictEqual(order, ["actor-finalizer"]);
      assert.strictEqual(Deferred.isDoneUnsafe(entered), true);

      if (Exit.isFailure(first)) {
        const defects = first.cause.reasons
          .filter(Cause.isDieReason)
          .map((reason) => reason.defect);

        assert.deepStrictEqual(defects, [defect]);
      }

      const second = yield* Effect.exit(runtimeOwner(runtime).close());
      assert.ok(Exit.isSuccess(second));
      assert.strictEqual(order[0], "actor-finalizer");
      assert.ok(order.slice(1).length > 0);
      assert.ok(order.slice(1).every((entry) => entry === "sink-delivery"));
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

      assert.ok(Result.isSuccess(assembly.evidence.hub.attach(sink)));

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

  // Setup: Attach a real runtime evidence sink whose first delivery blocks, capture the accepted prefix, and start a hub drain at that prefix.
  // Action: While delivery of the captured record is blocked, admit and accept a newer actor lifecycle or turn record, then release the first delivery.
  // Assert: The drain completes at the captured prefix, the newer record remains queued for the next drain, accepted records retain order and detached payload copies, and sink retention never blocks actor publication.
  it.todo("drains a captured evidence prefix while newer runtime records arrive");

  // SETUP: Assemble a real runtime with one actor, an attached bounded evidence sink whose deliver callback is gated, and an onCommand callback that records when user work begins.
  // ACTION: Dispatch one event and await its private acknowledgement before starting the evidence hub drain; then drain the sink and release its callback.
  // ASSERT: The receipt contains the committed publication/evidence sequence, user work has started after acknowledgement, sink delivery has not started before the explicit drain, and sink failure or delay cannot change the committed actor/store snapshot.
  it.todo("keeps sink delivery after the committed-turn acknowledgement");

  // SETUP: Assemble the real provider/consumer owners with two bindings: providerState maps ready to ready and every later state to changed, while providerChanged throws only at changed; record every consumer snapshot and its issue list.
  // ACTION: Advance the provider to changed, drain provider and consumer, then advance it to final and drain again; use a Deferred or explicit engine drains, never a sleep.
  // ASSERT: The first wave publishes one issue-only consumer snapshot retaining ready/false and does not expose providerState=changed; the second newer revision clears the issue and publishes changed/false exactly once, proving the valid sibling update was not lost or prematurely committed.
  it.todo(
    "retains all last-valid context slots through a sibling selector defect and recovers on a newer provider revision",
  );

  // SETUP: Assemble four real actors in a diamond A->B and A->C, with D bound to one selected slot from B and one from C; collect callback snapshots and provider revisions for every actor.
  // ACTION: Commit one A provider update, drain the bounded dependency wave to quiescence, and inspect the ordered publication callbacks and evidence records.
  // ASSERT: B and C each receive at most one combined context turn; D publishes at most once after both latest upstream values are available; no D snapshot contains B-new/C-old or B-old/C-new; all cross-actor delivery follows A's initiating publication/evidence/ack boundary.
  it.todo("propagates one diamond wave without an intermediate context cut");

  // SETUP: Assemble provider A with independent dependents B and C, fill B's real mailbox to its documented bound, and leave C healthy; record each provider/consumer snapshot and context delivery result.
  // ACTION: Publish A revision 1, capture the provider completion and the exact context delivery failure, attempt both dependents, then release and drain B; publish a strictly newer A revision 2 and drain the wave again.
  // ASSERT: A's committed snapshot, evidence, acknowledgement, and future synchronous admission survive; B receives no revision-1 projection and its last-valid context/ledger stays unchanged; C receives revision 1 once; the failed B lane retains InvariantViolation at ["mailbox","full"] without inventing an issue publication into B's full queue; after B is freed, A revision 2 reaches B and C with the new value.
  it.todo("isolates one full context dependent while preserving a healthy fanout peer");

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

  // Setup: Build the real A-to-B/C-to-D diamond plus a healthy C-to-F branch; fill B's mailbox, publish A revision 1, and let C commit while B retains its A revision-0 lineage.
  // Action: After the failed wave settles, release/drain B's blocked queue without retriggering A; publish ordinary local B and C events separately and drain each. Then publish A revision 2 and enqueue an ordinary B event immediately after its projection ticket completes but before the coordinator observes that completion.
  // Assert: Draining B's queue does not clear A delivery debt. D keeps its prior complete cut through unrelated local events while F follows healthy C. Matching ancestor reconciliation publishes coherent D cuts with the latest local state. B inherits lineage atomically installed before its ticket, never stale coordinator metadata; no B-old/C-new combination or same-cut selector retry appears.
  it.todo("holds diamond descendants when an upstream context delivery is rejected");

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
        originalMachines.forEach((machine, index) => Reflect.set(exposedMachines, index, machine));
        Reflect.set(exposedDescriptors, "length", originalDescriptors.length);
        originalDescriptors.forEach((descriptor, index) =>
          Reflect.set(exposedDescriptors, index, descriptor),
        );

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
  it.todo("preserves fresh and restored revision baselines before later lifecycle cuts");

  // Setup: Use an active real actor with recording attachments and a provided Clock that fails its next lifecycle read. In a separate subcase admit the boundary publication counter through real private owner construction or restore input.
  // Action: Request suspension/disposal through the real lifecycle owner and observe preflight failure, then remove the clock fault or use a separately valid counter fixture for a later attempt.
  // Assert: Rejection runs no cancellation/finalizer/subscription removal, graph mutation or admission closure and accepts no partial cut/sequence. The valid attempt executes once; use constructor inputs or an actual private counter owner, never a public test-only setter.
  it.todo("rejects lifecycle publication preflight before changing admission or resources");

  // Setup: Initialize the real private Journal near safe-integer exhaustion with two real actor owners, their reserved terminal credits and one lifecycle outcome credit; hold one actor cleanup at a Deferred.
  // Action: Start the lifecycle operation, consume unreserved ordinary capacity from the other actor, attempt one extra ordinary cut, then release cleanup and close the runtime.
  // Assert: The extra ordinary cut fails before store/publication mutation; held cleanup and terminal records finalize in actual gate order without wrap or reuse. Another actor progresses during gated cleanup; close waits for credit owners, settles acknowledgements, drains terminal records and closes once.
  it.todo("preserves terminal publication capacity while lifecycle cleanup is in flight");

  // Setup: Build the real A-to-B/C-to-D diamond and hold one projection after wave capture at the internal coordinator/mailbox capability; record every D snapshot.
  // Action: In separate subcases publish an ordinary intermediate-actor event or suspend B before the held ticket commits; settle the captured wave, then provide a strictly newer matching input or resume reconciliation.
  // Assert: The affected ticket is explicitly stale/suspended, D retains its prior complete cut, independent C may finish and the first drain terminates. One later valid wave recovers without rerunning a defective selector at an identical provider cut.
  it.todo("blocks stale or suspended diamond tickets without substituting a newer live cut");

  // Setup: Hold a real dependency wave with its captured graph generation, one active and one pending root receipt; admit an independent actor and retain every accepted projection acknowledgement.
  // Action: Suspend the affected delivery owner through its legal lifecycle route, then shut down while another projection is queued.
  // Assert: Invalidated graph/fence data never reaches affected descendants; independent branches settle. Active, pending and queued tickets all receive explicit outcomes and actor/coordinator lifetimes release once without a mailbox, lifecycle or coordinator wait cycle.
  it.todo("settles captured context receipts across graph changes and shutdown");

  // Setup: Gate a real active wave, queue a second pending root generation, call drain and retain the captured receipt identities.
  // Action: Release the active wave, wait for the pending generation capture handshake, publish further roots, then gate their later generation.
  // Assert: The original drain finishes when its captured generations settle while the later generation remains gated. Pre-capture updates coalesce once, each delivered vector is coherent, and completed receipts are dropped from coordinator ownership rather than retained in a history.
  it.todo("drains captured context generations while newer roots continue arriving");

  // Setup: Use the real diamond with B still inheriting A revision 0 and C inheriting A revision 1 after a rejected delivery; retain a suspended D and a fresh D ref with the same authored bindings.
  // Action: Attempt fresh D admission and existing D resume, then explicitly suspend/resume B to reconcile its current A revision-1 cut and retry both D routes.
  // Assert: Incoherent attempts fail finitely before exposure/admission opening with MissingContextProvider at the first authored conflicting contextBindings slot, provider=stale and coherent-cut details. B reconciliation reuses cached selection for A revision 1, advances private lineage even on no-op, and lets both D routes succeed coherently without a new A event.
  it.todo("rejects incoherent admission and resume until provider lineage reconciles");

  // Setup: Subscribe to a real assembled actor stream in its own Scope; use the first observed snapshot as a subscription handshake, then gate the reader with a Deferred. Record actual subscriber Scope finalization.
  // Action: While the reader is paused, complete several acknowledged actor turns and successful actor disposal; require disposal to finish before releasing the reader, then collect the remaining stream and close the subscriber Scope.
  // Assert: The reader receives the promised snapshots in publication order through disposed and then completes; actor disposal never waits for consumption, the subscriber lifetime releases once, and no drop/coalescing policy is invented to bound unread lag.
  it.todo("preserves ordered snapshot delivery without making disposal wait for a slow reader");

  // Setup: Initialize the selected real private Journal near counter exhaustion through its construction input; start actual actor admission, observe its terminal-credit acquisition, then fail a later delegated attachment/acquisition before activation or acceptance of the start record.
  // Action: Await complete reverse rollback, create another real actor using the reclaimed capacity, accept an ordinary turn when headroom permits, and dispose the actor and runtime.
  // Assert: Failed admission releases its unused credit exactly once and exposes no actor or partial record; the next owner can use that headroom, accepted sequences remain contiguous in commit order, and close never waits on a credit whose acquisition was rolled back. Observe the real credit/acquisition capability, not a fabricated counter or public test setter.
  it.todo("releases unused terminal credit when actor admission rolls back");

  // Setup: Use the selected real Journal and actor lifecycle owner near counter exhaustion; gate successful individual disposal after its leader owns an outcome credit, and join that same attempt from a separate waiting fiber. Choose headroom so no ordinary credit remains while disposal is gated.
  // Action: Interrupt only the follower and verify another actor's ordinary cut is rejected; release the leader and await successful disposal, then attempt two more ordinary cuts against the capacity released by disposal.
  // Assert: Follower interruption neither cancels cleanup nor releases the leader's credit. Successful disposal consumes its terminal credit and releases exactly one unused outcome credit: the next ordinary cut succeeds and the following cut fails before mutation. Cleanup never replays, and close observes no leaked or doubly released credit.
  it.todo(
    "keeps lifecycle outcome credit owned by the attempt when a waiting caller is interrupted",
  );
});
