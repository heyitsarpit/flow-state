import { describe, expect, it } from "vite-plus/test";

import {
  activeSerializeLifecycleProjectId,
  activeSerializeLifecycleProjectResourceId,
  activeSerializeLifecycleTransactionId,
  callNames,
  createAbortableSaveLayer,
  seededActiveSerializeLifecycleProject,
  startActiveSerializeLifecycleRehydratedHarness,
  startActiveSerializeLifecycleRuntimeActor,
} from "./testing/fixtures/submit-transaction-active-serialize-lifecycle.js";

type ActiveSerializeLifecycleBoundary = "stop" | "dispose";
type ActiveSerializeLifecycleOutcome = "success" | "failure" | "defect";
type ActiveSerializeLifecycleSurface = "runtime-actor" | "rehydrated-harness";

type ActiveSerializeLifecycleCase = Readonly<{
  readonly surface: ActiveSerializeLifecycleSurface;
  readonly boundary: ActiveSerializeLifecycleBoundary;
  readonly outcome: ActiveSerializeLifecycleOutcome;
  readonly actorId: string;
  readonly activeName: string;
  readonly lateResultName: string;
}>;

const activeSerializeLifecycleCases = [
  {
    surface: "runtime-actor",
    boundary: "stop",
    outcome: "success",
    actorId: "transactions-stop-abort-actor",
    activeName: "Draft Stop",
    lateResultName: "Late Stop Success",
  },
  {
    surface: "runtime-actor",
    boundary: "stop",
    outcome: "failure",
    actorId: "transactions-stop-failure-actor",
    activeName: "Draft Stop Failure",
    lateResultName: "Late Stop Failure",
  },
  {
    surface: "runtime-actor",
    boundary: "stop",
    outcome: "defect",
    actorId: "transactions-stop-defect-actor",
    activeName: "Draft Stop Defect",
    lateResultName: "late stop defect",
  },
  {
    surface: "runtime-actor",
    boundary: "dispose",
    outcome: "success",
    actorId: "transactions-runtime-dispose-actor",
    activeName: "Draft Dispose",
    lateResultName: "Late Dispose Success",
  },
  {
    surface: "runtime-actor",
    boundary: "dispose",
    outcome: "failure",
    actorId: "transactions-runtime-dispose-failure-actor",
    activeName: "Draft Dispose Failure",
    lateResultName: "Late Dispose Failure",
  },
  {
    surface: "runtime-actor",
    boundary: "dispose",
    outcome: "defect",
    actorId: "transactions-runtime-dispose-defect-actor",
    activeName: "Draft Dispose Defect",
    lateResultName: "late dispose defect",
  },
  {
    surface: "rehydrated-harness",
    boundary: "stop",
    outcome: "success",
    actorId: "transactions-stop-abort-actor",
    activeName: "Draft Stop",
    lateResultName: "Late Stop Success",
  },
  {
    surface: "rehydrated-harness",
    boundary: "stop",
    outcome: "failure",
    actorId: "transactions-stop-failure-actor",
    activeName: "Draft Stop Failure",
    lateResultName: "Late Stop Failure",
  },
  {
    surface: "rehydrated-harness",
    boundary: "stop",
    outcome: "defect",
    actorId: "transactions-stop-defect-actor",
    activeName: "Draft Stop Defect",
    lateResultName: "late stop defect",
  },
  {
    surface: "rehydrated-harness",
    boundary: "dispose",
    outcome: "success",
    actorId: "transactions-runtime-dispose-actor",
    activeName: "Draft Dispose",
    lateResultName: "Late Dispose Success",
  },
  {
    surface: "rehydrated-harness",
    boundary: "dispose",
    outcome: "failure",
    actorId: "transactions-runtime-dispose-failure-actor",
    activeName: "Draft Dispose Failure",
    lateResultName: "Late Dispose Failure",
  },
  {
    surface: "rehydrated-harness",
    boundary: "dispose",
    outcome: "defect",
    actorId: "transactions-runtime-dispose-defect-actor",
    activeName: "Draft Dispose Defect",
    lateResultName: "late dispose defect",
  },
] as const satisfies ReadonlyArray<ActiveSerializeLifecycleCase>;

function oracle(caseDef: ActiveSerializeLifecycleCase) {
  const terminalReceiptType =
    caseDef.outcome === "success"
      ? "transaction:success"
      : caseDef.outcome === "failure"
        ? "transaction:failure"
        : "transaction:defect";

  return Object.freeze({
    pending: Object.freeze({
      callNames: [caseDef.activeName] as const,
      receiptTypes: ["transaction:start", "transaction:preview-patch"] as const,
      status: "pending" as const,
      resourceName: caseDef.activeName,
      ready: 0,
      activeFibers: 1,
      mailboxes: [] as const,
      transactions: [activeSerializeLifecycleTransactionId] as const,
    }),
    terminal: Object.freeze({
      callNames: [caseDef.activeName] as const,
      savedNames: [] as const,
      status: "interrupt" as const,
      resourceName: seededActiveSerializeLifecycleProject.value.name,
      terminalReceiptType,
      terminalReceiptCount: 0,
    }),
  });
}

function completeLateAttempt(
  caseDef: ActiveSerializeLifecycleCase,
  controls: ReturnType<typeof createAbortableSaveLayer>,
) {
  if (caseDef.outcome === "success") {
    controls.succeedAt(0, {
      id: activeSerializeLifecycleProjectId,
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

async function expectActiveSerializeLifecycleOracleInRuntimeActors(
  caseDef: ActiveSerializeLifecycleCase,
) {
  const controls = createAbortableSaveLayer();
  const expected = oracle(caseDef);
  const { actor, runtime } = startActiveSerializeLifecycleRuntimeActor(caseDef.actorId, controls);

  try {
    actor.send({ type: "SAVE", name: caseDef.activeName });
    await actor.flush();

    expect(callNames(controls)).toEqual(expected.pending.callNames);
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.id === activeSerializeLifecycleTransactionId)
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(expected.pending.receiptTypes));
    expect(actor.snapshot().transactions[activeSerializeLifecycleTransactionId]).toMatchObject({
      status: expected.pending.status,
    });
    expect(actor.snapshot().resources[activeSerializeLifecycleProjectResourceId]).toMatchObject({
      value: {
        id: seededActiveSerializeLifecycleProject.value.id,
        name: expected.pending.resourceName,
      },
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
    expect(actor.snapshot().transactions[activeSerializeLifecycleTransactionId]).toMatchObject({
      status: expected.terminal.status,
    });
    expect(actor.snapshot().resources[activeSerializeLifecycleProjectResourceId]).toMatchObject({
      value: {
        id: seededActiveSerializeLifecycleProject.value.id,
        name: expected.terminal.resourceName,
      },
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
    expect(actor.snapshot().transactions[activeSerializeLifecycleTransactionId]).toMatchObject({
      status: expected.terminal.status,
    });
    expect(actor.snapshot().resources[activeSerializeLifecycleProjectResourceId]).toMatchObject({
      value: {
        id: seededActiveSerializeLifecycleProject.value.id,
        name: expected.terminal.resourceName,
      },
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === activeSerializeLifecycleTransactionId &&
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

async function expectActiveSerializeLifecycleOracleInRehydratedHarness(
  caseDef: ActiveSerializeLifecycleCase,
) {
  const controls = createAbortableSaveLayer();
  const expected = oracle(caseDef);
  const harness = startActiveSerializeLifecycleRehydratedHarness(caseDef.actorId, controls);

  try {
    harness.send({ type: "SAVE", name: caseDef.activeName });
    await harness.flush();

    expect(callNames(controls)).toEqual(expected.pending.callNames);
    expect(
      harness
        .transactions()
        .events(activeSerializeLifecycleTransactionId)
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(expected.pending.receiptTypes));
    expect(harness.snapshot().transactions[activeSerializeLifecycleTransactionId]).toMatchObject({
      status: expected.pending.status,
    });
    expect(harness.snapshot().resources[activeSerializeLifecycleProjectResourceId]).toMatchObject({
      value: {
        id: seededActiveSerializeLifecycleProject.value.id,
        name: expected.pending.resourceName,
      },
    });
    expect(harness.pendingWork()).toMatchObject({
      ready: expected.pending.ready,
      activeFibers: expected.pending.activeFibers,
      mailboxes: expected.pending.mailboxes,
      transactions: expected.pending.transactions,
    });

    const receiptsAfterPending = harness.receipts().length;
    if (caseDef.boundary === "stop") {
      await harness.runtime.orchestrators.stop(harness.actor.id);
    } else {
      await harness.dispose();
    }
    await harness.flush();

    expect(controls.entryAt(0).signal.aborted).toBe(true);
    expect(controls.entryAt(0).abortCount()).toBe(1);
    expect(callNames(controls)).toEqual(expected.pending.callNames);
    expect(harness.snapshot().transactions[activeSerializeLifecycleTransactionId]).toMatchObject({
      status: expected.terminal.status,
    });
    expect(harness.snapshot().resources[activeSerializeLifecycleProjectResourceId]).toMatchObject({
      value: {
        id: seededActiveSerializeLifecycleProject.value.id,
        name: expected.terminal.resourceName,
      },
    });
    const issuesAfterBoundary = harness.issues();
    const receiptsAfterBoundary = harness.receipts().length;
    expect(receiptsAfterBoundary).toBeGreaterThan(receiptsAfterPending);
    expectNoPendingWork(harness.pendingWork());

    completeLateAttempt(caseDef, controls);
    await harness.flush();
    await harness.flush();

    expect(callNames(controls)).toEqual(expected.terminal.callNames);
    expect(harness.context().savedNames).toEqual(expected.terminal.savedNames);
    expect(harness.issues()).toEqual(issuesAfterBoundary);
    expect(harness.snapshot().transactions[activeSerializeLifecycleTransactionId]).toMatchObject({
      status: expected.terminal.status,
    });
    expect(harness.snapshot().resources[activeSerializeLifecycleProjectResourceId]).toMatchObject({
      value: {
        id: seededActiveSerializeLifecycleProject.value.id,
        name: expected.terminal.resourceName,
      },
    });
    expect(
      harness
        .transactions()
        .events(activeSerializeLifecycleTransactionId)
        .filter((receipt) => receipt.type === expected.terminal.terminalReceiptType),
    ).toHaveLength(expected.terminal.terminalReceiptCount);
    expect(harness.receipts()).toHaveLength(receiptsAfterBoundary);
    expectNoPendingWork(harness.pendingWork());
  } finally {
    await harness.dispose();
  }
}

describe("submit transaction active serialize lifecycle oracle", () => {
  for (const caseDef of activeSerializeLifecycleCases.filter(
    (entry) => entry.surface === "runtime-actor",
  )) {
    it(`matches the independent active serialize lifecycle oracle for runtime actor ${caseDef.boundary} and late ${caseDef.outcome}`, async () => {
      await expectActiveSerializeLifecycleOracleInRuntimeActors(caseDef);
    });
  }

  for (const caseDef of activeSerializeLifecycleCases.filter(
    (entry) => entry.surface === "rehydrated-harness",
  )) {
    it(`matches the independent active serialize lifecycle oracle for public rehydrated harness ${caseDef.boundary} and late ${caseDef.outcome}`, async () => {
      await expectActiveSerializeLifecycleOracleInRehydratedHarness(caseDef);
    });
  }
});
