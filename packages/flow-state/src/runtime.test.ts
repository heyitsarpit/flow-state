import { Effect, Exit, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { flow } from "./public/flow.js";
import { createKey, createTag } from "./public/keys.js";
import { projectResource, type ProjectRecord, RuntimeModule } from "./runtime-test-fixtures.js";
import { HostSignalSource } from "./services/host-signal-source.js";
import { HostSignals } from "./services/host-signals.js";
import { InspectionLog } from "./services/inspection.js";
import { NotificationScheduler } from "./services/notification-scheduler.js";
import { OrchestratorSystem } from "./services/orchestrator-system.js";
import { ResourceStore } from "./services/resource-store.js";
import { TraceLog } from "./services/trace.js";

describe("runtime resource and service contracts", () => {
  it("refreshes state-owned resources even when cached data is already fresh", async () => {
    const refreshCalls: string[] = [];
    const refreshedProject = flow.resource<
      [projectId: string],
      ProjectRecord,
      never,
      Effect.Effect<ProjectRecord>
    >({
      id: "runtime.project.refresh",
      key: (projectId) => createKey("runtime-project-refresh", projectId),
      lookup: (projectId) =>
        Effect.sync(() => {
          refreshCalls.push(projectId);
          return { id: projectId, name: "Refreshed" };
        }),
    });
    const refreshMachine = flow.machine<{}, { readonly type: "NOOP" }, "ready">({
      id: "runtime.actor.refresh",
      initial: "ready",
      context: () => ({}),
      states: {
        ready: {
          invoke: flow.refresh(refreshedProject.ref("project-1")),
        },
      },
    });
    const RefreshModule = flow.module("RuntimeRefresh", () => ({
      project: refreshedProject,
    }));
    const app = flow.app({
      modules: [RefreshModule],
    });
    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    runtime.resources.seedResources([
      {
        ref: refreshedProject.ref("project-1"),
        value: { id: "project-1", name: "Seeded" },
      },
    ]);

    const actor = runtime.createActor(refreshMachine);

    expect(actor.snapshot().resources["runtime.project.refresh"]).toMatchObject({
      value: { id: "project-1", name: "Seeded" },
    });

    await actor.flush();

    expect(refreshCalls).toEqual(["project-1"]);
    expect(actor.snapshot().resources["runtime.project.refresh"]).toMatchObject({
      status: "success",
      freshness: "fresh",
      value: { id: "project-1", name: "Refreshed" },
      previousValue: { id: "project-1", name: "Seeded" },
    });
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "query:start",
          id: "runtime.project.refresh",
          mode: "refresh",
          parentState: "ready",
        }),
      ]),
    );
    expect(actor.issues()).toEqual([]);

    await runtime.dispose();
  });

  it("ensures state-owned resources on entry without refetching fresh seeded data", async () => {
    const ensureCalls: string[] = [];
    const ensuredProject = flow.resource<
      [projectId: string],
      ProjectRecord,
      never,
      Effect.Effect<ProjectRecord>
    >({
      id: "runtime.project.ensure",
      key: (projectId) => createKey("runtime-project-ensure", projectId),
      lookup: (projectId) =>
        Effect.sync(() => {
          ensureCalls.push(projectId);
          return { id: projectId, name: "Ensured" };
        }),
    });
    const ensureMachine = flow.machine<{}, { readonly type: "NOOP" }, "ready">({
      id: "runtime.actor.ensure",
      initial: "ready",
      context: () => ({}),
      states: {
        ready: {
          invoke: flow.ensure(ensuredProject.ref("project-1")),
        },
      },
    });
    const EnsureModule = flow.module("RuntimeEnsure", () => ({
      project: ensuredProject,
    }));
    const app = flow.app({
      modules: [EnsureModule],
    });
    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    runtime.resources.seedResources([
      {
        ref: ensuredProject.ref("project-1"),
        value: { id: "project-1", name: "Seeded" },
      },
    ]);

    const actor = runtime.createActor(ensureMachine);

    expect(actor.snapshot().resources["runtime.project.ensure"]).toMatchObject({
      value: { id: "project-1", name: "Seeded" },
    });

    await actor.flush();

    expect(ensureCalls).toEqual([]);
    expect(actor.snapshot().resources["runtime.project.ensure"]).toMatchObject({
      status: "success",
      freshness: "fresh",
      value: { id: "project-1", name: "Seeded" },
    });
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "query:start",
          id: "runtime.project.ensure",
          mode: "ensure",
          parentState: "ready",
        }),
      ]),
    );
    expect(actor.issues()).toEqual([]);

    await runtime.dispose();
  });

  it("patches state-owned resources on entry and records a resource receipt", async () => {
    const patchedProject = flow.resource<
      [projectId: string],
      ProjectRecord,
      never,
      Effect.Effect<ProjectRecord>
    >({
      id: "runtime.project.patch",
      key: (projectId) => createKey("runtime-project-patch", projectId),
      lookup: (projectId) => Effect.succeed({ id: projectId, name: "Loaded" }),
    });
    const patchMachine = flow.machine<{}, { readonly type: "NOOP" }, "ready">({
      id: "runtime.actor.patch",
      initial: "ready",
      context: () => ({}),
      states: {
        ready: {
          invoke: flow.patch(patchedProject.ref("project-1"), { name: "Patched" }),
        },
      },
    });
    const PatchModule = flow.module("RuntimePatch", () => ({
      project: patchedProject,
    }));
    const app = flow.app({
      modules: [PatchModule],
    });
    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    runtime.resources.seedResources([
      {
        ref: patchedProject.ref("project-1"),
        value: { id: "project-1", name: "Seeded" },
      },
    ]);

    const actor = runtime.createActor(patchMachine);

    expect(actor.snapshot().resources["runtime.project.patch"]).toMatchObject({
      status: "success",
      freshness: "fresh",
      value: { id: "project-1", name: "Patched" },
      previousValue: { id: "project-1", name: "Seeded" },
    });
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "resource:patch",
          id: "runtime.project.patch",
          parentState: "ready",
        }),
      ]),
    );
    expect(actor.issues()).toEqual([]);

    await runtime.dispose();
  });

  it("invalidates tagged state-owned resources on entry and records the invalidation count", async () => {
    const runtimeProjectTag = createTag("runtime.project.tag");
    const invalidatedProject = flow.resource<
      [projectId: string],
      ProjectRecord,
      never,
      Effect.Effect<ProjectRecord>
    >({
      id: "runtime.project.invalidate",
      key: (projectId) => createKey("runtime-project-invalidate", projectId),
      lookup: (projectId) => Effect.succeed({ id: projectId, name: "Loaded" }),
      tags: () => [runtimeProjectTag],
    });
    const invalidateMachine = flow.machine<{}, { readonly type: "NOOP" }, "ready">({
      id: "runtime.actor.invalidate",
      initial: "ready",
      context: () => ({}),
      states: {
        ready: {
          invoke: [
            flow.observe(invalidatedProject.ref("project-1")),
            flow.invalidate(runtimeProjectTag),
          ],
        },
      },
    });
    const InvalidateModule = flow.module("RuntimeInvalidate", () => ({
      project: invalidatedProject,
    }));
    const app = flow.app({
      modules: [InvalidateModule],
    });
    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    runtime.resources.seedResources([
      {
        ref: invalidatedProject.ref("project-1"),
        value: { id: "project-1", name: "Seeded" },
      },
    ]);

    const actor = runtime.createActor(invalidateMachine);
    await actor.flush();

    expect(actor.snapshot().resources["runtime.project.invalidate"]).toMatchObject({
      status: "stale",
      freshness: "invalidated",
      value: { id: "project-1", name: "Seeded" },
    });
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "query:start",
          id: "runtime.project.invalidate",
          mode: "observe",
          parentState: "ready",
        }),
        expect.objectContaining({
          type: "resource:invalidate",
          id: "runtime.project.tag",
          count: 1,
          parentState: "ready",
        }),
      ]),
    );
    expect(actor.issues()).toEqual([]);

    await runtime.dispose();
  });

  it("installs default host-signal and trace services through App.layer", async () => {
    const app = flow.app({
      modules: [RuntimeModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
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

  it("mirrors runtime-owned machine receipts into TraceLog in event order", async () => {
    const actorMachine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "ADVANCE" }> | Readonly<{ readonly type: "UNKNOWN" }>,
      "idle" | "ready"
    >({
      id: "runtime.actor.trace",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "ready",
              guard: ({ context }) => context.count === 0,
              update: ({ context }) => ({ count: context.count + 1 }),
              actions: () => ({ type: "domain:advanced" }),
            },
          },
        },
        ready: {},
      },
    });

    const app = flow.app({
      modules: [RuntimeModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.createActor(actorMachine);
    actor.send({ type: "ADVANCE" });
    actor.send({ type: "UNKNOWN" });

    const entries = await runtime.runPromise(Effect.flatMap(TraceLog, (trace) => trace.entries));
    const advanceCorrelationId = entries.find(
      (entry) => entry.type === "machine:event" && entry.eventType === "ADVANCE",
    )?.correlationId;
    const unknownCorrelationId = entries.find(
      (entry) => entry.type === "machine:event" && entry.eventType === "UNKNOWN",
    )?.correlationId;

    expect(advanceCorrelationId).toEqual(expect.any(String));
    expect(unknownCorrelationId).toEqual(expect.any(String));
    expect(unknownCorrelationId).not.toBe(advanceCorrelationId);

    expect(entries).toEqual([
      {
        type: "actor:start",
        id: "runtime.actor.trace",
      },
      expect.objectContaining({
        type: "machine:event",
        id: "runtime.actor.trace",
        source: "machine",
        eventType: "ADVANCE",
        trigger: "event",
        step: 0,
        targetActorId: "runtime.actor.trace",
        correlationId: advanceCorrelationId,
      }),
      expect.objectContaining({
        type: "machine:guard",
        id: "runtime.actor.trace",
        source: "machine",
        eventType: "ADVANCE",
        index: 0,
        result: "pass",
        trigger: "event",
        step: 0,
        correlationId: advanceCorrelationId,
      }),
      expect.objectContaining({
        type: "machine:transition",
        id: "runtime.actor.trace",
        source: "machine",
        eventType: "ADVANCE",
        index: 0,
        from: "idle",
        to: "ready",
        trigger: "event",
        step: 0,
        correlationId: advanceCorrelationId,
      }),
      expect.objectContaining({
        type: "machine:update",
        id: "runtime.actor.trace",
        source: "machine",
        eventType: "ADVANCE",
        index: 0,
        trigger: "event",
        step: 0,
        correlationId: advanceCorrelationId,
      }),
      expect.objectContaining({
        type: "machine:action",
        id: "runtime.actor.trace",
        source: "machine",
        eventType: "ADVANCE",
        trigger: "event",
        step: 0,
        phase: "transition",
        index: 0,
        correlationId: advanceCorrelationId,
      }),
      expect.objectContaining({
        type: "domain:advanced",
        correlationId: advanceCorrelationId,
      }),
      expect.objectContaining({
        type: "machine:microstep",
        id: "runtime.actor.trace",
        source: "machine",
        eventType: "ADVANCE",
        trigger: "event",
        step: 0,
        index: 0,
        from: "idle",
        to: "ready",
        correlationId: advanceCorrelationId,
      }),
      expect.objectContaining({
        type: "machine:event",
        id: "runtime.actor.trace",
        source: "machine",
        eventType: "UNKNOWN",
        trigger: "event",
        step: 0,
        targetActorId: "runtime.actor.trace",
        correlationId: unknownCorrelationId,
      }),
      expect.objectContaining({
        type: "machine:no-transition",
        id: "runtime.actor.trace",
        source: "machine",
        eventType: "UNKNOWN",
        trigger: "event",
        step: 0,
        correlationId: unknownCorrelationId,
      }),
    ]);
  });

  it("mirrors always microstep receipts into TraceLog for runtime-owned actors", async () => {
    const actorMachine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "ADVANCE" }>,
      "idle" | "ready" | "done"
    >({
      id: "runtime.actor.always-trace",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "ready",
            },
          },
        },
        ready: {
          always: {
            target: "done",
            actions: () => ({ type: "domain:always-trace" }),
          },
        },
        done: {},
      },
    });

    const app = flow.app({
      modules: [RuntimeModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.createActor(actorMachine);
    actor.send({ type: "ADVANCE" });

    const entries = await runtime.runPromise(Effect.flatMap(TraceLog, (trace) => trace.entries));
    const correlationId = entries.find(
      (entry) => entry.type === "machine:event" && entry.eventType === "ADVANCE",
    )?.correlationId;

    expect(correlationId).toEqual(expect.any(String));

    expect(entries).toEqual([
      {
        type: "actor:start",
        id: "runtime.actor.always-trace",
      },
      expect.objectContaining({
        type: "machine:event",
        id: "runtime.actor.always-trace",
        source: "machine",
        eventType: "ADVANCE",
        trigger: "event",
        step: 0,
        targetActorId: "runtime.actor.always-trace",
        correlationId,
      }),
      expect.objectContaining({
        type: "machine:transition",
        id: "runtime.actor.always-trace",
        source: "machine",
        eventType: "ADVANCE",
        trigger: "event",
        step: 0,
        index: 0,
        from: "idle",
        to: "ready",
        correlationId,
      }),
      expect.objectContaining({
        type: "machine:microstep",
        id: "runtime.actor.always-trace",
        source: "machine",
        eventType: "ADVANCE",
        trigger: "event",
        step: 0,
        index: 0,
        from: "idle",
        to: "ready",
        correlationId,
      }),
      expect.objectContaining({
        type: "machine:transition",
        id: "runtime.actor.always-trace",
        source: "machine",
        eventType: "ADVANCE",
        trigger: "always",
        step: 1,
        index: 0,
        from: "ready",
        to: "done",
        correlationId,
      }),
      expect.objectContaining({
        type: "machine:action",
        id: "runtime.actor.always-trace",
        source: "machine",
        eventType: "ADVANCE",
        trigger: "always",
        step: 1,
        phase: "transition",
        index: 0,
        correlationId,
      }),
      expect.objectContaining({
        type: "domain:always-trace",
        correlationId,
      }),
      expect.objectContaining({
        type: "machine:microstep",
        id: "runtime.actor.always-trace",
        source: "machine",
        eventType: "ADVANCE",
        trigger: "always",
        step: 1,
        index: 0,
        from: "ready",
        to: "done",
        correlationId,
      }),
    ]);

    await runtime.dispose();
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
        subscribe: Effect.fn("TestHostSignalSource.subscribe")(
          (listener: (snapshot: typeof currentSignals) => void) =>
            Effect.sync(() => {
              subscribeCount += 1;
              notify = listener;

              return () => {
                unsubscribeCount += 1;
                notify = undefined;
              };
            }),
        ),
      }),
    );
    const notificationSchedulerLayer = NotificationScheduler.testLayer;
    const hostSignalsLayer = HostSignals.layer.pipe(Layer.provide(hostSignalSourceLayer));
    const resourceStoreLayer = ResourceStore.layer.pipe(
      Layer.provide(Layer.mergeAll(notificationSchedulerLayer, hostSignalsLayer)),
    );
    const inspectionLogLayer = InspectionLog.layer;
    const traceLogLayer = TraceLog.layer;
    const orchestratorLayer = OrchestratorSystem.layer.pipe(
      Layer.provide(Layer.mergeAll(resourceStoreLayer, inspectionLogLayer, traceLogLayer)),
    ) as Layer.Layer<OrchestratorSystem, never, never>;

    const runtime = flow.runtime(
      Layer.mergeAll(
        notificationSchedulerLayer,
        resourceStoreLayer,
        orchestratorLayer,
        inspectionLogLayer,
        traceLogLayer,
        hostSignalsLayer,
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
    const inspectionLogLayer = InspectionLog.layer;
    const traceLogLayer = TraceLog.layer;
    const orchestratorLayer = OrchestratorSystem.layer.pipe(
      Layer.provide(Layer.mergeAll(resourceStoreLayer, inspectionLogLayer, traceLogLayer)),
    ) as Layer.Layer<OrchestratorSystem, never, never>;

    const runtime = flow.runtime(
      Layer.mergeAll(
        NotificationScheduler.testLayer,
        resourceStoreLayer,
        orchestratorLayer,
        inspectionLogLayer,
        traceLogLayer,
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
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
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
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
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
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
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
