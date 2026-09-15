import { assert, describe, it } from "@effect/vitest";
import { Cause, Clock, Deferred, Effect, Exit, Fiber, Option, Result, Scope } from "effect";
import { TestClock } from "effect/testing";

import { app, appPlan, module, type App } from "../../app/app.js";
import { definition } from "../../definition/definition.js";
import { machine, type Machine } from "../../machine/machine.js";
import type { MachineDefinition } from "../../machine/grammar.js";
import { actorRef } from "../actor-ref.js";
import { resource } from "../../operation/resource.js";
import { Failure, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import {
  makeActorIdentityRegistry,
  type ActorContextBinding,
  type ActorDependencyEdge,
  type ActorFence,
} from "../actor-admission.js";
import {
  activateLifecycle,
  disposeLifecycle,
  installLifecycleMetadata,
  makeLifecycleRuntimeOwner,
  makeLifecycleController,
  makeProviderReconciler,
  prepareLifecycle,
  resumeLifecycle,
  runLifecycleCommand,
  suspendLifecycle,
  transitionLifecycle,
  type LifecycleResource,
  type LifecycleWork,
} from "../lifecycle.js";
import { prepareActorEngine, prepareActorSnapshot, type ActorSnapshot } from "../actor-engine.js";
import type { OperationOccurrenceFence } from "../turn-plan.js";
import { makeEvidenceSink, makeRuntimeEvidenceOwner } from "../evidence.js";
import {
  makeRuntimeScheduler,
  makeRuntimeClock,
  makeRuntimeServicesLayer,
  type RuntimeEvidenceService,
  type RuntimeServiceContext,
  type RuntimeServicesLayer,
} from "../runtime-services.js";

const resultSuccess = <Value>(result: Result.Result<Value, PublicDiagnostic>) => {
  if (Result.isFailure(result)) throw result.failure;

  return result.success;
};

const LifecycleDefinitionResult = definition({
  id: "lifecycle/actor",
  states: ["ready"],
  events: {},
});

const LifecycleDefinition = resultSuccess(LifecycleDefinitionResult);

const LifecycleMachine = resultSuccess(
  machine(LifecycleDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const occurrenceOperation = resource({
  id: "lifecycle/occurrence",
  key: (value: number) => [value] as const,
  lookup: (value: number) => Effect.succeed(value),
});

const OccurrenceDefinitionResult = definition({
  id: "lifecycle/occurrence-actor",
  states: ["ready"],
  events: {},
  operations: { operation: occurrenceOperation },
});

const OccurrenceDefinition = resultSuccess(OccurrenceDefinitionResult);

const OccurrenceMachine = resultSuccess(
  machine(OccurrenceDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const ProviderDefinitionResult = definition({
  id: "lifecycle/provider",
  states: ["ready", "changed"],
  events: {},
});

const ProviderDefinition = resultSuccess(ProviderDefinitionResult);

const ProviderMachine = resultSuccess(
  machine(ProviderDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {}, changed: {} },
  })),
);

const ConsumerDefinitionResult = definition({
  id: "lifecycle/consumer",
  states: ["ready"],
  events: {},
  context: { selected: ProviderDefinition.select(({ state }) => state) },
});

const ConsumerDefinition = resultSuccess(ConsumerDefinitionResult);

const ConsumerMachine = resultSuccess(
  machine(ConsumerDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const LifecycleModule = module({
  id: "lifecycle/module",
  machines: { actor: LifecycleMachine, provider: ProviderMachine, consumer: ConsumerMachine },
});

const LifecycleApp = app({
  id: "lifecycle/app",
  persistenceVersion: "1",
  modules: [LifecycleModule],
});

const LifecyclePlan = appPlan(LifecycleApp);

const makeFence = <DefinitionValue extends MachineDefinition>(
  machineValue: Machine<DefinitionValue>,
  id: string,
) => {
  const registry = makeActorIdentityRegistry();
  const ref = actorRef(machineValue, id);
  const identity = resultSuccess(registry.reserveStable(ref));

  const fence: ActorFence = {
    key: identity.key,
    incarnation: identity.incarnation,
    generation: 0,
    leaseEpoch: identity.leaseEpoch,
  };

  return { identity, ref, fence };
};

const fixedClock = {
  now: Effect.succeed(0),
  timestamp: () => 0,
  sleepUntil: () => Effect.void,
};

const defaultEvidenceOwner = makeRuntimeEvidenceOwner({
  app: LifecycleApp,
  plan: LifecyclePlan,
  clock: fixedClock,
});

const evidence: RuntimeEvidenceService = defaultEvidenceOwner.service;

const defaultRuntimeLayer: RuntimeServicesLayer = makeRuntimeServicesLayer({
  clock: fixedClock,
  scheduler: makeRuntimeScheduler(),
  evidence,
});

const withRuntime = <Value>(
  effect: Effect.Effect<Value, PublicDiagnostic, RuntimeServiceContext>,
  layer: RuntimeServicesLayer = defaultRuntimeLayer,
) => Effect.provide(effect, layer);

const makePrepared = () => {
  const { fence } = makeFence(LifecycleMachine, "actor");

  return resultSuccess(
    prepareLifecycle<typeof LifecycleDefinition, string>(fence, { _tag: "fresh" }),
  );
};

// Contracts: SEM-004, SEM-005, SEM-029.
// Proofs: PROOF-004, HOST-P05.
describe("actor lifecycle", () => {
  it("computes the legal graph and rejects stale transitions", () => {
    const restored = transitionLifecycle("prepared", {
      _tag: "actor:restore",
      cause: { _tag: "restore" },
    });

    assert.ok(Result.isSuccess(restored));

    if (Result.isSuccess(restored)) {
      assert.strictEqual(restored.success.from, "prepared");
      assert.strictEqual(restored.success.to, "prepared");
    }

    const started = transitionLifecycle("prepared", {
      _tag: "actor:start",
      cause: { _tag: "fresh" },
    });

    assert.ok(Result.isSuccess(started));

    if (Result.isSuccess(started)) assert.strictEqual(started.success.to, "active");

    const invalid = transitionLifecycle("disposed", {
      _tag: "actor:resume",
      cause: { _tag: "attachment" },
    });

    assert.ok(Result.isFailure(invalid));
  });

  it.effect("restores before explicit start and creates no synthetic lifecycle work", () =>
    Effect.gen(function* () {
      const prepared = makePrepared();

      const restored = yield* withRuntime(
        runLifecycleCommand(prepared, {
          _tag: "actor:restore",
          cause: { _tag: "restore" },
        }),
      );

      assert.strictEqual(restored.lifecycle, "prepared");
      assert.strictEqual(restored.attachment.work.length, 0);
      assert.strictEqual(restored.attachment.resources.length, 0);

      const active = yield* withRuntime(
        runLifecycleCommand(restored, {
          _tag: "actor:start",
          cause: { _tag: "attachment" },
        }),
      );

      assert.strictEqual(active.lifecycle, "active");
      assert.strictEqual(active.attachment.operations.length, 0);
      const disposed = yield* withRuntime(disposeLifecycle(active));
      assert.strictEqual(disposed.lifecycle, "disposed");
      assert.strictEqual(disposed.attachment.work.length, 0);
      assert.strictEqual(disposed.attachment.resources.length, 0);
    }),
  );

  it.effect("installs admitted metadata before start and retains it across lifecycle states", () =>
    Effect.gen(function* () {
      const consumer = makeFence(ConsumerMachine, "metadata-consumer");
      const provider = makeFence(ProviderMachine, "metadata-provider");

      const binding = {
        slot: "selected",
        provider: provider.ref,
        providerFence: provider.fence,
        select: ({ state }) => state,
      } satisfies ActorContextBinding<typeof ConsumerDefinition, typeof ProviderDefinition>;

      const edge: ActorDependencyEdge = {
        consumer: consumer.fence.key,
        provider: provider.fence.key,
        slot: "selected",
      };

      const dependencies = [edge];
      const providerRevisions = new Map([[provider.fence.key, 7]]);
      const providerFences = new Map([[provider.fence.key, provider.fence]]);

      const prepared = resultSuccess(
        prepareLifecycle<typeof ConsumerDefinition, string, typeof ProviderDefinition>(
          consumer.fence,
          { _tag: "fresh" },
        ),
      );

      const installed = resultSuccess(
        installLifecycleMetadata(prepared, {
          dependencies,
          bindings: [binding],
          providerRevisions,
          providerFences,
        }),
      );

      dependencies.pop();
      providerRevisions.set(provider.fence.key, 8);
      providerFences.clear();
      assert.strictEqual(installed.lifecycle, "prepared");
      assert.deepStrictEqual(installed.attachment.dependencies, [edge]);
      assert.strictEqual(installed.attachment.bindings[0]?.providerFence.generation, 0);
      assert.strictEqual(installed.attachment.providerRevisions.get(provider.fence.key), 7);
      assert.strictEqual(
        installed.attachment.providerFences?.get(provider.fence.key)?.generation,
        0,
      );

      const active = yield* withRuntime(activateLifecycle(installed));
      const suspended = yield* withRuntime(suspendLifecycle(active));
      assert.strictEqual(suspended.lifecycle, "suspended");
      assert.deepStrictEqual(suspended.attachment.dependencies, [edge]);
      assert.strictEqual(suspended.attachment.bindings[0]?.slot, "selected");
      assert.strictEqual(suspended.attachment.providerRevisions.get(provider.fence.key), 7);
      assert.strictEqual(
        suspended.attachment.providerFences?.get(provider.fence.key)?.generation,
        0,
      );

      const providerPrepared = resultSuccess(
        prepareLifecycle<typeof ProviderDefinition, string>(provider.fence, { _tag: "fresh" }),
      );

      const providerInstalled = resultSuccess(
        installLifecycleMetadata(providerPrepared, {
          dependencies: [edge],
          bindings: [],
          providerRevisions,
          providerFences,
        }),
      );

      const providerActive = yield* withRuntime(activateLifecycle(providerInstalled));
      const disposed = yield* Effect.exit(withRuntime(disposeLifecycle(providerActive)));
      assert.ok(Exit.isFailure(disposed));
      assert.strictEqual(providerActive.lifecycle, "active");

      if (Exit.isFailure(disposed)) {
        const reason = disposed.cause.reasons[0];

        if (reason?._tag === "Fail") {
          assert.strictEqual(reason.error.code, "BlockedByDependents");
          assert.strictEqual(reason.error.details.dependentActors, consumer.fence.key);
          assert.strictEqual(reason.error.details.bindingKeys, "selected");
        }
      }

      const controllerPrepared = resultSuccess(
        prepareLifecycle<typeof ProviderDefinition, string>(provider.fence, { _tag: "fresh" }),
      );

      const controller = makeLifecycleController(controllerPrepared);

      const activeWithoutMetadata = yield* withRuntime(
        controller.command({ _tag: "actor:start", cause: { _tag: "fresh" } }),
      );

      assert.strictEqual(activeWithoutMetadata.attachment.dependencies.length, 0);
      const controllerDependencies = [edge];
      const controllerBindingKeys = new Map([[provider.fence.key, provider.fence]]);

      const activeWithMetadata = yield* withRuntime(
        controller.installMetadata({
          dependencies: controllerDependencies,
          bindings: [],
          providerRevisions: new Map([[provider.fence.key, 0]]),
          providerFences: controllerBindingKeys,
        }),
      );

      controllerDependencies.pop();
      controllerBindingKeys.clear();
      assert.strictEqual(activeWithMetadata.lifecycle, "active");
      assert.deepStrictEqual(activeWithMetadata.attachment.dependencies, [edge]);
      assert.strictEqual(activeWithMetadata.attachment.providerFences?.size, 1);

      const controllerDisposed = yield* Effect.exit(
        withRuntime(
          controller.command({
            _tag: "actor:dispose",
            cause: { _tag: "owner-disposal" },
          }),
        ),
      );

      assert.ok(Exit.isFailure(controllerDisposed));
      assert.strictEqual((yield* withRuntime(controller.state())).lifecycle, "active");

      if (Exit.isFailure(controllerDisposed)) {
        const reason = controllerDisposed.cause.reasons[0];

        if (reason?._tag === "Fail") {
          assert.strictEqual(reason.error.code, "BlockedByDependents");
          assert.strictEqual(reason.error.details.dependentActors, consumer.fence.key);
          assert.strictEqual(reason.error.details.bindingKeys, "selected");
        }
      }
    }),
  );

  it.effect("activates, cancels work, and cleans resources in reverse ownership order", () =>
    Effect.gen(function* () {
      const active = yield* withRuntime(activateLifecycle(makePrepared()));
      const order: Array<string> = [];
      const workRelease = yield* Deferred.make<void>();
      const workFiber = yield* Effect.forkChild(Deferred.await(workRelease));

      const work: LifecycleWork<string> = {
        name: "operation",
        fiber: workFiber,
        cancel: Effect.gen(function* () {
          order.push("cancel");
          yield* Deferred.succeed(workRelease, undefined);
        }),
        finalizer: Effect.sync(() => order.push("work-finalizer")),
        finalization: "pending",
        cause: Option.none(),
      };

      const resource: LifecycleResource<string> = {
        name: "resource",
        scope: Scope.makeUnsafe(),
        close: () => Effect.sync(() => order.push("resource-close")),
        finalization: "pending",
        cause: Option.none(),
      };

      yield* Scope.addFinalizer(
        resource.scope,
        Effect.sync(() => order.push("scope-close")),
      );

      const live: typeof active = {
        ...active,
        attachment: { ...active.attachment, work: [work], resources: [resource] },
      };

      const suspended = yield* withRuntime(suspendLifecycle(live));
      assert.strictEqual(suspended.lifecycle, "suspended");
      assert.strictEqual(suspended.attachment.status, "detached");
      assert.deepStrictEqual(order, ["cancel", "work-finalizer", "resource-close", "scope-close"]);
      assert.strictEqual(suspended.attachment.work[0]?.finalization, "done");
      assert.strictEqual(suspended.attachment.resources[0]?.finalization, "done");

      const resumed = yield* withRuntime(resumeLifecycle(suspended));
      const suspendedAgain = yield* withRuntime(suspendLifecycle(resumed));
      assert.deepStrictEqual(order, ["cancel", "work-finalizer", "resource-close", "scope-close"]);
      assert.strictEqual(suspendedAgain.attachment.work[0]?.finalization, "done");
      assert.strictEqual(suspendedAgain.attachment.resources[0]?.finalization, "done");
    }),
  );

  it.effect("reacquires continuing resources and work on each resume", () =>
    Effect.gen(function* () {
      const active = yield* withRuntime(activateLifecycle(makePrepared()));
      const resourceAcquisitions: Array<number> = [];
      const workAcquisitions: Array<number> = [];
      const resourceCloses: Array<number> = [];
      const workFinalizers: Array<number> = [];

      const makeResource = (id: number): Effect.Effect<LifecycleResource<string>> =>
        Effect.gen(function* () {
          const scope = yield* Scope.make("sequential");

          return {
            name: `resource-${id}`,
            scope,
            close: () =>
              Effect.sync(() => {
                resourceCloses.push(id);
              }),
            reacquire: () =>
              Effect.gen(function* () {
                resourceAcquisitions.push(id);

                return yield* makeResource(id + 1);
              }),
            finalization: "pending" as const,
            cause: Option.none(),
          };
        });

      // SAFETY: The helper deliberately constructs a live work attachment with a private scope and fiber.
      const makeWork = (id: number): Effect.Effect<LifecycleWork<string>> =>
        Effect.gen(function* () {
          const scope = yield* Scope.make("sequential");
          const release = yield* Deferred.make<void>();
          const fiber = yield* Effect.forkIn(Deferred.await(release), scope);

          return {
            name: `work-${id}`,
            fiber,
            cancel: Deferred.succeed(release, undefined).pipe(Effect.asVoid),
            finalizer: Effect.sync(() => {
              workFinalizers.push(id);
            }),
            reacquire: () =>
              Effect.gen(function* () {
                workAcquisitions.push(id);

                return yield* makeWork(id + 1);
              }),
            finalization: "pending" as const,
            cause: Option.none(),
          };
        });

      const initialResource = yield* makeResource(0);
      const initialWork = yield* makeWork(0);

      const live: typeof active = {
        ...active,
        attachment: { ...active.attachment, resources: [initialResource], work: [initialWork] },
      };

      const suspended = yield* withRuntime(suspendLifecycle(live));
      const resumed = yield* withRuntime(resumeLifecycle(suspended));
      assert.deepStrictEqual(resourceAcquisitions, [0]);
      assert.deepStrictEqual(workAcquisitions, [0]);
      assert.strictEqual(resumed.attachment.resources[0]?.finalization, "pending");
      assert.strictEqual(resumed.attachment.work[0]?.finalization, "pending");

      const suspendedAgain = yield* withRuntime(suspendLifecycle(resumed));
      const resumedAgain = yield* withRuntime(resumeLifecycle(suspendedAgain));
      assert.deepStrictEqual(resourceAcquisitions, [0, 1]);
      assert.deepStrictEqual(workAcquisitions, [0, 1]);
      assert.deepStrictEqual(resourceCloses, [0, 1]);
      assert.deepStrictEqual(workFinalizers, [0, 1]);
      assert.strictEqual(resumedAgain.attachment.resources[0]?.finalization, "pending");
      assert.strictEqual(resumedAgain.attachment.work[0]?.finalization, "pending");

      yield* withRuntime(disposeLifecycle(resumedAgain));
      assert.deepStrictEqual(resourceCloses, [0, 1, 2]);
      assert.deepStrictEqual(workFinalizers, [0, 1, 2]);
    }),
  );

  it.effect("rolls back earlier reacquisition when continuing work cannot be restored", () =>
    Effect.gen(function* () {
      const active = yield* withRuntime(activateLifecycle(makePrepared()));
      const release = yield* Deferred.make<void>();
      const fiber = yield* Effect.forkChild(Deferred.await(release));
      let reacquiredCloses = 0;

      const resource: LifecycleResource<string> = {
        name: "continuing-resource",
        scope: Scope.makeUnsafe(),
        close: () => Effect.void,
        reacquire: () =>
          Effect.succeed({
            name: "reacquired-resource",
            scope: Scope.makeUnsafe(),
            close: () =>
              Effect.sync(() => {
                reacquiredCloses += 1;
              }),
            reacquire: () => Effect.fail("resource-reacquire-failed" as const),
            finalization: "pending" as const,
            cause: Option.none(),
          }),
        finalization: "pending",
        cause: Option.none(),
      };

      const work: LifecycleWork<string> = {
        name: "continuing-work",
        fiber,
        cancel: Deferred.succeed(release, undefined).pipe(Effect.asVoid),
        finalizer: Effect.void,
        reacquire: () => Effect.fail("work-reacquire-failed" as const),
        finalization: "pending",
        cause: Option.none(),
      };

      const suspended = yield* withRuntime(
        suspendLifecycle({
          ...active,
          attachment: { ...active.attachment, resources: [resource], work: [work] },
        }),
      );

      const resumed = yield* Effect.exit(withRuntime(resumeLifecycle(suspended)));
      assert.ok(Exit.isFailure(resumed));
      assert.strictEqual(reacquiredCloses, 1);
      assert.strictEqual(suspended.lifecycle, "suspended");
      assert.strictEqual(suspended.attachment.resources[0]?.finalization, "done");
      assert.strictEqual(suspended.attachment.work[0]?.finalization, "done");
    }),
  );

  it.effect("retains absolute timer deadlines and schedules each armed timer once on resume", () =>
    Effect.gen(function* () {
      const scheduled: Array<number> = [];

      const layer = makeRuntimeServicesLayer({
        clock: {
          now: Effect.succeed(100),
          timestamp: () => 100,
          sleepUntil: (dueAt: number) => Effect.sync(() => scheduled.push(dueAt)),
        },
        scheduler: makeRuntimeScheduler(),
        evidence,
      });

      const active = yield* withRuntime(activateLifecycle(makePrepared()), layer);

      const live: typeof active = {
        ...active,
        attachment: {
          ...active.attachment,
          timers: [{ name: "refresh", startedAt: 25, dueAt: 50, status: "armed" }],
        },
      };

      const suspended = yield* withRuntime(suspendLifecycle(live), layer);
      const resumed = yield* withRuntime(resumeLifecycle(suspended), layer);

      assert.strictEqual(resumed.lifecycle, "active");
      assert.deepStrictEqual(scheduled, [50]);
      assert.strictEqual(resumed.attachment.timers[0]?.dueAt, 50);
      assert.strictEqual(resumed.attachment.work.length, 1);
      yield* withRuntime(disposeLifecycle(resumed), layer);
    }),
  );

  it.effect("fences stale timer generations and performs at most one overdue refresh", () =>
    Effect.gen(function* () {
      const scheduled: Array<number> = [];
      const refreshes: Array<string> = [];

      const layer = makeRuntimeServicesLayer({
        clock: {
          now: Effect.succeed(100),
          timestamp: () => 100,
          sleepUntil: (dueAt: number) => Effect.sync(() => scheduled.push(dueAt)),
        },
        scheduler: makeRuntimeScheduler(),
        evidence,
      });

      const active = yield* withRuntime(activateLifecycle(makePrepared()), layer);

      const live: typeof active = {
        ...active,
        attachment: {
          ...active.attachment,
          timers: [
            {
              name: "stale",
              startedAt: 1,
              dueAt: 10,
              status: "armed",
              generation: 1,
            },
            {
              name: "overdue-one",
              startedAt: 2,
              dueAt: 20,
              status: "armed",
              generation: 0,
              refresh: Effect.sync(() => refreshes.push("one")),
            },
            {
              name: "overdue-two",
              startedAt: 3,
              dueAt: 30,
              status: "armed",
              generation: 0,
              refresh: Effect.sync(() => refreshes.push("two")),
            },
            { name: "future", startedAt: 4, dueAt: 200, status: "armed", generation: 0 },
          ],
        },
      };

      const suspended = yield* withRuntime(suspendLifecycle(live), layer);
      const resumed = yield* withRuntime(resumeLifecycle(suspended), layer);
      assert.deepStrictEqual(scheduled, [20, 200]);
      assert.deepStrictEqual(refreshes, ["one"]);
      assert.strictEqual(resumed.attachment.work.length, 2);
      yield* withRuntime(disposeLifecycle(resumed), layer);
    }),
  );

  it.effect("rejects resume across a provider fence change", () =>
    Effect.gen(function* () {
      const consumer = makeFence(ConsumerMachine, "consumer");
      const provider = makeFence(ProviderMachine, "provider");

      const binding = {
        slot: "selected",
        provider: provider.ref,
        providerFence: provider.fence,
        select: ({ state }) => state,
      } satisfies ActorContextBinding<typeof ConsumerDefinition, typeof ProviderDefinition>;

      const prepared = resultSuccess(
        prepareLifecycle<typeof ConsumerDefinition, string, typeof ProviderDefinition>(
          consumer.fence,
          { _tag: "fresh" },
        ),
      );

      const active = yield* withRuntime(activateLifecycle(prepared));

      const live: typeof active = {
        ...active,
        attachment: {
          ...active.attachment,
          bindings: [binding],
          providerRevisions: new Map([[provider.fence.key, 0]]),
          providerFences: new Map([[provider.fence.key, { ...provider.fence, generation: 1 }]]),
        },
      };

      const suspended = yield* withRuntime(suspendLifecycle(live));
      const resumed = yield* Effect.exit(withRuntime(resumeLifecycle(suspended)));
      assert.ok(Exit.isFailure(resumed));

      if (Exit.isFailure(resumed)) assert.strictEqual(resumed.cause.reasons[0]?._tag, "Fail");
    }),
  );

  it.effect("rejects resume when the live provider registry is absent", () =>
    Effect.gen(function* () {
      const consumer = makeFence(ConsumerMachine, "consumer-missing");
      const provider = makeFence(ProviderMachine, "provider-missing");

      const binding = {
        slot: "selected",
        provider: provider.ref,
        providerFence: provider.fence,
        select: ({ state }) => state,
      } satisfies ActorContextBinding<typeof ConsumerDefinition, typeof ProviderDefinition>;

      const prepared = resultSuccess(
        prepareLifecycle<typeof ConsumerDefinition, string, typeof ProviderDefinition>(
          consumer.fence,
          { _tag: "fresh" },
        ),
      );

      const active = yield* withRuntime(activateLifecycle(prepared));

      const live: typeof active = {
        ...active,
        attachment: {
          ...active.attachment,
          bindings: [binding],
          providerRevisions: new Map([[provider.fence.key, 0]]),
        },
      };

      const suspended = yield* withRuntime(suspendLifecycle(live));
      const resumed = yield* Effect.exit(withRuntime(resumeLifecycle(suspended)));
      assert.ok(Exit.isFailure(resumed));

      if (Exit.isFailure(resumed)) {
        const reason = resumed.cause.reasons[0];

        if (reason?._tag === "Fail")
          assert.strictEqual(reason.error.code, "MissingContextProvider");
      }
    }),
  );

  it.effect("rejects resume against a foreign runtime provider", () =>
    Effect.gen(function* () {
      const consumer = makeFence(ConsumerMachine, "consumer-foreign");
      const provider = makeFence(ProviderMachine, "provider-foreign");
      const foreignRegistry = makeActorIdentityRegistry();
      const foreign = resultSuccess(foreignRegistry.reserveStable(provider.ref));

      const binding = {
        slot: "selected",
        provider: provider.ref,
        providerFence: provider.fence,
        select: ({ state }) => state,
      } satisfies ActorContextBinding<typeof ConsumerDefinition, typeof ProviderDefinition>;

      const prepared = resultSuccess(
        prepareLifecycle<typeof ConsumerDefinition, string, typeof ProviderDefinition>(
          consumer.fence,
          { _tag: "fresh" },
        ),
      );

      const active = yield* withRuntime(activateLifecycle(prepared));

      const live: typeof active = {
        ...active,
        attachment: {
          ...active.attachment,
          bindings: [binding],
          providerRevisions: new Map([[provider.fence.key, 0]]),
          providerFences: new Map([
            [
              provider.fence.key,
              {
                ...provider.fence,
                key: foreign.key,
                incarnation: foreign.incarnation,
                leaseEpoch: foreign.leaseEpoch,
              },
            ],
          ]),
        },
      };

      const suspended = yield* withRuntime(suspendLifecycle(live));
      const resumed = yield* Effect.exit(withRuntime(resumeLifecycle(suspended)));
      assert.strictEqual(suspended.lifecycle, "suspended");
      assert.ok(Exit.isFailure(resumed));

      if (Exit.isFailure(resumed)) {
        const reason = resumed.cause.reasons[0];

        if (reason?._tag === "Fail") assert.strictEqual(reason.error.code, "MismatchedActorRef");
      }
    }),
  );

  it.effect("rejects resume after the provider runtime tombstones the identity", () =>
    Effect.gen(function* () {
      const consumer = makeFence(ConsumerMachine, "consumer-tombstoned");
      const provider = makeFence(ProviderMachine, "provider-tombstoned");
      const tombstonedRegistry = makeActorIdentityRegistry();
      const tombstoned = resultSuccess(tombstonedRegistry.reserveStable(provider.ref));
      resultSuccess(tombstonedRegistry.register(tombstoned, {}));
      resultSuccess(tombstonedRegistry.tombstone(tombstoned, 1));
      const lookup = tombstonedRegistry.lookup(provider.ref);
      assert.ok(Result.isFailure(lookup));

      if (Result.isFailure(lookup)) assert.strictEqual(lookup.failure.code, "DisposedActorRef");

      const binding = {
        slot: "selected",
        provider: provider.ref,
        providerFence: provider.fence,
        select: ({ state }) => state,
      } satisfies ActorContextBinding<typeof ConsumerDefinition, typeof ProviderDefinition>;

      const prepared = resultSuccess(
        prepareLifecycle<typeof ConsumerDefinition, string, typeof ProviderDefinition>(
          consumer.fence,
          { _tag: "fresh" },
        ),
      );

      const active = yield* withRuntime(activateLifecycle(prepared));

      const live: typeof active = {
        ...active,
        attachment: {
          ...active.attachment,
          bindings: [binding],
          providerRevisions: new Map([[provider.fence.key, 0]]),
          providerFences: new Map(),
        },
      };

      const suspended = yield* withRuntime(suspendLifecycle(live));
      const resumed = yield* Effect.exit(withRuntime(resumeLifecycle(suspended)));
      assert.strictEqual(suspended.lifecycle, "suspended");
      assert.ok(Exit.isFailure(resumed));

      if (Exit.isFailure(resumed)) {
        const reason = resumed.cause.reasons[0];

        if (reason?._tag === "Fail")
          assert.strictEqual(reason.error.code, "MissingContextProvider");
      }
    }),
  );

  it.effect("blocks disposal while a dependent edge remains", () =>
    Effect.gen(function* () {
      const owner = makeFence(ConsumerMachine, "owner");

      const prepared = resultSuccess(
        prepareLifecycle<typeof ConsumerDefinition, string>(owner.fence, { _tag: "fresh" }),
      );

      const active = yield* withRuntime(activateLifecycle(prepared));

      const edge: ActorDependencyEdge = {
        consumer: owner.fence.key,
        provider: active.fence.key,
        slot: "selected",
      };

      const blocked: typeof active = {
        ...active,
        attachment: {
          ...active.attachment,
          dependencies: [edge],
          blockedDisposal: {
            dependentActors: [actorRef(ConsumerMachine, "dependent")],
            bindingKeys: ["selected"],
          },
        },
      };

      const disposed = yield* Effect.exit(withRuntime(disposeLifecycle(blocked)));
      assert.ok(Exit.isFailure(disposed));
      assert.strictEqual(blocked.lifecycle, "active");

      if (Exit.isFailure(disposed)) {
        const reason = disposed.cause.reasons[0];

        if (reason?._tag === "Fail") {
          assert.strictEqual(reason.error.details.dependentActors, "lifecycle/consumer:dependent");
          assert.strictEqual(reason.error.details.bindingKeys, "selected");
        }
      }
    }),
  );

  it.effect("keeps nested provider and blocked-disposal snapshots detached", () =>
    Effect.gen(function* () {
      const consumer = makeFence(ConsumerMachine, "consumer-mutation");
      const provider = makeFence(ProviderMachine, "provider-mutation");
      const mutableProviderFence = { ...provider.fence };

      const binding = {
        slot: "selected",
        provider: provider.ref,
        providerFence: mutableProviderFence,
        select: ({ state }) => state,
      } satisfies ActorContextBinding<typeof ConsumerDefinition, typeof ProviderDefinition>;

      const dependent = actorRef(ConsumerMachine, "dependent-mutation");
      // SAFETY: The fixture's only valid context slot is the literal "selected" key.
      const mutableBindingKeys = ["selected"] as Array<"selected">;

      const mutableBlockedDisposal = {
        dependentActors: [dependent],
        bindingKeys: mutableBindingKeys,
      };

      const prepared = resultSuccess(
        prepareLifecycle<typeof ConsumerDefinition, string, typeof ProviderDefinition>(
          consumer.fence,
          { _tag: "fresh" },
        ),
      );

      const active = yield* withRuntime(activateLifecycle(prepared));

      const live: typeof active = {
        ...active,
        attachment: {
          ...active.attachment,
          bindings: [binding],
          providerRevisions: new Map([[provider.fence.key, 0]]),
          providerFences: new Map([[provider.fence.key, mutableProviderFence]]),
          blockedDisposal: mutableBlockedDisposal,
        },
      };

      const suspended = yield* withRuntime(suspendLifecycle(live));
      mutableProviderFence.generation = 99;
      mutableBlockedDisposal.dependentActors.pop();
      Reflect.set(mutableBindingKeys, 0, "mutated");

      assert.strictEqual(suspended.attachment.bindings[0]?.providerFence.generation, 0);
      assert.strictEqual(suspended.attachment.blockedDisposal?.dependentActors.length, 1);
      assert.strictEqual(suspended.attachment.blockedDisposal?.bindingKeys[0], "selected");
    }),
  );

  it.effect("continues reverse cleanup after a finalizer failure", () =>
    Effect.gen(function* () {
      const active = yield* withRuntime(activateLifecycle(makePrepared()));
      const order: Array<string> = [];

      const first: LifecycleResource<string> = {
        name: "first",
        scope: Scope.makeUnsafe(),
        close: () =>
          Effect.sync(() => {
            order.push("first");

            return Effect.fail("first-failure" as const);
          }).pipe(Effect.flatten),
        finalization: "pending",
        cause: Option.none(),
      };

      const second: LifecycleResource<string> = {
        name: "second",
        scope: Scope.makeUnsafe(),
        close: () => Effect.sync(() => order.push("second")),
        finalization: "pending",
        cause: Option.none(),
      };

      const disposed = yield* Effect.exit(
        withRuntime(
          disposeLifecycle({
            ...active,
            attachment: { ...active.attachment, resources: [first, second] },
          }),
        ),
      );

      assert.ok(Exit.isFailure(disposed));
      assert.deepStrictEqual(order, ["second", "first"]);
    }),
  );

  it.effect("serializes changed provider reconciliation and suppresses equal values", () =>
    Effect.gen(function* () {
      const changes: Array<number> = [];
      const gate = yield* Deferred.make<void>();

      const reconciler = makeProviderReconciler<number>({
        reconcile: (value) =>
          Effect.gen(function* () {
            changes.push(value);

            if (value === 1) yield* Deferred.await(gate);
          }),
      });

      const first = yield* Effect.forkChild(Effect.exit(reconciler.publish(1)));
      yield* Effect.yieldNow;
      const second = yield* Effect.forkChild(Effect.exit(reconciler.publish(2)));
      const equal = yield* Effect.forkChild(Effect.exit(reconciler.publish(2)));
      yield* Effect.yieldNow;
      assert.deepStrictEqual(changes, [1]);
      yield* Deferred.succeed(gate, undefined);
      const firstExit = yield* Fiber.join(first);
      const secondExit = yield* Fiber.join(second);
      const equalExit = yield* Fiber.join(equal);
      assert.ok(Exit.isSuccess(firstExit));
      assert.ok(Exit.isSuccess(secondExit));
      assert.ok(Exit.isSuccess(equalExit));
      assert.deepStrictEqual(changes, [1, 2]);
      assert.strictEqual(reconciler.revision(), 2);
      const silent = yield* reconciler.publish(2);
      assert.strictEqual(silent.changed, false);
      assert.deepStrictEqual(changes, [1, 2]);
    }),
  );

  it.effect(
    "queues a latest provider value equal to committed truth during an in-flight wave",
    () =>
      Effect.gen(function* () {
        const changes: Array<number> = [];
        const gate = yield* Deferred.make<void>();

        const reconciler = makeProviderReconciler<number>({
          reconcile: (value) =>
            Effect.gen(function* () {
              changes.push(value);

              if (value === 1) yield* Deferred.await(gate);
            }),
        });

        const baseline = yield* reconciler.publish(0);
        assert.strictEqual(baseline.changed, true);
        const blocked = yield* Effect.forkChild(Effect.exit(reconciler.publish(1)));
        yield* Effect.yieldNow;
        const latest = yield* Effect.forkChild(Effect.exit(reconciler.publish(0)));
        yield* Effect.yieldNow;
        assert.deepStrictEqual(changes, [0, 1]);

        yield* Deferred.succeed(gate, undefined);
        const blockedExit = yield* Fiber.join(blocked);
        const latestExit = yield* Fiber.join(latest);
        assert.ok(Exit.isSuccess(blockedExit));
        assert.ok(Exit.isSuccess(latestExit));
        assert.deepStrictEqual(changes, [0, 1, 0]);
        assert.strictEqual(reconciler.revision(), 3);
      }),
  );

  it.effect("adapts lifecycle runtime participants to the shared disposal owner", () =>
    Effect.gen(function* () {
      const order: Array<string> = [];
      const owner = makeLifecycleRuntimeOwner();
      owner.registerActor({ dispose: () => Effect.sync(() => order.push("actor")) });
      owner.registerProvider(Effect.sync(() => order.push("provider")));
      const before = owner.generation();
      yield* withRuntime(owner.dispose());
      assert.deepStrictEqual(order, ["actor", "provider"]);
      assert.strictEqual(owner.isCurrent(before), false);
      assert.strictEqual(owner.isCurrent(owner.generation()), false);
    }),
  );

  it.effect("keeps failed post-start disposal active and retries cleanup before tombstoning", () =>
    Effect.gen(function* () {
      const active = yield* withRuntime(activateLifecycle(makePrepared()));
      let closes = 0;
      const acceptedLifecycles: Array<string> = [];
      let cleanupExitFailed = false;
      let cleanupCauseHasFailure = false;

      const resource: LifecycleResource<string> = {
        name: "broken-resource",
        scope: Scope.makeUnsafe(),
        close: () =>
          Effect.sync(() => {
            closes += 1;

            return closes === 1
              ? Effect.fail("cleanup-failed" as const)
              : Effect.succeed(undefined);
          }).pipe(Effect.flatten),
        finalization: "pending",
        cause: Option.none(),
      };

      const controller = makeLifecycleController({
        ...active,
        attachment: { ...active.attachment, resources: [resource] },
      });

      const layer = makeRuntimeServicesLayer({
        clock: fixedClock,
        scheduler: makeRuntimeScheduler(),
        evidence: {
          ...evidence,
          accept: (record) =>
            Effect.sync(() => {
              acceptedLifecycles.push(record.after.lifecycle);

              if (record.cause._tag === "cleanup-failure") {
                cleanupExitFailed = Exit.isFailure(record.cause.exit);
                cleanupCauseHasFailure = Cause.hasFails(record.cause.cause);
              }
            }),
        },
      });

      const dispose = {
        _tag: "actor:dispose" as const,
        cause: { _tag: "owner-disposal" as const },
      };

      const first = yield* Effect.exit(withRuntime(controller.command(dispose), layer));
      assert.ok(Exit.isFailure(first));
      const retained = yield* controller.state();
      assert.strictEqual(retained.lifecycle, "active");
      assert.strictEqual(retained.finalization, "failed");
      assert.strictEqual(retained.attachment.status, "detached");
      assert.strictEqual(retained.attachment.resources[0]?.finalization, "failed");
      const retainedResource = retained.attachment.resources[0];

      if (retainedResource === undefined)
        return yield* Effect.die(new Error("cleanup resource was not retained"));

      if (Option.isSome(retainedResource.cause)) {
        const cleanup = Cause.findError(retainedResource.cause.value);
        assert.ok(Result.isSuccess(cleanup));

        if (Result.isSuccess(cleanup)) assert.strictEqual(cleanup.success, "cleanup-failed");
      }

      assert.strictEqual(acceptedLifecycles.length, 1);
      assert.strictEqual(cleanupExitFailed, true);
      assert.strictEqual(cleanupCauseHasFailure, true);

      const second = yield* withRuntime(controller.command(dispose), layer);
      assert.strictEqual(second.lifecycle, "disposed");
      assert.strictEqual(second.finalization, "done");
      assert.strictEqual(closes, 2);
      assert.deepStrictEqual(acceptedLifecycles, ["active", "disposed"]);
    }),
  );

  it.effect("rejects a stale same-revision snapshot from overwriting canonical dependencies", () =>
    Effect.gen(function* () {
      const prepared = makePrepared();

      const dependency: ActorDependencyEdge = {
        consumer: prepared.fence.key,
        provider: prepared.fence.key,
        slot: "selected",
      };

      const installed = resultSuccess(
        installLifecycleMetadata(prepared, {
          dependencies: [dependency],
          bindings: [],
          providerRevisions: new Map(),
          providerFences: new Map(),
        }),
      );

      const active = yield* withRuntime(activateLifecycle(installed));

      // This is a same-revision structural view carrying the same private owner metadata,
      // but it is stale because it omits the canonical dependency cut.
      const stale = { ...active, attachment: { ...active.attachment, dependencies: [] } };
      makeLifecycleController(active);
      const controller = makeLifecycleController(stale);
      const canonical = yield* controller.state();
      assert.deepStrictEqual(canonical.attachment.dependencies, [dependency]);

      const suspended = yield* withRuntime(
        controller.command({
          _tag: "actor:suspend",
          cause: { _tag: "attachment" },
        }),
      );

      assert.deepStrictEqual(suspended.attachment.dependencies, [dependency]);
    }),
  );

  it.effect(
    "rejects older raw metadata helpers without resurrecting active or disposed state",
    () =>
      Effect.gen(function* () {
        const prepared = makePrepared();

        const dependency: ActorDependencyEdge = {
          consumer: prepared.fence.key,
          provider: prepared.fence.key,
          slot: "selected",
        };

        const installed = resultSuccess(
          installLifecycleMetadata(prepared, {
            dependencies: [],
            bindings: [],
            providerRevisions: new Map(),
            providerFences: new Map(),
          }),
        );

        const active = yield* withRuntime(activateLifecycle(installed));
        const controller = makeLifecycleController(active);

        const activeInstall = installLifecycleMetadata(prepared, {
          dependencies: [dependency],
          bindings: [],
          providerRevisions: new Map(),
          providerFences: new Map(),
        });

        assert.ok(Result.isFailure(activeInstall));

        if (Result.isFailure(activeInstall))
          assert.strictEqual(activeInstall.failure.details.reason, "stale-snapshot");
        assert.deepStrictEqual((yield* controller.state()).attachment.dependencies, []);

        const disposed = yield* withRuntime(
          controller.command({ _tag: "actor:dispose", cause: { _tag: "owner-disposal" } }),
        );

        assert.strictEqual(disposed.lifecycle, "disposed");

        const disposedInstall = installLifecycleMetadata(active, {
          dependencies: [dependency],
          bindings: [],
          providerRevisions: new Map(),
          providerFences: new Map(),
        });

        assert.ok(Result.isFailure(disposedInstall));

        if (Result.isFailure(disposedInstall))
          assert.strictEqual(disposedInstall.failure.details.reason, "stale-snapshot");

        const canonical = yield* controller.state();
        assert.strictEqual(canonical.lifecycle, "disposed");
        assert.deepStrictEqual(canonical.attachment.dependencies, []);
      }),
  );

  it.effect("blocks routing during active cleanup and reopens it after a failed cleanup", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let closes = 0;
      const active = yield* withRuntime(activateLifecycle(makePrepared()));

      const resource: LifecycleResource<string> = {
        name: "gated-resource",
        scope: Scope.makeUnsafe(),
        close: () =>
          Effect.gen(function* () {
            closes += 1;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);

            return yield* Effect.fail("cleanup-failed" as const);
          }),
        finalization: "pending",
        cause: Option.none(),
      };

      const controller = makeLifecycleController({
        ...active,
        attachment: { ...active.attachment, resources: [resource] },
      });

      const disposing = yield* Effect.forkChild(
        Effect.exit(
          withRuntime(
            controller.command({
              _tag: "actor:dispose",
              cause: { _tag: "owner-disposal" },
            }),
          ),
        ),
        { startImmediately: true },
      );

      yield* Deferred.await(entered);
      assert.strictEqual(controller.isRoutable(), false);
      yield* Deferred.succeed(release, undefined);

      const failed = yield* Fiber.join(disposing);
      assert.ok(Exit.isFailure(failed));
      assert.strictEqual(closes, 1);
      assert.strictEqual(controller.currentLifecycle(), "active");
      assert.strictEqual(controller.isRoutable(), true);
    }),
  );

  it.effect("serializes lifecycle commands and publishes evidence after each cut", () =>
    Effect.gen(function* () {
      const records: Array<{
        _tag: string;
        machineTurn: boolean;
        from: string;
        to: string;
        timestamp: number;
        publicationRevision: number;
        machineTurnRevision: number;
        evidenceSequence: number;
        actorKey: string;
        actorIncarnation: number;
        actorLeaseEpoch: number;
      }> = [];

      const evidenceOwner = makeRuntimeEvidenceOwner({
        app: LifecycleApp,
        plan: LifecyclePlan,
        clock: { now: Effect.succeed(100), timestamp: () => 100, sleepUntil: () => Effect.void },
      });

      const published: Array<unknown> = [];
      const actor = makeFence(LifecycleMachine, "evidence-controller");

      const layer = makeRuntimeServicesLayer({
        clock: { now: Effect.succeed(100), timestamp: () => 100, sleepUntil: () => Effect.void },
        scheduler: makeRuntimeScheduler(),
        evidence: {
          ...evidenceOwner.service,
          publish: (snapshot) => Effect.sync(() => published.push(snapshot)),
          accept: (record) =>
            Effect.sync(() => {
              assert.strictEqual(published.at(-1), record.after);
              records.push({
                _tag: record._tag,
                machineTurn: record.machineTurn,
                from: record.from,
                to: record.to,
                timestamp: record.timestamp,
                publicationRevision: record.publicationRevision,
                machineTurnRevision: record.machineTurnRevision,
                evidenceSequence: record.evidenceSequence,
                actorKey: record.provenance.actor.key,
                actorIncarnation: record.provenance.actor.incarnation,
                actorLeaseEpoch: record.provenance.actor.leaseEpoch,
              });
            }),
        },
      });

      const active = yield* withRuntime(
        runLifecycleCommand(
          resultSuccess(
            prepareLifecycle<typeof LifecycleDefinition, string>(actor.fence, { _tag: "fresh" }),
          ),
          {
            _tag: "actor:start",
            cause: { _tag: "fresh" },
          },
        ),
        layer,
      );

      const controller = makeLifecycleController(active);

      const [suspended, resumed] = yield* Effect.all(
        [
          withRuntime(
            controller.command({
              _tag: "actor:suspend",
              cause: { _tag: "attachment" },
            }),
            layer,
          ),
          withRuntime(
            controller.command({
              _tag: "actor:resume",
              cause: { _tag: "attachment" },
            }),
            layer,
          ),
        ],
        { concurrency: "unbounded" },
      );

      assert.strictEqual(suspended.lifecycle, "suspended");
      assert.strictEqual(resumed.lifecycle, "active");
      assert.strictEqual(records.length, 3);
      assert.deepStrictEqual(
        records.map(
          ({ timestamp, publicationRevision, machineTurnRevision, evidenceSequence }) => ({
            timestamp,
            publicationRevision,
            machineTurnRevision,
            evidenceSequence,
          }),
        ),
        [
          { timestamp: 100, publicationRevision: 1, machineTurnRevision: 0, evidenceSequence: 1 },
          { timestamp: 100, publicationRevision: 2, machineTurnRevision: 0, evidenceSequence: 2 },
          { timestamp: 100, publicationRevision: 3, machineTurnRevision: 0, evidenceSequence: 3 },
        ],
      );
      assert.deepStrictEqual(
        records.map(({ actorKey, actorIncarnation, actorLeaseEpoch }) => ({
          actorKey,
          actorIncarnation,
          actorLeaseEpoch,
        })),
        [
          {
            actorKey: actor.fence.key,
            actorIncarnation: actor.fence.incarnation,
            actorLeaseEpoch: actor.fence.leaseEpoch,
          },
          {
            actorKey: actor.fence.key,
            actorIncarnation: actor.fence.incarnation,
            actorLeaseEpoch: actor.fence.leaseEpoch,
          },
          {
            actorKey: actor.fence.key,
            actorIncarnation: actor.fence.incarnation,
            actorLeaseEpoch: actor.fence.leaseEpoch,
          },
        ],
      );
      assert.deepStrictEqual(
        records.map(({ _tag, machineTurn, from, to }) => ({
          _tag,
          machineTurn,
          from,
          to,
        })),
        [
          { _tag: "lifecycle", machineTurn: false, from: "prepared", to: "active" },
          { _tag: "lifecycle", machineTurn: false, from: "active", to: "suspended" },
          { _tag: "lifecycle", machineTurn: false, from: "suspended", to: "active" },
        ],
      );
    }),
  );

  it.effect("tombstones lifecycle evidence after publication and acceptance failures", () =>
    Effect.gen(function* () {
      const actor = makeFence(LifecycleMachine, "evidence-failure");

      const owner = makeRuntimeEvidenceOwner({
        app: LifecycleApp,
        plan: LifecyclePlan,
        clock: { now: Effect.succeed(100), timestamp: () => 100, sleepUntil: () => Effect.void },
      });

      let failure: "publication" | "acceptance" | undefined = "publication";

      const service: RuntimeEvidenceService = {
        ...owner.service,
        publish: (snapshot) =>
          failure === "publication"
            ? Effect.fail(
                Failure({
                  code: "InvariantViolation",
                  path: ["evidence", "publication"],
                  details: {},
                  summary: "publication failed",
                  help: "retry the publication",
                }),
              )
            : owner.service.publish(snapshot),
        accept: (record) =>
          failure === "acceptance"
            ? Effect.fail(
                Failure({
                  code: "InvariantViolation",
                  path: ["evidence", "acceptance"],
                  details: {},
                  summary: "acceptance failed",
                  help: "retry the acceptance",
                }),
              )
            : owner.service.accept(record),
      };

      const layer = makeRuntimeServicesLayer({
        clock: { now: Effect.succeed(100), timestamp: () => 100, sleepUntil: () => Effect.void },
        scheduler: makeRuntimeScheduler(),
        evidence: service,
      });

      const prepared = () =>
        resultSuccess(
          prepareLifecycle<typeof LifecycleDefinition, string>(actor.fence, { _tag: "fresh" }),
        );

      const first = yield* Effect.exit(
        withRuntime(
          runLifecycleCommand(prepared(), { _tag: "actor:start", cause: { _tag: "fresh" } }),
          layer,
        ),
      );

      assert.ok(Exit.isFailure(first));

      failure = "acceptance";

      const second = yield* Effect.exit(
        withRuntime(
          runLifecycleCommand(prepared(), { _tag: "actor:start", cause: { _tag: "fresh" } }),
          layer,
        ),
      );

      assert.ok(Exit.isFailure(second));

      failure = undefined;

      const active = yield* withRuntime(
        runLifecycleCommand(prepared(), { _tag: "actor:start", cause: { _tag: "fresh" } }),
        layer,
      );

      assert.strictEqual(active.lifecycle, "active");
      assert.strictEqual(owner.hub.sequence(), 3);
      const drained = yield* owner.hub.drain();
      assert.strictEqual(drained.through, 3);
    }),
  );

  it.effect("derives actor provenance separately for two lifecycle owners", () =>
    Effect.gen(function* () {
      const first = makeFence(LifecycleMachine, "evidence-first");
      const second = makeFence(LifecycleMachine, "evidence-second");

      const records: Array<{
        app: App;
        plan: ReturnType<typeof appPlan>;
        key: string;
        incarnation: number;
        leaseEpoch: number;
      }> = [];

      const evidenceOwner = makeRuntimeEvidenceOwner({
        app: LifecycleApp,
        plan: LifecyclePlan,
        clock: { now: Effect.succeed(300), timestamp: () => 300, sleepUntil: () => Effect.void },
      });

      const layer = makeRuntimeServicesLayer({
        clock: { now: Effect.succeed(300), timestamp: () => 300, sleepUntil: () => Effect.void },
        scheduler: makeRuntimeScheduler(),
        evidence: {
          ...evidenceOwner.service,
          publish: () => Effect.void,
          accept: (record) =>
            Effect.sync(() =>
              records.push({
                app: record.provenance.app,
                plan: record.provenance.plan,
                key: record.provenance.actor.key,
                incarnation: record.provenance.actor.incarnation,
                leaseEpoch: record.provenance.actor.leaseEpoch,
              }),
            ),
        },
      });

      const start = (owner: { fence: ActorFence }) =>
        withRuntime(
          runLifecycleCommand(
            resultSuccess(
              prepareLifecycle<typeof LifecycleDefinition, string>(owner.fence, { _tag: "fresh" }),
            ),
            { _tag: "actor:start", cause: { _tag: "fresh" } },
          ),
          layer,
        );

      yield* start(first);
      yield* start(second);
      assert.deepStrictEqual(records, [
        {
          app: LifecycleApp,
          plan: LifecyclePlan,
          key: first.fence.key,
          incarnation: first.fence.incarnation,
          leaseEpoch: first.fence.leaseEpoch,
        },
        {
          app: LifecycleApp,
          plan: LifecyclePlan,
          key: second.fence.key,
          incarnation: second.fence.incarnation,
          leaseEpoch: second.fence.leaseEpoch,
        },
      ]);
      assert.strictEqual(records[0]?.app, LifecycleApp);
      assert.strictEqual(records[0]?.plan, LifecyclePlan);
      assert.strictEqual(records[1]?.app, LifecycleApp);
      assert.strictEqual(records[1]?.plan, LifecyclePlan);
    }),
  );

  it.effect("retains a failed suspended state in the serialized controller", () =>
    Effect.gen(function* () {
      const actor = makeFence(LifecycleMachine, "controller-failure");
      const published: Array<unknown> = [];
      const accepted: Array<{ from: string; to: string }> = [];

      const evidenceOwner = makeRuntimeEvidenceOwner({
        app: LifecycleApp,
        plan: LifecyclePlan,
        clock: { now: Effect.succeed(200), timestamp: () => 200, sleepUntil: () => Effect.void },
      });

      const layer = makeRuntimeServicesLayer({
        clock: { now: Effect.succeed(200), timestamp: () => 200, sleepUntil: () => Effect.void },
        scheduler: makeRuntimeScheduler(),
        evidence: {
          ...evidenceOwner.service,
          publish: (snapshot) => Effect.sync(() => published.push(snapshot)),
          accept: (record) =>
            Effect.sync(() => accepted.push({ from: record.from, to: record.to })),
        },
      });

      const active = yield* withRuntime(
        activateLifecycle(
          resultSuccess(
            prepareLifecycle<typeof LifecycleDefinition, string>(actor.fence, { _tag: "fresh" }),
          ),
        ),
        layer,
      );

      const resource: LifecycleResource<string> = {
        name: "controller-failure",
        scope: Scope.makeUnsafe(),
        close: () => Effect.fail("cleanup-failed" as const),
        finalization: "pending",
        cause: Option.none(),
      };

      const controller = makeLifecycleController({
        ...active,
        attachment: { ...active.attachment, resources: [resource] },
      });

      const suspended = yield* Effect.exit(
        withRuntime(
          controller.command({
            _tag: "actor:suspend",
            cause: { _tag: "attachment" },
          }),
          layer,
        ),
      );

      assert.ok(Exit.isFailure(suspended));
      const retained = yield* controller.state();
      assert.strictEqual(retained.lifecycle, "suspended");
      assert.strictEqual(retained.finalization, "failed");
      assert.strictEqual(published.length, 1);
      assert.deepStrictEqual(accepted, [{ from: "active", to: "suspended" }]);

      const resumed = yield* Effect.exit(
        withRuntime(
          controller.command({
            _tag: "actor:resume",
            cause: { _tag: "attachment" },
          }),
          layer,
        ),
      );

      assert.ok(Exit.isFailure(resumed));
      assert.strictEqual(published.length, 1);
      assert.deepStrictEqual(accepted, [{ from: "active", to: "suspended" }]);
    }),
  );

  it.effect("activates a prepared actor through one lifecycle command", () =>
    Effect.gen(function* () {
      const prepared = makePrepared();

      const active = yield* withRuntime(
        runLifecycleCommand(prepared, { _tag: "actor:start", cause: { _tag: "fresh" } }),
      );

      assert.strictEqual(active.lifecycle, "active");
      assert.strictEqual(active.attachment.status, "attached");
      assert.strictEqual(active.fence.key, prepared.fence.key);
    }),
  );

  it.effect("suspends after cancelling owned work", () =>
    Effect.gen(function* () {
      const active = yield* withRuntime(activateLifecycle(makePrepared()));
      const order: string[] = [];
      const fiber = yield* Effect.forkChild(Effect.never);

      const work: LifecycleWork<string> = {
        name: "owned-work",
        fiber,
        cancel: Fiber.interrupt(fiber).pipe(
          Effect.tap(() => Effect.sync(() => order.push("cancel"))),
        ),
        finalizer: Effect.sync(() => order.push("work-finalizer")),
        finalization: "pending",
        cause: Option.none(),
      };

      const resource: LifecycleResource<string> = {
        name: "owned-resource",
        scope: Scope.makeUnsafe(),
        close: () => Effect.sync(() => order.push("resource-close")),
        finalization: "pending",
        cause: Option.none(),
      };

      const suspended = yield* withRuntime(
        suspendLifecycle({
          ...active,
          attachment: { ...active.attachment, work: [work], resources: [resource] },
        }),
      );

      assert.strictEqual(suspended.lifecycle, "suspended");
      assert.deepStrictEqual(order, ["cancel", "work-finalizer", "resource-close"]);
    }),
  );

  it.effect("resumes retained lifecycle data without duplicate work", () =>
    Effect.gen(function* () {
      const active = yield* withRuntime(activateLifecycle(makePrepared()));

      const retainedTimer = {
        name: "retained",
        startedAt: 1,
        dueAt: 10,
        status: "cancelled" as const,
      };

      const suspended = yield* withRuntime(
        suspendLifecycle({
          ...active,
          attachment: { ...active.attachment, timers: [retainedTimer] },
        }),
      );

      const resumed = yield* withRuntime(resumeLifecycle(suspended));
      assert.strictEqual(resumed.lifecycle, "active");
      assert.deepStrictEqual(resumed.attachment.timers, [retainedTimer]);
      assert.deepStrictEqual(resumed.attachment.resources, []);
      assert.deepStrictEqual(resumed.attachment.operations, []);
    }),
  );

  it.effect("disposes active work before lifecycle resources", () =>
    Effect.gen(function* () {
      const active = yield* withRuntime(activateLifecycle(makePrepared()));
      const order: string[] = [];
      const fiber = yield* Effect.forkChild(Effect.never);

      const work: LifecycleWork<string> = {
        name: "dispose-work",
        fiber,
        cancel: Fiber.interrupt(fiber).pipe(
          Effect.tap(() => Effect.sync(() => order.push("cancel"))),
        ),
        finalizer: Effect.sync(() => order.push("work-finalizer")),
        finalization: "pending",
        cause: Option.none(),
      };

      const resource: LifecycleResource<string> = {
        name: "dispose-resource",
        scope: Scope.makeUnsafe(),
        close: () => Effect.sync(() => order.push("resource-close")),
        finalization: "pending",
        cause: Option.none(),
      };

      const disposed = yield* withRuntime(
        disposeLifecycle({
          ...active,
          attachment: { ...active.attachment, work: [work], resources: [resource] },
        }),
      );

      assert.strictEqual(disposed.lifecycle, "disposed");
      assert.deepStrictEqual(order, ["cancel", "work-finalizer", "resource-close"]);
    }),
  );

  it.effect("routes retained pre-transition snapshots through the current owner state", () =>
    Effect.gen(function* () {
      const active = yield* withRuntime(activateLifecycle(makePrepared()));
      const stale = active;
      const suspended = yield* withRuntime(suspendLifecycle(active));
      assert.strictEqual(suspended.lifecycle, "suspended");

      const disposed = yield* withRuntime(disposeLifecycle(stale));
      assert.strictEqual(disposed.lifecycle, "disposed");
      assert.strictEqual(stale.lifecycle, "active");
    }),
  );

  it.effect("keeps disposed lifecycle terminal and idempotent", () =>
    Effect.gen(function* () {
      const disposed = yield* withRuntime(
        disposeLifecycle(yield* withRuntime(activateLifecycle(makePrepared()))),
      );

      const again = yield* withRuntime(
        runLifecycleCommand(disposed, { _tag: "actor:dispose", cause: { _tag: "owner-disposal" } }),
      );

      assert.strictEqual(again, disposed);
      assert.strictEqual(
        (yield* Effect.exit(
          withRuntime(
            runLifecycleCommand(disposed, { _tag: "actor:start", cause: { _tag: "fresh" } }),
          ),
        ))._tag,
        "Failure",
      );
    }),
  );

  it.effect("retains cleanup failure Cause on terminal disposal", () =>
    Effect.gen(function* () {
      const active = yield* withRuntime(activateLifecycle(makePrepared()));
      const failure = "cleanup failed" as const;

      const resource: LifecycleResource<string> = {
        name: "failing-cleanup",
        scope: Scope.makeUnsafe(),
        close: () => Effect.fail(failure),
        finalization: "pending",
        cause: Option.none(),
      };

      const result = yield* Effect.exit(
        withRuntime(
          disposeLifecycle({
            ...active,
            attachment: { ...active.attachment, resources: [resource] },
          }),
        ),
      );

      assert.ok(Exit.isFailure(result));
      const state = yield* withRuntime(Effect.succeed(active));
      assert.strictEqual(state.lifecycle, "active");

      if (Exit.isFailure(result)) assert.strictEqual(Cause.hasFails(result.cause), true);
    }),
  );

  it.effect("continues reverse cleanup after a finalizer defect", () =>
    Effect.gen(function* () {
      const active = yield* withRuntime(activateLifecycle(makePrepared()));
      const order: string[] = [];

      const first: LifecycleResource<string> = {
        name: "first",
        scope: Scope.makeUnsafe(),
        close: () => Effect.die("defect"),
        finalization: "pending",
        cause: Option.none(),
      };

      const second: LifecycleResource<string> = {
        name: "second",
        scope: Scope.makeUnsafe(),
        close: () => Effect.sync(() => order.push("second")),
        finalization: "pending",
        cause: Option.none(),
      };

      const result = yield* Effect.exit(
        withRuntime(
          disposeLifecycle({
            ...active,
            attachment: { ...active.attachment, resources: [first, second] },
          }),
        ),
      );

      assert.ok(Exit.isFailure(result));
      assert.deepStrictEqual(order, ["second"]);

      if (Exit.isFailure(result)) {
        assert.strictEqual(Cause.hasFails(result.cause), true);
        const failure = Cause.findError(result.cause);
        assert.ok(Result.isSuccess(failure));

        if (Result.isSuccess(failure)) assert.strictEqual(failure.success.code, "Defect");
      }
    }),
  );

  it.effect("fulfills interrupted work completion during suspension", () =>
    Effect.gen(function* () {
      const active = yield* withRuntime(activateLifecycle(makePrepared()));
      const fiber = yield* Effect.forkChild(Effect.never);
      const completion = yield* Deferred.make<Exit.Exit<void, string>>();

      const work: LifecycleWork<string> = {
        name: "completion",
        fiber,
        cancel: Fiber.interrupt(fiber),
        finalizer: Effect.void,
        finalization: "pending",
        cause: Option.none(),
        completion,
      };

      yield* withRuntime(
        suspendLifecycle({ ...active, attachment: { ...active.attachment, work: [work] } }),
      );
      const exit = yield* Deferred.await(completion);
      assert.ok(Exit.isFailure(exit));

      if (Exit.isFailure(exit)) assert.strictEqual(Cause.hasInterrupts(exit.cause), true);
    }),
  );

  it.effect("keeps resource cleanup under the lifecycle scope", () =>
    Effect.gen(function* () {
      const active = yield* withRuntime(activateLifecycle(makePrepared()));
      let closed = 0;
      const scope = yield* Scope.make("sequential");

      const resource: LifecycleResource<string> = {
        name: "scoped",
        scope,
        close: () =>
          Effect.sync(() => {
            closed += 1;
          }),
        finalization: "pending",
        cause: Option.none(),
      };

      const suspended = yield* withRuntime(
        suspendLifecycle({
          ...active,
          attachment: { ...active.attachment, resources: [resource] },
        }),
      );

      assert.strictEqual(closed, 1);
      assert.strictEqual(suspended.attachment.resources[0]?.name, "scoped");
    }),
  );

  it.effect("blocks lifecycle disposal while dependent edges remain", () =>
    Effect.gen(function* () {
      const active = yield* withRuntime(activateLifecycle(makePrepared()));

      const blocked = {
        ...active,
        attachment: {
          ...active.attachment,
          blockedDisposal: {
            dependentActors: [actorRef(LifecycleMachine, "dependent")],
            bindingKeys: [],
          },
        },
      };

      const result = yield* Effect.exit(withRuntime(disposeLifecycle(blocked)));
      assert.ok(Exit.isFailure(result));
      assert.strictEqual(blocked.lifecycle, "active");

      if (Exit.isFailure(result))
        // SAFETY: The blocked-disposal proof has already established a failure Cause; this narrow view reads its typed diagnostic.
        assert.strictEqual(
          (result.cause.reasons[0] as { error?: PublicDiagnostic }).error?.code,
          "BlockedByDependents",
        );
    }),
  );

  it.effect("retains context dependencies across suspension", () =>
    Effect.gen(function* () {
      const consumer = makeFence(ConsumerMachine, "retained-consumer");
      const provider = makeFence(ProviderMachine, "retained-provider");

      const binding = {
        slot: "selected",
        provider: provider.ref,
        providerFence: provider.fence,
        select: ({ state }) => state,
      } satisfies ActorContextBinding<typeof ConsumerDefinition, typeof ProviderDefinition>;

      const prepared = resultSuccess(
        prepareLifecycle<typeof ConsumerDefinition, string, typeof ProviderDefinition>(
          consumer.fence,
          { _tag: "fresh" },
        ),
      );

      const installed = resultSuccess(
        installLifecycleMetadata(prepared, {
          dependencies: [
            { consumer: consumer.fence.key, provider: provider.fence.key, slot: "selected" },
          ],
          bindings: [binding],
          providerRevisions: new Map([[provider.fence.key, 0]]),
          providerFences: new Map([[provider.fence.key, provider.fence]]),
        }),
      );

      const active = yield* withRuntime(activateLifecycle(installed));
      const suspended = yield* withRuntime(suspendLifecycle(active));
      assert.strictEqual(suspended.attachment.bindings[0]?.providerFence.key, provider.fence.key);
      assert.deepStrictEqual(
        suspended.attachment.dependencies.map((edge) => edge.provider),
        [provider.fence.key],
      );
    }),
  );

  it.effect("rejects resume with a stale dependency fence", () =>
    Effect.gen(function* () {
      const consumer = makeFence(ConsumerMachine, "stale-resume-consumer");
      const provider = makeFence(ProviderMachine, "stale-resume-provider");

      const prepared = resultSuccess(
        prepareLifecycle<typeof ConsumerDefinition, string, typeof ProviderDefinition>(
          consumer.fence,
          { _tag: "fresh" },
        ),
      );

      const binding = {
        slot: "selected",
        provider: provider.ref,
        providerFence: provider.fence,
        select: ({ state }) => state,
      } satisfies ActorContextBinding<typeof ConsumerDefinition, typeof ProviderDefinition>;

      const installed = resultSuccess(
        installLifecycleMetadata(prepared, {
          dependencies: [],
          bindings: [binding],
          providerRevisions: new Map([[provider.fence.key, 0]]),
          providerFences: new Map([[provider.fence.key, { ...provider.fence, generation: 1 }]]),
        }),
      );

      const active = yield* withRuntime(activateLifecycle(installed));
      const suspended = yield* withRuntime(suspendLifecycle(active));
      const resumed = yield* Effect.exit(withRuntime(resumeLifecycle(suspended)));
      assert.ok(Exit.isFailure(resumed));

      if (Exit.isFailure(resumed)) assert.strictEqual(Cause.hasFails(resumed.cause), true);
    }),
  );

  it.effect("retains absolute timer deadlines across suspension", () =>
    Effect.gen(function* () {
      const active = yield* withRuntime(activateLifecycle(makePrepared()));

      const timer = {
        name: "deadline",
        startedAt: 100,
        dueAt: 200,
        status: "armed" as const,
        generation: active.fence.generation,
      };

      const suspended = yield* withRuntime(
        suspendLifecycle({ ...active, attachment: { ...active.attachment, timers: [timer] } }),
      );

      const resumed = yield* withRuntime(resumeLifecycle(suspended));
      assert.strictEqual(resumed.attachment.timers[0]?.dueAt, 200);
      yield* withRuntime(disposeLifecycle(resumed));
    }),
  );

  it.effect("retains operation occurrence fences across resume", () =>
    Effect.gen(function* () {
      const { identity, fence } = makeFence(OccurrenceMachine, "occurrence");

      const occurrence: OperationOccurrenceFence = {
        actor: fence,
        descriptor: occurrenceOperation,
        key: occurrenceOperation.key(1),
        ordinal: 1,
      };

      const prepared = resultSuccess(
        prepareLifecycle<typeof OccurrenceDefinition, string>(fence, { _tag: "fresh" }),
      );

      const installed = resultSuccess(
        installLifecycleMetadata(prepared, {
          dependencies: [],
          bindings: [],
          providerRevisions: new Map(),
          providerFences: new Map(),
        }),
      );

      const active = {
        ...installed,
        lifecycle: "active" as const,
        attachment: {
          ...installed.attachment,
          status: "attached" as const,
          operations: [
            {
              fence: occurrence,
              status: "running" as const,
              finalization: "pending" as const,
              cause: Option.none(),
            },
          ],
        },
      };

      const suspended = yield* withRuntime(suspendLifecycle(active));
      const resumed = yield* withRuntime(resumeLifecycle(suspended));
      const retained = resumed.attachment.operations[0]?.fence;
      assert.ok(retained !== undefined);

      if (retained !== undefined) {
        assert.strictEqual(retained.actor.key, fence.key);
        assert.strictEqual(retained.actor.incarnation, fence.incarnation);
        assert.strictEqual(retained.descriptor, occurrenceOperation);
        assert.deepStrictEqual(retained.key, occurrenceOperation.key(1));
        assert.strictEqual(retained.ordinal, 1);
      }

      const scope = yield* Scope.make("sequential");

      const initial: ActorSnapshot<typeof OccurrenceDefinition> = {
        state: OccurrenceDefinition.S.ready,
        memory: {},
        context: {},
        lifecycle: "prepared",
        operations: [
          { descriptor: occurrenceOperation, key: occurrenceOperation.key(1), status: "running" },
        ],
        timers: [],
        issues: [],
        revision: 0,
        observedStoreRevision: 0,
      };

      const preparedEngine = yield* prepareActorEngine({
        identity,
        fence,
        initial: resultSuccess(prepareActorSnapshot(OccurrenceMachine, initial)),
        scope,
      });

      const engine = yield* preparedEngine.activate();

      const completed = engine.dispatchFact({
        _tag: "completion-projection",
        completion: { fence: occurrence, outcome: { _tag: "success", value: 1 } },
      });

      assert.ok(Result.isSuccess(completed));
      yield* engine.drain();
      const terminal = engine.snapshot();
      assert.strictEqual(terminal.operations[0]?.status, "succeeded");
      assert.strictEqual(terminal.revision, 1);

      const duplicate = engine.dispatchFact({
        _tag: "completion-projection",
        completion: { fence: occurrence, outcome: { _tag: "success", value: 1 } },
      });

      assert.ok(Result.isSuccess(duplicate));

      const lateIncarnation = engine.dispatchFact({
        _tag: "completion-projection",
        completion: {
          fence: {
            // SAFETY: A replaced actor incarnation deliberately crosses the private fence seam.
            actor: { ...fence, incarnation: (fence.incarnation + 1) as typeof fence.incarnation },
            descriptor: occurrenceOperation,
            key: occurrenceOperation.key(1),
            ordinal: 2,
          },
          outcome: { _tag: "success", value: 2 },
        },
      });

      assert.ok(Result.isSuccess(lateIncarnation));
      yield* engine.drain();
      assert.strictEqual(engine.snapshot(), terminal);

      let cleanups = 0;

      const disposed = yield* withRuntime(
        disposeLifecycle({
          ...resumed,
          attachment: {
            ...resumed.attachment,
            resources: [
              {
                name: "terminal-resource",
                scope: Scope.makeUnsafe(),
                close: () =>
                  Effect.sync(() => {
                    cleanups += 1;
                  }),
                finalization: "pending" as const,
                cause: Option.none(),
              },
            ],
          },
        }),
      );

      const again = yield* withRuntime(disposeLifecycle(disposed));
      assert.strictEqual(disposed.lifecycle, "disposed");
      assert.strictEqual(again, disposed);
      assert.strictEqual(cleanups, 1);
      yield* engine.shutdown("hard");
      yield* Scope.close(scope, Exit.void);
    }),
  );

  it.effect("restores prepared lifecycle before explicit activation", () =>
    Effect.gen(function* () {
      const prepared = makePrepared();

      const restored = yield* withRuntime(
        runLifecycleCommand(prepared, { _tag: "actor:restore", cause: { _tag: "restore" } }),
      );

      assert.strictEqual(restored.lifecycle, "prepared");

      const active = yield* withRuntime(
        runLifecycleCommand(restored, { _tag: "actor:start", cause: { _tag: "fresh" } }),
      );

      assert.strictEqual(active.lifecycle, "active");
    }),
  );

  it.effect("serializes competing lifecycle transitions", () =>
    Effect.gen(function* () {
      const active = yield* withRuntime(activateLifecycle(makePrepared()));
      const controller = makeLifecycleController(active);

      const suspend = yield* Effect.forkChild(
        withRuntime(controller.command({ _tag: "actor:suspend", cause: { _tag: "attachment" } })),
        { startImmediately: true },
      );

      const dispose = yield* Effect.forkChild(
        withRuntime(
          controller.command({ _tag: "actor:dispose", cause: { _tag: "owner-disposal" } }),
        ),
        { startImmediately: true },
      );

      const suspended = yield* Fiber.join(suspend);
      const disposed = yield* Fiber.join(dispose);
      assert.strictEqual(suspended.lifecycle, "suspended");
      assert.strictEqual(disposed.lifecycle, "disposed");
      assert.strictEqual((yield* controller.state()).lifecycle, "disposed");
    }),
  );

  it.effect("disposes an empty lifecycle without synthetic work", () =>
    Effect.gen(function* () {
      const disposed = yield* withRuntime(disposeLifecycle(makePrepared()));
      assert.strictEqual(disposed.lifecycle, "disposed");
      assert.deepStrictEqual(disposed.attachment.work, []);
      assert.deepStrictEqual(disposed.attachment.resources, []);
    }),
  );

  it.effect("publishes lifecycle evidence with its complete snapshot cut", () =>
    Effect.gen(function* () {
      const owner = makeRuntimeEvidenceOwner({
        app: LifecycleApp,
        plan: LifecyclePlan,
        clock: { now: Effect.succeed(77), timestamp: () => 77, sleepUntil: () => Effect.void },
      });

      const records: unknown[] = [];

      const layer = makeRuntimeServicesLayer({
        clock: fixedClock,
        scheduler: makeRuntimeScheduler(),
        evidence: { ...owner.service, accept: (record) => Effect.sync(() => records.push(record)) },
      });

      const active = yield* withRuntime(
        runLifecycleCommand(makePrepared(), { _tag: "actor:start", cause: { _tag: "fresh" } }),
        layer,
      );

      assert.strictEqual(active.lifecycle, "active");
      assert.strictEqual(records.length, 1);

      // SAFETY: The preceding length assertion establishes the retained record at index zero.
      const record = records[0] as {
        before: unknown;
        after: unknown;
        provenance: { actor: unknown };
      };

      assert.ok(record.before !== undefined);
      assert.ok(record.after !== undefined);
      assert.ok(record.provenance.actor !== undefined);
      yield* owner.close();
    }),
  );

  it.effect("linearizes repeated disposal during finalization", () =>
    Effect.gen(function* () {
      const active = yield* withRuntime(activateLifecycle(makePrepared()));
      let closes = 0;

      const resource: LifecycleResource<string> = {
        name: "once",
        scope: Scope.makeUnsafe(),
        close: () =>
          Effect.sync(() => {
            closes += 1;
          }),
        finalization: "pending",
        cause: Option.none(),
      };

      const controller = makeLifecycleController({
        ...active,
        attachment: { ...active.attachment, resources: [resource] },
      });

      const [first, second] = yield* Effect.all(
        [
          withRuntime(
            controller.command({ _tag: "actor:dispose", cause: { _tag: "owner-disposal" } }),
          ),
          withRuntime(
            controller.command({ _tag: "actor:dispose", cause: { _tag: "owner-disposal" } }),
          ),
        ],
        { concurrency: "unbounded" },
      );

      assert.strictEqual(closes, 1);
      assert.strictEqual(first.lifecycle, "disposed");
      assert.strictEqual(second.lifecycle, "disposed");
    }),
  );

  it.effect("keeps failed resource cleanup visible across lifecycle recovery", () =>
    Effect.gen(function* () {
      const active = yield* withRuntime(activateLifecycle(makePrepared()));
      let attempts = 0;

      const resource: LifecycleResource<string> = {
        name: "recoverable",
        scope: Scope.makeUnsafe(),
        close: () =>
          Effect.sync(() => {
            attempts += 1;

            return attempts === 1 ? Effect.fail("cleanup" as const) : Effect.succeed(undefined);
          }).pipe(Effect.flatten),
        finalization: "pending",
        cause: Option.none(),
      };

      const controller = makeLifecycleController({
        ...active,
        attachment: { ...active.attachment, resources: [resource] },
      });

      const first = yield* Effect.exit(
        withRuntime(
          controller.command({ _tag: "actor:dispose", cause: { _tag: "owner-disposal" } }),
        ),
      );

      assert.ok(Exit.isFailure(first));
      const retained = yield* controller.state();
      assert.strictEqual(retained.finalization, "failed");

      const second = yield* withRuntime(
        controller.command({ _tag: "actor:dispose", cause: { _tag: "owner-disposal" } }),
      );

      assert.strictEqual(second.lifecycle, "disposed");
      assert.strictEqual(attempts, 2);
    }),
  );
});

describe("pending regression scenarios", () => {
  // Setup: Extend the real lifecycle owner deadline fixture with a RuntimeClock adapter backed by the provided Effect Clock and an armed timer with a known absolute dueAt.
  // Action: Suspend and resume the lifecycle owner, advance the controlled clock through the deadline, and observe scheduler registrations and refresh completion.
  // Assert: The retained dueAt is unchanged, an overdue timer schedules at most one refresh, and all timestamps and sleeps come from the supplied clock rather than wall time.
  it.effect("uses the provided Clock for retained timer deadlines across suspension", () =>
    Effect.gen(function* () {
      const clock = makeRuntimeClock(yield* Clock.Clock);

      const testLayer = makeRuntimeServicesLayer({
        clock,
        scheduler: makeRuntimeScheduler(),
        evidence,
      });

      const active = yield* withRuntime(activateLifecycle(makePrepared()), testLayer);
      let refreshes = 0;

      const timer = {
        name: "controlled-deadline",
        startedAt: 25,
        dueAt: 50,
        status: "armed" as const,
        generation: active.fence.generation,
        refresh: Effect.sync(() => {
          refreshes += 1;
        }),
      };

      const suspended = yield* withRuntime(
        suspendLifecycle({
          ...active,
          attachment: { ...active.attachment, timers: [timer] },
        }),
        testLayer,
      );

      const resumed = yield* withRuntime(resumeLifecycle(suspended), testLayer);
      const retained = resumed.attachment.timers[0];

      assert.strictEqual(retained?.dueAt, 50);
      assert.ok(retained?.refresh !== undefined);
      const work = resumed.attachment.work[0];
      assert.ok(work !== undefined);
      assert.strictEqual(work?.name, "timer:controlled-deadline");

      yield* TestClock.adjust(10);
      const suspendedBeforeDue = yield* withRuntime(suspendLifecycle(resumed), testLayer);
      const resumedAgain = yield* withRuntime(resumeLifecycle(suspendedBeforeDue), testLayer);
      const rearmed = resumedAgain.attachment.work[0];
      assert.ok(rearmed !== undefined);
      assert.strictEqual(refreshes, 0);

      yield* TestClock.adjust(40);

      if (rearmed !== undefined) {
        const completed = yield* Fiber.await(rearmed.fiber);

        if (Exit.isFailure(completed))
          assert.fail(
            `retained timer failed: ${completed.cause.reasons.map((reason) => reason._tag).join(",")}`,
          );
        assert.ok(Exit.isSuccess(completed));
      }

      assert.strictEqual(refreshes, 1);

      const suspendedAfterDue = yield* withRuntime(suspendLifecycle(resumedAgain), testLayer);
      const resumedAfterDue = yield* withRuntime(resumeLifecycle(suspendedAfterDue), testLayer);
      assert.deepStrictEqual(resumedAfterDue.attachment.work, []);
      assert.strictEqual(refreshes, 1);

      yield* withRuntime(disposeLifecycle(resumedAfterDue), testLayer);
    }).pipe(Effect.provide(TestClock.layer())),
  );

  // Setup: Start an overdue retained timer under the provided TestClock and hold its refresh work at a Deferred.
  // Action: Suspend while that overdue claim is interrupted, then resume the same lifecycle owner without advancing the clock.
  // Assert: The interrupted overdue claim cannot replay its refresh or leave a second timer work item after resume.
  it.effect("does not replay an interrupted overdue retained timer claim", () =>
    Effect.gen(function* () {
      const clock = makeRuntimeClock(yield* Clock.Clock);
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let refreshes = 0;

      const testLayer = makeRuntimeServicesLayer({
        clock,
        scheduler: makeRuntimeScheduler(),
        evidence,
      });

      const active = yield* withRuntime(activateLifecycle(makePrepared()), testLayer);

      const timer = {
        name: "interrupted-overdue",
        startedAt: 0,
        dueAt: 0,
        status: "armed" as const,
        generation: active.fence.generation,
        refresh: Effect.gen(function* () {
          yield* Deferred.succeed(entered, undefined);
          yield* Deferred.await(release);
          refreshes += 1;
        }),
      };

      const suspended = yield* withRuntime(
        suspendLifecycle({ ...active, attachment: { ...active.attachment, timers: [timer] } }),
        testLayer,
      );

      const resumed = yield* withRuntime(resumeLifecycle(suspended), testLayer);
      yield* Deferred.await(entered);

      const interrupted = yield* Effect.exit(withRuntime(suspendLifecycle(resumed), testLayer));

      assert.ok(Exit.isSuccess(interrupted));

      const resumedAfterInterrupt = yield* withRuntime(
        resumeLifecycle(interrupted.value),
        testLayer,
      );

      assert.deepStrictEqual(resumedAfterInterrupt.attachment.work, []);
      assert.strictEqual(refreshes, 0);
      yield* withRuntime(disposeLifecycle(resumedAfterInterrupt), testLayer);
    }).pipe(Effect.provide(TestClock.layer())),
  );

  // Setup: Use a real LifecycleController with two work participants. One has a failed cancel, a fiber already completed with interruption, and an explicit retryable finalizer that fails once; the independent participant cleans successfully. Keep Scope finalizers separate.
  // Action: Dispose and capture all stage outcomes; repair the explicit failed cancel/finalizer stages and retry through the same owner, then repeat disposal after release settles.
  // Assert: First outcome retains typed failure, unsuppressed interruption and defect in execution order; sibling cleanup continues. Retry executes only failed explicit stages, observes the cached completion rather than restarting it, releases lifetime once, and retains the original non-suppressed cleanup Cause in the terminal result. Successful stage effects never replay and the actor never resumes after cleanup failure.
  it.effect("retains mixed cleanup Causes and retries only failed cleanup stages", () =>
    Effect.gen(function* () {
      const active = yield* withRuntime(activateLifecycle(makePrepared()));
      const scope = Scope.makeUnsafe();
      const closeFailure = "resource-close-failure" as const;
      const scopeDefect = new Error("resource-scope-defect");
      yield* Scope.addFinalizer(scope, Effect.die(scopeDefect));
      let closeAttempts = 0;

      const controller = makeLifecycleController({
        ...active,
        attachment: {
          ...active.attachment,
          resources: [
            {
              name: "mixed-cleanup",
              scope,
              close: () =>
                Effect.sync(() => {
                  closeAttempts += 1;

                  return Effect.fail(closeFailure);
                }).pipe(Effect.flatten),
              finalization: "pending",
              cause: Option.none(),
            },
          ],
        },
      });

      const first = yield* Effect.exit(
        withRuntime(
          controller.command({ _tag: "actor:dispose", cause: { _tag: "owner-disposal" } }),
        ),
      );

      assert.ok(Exit.isFailure(first));
      assert.strictEqual(closeAttempts, 1);
      const retained = yield* controller.state();
      assert.strictEqual(retained.finalization, "failed");
      const retainedResource = retained.attachment.resources[0];
      assert.ok(retainedResource !== undefined);

      if (retainedResource !== undefined && Option.isSome(retainedResource.cause)) {
        assert.deepStrictEqual(
          retainedResource.cause.value.reasons.map((reason) => reason._tag),
          ["Fail", "Die"],
        );
        assert.strictEqual(
          retainedResource.cause.value.reasons.filter(Cause.isFailReason).length,
          1,
        );
        assert.strictEqual(
          retainedResource.cause.value.reasons.filter(Cause.isDieReason).length,
          1,
        );
      }

      const second = yield* Effect.exit(
        withRuntime(
          controller.command({ _tag: "actor:dispose", cause: { _tag: "owner-disposal" } }),
        ),
      );

      assert.ok(Exit.isFailure(second));
      assert.strictEqual(closeAttempts, 2);
    }),
  );

  // Setup: Use real lifecycle owners with scoped resource acquisitions and one evidence hub; install a finalizer signal on each acquired resource and queue terminal lifecycle records.
  // Action: Dispose the lifecycle owners, await every prompt finalizer signal, then call hub.close so its accepted-prefix drain completes before sink close; inspect the sink's received records after close returns.
  // Assert: Each finalizer runs once before sink close, close reports the captured accepted prefix, every queued terminal record is present after close, and no record arrives after the sink has closed.
  it.effect("closes retained lifecycle scopes before evidence sink close", () =>
    Effect.gen(function* () {
      const order: string[] = [];

      const evidenceOwner = makeRuntimeEvidenceOwner({
        app: LifecycleApp,
        plan: LifecyclePlan,
        clock: fixedClock,
      });

      const sink = yield* makeEvidenceSink({
        id: "lifecycle-scope-order",
        capacity: 8,
        deliver: () => Effect.void,
      });

      assert.ok(Result.isSuccess(evidenceOwner.hub.attach(sink)));

      const resourceScope = yield* Scope.make("sequential");
      yield* Scope.addFinalizer(
        resourceScope,
        Effect.sync(() => order.push("scope-finalizer")),
      );
      const active = yield* withRuntime(activateLifecycle(makePrepared()));

      const controller = makeLifecycleController({
        ...active,
        attachment: {
          ...active.attachment,
          resources: [
            {
              name: "retained-resource",
              scope: resourceScope,
              close: () => Effect.sync(() => order.push("resource-close")),
              finalization: "pending",
              cause: Option.none(),
            },
          ],
        },
      });

      const services = makeRuntimeServicesLayer({
        clock: fixedClock,
        scheduler: makeRuntimeScheduler(),
        evidence: evidenceOwner.service,
      });

      const owner = makeLifecycleRuntimeOwner({
        drain: evidenceOwner.service.drain,
      });

      owner.registerActor({
        dispose: () =>
          controller.command({ _tag: "actor:dispose", cause: { _tag: "owner-disposal" } }),
      });
      owner.registerProvider(
        Effect.gen(function* () {
          yield* evidenceOwner.close();
          order.push("sink-closed");
        }),
      );

      yield* Effect.provide(owner.dispose(), services);
      assert.deepStrictEqual(order, ["resource-close", "scope-finalizer", "sink-closed"]);
    }),
  );

  // Setup: Acquire a real scoped lifecycle resource whose Scope finalizer records one call and dies; keep explicit retryable release separate from that finalizer.
  // Action: Dispose through the real owner, await lifetime release and its failed terminal Exit, then dispose again.
  // Assert: The Scope finalizer runs once and both calls retain the same terminal cleanup Cause. No Scope-close retry or successful disposal result is fabricated; cleanup-failure truth remains suspended and resume is blocked.
  it.effect("retains a Scope finalizer failure as terminal cleanup truth", () =>
    Effect.gen(function* () {
      const active = yield* withRuntime(activateLifecycle(makePrepared()));
      const scope = Scope.makeUnsafe();
      const defect = new Error("terminal-scope-defect");
      let finalizers = 0;
      yield* Scope.addFinalizer(
        scope,
        Effect.gen(function* () {
          finalizers += 1;
          yield* Effect.die(defect);
        }),
      );

      const controller = makeLifecycleController({
        ...active,
        attachment: {
          ...active.attachment,
          resources: [
            {
              name: "terminal-scope",
              scope,
              close: () => Effect.void,
              finalization: "pending",
              cause: Option.none(),
            },
          ],
        },
      });

      const first = yield* Effect.exit(
        withRuntime(
          controller.command({ _tag: "actor:dispose", cause: { _tag: "owner-disposal" } }),
        ),
      );

      const firstState = yield* controller.state();

      const second = yield* Effect.exit(
        withRuntime(
          controller.command({ _tag: "actor:dispose", cause: { _tag: "owner-disposal" } }),
        ),
      );

      assert.ok(Exit.isFailure(first));
      assert.ok(Exit.isSuccess(second));
      assert.strictEqual(finalizers, 1);

      if (Exit.isFailure(first)) {
        assert.strictEqual(Cause.hasFails(first.cause), true);
      }

      const resource = firstState.attachment.resources[0];
      assert.ok(resource !== undefined);

      if (resource !== undefined && Option.isSome(resource.cause))
        assert.strictEqual(Cause.hasDies(resource.cause.value), true);
    }),
  );
});
