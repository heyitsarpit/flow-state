import { assert, describe, it } from "@effect/vitest";
import { Cause, Context, Deferred, Effect, Exit, Fiber, Result } from "effect";

import { app, module } from "../../app/app.js";
import { definition } from "../../definition/definition.js";
import { Implementation } from "../../implementation/implementation.js";
import { machine } from "../../machine/machine.js";
import { resource } from "../../operation/resource.js";
import { actorRef } from "../actor-ref.js";
import type { ActorContextBinding, ActorContextSnapshot } from "../actor-admission.js";
import { prepareActorSnapshot, type PreparedActorSnapshot } from "../actor-engine.js";
import { runtimeOwner, runtimeSetup } from "../runtime.js";
import { RuntimeClock, RuntimeEvidence, RuntimeScheduler } from "../runtime-services.js";

const resultSuccess = <Value, Error>(result: Result.Result<Value, Error>) => {
  if (Result.isFailure(result)) throw result.failure;
  return result.success;
};

const architectureDefinitionResult = definition({
  id: "runtime-architecture/actor",
  states: ["ready", "done"],
  events: { opened: "bare" },
});
const architectureDefinition = resultSuccess(architectureDefinitionResult);
const architectureMachine = resultSuccess(
  machine(architectureDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: { on: { opened: { target: S.done } } }, done: {} },
  })),
);
const architectureApp = app({
  id: "runtime-architecture/app",
  persistenceVersion: "1",
  modules: [
    module({ id: "runtime-architecture/module", machines: { actor: architectureMachine } }),
  ],
});
const architectureEvent = resultSuccess(architectureDefinition.E.opened());

const initialArchitectureSnapshot = (): PreparedActorSnapshot<typeof architectureDefinition> =>
  resultSuccess(
    prepareActorSnapshot(architectureMachine, {
      state: architectureDefinition.S.ready,
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

class ArchitectureService extends Context.Service<ArchitectureService, { readonly name: string }>()(
  "RuntimeArchitecture/Service",
) {}
class ArchitectureDependentService extends Context.Service<
  ArchitectureDependentService,
  { readonly predecessor: string }
>()("RuntimeArchitecture/DependentService") {}

const requiredResource = resource({
  id: "runtime-architecture/required-resource",
  key: (value: string) => [value] as const,
  lookup: (value: string) =>
    Effect.service(ArchitectureService).pipe(Effect.map((service) => `${service.name}:${value}`)),
});
const requiredDefinitionResult = definition({
  id: "runtime-architecture/required",
  states: ["ready"],
  events: {},
  operations: { required: requiredResource },
});
const requiredDefinition = resultSuccess(requiredDefinitionResult);
const requiredMachine = resultSuccess(
  machine(requiredDefinitionResult, ({ S }) => ({ default: S.ready, states: { ready: {} } })),
);
const requiredApp = app({
  id: "runtime-architecture/required-app",
  persistenceVersion: "1",
  modules: [
    module({ id: "runtime-architecture/required-module", machines: { required: requiredMachine } }),
  ],
});
const providerDefinitionResult = definition({
  id: "runtime-architecture/provider",
  states: ["ready", "changed"],
  events: {},
});
const providerDefinition = resultSuccess(providerDefinitionResult);
const providerMachine = resultSuccess(
  machine(providerDefinitionResult, ({ S }) => ({
    default: S.ready,
    states: { ready: {}, changed: {} },
  })),
);
const consumerDefinitionResult = definition({
  id: "runtime-architecture/consumer",
  states: ["ready"],
  events: {},
  context: { selected: providerDefinition.select(({ state }) => state) },
});
const consumerDefinition = resultSuccess(consumerDefinitionResult);
const consumerMachine = resultSuccess(
  machine(consumerDefinitionResult, ({ S }) => ({ default: S.ready, states: { ready: {} } })),
);
const contextApp = app({
  id: "runtime-architecture/context-app",
  persistenceVersion: "1",
  modules: [
    module({
      id: "runtime-architecture/context-module",
      machines: { provider: providerMachine, consumer: consumerMachine },
    }),
  ],
});
const initialProviderSnapshot = (
  state:
    | typeof providerDefinition.S.ready
    | typeof providerDefinition.S.changed = providerDefinition.S.ready,
): PreparedActorSnapshot<typeof providerDefinition> =>
  resultSuccess(
    prepareActorSnapshot(providerMachine, {
      state,
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
const initialConsumerSnapshot = (): PreparedActorSnapshot<typeof consumerDefinition> =>
  resultSuccess(
    prepareActorSnapshot(consumerMachine, {
      state: consumerDefinition.S.ready,
      memory: {},
      context: { selected: providerDefinition.S.ready },
      lifecycle: "prepared",
      operations: [],
      timers: [],
      issues: [],
      revision: 0,
      observedStoreRevision: 0,
    }),
  );

const initialRequiredSnapshot = (): PreparedActorSnapshot<typeof requiredDefinition> =>
  resultSuccess(
    prepareActorSnapshot(requiredMachine, {
      state: requiredDefinition.S.ready,
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

// Contracts: ARCH-007A, ARCH-012, SEM-001A, SEM-002A, SEM-029.
// Proofs: HOST-P01, HOST-P05, PROOF-003, PROOF-004.
describe("runtime assembly", () => {
  it.effect("assembles a real app and actor reference without starting runtime work", () =>
    Effect.gen(function* () {
      const setup = runtimeSetup({ app: architectureApp });
      const runtime = setup.construct();
      assert.strictEqual(setup.app, architectureApp);
      assert.throws(() => runtimeOwner(runtime).assembly());
      yield* runtime.ready();
      assert.strictEqual(runtimeOwner(runtime).assembly().createActor !== undefined, true);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("keeps separate constructed shells isolated while preserving app identity", () =>
    Effect.gen(function* () {
      const setup = runtimeSetup({ app: architectureApp });
      const first = setup.construct();
      const second = setup.construct();
      assert.strictEqual(first.app, second.app);
      assert.notStrictEqual(runtimeOwner(first), runtimeOwner(second));
      yield* first.ready();
      yield* second.ready();
      assert.notStrictEqual(runtimeOwner(first).assembly(), runtimeOwner(second).assembly());
      yield* runtimeOwner(first).close();
      yield* runtimeOwner(second).close();
    }),
  );

  it.effect("closes implementation requirements at the real runtime setup boundary", () =>
    Effect.gen(function* () {
      const implementation = Implementation.succeed(ArchitectureService, { name: "provided" });
      const setup = runtimeSetup({ app: requiredApp, implementation });
      const runtime = setup.construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const actor = yield* assembly.createActor({
        ref: actorRef(requiredMachine, "required"),
        initial: initialRequiredSnapshot(),
      });
      // SAFETY: runtime assembly preserves the exact Implementation service in its owner Context.
      const resolved = Context.getUnsafe(assembly.context, ArchitectureService);
      assert.deepStrictEqual(resolved, { name: "provided" });
      assert.strictEqual(actor.engine.snapshot().lifecycle, "active");
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("assembles predecessor-visible providers in declaration order", () =>
    Effect.gen(function* () {
      const acquired: string[] = [];
      const predecessor = Implementation.effect(
        ArchitectureService,
        Effect.sync(() => {
          acquired.push("predecessor");
          return { name: "predecessor" };
        }),
      );
      const dependent = Implementation.effect(
        ArchitectureDependentService,
        Effect.service(ArchitectureService).pipe(
          Effect.map((service) => {
            acquired.push("dependent");
            return { predecessor: service.name };
          }),
        ),
      );
      const runtime = runtimeSetup({
        app: architectureApp,
        implementation: Implementation.merge(predecessor, dependent),
      }).construct();
      yield* runtime.ready();
      assert.deepStrictEqual(acquired, ["predecessor", "dependent"]);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("installs a provider-selected context value before the first active snapshot", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: contextApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const provider = yield* assembly.createActor({
        ref: actorRef(providerMachine, "provider"),
        initial: initialProviderSnapshot(providerDefinition.S.changed),
      });
      const binding = {
        slot: "selected",
        provider: provider.identity.ref,
        providerFence: provider.fence,
        select: ({ state }: ActorContextSnapshot<typeof providerDefinition>) => state,
      } satisfies ActorContextBinding<
        typeof consumerDefinition,
        typeof providerDefinition,
        "selected"
      >;
      const consumer = yield* assembly.createActor({
        ref: actorRef(consumerMachine, "consumer"),
        initial: initialConsumerSnapshot(),
        bindings: [binding],
      });
      assert.strictEqual(consumer.engine.snapshot().context.selected, providerDefinition.S.changed);
      assert.strictEqual(consumer.engine.snapshot().lifecycle, "active");
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("keeps replaceable runtime capabilities inside one owner scope", () =>
    Effect.gen(function* () {
      const first = runtimeSetup({ app: architectureApp }).construct();
      const second = runtimeSetup({ app: architectureApp }).construct();
      yield* first.ready();
      yield* second.ready();
      const firstAssembly = runtimeOwner(first).assembly();
      const secondAssembly = runtimeOwner(second).assembly();
      assert.notStrictEqual(firstAssembly.context, secondAssembly.context);
      assert.notStrictEqual(
        Context.get(firstAssembly.context, RuntimeClock),
        Context.get(secondAssembly.context, RuntimeClock),
      );
      assert.notStrictEqual(firstAssembly.evidence, secondAssembly.evidence);
      yield* runtimeOwner(first).close();
      yield* runtimeOwner(second).close();
    }),
  );

  it.effect("uses one production assembly path for request and Story hosts", () =>
    Effect.gen(function* () {
      const live = runtimeSetup({ app: architectureApp }).construct();
      const story = runtimeSetup({ app: architectureApp }).construct();
      yield* live.ready();
      yield* story.ready();
      const liveActor = yield* runtimeOwner(live)
        .assembly()
        .createActor({
          ref: actorRef(architectureMachine, "live"),
          initial: initialArchitectureSnapshot(),
        });
      const storyActor = yield* runtimeOwner(story)
        .assembly()
        .createActor({
          ref: actorRef(architectureMachine, "story"),
          initial: initialArchitectureSnapshot(),
        });
      liveActor.handle.send(architectureEvent);
      storyActor.handle.send(architectureEvent);
      yield* liveActor.engine.drain();
      yield* storyActor.engine.drain();
      assert.strictEqual(liveActor.engine.snapshot().state, architectureDefinition.S.done);
      assert.strictEqual(storyActor.engine.snapshot().state, architectureDefinition.S.done);
      yield* runtimeOwner(live).close();
      yield* runtimeOwner(story).close();
    }),
  );

  it.effect("rolls back an assembled runtime before any handle or evidence can escape", () =>
    Effect.gen(function* () {
      const failed = Implementation.effect(
        ArchitectureService,
        Effect.fail("bootstrap-failed" as const),
      );
      const runtime = runtimeSetup({ app: architectureApp, implementation: failed }).construct();
      const ready = yield* Effect.exit(runtime.ready());
      assert.ok(Exit.isFailure(ready));
      assert.throws(() => runtimeOwner(runtime).assembly());
      const closed = yield* Effect.exit(runtimeOwner(runtime).close());
      assert.ok(Exit.isSuccess(closed) || Exit.isFailure(closed));
    }),
  );

  it.effect("retains a provider defect and reverse cleanup through assembled readiness", () =>
    Effect.gen(function* () {
      let released = 0;
      const runtime = runtimeSetup({
        app: architectureApp,
        implementation: Implementation.effect(
          ArchitectureService,
          Effect.acquireRelease(
            Effect.sync(() => ({ name: "defective" })),
            () =>
              Effect.sync(() => {
                released += 1;
              }),
          ).pipe(Effect.andThen(Effect.die(new Error("provider defect")))),
        ),
      }).construct();
      const ready = yield* Effect.exit(runtime.ready());
      assert.ok(Exit.isFailure(ready));
      if (Exit.isFailure(ready)) assert.strictEqual(Cause.hasDies(ready.cause), true);
      assert.strictEqual(released, 1);
      yield* Effect.exit(runtimeOwner(runtime).close());
    }),
  );

  it.effect("caches interrupted assembly without retrying provider acquisition", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let acquisitions = 0;
      const runtime = runtimeSetup({
        app: architectureApp,
        implementation: Implementation.effect(
          ArchitectureService,
          Effect.gen(function* () {
            acquisitions += 1;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);
            return { name: "held" };
          }),
        ),
      }).construct();
      const first = yield* Effect.forkChild(runtime.ready(), { startImmediately: true });
      yield* Deferred.await(entered);
      yield* Fiber.interrupt(first);
      const second = yield* Effect.exit(runtime.ready());
      assert.ok(Exit.isFailure(second));
      assert.strictEqual(acquisitions, 1);
      yield* Deferred.succeed(release, undefined);
      yield* Effect.exit(runtimeOwner(runtime).close());
    }),
  );

  it.effect("keeps individual disposal authority on the returned owner lease", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: architectureApp }).construct();
      yield* runtime.ready();
      const actor = yield* runtimeOwner(runtime)
        .assembly()
        .createActor({
          ref: actorRef(architectureMachine, "authority"),
          initial: initialArchitectureSnapshot(),
        });
      assert.deepStrictEqual(Object.keys(actor.handle).sort(), ["ref", "send"]);
      assert.strictEqual("dispose" in actor.handle, false);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("drains accepted assembly evidence before closing the runtime", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: architectureApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const actor = yield* assembly.createActor({
        ref: actorRef(architectureMachine, "evidence"),
        initial: initialArchitectureSnapshot(),
      });
      yield* Deferred.await(actor.engine.dispatch(architectureEvent).completion);
      yield* actor.engine.drain();
      assert.strictEqual(assembly.evidence.hub.sequence(), 2);
      yield* runtimeOwner(runtime).close();
      assert.strictEqual(assembly.evidence.hub.sequence(), 3);
    }),
  );

  it.effect("linearizes concurrent host readiness through one assembled owner", () =>
    Effect.gen(function* () {
      let acquisitions = 0;
      const runtime = runtimeSetup({
        app: architectureApp,
        implementation: Implementation.effect(
          ArchitectureService,
          Effect.sync(() => {
            acquisitions += 1;
            return { name: "shared" };
          }),
        ),
      }).construct();
      const first = yield* Effect.forkChild(runtime.ready(), { startImmediately: true });
      const second = yield* Effect.forkChild(runtime.ready(), { startImmediately: true });
      assert.strictEqual(yield* Fiber.join(first), undefined);
      assert.strictEqual(yield* Fiber.join(second), undefined);
      assert.strictEqual(acquisitions, 1);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("keeps prepared host handles inert until assembled readiness", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const runtime = runtimeSetup({
        app: architectureApp,
        implementation: Implementation.effect(
          ArchitectureService,
          Effect.gen(function* () {
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);
            return { name: "pending" };
          }),
        ),
      }).construct();
      const readiness = yield* Effect.forkChild(runtime.ready(), { startImmediately: true });
      yield* Deferred.await(entered);
      assert.throws(() => runtimeOwner(runtime).assembly(), /Runtime is not ready/u);
      yield* Deferred.succeed(release, undefined);
      assert.strictEqual(yield* Fiber.join(readiness), undefined);
      const actor = yield* runtimeOwner(runtime)
        .assembly()
        .createActor({
          ref: actorRef(architectureMachine, "prepared"),
          initial: initialArchitectureSnapshot(),
        });
      assert.strictEqual(actor.engine.snapshot().revision, 0);
      const beforeClose = actor.engine.snapshot();
      yield* runtimeOwner(runtime).close();
      const rejected = actor.engine.dispatch(architectureEvent);
      assert.strictEqual(rejected.admitted, false);
      const completion = yield* Effect.exit(Deferred.await(rejected.completion));
      assert.ok(Exit.isFailure(completion));
      if (Exit.isFailure(completion)) {
        const reason = completion.cause.reasons.find(Cause.isFailReason);
        assert.ok(reason !== undefined);
        if (reason !== undefined) {
          assert.strictEqual(reason.error.code, "InvariantViolation");
          assert.deepStrictEqual(reason.error.path, ["mailbox", "closed"]);
        }
      }
      const afterClose = actor.engine.snapshot();
      assert.strictEqual(afterClose.lifecycle, "disposed");
      assert.strictEqual(afterClose.state, beforeClose.state);
      assert.strictEqual(afterClose.revision, beforeClose.revision);
      assert.throws(() => actor.handle.send(architectureEvent));
    }),
  );

  it.effect("preserves live and Story parity across real construction paths", () =>
    Effect.gen(function* () {
      const runtimes = [
        runtimeSetup({ app: architectureApp }).construct(),
        runtimeSetup({ app: architectureApp }).construct(),
      ];
      yield* runtimes[0]!.ready();
      yield* runtimes[1]!.ready();
      const first = yield* runtimeOwner(runtimes[0]!)
        .assembly()
        .createActor({
          ref: actorRef(architectureMachine, "parity-live"),
          initial: initialArchitectureSnapshot(),
        });
      const second = yield* runtimeOwner(runtimes[1]!)
        .assembly()
        .createActor({
          ref: actorRef(architectureMachine, "parity-story"),
          initial: initialArchitectureSnapshot(),
        });
      first.handle.send(architectureEvent);
      second.handle.send(architectureEvent);
      yield* first.engine.drain();
      yield* second.engine.drain();
      assert.strictEqual(first.engine.snapshot().state, second.engine.snapshot().state);
      assert.notStrictEqual(first.engine, second.engine);
      yield* runtimeOwner(runtimes[0]!).close();
      yield* runtimeOwner(runtimes[1]!).close();
    }),
  );

  it.effect("keeps an empty constructed app inert through close", () =>
    Effect.gen(function* () {
      const empty = app({ id: "runtime-architecture/empty", persistenceVersion: "1", modules: [] });
      const runtime = runtimeSetup({ app: empty }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      yield* runtimeOwner(runtime).close();
      yield* runtimeOwner(runtime).close();
      const attempt = yield* Effect.exit(
        assembly.createActor({
          ref: actorRef(architectureMachine, "post-close"),
          initial: initialArchitectureSnapshot(),
        }),
      );
      assert.ok(Exit.isFailure(attempt));
      assert.strictEqual(assembly.evidence.hub.sequence(), 0);
    }),
  );

  it.effect("rejects a foreign machine during real owner assembly", () =>
    Effect.gen(function* () {
      const foreignDefinitionResult = definition({
        id: "runtime-architecture/foreign",
        states: ["ready"],
        events: {},
      });
      const foreignDefinition = resultSuccess(foreignDefinitionResult);
      const foreignMachine = resultSuccess(
        machine(foreignDefinitionResult, ({ S }) => ({ default: S.ready, states: { ready: {} } })),
      );
      const foreignInitial = resultSuccess(
        prepareActorSnapshot(foreignMachine, {
          state: foreignDefinition.S.ready,
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
      const runtime = runtimeSetup({ app: architectureApp }).construct();
      yield* runtime.ready();
      const failed = yield* Effect.exit(
        runtimeOwner(runtime)
          .assembly()
          .createActor({ ref: actorRef(foreignMachine, "foreign"), initial: foreignInitial }),
      );
      assert.ok(Exit.isFailure(failed));
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("completes one real constructor-to-close runtime path", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: architectureApp }).construct();
      yield* runtime.ready();
      const actor = yield* runtimeOwner(runtime)
        .assembly()
        .createActor({
          ref: actorRef(architectureMachine, "round-trip"),
          initial: initialArchitectureSnapshot(),
        });
      const receipt = yield* Deferred.await(actor.engine.dispatch(architectureEvent).completion);
      assert.deepStrictEqual(receipt, { publicationRevision: 1, evidenceSequence: 2 });
      assert.strictEqual(actor.engine.snapshot().state, architectureDefinition.S.done);
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("reconciles provider baselines before exposure", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: contextApp }).construct();
      yield* runtime.ready();
      const assembly = runtimeOwner(runtime).assembly();
      const provider = yield* assembly.createActor({
        ref: actorRef(providerMachine, "baseline-provider"),
        initial: initialProviderSnapshot(providerDefinition.S.changed),
      });
      const binding = {
        slot: "selected",
        provider: provider.identity.ref,
        providerFence: provider.fence,
        select: ({ state }: ActorContextSnapshot<typeof providerDefinition>) => state,
      } satisfies ActorContextBinding<
        typeof consumerDefinition,
        typeof providerDefinition,
        "selected"
      >;
      const consumer = yield* assembly.createActor({
        ref: actorRef(consumerMachine, "baseline-consumer"),
        initial: initialConsumerSnapshot(),
        bindings: [binding],
      });
      assert.strictEqual(consumer.engine.snapshot().context.selected, providerDefinition.S.changed);
      assert.strictEqual(consumer.engine.snapshot().lifecycle, "active");
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("admits a fresh actor through an explicit initial snapshot seam", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: architectureApp }).construct();
      yield* runtime.ready();
      const actor = yield* runtimeOwner(runtime)
        .assembly()
        .createActor({
          ref: actorRef(architectureMachine, "fresh"),
          initial: initialArchitectureSnapshot(),
        });
      assert.strictEqual(actor.engine.snapshot().state, architectureDefinition.S.ready);
      assert.strictEqual(actor.engine.snapshot().lifecycle, "active");
      yield* runtimeOwner(runtime).close();
    }),
  );

  it.effect("keeps one owner boundary across runtime helper composition", () =>
    Effect.gen(function* () {
      const runtime = runtimeSetup({ app: architectureApp }).construct();
      yield* runtime.ready();
      const owner = runtimeOwner(runtime);
      const assembly = owner.assembly();
      assert.strictEqual(Context.get(assembly.context, RuntimeEvidence), assembly.evidence.service);
      assert.ok(Context.get(assembly.context, RuntimeClock));
      assert.ok(Context.get(assembly.context, RuntimeScheduler));
      const actor = yield* assembly.createActor({
        ref: actorRef(architectureMachine, "one-owner"),
        initial: initialArchitectureSnapshot(),
      });
      assert.strictEqual(actor.lifecycle.state !== undefined, true);
      yield* owner.close();
    }),
  );
});
