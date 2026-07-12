import { Effect, Layer, Stream } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import { captureTrace } from "./inspect.js";
import { createInspectionSubscription } from "./core/inspection/inspection-subscription.js";
import { OrchestratorSystem } from "./core/orchestrator/orchestrator-system.js";
import { HostSignals } from "./core/runtime/services/host-signals.js";
import { InspectionLog } from "./core/runtime/services/inspection.js";
import { NotificationScheduler } from "./core/runtime/services/notification-scheduler.js";
import { ResourceStore } from "./core/runtime/services/resource-store.js";
import { FlowRuntimePolicy } from "./core/runtime/services/runtime-policy.js";
import { TraceLog } from "./core/runtime/services/trace.js";
import { FlowDiagnostic } from "./shared/diagnostics.js";
import type { FlowInspectionSnapshotEvent } from "./inspect.js";
import { createControlledStream, flowTest } from "./testing.js";
import { focusedMachineInventory } from "./testing/focused-app.js";
import { createFocusedRuntimeWithTestClock } from "./testing/fixtures/focused-test-runtime.js";
import { createKey, createTag } from "./index.js";
import * as flow from "./index.js";
import { createRuntime } from "./runtime/contract-runtime.js";

describe("runtime inspection receipts", () => {
  const createRuntimeWithTrackedInspectionSubscription = () => {
    const counters = {
      subscribeCount: 0,
      unsubscribeCount: 0,
    };
    const notificationScheduler = NotificationScheduler.testLayer;
    const hostSignals = HostSignals.testLayer;
    const runtimePolicy = FlowRuntimePolicy.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
    }).pipe(Layer.provide(Layer.mergeAll(notificationScheduler, hostSignals)));
    const resourceStore = ResourceStore.layer.pipe(
      Layer.provide(Layer.mergeAll(notificationScheduler, hostSignals, runtimePolicy)),
    );
    const inspectionLog = Layer.effect(
      InspectionLog,
      Effect.gen(function* () {
        const log = yield* InspectionLog;

        return InspectionLog.of({
          ...log,
          subscribe: (listenerOrObserver, filter) =>
            Effect.map(log.subscribe(listenerOrObserver, filter), (subscription) => {
              counters.subscribeCount += 1;

              return createInspectionSubscription(() => {
                counters.unsubscribeCount += 1;
                subscription.unsubscribe();
              });
            }),
        });
      }),
    ).pipe(Layer.provide(InspectionLog.layer));
    const traceLog = TraceLog.layer;
    const orchestratorSystem = OrchestratorSystem.layer.pipe(
      Layer.provide(Layer.mergeAll(resourceStore, inspectionLog, traceLog, runtimePolicy)),
    ) as Layer.Layer<OrchestratorSystem, never, never>;

    return {
      counters,
      runtime: createRuntime(
        Layer.mergeAll(
          notificationScheduler,
          resourceStore,
          orchestratorSystem,
          hostSignals,
          inspectionLog,
          traceLog,
          runtimePolicy,
        ),
      ),
    };
  };

  it("streams live runtime inspection events and supports unsubscribe", async () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "ADVANCE" }> | Readonly<{ readonly type: "UNKNOWN" }>,
      "idle" | "ready"
    >({
      id: "runtime.inspection.stream.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "ready",
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
        ready: {},
      },
    });

    const runtime = createRuntime();
    const observed = runtime.inspection.entries().slice();
    const received: typeof observed = [];
    const unsubscribe = runtime.inspection.subscribe((event) => {
      received.push(event);
    });

    const actor = runtime.createActor(machine);
    actor.send({ type: "ADVANCE" });
    await actor.flush();

    const snapshotEvents = received.filter(
      (event): event is FlowInspectionSnapshotEvent => event.type === "actor:snapshot",
    );
    expect(received).toEqual(runtime.inspection.entries());
    expect(received).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "actor:start", id: actor.id }),
        expect.objectContaining({
          type: "machine:event",
          id: actor.id,
          eventType: "ADVANCE",
          targetActorId: actor.id,
          correlationId: expect.any(String),
        }),
        expect.objectContaining({
          type: "actor:snapshot",
          id: actor.id,
          snapshot: expect.objectContaining({
            value: "idle",
          }),
        }),
        expect.objectContaining({
          type: "actor:snapshot",
          id: actor.id,
          snapshot: expect.objectContaining({
            value: "ready",
          }),
          correlationId: expect.any(String),
        }),
      ]),
    );
    expect(snapshotEvents.map((event) => event.snapshot.value)).toEqual(["idle", "ready"]);
    expect(received.map((event) => event.sequence)).toEqual(
      Array.from({ length: received.length }, (_, index) => index + 1),
    );
    for (const event of received) {
      expect(event.actorId).toBe(actor.id);
      expect(event.rootActorId).toBe(actor.id);
      expect(event.appId).toBeUndefined();
      expect(event.moduleId).toBeUndefined();
      expect(typeof event.timestamp).toBe("number");
    }

    const receivedBeforeUnsubscribe = received.length;
    unsubscribe();

    actor.send({ type: "UNKNOWN" });
    await actor.flush();

    expect(received).toHaveLength(receivedBeforeUnsubscribe);
    expect(runtime.inspection.entries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "machine:event",
          id: actor.id,
          eventType: "UNKNOWN",
          targetActorId: actor.id,
          correlationId: expect.any(String),
        }),
      ]),
    );

    await runtime.dispose();
  });

  it("keeps inspection publication live when one observer throws and later observers still receive the batch", async () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "ADVANCE" }>,
      "idle" | "ready"
    >({
      id: "runtime.inspection.observer-fault-isolation.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "ready",
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
        ready: {},
      },
    });

    const runtime = createRuntime();
    const actor = runtime.createActor(machine);
    const received: Array<string> = [];

    runtime.inspection.subscribe((event) => {
      if (event.type.startsWith("machine:")) {
        throw new Error(`observer exploded: ${event.type}`);
      }
    });
    runtime.inspection.subscribe((event) => {
      if (event.type.startsWith("machine:") || event.type === "actor:snapshot") {
        received.push(event.type);
      }
    });

    actor.send({ type: "ADVANCE" });
    await actor.flush();

    expect(actor.getSnapshot().value).toBe("ready");
    expect(received).toEqual([
      "machine:event",
      "machine:transition",
      "machine:update",
      "machine:microstep",
      "actor:snapshot",
    ]);

    await runtime.dispose();
  });

  it("publishes transition inspection facts only after the committed snapshot is visible", async () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "ADVANCE" }>,
      "idle" | "ready"
    >({
      id: "runtime.inspection.commit-order.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "ready",
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
        ready: {},
      },
    });

    const runtime = createRuntime();
    const actor = runtime.createActor(machine);
    const observedStates: Array<Readonly<{ readonly type: string; readonly state: string }>> = [];
    const unsubscribe = runtime.inspection.subscribe((event) => {
      if (event.type === "actor:snapshot" || event.type.startsWith("machine:")) {
        observedStates.push({
          type: event.type,
          state: actor.getSnapshot().value,
        });
      }
    });

    actor.send({ type: "ADVANCE" });
    await actor.flush();

    expect(observedStates).toEqual([
      { type: "machine:event", state: "ready" },
      { type: "machine:transition", state: "ready" },
      { type: "machine:update", state: "ready" },
      { type: "machine:microstep", state: "ready" },
      { type: "actor:snapshot", state: "ready" },
    ]);

    unsubscribe();
    await runtime.dispose();
  });

  it("keeps repeated runtime-owned inspection unsubscribe idempotent before disposal", async () => {
    const { counters, runtime } = createRuntimeWithTrackedInspectionSubscription();

    const subscription = runtime.inspection.subscribe(() => undefined);

    expect(counters.subscribeCount).toBe(1);
    expect(counters.unsubscribeCount).toBe(0);
    expect(subscription.closed).toBe(false);

    subscription();
    subscription.unsubscribe();

    expect(subscription.closed).toBe(true);
    expect(counters.unsubscribeCount).toBe(1);

    await runtime.dispose();

    expect(counters.unsubscribeCount).toBe(1);
  });

  it("supports filtered observer subscriptions and app ownership metadata", async () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "ADVANCE" }>,
      "idle" | "ready"
    >({
      id: "runtime.inspection.owned.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "ready",
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
        ready: {},
      },
    });
    const project = flow.module(
      "Project",
      {
        editor: machine,
        machines: {
          editor: machine,
        },
      },
      {
        screens: ["editor"],
        tags: ["project"],
        dependencies: ["auth"],
        permissions: ["project:write"],
      },
    );
    const app = flow.app({ modules: [project] });
    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );
    const machineEvents: Array<ReturnType<typeof runtime.inspection.entries>[number]> = [];
    const subscription = runtime.inspection.subscribe(
      {
        next: (event) => {
          machineEvents.push(event);
        },
      },
      {
        family: "machine",
      },
    );

    const actor = runtime.createActor(machine);
    actor.send({ type: "ADVANCE" });
    await actor.flush();

    const received = runtime.inspection.entries();

    expect(subscription.closed).toBe(false);
    expect(machineEvents.every((event) => event.type.startsWith("machine:"))).toBe(true);
    expect(machineEvents).toEqual(runtime.inspection.entries({ family: "machine" }));
    for (const event of received) {
      expect(event.actorId).toBe(actor.id);
      expect(event.rootActorId).toBe(actor.id);
      expect(event.appId).toBe(app.id);
      expect(event.moduleId).toBe(project.id);
      expect(event.modulePath).toBe(`${app.id}/${project.id}`);
      expect(event.ownerPath).toBe(`${app.id}/${project.id}/editor`);
      expect(event.machineName).toBe("editor");
      expect(event.screens).toEqual(["editor"]);
      expect(event.tags).toEqual(["project"]);
      expect(event.dependencies).toEqual(["auth"]);
      expect(event.permissions).toEqual(["project:write"]);
    }

    subscription.unsubscribe();
    expect(subscription.closed).toBe(true);

    await runtime.dispose();
  });

  it("carries ownership paths and module labels across resource, transaction, stream, and timer facts", async () => {
    const projectResource = flow.resource<
      [projectId: string],
      Readonly<{ readonly id: string; readonly name: string }>
    >({
      id: "runtime.inspection.ownership.project",
      key: (projectId: string) => createKey("runtime-inspection-ownership-project", projectId),
      lookup: (projectId: string) =>
        Effect.succeed({
          id: projectId,
          name: "Seeded",
        }),
    });
    const saveProject = flow.transaction<
      { readonly id: string; readonly name: string },
      Readonly<{ readonly ok: true }>
    >({
      id: "runtime.inspection.ownership.save",
      params: () => ({
        id: "project-1",
        name: "Patched by event",
      }),
      commit: () => Effect.succeed({ ok: true as const }),
    });
    const tokenStream = flow.stream({
      id: "runtime.inspection.ownership.stream",
      subscribe: () =>
        createControlledStream<string>("runtime.inspection.ownership.tokens").stream(),
    });
    const machine = flow.machine<
      {},
      Readonly<{ readonly type: "START" }> | Readonly<{ readonly type: "TIMEOUT" }>,
      "idle" | "running" | "timedOut"
    >({
      id: "runtime.inspection.ownership.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            START: "running",
          },
        },
        running: {
          invoke: [
            flow.patch(projectResource.ref("project-1"), {
              name: "Patched by event",
            }),
            flow.run(saveProject),
            tokenStream,
          ],
          after: flow.after({
            id: "runtime.inspection.ownership.timer",
            delay: "1 second",
            target: "timedOut",
          }),
        },
        timedOut: {},
      },
    });
    const project = flow.module(
      "Project",
      {
        projectResource,
        saveProject,
        tokenStream,
        editor: machine,
        resources: {
          projectResource,
        },
        transactions: {
          saveProject,
        },
        streams: {
          tokenStream,
        },
        machines: {
          editor: machine,
        },
      },
      {
        screens: ["editor"],
        tags: ["project"],
        dependencies: ["auth"],
        permissions: ["project:write"],
      },
    );
    const app = flow.app({ modules: [project] });
    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [TestClock.layer()],
      }),
    );

    runtime.resources.seedResources([
      {
        ref: projectResource.ref("project-1"),
        value: { id: "project-1", name: "Seeded" },
      },
    ]);

    const actor = runtime.createActor(machine);
    actor.send({ type: "START" });
    await actor.flush();
    await runtime.runPromise(TestClock.adjust("1 second"));
    await actor.flush();

    const expectSharedMetadata = {
      appId: app.id,
      moduleId: project.id,
      modulePath: `${app.id}/${project.id}`,
      ownerPath: `${app.id}/${project.id}/editor`,
      machineName: "editor",
      screens: ["editor"],
      tags: ["project"],
      dependencies: ["auth"],
      permissions: ["project:write"],
    };

    expect(
      runtime.inspection.entries().find((event) => event.type === "resource:patch"),
    ).toMatchObject(expectSharedMetadata);
    expect(
      runtime.inspection.entries().find((event) => event.type === "transaction:start"),
    ).toMatchObject(expectSharedMetadata);
    expect(
      runtime.inspection.entries().find((event) => event.type === "stream:start"),
    ).toMatchObject(expectSharedMetadata);
    expect(
      runtime.inspection.entries().find((event) => event.type === "timer:start"),
    ).toMatchObject(expectSharedMetadata);

    await runtime.dispose();
  });

  it("records resource lifecycle inspection events for placeholder use, lookup completion, and invalidate reasons", async () => {
    let resolveLookup:
      | ((value: { readonly id: string; readonly name: string }) => void)
      | undefined;
    const resourceLifecycleTag = createTag("runtime.inspection.resource.lifecycle.tag");
    const placeholderProject = flow.resource<
      [projectId: string],
      Readonly<{ readonly id: string; readonly name: string }>
    >({
      id: "runtime.inspection.resource.placeholder",
      key: (projectId) => createKey("runtime-inspection-resource-placeholder", projectId),
      lookup: (projectId) =>
        Effect.callback<Readonly<{ readonly id: string; readonly name: string }>>((resume) => {
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
    const invalidatedProject = flow.resource<
      [projectId: string],
      Readonly<{ readonly id: string; readonly name: string }>
    >({
      id: "runtime.inspection.resource.invalidated",
      key: (projectId) => createKey("runtime-inspection-resource-invalidated", projectId),
      lookup: (projectId) => Effect.succeed({ id: projectId, name: "Loaded invalidated" }),
      tags: () => [resourceLifecycleTag],
    });
    const machine = flow.machine<{}, never, "ready">({
      id: "runtime.inspection.resource.lifecycle.machine",
      initial: "ready",
      context: () => ({}),
      states: {
        ready: {
          invoke: [
            flow.ensure(placeholderProject.ref("project-1")),
            flow.observe(invalidatedProject.ref("project-2")),
            flow.invalidate(resourceLifecycleTag),
          ],
        },
      },
    });
    const ResourceLifecycleModule = flow.module("RuntimeInspectionResourceLifecycle", {
      placeholderProject,
      invalidatedProject,
      machines: focusedMachineInventory(machine),
    });
    const app = flow.app({
      modules: [ResourceLifecycleModule],
    });
    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    runtime.resources.seedResources([
      {
        ref: invalidatedProject.ref("project-2"),
        value: { id: "project-2", name: "Seeded invalidated" },
      },
    ]);

    const actor = runtime.createActor(machine);

    expect(runtime.inspection.entries({ family: "resource" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "resource:start",
          id: "runtime.inspection.resource.placeholder",
          mode: "ensure",
        }),
        expect.objectContaining({
          type: "resource:placeholder",
          id: "runtime.inspection.resource.placeholder",
          mode: "ensure",
        }),
        expect.objectContaining({
          type: "resource:invalidate",
          id: "runtime.inspection.resource.lifecycle.tag",
          reason: "command",
        }),
        expect.objectContaining({
          type: "resource:freshness",
          id: "runtime.inspection.resource.invalidated",
          from: "fresh",
          to: "invalidated",
          reason: "invalidate:command",
        }),
      ]),
    );

    resolveLookup?.({ id: "project-1", name: "Loaded project" });
    await actor.flush();

    expect(runtime.inspection.entries({ family: "resource" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "resource:success",
          id: "runtime.inspection.resource.placeholder",
          mode: "ensure",
          status: "success",
          availability: "value",
          freshness: "fresh",
        }),
      ]),
    );

    await runtime.dispose();
  });

  it("records richer transaction inspection events for serialized overlap, preview patches, timings, and routed success", async () => {
    interface ProjectRecord {
      readonly id: string;
      readonly name: string;
    }

    interface SaveContext {
      readonly projectId: string;
      readonly draft: ProjectRecord;
      readonly savedNames: ReadonlyArray<string>;
    }

    type SaveEvent =
      | Readonly<{ readonly type: "SAVE"; readonly name: string }>
      | Readonly<{ readonly type: "SAVED"; readonly project: ProjectRecord }>;

    const projectResource = flow.resource<[projectId: string], ProjectRecord>({
      id: "runtime.inspection.transaction.project",
      key: (projectId) => createKey("runtime-inspection-transaction-project", projectId),
      lookup: (projectId) => Effect.succeed({ id: projectId, name: "Loaded" }),
    });
    const saveProject = flow.transaction<
      Readonly<{ readonly id: string; readonly draft: ProjectRecord }>,
      ProjectRecord,
      never,
      never,
      SaveEvent
    >({
      id: "runtime.inspection.transaction.save",
      params: ({ context }: { readonly context: SaveContext }) => ({
        id: context.projectId,
        draft: context.draft,
      }),
      preview: {
        apply: ({ params }) => [
          {
            ref: projectResource.ref(params.id),
            replace: params.draft,
          },
        ],
      },
      commit: (params) => Effect.sleep("1 second").pipe(Effect.as(params.draft)),
      routes: flow.outcomes<ProjectRecord, never, SaveEvent>({
        success: ({ value }) => ({
          type: "SAVED",
          project: value,
        }),
      }),
      concurrency: "serialize",
      scope: {
        id: "runtime.inspection.transaction.scope",
      },
    });
    const machine = flow.machine<SaveContext, SaveEvent, "ready", "ready">({
      id: "runtime.inspection.transaction.machine",
      initial: "ready",
      context: () => ({
        projectId: "project-1",
        draft: { id: "project-1", name: "Seeded" },
        savedNames: [],
      }),
      states: {
        ready: {
          on: {
            SAVE: {
              submit: saveProject,
              update: ({ context, event }) =>
                event.type === "SAVE"
                  ? {
                      draft: {
                        ...context.draft,
                        name: event.name,
                      },
                    }
                  : {},
            },
            SAVED: {
              update: ({ context, event }) =>
                event.type === "SAVED"
                  ? {
                      draft: event.project,
                      savedNames: [...context.savedNames, event.project.name],
                    }
                  : {},
            },
          },
        },
      },
    });

    const runtime = createFocusedRuntimeWithTestClock(machine, "RuntimeInspectionTransaction");

    runtime.resources.seedResources([
      {
        ref: projectResource.ref("project-1"),
        value: { id: "project-1", name: "Seeded" },
      },
    ]);

    const actor = runtime.createActor(machine);
    actor.send({ type: "SAVE", name: "Draft A" });
    actor.send({ type: "SAVE", name: "Draft B" });
    await actor.flush();

    const transactionEvents = () =>
      runtime.inspection
        .entries({ family: "transaction" })
        .filter((event) => event.id === "runtime.inspection.transaction.save");

    expect(transactionEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "transaction:start",
          generation: 1,
          trigger: "event",
          queueKey: "runtime.inspection.transaction.scope",
          startedAt: 0,
        }),
        expect.objectContaining({
          type: "transaction:preview-patch",
          generation: 1,
          queueKey: "runtime.inspection.transaction.scope",
          refId: "runtime.inspection.transaction.project",
          previewIndex: 1,
          previewCount: 1,
        }),
        expect.objectContaining({
          type: "transaction:queue",
          queueKey: "runtime.inspection.transaction.scope",
          overlapCause: "active-attempt",
        }),
      ]),
    );

    await runtime.runPromise(TestClock.adjust("1 second"));
    await actor.flush();

    expect(transactionEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "transaction:dequeue",
          queueKey: "runtime.inspection.transaction.scope",
          overlapCause: "active-attempt",
        }),
        expect.objectContaining({
          type: "transaction:success",
          generation: 1,
          queueKey: "runtime.inspection.transaction.scope",
          startedAt: 0,
          endedAt: 1_000,
          durationMillis: 1_000,
          routedEventType: "SAVED",
        }),
        expect.objectContaining({
          type: "transaction:start",
          generation: 2,
          trigger: "event",
          queueKey: "runtime.inspection.transaction.scope",
          startedAt: 1_000,
        }),
        expect.objectContaining({
          type: "transaction:preview-patch",
          generation: 2,
          queueKey: "runtime.inspection.transaction.scope",
          refId: "runtime.inspection.transaction.project",
          previewIndex: 1,
          previewCount: 1,
        }),
      ]),
    );

    await runtime.runPromise(TestClock.adjust("1 second"));
    await actor.flush();

    expect(transactionEvents().filter((event) => event.type === "transaction:success")).toEqual([
      expect.objectContaining({
        generation: 1,
        queueKey: "runtime.inspection.transaction.scope",
        startedAt: 0,
        endedAt: 1_000,
        durationMillis: 1_000,
        routedEventType: "SAVED",
      }),
      expect.objectContaining({
        generation: 2,
        queueKey: "runtime.inspection.transaction.scope",
        startedAt: 1_000,
        endedAt: 2_000,
        durationMillis: 1_000,
        routedEventType: "SAVED",
      }),
    ]);

    await runtime.dispose();
  });

  it("records transaction rollback inspection events with cancel-previous overlap facts", async () => {
    interface ProjectRecord {
      readonly id: string;
      readonly name: string;
    }

    interface SaveContext {
      readonly projectId: string;
      readonly draft: ProjectRecord;
    }

    type SaveEvent = Readonly<{ readonly type: "SAVE"; readonly name: string }>;

    const projectResource = flow.resource<[projectId: string], ProjectRecord>({
      id: "runtime.inspection.transaction.cancel.project",
      key: (projectId) => createKey("runtime-inspection-transaction-cancel-project", projectId),
      lookup: (projectId) => Effect.succeed({ id: projectId, name: "Loaded" }),
    });
    const saveProject = flow.transaction<
      Readonly<{ readonly id: string; readonly draft: ProjectRecord }>,
      ProjectRecord,
      never,
      never,
      SaveEvent
    >({
      id: "runtime.inspection.transaction.cancel",
      params: ({ context }: { readonly context: SaveContext }) => ({
        id: context.projectId,
        draft: context.draft,
      }),
      preview: {
        apply: ({ params }) => [
          {
            ref: projectResource.ref(params.id),
            replace: params.draft,
          },
        ],
      },
      commit: (params) => Effect.never.pipe(Effect.as(params.draft)),
      concurrency: "cancel-previous",
    });
    const machine = flow.machine<SaveContext, SaveEvent, "ready", "ready">({
      id: "runtime.inspection.transaction.cancel.machine",
      initial: "ready",
      context: () => ({
        projectId: "project-1",
        draft: { id: "project-1", name: "Seeded" },
      }),
      states: {
        ready: {
          on: {
            SAVE: {
              submit: saveProject,
              update: ({ context, event }) =>
                event.type === "SAVE"
                  ? {
                      draft: {
                        ...context.draft,
                        name: event.name,
                      },
                    }
                  : {},
            },
          },
        },
      },
    });

    const runtime = createFocusedRuntimeWithTestClock(
      machine,
      "RuntimeInspectionTransactionCancel",
    );

    runtime.resources.seedResources([
      {
        ref: projectResource.ref("project-1"),
        value: { id: "project-1", name: "Seeded" },
      },
    ]);

    const actor = runtime.createActor(machine);
    actor.send({ type: "SAVE", name: "Draft A" });
    actor.send({ type: "SAVE", name: "Draft B" });
    await actor.flush();

    const transactionEvents = runtime.inspection
      .entries({ family: "transaction" })
      .filter((event) => event.id === "runtime.inspection.transaction.cancel");

    expect(transactionEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "transaction:interrupt",
          generation: 1,
          queueKey: "runtime.inspection.transaction.cancel",
          overlapCause: "cancel-previous",
          startedAt: 0,
          endedAt: 0,
          durationMillis: 0,
        }),
        expect.objectContaining({
          type: "transaction:rollback",
          generation: 1,
          queueKey: "runtime.inspection.transaction.cancel",
          refId: "runtime.inspection.transaction.cancel.project",
          rollbackIndex: 1,
          rollbackCount: 1,
        }),
        expect.objectContaining({
          type: "transaction:start",
          generation: 2,
          queueKey: "runtime.inspection.transaction.cancel",
        }),
      ]),
    );

    await runtime.dispose();
  });

  it("exports inspection events through filter, redaction, and serialization hooks", async () => {
    const machine = flow.machine<
      { readonly token: string; readonly count: number },
      Readonly<{ readonly type: "ADVANCE" }>,
      "idle" | "ready"
    >({
      id: "runtime.inspection.export.machine",
      initial: "idle",
      context: () => ({ token: "secret-token", count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "ready",
              update: ({ context }) => ({ ...context, count: context.count + 1 }),
            },
          },
        },
        ready: {},
      },
    });

    const runtime = createRuntime();
    const actor = runtime.createActor(machine);
    actor.send({ type: "ADVANCE" });
    await actor.flush();

    const exported = runtime.inspection.export({
      filter: {
        family: "actor",
      },
      redact: (event) =>
        event.type === "actor:snapshot"
          ? {
              ...event,
              snapshot: {
                ...event.snapshot,
                context: {
                  token: "[redacted]",
                  count:
                    typeof event.snapshot.context === "object" &&
                    event.snapshot.context !== null &&
                    "count" in event.snapshot.context
                      ? (event.snapshot.context as { readonly count: number }).count
                      : 0,
                },
              },
            }
          : event,
      serialize: (event) =>
        event.type === "actor:snapshot"
          ? {
              type: event.type,
              actorId: event.actorId,
              state: event.snapshot.value,
              token: (event.snapshot.context as { readonly token: string }).token,
            }
          : {
              type: event.type,
              actorId: event.actorId,
            },
    });

    expect(exported).toEqual([
      {
        type: "actor:start",
        actorId: actor.id,
      },
      {
        type: "actor:snapshot",
        actorId: actor.id,
        state: "idle",
        token: "[redacted]",
      },
      {
        type: "actor:snapshot",
        actorId: actor.id,
        state: "ready",
        token: "[redacted]",
      },
    ]);

    await runtime.dispose();
  });

  it("applies ring-buffer retention and keeps explicit inspection snapshots stable", async () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "ADVANCE" }> | Readonly<{ readonly type: "RESET" }>,
      "idle" | "ready"
    >({
      id: "runtime.inspection.retention.ring.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "ready",
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
        ready: {
          on: {
            RESET: {
              target: "idle",
              update: ({ context }) => ({ count: context.count }),
            },
          },
        },
      },
    });

    const runtime = createRuntime();
    runtime.inspection.setRetention({
      maxEvents: 4,
    });

    const actor = runtime.createActor(machine);
    actor.send({ type: "ADVANCE" });
    await actor.flush();

    const captured = runtime.inspection.snapshot();
    const capturedSequences = captured.entries.map((event) => event.sequence);

    expect(runtime.inspection.retention()).toEqual({
      maxEvents: 4,
    });
    expect(captured.entries).toHaveLength(4);
    expect(captured.truncatedBeforeSequence).toBe(capturedSequences[0]! - 1);
    expect(captured.lastSequence).toBe(capturedSequences.at(-1));

    actor.send({ type: "RESET" });
    await actor.flush();

    const liveEntries = runtime.inspection.entries();
    expect(liveEntries).toHaveLength(4);
    expect(liveEntries[0]?.sequence).toBeGreaterThan(capturedSequences[0] ?? 0);
    expect(captured.entries.map((event) => event.sequence)).toEqual(capturedSequences);
    expect(runtime.inspection.snapshot().truncatedBeforeSequence).toBe(
      (liveEntries[0]?.sequence ?? 1) - 1,
    );

    await runtime.dispose();
  });

  it("applies time-window retention as new events arrive while keeping captured snapshots intact", async () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "ADVANCE" }> | Readonly<{ readonly type: "RESET" }>,
      "idle" | "ready"
    >({
      id: "runtime.inspection.retention.window.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "ready",
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
        ready: {
          on: {
            RESET: {
              target: "idle",
              update: ({ context }) => ({ count: context.count }),
            },
          },
        },
      },
    });

    const runtime = createFocusedRuntimeWithTestClock(machine, "RuntimeInspectionRetentionWindow");
    runtime.inspection.setRetention({
      maxAge: "1 second",
    });

    const actor = runtime.createActor(machine);
    actor.send({ type: "ADVANCE" });
    await actor.flush();

    const captured = runtime.inspection.snapshot();
    expect(captured.entries.length).toBeGreaterThan(0);

    await runtime.runPromise(TestClock.adjust("2 seconds"));
    actor.send({ type: "RESET" });
    await actor.flush();

    const liveEntries = runtime.inspection.entries();
    expect(liveEntries.length).toBeGreaterThan(0);
    expect(liveEntries.every((event) => event.sequence > (captured.lastSequence ?? 0))).toBe(true);
    expect(captured.entries.length).toBeGreaterThan(0);
    expect(captured.truncatedBeforeSequence).toBeUndefined();
    expect(runtime.inspection.snapshot().truncatedBeforeSequence).toBe(captured.lastSequence);

    await runtime.dispose();
  });

  it("rejects invalid inspection retention policies", async () => {
    const runtime = createRuntime();
    let failure: unknown;

    try {
      runtime.inspection.setRetention({
        maxEvents: -1,
      });
    } catch (error) {
      failure = error;
    }

    expect(failure instanceof FlowDiagnostic).toBe(true);
    expect(failure).toMatchObject({
      code: "FLOW-INSPECT-001",
      debug: {
        field: "maxEvents",
      },
    });

    await runtime.dispose();
  });

  it("keeps child inspection ownership rooted at the parent actor", async () => {
    const childMachine = flow.machine<{}, never, "done">({
      id: "runtime.inspection.child.machine",
      initial: "done",
      context: () => ({}),
      states: {
        done: {
          type: "final",
        },
      },
    });
    const machine = flow.machine<{}, Readonly<{ readonly type: "START" }>, "idle" | "running">({
      id: "runtime.inspection.parent.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            START: "running",
          },
        },
        running: {
          invoke: flow.child({
            id: "runtime.inspection.child",
            machine: childMachine,
          }),
        },
      },
    });
    const runtime = createRuntime();
    const actor = runtime.createActor(machine);

    actor.send({ type: "START" });
    await actor.flush();

    const childActorId = `${actor.id}/runtime.inspection.child`;
    const childLifecycle = runtime.inspection
      .entries({ type: "child:start" })
      .find((event) => event.type === "child:start" && event.childActorId === childActorId);
    const childActorStart = runtime.inspection
      .entries({ type: "actor:start" })
      .find((event) => event.actorId === childActorId);

    expect(childLifecycle).toMatchObject({
      type: "child:start",
      actorId: actor.id,
      rootActorId: actor.id,
      childActorId,
    });
    expect(childActorStart).toMatchObject({
      type: "actor:start",
      actorId: childActorId,
      rootActorId: actor.id,
      id: childActorId,
    });

    await runtime.dispose();
  });

  it("records richer child lifecycle inspection facts for spawn, retry, stop, supervision, and state", async () => {
    let childSubscriptions = 0;

    const childMachine = flow.machine<{}, never, "running">({
      id: "runtime.inspection.child.lifecycle.machine",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          invoke: flow.stream({
            id: "runtime.inspection.child.lifecycle.stream",
            subscribe: () => {
              childSubscriptions += 1;
              return childSubscriptions === 1 ? Stream.fail("boom" as const) : Stream.never;
            },
          }),
        },
      },
    });
    const machine = flow.machine<
      {},
      Readonly<{ readonly type: "START" }> | Readonly<{ readonly type: "STOP" }>,
      "idle" | "running"
    >({
      id: "runtime.inspection.child.lifecycle.parent",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            START: "running",
          },
        },
        running: {
          invoke: flow.child({
            id: "runtime.inspection.child.lifecycle",
            machine: childMachine,
            supervision: "stop-on-failure",
          }),
          on: {
            STOP: "idle",
          },
        },
      },
    });
    const runtime = createRuntime();
    const actor = runtime.createActor(machine);

    actor.send({ type: "START" });
    await actor.flush();

    const childActorId = `${actor.id}/runtime.inspection.child.lifecycle`;
    const childEvents = () =>
      runtime.inspection
        .entries({ family: "child" })
        .filter((event) => event.id === "runtime.inspection.child.lifecycle");

    expect(childEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "child:start",
          childActorId,
          spawnReason: "state-entry",
          supervision: "stop-on-failure",
          state: "running",
        }),
        expect.objectContaining({
          type: "child:failure",
          childActorId,
          supervision: "stop-on-failure",
          state: "running",
        }),
      ]),
    );

    expect(actor.retryChild("runtime.inspection.child.lifecycle")).toBe(true);
    await actor.flush();

    expect(childEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "child:retry",
          childActorId,
          retryCause: "manual",
          supervision: "stop-on-failure",
          state: "running",
        }),
        expect.objectContaining({
          type: "child:start",
          childActorId,
          spawnReason: "retry",
          supervision: "stop-on-failure",
          state: "running",
        }),
      ]),
    );

    actor.send({ type: "STOP" });
    await actor.flush();

    expect(childEvents()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "child:stop",
          childActorId,
          stopReason: "state-exit",
          supervision: "stop-on-failure",
          state: "running",
        }),
      ]),
    );

    await runtime.dispose();
  });

  it("records target actor ids and correlation ids for external and actor-owned events", async () => {
    const tokens = createControlledStream<string>("runtime.inspection.tokens");

    const machine = flow.machine<
      { readonly latest: string },
      { readonly type: "START" } | { readonly type: "TOKEN"; readonly value: string },
      "idle" | "streaming"
    >({
      id: "runtime.inspection.actor",
      initial: "idle",
      context: () => ({ latest: "" }),
      states: {
        idle: {
          on: {
            START: { target: "streaming" },
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "runtime.inspection.stream",
            subscribe: () => tokens.stream(),
            routes: {
              value: (value) => ({ type: "TOKEN", value }),
            },
          }),
          on: {
            TOKEN: {
              update: ({ event }) => (event.type === "TOKEN" ? { latest: event.value } : {}),
            },
          },
        },
      },
    });

    const actor = createRuntime().createActor(machine);

    actor.send({ type: "START" });
    tokens.emit("hello");
    await actor.flush();

    const eventReceipts = actor
      .receipts()
      .filter((receipt) => receipt.type === "machine:event")
      .map((receipt) => ({
        eventType: receipt.eventType,
        sourceActorId: receipt.sourceActorId,
        targetActorId: receipt.targetActorId,
        correlationId: receipt.correlationId,
      }));

    expect(eventReceipts).toHaveLength(2);
    expect(eventReceipts[0]).toMatchObject({
      eventType: "START",
      sourceActorId: undefined,
      targetActorId: actor.id,
      correlationId: expect.any(String),
    });
    expect(eventReceipts[1]).toMatchObject({
      eventType: "TOKEN",
      sourceActorId: actor.id,
      targetActorId: actor.id,
      correlationId: expect.any(String),
    });
    expect(eventReceipts[1]?.correlationId).not.toBe(eventReceipts[0]?.correlationId);
  });

  it("keeps flowTest inspection metadata aligned with runtime actors", async () => {
    const tokens = createControlledStream<string>("flow-test.inspection.tokens");

    const machine = flow.machine<
      { readonly latest: string },
      { readonly type: "START" } | { readonly type: "TOKEN"; readonly value: string },
      "idle" | "streaming"
    >({
      id: "flow-test.inspection.actor",
      initial: "idle",
      context: () => ({ latest: "" }),
      states: {
        idle: {
          on: {
            START: { target: "streaming" },
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "flow-test.inspection.stream",
            subscribe: () => tokens.stream(),
            routes: {
              value: (value) => ({ type: "TOKEN", value }),
            },
          }),
          on: {
            TOKEN: {
              update: ({ event }) => (event.type === "TOKEN" ? { latest: event.value } : {}),
            },
          },
        },
      },
    });

    const harness = flowTest(machine).start();

    harness.send({ type: "START" });
    tokens.emit("hello");
    await harness.flush();

    const eventReceipts = harness
      .snapshot()
      .receipts.filter((receipt) => receipt.type === "machine:event")
      .map((receipt) => ({
        eventType: receipt.eventType,
        sourceActorId: receipt.sourceActorId,
        targetActorId: receipt.targetActorId,
        correlationId: receipt.correlationId,
      }));

    expect(eventReceipts).toHaveLength(2);
    expect(eventReceipts[0]).toMatchObject({
      eventType: "START",
      sourceActorId: undefined,
      targetActorId: machine.id,
      correlationId: expect.any(String),
    });
    expect(eventReceipts[1]).toMatchObject({
      eventType: "TOKEN",
      sourceActorId: machine.id,
      targetActorId: machine.id,
      correlationId: expect.any(String),
    });
    expect(eventReceipts[1]?.correlationId).not.toBe(eventReceipts[0]?.correlationId);
  });

  it("correlates event-driven runtime work across transitions, resources, transactions, streams, children, and timers", async () => {
    const project = flow.resource<
      [projectId: string],
      Readonly<{ readonly id: string; readonly name: string }>
    >({
      id: "runtime.correlation.project",
      key: (projectId: string) => createKey("runtime-correlation-project", projectId),
      lookup: (projectId: string) =>
        Effect.succeed({
          id: projectId,
          name: "Seeded",
        }),
    });
    const saveProject = flow.transaction<
      { readonly id: string; readonly name: string },
      Readonly<{ readonly ok: true }>
    >({
      id: "runtime.correlation.save",
      params: () => ({
        id: "project-1",
        name: "Patched by event",
      }),
      commit: () => Effect.succeed({ ok: true as const }),
    });
    const tokens = createControlledStream<string>("runtime.correlation.tokens");
    const childMachine = flow.machine<{}, never, "done">({
      id: "runtime.correlation.child.machine",
      initial: "done",
      context: () => ({}),
      states: {
        done: {
          type: "final",
        },
      },
    });
    const machine = flow.machine<
      {},
      Readonly<{ readonly type: "START" }> | Readonly<{ readonly type: "TIMEOUT" }>,
      "idle" | "running" | "timedOut"
    >({
      id: "runtime.correlation.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            START: "running",
          },
        },
        running: {
          invoke: [
            flow.patch(project.ref("project-1"), {
              name: "Patched by event",
            }),
            flow.run(saveProject),
            flow.stream({
              id: "runtime.correlation.stream",
              subscribe: () => tokens.stream(),
            }),
            flow.child({
              id: "runtime.correlation.child",
              machine: childMachine,
            }),
          ],
          after: flow.after({
            id: "runtime.correlation.timer",
            delay: "1 second",
            target: "timedOut",
          }),
        },
        timedOut: {},
      },
    });

    const runtime = createFocusedRuntimeWithTestClock(machine, "RuntimeCorrelation");

    runtime.resources.seedResources([
      {
        ref: project.ref("project-1"),
        value: { id: "project-1", name: "Seeded" },
      },
    ]);

    const actor = runtime.createActor(machine);

    actor.send({ type: "START" });
    tokens.end();
    await actor.flush();
    await runtime.runPromise(TestClock.adjust("1 second"));
    await actor.flush();

    const trace = captureTrace(actor.snapshot());
    const startCorrelation = trace.report.correlations.find(
      (correlation) => correlation.event.eventType === "START",
    );

    expect(startCorrelation).toBeDefined();
    expect(startCorrelation?.transitions.map((receipt) => receipt.type)).toEqual([
      "machine:transition",
      "machine:microstep",
    ]);
    expect(startCorrelation?.resources.map((receipt) => receipt.type)).toEqual([
      "resource:patch",
      "resource:freshness",
    ]);
    expect(startCorrelation?.transactions.map((receipt) => receipt.type)).toEqual([
      "transaction:start",
      "transaction:success",
    ]);
    expect(startCorrelation?.streams.map((receipt) => receipt.type)).toEqual([
      "stream:start",
      "stream:done",
    ]);
    expect(startCorrelation?.children.map((receipt) => receipt.type)).toEqual([
      "child:start",
      "child:success",
    ]);
    expect(startCorrelation?.timers.map((receipt) => receipt.type)).toEqual([
      "timer:start",
      "timer:fire",
    ]);
    expect(startCorrelation?.summary).toMatchObject({
      eventType: "START",
      receiptTypes: expect.arrayContaining([
        "machine:event",
        "resource:freshness",
        "transaction:start",
        "transaction:success",
        "stream:start",
        "stream:done",
        "child:start",
        "child:success",
        "timer:start",
        "timer:fire",
      ]),
      relatedIds: expect.arrayContaining([
        "runtime.correlation.machine",
        "runtime.correlation.project",
        "runtime.correlation.save",
        "runtime.correlation.stream",
        "runtime.correlation.child",
        "runtime.correlation.timer",
      ]),
    });
    expect(startCorrelation?.details.streams).toEqual([
      {
        id: "runtime.correlation.stream",
        receiptTypes: ["stream:start", "stream:done"],
        relatedIds: ["runtime.correlation.stream"],
        parentState: "running",
        statusAfter: "success",
        generation: 1,
        emittedCount: 0,
        completion: "done",
        restored: false,
        lastValueAvailable: false,
      },
    ]);
    expect(startCorrelation?.details.timers).toEqual([
      {
        id: "runtime.correlation.timer",
        receiptTypes: ["timer:start", "timer:fire"],
        relatedIds: ["runtime.correlation.timer"],
        parentState: "running",
        statusAfter: "fired",
        generation: 1,
        dueAt: 1_000,
        startedAt: 0,
        endedAt: 1_000,
        scheduledMillis: 1_000,
        elapsedMillis: 1_000,
        outcome: "fire",
        restored: false,
      },
    ]);

    await runtime.dispose();
  });

  it("keeps flowTest trace correlation aligned for supported harness receipt buckets", async () => {
    const saveProject = flow.transaction<
      { readonly id: string; readonly name: string },
      Readonly<{ readonly ok: true }>
    >({
      id: "flow-test.correlation.save",
      params: () => ({
        id: "project-1",
        name: "Patched by event",
      }),
      commit: () => Effect.succeed({ ok: true as const }),
    });
    const tokens = createControlledStream<string>("flow-test.correlation.tokens");
    const childMachine = flow.machine<{}, never, "done">({
      id: "flow-test.correlation.child.machine",
      initial: "done",
      context: () => ({}),
      states: {
        done: {
          type: "final",
        },
      },
    });
    const machine = flow.machine<
      {},
      Readonly<{ readonly type: "START" }> | Readonly<{ readonly type: "TIMEOUT" }>,
      "idle" | "running" | "timedOut"
    >({
      id: "flow-test.correlation.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            START: "running",
          },
        },
        running: {
          invoke: [
            flow.run(saveProject),
            flow.stream({
              id: "flow-test.correlation.stream",
              subscribe: () => tokens.stream(),
            }),
            flow.child({
              id: "flow-test.correlation.child",
              machine: childMachine,
            }),
          ],
          after: flow.after({
            id: "flow-test.correlation.timer",
            delay: "1 second",
            target: "timedOut",
          }),
        },
        timedOut: {},
      },
    });

    const harness = flowTest(machine).start();

    harness.send({ type: "START" });
    tokens.end();
    await harness.flush();
    await harness.advance("1 second");

    const trace = captureTrace(harness.snapshot());
    const startCorrelation = trace.report.correlations.find(
      (correlation) => correlation.event.eventType === "START",
    );

    expect(startCorrelation).toBeDefined();
    expect(startCorrelation?.transitions.map((receipt) => receipt.type)).toEqual([
      "machine:transition",
      "machine:microstep",
    ]);
    expect(startCorrelation?.transactions.map((receipt) => receipt.type)).toEqual([
      "transaction:start",
      "transaction:success",
    ]);
    expect(startCorrelation?.streams.map((receipt) => receipt.type)).toEqual([
      "stream:start",
      "stream:done",
    ]);
    expect(startCorrelation?.children.map((receipt) => receipt.type)).toEqual([
      "child:start",
      "child:success",
    ]);
    expect(startCorrelation?.timers.map((receipt) => receipt.type)).toEqual([
      "timer:start",
      "timer:fire",
    ]);
    expect(startCorrelation?.summary).toMatchObject({
      eventType: "START",
      receiptTypes: expect.arrayContaining([
        "machine:event",
        "transaction:start",
        "transaction:success",
        "stream:start",
        "stream:done",
        "child:start",
        "child:success",
        "timer:start",
        "timer:fire",
      ]),
      relatedIds: expect.arrayContaining([
        "flow-test.correlation.machine",
        "flow-test.correlation.save",
        "flow-test.correlation.stream",
        "flow-test.correlation.child",
        "flow-test.correlation.timer",
      ]),
    });
    expect(startCorrelation?.details.streams).toEqual([
      {
        id: "flow-test.correlation.stream",
        receiptTypes: ["stream:start", "stream:done"],
        relatedIds: ["flow-test.correlation.stream"],
        parentState: "running",
        statusAfter: "success",
        generation: 1,
        emittedCount: 0,
        completion: "done",
        restored: false,
        lastValueAvailable: false,
      },
    ]);
    expect(startCorrelation?.details.timers).toEqual([
      {
        id: "flow-test.correlation.timer",
        receiptTypes: ["timer:start", "timer:fire"],
        relatedIds: ["flow-test.correlation.timer"],
        parentState: "running",
        statusAfter: "fired",
        generation: 1,
        dueAt: 1_000,
        startedAt: 0,
        endedAt: 1_000,
        scheduledMillis: 1_000,
        elapsedMillis: 1_000,
        outcome: "fire",
        restored: false,
      },
    ]);
  });

  it("captures richer flowTest transaction trace details for queued overlap, previews, timings, and routed success", async () => {
    interface ProjectRecord {
      readonly id: string;
      readonly name: string;
    }

    interface SaveContext {
      readonly projectId: string;
      readonly draft: ProjectRecord;
      readonly savedNames: ReadonlyArray<string>;
    }

    type SaveEvent =
      | Readonly<{ readonly type: "SAVE"; readonly name: string }>
      | Readonly<{ readonly type: "SAVED"; readonly project: ProjectRecord }>;

    const projectResource = flow.resource<[projectId: string], ProjectRecord>({
      id: "flow-test.transaction.project",
      key: (projectId) => createKey("flow-test-transaction-project", projectId),
      lookup: (projectId) => Effect.succeed({ id: projectId, name: "Loaded" }),
    });
    const saveProject = flow.transaction<
      Readonly<{ readonly id: string; readonly draft: ProjectRecord }>,
      ProjectRecord,
      never,
      never,
      SaveEvent
    >({
      id: "flow-test.transaction.save",
      params: ({ context }: { readonly context: SaveContext }) => ({
        id: context.projectId,
        draft: context.draft,
      }),
      preview: {
        apply: ({ params }) => [
          {
            ref: projectResource.ref(params.id),
            replace: params.draft,
          },
        ],
      },
      commit: (params) => Effect.sleep("1 second").pipe(Effect.as(params.draft)),
      routes: flow.outcomes<ProjectRecord, never, SaveEvent>({
        success: ({ value }) => ({
          type: "SAVED",
          project: value,
        }),
      }),
      concurrency: "serialize",
      scope: {
        id: "flow-test.transaction.scope",
      },
    });
    const machine = flow.machine<SaveContext, SaveEvent, "ready", "ready">({
      id: "flow-test.transaction.machine",
      initial: "ready",
      context: () => ({
        projectId: "project-1",
        draft: { id: "project-1", name: "Seeded" },
        savedNames: [],
      }),
      states: {
        ready: {
          on: {
            SAVE: {
              submit: saveProject,
              update: ({ context, event }) =>
                event.type === "SAVE"
                  ? {
                      draft: {
                        ...context.draft,
                        name: event.name,
                      },
                    }
                  : {},
            },
            SAVED: {
              update: ({ context, event }) =>
                event.type === "SAVED"
                  ? {
                      draft: event.project,
                      savedNames: [...context.savedNames, event.project.name],
                    }
                  : {},
            },
          },
        },
      },
    });

    const harness = flowTest(machine).start();

    harness.send({ type: "SAVE", name: "Draft A" });
    harness.send({ type: "SAVE", name: "Draft B" });
    await harness.flush();
    await harness.advance("1 second");
    await harness.advance("1 second");

    expect(
      harness
        .snapshot()
        .receipts.filter(
          (receipt: { readonly id?: string }) => receipt.id === "flow-test.transaction.save",
        ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "transaction:queue",
          queueKey: "flow-test.transaction.scope",
          overlapCause: "active-attempt",
        }),
        expect.objectContaining({
          type: "transaction:dequeue",
          queueKey: "flow-test.transaction.scope",
          overlapCause: "active-attempt",
        }),
        expect.objectContaining({
          type: "transaction:preview-patch",
          generation: 2,
          queueKey: "flow-test.transaction.scope",
          refId: "flow-test.transaction.project",
          previewIndex: 1,
          previewCount: 1,
        }),
        expect.objectContaining({
          type: "transaction:success",
          generation: 2,
          queueKey: "flow-test.transaction.scope",
          startedAt: 1_000,
          endedAt: 2_000,
          durationMillis: 1_000,
          routedEventType: "SAVED",
        }),
      ]),
    );

    const saveCorrelations = captureTrace(harness.snapshot()).report.correlations.filter(
      (correlation) => correlation.event.eventType === "SAVE",
    );

    expect(saveCorrelations).toHaveLength(2);
    expect(saveCorrelations[1]?.details.transactions).toEqual([
      {
        id: "flow-test.transaction.save",
        receiptTypes: [
          "transaction:queue",
          "transaction:dequeue",
          "transaction:start",
          "transaction:preview-patch",
          "transaction:success",
        ],
        relatedIds: ["flow-test.transaction.save"],
        parentState: "ready",
        statusAfter: "success",
        trigger: "event",
        generation: 2,
        queued: true,
        dequeued: true,
        queueCause: "serialize-overlap",
        queueKey: "flow-test.transaction.scope",
        overlapCauses: ["active-attempt"],
        attemptTimings: [
          {
            generation: 2,
            startedAt: 1_000,
            endedAt: 2_000,
            durationMillis: 1_000,
          },
        ],
        previews: [
          {
            generation: 2,
            refIds: ["flow-test.transaction.project"],
          },
        ],
        rollbacks: [],
        routedEvents: [
          {
            lane: "success",
            eventType: "SAVED",
            generation: 2,
          },
        ],
        attempts: 1,
      },
    ]);
  });

  it("records stream and timer interrupt reasons when state-owned work stops on state exit", async () => {
    const tokens = createControlledStream<string>("runtime.interrupt-reasons.tokens");
    const machine = flow.machine<
      { readonly latest: string },
      Readonly<{ readonly type: "START" }> | Readonly<{ readonly type: "STOP" }>,
      "idle" | "running" | "timedOut",
      "idle"
    >({
      id: "runtime.interrupt-reasons.machine",
      initial: "idle",
      context: () => ({ latest: "" }),
      states: {
        idle: {
          on: {
            START: "running",
          },
        },
        running: {
          invoke: flow.stream({
            id: "runtime.interrupt-reasons.stream",
            subscribe: () => tokens.stream(),
          }),
          after: flow.after({
            id: "runtime.interrupt-reasons.timer",
            delay: "1 second",
            target: "timedOut",
          }),
          on: {
            STOP: "idle",
          },
        },
        timedOut: {},
      },
    });

    const runtime = createFocusedRuntimeWithTestClock(machine, "RuntimeInterruptReasons");
    const actor = runtime.createActor(machine);

    actor.send({ type: "START" });
    await actor.flush();
    tokens.emit("hello");
    await actor.flush();

    actor.send({ type: "STOP" });
    await actor.flush();

    const stopCorrelation = captureTrace(actor.snapshot()).report.correlations.find(
      (correlation) => correlation.event.eventType === "STOP",
    );

    expect(stopCorrelation?.details.streams).toEqual([
      {
        id: "runtime.interrupt-reasons.stream",
        receiptTypes: ["stream:interrupt"],
        relatedIds: ["runtime.interrupt-reasons.stream"],
        parentState: "running",
        statusAfter: "interrupt",
        generation: 1,
        emittedCount: 1,
        completion: "interrupt",
        restored: false,
        lastValueAvailable: true,
        interruptReason: "state-exit",
      },
    ]);
    expect(stopCorrelation?.details.timers).toEqual([
      {
        id: "runtime.interrupt-reasons.timer",
        receiptTypes: ["timer:interrupt"],
        relatedIds: ["runtime.interrupt-reasons.timer"],
        parentState: "running",
        statusAfter: "interrupt",
        generation: 1,
        dueAt: 1_000,
        startedAt: 0,
        endedAt: 0,
        scheduledMillis: 1_000,
        elapsedMillis: 0,
        outcome: "interrupt",
        restored: false,
        interruptReason: "state-exit",
      },
    ]);

    expect(runtime.inspection.entries({ family: "stream" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "stream:interrupt",
          id: "runtime.interrupt-reasons.stream",
          emitted: 1,
          lastValueAvailable: true,
          restored: false,
          interruptReason: "state-exit",
        }),
      ]),
    );
    expect(runtime.inspection.entries({ family: "timer" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "timer:interrupt",
          id: "runtime.interrupt-reasons.timer",
          startedAt: 0,
          dueAt: 1_000,
          endedAt: 0,
          scheduledMillis: 1_000,
          elapsedMillis: 0,
          restored: false,
          interruptReason: "state-exit",
        }),
      ]),
    );

    await runtime.dispose();
  });
});
