import { describe, expect, it } from "vite-plus/test";

import {
  callNames,
  createControlledSaveExitLayer,
  createControlledSaveLayer,
  serializeProgressionProjectResourceId,
  serializeProgressionProjectId,
  serializeProgressionTransactionId,
  startSerializeProgressionFlowTest,
  startSerializeProgressionRuntimeActor,
  type ControlledSaveExitLayer,
  type ControlledSaveLayer,
  type TransactionReceiptCounts,
} from "./testing/fixtures/submit-transaction-serialize-progression.js";

type SerializeProgressionCase = Readonly<{
  readonly actorId: string;
  readonly activeName: string;
  readonly queuedName: string;
}>;

type SerializePredecessorTerminalOutcome = "failure" | "defect";

const serializeProgressionCases = [
  {
    actorId: "transactions-serialize-runtime-actor",
    activeName: "Draft A",
    queuedName: "Draft B",
  },
] as const satisfies ReadonlyArray<SerializeProgressionCase>;

function serializeProgressionOracle(caseDef: SerializeProgressionCase) {
  return Object.freeze({
    pending: Object.freeze({
      callNames: [caseDef.activeName] as const,
      status: "pending" as const,
      queuedReceiptCount: 1,
      receiptCounts: Object.freeze({
        start: 1,
        queue: 1,
        dequeue: 0,
        success: 0,
        failure: 0,
        defect: 0,
        interrupt: 0,
      } satisfies TransactionReceiptCounts),
    }),
    resumed: Object.freeze({
      callNames: [caseDef.activeName, caseDef.queuedName] as const,
      savedNames: [caseDef.activeName] as const,
      status: "pending" as const,
      queuedReceiptCount: 1,
      receiptCounts: Object.freeze({
        start: 2,
        queue: 1,
        dequeue: 1,
        success: 1,
        failure: 0,
        defect: 0,
        interrupt: 0,
      } satisfies TransactionReceiptCounts),
    }),
    terminal: Object.freeze({
      callNames: [caseDef.activeName, caseDef.queuedName] as const,
      savedNames: [caseDef.activeName, caseDef.queuedName] as const,
      status: "success" as const,
      valueName: caseDef.queuedName,
      queuedReceiptCount: 1,
      receiptCounts: Object.freeze({
        start: 2,
        queue: 1,
        dequeue: 1,
        success: 2,
        failure: 0,
        defect: 0,
        interrupt: 0,
      } satisfies TransactionReceiptCounts),
    }),
  });
}

function serializePredecessorTerminalProgressionOracle(
  caseDef: SerializeProgressionCase,
  outcome: SerializePredecessorTerminalOutcome,
) {
  return Object.freeze({
    pending: Object.freeze({
      callNames: [caseDef.activeName] as const,
      status: "pending" as const,
      receiptCounts: Object.freeze({
        start: 1,
        queue: 1,
        dequeue: 0,
        success: 0,
        failure: 0,
        defect: 0,
        interrupt: 0,
      } satisfies TransactionReceiptCounts),
      resourceName: caseDef.activeName,
    }),
    resumed: Object.freeze({
      callNames: [caseDef.activeName, caseDef.queuedName] as const,
      status: "pending" as const,
      savedNames: [] as const,
      error: outcome === "failure" ? ("conflict" as const) : null,
      receiptCounts: Object.freeze({
        start: 2,
        queue: 1,
        dequeue: 1,
        success: 0,
        failure: outcome === "failure" ? 1 : 0,
        defect: outcome === "defect" ? 1 : 0,
        interrupt: 0,
      } satisfies TransactionReceiptCounts),
      resourceName: caseDef.queuedName,
    }),
    terminal: Object.freeze({
      callNames: [caseDef.activeName, caseDef.queuedName] as const,
      status: "success" as const,
      savedNames: [caseDef.queuedName] as const,
      error: null,
      valueName: caseDef.queuedName,
      receiptCounts: Object.freeze({
        start: 2,
        queue: 1,
        dequeue: 1,
        success: 1,
        failure: outcome === "failure" ? 1 : 0,
        defect: outcome === "defect" ? 1 : 0,
        interrupt: 0,
      } satisfies TransactionReceiptCounts),
    }),
  });
}

function serializeSaveEvents(caseDef: SerializeProgressionCase) {
  return [
    { type: "SAVE", name: caseDef.activeName },
    { type: "SAVE", name: caseDef.queuedName },
  ] as const;
}

function expectTransactionReceiptCounts(
  receiptCount: (type: string) => number,
  counts: TransactionReceiptCounts,
) {
  expect(receiptCount("transaction:start")).toBe(counts.start);
  expect(receiptCount("transaction:queue")).toBe(counts.queue);
  expect(receiptCount("transaction:dequeue")).toBe(counts.dequeue);
  expect(receiptCount("transaction:success")).toBe(counts.success);
  expect(receiptCount("transaction:failure")).toBe(counts.failure);
  expect(receiptCount("transaction:defect")).toBe(counts.defect);
  expect(receiptCount("transaction:interrupt")).toBe(counts.interrupt);
}

function expectNoPendingWork(
  pendingWork: Readonly<{
    readonly ready: number;
    readonly activeFibers: number;
    readonly mailboxes: ReadonlyArray<unknown>;
    readonly timers: ReadonlyArray<unknown>;
    readonly streams: ReadonlyArray<unknown>;
    readonly transactions: ReadonlyArray<unknown>;
    readonly children: ReadonlyArray<unknown>;
  }>,
) {
  expect(pendingWork).toMatchObject({
    ready: 0,
    activeFibers: 0,
    mailboxes: [],
    timers: [],
    streams: [],
    transactions: [],
    children: [],
  });
}

function isControlledSaveExitLayer(
  controls: ControlledSaveLayer | ControlledSaveExitLayer,
): controls is ControlledSaveExitLayer {
  return "defectAt" in controls;
}

async function expectSerializeProgressionOracleInFlowTest(caseDef: SerializeProgressionCase) {
  const controls = createControlledSaveLayer();
  const expected = serializeProgressionOracle(caseDef);
  const harness = startSerializeProgressionFlowTest(controls, serializeSaveEvents(caseDef));

  const receiptCount = (type: string) =>
    harness
      .transactions()
      .events(serializeProgressionTransactionId)
      .filter((receipt) => receipt.type === type).length;

  expect(callNames(controls)).toEqual(expected.pending.callNames);
  expect(harness.transactions().get(serializeProgressionTransactionId)).toMatchObject({
    status: expected.pending.status,
  });
  expect(harness.transactions().queued(serializeProgressionTransactionId)).toHaveLength(
    expected.pending.queuedReceiptCount,
  );
  expectTransactionReceiptCounts(receiptCount, expected.pending.receiptCounts);

  controls.succeedAt(0, {
    id: serializeProgressionProjectId,
    name: caseDef.activeName,
  });
  await harness.flush();
  await harness.flush();

  expect(callNames(controls)).toEqual(expected.resumed.callNames);
  expect(harness.context().savedNames).toEqual(expected.resumed.savedNames);
  expect(harness.transactions().get(serializeProgressionTransactionId)).toMatchObject({
    status: expected.resumed.status,
  });
  expect(harness.transactions().queued(serializeProgressionTransactionId)).toHaveLength(
    expected.resumed.queuedReceiptCount,
  );
  expectTransactionReceiptCounts(receiptCount, expected.resumed.receiptCounts);

  controls.succeedAt(1, {
    id: serializeProgressionProjectId,
    name: caseDef.queuedName,
  });
  await harness.flush();
  await harness.flush();

  expect(callNames(controls)).toEqual(expected.terminal.callNames);
  expect(harness.context()).toMatchObject({
    savedNames: expected.terminal.savedNames,
    error: null,
  });
  expect(harness.transactions().get(serializeProgressionTransactionId)).toMatchObject({
    status: expected.terminal.status,
    value: { id: serializeProgressionProjectId, name: expected.terminal.valueName },
  });
  expect(harness.transactions().queued(serializeProgressionTransactionId)).toHaveLength(
    expected.terminal.queuedReceiptCount,
  );
  expectTransactionReceiptCounts(receiptCount, expected.terminal.receiptCounts);
  expectNoPendingWork(harness.pendingWork());
}

async function expectSerializeProgressionOracleInRuntimeActors(caseDef: SerializeProgressionCase) {
  const controls = createControlledSaveLayer();
  const expected = serializeProgressionOracle(caseDef);
  const { actor, runtime } = startSerializeProgressionRuntimeActor(caseDef.actorId, controls);

  const receiptCount = (type: string) =>
    actor
      .receipts()
      .filter(
        (receipt) => receipt.id === serializeProgressionTransactionId && receipt.type === type,
      ).length;

  try {
    actor.send({ type: "SAVE", name: caseDef.activeName });
    actor.send({ type: "SAVE", name: caseDef.queuedName });
    await actor.flush();

    expect(callNames(controls)).toEqual(expected.pending.callNames);
    expect(actor.snapshot().transactions[serializeProgressionTransactionId]).toMatchObject({
      status: expected.pending.status,
    });
    expectTransactionReceiptCounts(receiptCount, expected.pending.receiptCounts);

    controls.succeedAt(0, {
      id: serializeProgressionProjectId,
      name: caseDef.activeName,
    });
    await actor.flush();
    await actor.flush();

    expect(callNames(controls)).toEqual(expected.resumed.callNames);
    expect(actor.snapshot().context.savedNames).toEqual(expected.resumed.savedNames);
    expect(actor.snapshot().transactions[serializeProgressionTransactionId]).toMatchObject({
      status: expected.resumed.status,
    });
    expectTransactionReceiptCounts(receiptCount, expected.resumed.receiptCounts);

    controls.succeedAt(1, {
      id: serializeProgressionProjectId,
      name: caseDef.queuedName,
    });
    await actor.flush();
    await actor.flush();

    expect(callNames(controls)).toEqual(expected.terminal.callNames);
    expect(actor.snapshot().context.savedNames).toEqual(expected.terminal.savedNames);
    expect(actor.snapshot().transactions[serializeProgressionTransactionId]).toMatchObject({
      status: expected.terminal.status,
      value: { id: serializeProgressionProjectId, name: expected.terminal.valueName },
    });
    expectTransactionReceiptCounts(receiptCount, expected.terminal.receiptCounts);
  } finally {
    await runtime.dispose();
  }
}

async function expectSerializePredecessorTerminalProgressionOracleInFlowTest(
  caseDef: SerializeProgressionCase,
  outcome: SerializePredecessorTerminalOutcome,
) {
  const controls =
    outcome === "failure" ? createControlledSaveLayer() : createControlledSaveExitLayer();
  const expected = serializePredecessorTerminalProgressionOracle(caseDef, outcome);
  const harness = startSerializeProgressionFlowTest(controls, serializeSaveEvents(caseDef));

  const receiptCount = (type: string) =>
    harness
      .transactions()
      .events(serializeProgressionTransactionId)
      .filter((receipt) => receipt.type === type).length;

  expect(callNames(controls)).toEqual(expected.pending.callNames);
  expect(harness.transactions().get(serializeProgressionTransactionId)).toMatchObject({
    status: expected.pending.status,
  });
  expect(harness.cache().query(serializeProgressionProjectResourceId)).toMatchObject({
    value: { id: serializeProgressionProjectId, name: expected.pending.resourceName },
  });
  expectTransactionReceiptCounts(receiptCount, expected.pending.receiptCounts);

  if (outcome === "failure") {
    controls.failAt(0, "conflict");
  } else if (isControlledSaveExitLayer(controls)) {
    controls.defectAt(0, new Error("serialize predecessor defect"));
  }
  await harness.flush();
  await harness.flush();

  expect(callNames(controls)).toEqual(expected.resumed.callNames);
  expect(harness.transactions().get(serializeProgressionTransactionId)).toMatchObject({
    status: expected.resumed.status,
  });
  expect(harness.context()).toMatchObject({
    savedNames: expected.resumed.savedNames,
    error: expected.resumed.error,
  });
  expect(harness.cache().query(serializeProgressionProjectResourceId)).toMatchObject({
    value: { id: serializeProgressionProjectId, name: expected.resumed.resourceName },
  });
  expectTransactionReceiptCounts(receiptCount, expected.resumed.receiptCounts);

  controls.succeedAt(1, {
    id: serializeProgressionProjectId,
    name: caseDef.queuedName,
  });
  await harness.flush();
  await harness.flush();

  expect(callNames(controls)).toEqual(expected.terminal.callNames);
  expect(harness.transactions().get(serializeProgressionTransactionId)).toMatchObject({
    status: expected.terminal.status,
    value: { id: serializeProgressionProjectId, name: expected.terminal.valueName },
  });
  expect(harness.context()).toMatchObject({
    savedNames: expected.terminal.savedNames,
    error: expected.terminal.error,
  });
  expectTransactionReceiptCounts(receiptCount, expected.terminal.receiptCounts);
  expectNoPendingWork(harness.pendingWork());
}

async function expectSerializePredecessorTerminalProgressionOracleInRuntimeActors(
  caseDef: SerializeProgressionCase,
  outcome: SerializePredecessorTerminalOutcome,
) {
  const controls =
    outcome === "failure" ? createControlledSaveLayer() : createControlledSaveExitLayer();
  const expected = serializePredecessorTerminalProgressionOracle(caseDef, outcome);
  const { actor, runtime } = startSerializeProgressionRuntimeActor(caseDef.actorId, controls);

  const receiptCount = (type: string) =>
    actor
      .receipts()
      .filter(
        (receipt) => receipt.id === serializeProgressionTransactionId && receipt.type === type,
      ).length;

  try {
    actor.send({ type: "SAVE", name: caseDef.activeName });
    actor.send({ type: "SAVE", name: caseDef.queuedName });
    await actor.flush();

    expect(callNames(controls)).toEqual(expected.pending.callNames);
    expect(actor.snapshot().transactions[serializeProgressionTransactionId]).toMatchObject({
      status: expected.pending.status,
    });
    expect(actor.snapshot().resources[serializeProgressionProjectResourceId]).toMatchObject({
      value: { id: serializeProgressionProjectId, name: expected.pending.resourceName },
    });
    expectTransactionReceiptCounts(receiptCount, expected.pending.receiptCounts);

    if (outcome === "failure") {
      controls.failAt(0, "conflict");
    } else if (isControlledSaveExitLayer(controls)) {
      controls.defectAt(0, new Error("serialize predecessor defect"));
    }
    await actor.flush();
    await actor.flush();

    expect(callNames(controls)).toEqual(expected.resumed.callNames);
    expect(actor.snapshot().transactions[serializeProgressionTransactionId]).toMatchObject({
      status: expected.resumed.status,
    });
    expect(actor.snapshot().context).toMatchObject({
      savedNames: expected.resumed.savedNames,
      error: expected.resumed.error,
    });
    expect(actor.snapshot().resources[serializeProgressionProjectResourceId]).toMatchObject({
      value: { id: serializeProgressionProjectId, name: expected.resumed.resourceName },
    });
    expectTransactionReceiptCounts(receiptCount, expected.resumed.receiptCounts);

    controls.succeedAt(1, {
      id: serializeProgressionProjectId,
      name: caseDef.queuedName,
    });
    await actor.flush();
    await actor.flush();

    expect(callNames(controls)).toEqual(expected.terminal.callNames);
    expect(actor.snapshot().transactions[serializeProgressionTransactionId]).toMatchObject({
      status: expected.terminal.status,
      value: { id: serializeProgressionProjectId, name: expected.terminal.valueName },
    });
    expect(actor.snapshot().context).toMatchObject({
      savedNames: expected.terminal.savedNames,
      error: expected.terminal.error,
    });
    expectTransactionReceiptCounts(receiptCount, expected.terminal.receiptCounts);
  } finally {
    await runtime.dispose();
  }
}

describe("submit transaction serialize progression oracle", () => {
  for (const caseDef of serializeProgressionCases) {
    it(`matches the independent serialize progression oracle for public flowTest ${caseDef.activeName} -> ${caseDef.queuedName}`, async () => {
      await expectSerializeProgressionOracleInFlowTest(caseDef);
    });
  }

  for (const caseDef of serializeProgressionCases) {
    it(`matches the independent serialize progression oracle for runtime actor ${caseDef.activeName} -> ${caseDef.queuedName}`, async () => {
      await expectSerializeProgressionOracleInRuntimeActors(caseDef);
    });
  }

  for (const caseDef of serializeProgressionCases) {
    it(`resumes the queued serialize successor after typed failure in flowTest ${caseDef.activeName} -> ${caseDef.queuedName}`, async () => {
      await expectSerializePredecessorTerminalProgressionOracleInFlowTest(caseDef, "failure");
    });
  }

  for (const caseDef of serializeProgressionCases) {
    it(`resumes the queued serialize successor after predecessor defect in flowTest ${caseDef.activeName} -> ${caseDef.queuedName}`, async () => {
      await expectSerializePredecessorTerminalProgressionOracleInFlowTest(caseDef, "defect");
    });
  }

  for (const caseDef of serializeProgressionCases) {
    it(`resumes the queued serialize successor after typed failure in runtime actor ${caseDef.activeName} -> ${caseDef.queuedName}`, async () => {
      await expectSerializePredecessorTerminalProgressionOracleInRuntimeActors(caseDef, "failure");
    });
  }

  for (const caseDef of serializeProgressionCases) {
    it(`resumes the queued serialize successor after predecessor defect in runtime actor ${caseDef.activeName} -> ${caseDef.queuedName}`, async () => {
      await expectSerializePredecessorTerminalProgressionOracleInRuntimeActors(caseDef, "defect");
    });
  }
});
