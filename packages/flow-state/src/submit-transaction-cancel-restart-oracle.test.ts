import { describe, expect, it } from "vite-plus/test";

import {
  callNames,
  cancelRestartProjectId,
  cancelRestartProjectResourceId,
  cancelRestartTransactionId,
  createAbortSignalLayer,
  createControlledSaveLayer,
  startCancelRestartFlowTest,
  startCancelRestartRuntimeActor,
} from "./testing/fixtures/submit-transaction-cancel-restart.js";

async function expectCancelRestartOracleInFlowTest() {
  const controls = createControlledSaveLayer();
  const harness = startCancelRestartFlowTest(controls, [
    { type: "SAVE", name: "Draft A" },
    { type: "SAVE", name: "Draft B" },
  ]);

  expect(callNames(controls)).toEqual(["Draft A", "Draft B"]);
  expect(harness.cache().query(cancelRestartProjectResourceId)).toMatchObject({
    value: { id: cancelRestartProjectId, name: "Draft B" },
  });
  expect(harness.transactions().previewPatches(cancelRestartTransactionId)).toHaveLength(2);
  expect(harness.transactions().rollbacks(cancelRestartTransactionId)).toHaveLength(1);
  expect(harness.transactions().get(cancelRestartTransactionId)).toMatchObject({
    status: "pending",
  });

  const eventTypes = harness
    .transactions()
    .events(cancelRestartTransactionId)
    .map((receipt) => receipt.type);
  expect(eventTypes.filter((type) => type === "transaction:start")).toHaveLength(2);
  expect(eventTypes.filter((type) => type === "transaction:interrupt")).toHaveLength(1);

  controls.succeedAt(1, { id: cancelRestartProjectId, name: "Draft B" });
  await harness.flush();
  await harness.flush();

  controls.succeedAt(0, { id: cancelRestartProjectId, name: "Draft A" });
  await harness.flush();
  await harness.flush();

  expect(harness.context()).toMatchObject({
    savedNames: ["Draft B"],
    error: null,
  });
  expect(harness.transactions().get(cancelRestartTransactionId)).toMatchObject({
    status: "success",
    value: { id: cancelRestartProjectId, name: "Draft B" },
  });
  expect(
    harness
      .transactions()
      .events(cancelRestartTransactionId)
      .filter((receipt) => receipt.type === "transaction:success"),
  ).toHaveLength(1);
  expect(harness.issues()).toEqual([]);
}

async function expectCancelRestartOracleInRuntimeActors() {
  const controls = createControlledSaveLayer();
  const { actor, runtime } = startCancelRestartRuntimeActor(controls);

  try {
    actor.send({ type: "SAVE", name: "Draft A" });
    actor.send({ type: "SAVE", name: "Draft B" });

    expect(callNames(controls)).toEqual(["Draft A", "Draft B"]);
    expect(actor.snapshot().resources[cancelRestartProjectResourceId]).toMatchObject({
      value: { id: cancelRestartProjectId, name: "Draft B" },
    });

    const initialEventTypes = actor
      .receipts()
      .filter((receipt) => receipt.id === cancelRestartTransactionId)
      .map((receipt) => receipt.type);
    expect(initialEventTypes.filter((type) => type === "transaction:start")).toHaveLength(2);
    expect(initialEventTypes.filter((type) => type === "transaction:interrupt")).toHaveLength(1);
    expect(initialEventTypes.filter((type) => type === "transaction:rollback")).toHaveLength(1);
    expect(actor.snapshot().transactions[cancelRestartTransactionId]).toMatchObject({
      status: "pending",
    });

    controls.succeedAt(1, { id: cancelRestartProjectId, name: "Draft B" });
    await actor.flush();
    await actor.flush();

    controls.succeedAt(0, { id: cancelRestartProjectId, name: "Draft A" });
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context.savedNames).toEqual(["Draft B"]);
    expect(actor.snapshot().transactions[cancelRestartTransactionId]).toMatchObject({
      status: "success",
      value: { id: cancelRestartProjectId, name: "Draft B" },
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === cancelRestartTransactionId && receipt.type === "transaction:success",
        ),
    ).toHaveLength(1);
    expect(actor.issues()).toEqual([]);
  } finally {
    await runtime.dispose();
  }
}

async function expectCancelRestartAbortSignalOracleInFlowTest() {
  const controls = createAbortSignalLayer();
  const harness = startCancelRestartFlowTest(controls, [
    { type: "SAVE", name: "Draft A" },
    { type: "SAVE", name: "Draft B" },
  ]);

  await harness.flush();

  expect(controls.abortSignals).toHaveLength(2);
  expect(controls.abortSignals[0]?.name).toBe("Draft A");
  expect(controls.abortSignals[0]?.signal.aborted).toBe(true);
  expect(controls.abortSignals[1]?.name).toBe("Draft B");
  expect(controls.abortSignals[1]?.signal.aborted).toBe(false);
  expect(
    harness
      .transactions()
      .events(cancelRestartTransactionId)
      .map((receipt) => receipt.type),
  ).toEqual(expect.arrayContaining(["transaction:start", "transaction:interrupt"]));

  harness.send({ type: "SAVE", name: "Draft C" });
  await harness.flush();

  expect(controls.abortSignals[1]?.signal.aborted).toBe(true);
  expect(controls.abortSignals[2]?.name).toBe("Draft C");
  expect(controls.abortSignals[2]?.signal.aborted).toBe(false);
}

async function expectCancelRestartAbortSignalOracleInRuntimeActors() {
  const controls = createAbortSignalLayer();
  const { actor, runtime } = startCancelRestartRuntimeActor(controls);

  try {
    actor.send({ type: "SAVE", name: "Draft A" });
    actor.send({ type: "SAVE", name: "Draft B" });
    await actor.flush();

    expect(controls.abortSignals).toHaveLength(2);
    expect(controls.abortSignals[0]?.name).toBe("Draft A");
    expect(controls.abortSignals[0]?.signal.aborted).toBe(true);
    expect(controls.abortSignals[1]?.name).toBe("Draft B");
    expect(controls.abortSignals[1]?.signal.aborted).toBe(false);
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.id === cancelRestartTransactionId)
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:start", "transaction:interrupt"]));

    await actor.dispose();
    expect(controls.abortSignals[1]?.signal.aborted).toBe(true);
  } finally {
    await runtime.dispose();
  }
}

describe("submit transaction cancel restart oracle", () => {
  it("matches the cancel-previous restart oracle in flowTest", async () => {
    await expectCancelRestartOracleInFlowTest();
  });

  it("matches the cancel-previous restart oracle in runtime actors", async () => {
    await expectCancelRestartOracleInRuntimeActors();
  });

  it("matches the cancel-previous abort-signal oracle in flowTest", async () => {
    await expectCancelRestartAbortSignalOracleInFlowTest();
  });

  it("matches the cancel-previous abort-signal oracle in runtime actors", async () => {
    await expectCancelRestartAbortSignalOracleInRuntimeActors();
  });
});
