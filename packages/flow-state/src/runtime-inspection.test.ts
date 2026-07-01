import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import { captureTrace } from "./inspect.js";
import { FlowDiagnostic } from "./diagnostics.js";
import type { FlowInspectionSnapshotEvent } from "./inspect.js";
import { createControlledStream, flowTest } from "./testing.js";
import { createKey, flow } from "./index.js";
import { createRuntime } from "./runtime/contract-runtime.js";

describe("runtime inspection receipts", () => {
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
    expect(captured.lastSequence).toBe(capturedSequences.at(-1));

    actor.send({ type: "RESET" });
    await actor.flush();

    const liveEntries = runtime.inspection.entries();
    expect(liveEntries).toHaveLength(4);
    expect(liveEntries[0]?.sequence).toBeGreaterThan(capturedSequences[0] ?? 0);
    expect(captured.entries.map((event) => event.sequence)).toEqual(capturedSequences);

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

    const runtime = flow.runtime(
      flow.app({ modules: [] }).layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [TestClock.layer()],
      }),
    );
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

    const runtime = flow.runtime(
      flow.app({ modules: [] }).layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [TestClock.layer()],
      }),
    );

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
    expect(startCorrelation?.resources.map((receipt) => receipt.type)).toEqual(["resource:patch"]);
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
        "runtime.correlation.machine",
        "runtime.correlation.project",
        "runtime.correlation.save",
        "runtime.correlation.stream",
        "runtime.correlation.child",
        "runtime.correlation.timer",
      ]),
    });

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
      "child:stop",
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
        "child:stop",
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
  });
});
