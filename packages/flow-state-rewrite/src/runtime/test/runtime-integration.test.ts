import { assert, describe, it } from "@effect/vitest";
import { Cause, Context, Deferred, Effect, Exit, Fiber, Queue, Result, Stream } from "effect";

import { app, module } from "../../app/app.js";
import { definition } from "../../definition/definition.js";
import { Failure } from "../../diagnostic/diagnostic.js";
import { Implementation } from "../../implementation/implementation.js";
import { machine } from "../../machine/machine.js";
import { resource } from "../../operation/resource.js";
import { actorRef } from "../actor-ref.js";
import type { ActorContextBinding } from "../actor-admission.js";
import { makeEvidenceSink } from "../evidence.js";
import { ACTOR_MAILBOX_CAPACITY, prepareActorSnapshot } from "../actor-engine.js";
import type { ActorSnapshot, ActorStore, PreparedActorSnapshot } from "../actor-engine.js";
import type { EvidenceRecord } from "../evidence.js";
import { RuntimeClock, RuntimeEvidence, RuntimeScheduler } from "../runtime-services.js";
import { runtimeOwner, runtimeSetup } from "../runtime.js";

type IntegrationService = {
  readonly name: "runtime-integration";
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
const IntegrationModule = module({
  id: "runtime-integration/module",
  machines: {
    provider: IntegrationProviderMachine,
    consumer: IntegrationConsumerMachine,
    standalone: IntegrationStandaloneMachine,
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

const initialStandaloneSnapshot = (): PreparedActorSnapshot<
  typeof IntegrationStandaloneDefinition
> =>
  Result.getOrThrow(
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
  readonly _tag: "turn" | "lifecycle";
  readonly sequence?: number;
  readonly evidenceSequence?: number;
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
        (record): record is Extract<EvidenceRecord, { readonly _tag: "lifecycle" }> =>
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
      const records: Array<{ readonly tag: string; readonly sequence: number | undefined }> = [];
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
        readonly evidenceHub: unknown;
        readonly clock: unknown;
        readonly scheduler: unknown;
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
        (record): record is Extract<EvidenceRecord, { readonly _tag: "turn" }> =>
          record._tag === "turn",
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
        (record): record is Extract<EvidenceRecord, { readonly _tag: "turn" }> =>
          record._tag === "turn",
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
          (record): record is Extract<EvidenceRecord, { readonly _tag: "turn" }> =>
            record._tag === "turn",
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
        (record): record is Extract<EvidenceRecord, { readonly _tag: "turn" }> =>
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

  it.effect("suspends, resumes, and disposes through the same runtime owner", () =>
    Effect.gen(function* () {
      const counts = { acquisitions: 0, releases: 0 };
      const runtime = runtimeSetup({
        app: IntegrationApp,
        implementation: makeImplementation(counts),
      }).construct();
      yield* runtime.ready();
      const owner = runtimeOwner(runtime);
      const assembly = owner.assembly();
      const records: Array<{ readonly tag: string; readonly sequence: number | undefined }> = [];
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
      type MutableRuntimeEvidence = { publish: typeof originalPublish };
      // SAFETY: The runtime context contains the live evidence service used by this assembly; the mutable view restores its method below.
      // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- the readonly service surface is deliberately opened for failure injection.
      const mutableRuntimeEvidence = runtimeEvidence as unknown as MutableRuntimeEvidence;
      const cleanupFailure = Failure({
        code: "InvariantViolation" as const,
        path: ["evidence", "publish"],
        details: { reason: "cleanup-test" },
        summary: "Lifecycle evidence publication failed.",
        help: "Retry cleanup after the evidence owner recovers.",
      });
      mutableRuntimeEvidence.publish = (snapshot) =>
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

      mutableRuntimeEvidence.publish = originalPublish;
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
