import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import {
  createControlledStream,
  createKey,
  createRuntime,
  flow,
  flowExperimental,
  flowTest,
} from "./index.js";

describe("runtime inspection receipts", () => {
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

    const harness = flowTest.start(machine).start();

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
        store: flow.store.test({ namespace: "runtime-correlation" }),
        orchestrators: flow.orchestrators.test({ deterministic: true }),
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

    const trace = flowExperimental.captureTrace(actor.snapshot());
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

    const harness = flowTest.start(machine).start();

    harness.send({ type: "START" });
    tokens.end();
    await harness.flush();
    await harness.advance("1 second");

    const trace = flowExperimental.captureTrace(harness.snapshot());
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
  });
});
