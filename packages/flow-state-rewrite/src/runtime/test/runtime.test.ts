// oxlint-disable-next-line anti-slop/no-large-production-file -- RuntimeSetup readiness, admission, and terminal-outcome proofs share one public runtime assembly boundary.
import { assert, describe, it } from "@effect/vitest";
import {
  Cause,
  Context,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Result,
  type Types,
} from "effect";

import { app, module } from "../../app/app.js";
import { definition } from "../../definition/definition.js";
import { Implementation } from "../../implementation/implementation.js";
import { machine } from "../../machine/machine.js";
import { resource } from "../../operation/resource.js";
import { actorRef } from "../actor-ref.js";
import {
  makeActorIdentityRegistry,
  type ActorContextBinding,
  type ActorContextSnapshot,
} from "../actor-admission.js";
import { prepareActorSnapshot } from "../actor-engine.js";
import type {
  AcknowledgedDispatch,
  ActorSnapshot,
  PreparedActorSnapshot,
} from "../actor-engine.js";
import { runtimeOwner, runtimeSetup, type Runtime, type RuntimeSetup } from "../runtime.js";
import { RuntimeEvidence } from "../runtime-services.js";

/*
 * Proof organization:
 *
 * Fixtures and local builders
 * Type relationships and negative authoring cases
 * Behavior suites grouped by observable law
 *
 * Mutable setup remains local to its scenario.
 */

type Repository = {
  load: () => string;
};

type Expect<Value extends true> = Value;

class RepositoryKey extends Context.Service<RepositoryKey, Repository>()(
  "RuntimeTest/Repository",
) {}

class ConfigKey extends Context.Service<ConfigKey, { region: string }>()("RuntimeTest/Config") {}

class MissingKey extends Context.Service<MissingKey, { value: string }>()("RuntimeTest/Missing") {}

const repository: Repository = {
  load: () => "loaded",
};

const EmptyApp = app({
  id: "runtime-test/empty",
  persistenceVersion: "1",
  modules: [],
});

const requiredResource = resource({
  id: "runtime-test/repository",
  key: (id: string) => [id] as const,
  // RETURN_TYPE: Preserves the fixture's typed failure and RepositoryKey service channels; removal makes its negative proof unused (TS2578).
  lookup: (id: string): Effect.Effect<string, "missing", RepositoryKey> => Effect.succeed(id),
});

const RequiredDefinitionResult = definition({
  id: "runtime-test/required",
  states: ["ready"],
  events: { refresh: "bare" },
  operations: { repository: requiredResource },
});

const requiredMachine = Result.getOrThrow(
  machine(RequiredDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const RequiredApp = app({
  id: "runtime-test/required-app",
  persistenceVersion: "1",
  modules: [module({ id: "runtime-test/module", machines: { required: requiredMachine } })],
});

const completeImplementation = Implementation.succeed(RepositoryKey, repository);

const emptyAppStrictSuperset = Implementation.merge(
  completeImplementation,
  Implementation.succeed(ConfigKey, { region: "test" }),
);

const emptyAppStrictSupersetSetup = runtimeSetup({
  app: EmptyApp,
  implementation: emptyAppStrictSuperset,
});

const emptyAppSetup = runtimeSetup({ app: EmptyApp });

const typedFailureImplementation = Implementation.effect(
  RepositoryKey,
  Effect.fail("repository-failed" as const),
);

const typedFailureSetup = runtimeSetup({
  app: RequiredApp,
  implementation: typedFailureImplementation,
});

const strictSupersetFailureImplementation = Implementation.merge(
  typedFailureImplementation,
  Implementation.succeed(ConfigKey, { region: "test" }),
);

const strictSupersetFailureSetup = runtimeSetup({
  app: RequiredApp,
  implementation: strictSupersetFailureImplementation,
});

const broadServiceKey = Context.Service<unknown, Repository>("RuntimeTest/BroadRepository");

const broadImplementation = Implementation.succeed(broadServiceKey, repository);

// @ts-expect-error A provider with an unknown service identity cannot close RepositoryKey.
runtimeSetup({ app: RequiredApp, implementation: broadImplementation });

export type RuntimeSetupTypeProofs = [
  Expect<Types.Equals<typeof requiredSetup, RuntimeSetup<typeof RequiredApp>>>,
  Expect<Types.Equals<typeof emptyAppStrictSupersetSetup, RuntimeSetup<typeof EmptyApp>>>,
  Expect<Types.Equals<typeof emptyAppSetup, RuntimeSetup<typeof EmptyApp>>>,
  Expect<
    Types.Equals<typeof typedFailureSetup, RuntimeSetup<typeof RequiredApp, "repository-failed">>
  >,
  Expect<
    Types.Equals<
      typeof strictSupersetFailureSetup,
      RuntimeSetup<typeof RequiredApp, "repository-failed">
    >
  >,
  Expect<
    Types.Equals<
      ReturnType<typeof typedFailureSetup.construct>,
      Runtime<typeof RequiredApp, "repository-failed">
    >
  >,
];

export type _RuntimeSetupApp = ReturnType<typeof runtimeSetup<typeof EmptyApp>>["app"];

// @ts-expect-error RequiredApp still needs RepositoryKey.
runtimeSetup({ app: RequiredApp });

const incompleteImplementation = Implementation.effect(
  RepositoryKey,
  Effect.service(ConfigKey).pipe(Effect.map(() => repository)),
);

const incompleteStrictSupersetImplementation = Implementation.merge(
  completeImplementation,
  Implementation.effect(
    ConfigKey,
    Effect.service(MissingKey).pipe(Effect.map(() => ({ region: "test" }))),
  ),
);

// @ts-expect-error A strict-superset graph with residual requirements is not complete.
runtimeSetup({ app: RequiredApp, implementation: incompleteStrictSupersetImplementation });

const mismatchedImplementation = Implementation.succeed(ConfigKey, { region: "test" });

const chooseImplementation = (useRepository: boolean) =>
  useRepository ? completeImplementation : mismatchedImplementation;

const conditionalImplementation = chooseImplementation(true);

// @ts-expect-error A union that may omit RepositoryKey cannot close RequiredApp.
runtimeSetup({ app: RequiredApp, implementation: conditionalImplementation });

// @ts-expect-error RequiredApp requires RepositoryKey, not ConfigKey.
runtimeSetup({ app: RequiredApp, implementation: mismatchedImplementation });

// @ts-expect-error This provider graph retains an unsatisfied ConfigKey requirement.
runtimeSetup({ app: RequiredApp, implementation: incompleteImplementation });

const requiredSetup = runtimeSetup({ app: RequiredApp, implementation: completeImplementation });

assert.strictEqual(requiredSetup.app, RequiredApp);

const HandshakeProviderDefinitionResult = definition({
  id: "runtime-test/handshake-provider",
  states: ["ready", "changed", "final"],
  events: { advance: "bare", hold: "bare" },
});

const HandshakeProviderDefinition = Result.getOrThrow(HandshakeProviderDefinitionResult);

const HandshakeProviderMachine = Result.getOrThrow(
  machine(HandshakeProviderDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: {
      ready: {
        on: {
          advance: {
            target: S.changed,
          },
        },
      },
      changed: { on: { advance: { target: S.final } } },
      final: {},
    },
  })),
);

const HandshakeConsumerDefinitionResult = definition({
  id: "runtime-test/handshake-consumer",
  states: ["ready"],
  events: {},
  context: {
    providerState: HandshakeProviderDefinition.select(({ state }) => state),
    providerChanged: HandshakeProviderDefinition.select(
      ({ state }) => state === HandshakeProviderDefinition.S.changed,
    ),
  },
});

const HandshakeConsumerDefinition = Result.getOrThrow(HandshakeConsumerDefinitionResult);

const HandshakeConsumerMachine = Result.getOrThrow(
  machine(HandshakeConsumerDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {} },
  })),
);

const HandshakeApp = app({
  id: "runtime-test/handshake",
  persistenceVersion: "1",
  modules: [
    module({
      id: "runtime-test/handshake-module",
      machines: { provider: HandshakeProviderMachine, consumer: HandshakeConsumerMachine },
    }),
  ],
});

// RETURN_TYPE: This fixture pins the provider snapshot family used by the admission handshake.
const initialHandshakeProviderSnapshot = (): PreparedActorSnapshot<
  typeof HandshakeProviderDefinition
> =>
  Result.getOrThrow(
    prepareActorSnapshot(HandshakeProviderMachine, {
      state: HandshakeProviderDefinition.S.ready,
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

// RETURN_TYPE: This fixture pins the consumer snapshot family before provider reconciliation.
const initialHandshakeConsumerSnapshot = (): PreparedActorSnapshot<
  typeof HandshakeConsumerDefinition
> =>
  Result.getOrThrow(
    prepareActorSnapshot(HandshakeConsumerMachine, {
      state: HandshakeConsumerDefinition.S.ready,
      memory: {},
      context: {
        providerState: HandshakeProviderDefinition.S.ready,
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

const HandshakeProviderEvent = Result.getOrThrow(HandshakeProviderDefinition.E.advance());

const HandshakeProviderHoldEvent = Result.getOrThrow(HandshakeProviderDefinition.E.hold());

describe("internal implementation runtime", () => {
  it("derives stable tuple keys without consuming identity allocation", () => {
    const registry = makeActorIdentityRegistry();
    const firstRef = actorRef(requiredMachine, "tuple/actor:one", { persist: true });
    const secondRef = actorRef(requiredMachine, "tuple/actor/one", { persist: true });
    const firstKey = registry.stableKey(firstRef);

    assert.strictEqual(registry.stableKey(firstRef), firstKey);
    assert.notStrictEqual(firstKey, registry.stableKey(secondRef));

    const firstIdentity = Result.getOrThrow(registry.reserveStable(firstRef));
    assert.strictEqual(firstIdentity.key, firstKey);

    const local = Result.getOrThrow(registry.createLocal(requiredMachine));
    assert.notStrictEqual(local.key, firstKey);
    assert.ok(local.incarnation > firstIdentity.incarnation);
  });

  it.effect("reconciles a queued provider publication before exposing the consumer", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: HandshakeApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      let providerDependentRegistrations = 0;
      let providerDependentCleanups = 0;
      let consumerContextPublished = false;
      let consumerExposed = false;
      let providerPublicationCount = 0;
      let consumerStartEvidenceAccepted = false;
      const providerHoldEntered = yield* Deferred.make<void>();
      const providerHoldRelease = yield* Deferred.make<void>();
      const providerPublicationObserved = yield* Deferred.make<void>();
      const admissionTrace: string[] = [];

      const providerPublicationPhases: Array<{
        dependentRegistrations: number;
        providerHoldEntered: boolean;
        consumerStartEvidenceAccepted: boolean;
        consumerContextPublished: boolean;
        consumerExposed: boolean;
      }> = [];

      let providerHoldDispatch: AcknowledgedDispatch | undefined;
      let providerAdvanceDispatch: AcknowledgedDispatch | undefined;

      const provider = yield* assembly.createActor({
        ref: actorRef(HandshakeProviderMachine, "handshake-provider"),
        initial: initialHandshakeProviderSnapshot(),
        onCommand: (command) =>
          command.type === HandshakeProviderHoldEvent.type
            ? Effect.gen(function* () {
                admissionTrace.push("provider-publication-held");
                yield* Deferred.succeed(providerHoldEntered, undefined);
                yield* Deferred.await(providerHoldRelease).pipe(
                  Effect.timeout(Duration.seconds(5)),
                  Effect.orDie,
                );
              })
            : Effect.void,
        onSnapshot: () => {
          providerPublicationCount += 1;
          admissionTrace.push("provider-published");
          providerPublicationPhases.push({
            dependentRegistrations: providerDependentRegistrations,
            providerHoldEntered: Deferred.isDoneUnsafe(providerHoldEntered),
            consumerStartEvidenceAccepted,
            consumerContextPublished,
            consumerExposed,
          });

          if (providerPublicationCount === 1)
            Deferred.doneUnsafe(providerPublicationObserved, Effect.succeed(undefined));
        },
      });

      type ProviderRegistrationHooks = {
        addDependent: (dependent: never) => void;
        removeDependent: (dependent: never) => void;
      };

      // SAFETY: The live runtime actor retains these package-private hooks; this test observes the exact registered provider boundary.
      // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- the public actor view erases the package-private registration hooks used by this proof.
      const providerRegistrationHooks = provider as unknown as ProviderRegistrationHooks;
      const originalAddDependent = providerRegistrationHooks.addDependent;
      const originalRemoveDependent = providerRegistrationHooks.removeDependent;
      providerRegistrationHooks.addDependent = (dependent) => {
        originalAddDependent(dependent);
        providerDependentRegistrations += 1;
        admissionTrace.push("dependent-registered");
        providerHoldDispatch = provider.engine.dispatch(HandshakeProviderHoldEvent);
        providerAdvanceDispatch = provider.engine.dispatch(HandshakeProviderEvent);
      };

      providerRegistrationHooks.removeDependent = (dependent) => {
        providerDependentCleanups += 1;
        admissionTrace.push("dependent-cleaned");
        originalRemoveDependent(dependent);
      };

      const runtimeEvidence = Context.get(assembly.context, RuntimeEvidence);
      const originalAccept = runtimeEvidence.accept;

      runtimeEvidence.accept = (record) =>
        originalAccept(record).pipe(
          Effect.andThen(
            record.before.lifecycle === "prepared" &&
              record.after.lifecycle === "active" &&
              record.after.fence.key !== provider.fence.key
              ? Effect.gen(function* () {
                  yield* Deferred.await(providerHoldEntered).pipe(
                    Effect.timeout(Duration.seconds(5)),
                    Effect.orDie,
                  );
                  consumerStartEvidenceAccepted = true;
                  admissionTrace.push("consumer-start-evidence-accepted");
                  yield* Deferred.succeed(providerHoldRelease, undefined);
                  yield* Deferred.await(providerPublicationObserved).pipe(
                    Effect.timeout(Duration.seconds(5)),
                    Effect.orDie,
                  );
                })
              : Effect.void,
          ),
        );

      const providerStateBinding = {
        slot: "providerState",
        provider: provider.identity.ref,
        providerFence: provider.fence,
        select: ({ state }: ActorContextSnapshot<typeof HandshakeProviderDefinition>) => state,
      } satisfies ActorContextBinding<
        typeof HandshakeConsumerDefinition,
        typeof HandshakeProviderDefinition,
        "providerState"
      >;

      const providerChangedBinding = {
        slot: "providerChanged",
        provider: provider.identity.ref,
        providerFence: provider.fence,
        select: ({ state }: ActorContextSnapshot<typeof HandshakeProviderDefinition>) =>
          state === HandshakeProviderDefinition.S.changed,
      } satisfies ActorContextBinding<
        typeof HandshakeConsumerDefinition,
        typeof HandshakeProviderDefinition,
        "providerChanged"
      >;

      const consumerSnapshots: Array<ActorSnapshot<typeof HandshakeConsumerDefinition>> = [];

      const consumerContextCuts: Array<{
        revision: number;
        providerState: ActorSnapshot<
          typeof HandshakeConsumerDefinition
        >["context"]["providerState"];
        providerChanged: ActorSnapshot<
          typeof HandshakeConsumerDefinition
        >["context"]["providerChanged"];
        exposed: boolean;
      }> = [];

      const consumerFiber = yield* Effect.forkChild(
        Effect.exit(
          Effect.gen(function* () {
            const consumer = yield* assembly.createActor({
              ref: actorRef(HandshakeConsumerMachine, "handshake-consumer"),
              initial: initialHandshakeConsumerSnapshot(),
              bindings: [providerStateBinding, providerChangedBinding],
              onSnapshot: (snapshot) => {
                consumerContextPublished = true;
                consumerSnapshots.push(snapshot);
                admissionTrace.push("consumer-context-published");
                consumerContextCuts.push({
                  revision: snapshot.revision,
                  providerState: snapshot.context.providerState,
                  providerChanged: snapshot.context.providerChanged,
                  exposed: consumerExposed,
                });
              },
            });

            consumerExposed = true;
            admissionTrace.push("consumer-exposed");

            return consumer;
          }),
        ),
        { startImmediately: true },
      );

      const consumerExit = yield* Fiber.join(consumerFiber);

      if (Exit.isFailure(consumerExit))
        return yield* Effect.die(new Error("consumer admission failed"));
      const consumer = consumerExit.value;
      assert.strictEqual(providerDependentRegistrations, 1);
      assert.strictEqual(providerHoldDispatch?.admitted, true);
      assert.strictEqual(providerAdvanceDispatch?.admitted, true);
      yield* Deferred.await(providerHoldDispatch!.completion).pipe(
        Effect.timeout(Duration.seconds(5)),
      );
      yield* Deferred.await(providerAdvanceDispatch!.completion).pipe(
        Effect.timeout(Duration.seconds(5)),
      );
      yield* provider.engine.drain();
      yield* consumer.engine.drain();

      assert.strictEqual(consumerStartEvidenceAccepted, true);
      assert.deepStrictEqual(admissionTrace.slice(0, 6), [
        "dependent-registered",
        "provider-publication-held",
        "consumer-start-evidence-accepted",
        "provider-published",
        "consumer-context-published",
        "consumer-exposed",
      ]);
      assert.strictEqual(providerPublicationCount, 1);
      assert.deepStrictEqual(providerPublicationPhases, [
        {
          dependentRegistrations: 1,
          providerHoldEntered: true,
          consumerStartEvidenceAccepted: true,
          consumerContextPublished: false,
          consumerExposed: false,
        },
      ]);
      assert.strictEqual(provider.engine.snapshot().state, HandshakeProviderDefinition.S.changed);
      assert.strictEqual(
        consumer.engine.snapshot().context.providerState,
        HandshakeProviderDefinition.S.changed,
      );
      assert.strictEqual(consumer.engine.snapshot().context.providerChanged, true);
      assert.strictEqual(consumerSnapshots.length, 1);
      assert.strictEqual(consumerSnapshots[0]?.revision, 1);
      assert.strictEqual(
        consumerSnapshots[0]?.context.providerState,
        HandshakeProviderDefinition.S.changed,
      );
      assert.strictEqual(consumerSnapshots[0]?.context.providerChanged, true);
      assert.deepStrictEqual(consumerContextCuts, [
        {
          revision: 1,
          providerState: HandshakeProviderDefinition.S.changed,
          providerChanged: true,
          exposed: false,
        },
      ]);

      yield* Effect.provideContext(consumer.dispose(), assembly.context);
      yield* Effect.provideContext(consumer.dispose(), assembly.context);
      assert.strictEqual(providerDependentCleanups, 1);
      const secondDispatch = provider.engine.dispatch(HandshakeProviderEvent);
      assert.strictEqual(secondDispatch.admitted, true);
      yield* Deferred.await(secondDispatch.completion);
      yield* provider.engine.drain();
      assert.strictEqual(providerPublicationCount, 2);
      assert.strictEqual(consumerSnapshots.length, 1);
      assert.deepStrictEqual(admissionTrace.slice(-2), ["dependent-cleaned", "provider-published"]);

      yield* Effect.provideContext(provider.dispose(), assembly.context);
      yield* runtimeOwner(runtime).close();
      runtimeEvidence.accept = originalAccept;
    }),
  );

  describe("readiness acquisition and caching", () => {
    it.effect("routes public readiness through the installed provider context", () =>
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const observations: Array<Repository> = [];
        let acquisitions = 0;
        let cleanups = 0;

        const implementation = Implementation.merge(
          Implementation.succeed(RepositoryKey, repository),
          Implementation.effect(
            ConfigKey,
            Effect.acquireRelease(
              Effect.gen(function* () {
                acquisitions += 1;
                yield* Deferred.succeed(entered, undefined);
                yield* Deferred.await(release);
                observations.push(yield* Effect.service(RepositoryKey));

                return { region: "test" };
              }),
              () => Effect.sync(() => cleanups++),
            ),
          ),
        );

        const runtime = runtimeSetup({ app: RequiredApp, implementation }).construct();

        const first = yield* Effect.forkChild(Effect.exit(runtime.ready()), {
          startImmediately: true,
        });

        yield* Deferred.await(entered);

        const second = yield* Effect.forkChild(Effect.exit(runtime.ready()), {
          startImmediately: true,
        });

        assert.strictEqual(acquisitions, 1);
        yield* Deferred.succeed(release, undefined);
        const firstExit = yield* Fiber.join(first);
        const secondExit = yield* Fiber.join(second);
        assert.ok(Exit.isSuccess(firstExit));
        assert.deepStrictEqual(secondExit, firstExit);
        assert.deepStrictEqual(yield* Effect.exit(runtime.ready()), firstExit);
        assert.strictEqual(acquisitions, 1);
        assert.deepStrictEqual(observations, [repository]);

        const firstClose = yield* Effect.exit(runtimeOwner(runtime).close());
        const secondClose = yield* Effect.exit(runtimeOwner(runtime).close());
        assert.ok(Exit.isSuccess(firstClose));
        assert.deepStrictEqual(secondClose, firstClose);
        assert.strictEqual(cleanups, 1);
      }),
    );

    it.effect("keeps construction inert until readiness", () =>
      Effect.gen(function* () {
        const evidence: Array<string> = [];

        const probes = {
          providerAcquisitions: 0,
          externalWork: 0,
          actorCreations: 0,
          evidence,
        };

        const implementation = Implementation.effect(
          RepositoryKey,
          Effect.sync(() => {
            probes.providerAcquisitions += 1;
            probes.externalWork += 1;
            probes.actorCreations += 1;
            probes.evidence.push("provider-acquired");

            return repository;
          }),
        );

        const setup = runtimeSetup({ app: EmptyApp, implementation });
        assert.deepStrictEqual(probes, {
          providerAcquisitions: 0,
          externalWork: 0,
          actorCreations: 0,
          evidence: [],
        });

        const runtime = setup.construct();
        assert.deepStrictEqual(probes, {
          providerAcquisitions: 0,
          externalWork: 0,
          actorCreations: 0,
          evidence: [],
        });

        yield* runtime.ready();
        assert.deepStrictEqual(probes, {
          providerAcquisitions: 1,
          externalWork: 1,
          actorCreations: 1,
          evidence: ["provider-acquired"],
        });
      }),
    );

    it.effect("acquires providers lazily in declaration order", () =>
      Effect.gen(function* () {
        const order: Array<string> = [];

        const implementation = Implementation.merge(
          Implementation.effect(
            RepositoryKey,
            Effect.sync(() => {
              order.push("repository");

              return repository;
            }),
          ),
          Implementation.effect(
            ConfigKey,
            Effect.sync(() => {
              order.push("config");

              return { region: "test" };
            }),
          ),
        );

        const setup = runtimeSetup({ app: EmptyApp, implementation });
        assert.deepStrictEqual(order, []);
        const runtime = setup.construct();
        assert.deepStrictEqual(order, []);

        yield* runtime.ready();
        assert.deepStrictEqual(order, ["repository", "config"]);
        yield* runtime.ready();
        assert.deepStrictEqual(order, ["repository", "config"]);
      }),
    );

    it.effect("allocates one readiness cache for each constructed Runtime", () =>
      Effect.gen(function* () {
        let acquisitions = 0;

        const implementation = Implementation.effect(
          RepositoryKey,
          Effect.sync(() => {
            acquisitions += 1;

            return repository;
          }),
        );

        const setup = runtimeSetup({ app: EmptyApp, implementation });
        const first = setup.construct();
        const second = setup.construct();

        assert.strictEqual(acquisitions, 0);
        yield* first.ready();
        assert.strictEqual(acquisitions, 1);
        yield* second.ready();
        assert.strictEqual(acquisitions, 2);
        yield* first.ready();
        yield* second.ready();
        assert.strictEqual(acquisitions, 2);
      }),
    );

    it.effect("stops after the first provider failure and caches its Cause", () =>
      Effect.gen(function* () {
        const failure = { readonly: "runtime-test/failure" } as const;
        const order: Array<string> = [];

        const implementation = Implementation.merge(
          Implementation.effect(
            RepositoryKey,
            Effect.sync(() => {
              order.push("failure");

              return repository;
            }).pipe(Effect.andThen(Effect.fail(failure))),
          ),
          Implementation.effect(
            ConfigKey,
            Effect.sync(() => {
              order.push("skipped");

              return { region: "test" };
            }),
          ),
        );

        const ready = runtimeSetup({ app: EmptyApp, implementation }).construct().ready();

        const first = yield* Effect.exit(ready);
        const second = yield* Effect.exit(ready);
        assert.deepStrictEqual(first, second);
        assert.ok(Exit.isFailure(first));

        if (Exit.isFailure(first)) {
          const typedFailure = first.cause.reasons.find(Cause.isFailReason);
          assert.strictEqual(typedFailure?.error, failure);
          assert.strictEqual(Cause.hasDies(first.cause), false);
        }

        assert.deepStrictEqual(order, ["failure"]);
      }),
    );

    it.effect("shares one in-flight readiness and its cached success", () =>
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        let acquisitions = 0;

        const implementation = Implementation.effect(
          RepositoryKey,
          Effect.gen(function* () {
            acquisitions += 1;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);

            return repository;
          }),
        );

        const runtime = runtimeSetup({ app: EmptyApp, implementation }).construct();

        const first = yield* Effect.forkChild(Effect.exit(runtime.ready()), {
          startImmediately: true,
        });

        yield* Deferred.await(entered);

        const second = yield* Effect.forkChild(Effect.exit(runtime.ready()), {
          startImmediately: true,
        });

        assert.strictEqual(acquisitions, 1);
        yield* Deferred.succeed(release, undefined);

        const firstExit = yield* Fiber.join(first);
        const secondExit = yield* Fiber.join(second);
        assert.ok(Exit.isSuccess(firstExit));
        assert.deepStrictEqual(firstExit, secondExit);
        assert.deepStrictEqual(yield* Effect.exit(runtime.ready()), firstExit);
        assert.strictEqual(acquisitions, 1);
      }),
    );

    it.effect("interrupts an acquiring caller and caches interruption", () =>
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        let acquisitions = 0;

        const implementation = Implementation.effect(
          RepositoryKey,
          Effect.gen(function* () {
            acquisitions += 1;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);

            return repository;
          }),
        );

        const runtime = runtimeSetup({ app: EmptyApp, implementation }).construct();
        const acquiring = yield* Effect.forkChild(runtime.ready(), { startImmediately: true });
        yield* Deferred.await(entered);

        yield* Fiber.interrupt(acquiring);
        const acquiringExit = yield* Fiber.await(acquiring);
        assert.ok(Exit.isFailure(acquiringExit));
        assert.ok(Exit.hasInterrupts(acquiringExit));
        const cachedExit = yield* Effect.exit(runtime.ready());
        assert.ok(Exit.isFailure(cachedExit));
        assert.ok(Exit.hasInterrupts(cachedExit));
        assert.strictEqual(acquisitions, 1);
      }),
    );

    it.effect("interrupts a readiness waiter without cancelling the acquisition", () =>
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const waiterEntered = yield* Deferred.make<void>();
        let acquisitions = 0;

        const implementation = Implementation.effect(
          RepositoryKey,
          Effect.gen(function* () {
            acquisitions += 1;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);

            return repository;
          }),
        );

        const runtime = runtimeSetup({ app: EmptyApp, implementation }).construct();

        const first = yield* Effect.forkChild(Effect.exit(runtime.ready()), {
          startImmediately: true,
        });

        yield* Deferred.await(entered);

        const waiter = yield* Effect.forkChild(
          Effect.gen(function* () {
            yield* Deferred.succeed(waiterEntered, undefined);

            return yield* Effect.exit(runtime.ready());
          }),
          { startImmediately: true },
        );

        yield* Deferred.await(waiterEntered);
        yield* Effect.yieldNow;

        yield* Fiber.interrupt(waiter);
        const waiterExit = yield* Fiber.await(waiter);
        assert.ok(Exit.isFailure(waiterExit));
        assert.ok(Exit.hasInterrupts(waiterExit));
        assert.strictEqual(acquisitions, 1);

        yield* Deferred.succeed(release, undefined);
        const firstExit = yield* Fiber.join(first);
        assert.ok(Exit.isSuccess(firstExit));
        assert.deepStrictEqual(yield* Effect.exit(runtime.ready()), firstExit);
        assert.strictEqual(acquisitions, 1);
      }),
    );
  });

  describe("setup boundary admission", () => {
    it("rejects a copied App before publishing RuntimeSetup", () => {
      const forgedApp = { ...EmptyApp };

      assert.throws(
        () => runtimeSetup({ app: forgedApp }),
        /^runtimeSetup app must be constructed by app\(\)$/u,
      );
    });

    it("rejects an App-shaped proxy without structural reads", () => {
      let reads = 0;

      const forgedApp = new Proxy(
        { ...EmptyApp },
        {
          get: () => {
            reads += 1;
            throw new Error("App field was read");
          },
        },
      );

      assert.throws(
        () => runtimeSetup({ app: forgedApp }),
        /^runtimeSetup app must be constructed by app\(\)$/u,
      );
      assert.strictEqual(reads, 0);
    });

    it("captures the App before validating a flapping getter", () => {
      const alternateApp = app({
        id: "runtime-test/alternate",
        persistenceVersion: "1",
        modules: [],
      });

      let reads = 0;

      const options = {
        get app() {
          reads += 1;

          return reads === 1 ? EmptyApp : alternateApp;
        },
      };

      const setup = runtimeSetup(options);

      assert.strictEqual(setup.app, EmptyApp);
      assert.strictEqual(reads, 1);
    });
  });

  describe("terminal cause caching", () => {
    it.effect("caches a defect cause as one terminal result", () =>
      Effect.gen(function* () {
        const defect = new Error("runtime-test/defect");
        let calls = 0;

        const implementation = Implementation.effect(
          RepositoryKey,
          Effect.sync(() => {
            calls += 1;

            return repository;
          }).pipe(
            // oxlint-disable-next-line anti-slop/no-expected-failure-as-defect -- This proof deliberately injects an Error defect and asserts the terminal Exit retains the defect lane.
            Effect.andThen(Effect.die(defect)),
          ),
        );

        const ready = runtimeSetup({ app: EmptyApp, implementation }).construct().ready();

        const first = yield* Effect.exit(ready);
        const second = yield* Effect.exit(ready);
        assert.deepStrictEqual(first, second);
        assert.strictEqual(Exit.hasDies(first), true);

        if (!Exit.isFailure(first)) {
          return yield* Effect.die(new Error("Expected a terminal defect"));
        }

        const reason = first.cause.reasons[0];

        if (reason === undefined || !Cause.isDieReason(reason)) {
          return yield* Effect.die(new Error("Expected a defect cause"));
        }

        assert.strictEqual(reason.defect, defect);
        assert.strictEqual(calls, 1);
      }),
    );

    it.effect("caches interruption as one terminal result without retrying", () =>
      Effect.gen(function* () {
        let calls = 0;

        const implementation = Implementation.effect(
          RepositoryKey,
          Effect.sync(() => {
            calls += 1;

            return repository;
          }).pipe(Effect.andThen(Effect.interrupt)),
        );

        const ready = runtimeSetup({ app: EmptyApp, implementation }).construct().ready();

        const first = yield* Effect.exit(ready);
        const second = yield* Effect.exit(ready);
        assert.deepStrictEqual(first, second);
        assert.ok(Exit.hasInterrupts(first));
        assert.strictEqual(calls, 1);
      }),
    );
  });
});
