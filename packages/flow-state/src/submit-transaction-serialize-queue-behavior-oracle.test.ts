import { describe, expect, it } from "vite-plus/test";

import {
  callNames,
  createAbortableSaveLayer,
  createControlledSaveLayer,
  serializeQueueBehaviorProjectId,
  serializeQueueBehaviorProjectResourceId,
  serializeQueueBehaviorTransactionId,
  startSerializeQueueBehaviorFlowTest,
  startSerializeQueueBehaviorRuntimeActor,
} from "./testing/fixtures/submit-transaction-serialize-queue-behavior.js";

async function expectSerializeQueueCapacityOracleInFlowTest() {
  const controls = createControlledSaveLayer();
  const harness = startSerializeQueueBehaviorFlowTest(controls, [
    { type: "SAVE", name: "Draft A" },
    { type: "SAVE", name: "Draft B" },
    { type: "SAVE", name: "Draft C" },
  ]);

  expect(callNames(controls)).toEqual(["Draft A"]);
  expect(harness.cache().query(serializeQueueBehaviorProjectResourceId)).toMatchObject({
    value: { id: serializeQueueBehaviorProjectId, name: "Draft A" },
  });
  expect(harness.transactions().previewPatches(serializeQueueBehaviorTransactionId)).toHaveLength(
    1,
  );
  expect(harness.transactions().queued(serializeQueueBehaviorTransactionId)).toHaveLength(1);
  expect(harness.transactions().get(serializeQueueBehaviorTransactionId)).toMatchObject({
    status: "pending",
  });
  expect(
    harness
      .transactions()
      .events(serializeQueueBehaviorTransactionId)
      .filter((receipt) => receipt.type === "transaction:reject"),
  ).toEqual([
    expect.objectContaining({
      queueKey: serializeQueueBehaviorTransactionId,
      overlapCause: "active-attempt",
      activeAttemptCount: 1,
      queuedAttemptCount: 1,
      queueCapacity: 1,
      parentState: "ready",
    }),
  ]);
  expect(harness.issues()).toEqual([
    expect.objectContaining({
      kind: "failure",
      source: "transaction",
      id: serializeQueueBehaviorTransactionId,
      error: expect.objectContaining({
        code: "FLOW-TXN-004",
        title: "Transaction 'transactions.save-serial' exceeded the serialized queue capacity",
      }),
      facts: expect.objectContaining({
        correlationId: expect.any(String),
        parentState: "ready",
        receiptTypes: ["transaction:reject"],
        relatedIds: [serializeQueueBehaviorTransactionId],
      }),
    }),
  ]);
}

async function expectSerializeQueueCapacityOracleInRuntimeActors() {
  const controls = createControlledSaveLayer();
  const { actor, runtime } = startSerializeQueueBehaviorRuntimeActor(controls);

  try {
    actor.send({ type: "SAVE", name: "Draft A" });
    actor.send({ type: "SAVE", name: "Draft B" });
    actor.send({ type: "SAVE", name: "Draft C" });

    expect(callNames(controls)).toEqual(["Draft A"]);
    expect(actor.snapshot().resources[serializeQueueBehaviorProjectResourceId]).toMatchObject({
      value: { id: serializeQueueBehaviorProjectId, name: "Draft A" },
    });
    expect(actor.snapshot().transactions[serializeQueueBehaviorTransactionId]).toMatchObject({
      status: "pending",
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === serializeQueueBehaviorTransactionId &&
            receipt.type === "transaction:preview-patch",
        ),
    ).toHaveLength(1);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === serializeQueueBehaviorTransactionId &&
            receipt.type === "transaction:queue",
        ),
    ).toHaveLength(1);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === serializeQueueBehaviorTransactionId &&
            receipt.type === "transaction:reject",
        ),
    ).toEqual([
      expect.objectContaining({
        queueKey: serializeQueueBehaviorTransactionId,
        overlapCause: "active-attempt",
        activeAttemptCount: 1,
        queuedAttemptCount: 1,
        queueCapacity: 1,
        parentState: "ready",
      }),
    ]);
    expect(actor.issues()).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "transaction",
        id: serializeQueueBehaviorTransactionId,
        error: expect.objectContaining({
          code: "FLOW-TXN-004",
          title: "Transaction 'transactions.save-serial' exceeded the serialized queue capacity",
        }),
        facts: expect.objectContaining({
          correlationId: expect.any(String),
          parentState: "ready",
          receiptTypes: ["transaction:reject"],
          relatedIds: [serializeQueueBehaviorTransactionId],
        }),
      }),
    ]);
  } finally {
    await runtime.dispose();
  }
}

async function expectSerializeQueuedPredecessorStallOracleInFlowTest() {
  const controls = createAbortableSaveLayer();
  const harness = startSerializeQueueBehaviorFlowTest(controls, [
    { type: "SAVE", name: "Draft A" },
    { type: "SAVE", name: "Draft B" },
  ]);

  expect(callNames(controls)).toEqual(["Draft A"]);
  expect(controls.entries).toHaveLength(1);
  expect(controls.entryAt(0).signal.aborted).toBe(false);
  expect(harness.cache().query(serializeQueueBehaviorProjectResourceId)).toMatchObject({
    value: { id: serializeQueueBehaviorProjectId, name: "Draft A" },
  });
  expect(harness.transactions().previewPatches(serializeQueueBehaviorTransactionId)).toHaveLength(
    1,
  );
  expect(harness.transactions().queued(serializeQueueBehaviorTransactionId)).toHaveLength(1);
  expect(harness.transactions().get(serializeQueueBehaviorTransactionId)).toMatchObject({
    status: "pending",
  });
  expect(harness.pendingWork()).toMatchObject({
    ready: 0,
    activeFibers: 1,
    mailboxes: [],
    transactions: [serializeQueueBehaviorTransactionId],
  });
  expect(
    harness
      .transactions()
      .events(serializeQueueBehaviorTransactionId)
      .map((receipt) => receipt.type),
  ).toEqual(expect.arrayContaining(["transaction:start", "transaction:queue"]));
  expect(
    harness
      .transactions()
      .events(serializeQueueBehaviorTransactionId)
      .filter((receipt) => receipt.type === "transaction:dequeue"),
  ).toHaveLength(0);

  await harness.flush();
  await harness.flush();

  expect(callNames(controls)).toEqual(["Draft A"]);
  expect(controls.entries).toHaveLength(1);
  expect(controls.entryAt(0).signal.aborted).toBe(false);
  expect(harness.cache().query(serializeQueueBehaviorProjectResourceId)).toMatchObject({
    value: { id: serializeQueueBehaviorProjectId, name: "Draft A" },
  });
  expect(harness.transactions().get(serializeQueueBehaviorTransactionId)).toMatchObject({
    status: "pending",
  });
  expect(harness.pendingWork()).toMatchObject({
    ready: 0,
    activeFibers: 1,
    mailboxes: [],
    transactions: [serializeQueueBehaviorTransactionId],
  });
  expect(
    harness
      .transactions()
      .events(serializeQueueBehaviorTransactionId)
      .filter((receipt) => receipt.type === "transaction:dequeue"),
  ).toHaveLength(0);
}

async function expectSerializeQueuedPredecessorStallOracleInRuntimeActors() {
  const controls = createAbortableSaveLayer();
  const { actor, runtime } = startSerializeQueueBehaviorRuntimeActor(controls);

  try {
    actor.send({ type: "SAVE", name: "Draft A" });
    actor.send({ type: "SAVE", name: "Draft B" });

    expect(callNames(controls)).toEqual(["Draft A"]);
    expect(controls.entries).toHaveLength(1);
    expect(controls.entryAt(0).signal.aborted).toBe(false);
    expect(actor.snapshot().resources[serializeQueueBehaviorProjectResourceId]).toMatchObject({
      value: { id: serializeQueueBehaviorProjectId, name: "Draft A" },
    });
    expect(actor.snapshot().transactions[serializeQueueBehaviorTransactionId]).toMatchObject({
      status: "pending",
    });
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.id === serializeQueueBehaviorTransactionId)
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:start", "transaction:queue"]));
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === serializeQueueBehaviorTransactionId &&
            receipt.type === "transaction:dequeue",
        ),
    ).toHaveLength(0);

    await actor.flush();
    await actor.flush();

    expect(callNames(controls)).toEqual(["Draft A"]);
    expect(controls.entries).toHaveLength(1);
    expect(controls.entryAt(0).signal.aborted).toBe(false);
    expect(actor.snapshot().resources[serializeQueueBehaviorProjectResourceId]).toMatchObject({
      value: { id: serializeQueueBehaviorProjectId, name: "Draft A" },
    });
    expect(actor.snapshot().transactions[serializeQueueBehaviorTransactionId]).toMatchObject({
      status: "pending",
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === serializeQueueBehaviorTransactionId &&
            receipt.type === "transaction:dequeue",
        ),
    ).toHaveLength(0);
  } finally {
    await runtime.dispose();
  }
}

describe("submit transaction serialize queue behavior oracle", () => {
  it("matches the serialized queue-capacity oracle in flowTest", async () => {
    await expectSerializeQueueCapacityOracleInFlowTest();
  });

  it("matches the serialized queue-capacity oracle in runtime actors", async () => {
    await expectSerializeQueueCapacityOracleInRuntimeActors();
  });

  it("matches the stalled queued serialize predecessor oracle in flowTest", async () => {
    await expectSerializeQueuedPredecessorStallOracleInFlowTest();
  });

  it("matches the stalled queued serialize predecessor oracle in runtime actors", async () => {
    await expectSerializeQueuedPredecessorStallOracleInRuntimeActors();
  });
});
