import { describe, expect, it } from "vite-plus/test";

import {
  callNames,
  createAbortableSaveLayer,
  queuedSerializeLifecycleProjectId,
  queuedSerializeLifecycleTransactionId,
  startQueuedSerializeLifecycleRehydratedHarness,
  startQueuedSerializeLifecycleRuntimeActor,
} from "./testing/fixtures/submit-transaction-queued-serialize-lifecycle.js";

type QueuedSerializeLifecycleBoundary = "stop" | "dispose";
type QueuedSerializeLifecycleOutcome = "success" | "failure" | "defect";
type QueuedSerializeLifecycleSurface = "rehydrated-harness" | "runtime-actor";

type QueuedSerializeLifecycleCase = Readonly<{
  readonly surface: QueuedSerializeLifecycleSurface;
  readonly boundary: QueuedSerializeLifecycleBoundary;
  readonly outcome: QueuedSerializeLifecycleOutcome;
  readonly actorId: string;
  readonly activeName: string;
  readonly queuedName: string;
  readonly lateResultName: string;
}>;

const queuedSerializeLifecycleCases = [
  {
    surface: "runtime-actor",
    boundary: "stop",
    outcome: "success",
    actorId: "transactions-stop-queued-actor",
    activeName: "Draft Active",
    queuedName: "Draft Queued",
    lateResultName: "Late Active Success",
  },
  {
    surface: "runtime-actor",
    boundary: "stop",
    outcome: "failure",
    actorId: "transactions-stop-queued-failure-actor",
    activeName: "Draft Active Failure",
    queuedName: "Draft Queued Failure",
    lateResultName: "Late Queued Failure",
  },
  {
    surface: "runtime-actor",
    boundary: "stop",
    outcome: "defect",
    actorId: "transactions-stop-queued-defect-actor",
    activeName: "Draft Active Defect",
    queuedName: "Draft Queued Defect",
    lateResultName: "late queued stop defect",
  },
  {
    surface: "runtime-actor",
    boundary: "dispose",
    outcome: "success",
    actorId: "transactions-runtime-dispose-queued-actor",
    activeName: "Draft Dispose Active",
    queuedName: "Draft Dispose Queued",
    lateResultName: "Late Dispose Success",
  },
  {
    surface: "runtime-actor",
    boundary: "dispose",
    outcome: "failure",
    actorId: "transactions-runtime-dispose-queued-failure-actor",
    activeName: "Draft Dispose Failure Active",
    queuedName: "Draft Dispose Failure Queued",
    lateResultName: "Late Dispose Failure",
  },
  {
    surface: "runtime-actor",
    boundary: "dispose",
    outcome: "defect",
    actorId: "transactions-runtime-dispose-queued-defect-actor",
    activeName: "Draft Dispose Defect Active",
    queuedName: "Draft Dispose Defect Queued",
    lateResultName: "late queued dispose defect",
  },
  {
    surface: "rehydrated-harness",
    boundary: "stop",
    outcome: "success",
    actorId: "transactions-stop-queued-harness-actor",
    activeName: "Draft Harness Active",
    queuedName: "Draft Harness Queued",
    lateResultName: "Late Harness Success",
  },
  {
    surface: "rehydrated-harness",
    boundary: "stop",
    outcome: "failure",
    actorId: "transactions-stop-queued-harness-failure-actor",
    activeName: "Draft Harness Failure Active",
    queuedName: "Draft Harness Failure Queued",
    lateResultName: "Late Harness Failure",
  },
  {
    surface: "rehydrated-harness",
    boundary: "stop",
    outcome: "defect",
    actorId: "transactions-stop-queued-harness-defect-actor",
    activeName: "Draft Harness Defect Active",
    queuedName: "Draft Harness Defect Queued",
    lateResultName: "late harness stop defect",
  },
  {
    surface: "rehydrated-harness",
    boundary: "dispose",
    outcome: "success",
    actorId: "transactions-runtime-dispose-queued-harness-actor",
    activeName: "Draft Dispose Harness Active",
    queuedName: "Draft Dispose Harness Queued",
    lateResultName: "Late Dispose Harness Success",
  },
  {
    surface: "rehydrated-harness",
    boundary: "dispose",
    outcome: "failure",
    actorId: "transactions-runtime-dispose-queued-harness-failure-actor",
    activeName: "Draft Dispose Harness Failure Active",
    queuedName: "Draft Dispose Harness Failure Queued",
    lateResultName: "Late Dispose Harness Failure",
  },
  {
    surface: "rehydrated-harness",
    boundary: "dispose",
    outcome: "defect",
    actorId: "transactions-runtime-dispose-queued-harness-defect-actor",
    activeName: "Draft Dispose Harness Defect Active",
    queuedName: "Draft Dispose Harness Defect Queued",
    lateResultName: "late dispose harness defect",
  },
] as const satisfies ReadonlyArray<QueuedSerializeLifecycleCase>;

function oracle(caseDef: QueuedSerializeLifecycleCase) {
  const terminalReceiptType =
    caseDef.outcome === "success"
      ? "transaction:success"
      : caseDef.outcome === "failure"
        ? "transaction:failure"
        : "transaction:defect";

  return Object.freeze({
    pending: Object.freeze({
      callNames: [caseDef.activeName] as const,
      status: "pending" as const,
      ready: 0,
      activeFibers: 1,
      mailboxes: [] as const,
      transactions: [queuedSerializeLifecycleTransactionId] as const,
    }),
    terminal: Object.freeze({
      callNames: [caseDef.activeName] as const,
      status: "interrupt" as const,
      savedNames: [] as const,
      dequeueCount: 0,
      terminalReceiptType,
      terminalReceiptCount: 0,
    }),
  });
}

function completeLateAttempt(
  caseDef: QueuedSerializeLifecycleCase,
  controls: ReturnType<typeof createAbortableSaveLayer>,
) {
  if (caseDef.outcome === "success") {
    controls.succeedAt(0, {
      id: queuedSerializeLifecycleProjectId,
      name: caseDef.lateResultName,
    });
    return;
  }

  if (caseDef.outcome === "failure") {
    controls.failAt(0, "conflict");
    return;
  }

  controls.defectAt(0, new Error(caseDef.lateResultName));
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

async function expectQueuedSerializeLifecycleOracleInRehydratedHarness(
  caseDef: QueuedSerializeLifecycleCase,
) {
  const controls = createAbortableSaveLayer();
  const expected = oracle(caseDef);
  const harness = startQueuedSerializeLifecycleRehydratedHarness(caseDef.actorId, controls);

  try {
    harness.send({ type: "SAVE", name: caseDef.activeName });
    harness.send({ type: "SAVE", name: caseDef.queuedName });
    await harness.flush();

    expect(callNames(controls)).toEqual(expected.pending.callNames);
    expect(harness.snapshot().transactions[queuedSerializeLifecycleTransactionId]).toMatchObject({
      status: expected.pending.status,
    });
    expect(harness.pendingWork()).toMatchObject({
      ready: expected.pending.ready,
      activeFibers: expected.pending.activeFibers,
      mailboxes: expected.pending.mailboxes,
      transactions: expected.pending.transactions,
    });

    if (caseDef.boundary === "stop") {
      await harness.runtime.orchestrators.stop(harness.actor.id);
    } else {
      await harness.dispose();
    }
    await harness.flush();

    expect(controls.entryAt(0).signal.aborted).toBe(true);
    expect(controls.entryAt(0).abortCount()).toBe(1);
    expect(harness.snapshot().transactions[queuedSerializeLifecycleTransactionId]).toMatchObject({
      status: expected.terminal.status,
    });
    const issuesAfterBoundary = harness.issues();
    expectNoPendingWork(harness.pendingWork());

    completeLateAttempt(caseDef, controls);
    await harness.flush();
    await harness.flush();

    expect(callNames(controls)).toEqual(expected.terminal.callNames);
    expect(harness.context().savedNames).toEqual(expected.terminal.savedNames);
    expect(harness.issues()).toEqual(issuesAfterBoundary);
    expect(harness.snapshot().transactions[queuedSerializeLifecycleTransactionId]).toMatchObject({
      status: expected.terminal.status,
    });
    expectNoPendingWork(harness.pendingWork());
    expect(
      harness
        .transactions()
        .events(queuedSerializeLifecycleTransactionId)
        .filter((receipt) => receipt.type === "transaction:dequeue"),
    ).toHaveLength(expected.terminal.dequeueCount);
    expect(
      harness
        .transactions()
        .events(queuedSerializeLifecycleTransactionId)
        .filter((receipt) => receipt.type === expected.terminal.terminalReceiptType),
    ).toHaveLength(expected.terminal.terminalReceiptCount);
  } finally {
    await harness.dispose();
  }
}

async function expectQueuedSerializeLifecycleOracleInRuntimeActors(
  caseDef: QueuedSerializeLifecycleCase,
) {
  const controls = createAbortableSaveLayer();
  const expected = oracle(caseDef);
  const { actor, runtime } = startQueuedSerializeLifecycleRuntimeActor(caseDef.actorId, controls);

  try {
    actor.send({ type: "SAVE", name: caseDef.activeName });
    actor.send({ type: "SAVE", name: caseDef.queuedName });
    await actor.flush();

    expect(callNames(controls)).toEqual(expected.pending.callNames);
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.id === queuedSerializeLifecycleTransactionId)
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:start", "transaction:queue"]));
    expect(actor.snapshot().transactions[queuedSerializeLifecycleTransactionId]).toMatchObject({
      status: expected.pending.status,
    });

    const receiptsAfterPending = actor.receipts().length;
    if (caseDef.boundary === "stop") {
      await runtime.orchestrators.stop(actor.id);
    } else {
      await runtime.dispose();
    }
    await actor.flush();

    expect(controls.entryAt(0).signal.aborted).toBe(true);
    expect(controls.entryAt(0).abortCount()).toBe(1);
    expect(callNames(controls)).toEqual(expected.pending.callNames);
    expect(actor.snapshot().transactions[queuedSerializeLifecycleTransactionId]).toMatchObject({
      status: expected.terminal.status,
    });
    const issuesAfterBoundary = actor.issues();
    const receiptsAfterBoundary = actor.receipts().length;
    expect(receiptsAfterBoundary).toBeGreaterThan(receiptsAfterPending);

    completeLateAttempt(caseDef, controls);
    await actor.flush();
    await actor.flush();

    expect(callNames(controls)).toEqual(expected.terminal.callNames);
    expect(actor.snapshot().context.savedNames).toEqual(expected.terminal.savedNames);
    expect(actor.issues()).toEqual(issuesAfterBoundary);
    expect(actor.snapshot().transactions[queuedSerializeLifecycleTransactionId]).toMatchObject({
      status: expected.terminal.status,
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === queuedSerializeLifecycleTransactionId &&
            receipt.type === "transaction:dequeue",
        ),
    ).toHaveLength(expected.terminal.dequeueCount);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === queuedSerializeLifecycleTransactionId &&
            receipt.type === expected.terminal.terminalReceiptType,
        ),
    ).toHaveLength(expected.terminal.terminalReceiptCount);
    expect(actor.receipts()).toHaveLength(receiptsAfterBoundary);
  } finally {
    if (caseDef.boundary !== "dispose") {
      await runtime.dispose();
    }
  }
}

describe("submit transaction queued serialize lifecycle oracle", () => {
  for (const caseDef of queuedSerializeLifecycleCases.filter(
    (entry) => entry.surface === "runtime-actor",
  )) {
    it(`matches the independent queued serialize lifecycle oracle for runtime actor ${caseDef.boundary} and late ${caseDef.outcome}`, async () => {
      await expectQueuedSerializeLifecycleOracleInRuntimeActors(caseDef);
    });
  }

  for (const caseDef of queuedSerializeLifecycleCases.filter(
    (entry) => entry.surface === "rehydrated-harness",
  )) {
    it(`matches the independent queued serialize lifecycle oracle for public rehydrated harness ${caseDef.boundary} and late ${caseDef.outcome}`, async () => {
      await expectQueuedSerializeLifecycleOracleInRehydratedHarness(caseDef);
    });
  }
});
