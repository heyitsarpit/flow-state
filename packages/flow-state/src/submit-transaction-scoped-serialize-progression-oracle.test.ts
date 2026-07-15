import { describe, expect, it } from "vite-plus/test";

import {
  callNames,
  createControlledSaveLayer,
  scopedSerializeProgressionProjectId,
  startScopedSerializeProgressionFlowTest,
  startScopedSerializeProgressionRuntimeActor,
  type TransactionReceiptCounts,
} from "./testing/fixtures/submit-transaction-scoped-serialize-progression.js";

type ScopedSerializeProgressionCase = Readonly<{
  readonly machineId: string;
  readonly actorId: string;
  readonly firstActiveId: string;
  readonly firstActiveName: string;
  readonly firstQueuedId: string;
  readonly firstQueuedName: string;
  readonly secondActiveId: string;
  readonly secondActiveName: string;
  readonly secondQueuedId: string;
  readonly secondQueuedName: string;
}>;

const scopedSerializeProgressionCases = [
  {
    machineId: "bt38.scoped-serialize-progression",
    actorId: "transactions-scoped-serialize-runtime-actor",
    firstActiveId: "transactions.save-scope-a1",
    firstActiveName: "Draft A1",
    firstQueuedId: "transactions.save-scope-b1",
    firstQueuedName: "Draft B1",
    secondActiveId: "transactions.save-scope-a2",
    secondActiveName: "Draft A2",
    secondQueuedId: "transactions.save-scope-b2",
    secondQueuedName: "Draft B2",
  },
] as const satisfies ReadonlyArray<ScopedSerializeProgressionCase>;

function oracle(caseDef: ScopedSerializeProgressionCase) {
  return Object.freeze({
    pending: Object.freeze({
      callNames: [caseDef.firstActiveName, caseDef.secondActiveName] as const,
      activeTransactionIds: [caseDef.firstActiveId, caseDef.secondActiveId] as const,
      queuedTransactionIds: [caseDef.firstQueuedId, caseDef.secondQueuedId] as const,
      receiptCounts: Object.freeze({
        [caseDef.firstActiveId]: Object.freeze({
          start: 1,
          queue: 0,
          dequeue: 0,
          success: 0,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
        [caseDef.firstQueuedId]: Object.freeze({
          start: 0,
          queue: 1,
          dequeue: 0,
          success: 0,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
        [caseDef.secondActiveId]: Object.freeze({
          start: 1,
          queue: 0,
          dequeue: 0,
          success: 0,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
        [caseDef.secondQueuedId]: Object.freeze({
          start: 0,
          queue: 1,
          dequeue: 0,
          success: 0,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
      }),
    }),
    resumed: Object.freeze({
      callNames: [
        caseDef.firstActiveName,
        caseDef.secondActiveName,
        caseDef.firstQueuedName,
        caseDef.secondQueuedName,
      ] as const,
      savedNames: [caseDef.firstActiveName, caseDef.secondActiveName] as const,
      receiptCounts: Object.freeze({
        [caseDef.firstActiveId]: Object.freeze({
          start: 1,
          queue: 0,
          dequeue: 0,
          success: 1,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
        [caseDef.firstQueuedId]: Object.freeze({
          start: 1,
          queue: 1,
          dequeue: 1,
          success: 0,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
        [caseDef.secondActiveId]: Object.freeze({
          start: 1,
          queue: 0,
          dequeue: 0,
          success: 1,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
        [caseDef.secondQueuedId]: Object.freeze({
          start: 1,
          queue: 1,
          dequeue: 1,
          success: 0,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
      }),
    }),
    terminal: Object.freeze({
      callNames: [
        caseDef.firstActiveName,
        caseDef.secondActiveName,
        caseDef.firstQueuedName,
        caseDef.secondQueuedName,
      ] as const,
      savedNames: [
        caseDef.firstActiveName,
        caseDef.secondActiveName,
        caseDef.firstQueuedName,
        caseDef.secondQueuedName,
      ] as const,
      transactionValues: Object.freeze({
        [caseDef.firstActiveId]: caseDef.firstActiveName,
        [caseDef.firstQueuedId]: caseDef.firstQueuedName,
        [caseDef.secondActiveId]: caseDef.secondActiveName,
        [caseDef.secondQueuedId]: caseDef.secondQueuedName,
      }),
      receiptCounts: Object.freeze({
        [caseDef.firstActiveId]: Object.freeze({
          start: 1,
          queue: 0,
          dequeue: 0,
          success: 1,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
        [caseDef.firstQueuedId]: Object.freeze({
          start: 1,
          queue: 1,
          dequeue: 1,
          success: 1,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
        [caseDef.secondActiveId]: Object.freeze({
          start: 1,
          queue: 0,
          dequeue: 0,
          success: 1,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
        [caseDef.secondQueuedId]: Object.freeze({
          start: 1,
          queue: 1,
          dequeue: 1,
          success: 1,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
      }),
    }),
  });
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

function expectScopedSerializeProgressionReceiptCounts(
  receiptCount: (id: string, type: string) => number,
  counts: Readonly<Record<string, TransactionReceiptCounts>>,
) {
  for (const [id, transactionCounts] of Object.entries(counts)) {
    expectTransactionReceiptCounts((type) => receiptCount(id, type), transactionCounts);
  }
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

async function expectScopedSerializeProgressionOracleInFlowTest(
  caseDef: ScopedSerializeProgressionCase,
) {
  const controls = createControlledSaveLayer();
  const expected = oracle(caseDef);
  const { harness } = startScopedSerializeProgressionFlowTest(caseDef.machineId, controls, [
    { type: "SAVE_A1" },
    { type: "SAVE_B1" },
    { type: "SAVE_A2" },
    { type: "SAVE_B2" },
  ]);
  const receiptCount = (id: string, type: string) =>
    harness
      .transactions()
      .events(id)
      .filter((receipt) => receipt.type === type).length;

  expect(callNames(controls)).toEqual(expected.pending.callNames);
  expect(harness.transactions().queued(caseDef.firstQueuedId)).toHaveLength(1);
  expect(harness.transactions().queued(caseDef.secondQueuedId)).toHaveLength(1);
  for (const id of expected.pending.activeTransactionIds) {
    expect(harness.transactions().get(id)).toMatchObject({ status: "pending" });
  }
  expectScopedSerializeProgressionReceiptCounts(receiptCount, expected.pending.receiptCounts);

  controls.succeedAt(0, {
    id: scopedSerializeProgressionProjectId,
    name: caseDef.firstActiveName,
  });
  controls.succeedAt(1, {
    id: scopedSerializeProgressionProjectId,
    name: caseDef.secondActiveName,
  });
  await harness.flush();
  await harness.flush();

  expect(callNames(controls)).toEqual(expected.resumed.callNames);
  expect(harness.context()).toMatchObject({
    savedNames: expected.resumed.savedNames,
    error: null,
  });
  expectScopedSerializeProgressionReceiptCounts(receiptCount, expected.resumed.receiptCounts);

  controls.succeedAt(2, {
    id: scopedSerializeProgressionProjectId,
    name: caseDef.firstQueuedName,
  });
  controls.succeedAt(3, {
    id: scopedSerializeProgressionProjectId,
    name: caseDef.secondQueuedName,
  });
  await harness.flush();
  await harness.flush();

  expect(callNames(controls)).toEqual(expected.terminal.callNames);
  expect(harness.context()).toMatchObject({
    savedNames: expected.terminal.savedNames,
    error: null,
  });
  for (const [id, valueName] of Object.entries(expected.terminal.transactionValues)) {
    expect(harness.transactions().get(id)).toMatchObject({
      status: "success",
      value: { id: scopedSerializeProgressionProjectId, name: valueName },
    });
  }
  expectScopedSerializeProgressionReceiptCounts(receiptCount, expected.terminal.receiptCounts);
  expectNoPendingWork(harness.pendingWork());
}

async function expectScopedSerializeProgressionOracleInRuntimeActors(
  caseDef: ScopedSerializeProgressionCase,
) {
  const controls = createControlledSaveLayer();
  const expected = oracle(caseDef);
  const { actor, runtime } = startScopedSerializeProgressionRuntimeActor(
    caseDef.machineId,
    caseDef.actorId,
    controls,
  );
  const receiptCount = (id: string, type: string) =>
    actor.receipts().filter((receipt) => receipt.id === id && receipt.type === type).length;

  try {
    actor.send({ type: "SAVE_A1" });
    actor.send({ type: "SAVE_B1" });
    actor.send({ type: "SAVE_A2" });
    actor.send({ type: "SAVE_B2" });
    await actor.flush();

    expect(callNames(controls)).toEqual(expected.pending.callNames);
    for (const id of expected.pending.activeTransactionIds) {
      expect(actor.getSnapshot().transactions[id]).toMatchObject({ status: "pending" });
    }
    expectScopedSerializeProgressionReceiptCounts(receiptCount, expected.pending.receiptCounts);

    controls.succeedAt(0, {
      id: scopedSerializeProgressionProjectId,
      name: caseDef.firstActiveName,
    });
    controls.succeedAt(1, {
      id: scopedSerializeProgressionProjectId,
      name: caseDef.secondActiveName,
    });
    await actor.flush();
    await actor.flush();

    expect(callNames(controls)).toEqual(expected.resumed.callNames);
    expect(actor.getSnapshot().context.savedNames).toEqual(expected.resumed.savedNames);
    expectScopedSerializeProgressionReceiptCounts(receiptCount, expected.resumed.receiptCounts);

    controls.succeedAt(2, {
      id: scopedSerializeProgressionProjectId,
      name: caseDef.firstQueuedName,
    });
    controls.succeedAt(3, {
      id: scopedSerializeProgressionProjectId,
      name: caseDef.secondQueuedName,
    });
    await actor.flush();
    await actor.flush();

    expect(callNames(controls)).toEqual(expected.terminal.callNames);
    expect(actor.getSnapshot().context.savedNames).toEqual(expected.terminal.savedNames);
    for (const [id, valueName] of Object.entries(expected.terminal.transactionValues)) {
      expect(actor.getSnapshot().transactions[id]).toMatchObject({
        status: "success",
        value: { id: scopedSerializeProgressionProjectId, name: valueName },
      });
    }
    expectScopedSerializeProgressionReceiptCounts(receiptCount, expected.terminal.receiptCounts);
  } finally {
    await runtime.dispose();
  }
}

describe("submit transaction scoped serialize progression oracle", () => {
  for (const caseDef of scopedSerializeProgressionCases) {
    it(`matches the independent scoped serialize progression oracle for public flowTest ${caseDef.actorId}`, async () => {
      await expectScopedSerializeProgressionOracleInFlowTest(caseDef);
    });
  }

  for (const caseDef of scopedSerializeProgressionCases) {
    it(`matches the independent scoped serialize progression oracle for runtime actor ${caseDef.actorId}`, async () => {
      await expectScopedSerializeProgressionOracleInRuntimeActors(caseDef);
    });
  }
});
