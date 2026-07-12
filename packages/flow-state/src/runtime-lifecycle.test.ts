import { Cause, Deferred, Effect, Exit, Layer, ManagedRuntime, Stream } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "./core/api/flow-core.js";
import { createOrchestratorActorLifecycle } from "./core/orchestrator/orchestrator-actor-lifecycle.js";
import { OrchestratorSystem } from "./core/orchestrator/orchestrator-system.js";
import { enqueueReadyWork } from "./core/scheduling/ready-work.js";
import { HostSignals } from "./core/runtime/services/host-signals.js";
import { InspectionLog } from "./core/runtime/services/inspection.js";
import { NotificationScheduler } from "./core/runtime/services/notification-scheduler.js";
import { ResourceStore } from "./core/runtime/services/resource-store.js";
import { FlowRuntimePolicy } from "./core/runtime/services/runtime-policy.js";
import { TraceLog } from "./core/runtime/services/trace.js";
import { createRuntime } from "./runtime/contract-runtime.js";
import {
  Greeter,
  projectResource,
  RuntimeModule,
} from "./testing/fixtures/runtime-test-fixtures.js";

type Expect<Type extends true> = Type;

function expectType<Type>(_value: Type): void {
  void _value;
}

function createDeferredFinalizer() {
  const acquired = Effect.runSync(Deferred.make<void>());
  const started = Effect.runSync(Deferred.make<void>());
  const released = Effect.runSync(Deferred.make<void>());
  return {
    stream: Stream.callback<never, never>(() =>
      Effect.gen(function* () {
        yield* Deferred.succeed(acquired, undefined);
        yield* Effect.addFinalizer(() =>
          Effect.gen(function* () {
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(released);
          }),
        );
      }),
    ),
    acquired: Effect.runPromise(Deferred.await(acquired)),
    started: Effect.runPromise(Deferred.await(started)),
    release: () => {
      Effect.runSync(Deferred.succeed(released, undefined));
    },
  } as const;
}

describe("runtime lifecycle and actor ownership contracts", () => {
  it("joins concurrent actor disposal and awaits owned finalizers before eviction", async () => {
    const machine = flow.machine<{ readonly count: number }, { readonly type: "STEP" }, "idle">({
      id: "runtime.actor.dispose-join",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
      },
    });
    let snapshot: ReturnType<typeof machine.getInitialSnapshot> = machine.getInitialSnapshot();
    let releaseChildFinalizer!: () => void;
    let childFinalized = false;
    let evicted = false;

    const lifecycle = createOrchestratorActorLifecycle<typeof machine>({
      actorId: "runtime.actor.dispose-join",
      machine,
      currentSnapshot: () => snapshot,
      currentIssues: () => [],
      runPromise: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.runPromise(effect as Effect.Effect<A, E, never>),
    });
    const actor = lifecycle.createActor({
      dispatchMachineEvent: () => undefined,
      replaceSnapshot: (next) => {
        snapshot = next;
      },
      appendReceipt: (receipt) => {
        snapshot = Object.freeze({
          ...snapshot,
          receipts: [...snapshot.receipts, receipt],
        });
      },
      buildDisposedSnapshot: () => snapshot,
      activateStateOwnedWork: () => undefined,
      restoreStateOwnedWork: () => undefined,
      initialSnapshotProvided: false,
      ownedChildActors: () => [
        {
          flushEffect: Effect.void,
          disposeEffect: Effect.promise(
            () =>
              new Promise<void>((resolve) => {
                releaseChildFinalizer = () => {
                  childFinalized = true;
                  resolve();
                };
              }),
          ),
        },
      ],
      ownedWorkFinalizers: () => [],
      retryChild: () => false,
      retryTransaction: () => false,
      resetTransaction: () => false,
      onDispose: () => {
        evicted = true;
      },
    });

    const firstDispose = actor.dispose();
    const secondDispose = actor.dispose();
    let firstResolved = false;
    let secondResolved = false;
    void firstDispose.then(() => {
      firstResolved = true;
    });
    void secondDispose.then(() => {
      secondResolved = true;
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(childFinalized).toBe(false);
    expect(evicted).toBe(false);
    expect(firstResolved).toBe(false);
    expect(secondResolved).toBe(false);
    expect(actor.receipts().filter((receipt) => receipt.type === "actor:dispose")).toHaveLength(1);

    releaseChildFinalizer();
    await Promise.all([firstDispose, secondDispose]);

    expect(childFinalized).toBe(true);
    expect(evicted).toBe(true);
    expect(firstResolved).toBe(true);
    expect(secondResolved).toBe(true);
    expect(actor.receipts().filter((receipt) => receipt.type === "actor:dispose")).toHaveLength(1);
  });

  it("awaits stream, timer, and child finalization before actor disposal resolves", async () => {
    const parentFinalizer = createDeferredFinalizer();
    const childFinalizer = createDeferredFinalizer();

    const childMachine = flow.machine<{}, never, "streaming">({
      id: "runtime.actor.dispose-owned-work.child",
      initial: "streaming",
      context: () => ({}),
      states: {
        streaming: {
          invoke: flow.stream({
            id: "runtime.dispose.child.stream",
            subscribe: () => childFinalizer.stream,
          }),
        },
      },
    });

    const parentMachine = flow.machine<{}, never, "running">({
      id: "runtime.actor.dispose-owned-work.parent",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          invoke: [
            flow.stream({
              id: "runtime.dispose.parent.stream",
              subscribe: () => parentFinalizer.stream,
            }),
            flow.child({
              id: "runtime.dispose.child",
              machine: childMachine,
            }),
          ],
          after: flow.after({
            id: "runtime.dispose.timer",
            delay: "30 seconds",
            target: "running",
          }),
        },
      },
    });

    const app = flow.app({
      modules: [
        flow.module("DisposeOwnedWork", {
          machines: {
            parent: parentMachine,
            child: childMachine,
          },
        }),
      ],
    });
    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [TestClock.layer()],
      }),
    );
    const actor = runtime.createActor(parentMachine);

    await Promise.all([parentFinalizer.acquired, childFinalizer.acquired]);

    const dispose = actor.dispose();
    let disposeResolved = false;
    void dispose.then(() => {
      disposeResolved = true;
    });
    await Promise.all([parentFinalizer.started, childFinalizer.started]);
    await Promise.resolve();

    expect(actor.snapshot().streams["runtime.dispose.parent.stream"]).toMatchObject({
      status: "interrupt",
    });
    expect(actor.snapshot().timers["runtime.dispose.timer"]).toMatchObject({
      status: "interrupt",
    });
    expect(actor.snapshot().children["runtime.dispose.child"]).toMatchObject({
      status: "stopped",
    });
    expect(disposeResolved).toBe(false);

    parentFinalizer.release();
    await Promise.resolve();
    expect(disposeResolved).toBe(false);

    childFinalizer.release();
    await dispose;
    expect(disposeResolved).toBe(true);

    const receiptsAfterDispose = actor.receipts().length;
    await runtime.runPromise(TestClock.adjust("30 seconds"));
    await actor.flush();

    expect(actor.snapshot().timers["runtime.dispose.timer"]).toMatchObject({
      status: "interrupt",
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) => receipt.type === "timer:fire" && receipt.id === "runtime.dispose.timer",
        ),
    ).toHaveLength(0);
    expect(actor.receipts()).toHaveLength(receiptsAfterDispose);

    await runtime.dispose();
  });

  it("awaits transaction cleanup before actor disposal resolves", async () => {
    let interrupted = 0;
    let releaseCleanup: (() => void) | undefined;
    let transactionStarted: (() => void) | undefined;
    let cleanupStarted: (() => void) | undefined;
    const transactionStartedPromise = new Promise<void>((resolve) => {
      transactionStarted = resolve;
    });
    const cleanupStartedPromise = new Promise<void>((resolve) => {
      cleanupStarted = resolve;
    });

    const blockingTransaction = flow.transaction<
      { readonly id: string },
      Readonly<{ readonly ok: true }>
    >({
      id: "runtime.transaction.dispose-await",
      params: () => ({ id: "project-1" }),
      commit: () =>
        Effect.callback<Readonly<{ readonly ok: true }>>(() => {
          transactionStarted?.();
          return Effect.promise<void>(
            () =>
              new Promise((resolve) => {
                cleanupStarted?.();
                releaseCleanup = () => {
                  interrupted += 1;
                  resolve();
                };
              }),
          );
        }),
    });

    const transactionMachine = flow.machine<{}, never, "running">({
      id: "runtime.actor.transaction.dispose-await",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          invoke: flow.run(blockingTransaction),
        },
      },
    });

    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            flow.module("RuntimeTransactionDisposeAwait", {
              saveProject: blockingTransaction,
              machines: {
                actor: transactionMachine,
              },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );
    const actor = runtime.createActor(transactionMachine);

    await transactionStartedPromise;

    const firstDispose = actor.dispose();
    const secondDispose = actor.dispose();
    let firstResolved = false;
    let secondResolved = false;
    void firstDispose.then(() => {
      firstResolved = true;
    });
    void secondDispose.then(() => {
      secondResolved = true;
    });

    await cleanupStartedPromise;
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    expect(actor.snapshot().transactions["runtime.transaction.dispose-await"]).toMatchObject({
      status: "interrupt",
    });
    expect(firstResolved).toBe(false);
    expect(secondResolved).toBe(false);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.type === "transaction:interrupt" &&
            receipt.id === "runtime.transaction.dispose-await",
        ),
    ).toHaveLength(1);

    releaseCleanup?.();
    await Promise.all([firstDispose, secondDispose]);

    expect(interrupted).toBe(1);
    expect(actor.receipts().filter((receipt) => receipt.type === "actor:dispose")).toHaveLength(1);

    await runtime.dispose();
  });

  it("runs every owned finalizer and evicts even when one finalizer fails", async () => {
    const machine = flow.machine<{}, never, "idle">({
      id: "runtime.actor.dispose-failure",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });
    let snapshot: ReturnType<typeof machine.getInitialSnapshot> = machine.getInitialSnapshot();
    const finalizerError = new Error("owned finalizer failed");
    let successfulFinalizerRan = false;
    let evicted = false;

    const lifecycle = createOrchestratorActorLifecycle<typeof machine>({
      actorId: "runtime.actor.dispose-failure",
      machine,
      currentSnapshot: () => snapshot,
      currentIssues: () => [],
      runPromise: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.runPromise(effect as Effect.Effect<A, E, never>),
    });
    const actor = lifecycle.createActor({
      dispatchMachineEvent: () => undefined,
      replaceSnapshot: (next) => {
        snapshot = next;
      },
      appendReceipt: (receipt) => {
        snapshot = Object.freeze({
          ...snapshot,
          receipts: [...snapshot.receipts, receipt],
        });
      },
      buildDisposedSnapshot: () => snapshot,
      activateStateOwnedWork: () => undefined,
      restoreStateOwnedWork: () => undefined,
      initialSnapshotProvided: false,
      ownedChildActors: () => [
        {
          flushEffect: Effect.void,
          disposeEffect: Effect.die(finalizerError),
        },
        {
          flushEffect: Effect.void,
          disposeEffect: Effect.sync(() => {
            successfulFinalizerRan = true;
          }),
        },
      ],
      ownedWorkFinalizers: () => [],
      retryChild: () => false,
      retryTransaction: () => false,
      resetTransaction: () => false,
      onDispose: () => {
        evicted = true;
      },
    });

    const disposeExit = await Effect.runPromiseExit(Effect.promise(() => actor.dispose()));

    expect(Exit.isFailure(disposeExit)).toBe(true);
    if (Exit.isFailure(disposeExit)) {
      expect(Cause.squash(disposeExit.cause)).toBe(finalizerError);
    }
    expect(successfulFinalizerRan).toBe(true);
    expect(evicted).toBe(true);
    expect(actor.receipts().filter((receipt) => receipt.type === "actor:dispose")).toHaveLength(1);
  });

  it("joins repeated failing actor disposal without rerunning owned finalizers", async () => {
    const machine = flow.machine<{}, never, "idle">({
      id: "runtime.actor.dispose-failure-repeat",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });
    let snapshot: ReturnType<typeof machine.getInitialSnapshot> = machine.getInitialSnapshot();
    const finalizerError = new Error("owned finalizer failed once");
    let successfulFinalizerRuns = 0;
    let evictions = 0;

    const lifecycle = createOrchestratorActorLifecycle<typeof machine>({
      actorId: "runtime.actor.dispose-failure-repeat",
      machine,
      currentSnapshot: () => snapshot,
      currentIssues: () => [],
      runPromise: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.runPromise(effect as Effect.Effect<A, E, never>),
    });
    const actor = lifecycle.createActor({
      dispatchMachineEvent: () => undefined,
      replaceSnapshot: (next) => {
        snapshot = next;
      },
      appendReceipt: (receipt) => {
        snapshot = Object.freeze({
          ...snapshot,
          receipts: [...snapshot.receipts, receipt],
        });
      },
      buildDisposedSnapshot: () => snapshot,
      activateStateOwnedWork: () => undefined,
      restoreStateOwnedWork: () => undefined,
      initialSnapshotProvided: false,
      ownedChildActors: () => [
        {
          flushEffect: Effect.void,
          disposeEffect: Effect.die(finalizerError),
        },
        {
          flushEffect: Effect.void,
          disposeEffect: Effect.sync(() => {
            successfulFinalizerRuns += 1;
          }),
        },
      ],
      ownedWorkFinalizers: () => [],
      retryChild: () => false,
      retryTransaction: () => false,
      resetTransaction: () => false,
      onDispose: () => {
        evictions += 1;
      },
    });

    const [firstDisposeExit, secondDisposeExit] = await Promise.all([
      Effect.runPromiseExit(Effect.promise(() => actor.dispose())),
      Effect.runPromiseExit(Effect.promise(() => actor.dispose())),
    ]);

    expect(Exit.isFailure(firstDisposeExit)).toBe(true);
    expect(Exit.isFailure(secondDisposeExit)).toBe(true);
    if (Exit.isFailure(firstDisposeExit) && Exit.isFailure(secondDisposeExit)) {
      expect(Cause.squash(firstDisposeExit.cause)).toBe(finalizerError);
      expect(Cause.squash(secondDisposeExit.cause)).toBe(finalizerError);
    }
    expect(successfulFinalizerRuns).toBe(1);
    expect(evictions).toBe(1);
    expect(actor.receipts().filter((receipt) => receipt.type === "actor:dispose")).toHaveLength(1);
  });

  it("rejects new actor starts once runtime shutdown is in progress", async () => {
    const shutdownFinalizer = createDeferredFinalizer();

    const blockingMachine = flow.machine<{}, never, "running">({
      id: "runtime.dispose.blocking-actor",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          invoke: flow.stream({
            id: "runtime.dispose.blocking-actor.stream",
            subscribe: () => shutdownFinalizer.stream,
          }),
        },
      },
    });
    const anotherMachine = flow.machine<{}, never, "idle">({
      id: "runtime.dispose.rejected-actor",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });

    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            RuntimeModule,
            flow.module("RuntimeDisposeClosing", {
              machines: {
                blocking: blockingMachine,
                another: anotherMachine,
              },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );

    const blockingActor = runtime.createActor(blockingMachine, {
      id: "runtime-dispose-blocking-actor",
    });
    await shutdownFinalizer.acquired;

    const dispose = runtime.dispose();
    let disposeResolved = false;
    void dispose.then(() => {
      disposeResolved = true;
    });
    await shutdownFinalizer.started;
    await Promise.resolve();

    expect(disposeResolved).toBe(false);

    let startError: unknown;
    try {
      runtime.createActor(anotherMachine, {
        id: "runtime-dispose-rejected-actor",
      });
    } catch (error) {
      startError = error;
    }

    expect(startError).toMatchObject({
      code: "FLOW-ORCH-002",
      debug: {
        reason: "runtime-closing",
        machineId: "runtime.dispose.rejected-actor",
      },
    });

    shutdownFinalizer.release();
    await dispose;
    expect(
      blockingActor.receipts().filter((receipt) => receipt.type === "actor:dispose"),
    ).toHaveLength(1);
  });

  it("closes managed layer scope even when owner shutdown fails", async () => {
    const shutdownError = new Error("runtime shutdown failed before layer scope close");
    let scopeFinalized = false;

    const notificationScheduler = NotificationScheduler.testLayer;
    const hostSignals = HostSignals.testLayer;
    const runtimePolicy = FlowRuntimePolicy.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
    }).pipe(Layer.provide(Layer.mergeAll(notificationScheduler, hostSignals)));
    const resourceStore = ResourceStore.layer.pipe(
      Layer.provide(Layer.mergeAll(notificationScheduler, hostSignals, runtimePolicy)),
    );
    const inspectionLog = InspectionLog.layer;
    const traceLog = TraceLog.layer;
    const orchestratorSystem = Layer.succeed(
      OrchestratorSystem,
      OrchestratorSystem.of({
        start: () => Effect.die(new Error("unexpected start during shutdown test")),
        attach: () => Effect.die(new Error("unexpected attach during shutdown test")),
        get: () => Effect.succeed(null),
        stop: () => Effect.void,
        stopAll: Effect.die(shutdownError),
      }),
    );
    const scopedFinalizerLayer = Layer.effectDiscard(
      Effect.acquireRelease(Effect.void, () =>
        Effect.sync(() => {
          scopeFinalized = true;
        }),
      ),
    );

    const runtime = createRuntime(
      Layer.mergeAll(
        notificationScheduler,
        hostSignals,
        runtimePolicy,
        resourceStore,
        inspectionLog,
        traceLog,
        orchestratorSystem,
        scopedFinalizerLayer,
      ),
    );
    await runtime.runPromise(Effect.void);

    const disposeExit = await Effect.runPromiseExit(Effect.promise(() => runtime.dispose()));

    expect(Exit.isFailure(disposeExit)).toBe(true);
    expect(scopeFinalized).toBe(true);
  });

  it("routes snapshot compatibility through the preferred getSnapshot implementation", async () => {
    const actorMachine = flow.machine<
      { readonly count: number },
      { readonly type: "STEP" },
      "idle"
    >({
      id: "runtime.actor.snapshot-alias",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            STEP: {
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
      },
    });

    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            flow.module("SnapshotAlias", {
              machines: {
                actor: actorMachine,
              },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );

    const actor = runtime.orchestrators.start(actorMachine);

    expect(actor.snapshot).toBe(actor.getSnapshot);

    const initialSnapshot = actor.getSnapshot();
    expect(actor.snapshot()).toBe(initialSnapshot);
    expect(actor.getSnapshot()).toBe(initialSnapshot);
    expect(actor.receipts()).toHaveLength(initialSnapshot.receipts.length);

    actor.send({ type: "STEP" });
    await actor.flush();
    const steppedSnapshot = actor.getSnapshot();
    expect(actor.snapshot()).toBe(steppedSnapshot);
    expect(steppedSnapshot.context.count).toBe(1);

    await actor.dispose();
    const disposedSnapshot = actor.getSnapshot();
    expect(actor.snapshot()).toBe(disposedSnapshot);
    expect(disposedSnapshot.receipts.at(-1)).toMatchObject({
      type: "actor:dispose",
      id: actor.id,
    });

    await runtime.dispose();
  });

  it("builds a managed runtime that preserves service requirements and runtime-owned resources", async () => {
    const app = flow.app({
      modules: [RuntimeModule],
    });

    const appLayer = app.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [Greeter.layer],
    });

    const runtime = flow.runtime(appLayer);
    const projectRef = projectResource.ref("project-1");

    expectType<Promise<string>>(
      runtime.runPromise(
        Effect.gen(function* () {
          const greeter = yield* Greeter;
          return yield* greeter.greet("Atlas");
        }),
      ),
    );
    expectType<Promise<Exit.Exit<"ok", "boom">>>(
      runtime.runPromiseExit(Effect.fail("boom" as const).pipe(Effect.as("ok" as const))),
    );

    type _ManagedRuntimeServices = Expect<
      Greeter | ResourceStore extends ManagedRuntime.ManagedRuntime.Services<
        typeof runtime.managedRuntime
      >
        ? true
        : false
    >;
    void [true as _ManagedRuntimeServices];

    expect(ManagedRuntime.isManagedRuntime(runtime.managedRuntime)).toBe(true);

    runtime.resources.seedResources([
      {
        ref: projectRef,
        value: { id: "project-1", name: "Seeded" },
      },
    ]);

    const snapshot = await runtime.runPromise(
      Effect.gen(function* () {
        const store = yield* ResourceStore;
        return yield* store.get(projectRef);
      }),
    );
    expect(snapshot).toMatchObject({
      id: "runtime.project",
      status: "success",
      value: { id: "project-1", name: "Seeded" },
    });

    const greeting = await runtime.runPromise(
      Effect.gen(function* () {
        const greeter = yield* Greeter;
        return yield* greeter.greet("Atlas");
      }),
    );
    expect(greeting).toBe("hello Atlas");

    const failed = await runtime.runPromiseExit(Effect.fail("boom" as const));
    expect(Exit.isFailure(failed)).toBe(true);

    await runtime.dispose();
    await runtime.dispose();
  });

  it("disposes layer finalizers exactly once", async () => {
    let acquired = 0;
    let finalized = 0;

    const app = flow.app({
      modules: [RuntimeModule],
    });

    const appLayer = app.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [
        Layer.effectDiscard(
          Effect.acquireRelease(
            Effect.sync(() => {
              acquired += 1;
            }),
            () =>
              Effect.sync(() => {
                finalized += 1;
              }),
          ),
        ),
      ],
    });

    const runtime = flow.runtime(appLayer);

    expect(acquired).toBe(0);
    expect(finalized).toBe(0);

    await runtime.runPromise(Effect.void);
    expect(acquired).toBe(1);
    expect(finalized).toBe(0);

    await runtime.dispose();
    expect(finalized).toBe(1);

    await runtime.dispose();
    expect(finalized).toBe(1);
  });

  it("shares the same in-flight dispose work across concurrent callers", async () => {
    let releaseDispose: (() => void) | undefined;
    let finalized = 0;

    const app = flow.app({
      modules: [RuntimeModule],
    });

    const appLayer = app.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [
        Layer.effectDiscard(
          Effect.acquireRelease(Effect.void, () =>
            Effect.promise<void>(
              () =>
                new Promise((resolve) => {
                  releaseDispose = () => {
                    finalized += 1;
                    resolve();
                  };
                }),
            ),
          ),
        ),
      ],
    });

    const runtime = flow.runtime(appLayer);
    await runtime.runPromise(Effect.void);

    const firstDispose = runtime.dispose();
    const secondDispose = runtime.dispose();
    let secondResolved = false;
    void secondDispose.then(() => {
      secondResolved = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(secondResolved).toBe(false);

    releaseDispose?.();
    await Promise.all([firstDispose, secondDispose]);
    expect(finalized).toBe(1);
  });

  it("shares the same failing in-flight dispose work across concurrent callers", async () => {
    const shutdownError = new Error("runtime shutdown failed once");
    let stopAllCalls = 0;
    let finalized = 0;
    let releaseShutdown: (() => void) | undefined;

    const notificationScheduler = NotificationScheduler.testLayer;
    const hostSignals = HostSignals.testLayer;
    const runtimePolicy = FlowRuntimePolicy.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
    }).pipe(Layer.provide(Layer.mergeAll(notificationScheduler, hostSignals)));
    const resourceStore = ResourceStore.layer.pipe(
      Layer.provide(Layer.mergeAll(notificationScheduler, hostSignals, runtimePolicy)),
    );
    const inspectionLog = InspectionLog.layer;
    const traceLog = TraceLog.layer;
    const orchestratorSystem = Layer.succeed(
      OrchestratorSystem,
      OrchestratorSystem.of({
        start: () => Effect.die(new Error("unexpected start during failed dispose join test")),
        attach: () => Effect.die(new Error("unexpected attach during failed dispose join test")),
        get: () => Effect.succeed(null),
        stop: () => Effect.void,
        stopAll: Effect.callback<void>((resume) => {
          stopAllCalls += 1;
          releaseShutdown = () => {
            resume(Effect.die(shutdownError));
          };
        }),
      }),
    );
    const scopedFinalizerLayer = Layer.effectDiscard(
      Effect.acquireRelease(Effect.void, () =>
        Effect.sync(() => {
          finalized += 1;
        }),
      ),
    );

    const runtime = createRuntime(
      Layer.mergeAll(
        notificationScheduler,
        hostSignals,
        runtimePolicy,
        resourceStore,
        inspectionLog,
        traceLog,
        orchestratorSystem,
        scopedFinalizerLayer,
      ),
    );
    await runtime.runPromise(Effect.void);

    const firstDispose = runtime.dispose();
    const secondDispose = runtime.dispose();
    let firstResolved = false;
    let secondResolved = false;
    void firstDispose.then(
      () => {
        firstResolved = true;
      },
      () => {
        firstResolved = true;
      },
    );
    void secondDispose.then(
      () => {
        secondResolved = true;
      },
      () => {
        secondResolved = true;
      },
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(firstResolved).toBe(false);
    expect(secondResolved).toBe(false);
    expect(stopAllCalls).toBe(1);
    expect(finalized).toBe(0);

    releaseShutdown?.();

    const [firstDisposeExit, secondDisposeExit] = await Promise.all([
      Effect.runPromiseExit(Effect.promise(() => firstDispose)),
      Effect.runPromiseExit(Effect.promise(() => secondDispose)),
    ]);

    expect(Exit.isFailure(firstDisposeExit)).toBe(true);
    expect(Exit.isFailure(secondDisposeExit)).toBe(true);
    if (Exit.isFailure(firstDisposeExit) && Exit.isFailure(secondDisposeExit)) {
      const firstDefects = firstDisposeExit.cause.reasons
        .filter(Cause.isDieReason)
        .map((reason) => reason.defect);
      const secondDefects = secondDisposeExit.cause.reasons
        .filter(Cause.isDieReason)
        .map((reason) => reason.defect);
      expect(firstDefects).toContain(shutdownError);
      expect(secondDefects).toContain(shutdownError);
    }
    expect(stopAllCalls).toBe(1);
    expect(finalized).toBe(1);
  });

  it("installs OrchestratorSystem in the runtime and uses it for actor ownership", async () => {
    const actorMachine = flow.machine<
      { readonly count: number },
      { readonly type: "STEP" },
      "idle"
    >({
      id: "runtime.actor",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
      },
    });

    const app = flow.app({
      modules: [
        RuntimeModule,
        flow.module("RuntimeActor", {
          machines: {
            actor: actorMachine,
          },
        }),
      ],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.orchestrators.start(actorMachine, {
      id: "runtime-actor-1",
      policy: "keep-alive",
    });
    const viaService = await runtime.runPromise(
      Effect.flatMap(OrchestratorSystem, (system) => system.get("runtime-actor-1")),
    );

    expect(viaService).toBe(actor);

    await runtime.dispose();
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "actor:dispose", id: "runtime-actor-1" }),
      ]),
    );
  });

  it("scopes default actor ids by app, module, and machine ownership", async () => {
    const sharedAlphaMachine = flow.machine<
      { readonly count: number },
      { readonly type: "STEP" },
      "idle"
    >({
      id: "runtime.shared-machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
      },
    });
    const sharedBetaMachine = flow.machine<
      { readonly count: number },
      { readonly type: "STEP" },
      "idle"
    >({
      id: "runtime.shared-machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
      },
    });

    const AlphaModule = flow.module("Alpha", {
      machines: {
        editor: sharedAlphaMachine,
      },
    });
    const BetaModule = flow.module("Beta", {
      machines: {
        editor: sharedBetaMachine,
      },
    });
    const app = flow.app({
      modules: [AlphaModule, BetaModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const alphaActor = runtime.createActor(sharedAlphaMachine);
    const betaActor = runtime.createActor(sharedBetaMachine);

    expect(alphaActor.id).toBe("app:5:Alpha|4:Beta/Alpha/editor");
    expect(betaActor.id).toBe("app:5:Alpha|4:Beta/Beta/editor");
    expect(runtime.orchestrators.get(alphaActor.id)).toBe(alphaActor);
    expect(runtime.orchestrators.get(betaActor.id)).toBe(betaActor);

    await runtime.dispose();
  });

  it("reports owner provenance when explicit actor ids collide across app-owned machines", async () => {
    const firstMachine = flow.machine<{}, never, "idle">({
      id: "runtime.actor.provenance.collision",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });
    const secondMachine = flow.machine<{}, never, "idle">({
      id: "runtime.actor.provenance.collision",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });

    const firstModule = flow.module("RuntimeActorProvenanceFirst", {
      machines: {
        actor: firstMachine,
      },
    });
    const secondModule = flow.module("RuntimeActorProvenanceSecond", {
      machines: {
        actor: secondMachine,
      },
    });
    const runtime = flow.runtime(
      flow
        .app({
          modules: [firstModule, secondModule],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );

    runtime.createActor(firstMachine, {
      id: "runtime.actor.same-public-id",
    });
    const duplicateExit = await runtime.runPromiseExit(
      Effect.flatMap(OrchestratorSystem, (system) =>
        system.start(secondMachine, {
          id: "runtime.actor.same-public-id",
        }),
      ),
    );

    expect(duplicateExit).toMatchObject({
      _tag: "Failure",
    });
    if (duplicateExit._tag === "Failure") {
      expect(Cause.squash(duplicateExit.cause)).toMatchObject({
        code: "FLOW-ORCH-001",
        debug: {
          actorId: "runtime.actor.same-public-id",
          existingOwnerDomain:
            "app:27:RuntimeActorProvenanceFirst|28:RuntimeActorProvenanceSecond/RuntimeActorProvenanceFirst/actor",
          attemptedOwnerDomain:
            "app:27:RuntimeActorProvenanceFirst|28:RuntimeActorProvenanceSecond/RuntimeActorProvenanceSecond/actor",
        },
      });
    }

    await runtime.dispose();
  });

  it("releases disposed actors from the orchestrator registry without double-disposing them later", async () => {
    const actorMachine = flow.machine<
      { readonly count: number },
      { readonly type: "STEP" },
      "idle"
    >({
      id: "runtime.actor.self-dispose",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
      },
    });

    const app = flow.app({
      modules: [
        RuntimeModule,
        flow.module("RuntimeSelfDispose", {
          machines: {
            actor: actorMachine,
          },
        }),
      ],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.orchestrators.start(actorMachine, {
      id: "runtime-actor-self-dispose",
    });

    await actor.dispose();
    expect(
      await runtime.runPromise(
        Effect.flatMap(OrchestratorSystem, (system) => system.get("runtime-actor-self-dispose")),
      ),
    ).toBe(null);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.type === "actor:dispose" && receipt.id === "runtime-actor-self-dispose",
        ),
    ).toHaveLength(1);

    await runtime.dispose();
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.type === "actor:dispose" && receipt.id === "runtime-actor-self-dispose",
        ),
    ).toHaveLength(1);
  });

  it("releases actor subscriptions after runtime disposal", async () => {
    const actorMachine = flow.machine<
      { readonly count: number },
      { readonly type: "STEP" },
      "idle"
    >({
      id: "runtime.actor.subscription-dispose",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {},
      },
    });

    const app = flow.app({
      modules: [
        RuntimeModule,
        flow.module("RuntimeSubscriptionDispose", {
          machines: {
            actor: actorMachine,
          },
        }),
      ],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.orchestrators.start(actorMachine, {
      id: "runtime-actor-subscription-dispose",
    });
    let notifications = 0;
    const unsubscribe = actor.subscribe(() => {
      notifications += 1;
    });

    actor.send({ type: "STEP" });
    expect(notifications).toBe(1);

    await runtime.dispose();
    expect(notifications).toBe(2);

    actor.send({ type: "STEP" });
    expect(notifications).toBe(2);

    unsubscribe();
  });

  it("keeps a leased actor alive until the final attachment releases", async () => {
    const actorMachine = flow.machine<
      { readonly count: number },
      { readonly type: "STEP" },
      "idle"
    >({
      id: "runtime.actor.lease.shared",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            STEP: {
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
      },
    });

    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            RuntimeModule,
            flow.module("RuntimeSharedLease", {
              machines: {
                actor: actorMachine,
              },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );

    const first = await runtime.orchestrators.attach(actorMachine, {
      id: "runtime-actor-lease-shared",
      policy: "keep-alive",
    });
    const second = await runtime.orchestrators.attach(actorMachine, {
      id: "runtime-actor-lease-shared",
      policy: "keep-alive",
    });

    expect(second.actor).toBe(first.actor);
    first.actor.send({ type: "STEP" });
    await first.actor.flush();

    await first.release();

    expect(runtime.orchestrators.get("runtime-actor-lease-shared")).toBe(first.actor);
    expect(second.actor.getSnapshot().context.count).toBe(1);
    expect(
      first.actor.receipts().filter((receipt) => receipt.type === "actor:dispose"),
    ).toHaveLength(0);

    await second.release();

    expect(runtime.orchestrators.get("runtime-actor-lease-shared")).toBe(null);
    expect(
      first.actor.receipts().filter((receipt) => receipt.type === "actor:dispose"),
    ).toHaveLength(1);

    await runtime.dispose();
  });

  it("serializes final lease cleanup, repeated release, reacquisition, and exact eviction", async () => {
    const finalizers: Array<ReturnType<typeof createDeferredFinalizer>> = [];
    const actorMachine = flow.machine<{}, never, "running">({
      id: "runtime.actor.lease.reacquire",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          invoke: flow.stream({
            id: "runtime.actor.lease.reacquire.stream",
            subscribe: () => {
              const finalizer = createDeferredFinalizer();
              finalizers.push(finalizer);
              return finalizer.stream;
            },
          }),
        },
      },
    });

    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            RuntimeModule,
            flow.module("RuntimeLeaseReacquire", {
              machines: {
                actor: actorMachine,
              },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );

    const first = await runtime.orchestrators.attach(actorMachine, {
      id: "runtime-actor-lease-reacquire",
      policy: "keep-alive",
    });
    const second = await runtime.orchestrators.attach(actorMachine, {
      id: "runtime-actor-lease-reacquire",
      policy: "keep-alive",
    });
    expect(second.actor).toBe(first.actor);
    await finalizers[0]!.acquired;

    await first.release();
    expect(runtime.orchestrators.get("runtime-actor-lease-reacquire")).toBe(first.actor);

    const finalRelease = second.release();
    const repeatedRelease = second.release();
    expect(repeatedRelease).toBe(finalRelease);
    await finalizers[0]!.started;

    const reacquire = runtime.orchestrators.attach(actorMachine, {
      id: "runtime-actor-lease-reacquire",
      policy: "keep-alive",
    });
    let reacquired = false;
    void reacquire.then(() => {
      reacquired = true;
    });
    await Promise.resolve();

    expect(reacquired).toBe(false);
    expect(runtime.orchestrators.get("runtime-actor-lease-reacquire")).toBe(first.actor);

    finalizers[0]!.release();
    await Promise.all([finalRelease, repeatedRelease]);
    const replacement = await reacquire;
    await finalizers[1]!.acquired;

    expect(reacquired).toBe(true);
    expect(replacement.actor).not.toBe(first.actor);
    expect(runtime.orchestrators.get("runtime-actor-lease-reacquire")).toBe(replacement.actor);
    expect(
      first.actor.receipts().filter((receipt) => receipt.type === "actor:dispose"),
    ).toHaveLength(1);

    const replacementRelease = replacement.release();
    await finalizers[1]!.started;
    finalizers[1]!.release();
    await replacementRelease;

    expect(runtime.orchestrators.get("runtime-actor-lease-reacquire")).toBe(null);
    expect(
      replacement.actor.receipts().filter((receipt) => receipt.type === "actor:dispose"),
    ).toHaveLength(1);

    await runtime.dispose();
  });

  it("invalidates queued stale mailbox work before same-id replacement can publish", async () => {
    const finalizers: Array<ReturnType<typeof createDeferredFinalizer>> = [];
    const actorMachine = flow.machine<
      { readonly count: number },
      { readonly type: "STEP" },
      "running"
    >({
      id: "runtime.actor.lease.mailbox-replacement",
      initial: "running",
      context: () => ({ count: 0 }),
      states: {
        running: {
          invoke: flow.stream({
            id: "runtime.actor.lease.mailbox-replacement.stream",
            subscribe: () => {
              const finalizer = createDeferredFinalizer();
              finalizers.push(finalizer);
              return finalizer.stream;
            },
          }),
          on: {
            STEP: {
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
      },
    });

    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            RuntimeModule,
            flow.module("RuntimeLeaseMailboxReplacement", {
              machines: {
                actor: actorMachine,
              },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );

    const first = await runtime.orchestrators.attach(actorMachine, {
      id: "runtime-actor-lease-mailbox-replacement",
      policy: "keep-alive",
    });
    const second = await runtime.orchestrators.attach(actorMachine, {
      id: "runtime-actor-lease-mailbox-replacement",
      policy: "keep-alive",
    });
    await finalizers[0]!.acquired;

    enqueueReadyWork(first.actor, () => {
      first.actor.send({ type: "STEP" });
    });
    expect(first.actor.getSnapshot().context.count).toBe(0);

    await first.release();
    const finalRelease = second.release();
    await finalizers[0]!.started;

    const reacquire = runtime.orchestrators.attach(actorMachine, {
      id: "runtime-actor-lease-mailbox-replacement",
      policy: "keep-alive",
    });
    let reacquired = false;
    void reacquire.then(() => {
      reacquired = true;
    });
    await Promise.resolve();

    expect(reacquired).toBe(false);
    expect(runtime.orchestrators.get("runtime-actor-lease-mailbox-replacement")).toBe(first.actor);

    finalizers[0]!.release();
    await finalRelease;
    const replacement = await reacquire;
    await finalizers[1]!.acquired;

    expect(runtime.orchestrators.get("runtime-actor-lease-mailbox-replacement")).toBe(
      replacement.actor,
    );
    expect(replacement.actor.getSnapshot().context.count).toBe(0);
    const replacementReceipts = replacement.actor.receipts();

    await first.actor.flush();
    await replacement.actor.flush();

    expect(first.actor.getSnapshot().context.count).toBe(0);
    expect(replacement.actor.getSnapshot().context.count).toBe(0);
    expect(replacement.actor.receipts()).toEqual(replacementReceipts);

    const replacementRelease = replacement.release();
    await finalizers[1]!.started;
    finalizers[1]!.release();
    await replacementRelease;
    await runtime.dispose();
  });

  it("rejects incompatible same-id leased actors instead of casting the live incarnation", async () => {
    const firstMachine = flow.machine<{}, never, "idle">({
      id: "runtime.actor.lease.incompatible",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });
    const secondMachine = flow.machine<{ readonly value: string }, never, "idle">({
      id: "runtime.actor.lease.incompatible",
      initial: "idle",
      context: () => ({ value: "different" }),
      states: {
        idle: {},
      },
    });

    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            RuntimeModule,
            flow.module("RuntimeIncompatibleLease", {
              machines: {
                first: firstMachine,
                second: secondMachine,
              },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );

    const lease = await runtime.orchestrators.attach(firstMachine, {
      id: "runtime-actor-lease-incompatible",
      policy: "keep-alive",
    });

    let incompatibleError: unknown;
    try {
      await runtime.orchestrators.attach(secondMachine, {
        id: "runtime-actor-lease-incompatible",
        policy: "keep-alive",
      });
    } catch (error) {
      incompatibleError = error;
    }

    expect(incompatibleError).toMatchObject({
      code: "FLOW-ORCH-001",
    });

    await lease.release();
    await runtime.dispose();
  });

  it("lets explicit stop override outstanding leases without double finalization", async () => {
    const actorMachine = flow.machine<{}, never, "idle">({
      id: "runtime.actor.lease.stop",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });

    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            RuntimeModule,
            flow.module("RuntimeStopLease", {
              machines: {
                actor: actorMachine,
              },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );
    const first = await runtime.orchestrators.attach(actorMachine, {
      id: "runtime-actor-lease-stop",
      policy: "keep-alive",
    });
    const second = await runtime.orchestrators.attach(actorMachine, {
      id: "runtime-actor-lease-stop",
      policy: "keep-alive",
    });

    await runtime.orchestrators.stop("runtime-actor-lease-stop");

    expect(runtime.orchestrators.get("runtime-actor-lease-stop")).toBe(null);

    await first.release();
    await second.release();

    expect(
      first.actor.receipts().filter((receipt) => receipt.type === "actor:dispose"),
    ).toHaveLength(1);

    await runtime.dispose();
  });

  it("makes repeated lease release idempotent", async () => {
    const actorMachine = flow.machine<{}, never, "idle">({
      id: "runtime.actor.lease.idempotent",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });
    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            RuntimeModule,
            flow.module("RuntimeIdempotentLease", {
              machines: {
                actor: actorMachine,
              },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );

    const lease = await runtime.orchestrators.attach(actorMachine, {
      id: "runtime-actor-lease-idempotent",
      policy: "keep-alive",
    });

    await lease.release();
    await lease.release();

    expect(
      lease.actor.receipts().filter((receipt) => receipt.type === "actor:dispose"),
    ).toHaveLength(1);

    await runtime.dispose();
  });
});
