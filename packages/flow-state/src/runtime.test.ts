import { Cause, Effect, Exit, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { FlowDiagnostic } from "./shared/diagnostics.js";
import * as flow from "./core/api/flow-core.js";
import { createKey, createTag } from "./core/api/keys.js";
import { createRuntime } from "./runtime/contract-runtime.js";
import { withRequestRuntime } from "./server.js";
import {
  projectResource,
  type ProjectRecord,
  RuntimeModule,
} from "./testing/fixtures/runtime-test-fixtures.js";
import { HostSignalSource } from "./core/runtime/services/host-signal-source.js";
import { HostSignals } from "./core/runtime/services/host-signals.js";
import { InspectionLog } from "./core/runtime/services/inspection.js";
import { NotificationScheduler } from "./core/runtime/services/notification-scheduler.js";
import { OrchestratorSystem } from "./core/orchestrator/orchestrator-system.js";
import { ResourceStore } from "./core/runtime/services/resource-store.js";
import { FlowRuntimePolicy } from "./core/runtime/services/runtime-policy.js";
import { TraceLog } from "./core/runtime/services/trace.js";

describe("runtime resource and service contracts", () => {
  it("returns null for unknown runtime resource reads without creating a record", async () => {
    const runtime = flow.runtime(
      flow.app({ modules: [] }).layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );
    const ref = {
      kind: "resourceRef" as const,
      id: "runtime.unknown",
      key: createKey("runtime", "unknown"),
      params: ["runtime.unknown"] as const,
    } as ReturnType<typeof projectResource.ref>;

    expect(runtime.resources.inspect()).toEqual([]);
    expect(runtime.resources.get(ref)).toBeNull();
    expect(runtime.resources.inspect()).toEqual([]);

    await runtime.dispose();
  });

  it("surfaces runtime guard defects without mutating state or falling through", async () => {
    const cause = new Error("guard exploded");
    const fallbackActions: Array<string> = [];
    type GuardEvent = Readonly<{ readonly type: "SAVE" }>;
    const machine = flow.machine<
      { readonly count: number },
      GuardEvent,
      "idle" | "saving" | "fallback"
    >({
      id: "runtime.guard-defect",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            SAVE: [
              {
                target: "saving",
                guard: () => {
                  throw cause;
                },
              },
              {
                target: "fallback",
                actions: ({ event }) => {
                  fallbackActions.push(event.type);
                },
              },
            ],
          },
        },
        saving: {},
        fallback: {},
      },
    });

    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            flow.module("RuntimeGuardDefect", {
              machines: {
                actor: machine,
              },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );

    try {
      const actor = runtime.createActor(machine);
      const beforeReceipts = actor.receipts();
      let failure: unknown;

      try {
        actor.send({ type: "SAVE" });
      } catch (error) {
        failure = error;
      }

      expect(failure instanceof FlowDiagnostic).toBe(true);
      if (!(failure instanceof FlowDiagnostic)) {
        return;
      }

      expect(failure).toMatchObject({
        code: "FLOW-MACHINE-001",
        debug: {
          callback: "guard",
          eventType: "SAVE",
          machineId: "runtime.guard-defect",
          state: "idle",
          step: 0,
          trigger: "event",
        },
      });
      expect(failure.cause).toBe(cause);
      expect(actor.getSnapshot().value).toBe("idle");
      expect(actor.getSnapshot().context).toEqual({ count: 0 });
      expect(actor.receipts()).toEqual(beforeReceipts);
      expect(fallbackActions).toEqual([]);
    } finally {
      await runtime.dispose();
    }
  });

  it("patches absent and primitive runtime resources without object coercion", async () => {
    const counter = flow.resource<[], number>({
      id: "runtime.counter",
      key: () => createKey("runtime-counter"),
      lookup: () => Effect.succeed(0),
    });
    const runtime = flow.runtime(
      flow.app({ modules: [] }).layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );
    const ref = counter.ref();

    runtime.resources.patch(ref, (current) => (current ?? 0) + 1);
    expect(runtime.resources.get(ref)?.value).toBe(1);

    runtime.resources.patch(ref, (current) => (current ?? 0) + 1);
    expect(runtime.resources.get(ref)?.value).toBe(2);

    await runtime.dispose();
  });

  it("dehydrates a versioned boot payload and hydrates one client runtime without duplicate work", async () => {
    let childEntries = 0;

    const childMachine = flow.machine<{}, never, "idle">({
      id: "runtime.boot.child",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          entry: () => {
            childEntries += 1;
          },
        },
      },
    });

    const machine = flow.machine<
      { readonly draft: string },
      { readonly type: "START" } | { readonly type: "STOP" },
      "idle" | "running"
    >({
      id: "runtime.boot.machine",
      initial: "idle",
      context: () => ({ draft: "seed" }),
      states: {
        idle: {
          on: {
            START: {
              target: "running",
              update: () => ({ draft: "restored" }),
            },
          },
        },
        running: {
          invoke: flow.child({
            id: "runtime.boot.child",
            machine: childMachine,
          }),
          on: {
            STOP: "idle",
          },
        },
      },
    });
    const BootModule = flow.module("RuntimeBoot", {
      machines: { boot: machine },
    });
    const app = flow.app({
      modules: [RuntimeModule, BootModule],
    });
    const serverRuntime = flow.runtime(
      app.layer({
        store: flow.store.memory(),
        orchestrators: flow.orchestrators.live(),
      }),
    );
    const ref = projectResource.ref("project-1");

    serverRuntime.resources.seedResources([
      {
        ref,
        value: { id: "project-1", name: "Server seeded" },
      },
    ]);

    const actor = serverRuntime.createActor(machine, {
      id: "runtime.boot.actor",
    });
    actor.send({ type: "START" });
    await actor.flush();

    const childEntryCount = childEntries;
    const payload = serverRuntime.dehydrateBoot({
      actors: [actor],
    });
    const serializedPayload = JSON.parse(JSON.stringify(payload)) as typeof payload;

    expect(serializedPayload.version).toBe("flow-state/runtime-boot.v1");
    expect(serializedPayload.resources).toHaveLength(1);
    expect(serializedPayload.actors).toEqual([
      expect.objectContaining({
        id: "runtime.boot.actor",
        snapshot: expect.objectContaining({
          value: "running",
          context: { draft: "restored" },
        }),
      }),
    ]);

    await serverRuntime.dispose();

    const clientRuntime = flow.runtime(
      app.layer({
        store: flow.store.memory(),
        orchestrators: flow.orchestrators.live(),
      }),
    );

    const boot = clientRuntime.hydrateBoot(serializedPayload);
    expect(clientRuntime.resources.get(ref)).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Server seeded" },
    });

    const restored = clientRuntime.createActor(machine, {
      id: "runtime.boot.actor",
      snapshot: boot.actorSnapshot("runtime.boot.actor"),
    });

    expect(childEntries).toBe(childEntryCount);
    expect(restored.snapshot().value).toBe("running");
    expect(restored.snapshot().context).toEqual({ draft: "restored" });
    expect(restored.children()["runtime.boot.child"]).toMatchObject({
      status: "active",
      actorId: "runtime.boot.actor/runtime.boot.child",
    });

    restored.send({ type: "STOP" });
    await restored.flush();

    expect(restored.snapshot().value).toBe("idle");
    expect(restored.children()).toEqual({});

    await clientRuntime.dispose();
  });

  it("keeps request-owned runtimes isolated until a boot payload is hydrated explicitly", async () => {
    const app = flow.app({
      modules: [RuntimeModule],
    });
    const firstRuntime = flow.runtime(
      app.layer({
        store: flow.store.memory(),
        orchestrators: flow.orchestrators.live(),
      }),
    );
    const secondRuntime = flow.runtime(
      app.layer({
        store: flow.store.memory(),
        orchestrators: flow.orchestrators.live(),
      }),
    );
    const ref = projectResource.ref("project-1");

    firstRuntime.resources.seedResources([
      {
        ref,
        value: { id: "project-1", name: "First request" },
      },
    ]);

    expect(firstRuntime.resources.get(ref)?.value).toEqual({
      id: "project-1",
      name: "First request",
    });
    expect(secondRuntime.resources.get(ref)?.value).toBeUndefined();

    secondRuntime.hydrateBoot(firstRuntime.dehydrateBoot());
    expect(secondRuntime.resources.get(ref)?.value).toEqual({
      id: "project-1",
      name: "First request",
    });

    await secondRuntime.dispose();
    await firstRuntime.dispose();
  });

  it("creates and disposes a request-scoped runtime around one boot payload handoff", async () => {
    let requestReleased = false;
    let runningEntries = 0;

    const machine = flow.machine<
      { readonly draft: string },
      { readonly type: "START" },
      "idle" | "running"
    >({
      id: "runtime.request.boot.machine",
      initial: "idle",
      context: () => ({ draft: "seed" }),
      states: {
        idle: {
          on: {
            START: {
              target: "running",
              update: () => ({ draft: "restored" }),
            },
          },
        },
        running: {
          entry: () => {
            runningEntries += 1;
          },
        },
      },
    });
    const RequestBootModule = flow.module("RuntimeRequestBoot", {
      machines: { boot: machine },
    });
    const app = flow.app({
      modules: [RuntimeModule, RequestBootModule],
    });
    const requestLifecycleLayer = Layer.effectDiscard(
      Effect.acquireRelease(Effect.void, () =>
        Effect.sync(() => {
          requestReleased = true;
        }),
      ),
    );
    const ref = projectResource.ref("project-1");

    const payload = await withRequestRuntime(
      app.layer({
        store: flow.store.memory(),
        orchestrators: flow.orchestrators.live(),
        services: [requestLifecycleLayer],
      }),
      async (runtime) => {
        runtime.resources.seedResources([
          {
            ref,
            value: { id: "project-1", name: "Request scoped" },
          },
        ]);

        const actor = runtime.createActor(machine, {
          id: "runtime.request.boot.actor",
        });
        actor.send({ type: "START" });
        await actor.flush();

        return runtime.dehydrateBoot({
          actors: [actor],
        });
      },
    );

    expect(requestReleased).toBe(true);
    expect(runningEntries).toBe(1);

    const clientRuntime = flow.runtime(
      app.layer({
        store: flow.store.memory(),
        orchestrators: flow.orchestrators.live(),
      }),
    );

    const boot = clientRuntime.hydrateBoot(payload);
    const restored = clientRuntime.createActor(machine, {
      id: "runtime.request.boot.actor",
      snapshot: boot.actorSnapshot("runtime.request.boot.actor"),
    });

    expect(restored.snapshot()).toMatchObject({
      value: "running",
      context: { draft: "restored" },
    });
    expect(clientRuntime.resources.get(ref)).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Request scoped" },
    });
    expect(runningEntries).toBe(1);

    await clientRuntime.dispose();
  });

  it("preloads only actor-owned resource work into a request-scoped boot payload", async () => {
    const preloadTag = createTag("runtime.preload.tag");
    const lookupCalls: string[] = [];
    const makePreloadResource = (id: string, tagged = false) =>
      flow.resource<[projectId: string], ProjectRecord, never, Effect.Effect<ProjectRecord>>({
        id,
        key: (projectId) => createKey(id, projectId),
        lookup: (projectId) =>
          Effect.sync(() => {
            lookupCalls.push(projectId);
            return { id: projectId, name: `Loaded ${projectId}` };
          }),
        tags: () => (tagged ? [preloadTag] : []),
      });
    const ensuredProject = makePreloadResource("runtime.preload.ensure");
    const observedProject = makePreloadResource("runtime.preload.observe");
    const refreshedProject = makePreloadResource("runtime.preload.refresh");
    const invalidatedProject = makePreloadResource("runtime.preload.invalidate", true);
    const preloadMachine = flow.machine<{}, { readonly type: "NOOP" }, "ready">({
      id: "runtime.request.preload.machine",
      initial: "ready",
      context: () => ({}),
      states: {
        ready: {
          invoke: [
            flow.ensure(ensuredProject.ref("ensure")),
            flow.observe(observedProject.ref("observe")),
            flow.refresh(refreshedProject.ref("refresh")),
            flow.observe(invalidatedProject.ref("invalidate")),
            flow.invalidate(preloadTag),
          ],
        },
      },
    });
    const PreloadModule = flow.module("RuntimePreload", {
      ensuredProject,
      observedProject,
      refreshedProject,
      invalidatedProject,
      machines: { preload: preloadMachine },
    });
    const app = flow.app({
      modules: [PreloadModule],
    });

    const payload = await withRequestRuntime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
      async (runtime) => {
        runtime.resources.seedResources([
          {
            ref: refreshedProject.ref("refresh"),
            value: { id: "refresh", name: "Seeded refresh" },
          },
          {
            ref: invalidatedProject.ref("invalidate"),
            value: { id: "invalidate", name: "Seeded invalidation" },
          },
        ]);

        const actor = runtime.createActor(preloadMachine, {
          id: "runtime.request.preload.actor",
        });
        await actor.flush();

        expect(actor.snapshot().resources["runtime.preload.ensure"]).toMatchObject({
          freshness: "fresh",
          value: { id: "ensure", name: "Loaded ensure" },
        });
        expect(actor.snapshot().resources["runtime.preload.observe"]).toMatchObject({
          freshness: "fresh",
          value: { id: "observe", name: "Loaded observe" },
        });
        expect(actor.snapshot().resources["runtime.preload.refresh"]).toMatchObject({
          freshness: "fresh",
          previousValue: { id: "refresh", name: "Seeded refresh" },
          value: { id: "refresh", name: "Loaded refresh" },
        });
        expect(actor.snapshot().resources["runtime.preload.invalidate"]).toMatchObject({
          freshness: "invalidated",
          value: { id: "invalidate", name: "Seeded invalidation" },
        });
        expect(actor.receipts()).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ mode: "ensure", type: "resource:start" }),
            expect.objectContaining({ mode: "observe", type: "resource:start" }),
            expect.objectContaining({ mode: "refresh", type: "resource:start" }),
            expect.objectContaining({
              count: 1,
              id: "runtime.preload.tag",
              type: "resource:invalidate",
            }),
          ]),
        );

        return runtime.dehydrateBoot({
          actors: [actor],
        });
      },
    );

    expect([...lookupCalls].sort()).toEqual(["ensure", "observe", "refresh"]);
    expect(payload.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ref: ensuredProject.ref("ensure"),
          snapshot: expect.objectContaining({
            freshness: "fresh",
            value: { id: "ensure", name: "Loaded ensure" },
          }),
        }),
        expect.objectContaining({
          ref: observedProject.ref("observe"),
          snapshot: expect.objectContaining({
            freshness: "fresh",
            value: { id: "observe", name: "Loaded observe" },
          }),
        }),
        expect.objectContaining({
          ref: refreshedProject.ref("refresh"),
          snapshot: expect.objectContaining({
            freshness: "fresh",
            previousValue: { id: "refresh", name: "Seeded refresh" },
            value: { id: "refresh", name: "Loaded refresh" },
          }),
        }),
        expect.objectContaining({
          ref: invalidatedProject.ref("invalidate"),
          snapshot: expect.objectContaining({
            freshness: "invalidated",
            value: { id: "invalidate", name: "Seeded invalidation" },
          }),
        }),
      ]),
    );
    expect(payload.actors[0]).toMatchObject({
      id: "runtime.request.preload.actor",
      snapshot: expect.objectContaining({
        resources: expect.objectContaining({
          "runtime.preload.invalidate": expect.objectContaining({
            freshness: "invalidated",
          }),
        }),
      }),
    });
  });

  it("rejects unsupported boot payload versions with a tagged runtime diagnostic", async () => {
    const app = flow.app({
      modules: [RuntimeModule],
    });
    const runtime = flow.runtime(
      app.layer({
        store: flow.store.memory(),
        orchestrators: flow.orchestrators.live(),
      }),
    );
    const ref = projectResource.ref("project-1");

    let failure: unknown;

    try {
      runtime.hydrateBoot({
        version: "flow-state/runtime-boot.v999",
        resources: [
          {
            ref,
            snapshot: {
              value: { id: "project-1", name: "Invalid payload" },
              updatedAt: 1,
            },
          },
        ],
        actors: [],
      } as unknown as Parameters<typeof runtime.hydrateBoot>[0]);
    } catch (error) {
      failure = error;
    }

    expect(failure instanceof FlowDiagnostic).toBe(true);
    expect(failure).toMatchObject({
      code: "FLOW-RUNTIME-001",
      debug: {
        expectedVersion: "flow-state/runtime-boot.v1",
        receivedVersion: "flow-state/runtime-boot.v999",
      },
    });
    expect(runtime.resources.inspect()).toEqual([]);

    await runtime.dispose();
  });

  it("dehydrates and hydrates public resource snapshots with newer-data-wins merge rules", async () => {
    const app = flow.app({
      modules: [RuntimeModule],
    });
    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );
    const ref = projectResource.ref("project-1");

    runtime.resources.seedResources([
      {
        ref,
        value: { id: "project-1", name: "Seeded" },
      },
    ]);

    const dehydrated = runtime.resources.dehydrate();
    expect(dehydrated).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(dehydrated))).toEqual(dehydrated);
    expect(dehydrated[0]).toMatchObject({
      ref,
      snapshot: {
        id: "runtime.project",
        value: { id: "project-1", name: "Seeded" },
      },
    });

    const restoredRuntime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    restoredRuntime.resources.hydrate(dehydrated);
    expect(restoredRuntime.resources.get(ref)).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Seeded" },
    });

    restoredRuntime.resources.hydrate([
      {
        ref,
        snapshot: {
          value: { id: "project-1", name: "Older" },
          updatedAt: (dehydrated[0]?.snapshot.updatedAt ?? 0) - 1,
        },
      },
    ]);
    expect(restoredRuntime.resources.get(ref)?.value).toEqual({
      id: "project-1",
      name: "Seeded",
    });

    restoredRuntime.resources.hydrate([
      {
        ref,
        snapshot: {
          value: { id: "project-1", name: "Hydrated newer" },
          updatedAt: (dehydrated[0]?.snapshot.updatedAt ?? 0) + 1,
        },
      },
    ]);
    expect(restoredRuntime.resources.get(ref)?.value).toEqual({
      id: "project-1",
      name: "Hydrated newer",
    });

    await restoredRuntime.dispose();
    await runtime.dispose();
  });

  it("exposes public runtime resource inspection without per-ref wiring", async () => {
    const app = flow.app({
      modules: [RuntimeModule],
    });
    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );
    const firstRef = projectResource.ref("project-1");
    const secondRef = projectResource.ref("project-2");

    runtime.resources.seedResources([
      {
        ref: firstRef,
        value: { id: "project-1", name: "Atlas" },
      },
      {
        ref: secondRef,
        value: { id: "project-2", name: "Borealis" },
      },
    ]);
    runtime.resources.patch(firstRef, (current) => ({
      id: current?.id ?? "project-1",
      name: "Atlas v2",
    }));

    const inspected = runtime.resources.inspect();

    expect(inspected).toHaveLength(2);
    expect(inspected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "runtime.project",
          value: { id: "project-1", name: "Atlas v2" },
          previousValue: { id: "project-1", name: "Atlas" },
          freshness: "fresh",
        }),
        expect.objectContaining({
          id: "runtime.project",
          value: { id: "project-2", name: "Borealis" },
          freshness: "fresh",
        }),
      ]),
    );

    await runtime.dispose();
  });

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
    const RefreshModule = flow.module("RuntimeRefresh", {
      project: refreshedProject,
      machines: { actor: refreshMachine },
    });
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
          type: "resource:start",
          id: "runtime.project.refresh",
          mode: "refresh",
          parentState: "ready",
        }),
        expect.objectContaining({
          type: "resource:success",
          id: "runtime.project.refresh",
          mode: "refresh",
          parentState: "ready",
        }),
      ]),
    );
    expect(actor.issues()).toEqual([]);

    await runtime.dispose();
  });

  it("records refresh failure lifecycle receipts when cached data stays visible", async () => {
    const refreshedProject = flow.resource<
      [projectId: string],
      ProjectRecord,
      "denied",
      Effect.Effect<ProjectRecord, "denied">
    >({
      id: "runtime.project.refresh.failure",
      key: (projectId) => createKey("runtime-project-refresh-failure", projectId),
      lookup: () => Effect.fail("denied" as const),
    });
    const refreshMachine = flow.machine<{}, { readonly type: "NOOP" }, "ready">({
      id: "runtime.actor.refresh.failure",
      initial: "ready",
      context: () => ({}),
      states: {
        ready: {
          invoke: flow.refresh(refreshedProject.ref("project-1")),
        },
      },
    });
    const RefreshModule = flow.module("RuntimeRefreshFailure", {
      project: refreshedProject,
      machines: { actor: refreshMachine },
    });
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
    await actor.flush();

    expect(actor.snapshot().resources["runtime.project.refresh.failure"]).toMatchObject({
      status: "stale",
      freshness: "stale",
      value: { id: "project-1", name: "Seeded" },
      error: "denied",
    });
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "resource:start",
          id: "runtime.project.refresh.failure",
          mode: "refresh",
          parentState: "ready",
        }),
        expect.objectContaining({
          type: "resource:failure",
          id: "runtime.project.refresh.failure",
          mode: "refresh",
          parentState: "ready",
          freshness: "stale",
        }),
        expect.objectContaining({
          type: "resource:freshness",
          id: "runtime.project.refresh.failure",
          from: "fresh",
          to: "stale",
          reason: "lookup-failure",
          parentState: "ready",
        }),
      ]),
    );
    expect(actor.issues()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "failure",
          source: "resource",
          id: "runtime.project.refresh.failure",
        }),
      ]),
    );

    await runtime.dispose();
  });

  it("records refresh defect lifecycle receipts without collapsing them into typed failure", async () => {
    const defectingProject = flow.resource<
      [projectId: string],
      ProjectRecord,
      never,
      Effect.Effect<ProjectRecord>
    >({
      id: "runtime.project.refresh.defect",
      key: (projectId) => createKey("runtime-project-refresh-defect", projectId),
      lookup: () => Effect.die("boom"),
    });
    const refreshMachine = flow.machine<{}, { readonly type: "NOOP" }, "ready">({
      id: "runtime.actor.refresh.defect",
      initial: "ready",
      context: () => ({}),
      states: {
        ready: {
          invoke: flow.refresh(defectingProject.ref("project-1")),
        },
      },
    });
    const RefreshModule = flow.module("RuntimeRefreshDefect", {
      project: defectingProject,
      machines: { actor: refreshMachine },
    });
    const runtime = flow.runtime(
      flow
        .app({
          modules: [RefreshModule],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );

    runtime.resources.seedResources([
      {
        ref: defectingProject.ref("project-1"),
        value: { id: "project-1", name: "Seeded" },
      },
    ]);

    const actor = runtime.createActor(refreshMachine);
    await actor.flush();

    expect(actor.snapshot().resources["runtime.project.refresh.defect"]).toMatchObject({
      status: "stale",
      freshness: "stale",
      value: { id: "project-1", name: "Seeded" },
    });
    expect(
      Object.prototype.hasOwnProperty.call(
        actor.snapshot().resources["runtime.project.refresh.defect"],
        "error",
      ),
    ).toBe(false);
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "resource:start",
          id: "runtime.project.refresh.defect",
          mode: "refresh",
          parentState: "ready",
        }),
        expect.objectContaining({
          type: "resource:defect",
          id: "runtime.project.refresh.defect",
          mode: "refresh",
          parentState: "ready",
          freshness: "stale",
        }),
        expect.objectContaining({
          type: "resource:freshness",
          id: "runtime.project.refresh.defect",
          from: "fresh",
          to: "stale",
          reason: "lookup-failure",
          parentState: "ready",
        }),
      ]),
    );
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "runtime.project.refresh.defect" && receipt.type === "resource:failure",
        ),
    ).toHaveLength(0);
    expect(actor.issues()).toEqual([
      expect.objectContaining({
        kind: "defect",
        source: "resource",
        id: "runtime.project.refresh.defect",
      }),
    ]);

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
    const EnsureModule = flow.module("RuntimeEnsure", {
      project: ensuredProject,
      machines: { actor: ensureMachine },
    });
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
          type: "resource:start",
          id: "runtime.project.ensure",
          mode: "ensure",
          parentState: "ready",
        }),
      ]),
    );
    expect(actor.issues()).toEqual([]);

    await runtime.dispose();
  });

  it("records an interrupt issue and receipt when a state exit cancels an in-flight resource lookup", async () => {
    let interrupted = 0;
    let resolveLookup: ((value: ProjectRecord) => void) | undefined;
    let lookupStarted: (() => void) | undefined;
    const lookupStartedPromise = new Promise<void>((resolve) => {
      lookupStarted = resolve;
    });

    const interruptibleProject = flow.resource<
      [projectId: string],
      ProjectRecord,
      never,
      Effect.Effect<ProjectRecord>
    >({
      id: "runtime.project.interrupt",
      key: (projectId) => createKey("runtime-project-interrupt", projectId),
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
    const interruptMachine = flow.machine<
      {},
      { readonly type: "START" } | { readonly type: "STOP" },
      "idle" | "loading"
    >({
      id: "runtime.actor.resource.interrupt",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            START: "loading",
          },
        },
        loading: {
          invoke: flow.ensure(interruptibleProject.ref("project-1")),
          on: {
            STOP: "idle",
          },
        },
      },
    });
    const InterruptModule = flow.module("RuntimeInterruptResource", {
      project: interruptibleProject,
      machines: { actor: interruptMachine },
    });
    const runtime = flow.runtime(
      flow
        .app({
          modules: [InterruptModule],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );

    const actor = runtime.createActor(interruptMachine);
    actor.send({ type: "START" });

    await lookupStartedPromise;
    expect(actor.snapshot().value).toBe("loading");

    actor.send({ type: "STOP" });
    await actor.flush();

    expect(interrupted).toBe(1);
    expect(actor.snapshot().value).toBe("idle");
    expect(actor.snapshot().resources["runtime.project.interrupt"]).toMatchObject({
      status: "idle",
      availability: "empty",
      activity: "idle",
      freshness: "stale",
    });
    expect(actor.issues()).toEqual([
      expect.objectContaining({
        kind: "interrupt",
        source: "resource",
        id: "runtime.project.interrupt",
      }),
    ]);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "runtime.project.interrupt" && receipt.type === "resource:interrupt",
        ),
    ).toHaveLength(1);

    const receiptsAfterInterrupt = actor.receipts().length;
    resolveLookup?.({ id: "project-1", name: "late result" });
    await Promise.resolve();
    await Promise.resolve();
    await actor.flush();

    expect(actor.receipts()).toHaveLength(receiptsAfterInterrupt);
    expect(actor.snapshot().resources["runtime.project.interrupt"]).toMatchObject({
      status: "idle",
      availability: "empty",
      activity: "idle",
      freshness: "stale",
    });

    await runtime.dispose();
  });

  it("records an initial ensure failure as a failed resource snapshot without a contradictory value", async () => {
    const failingProject = flow.resource<
      [projectId: string],
      ProjectRecord,
      "missing",
      Effect.Effect<ProjectRecord, "missing">
    >({
      id: "runtime.project.ensure.failure",
      key: (projectId) => createKey("runtime-project-ensure-failure", projectId),
      lookup: () => Effect.fail("missing" as const),
    });
    const ensureMachine = flow.machine<{}, { readonly type: "NOOP" }, "ready">({
      id: "runtime.actor.ensure.failure",
      initial: "ready",
      context: () => ({}),
      states: {
        ready: {
          invoke: flow.ensure(failingProject.ref("project-1")),
        },
      },
    });
    const EnsureModule = flow.module("RuntimeEnsureFailure", {
      project: failingProject,
      machines: { actor: ensureMachine },
    });
    const runtime = flow.runtime(
      flow
        .app({
          modules: [EnsureModule],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );

    const actor = runtime.createActor(ensureMachine);
    await actor.flush();

    expect(actor.snapshot().resources["runtime.project.ensure.failure"]).toMatchObject({
      status: "failure",
      availability: "failure",
      activity: "idle",
      freshness: "stale",
      error: "missing",
      isPlaceholderData: false,
    });
    expect(
      Object.prototype.hasOwnProperty.call(
        actor.snapshot().resources["runtime.project.ensure.failure"],
        "value",
      ),
    ).toBe(false);
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "resource:start",
          id: "runtime.project.ensure.failure",
          mode: "ensure",
          parentState: "ready",
        }),
        expect.objectContaining({
          type: "resource:failure",
          id: "runtime.project.ensure.failure",
          mode: "ensure",
          parentState: "ready",
          status: "failure",
          availability: "failure",
          freshness: "stale",
        }),
        expect.objectContaining({
          type: "resource:freshness",
          id: "runtime.project.ensure.failure",
          to: "stale",
          reason: "lookup-failure",
          parentState: "ready",
        }),
      ]),
    );
    expect(actor.issues()).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "resource",
        id: "runtime.project.ensure.failure",
        error: "missing",
      }),
    ]);

    await runtime.dispose();
  });

  it("retries a state-owned ensure after re-entry and clears the prior failure issue on success", async () => {
    let attempt = 0;
    const retryingProject = flow.resource<
      [projectId: string],
      ProjectRecord,
      "missing",
      Effect.Effect<ProjectRecord, "missing">
    >({
      id: "runtime.project.ensure.retry",
      key: (projectId) => createKey("runtime-project-ensure-retry", projectId),
      lookup: (projectId) =>
        Effect.sync(() => {
          attempt += 1;
          if (attempt === 1) {
            return Effect.fail("missing" as const);
          }

          return Effect.succeed({ id: projectId, name: "Loaded on retry" });
        }).pipe(Effect.flatten),
    });
    const retryMachine = flow.machine<
      {},
      { readonly type: "START" } | { readonly type: "RESET" },
      "idle" | "loading"
    >({
      id: "runtime.actor.ensure.retry",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            START: "loading",
          },
        },
        loading: {
          invoke: flow.ensure(retryingProject.ref("project-1")),
          on: {
            RESET: "idle",
          },
        },
      },
    });
    const RetryModule = flow.module("RuntimeEnsureRetry", {
      project: retryingProject,
      machines: { actor: retryMachine },
    });
    const runtime = flow.runtime(
      flow
        .app({
          modules: [RetryModule],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );

    const actor = runtime.createActor(retryMachine);
    actor.send({ type: "START" });
    await actor.flush();

    expect(actor.snapshot().resources["runtime.project.ensure.retry"]).toMatchObject({
      status: "failure",
      availability: "failure",
      activity: "idle",
      freshness: "stale",
      error: "missing",
    });
    expect(actor.issues()).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "resource",
        id: "runtime.project.ensure.retry",
        error: "missing",
      }),
    ]);

    actor.send({ type: "RESET" });
    actor.send({ type: "START" });
    await actor.flush();

    expect(attempt).toBe(2);
    expect(actor.snapshot().resources["runtime.project.ensure.retry"]).toMatchObject({
      status: "success",
      availability: "value",
      activity: "idle",
      freshness: "fresh",
      value: { id: "project-1", name: "Loaded on retry" },
    });
    expect(actor.issues()).toEqual([]);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "runtime.project.ensure.retry" && receipt.type === "resource:start",
        ),
    ).toHaveLength(2);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "runtime.project.ensure.retry" && receipt.type === "resource:failure",
        ),
    ).toHaveLength(1);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "runtime.project.ensure.retry" && receipt.type === "resource:success",
        ),
    ).toHaveLength(1);

    await runtime.dispose();
  });

  it("keeps same-descriptor actor-owned resource instances separate without raw param keys", async () => {
    const ensureCalls: string[] = [];
    const project = flow.resource<
      [projectId: string],
      ProjectRecord,
      never,
      Effect.Effect<ProjectRecord>
    >({
      id: "runtime.project.same-descriptor",
      key: (projectId) => createKey("runtime-project-same-descriptor", projectId),
      lookup: (projectId) =>
        Effect.sync(() => {
          ensureCalls.push(projectId);
          return { id: projectId, name: `Loaded ${projectId}` };
        }),
    });
    const machine = flow.machine<{}, { readonly type: "NOOP" }, "ready">({
      id: "runtime.actor.same-descriptor-resources",
      initial: "ready",
      context: () => ({}),
      states: {
        ready: {
          invoke: [flow.ensure(project.ref("first")), flow.ensure(project.ref("second"))],
        },
      },
    });
    const RuntimeSameDescriptor = flow.module("RuntimeSameDescriptor", {
      project,
      machines: { actor: machine },
    });
    const runtime = flow.runtime(
      flow
        .app({
          modules: [RuntimeSameDescriptor],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );

    const actor = runtime.createActor(machine);
    await actor.flush();

    expect([...ensureCalls].sort()).toEqual(["first", "second"]);
    expect(Object.keys(actor.snapshot().resources).sort()).toEqual(["resource:1", "resource:2"]);
    expect(Object.keys(actor.snapshot().resources).join("|")).not.toContain("first");
    expect(Object.keys(actor.snapshot().resources).join("|")).not.toContain("second");
    expect(Object.values(actor.snapshot().resources)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "runtime.project.same-descriptor",
          value: { id: "first", name: "Loaded first" },
        }),
        expect.objectContaining({
          id: "runtime.project.same-descriptor",
          value: { id: "second", name: "Loaded second" },
        }),
      ]),
    );

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
    const PatchModule = flow.module("RuntimePatch", {
      project: patchedProject,
      machines: { actor: patchMachine },
    });
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

  it("uses one ResourceStore owner across public runtime handles, effects, and actor-owned work", async () => {
    const sharedProject = flow.resource<
      [projectId: string],
      ProjectRecord,
      never,
      Effect.Effect<ProjectRecord>
    >({
      id: "runtime.shared-owner.project",
      key: (projectId) => createKey("runtime-shared-owner-project", projectId),
      lookup: (projectId) => Effect.succeed({ id: projectId, name: "Loaded" }),
    });
    const patchMachine = flow.machine<{}, never, "ready">({
      id: "runtime.shared-owner.patch-machine",
      initial: "ready",
      context: () => ({}),
      states: {
        ready: {
          invoke: flow.patch(sharedProject.ref("project-1"), { name: "Patched by actor" }),
        },
      },
    });
    const SharedOwnerModule = flow.module("RuntimeSharedOwner", {
      project: sharedProject,
      machines: {
        actor: patchMachine,
      },
    });
    const runtime = flow.runtime(
      flow
        .app({
          modules: [SharedOwnerModule],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );
    const ref = sharedProject.ref("project-1");

    try {
      runtime.resources.seedResources([
        {
          ref,
          value: { id: "project-1", name: "Seeded" },
        },
      ]);

      const seededViaService = await runtime.runPromise(
        Effect.flatMap(ResourceStore, (store) => store.get(ref)),
      );
      expect(seededViaService?.value).toEqual({ id: "project-1", name: "Seeded" });

      runtime.createActor(patchMachine);

      expect(runtime.resources.get(ref)?.value).toEqual({
        id: "project-1",
        name: "Patched by actor",
      });
      const patchedViaService = await runtime.runPromise(
        Effect.flatMap(ResourceStore, (store) => store.get(ref)),
      );
      expect(patchedViaService?.value).toEqual({
        id: "project-1",
        name: "Patched by actor",
      });
      expect(runtime.resources.inspect().map((snapshot) => snapshot.id)).toEqual([
        "runtime.shared-owner.project",
      ]);
    } finally {
      await runtime.dispose();
    }
  });

  it("uses one OrchestratorSystem registry across public runtime handles and effects", async () => {
    const machine = flow.machine<{ readonly steps: number }, { readonly type: "STEP" }, "idle">({
      id: "runtime.shared-owner.actor-machine",
      initial: "idle",
      context: () => ({ steps: 0 }),
      states: {
        idle: {
          on: {
            STEP: {
              update: ({ context }) => ({ steps: context.steps + 1 }),
            },
          },
        },
      },
    });
    const runtime = createRuntime();

    try {
      const publicActor = runtime.createActor(machine, {
        id: "runtime.shared-owner.public-actor",
      });
      expect(runtime.orchestrators.get(publicActor.id)).toBe(publicActor);
      const serviceRead = await runtime.runPromise(
        Effect.flatMap(OrchestratorSystem, (system) => system.get(publicActor.id)),
      );
      expect(serviceRead).toBe(publicActor);

      const serviceActor = await runtime.runPromise(
        Effect.flatMap(OrchestratorSystem, (system) =>
          system.start(machine, { id: "runtime.shared-owner.service-actor" }),
        ),
      );
      expect(runtime.orchestrators.get(serviceActor.id)).toBe(serviceActor);

      await runtime.orchestrators.stop(publicActor.id);
      expect(runtime.orchestrators.get(publicActor.id)).toBeNull();
      expect(
        await runtime.runPromise(
          Effect.flatMap(OrchestratorSystem, (system) => system.get(publicActor.id)),
        ),
      ).toBeNull();
      expect(runtime.orchestrators.get(serviceActor.id)).toBe(serviceActor);
    } finally {
      await runtime.dispose();
    }
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
    const InvalidateModule = flow.module("RuntimeInvalidate", {
      project: invalidatedProject,
      machines: { actor: invalidateMachine },
    });
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
          type: "resource:start",
          id: "runtime.project.invalidate",
          mode: "observe",
          parentState: "ready",
        }),
        expect.objectContaining({
          type: "resource:invalidate",
          id: "runtime.project.tag",
          count: 1,
          reason: "command",
          parentState: "ready",
        }),
        expect.objectContaining({
          type: "resource:freshness",
          id: "runtime.project.invalidate",
          from: "fresh",
          to: "invalidated",
          reason: "invalidate:command",
          parentState: "ready",
        }),
      ]),
    );
    expect(actor.issues()).toEqual([]);

    await runtime.dispose();
  });

  it("records transaction-driven invalidation reasons on resource lifecycle receipts", async () => {
    const runtimeTransactionTag = createTag("runtime.transaction.invalidate.tag");
    const invalidatedProject = flow.resource<
      [projectId: string],
      ProjectRecord,
      never,
      Effect.Effect<ProjectRecord>
    >({
      id: "runtime.project.transaction.invalidate",
      key: (projectId) => createKey("runtime-project-transaction-invalidate", projectId),
      lookup: (projectId) => Effect.succeed({ id: projectId, name: "Loaded" }),
      tags: () => [runtimeTransactionTag],
    });
    const saveProject = flow.transaction<{ readonly id: string }, Readonly<{ readonly ok: true }>>({
      id: "runtime.transaction.invalidate",
      params: () => ({ id: "project-1" }),
      invalidates: () => [runtimeTransactionTag],
      commit: () => Effect.succeed({ ok: true as const }),
    });
    const invalidateMachine = flow.machine<{}, { readonly type: "NOOP" }, "ready">({
      id: "runtime.actor.transaction.invalidate",
      initial: "ready",
      context: () => ({}),
      states: {
        ready: {
          invoke: [flow.observe(invalidatedProject.ref("project-1")), flow.run(saveProject)],
        },
      },
    });
    const InvalidateModule = flow.module("RuntimeTransactionInvalidate", {
      project: invalidatedProject,
      saveProject,
      machines: { actor: invalidateMachine },
    });
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

    expect(actor.snapshot().resources["runtime.project.transaction.invalidate"]).toMatchObject({
      status: "stale",
      freshness: "invalidated",
      value: { id: "project-1", name: "Seeded" },
    });
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "resource:invalidate",
          id: "runtime.transaction.invalidate.tag",
          count: 1,
          reason: "transaction",
          parentState: "ready",
        }),
        expect.objectContaining({
          type: "resource:freshness",
          id: "runtime.project.transaction.invalidate",
          from: "fresh",
          to: "invalidated",
          reason: "invalidate:transaction",
          parentState: "ready",
        }),
      ]),
    );
    expect(actor.issues()).toEqual([]);

    await runtime.dispose();
  });

  it("records placeholder usage and fetch success for ensured resources that resolve after loading", async () => {
    let resolveLookup: ((value: ProjectRecord) => void) | undefined;

    const placeholderProject = flow.resource<
      [projectId: string],
      ProjectRecord,
      never,
      Effect.Effect<ProjectRecord>
    >({
      id: "runtime.project.placeholder",
      key: (projectId) => createKey("runtime-project-placeholder", projectId),
      lookup: (projectId) =>
        Effect.callback<ProjectRecord>((resume) => {
          resolveLookup = (value) => {
            resume(Effect.succeed(value));
          };

          return Effect.void;
        }).pipe(
          Effect.map((project) => ({
            ...project,
            id: projectId,
          })),
        ),
      placeholder: (projectId) => ({
        id: projectId,
        name: "Loading project",
      }),
    });
    const placeholderMachine = flow.machine<{}, { readonly type: "NOOP" }, "ready">({
      id: "runtime.actor.placeholder",
      initial: "ready",
      context: () => ({}),
      states: {
        ready: {
          invoke: flow.ensure(placeholderProject.ref("project-1")),
        },
      },
    });
    const PlaceholderModule = flow.module("RuntimePlaceholder", {
      project: placeholderProject,
      machines: { actor: placeholderMachine },
    });
    const app = flow.app({
      modules: [PlaceholderModule],
    });
    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.createActor(placeholderMachine);

    expect(actor.snapshot().resources["runtime.project.placeholder"]).toMatchObject({
      status: "success",
      availability: "value",
      value: { id: "project-1", name: "Loading project" },
      placeholder: { id: "project-1", name: "Loading project" },
      isPlaceholderData: true,
    });
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "resource:start",
          id: "runtime.project.placeholder",
          mode: "ensure",
          parentState: "ready",
        }),
        expect.objectContaining({
          type: "resource:placeholder",
          id: "runtime.project.placeholder",
          mode: "ensure",
          parentState: "ready",
        }),
      ]),
    );

    resolveLookup?.({ id: "project-1", name: "Loaded project" });
    await actor.flush();

    expect(actor.snapshot().resources["runtime.project.placeholder"]).toMatchObject({
      status: "success",
      freshness: "fresh",
      value: { id: "project-1", name: "Loaded project" },
      placeholder: { id: "project-1", name: "Loading project" },
      isPlaceholderData: false,
    });
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "resource:success",
          id: "runtime.project.placeholder",
          mode: "ensure",
          parentState: "ready",
          status: "success",
          availability: "value",
          freshness: "fresh",
        }),
      ]),
    );
    expect(actor.issues()).toEqual([]);

    await runtime.dispose();
  });

  it("surfaces paused and resumed actor-owned observe snapshots across offline reconnect", async () => {
    let currentSignals = {
      focused: true,
      online: false,
    };
    const listeners = new Set<(snapshot: typeof currentSignals) => void>();
    let resolveLookup: ((value: ProjectRecord) => void) | undefined;
    let lookupStarted: (() => void) | undefined;
    const lookupStartedPromise = new Promise<void>((resolve) => {
      lookupStarted = resolve;
    });
    const observeProject = flow.resource<
      [projectId: string],
      ProjectRecord,
      never,
      Effect.Effect<ProjectRecord>
    >({
      id: "runtime.project.observe.paused",
      key: (projectId) => createKey("runtime-project-observe-paused", projectId),
      lookup: (projectId) =>
        Effect.callback<ProjectRecord>((resume) => {
          lookupStarted?.();
          resolveLookup = (value) => {
            resume(Effect.succeed(value));
          };

          return Effect.void;
        }).pipe(
          Effect.map((project) => ({
            ...project,
            id: projectId,
          })),
        ),
      placeholder: (projectId) => ({
        id: projectId,
        name: "Loading project",
      }),
    });
    const observeMachine = flow.machine<{}, { readonly type: "NOOP" }, "ready">({
      id: "runtime.actor.observe.paused",
      initial: "ready",
      context: () => ({}),
      states: {
        ready: {
          invoke: flow.observe(observeProject.ref("project-1")),
        },
      },
    });
    const ObserveModule = flow.module("RuntimeObservePaused", {
      project: observeProject,
      machines: { actor: observeMachine },
    });
    const customHostSignalsLayer = Layer.succeed(
      HostSignals,
      HostSignals.of({
        snapshot: Effect.sync(() => currentSignals),
        setFocused: (focused) =>
          Effect.sync(() => {
            currentSignals = {
              ...currentSignals,
              focused,
            };
            for (const listener of listeners) {
              listener(currentSignals);
            }
          }),
        setOnline: (online) =>
          Effect.sync(() => {
            currentSignals = {
              ...currentSignals,
              online,
            };
            for (const listener of listeners) {
              listener(currentSignals);
            }
          }),
        subscribe: (listener) =>
          Effect.sync(() => {
            listeners.add(listener);
            return () => {
              listeners.delete(listener);
            };
          }),
      }),
    );
    const runtime = flow.runtime(
      flow
        .app({
          modules: [ObserveModule],
        })
        .layer<readonly [Layer.Layer<HostSignals, never, never>]>({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
          services: [customHostSignalsLayer],
        }),
    );

    const actor = runtime.createActor(observeMachine);
    await actor.flush();

    expect(actor.snapshot().resources["runtime.project.observe.paused"]).toMatchObject({
      status: "success",
      availability: "value",
      activity: "paused",
      freshness: "fresh",
      value: { id: "project-1", name: "Loading project" },
      placeholder: { id: "project-1", name: "Loading project" },
      isPlaceholderData: true,
    });

    await runtime.runPromise(Effect.flatMap(HostSignals, (signals) => signals.setOnline(true)));
    await lookupStartedPromise;
    await actor.flush();

    expect(actor.snapshot().resources["runtime.project.observe.paused"]).toMatchObject({
      status: "success",
      availability: "value",
      activity: "fetching",
      freshness: "fresh",
      value: { id: "project-1", name: "Loading project" },
      placeholder: { id: "project-1", name: "Loading project" },
      isPlaceholderData: true,
    });

    resolveLookup?.({ id: "project-1", name: "Observed after reconnect" });
    await actor.flush();

    expect(actor.snapshot().resources["runtime.project.observe.paused"]).toMatchObject({
      status: "success",
      availability: "value",
      activity: "idle",
      freshness: "fresh",
      value: { id: "project-1", name: "Observed after reconnect" },
      placeholder: { id: "project-1", name: "Loading project" },
      isPlaceholderData: false,
    });

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

  it("authorizes app-bound root actors by exact machine definition and preserves focused compatibility", async () => {
    const registeredMachine = flow.machine<{}, never, "idle">({
      id: "runtime.actor.registered",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });
    const unregisteredMachine = flow.machine<{}, never, "idle">({
      id: "runtime.actor.unregistered",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });
    const wrongAppMachine = flow.machine<{}, never, "idle">({
      id: "runtime.actor.wrong-app",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });
    const AppModule = flow.module("RuntimeAppBound", {
      machines: { actor: registeredMachine },
    });
    const WrongAppModule = flow.module("RuntimeWrongApp", {
      machines: { actor: wrongAppMachine },
    });
    const appRuntime = flow.runtime(
      flow
        .app({
          modules: [AppModule],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );
    const wrongAppRuntime = flow.runtime(
      flow
        .app({
          modules: [WrongAppModule],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );

    const actor = appRuntime.createActor(registeredMachine);
    const unregisteredExit = await appRuntime.runPromiseExit(
      Effect.flatMap(OrchestratorSystem, (system) => system.start(unregisteredMachine)),
    );
    const wrongAppExit = await appRuntime.runPromiseExit(
      Effect.flatMap(OrchestratorSystem, (system) => system.start(wrongAppMachine)),
    );
    const focusedRuntime = createRuntime();
    const focusedActor = focusedRuntime.createActor(unregisteredMachine);
    const wrongAppActor = wrongAppRuntime.createActor(wrongAppMachine, {
      id: "runtime.same-public-id",
    });
    const samePublicIdActor = appRuntime.createActor(registeredMachine, {
      id: "runtime.same-public-id",
    });

    expect(actor.id).toBe("app:15:RuntimeAppBound/RuntimeAppBound/actor");
    expect(unregisteredExit).toMatchObject({
      _tag: "Failure",
    });
    if (unregisteredExit._tag === "Failure") {
      expect(Cause.squash(unregisteredExit.cause)).toMatchObject({
        code: "FLOW-ORCH-002",
        debug: {
          reason: "unregistered-app-machine",
          machineId: "runtime.actor.unregistered",
        },
      });
    }
    expect(wrongAppExit).toMatchObject({
      _tag: "Failure",
    });
    if (wrongAppExit._tag === "Failure") {
      expect(Cause.squash(wrongAppExit.cause)).toMatchObject({
        code: "FLOW-ORCH-002",
        debug: {
          reason: "unregistered-app-machine",
          machineId: "runtime.actor.wrong-app",
        },
      });
    }
    expect(focusedActor.id).toBe("runtime.actor.unregistered");
    expect(wrongAppActor).not.toBe(samePublicIdActor);

    await focusedRuntime.dispose();
    await wrongAppRuntime.dispose();
    await appRuntime.dispose();
  });

  it("rejects ambiguous app ownership and unsupported actor start policies before actor work starts", async () => {
    const ambiguousMachine = flow.machine<{}, never, "idle">({
      id: "runtime.actor.ambiguous",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });
    const policyMachine = flow.machine<{}, never, "idle">({
      id: "runtime.actor.policy",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });
    const FirstModule = flow.module("RuntimeAmbiguousFirst", {
      machines: { actor: ambiguousMachine },
    });
    const SecondModule = flow.module("RuntimeAmbiguousSecond", {
      machines: { actor: ambiguousMachine },
    });
    const PolicyModule = flow.module("RuntimePolicy", {
      machines: { actor: policyMachine },
    });
    const ambiguousRuntime = flow.runtime(
      flow
        .app({
          modules: [FirstModule, SecondModule],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );
    const policyRuntime = flow.runtime(
      flow
        .app({
          modules: [PolicyModule],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );

    const ambiguousExit = await ambiguousRuntime.runPromiseExit(
      Effect.flatMap(OrchestratorSystem, (system) => system.start(ambiguousMachine)),
    );
    const policyExit = await policyRuntime.runPromiseExit(
      Effect.flatMap(OrchestratorSystem, (system) =>
        system.start(policyMachine, {
          policy: "forever" as never,
        }),
      ),
    );

    expect(ambiguousExit).toMatchObject({
      _tag: "Failure",
    });
    if (ambiguousExit._tag === "Failure") {
      expect(Cause.squash(ambiguousExit.cause)).toMatchObject({
        code: "FLOW-ORCH-002",
        debug: {
          reason: "ambiguous-app-ownership",
          machineId: "runtime.actor.ambiguous",
        },
      });
    }
    expect(policyExit).toMatchObject({
      _tag: "Failure",
    });
    if (policyExit._tag === "Failure") {
      expect(Cause.squash(policyExit.cause)).toMatchObject({
        code: "FLOW-ORCH-002",
        debug: {
          reason: "unsupported-policy",
          policy: "forever",
        },
      });
    }

    await policyRuntime.dispose();
    await ambiguousRuntime.dispose();
  });

  it("lets unregistered child actors inherit the parent app-bound owner domain", async () => {
    const childMachine = flow.machine<{}, never, "idle">({
      id: "runtime.actor.child.inherit",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
      },
    });
    const parentMachine = flow.machine<{}, never, "ready">({
      id: "runtime.actor.parent.inherit",
      initial: "ready",
      context: () => ({}),
      states: {
        ready: {
          invoke: flow.child({
            id: "child",
            machine: childMachine,
          }),
        },
      },
    });
    const ParentModule = flow.module("RuntimeParent", {
      machines: { parent: parentMachine },
    });
    const runtime = flow.runtime(
      flow
        .app({
          modules: [ParentModule],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );

    const actor = runtime.createActor(parentMachine);

    expect(actor.id).toBe("app:13:RuntimeParent/RuntimeParent/parent");
    expect(actor.children().child).toMatchObject({
      actorId: `${actor.id}/child`,
      status: "active",
    });

    await runtime.dispose();
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

    const TraceModule = flow.module("RuntimeTrace", {
      machines: { actor: actorMachine },
    });
    const app = flow.app({
      modules: [RuntimeModule, TraceModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.createActor(actorMachine);
    const actorId = actor.id;
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
        id: actorId,
      },
      expect.objectContaining({
        type: "machine:event",
        id: "runtime.actor.trace",
        source: "machine",
        eventType: "ADVANCE",
        trigger: "event",
        step: 0,
        targetActorId: actorId,
        correlationId: advanceCorrelationId,
      }),
      expect.objectContaining({
        type: "machine:guard",
        id: "runtime.actor.trace",
        source: "machine",
        eventType: "ADVANCE",
        index: 0,
        result: "pass",
        from: "idle",
        target: "ready",
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
        from: "idle",
        to: "ready",
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
        transitionIndex: 0,
        from: "idle",
        to: "ready",
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
        targetActorId: actorId,
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

    const AlwaysTraceModule = flow.module("RuntimeAlwaysTrace", {
      machines: { actor: actorMachine },
    });
    const app = flow.app({
      modules: [RuntimeModule, AlwaysTraceModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.createActor(actorMachine);
    const actorId = actor.id;
    actor.send({ type: "ADVANCE" });

    const entries = await runtime.runPromise(Effect.flatMap(TraceLog, (trace) => trace.entries));
    const correlationId = entries.find(
      (entry) => entry.type === "machine:event" && entry.eventType === "ADVANCE",
    )?.correlationId;

    expect(correlationId).toEqual(expect.any(String));

    expect(entries).toEqual([
      {
        type: "actor:start",
        id: actorId,
      },
      expect.objectContaining({
        type: "machine:event",
        id: "runtime.actor.always-trace",
        source: "machine",
        eventType: "ADVANCE",
        trigger: "event",
        step: 0,
        targetActorId: actorId,
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
        transitionIndex: 0,
        from: "ready",
        to: "done",
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
    const runtimePolicyLayer = FlowRuntimePolicy.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
    }).pipe(Layer.provide(Layer.mergeAll(notificationSchedulerLayer, hostSignalsLayer)));
    const resourceStoreLayer = ResourceStore.layer.pipe(
      Layer.provide(
        Layer.mergeAll(notificationSchedulerLayer, hostSignalsLayer, runtimePolicyLayer),
      ),
    );
    const inspectionLogLayer = InspectionLog.layer;
    const traceLogLayer = TraceLog.layer;
    const orchestratorLayer = OrchestratorSystem.layer.pipe(
      Layer.provide(
        Layer.mergeAll(resourceStoreLayer, inspectionLogLayer, traceLogLayer, runtimePolicyLayer),
      ),
    ) as Layer.Layer<OrchestratorSystem, never, never>;

    const runtime = flow.runtime(
      Layer.mergeAll(
        notificationSchedulerLayer,
        resourceStoreLayer,
        orchestratorLayer,
        inspectionLogLayer,
        traceLogLayer,
        hostSignalsLayer,
        runtimePolicyLayer,
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
        restorePrevalidated: () => Effect.void,
        dehydrate: () => Effect.succeed([]),
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
    const runtimePolicyLayer = FlowRuntimePolicy.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
    }).pipe(Layer.provide(Layer.mergeAll(NotificationScheduler.testLayer, HostSignals.testLayer)));
    const orchestratorLayer = OrchestratorSystem.layer.pipe(
      Layer.provide(
        Layer.mergeAll(resourceStoreLayer, inspectionLogLayer, traceLogLayer, runtimePolicyLayer),
      ),
    ) as Layer.Layer<OrchestratorSystem, never, never>;

    const runtime = flow.runtime(
      Layer.mergeAll(
        NotificationScheduler.testLayer,
        resourceStoreLayer,
        orchestratorLayer,
        inspectionLogLayer,
        traceLogLayer,
        HostSignals.testLayer,
        runtimePolicyLayer,
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
    const BlockingRuntimeModule = flow.module("BlockingRuntime", {
      project: blockingResource,
    });

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

  it("installs an explicit runtime policy that captures overridden app-layer installers", async () => {
    const seenNames: string[] = [];
    const scheduledCallbacks: Array<() => void> = [];
    const customSignals = {
      focused: false,
      online: false,
    };

    const customHostSignalsLayer = Layer.succeed(
      HostSignals,
      HostSignals.of({
        snapshot: Effect.succeed(customSignals),
        setFocused: () => Effect.void,
        setOnline: () => Effect.void,
        subscribe: () => Effect.succeed(() => undefined),
      }),
    );

    const app = flow.app({
      modules: [RuntimeModule],
    });

    const customNotificationSchedulerLayer = Layer.succeed(
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
    );

    const policy = await Effect.runPromise(
      Effect.flatMap(FlowRuntimePolicy, (runtimePolicy) =>
        Effect.gen(function* () {
          return {
            storeMode: runtimePolicy.store.mode,
            orchestratorMode: runtimePolicy.orchestrators.mode,
            hostSignalsSnapshot: yield* runtimePolicy.hostSignals.snapshot,
          };
        }),
      ).pipe(
        Effect.provide(
          FlowRuntimePolicy.layer({
            store: flow.store.memory(),
            orchestrators: flow.orchestrators.live(),
          }).pipe(
            Layer.provide(Layer.mergeAll(customNotificationSchedulerLayer, customHostSignalsLayer)),
          ),
        ),
      ),
    );

    expect(policy).toEqual({
      storeMode: "memory",
      orchestratorMode: "live",
      hostSignalsSnapshot: customSignals,
    });

    const runtimeLayer = app.layer<
      readonly [
        Layer.Layer<NotificationScheduler, never, never>,
        Layer.Layer<HostSignals, never, never>,
      ]
    >({
      store: flow.store.memory(),
      orchestrators: flow.orchestrators.live(),
      services: [customNotificationSchedulerLayer, customHostSignalsLayer],
    });
    const runtime = flow.runtime(runtimeLayer);

    expect(
      await runtime.runPromise(Effect.flatMap(HostSignals, (signals) => signals.snapshot)),
    ).toEqual(customSignals);

    const projectRef = projectResource.ref("runtime-policy-project");
    const unsubscribe = runtime.resources.subscribe(projectRef, (snapshot) => {
      const value = snapshot.value as ProjectRecord | undefined;
      if (value?.name !== undefined) {
        seenNames.push(value.name);
      }
    });

    runtime.resources.seedResources([
      {
        ref: projectRef,
        value: { id: "runtime-policy-project", name: "Seeded by policy" },
      },
    ]);

    expect(seenNames).toEqual([]);
    expect(scheduledCallbacks).toHaveLength(1);

    await runtime.runPromise(Effect.flatMap(NotificationScheduler, (scheduler) => scheduler.flush));

    expect(seenNames).toEqual(["Seeded by policy"]);

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
