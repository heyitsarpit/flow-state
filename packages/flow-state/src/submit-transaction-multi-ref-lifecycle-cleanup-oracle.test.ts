import { describe, expect, it } from "vite-plus/test";

import {
  callNames,
  createAbortableSaveLayer,
  multiRefLifecycleProjectResourceId,
  multiRefLifecycleSummaryResourceId,
  multiRefLifecycleTransactionId,
  seededMultiRefLifecycleProject,
  seededMultiRefLifecycleSummary,
  startMultiRefLifecycleRehydratedHarness,
  startMultiRefLifecycleRuntimeActor,
} from "./testing/fixtures/submit-transaction-multi-ref-lifecycle-cleanup.js";

type MultiRefLifecycleBoundary = "stop" | "dispose";
type MultiRefLifecycleSurface = "runtime-actor" | "rehydrated-harness";

type MultiRefLifecycleCase = Readonly<{
  readonly surface: MultiRefLifecycleSurface;
  readonly boundary: MultiRefLifecycleBoundary;
  readonly actorId: string;
}>;

const multiRefLifecycleCases = [
  {
    surface: "runtime-actor",
    boundary: "stop",
    actorId: "transactions-stop-multi-ref-actor",
  },
  {
    surface: "runtime-actor",
    boundary: "dispose",
    actorId: "transactions-runtime-dispose-multi-ref-actor",
  },
  {
    surface: "rehydrated-harness",
    boundary: "stop",
    actorId: "transactions-stop-multi-ref-actor",
  },
  {
    surface: "rehydrated-harness",
    boundary: "dispose",
    actorId: "transactions-runtime-dispose-multi-ref-actor",
  },
] as const satisfies ReadonlyArray<MultiRefLifecycleCase>;

function invalidationCount(
  receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>,
  resourceId: string,
) {
  return receipts.filter(
    (receipt) => receipt.id === resourceId && receipt.type === "resource:invalidate",
  ).length;
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

async function expectMultiRefLifecycleCleanupInRuntimeActors(caseDef: MultiRefLifecycleCase) {
  const controls = createAbortableSaveLayer();
  const { actor, runtime } = startMultiRefLifecycleRuntimeActor(caseDef.actorId, controls);

  try {
    actor.send({ type: "SAVE" });
    await actor.flush();

    expect(callNames(controls)).toEqual(["Boundary Draft"]);
    expect(actor.snapshot().transactions[multiRefLifecycleTransactionId]).toMatchObject({
      status: "pending",
    });
    expect(actor.snapshot().resources[multiRefLifecycleProjectResourceId]).toMatchObject({
      value: { id: seededMultiRefLifecycleProject.value.id, name: "Boundary Draft" },
    });
    expect(actor.snapshot().resources[multiRefLifecycleSummaryResourceId]).toMatchObject({
      value: { id: seededMultiRefLifecycleSummary.value.id, summary: "Boundary Draft" },
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === multiRefLifecycleTransactionId &&
            receipt.type === "transaction:preview-patch",
        ),
    ).toHaveLength(2);
    expect(invalidationCount(actor.receipts(), multiRefLifecycleProjectResourceId)).toBe(0);
    expect(invalidationCount(actor.receipts(), multiRefLifecycleSummaryResourceId)).toBe(0);

    const receiptsAfterPending = actor.receipts().length;
    if (caseDef.boundary === "stop") {
      await runtime.orchestrators.stop(actor.id);
    } else {
      await runtime.dispose();
    }
    await actor.flush();

    expect(controls.entryAt(0).signal.aborted).toBe(true);
    expect(controls.entryAt(0).abortCount()).toBe(1);
    expect(actor.snapshot().transactions[multiRefLifecycleTransactionId]).toMatchObject({
      status: "interrupt",
    });
    expect(actor.snapshot().resources[multiRefLifecycleProjectResourceId]).toMatchObject({
      value: seededMultiRefLifecycleProject.value,
    });
    expect(actor.snapshot().resources[multiRefLifecycleSummaryResourceId]).toMatchObject({
      value: seededMultiRefLifecycleSummary.value,
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === multiRefLifecycleTransactionId &&
            receipt.type === "transaction:rollback",
        ),
    ).toHaveLength(2);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === multiRefLifecycleTransactionId &&
            receipt.type === "transaction:interrupt",
        ),
    ).toHaveLength(1);
    expect(invalidationCount(actor.receipts(), multiRefLifecycleProjectResourceId)).toBe(0);
    expect(invalidationCount(actor.receipts(), multiRefLifecycleSummaryResourceId)).toBe(0);
    const issuesAfterBoundary = actor.issues();
    const receiptsAfterBoundary = actor.receipts().length;
    expect(receiptsAfterBoundary).toBeGreaterThan(receiptsAfterPending);

    controls.succeedAt(0, {
      id: seededMultiRefLifecycleProject.value.id,
      name: "Late Boundary Success",
    });
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context).toMatchObject({
      savedAt: null,
      error: null,
      savedProject: null,
    });
    expect(actor.issues()).toEqual(issuesAfterBoundary);
    expect(actor.snapshot().transactions[multiRefLifecycleTransactionId]).toMatchObject({
      status: "interrupt",
    });
    expect(actor.snapshot().resources[multiRefLifecycleProjectResourceId]).toMatchObject({
      value: seededMultiRefLifecycleProject.value,
    });
    expect(actor.snapshot().resources[multiRefLifecycleSummaryResourceId]).toMatchObject({
      value: seededMultiRefLifecycleSummary.value,
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === multiRefLifecycleTransactionId && receipt.type === "transaction:success",
        ),
    ).toHaveLength(0);
    expect(invalidationCount(actor.receipts(), multiRefLifecycleProjectResourceId)).toBe(0);
    expect(invalidationCount(actor.receipts(), multiRefLifecycleSummaryResourceId)).toBe(0);
    expect(actor.receipts()).toHaveLength(receiptsAfterBoundary);
  } finally {
    if (caseDef.boundary !== "dispose") {
      await runtime.dispose();
    }
  }
}

async function expectMultiRefLifecycleCleanupInRehydratedHarness(caseDef: MultiRefLifecycleCase) {
  const controls = createAbortableSaveLayer();
  const harness = startMultiRefLifecycleRehydratedHarness(caseDef.actorId, controls);

  try {
    harness.send({ type: "SAVE" });
    await harness.flush();

    expect(callNames(controls)).toEqual(["Boundary Draft"]);
    expect(harness.snapshot().transactions[multiRefLifecycleTransactionId]).toMatchObject({
      status: "pending",
    });
    expect(harness.snapshot().resources[multiRefLifecycleProjectResourceId]).toMatchObject({
      value: { id: seededMultiRefLifecycleProject.value.id, name: "Boundary Draft" },
    });
    expect(harness.snapshot().resources[multiRefLifecycleSummaryResourceId]).toMatchObject({
      value: { id: seededMultiRefLifecycleSummary.value.id, summary: "Boundary Draft" },
    });
    expect(harness.transactions().previewPatches(multiRefLifecycleTransactionId)).toHaveLength(2);
    expect(invalidationCount(harness.receipts(), multiRefLifecycleProjectResourceId)).toBe(0);
    expect(invalidationCount(harness.receipts(), multiRefLifecycleSummaryResourceId)).toBe(0);

    const receiptsAfterPending = harness.receipts().length;
    if (caseDef.boundary === "stop") {
      await harness.runtime.orchestrators.stop(harness.actor.id);
    } else {
      await harness.dispose();
    }
    await harness.flush();

    expect(controls.entryAt(0).signal.aborted).toBe(true);
    expect(controls.entryAt(0).abortCount()).toBe(1);
    expect(harness.snapshot().transactions[multiRefLifecycleTransactionId]).toMatchObject({
      status: "interrupt",
    });
    expect(harness.snapshot().resources[multiRefLifecycleProjectResourceId]).toMatchObject({
      value: seededMultiRefLifecycleProject.value,
    });
    expect(harness.snapshot().resources[multiRefLifecycleSummaryResourceId]).toMatchObject({
      value: seededMultiRefLifecycleSummary.value,
    });
    expect(harness.transactions().rollbacks(multiRefLifecycleTransactionId)).toHaveLength(2);
    expect(
      harness
        .transactions()
        .events(multiRefLifecycleTransactionId)
        .filter((receipt) => receipt.type === "transaction:interrupt"),
    ).toHaveLength(1);
    expect(invalidationCount(harness.receipts(), multiRefLifecycleProjectResourceId)).toBe(0);
    expect(invalidationCount(harness.receipts(), multiRefLifecycleSummaryResourceId)).toBe(0);
    const issuesAfterBoundary = harness.issues();
    const receiptsAfterBoundary = harness.receipts().length;
    expect(receiptsAfterBoundary).toBeGreaterThan(receiptsAfterPending);
    expectNoPendingWork(harness.pendingWork());

    controls.succeedAt(0, {
      id: seededMultiRefLifecycleProject.value.id,
      name: "Late Boundary Success",
    });
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedAt: null,
      error: null,
      savedProject: null,
    });
    expect(harness.issues()).toEqual(issuesAfterBoundary);
    expect(harness.snapshot().transactions[multiRefLifecycleTransactionId]).toMatchObject({
      status: "interrupt",
    });
    expect(harness.snapshot().resources[multiRefLifecycleProjectResourceId]).toMatchObject({
      value: seededMultiRefLifecycleProject.value,
    });
    expect(harness.snapshot().resources[multiRefLifecycleSummaryResourceId]).toMatchObject({
      value: seededMultiRefLifecycleSummary.value,
    });
    expect(
      harness
        .transactions()
        .events(multiRefLifecycleTransactionId)
        .filter((receipt) => receipt.type === "transaction:success"),
    ).toHaveLength(0);
    expect(invalidationCount(harness.receipts(), multiRefLifecycleProjectResourceId)).toBe(0);
    expect(invalidationCount(harness.receipts(), multiRefLifecycleSummaryResourceId)).toBe(0);
    expect(harness.receipts()).toHaveLength(receiptsAfterBoundary);
    expectNoPendingWork(harness.pendingWork());
  } finally {
    await harness.dispose();
  }
}

describe("submit transaction multi-ref lifecycle cleanup oracle", () => {
  for (const caseDef of multiRefLifecycleCases.filter(
    (entry) => entry.surface === "runtime-actor",
  )) {
    it(`matches the independent multi-ref lifecycle cleanup oracle for runtime actor ${caseDef.boundary}`, async () => {
      await expectMultiRefLifecycleCleanupInRuntimeActors(caseDef);
    });
  }

  for (const caseDef of multiRefLifecycleCases.filter(
    (entry) => entry.surface === "rehydrated-harness",
  )) {
    it(`matches the independent multi-ref lifecycle cleanup oracle for public rehydrated harness ${caseDef.boundary}`, async () => {
      await expectMultiRefLifecycleCleanupInRehydratedHarness(caseDef);
    });
  }
});
