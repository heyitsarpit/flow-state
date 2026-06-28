import { describe, expect, it } from "vite-plus/test";

import { createControlledStream, createRuntime, flow, flowTest } from "./index.js";

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
});
