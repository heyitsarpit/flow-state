import { Context, Effect, Exit, Layer, ManagedRuntime } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { flow } from "./public/flow.js";
import { createKey } from "./public/keys.js";
import { HostSignalSource } from "./services/host-signal-source.js";
import { HostSignals } from "./services/host-signals.js";
import { NotificationScheduler } from "./services/notification-scheduler.js";
import { OrchestratorSystem } from "./services/orchestrator-system.js";
import { ResourceStore } from "./services/resource-store.js";
import { TraceLog } from "./services/trace.js";

type Expect<Type extends true> = Type;

function expectType<Type>(_value: Type): void {
  void _value;
}

interface ProjectRecord {
  readonly id: string;
  readonly name: string;
}

class Greeter extends Context.Service<
  Greeter,
  {
    readonly greet: (name: string) => Effect.Effect<string>;
  }
>()("test/Greeter") {
  static readonly layer = Layer.succeed(
    Greeter,
    Greeter.of({
      greet: (name) => Effect.succeed(`hello ${name}`),
    }),
  );
}

const projectResource = flow.resource<
  [projectId: string],
  ProjectRecord,
  never,
  Effect.Effect<ProjectRecord>
>({
  id: "runtime.project",
  key: (projectId) => createKey("runtime-project", projectId),
  lookup: (projectId) => Effect.succeed({ id: projectId, name: "Loaded" }),
});

const RuntimeModule = flow.module("Runtime", () => ({
  project: projectResource,
}));

describe("Phase 3 runtime and app-layer contract", () => {
  it("builds a managed runtime that preserves service requirements and runtime-owned resources", async () => {
    const app = flow.app({
      modules: [RuntimeModule],
    });

    const appLayer = app.layer({
      store: flow.store.test({ namespace: "runtime-test" }),
      orchestrators: flow.orchestrators.test({ deterministic: true }),
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
      store: flow.store.test({ namespace: "runtime-dispose" }),
      orchestrators: flow.orchestrators.test({ deterministic: true }),
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
      store: flow.store.test({ namespace: "runtime-concurrent-dispose" }),
      orchestrators: flow.orchestrators.test({ deterministic: true }),
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
      modules: [RuntimeModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test({ namespace: "runtime-orchestrators" }),
        orchestrators: flow.orchestrators.test({ deterministic: true }),
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
      modules: [RuntimeModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test({ namespace: "runtime-actor-self-dispose" }),
        orchestrators: flow.orchestrators.test({ deterministic: true }),
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
      modules: [RuntimeModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test({ namespace: "runtime-actor-subscription-dispose" }),
        orchestrators: flow.orchestrators.test({ deterministic: true }),
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

  it("installs default host-signal and trace services through App.layer", async () => {
    const app = flow.app({
      modules: [RuntimeModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test({ namespace: "runtime-sidecars" }),
        orchestrators: flow.orchestrators.test({ deterministic: true }),
      }),
    );

    const initialSignals = await runtime.runPromise(
      Effect.flatMap(HostSignals, (signals) => signals.snapshot),
    );
    expect(initialSignals).toEqual({
      focused: true,
      online: true,
    });

    await runtime.runPromise(Effect.flatMap(HostSignals, (signals) => signals.setOnline(false)));
    const nextSignals = await runtime.runPromise(
      Effect.flatMap(HostSignals, (signals) => signals.snapshot),
    );
    expect(nextSignals).toEqual({
      focused: true,
      online: false,
    });

    await runtime.runPromise(
      Effect.flatMap(TraceLog, (trace) => trace.append({ type: "runtime:test", id: "trace-1" })),
    );
    const entries = await runtime.runPromise(Effect.flatMap(TraceLog, (trace) => trace.entries));
    expect(entries).toEqual([{ type: "runtime:test", id: "trace-1" }]);
  });

  it("subscribes live host signals once and releases them when the runtime disposes", async () => {
    let currentSignals = {
      focused: true,
      online: true,
    };
    let subscribeCount = 0;
    let unsubscribeCount = 0;
    let notify:
      | ((snapshot: Readonly<{ readonly focused: boolean; readonly online: boolean }>) => void)
      | undefined;

    const hostSignalSourceLayer = Layer.succeed(
      HostSignalSource,
      HostSignalSource.of({
        snapshot: Effect.sync(() => currentSignals),
        subscribe: Effect.fn("TestHostSignalSource.subscribe")(function* (
          listener: (snapshot: typeof currentSignals) => void,
        ) {
          subscribeCount += 1;
          notify = listener;

          return () => {
            unsubscribeCount += 1;
            notify = undefined;
          };
        }),
      }),
    );
    const notificationSchedulerLayer = NotificationScheduler.testLayer;

    const runtime = flow.runtime(
      Layer.mergeAll(
        notificationSchedulerLayer,
        ResourceStore.layer.pipe(Layer.provide(notificationSchedulerLayer)),
        OrchestratorSystem.layer,
        TraceLog.layer,
        HostSignals.layer.pipe(Layer.provide(hostSignalSourceLayer)),
      ),
    );

    expect(subscribeCount).toBe(0);

    expect(
      await runtime.runPromise(Effect.flatMap(HostSignals, (signals) => signals.snapshot)),
    ).toEqual({
      focused: true,
      online: true,
    });
    expect(subscribeCount).toBe(1);

    await runtime.runPromise(Effect.flatMap(HostSignals, (signals) => signals.snapshot));
    expect(subscribeCount).toBe(1);

    currentSignals = {
      focused: false,
      online: false,
    };
    notify?.(currentSignals);

    expect(
      await runtime.runPromise(Effect.flatMap(HostSignals, (signals) => signals.snapshot)),
    ).toEqual({
      focused: false,
      online: false,
    });

    await runtime.dispose();
    expect(unsubscribeCount).toBe(1);

    await runtime.dispose();
    expect(unsubscribeCount).toBe(1);
  });

  it("releases runtime-owned resource subscriptions when the runtime disposes", async () => {
    let subscribeCount = 0;
    let unsubscribeCount = 0;
    const projectRef = projectResource.ref("subscription-project");

    const resourceStoreLayer = Layer.succeed(
      ResourceStore,
      ResourceStore.of({
        get: () =>
          Effect.succeed({
            id: projectRef.id,
            status: "idle" as const,
            availability: "empty" as const,
            activity: "idle" as const,
            freshness: "fresh" as const,
            isPlaceholderData: false,
          }),
        seed: () => Effect.void,
        hydrate: () => Effect.void,
        patch: () => Effect.void,
        subscribe: () =>
          Effect.sync(() => {
            subscribeCount += 1;

            return () => {
              unsubscribeCount += 1;
            };
          }),
        invalidate: () => Effect.succeed(0),
        ensure: () => Effect.die(new Error("not needed in runtime subscription test")),
        refresh: () => Effect.die(new Error("not needed in runtime subscription test")),
        inspect: () => Effect.succeed([]),
      }),
    );

    const runtime = flow.runtime(
      Layer.mergeAll(
        NotificationScheduler.testLayer,
        resourceStoreLayer,
        OrchestratorSystem.layer,
        TraceLog.layer,
        HostSignals.testLayer,
      ),
    );

    const unsubscribe = runtime.resources.subscribe(projectRef, () => undefined);

    expect(subscribeCount).toBe(1);
    expect(unsubscribeCount).toBe(0);

    await runtime.dispose();
    expect(unsubscribeCount).toBe(1);

    unsubscribe();
    expect(unsubscribeCount).toBe(1);

    await runtime.dispose();
    expect(unsubscribeCount).toBe(1);
  });

  it("interrupts in-flight refresh effects when the runtime disposes", async () => {
    let interrupted = 0;
    let resolveLookup: ((value: ProjectRecord) => void) | undefined;
    let lookupStarted: (() => void) | undefined;
    const lookupStartedPromise = new Promise<void>((resolve) => {
      lookupStarted = resolve;
    });
    const seenStates: Array<Readonly<{ readonly activity: string; readonly status: string }>> = [];

    const blockingResource = flow.resource<
      [projectId: string],
      ProjectRecord,
      never,
      Effect.Effect<ProjectRecord>
    >({
      id: "runtime.project.blocking",
      key: (projectId) => createKey("runtime-project-blocking", projectId),
      lookup: (projectId) =>
        Effect.callback<ProjectRecord>((resume) => {
          lookupStarted?.();
          resolveLookup = (value) => {
            resume(Effect.succeed(value));
          };

          return Effect.sync(() => {
            interrupted += 1;
          });
        }).pipe(
          Effect.map((project) => ({
            ...project,
            id: projectId,
          })),
        ),
    });
    const BlockingRuntimeModule = flow.module("BlockingRuntime", () => ({
      project: blockingResource,
    }));

    const app = flow.app({
      modules: [BlockingRuntimeModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test({ namespace: "runtime-refresh-dispose" }),
        orchestrators: flow.orchestrators.test({ deterministic: true }),
      }),
    );
    const projectRef = blockingResource.ref("project-1");
    runtime.resources.subscribe(projectRef, (snapshot) => {
      seenStates.push({
        activity: snapshot.activity,
        status: snapshot.status,
      });
    });

    const refreshExitPromise = runtime.runPromiseExit(
      Effect.flatMap(ResourceStore, (store) => store.refresh(projectRef)),
    );

    await lookupStartedPromise;
    expect(runtime.resources.get(projectRef)).toMatchObject({
      activity: "fetching",
    });
    expect(seenStates).toContainEqual({
      activity: "fetching",
      status: "loading",
    });

    await runtime.dispose();

    const refreshExit = await refreshExitPromise;
    expect(Exit.isFailure(refreshExit)).toBe(true);
    expect(Exit.hasInterrupts(refreshExit)).toBe(true);
    expect(interrupted).toBe(1);

    resolveLookup?.({ id: "project-1", name: "late result" });
    await Promise.resolve();
    await Promise.resolve();

    expect(
      seenStates.some((snapshot) => snapshot.activity === "idle" && snapshot.status === "success"),
    ).toBe(false);
  });

  it("routes resource subscription notifications through an overridable app-layer scheduler", async () => {
    const seenNames: string[] = [];
    const scheduledCallbacks: Array<() => void> = [];

    const app = flow.app({
      modules: [RuntimeModule],
    });

    const runtimeLayer = app.layer<readonly [Layer.Layer<NotificationScheduler, never, never>]>({
      store: flow.store.test({ namespace: "runtime-notifications" }),
      orchestrators: flow.orchestrators.test({ deterministic: true }),
      services: [
        Layer.succeed(
          NotificationScheduler,
          NotificationScheduler.of({
            batch: <Value>(callback: () => Value): Value => callback(),
            schedule: (callback: () => void) => {
              scheduledCallbacks.push(callback);
              return () => {
                const index = scheduledCallbacks.indexOf(callback);
                if (index >= 0) {
                  scheduledCallbacks.splice(index, 1);
                }
              };
            },
            flush: Effect.sync(() => {
              while (scheduledCallbacks.length > 0) {
                scheduledCallbacks.shift()?.();
              }
            }),
          }),
        ),
      ],
    });
    const runtime = flow.runtime(runtimeLayer);

    const projectRef = projectResource.ref("runtime-notification-project");
    const unsubscribe = runtime.resources.subscribe(projectRef, (snapshot) => {
      const value = snapshot.value as ProjectRecord | undefined;
      if (value?.name !== undefined) {
        seenNames.push(value.name);
      }
    });

    runtime.resources.seedResources([
      {
        ref: projectRef,
        value: { id: "runtime-notification-project", name: "Seeded by scheduler" },
      },
    ]);

    expect(seenNames).toEqual([]);
    expect(scheduledCallbacks).toHaveLength(1);

    await runtime.runPromise(Effect.flatMap(NotificationScheduler, (scheduler) => scheduler.flush));
    expect(seenNames).toEqual(["Seeded by scheduler"]);

    unsubscribe();
    await runtime.dispose();
  });

  it("cancels queued resource notifications when the runtime disposes before scheduler flush", async () => {
    const seenNames: string[] = [];
    const scheduledCallbacks: Array<() => void> = [];

    const app = flow.app({
      modules: [RuntimeModule],
    });

    const runtimeLayer = app.layer<readonly [Layer.Layer<NotificationScheduler, never, never>]>({
      store: flow.store.test({ namespace: "runtime-notification-cancel" }),
      orchestrators: flow.orchestrators.test({ deterministic: true }),
      services: [
        Layer.succeed(
          NotificationScheduler,
          NotificationScheduler.of({
            batch: <Value>(callback: () => Value): Value => callback(),
            schedule: (callback: () => void) => {
              scheduledCallbacks.push(callback);
              return () => {
                const index = scheduledCallbacks.indexOf(callback);
                if (index >= 0) {
                  scheduledCallbacks.splice(index, 1);
                }
              };
            },
            flush: Effect.sync(() => {
              while (scheduledCallbacks.length > 0) {
                scheduledCallbacks.shift()?.();
              }
            }),
          }),
        ),
      ],
    });
    const runtime = flow.runtime(runtimeLayer);

    const projectRef = projectResource.ref("runtime-notification-cancel-project");
    runtime.resources.subscribe(projectRef, (snapshot) => {
      const value = snapshot.value as ProjectRecord | undefined;
      if (value?.name !== undefined) {
        seenNames.push(value.name);
      }
    });

    runtime.resources.seedResources([
      {
        ref: projectRef,
        value: {
          id: "runtime-notification-cancel-project",
          name: "Should never flush after dispose",
        },
      },
    ]);

    expect(scheduledCallbacks).toHaveLength(1);

    await runtime.dispose();
    while (scheduledCallbacks.length > 0) {
      scheduledCallbacks.shift()?.();
    }

    expect(seenNames).toEqual([]);
  });
});
