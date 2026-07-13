import { describe, expect, it } from "vite-plus/test";

import {
  callNames,
  createRetrySaveLayer,
  serializeProgressionTransactionId,
  startSerializeProgressionFlowTest,
  startSerializeProgressionRuntimeActor,
} from "./testing/fixtures/submit-transaction-serialize-progression.js";

async function expectSerializeRetryResetOracleInFlowTest() {
  const controls = createRetrySaveLayer();
  const harness = startSerializeProgressionFlowTest(controls, [
    { type: "SAVE", name: "Draft Retry" },
  ]);

  expect(harness.resetTransaction(serializeProgressionTransactionId)).toBe(false);

  await harness.flush();

  expect(harness.context().savedNames).toEqual([]);
  expect(harness.transactions().get(serializeProgressionTransactionId)).toMatchObject({
    status: "failure",
  });
  expect(harness.issues()).toEqual([
    expect.objectContaining({
      kind: "failure",
      source: "transaction",
      id: serializeProgressionTransactionId,
      error: "conflict",
      handled: true,
    }),
  ]);

  expect(harness.retryTransaction(serializeProgressionTransactionId)).toBe(true);
  expect(callNames(controls)).toEqual(["Draft Retry", "Draft Retry"]);
  expect(harness.transactions().get(serializeProgressionTransactionId)).toMatchObject({
    status: "pending",
  });
  expect(harness.issues()).toEqual([]);

  await harness.flush();
  await harness.flush();

  expect(harness.context()).toMatchObject({
    savedNames: ["Draft Retry"],
    error: null,
  });
  expect(
    harness
      .transactions()
      .events(serializeProgressionTransactionId)
      .map((receipt) => receipt.type),
  ).toEqual(
    expect.arrayContaining(["transaction:failure", "transaction:retry", "transaction:success"]),
  );

  expect(harness.resetTransaction(serializeProgressionTransactionId)).toBe(true);
  expect(harness.transactions().get(serializeProgressionTransactionId)).toMatchObject({
    status: "idle",
  });
  expect(
    harness
      .transactions()
      .events(serializeProgressionTransactionId)
      .map((receipt) => receipt.type),
  ).toEqual(expect.arrayContaining(["transaction:reset"]));
}

async function expectSerializeRetryResetOracleInRuntimeActors() {
  const controls = createRetrySaveLayer();
  const { actor, runtime } = startSerializeProgressionRuntimeActor(
    "transactions-serialize-retry-reset-actor",
    controls,
  );

  try {
    actor.send({ type: "SAVE", name: "Draft Retry" });

    expect(actor.resetTransaction(serializeProgressionTransactionId)).toBe(false);

    await actor.flush();

    expect(actor.snapshot().context.savedNames).toEqual([]);
    expect(actor.snapshot().transactions[serializeProgressionTransactionId]).toMatchObject({
      status: "failure",
    });
    expect(actor.issues()).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "transaction",
        id: serializeProgressionTransactionId,
        error: "conflict",
        handled: true,
      }),
    ]);

    expect(actor.retryTransaction(serializeProgressionTransactionId)).toBe(true);
    expect(callNames(controls)).toEqual(["Draft Retry", "Draft Retry"]);
    expect(actor.snapshot().transactions[serializeProgressionTransactionId]).toMatchObject({
      status: "pending",
    });
    expect(actor.issues()).toEqual([]);

    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context).toMatchObject({
      savedNames: ["Draft Retry"],
      error: null,
    });
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.id === serializeProgressionTransactionId)
        .map((receipt) => receipt.type),
    ).toEqual(
      expect.arrayContaining(["transaction:failure", "transaction:retry", "transaction:success"]),
    );

    expect(actor.resetTransaction(serializeProgressionTransactionId)).toBe(true);
    expect(actor.snapshot().transactions[serializeProgressionTransactionId]).toMatchObject({
      status: "idle",
    });
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.id === serializeProgressionTransactionId)
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:reset"]));
  } finally {
    await runtime.dispose();
  }
}

describe("submit transaction serialize retry reset oracle", () => {
  it("matches the serialize retry/reset oracle in flowTest", async () => {
    await expectSerializeRetryResetOracleInFlowTest();
  });

  it("matches the serialize retry/reset oracle in runtime actors", async () => {
    await expectSerializeRetryResetOracleInRuntimeActors();
  });
});
