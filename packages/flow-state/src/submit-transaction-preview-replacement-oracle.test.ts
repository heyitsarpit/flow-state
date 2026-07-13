import { describe, expect, it } from "vite-plus/test";

import {
  callNames,
  completeAttempt,
  createControlledSaveExitLayer,
  previewCompetitionCallNames,
  type PreviewBoundaryStage,
  type PreviewOutcome,
  type ReplacementPolicy,
  readFlowTestStage,
  readRuntimeStage,
  settleRawCompletionTurn,
  startPreviewFlowTest,
  startPreviewRuntimeActor,
} from "./testing/fixtures/submit-transaction-preview-competition.js";

type OlderOutcome = PreviewOutcome;
type CompletionOrder = "older-first" | "newer-first";

type SettledPredecessorCase = Readonly<{
  readonly kind: "settled-predecessor";
  readonly concurrency: "reject-while-running";
  readonly transactionId: string;
  readonly machineId: string;
}>;

type LateOlderCase = Readonly<{
  readonly kind: "late-older";
  readonly concurrency: ReplacementPolicy;
  readonly olderOutcome: OlderOutcome;
  readonly transactionId: string;
  readonly machineId: string;
}>;

type NewerWinningCase = Readonly<{
  readonly kind: "newer-wins";
  readonly concurrency: ReplacementPolicy;
  readonly olderOutcome: OlderOutcome;
  readonly newerOutcome: PreviewOutcome;
  readonly completionOrder: CompletionOrder;
  readonly transactionId: string;
  readonly machineId: string;
}>;

type ReplacementOracleCase = SettledPredecessorCase | LateOlderCase | NewerWinningCase;

function initialReceiptTypes(policy: ReplacementPolicy) {
  return policy === "allow"
    ? ([
        "transaction:start",
        "transaction:preview-patch",
        "transaction:start",
        "transaction:preview-patch",
      ] as const)
    : ([
        "transaction:start",
        "transaction:preview-patch",
        "transaction:interrupt",
        "transaction:rollback",
        "transaction:start",
        "transaction:preview-patch",
      ] as const);
}

function settledPredecessorStages() {
  return {
    afterOlderSave: {
      draftName: "Older",
      savedNames: [],
      error: null,
      defected: false,
      resourceName: "Older",
      ready: 0,
      issueKind: null,
      receiptTypes: ["transaction:start", "transaction:preview-patch"],
      transaction: {
        status: "pending",
      },
    } satisfies PreviewBoundaryStage,
    afterOlderSettle: {
      draftName: "Older",
      savedNames: [],
      error: null,
      defected: false,
      resourceName: "Older",
      ready: 1,
      issueKind: null,
      receiptTypes: ["transaction:start", "transaction:preview-patch"],
      transaction: {
        status: "pending",
      },
    } satisfies PreviewBoundaryStage,
    afterNewerSaveBeforeFlush: {
      draftName: "Newer",
      savedNames: ["Older"],
      error: null,
      defected: false,
      resourceName: "Newer",
      ready: 0,
      issueKind: null,
      receiptTypes: [
        "transaction:start",
        "transaction:preview-patch",
        "transaction:success",
        "transaction:start",
        "transaction:preview-patch",
      ],
      transaction: {
        status: "pending",
      },
    } satisfies PreviewBoundaryStage,
    afterNewerSettle: {
      draftName: "Newer",
      savedNames: ["Older"],
      error: null,
      defected: false,
      resourceName: "Newer",
      ready: 1,
      issueKind: null,
      receiptTypes: [
        "transaction:start",
        "transaction:preview-patch",
        "transaction:success",
        "transaction:start",
        "transaction:preview-patch",
      ],
      transaction: {
        status: "pending",
      },
    } satisfies PreviewBoundaryStage,
    afterNewerFlush: {
      draftName: "Newer",
      savedNames: ["Older", "Newer"],
      error: null,
      defected: false,
      resourceName: "Newer",
      ready: 0,
      issueKind: null,
      receiptTypes: [
        "transaction:start",
        "transaction:preview-patch",
        "transaction:success",
        "transaction:start",
        "transaction:preview-patch",
        "transaction:success",
      ],
      transaction: {
        status: "success",
        valueName: "Newer",
      },
    } satisfies PreviewBoundaryStage,
  };
}

function lateOlderStages(caseDef: LateOlderCase) {
  const beforeFlushReceipts = initialReceiptTypes(caseDef.concurrency);
  const afterFlushReceipts =
    caseDef.concurrency === "allow" && caseDef.olderOutcome !== "success"
      ? [...beforeFlushReceipts, "transaction:rollback"]
      : [...beforeFlushReceipts];

  return {
    beforeFlush: {
      draftName: "Newer",
      savedNames: [],
      error: null,
      defected: false,
      resourceName: "Newer",
      ready: caseDef.concurrency === "allow" ? 1 : 0,
      issueKind: null,
      receiptTypes: [...beforeFlushReceipts],
      transaction: {
        status: "pending",
      },
    } satisfies PreviewBoundaryStage,
    afterFlush: {
      draftName: "Newer",
      savedNames: [],
      error: null,
      defected: false,
      resourceName: "Newer",
      ready: 0,
      issueKind: null,
      receiptTypes: afterFlushReceipts,
      transaction: {
        status: "pending",
      },
    } satisfies PreviewBoundaryStage,
  };
}

function newerWinningStages(caseDef: NewerWinningCase) {
  const beforeFlushReceipts = initialReceiptTypes(caseDef.concurrency);

  if (caseDef.newerOutcome === "success") {
    const terminalReceiptTypes =
      caseDef.concurrency === "cancel-previous" || caseDef.olderOutcome === "success"
        ? (["transaction:success"] as const)
        : caseDef.completionOrder === "older-first"
          ? (["transaction:rollback", "transaction:success"] as const)
          : (["transaction:success", "transaction:rollback"] as const);

    return {
      beforeFlush: {
        draftName: "Newer",
        savedNames: [],
        error: null,
        defected: false,
        resourceName: "Newer",
        ready: caseDef.concurrency === "allow" ? 2 : 1,
        issueKind: null,
        receiptTypes: [...beforeFlushReceipts],
        transaction: {
          status: "pending",
        },
      } satisfies PreviewBoundaryStage,
      afterFlush: {
        draftName: "Newer",
        savedNames: ["Newer"],
        error: null,
        defected: false,
        resourceName: "Newer",
        ready: 0,
        issueKind: null,
        receiptTypes: [...beforeFlushReceipts, ...terminalReceiptTypes],
        transaction: {
          status: "success",
          valueName: "Newer",
        },
      } satisfies PreviewBoundaryStage,
    };
  }

  const terminalReceiptType =
    caseDef.newerOutcome === "failure" ? "transaction:failure" : "transaction:defect";
  const olderRollbackIncluded =
    caseDef.concurrency === "allow" && caseDef.olderOutcome !== "success";
  const terminalReceiptTypes =
    olderRollbackIncluded && caseDef.completionOrder === "older-first"
      ? (["transaction:rollback", terminalReceiptType, "transaction:rollback"] as const)
      : olderRollbackIncluded
        ? ([terminalReceiptType, "transaction:rollback", "transaction:rollback"] as const)
        : ([terminalReceiptType, "transaction:rollback"] as const);

  return {
    beforeFlush: {
      draftName: "Newer",
      savedNames: [],
      error: null,
      defected: false,
      resourceName: "Newer",
      ready: caseDef.concurrency === "allow" ? 2 : 1,
      issueKind: null,
      receiptTypes: [...beforeFlushReceipts],
      transaction: {
        status: "pending",
      },
    } satisfies PreviewBoundaryStage,
    afterFlush: {
      draftName: "Newer",
      savedNames: [],
      error: caseDef.newerOutcome === "failure" ? "conflict" : null,
      defected: caseDef.newerOutcome === "defect",
      resourceName:
        caseDef.concurrency === "cancel-previous" || caseDef.olderOutcome === "success"
          ? "Older"
          : caseDef.completionOrder === "older-first"
            ? "Newer"
            : "Older",
      ready: 0,
      issueKind: caseDef.newerOutcome,
      receiptTypes: [...beforeFlushReceipts, ...terminalReceiptTypes],
      transaction:
        caseDef.newerOutcome === "failure"
          ? {
              status: "failure",
              error: "conflict",
            }
          : {
              status: "defect",
            },
    } satisfies PreviewBoundaryStage,
  };
}

function describeCase(caseDef: ReplacementOracleCase) {
  switch (caseDef.kind) {
    case "settled-predecessor":
      return `settled predecessor replacement dispatch for ${caseDef.concurrency}`;
    case "late-older":
      return `late older ${caseDef.olderOutcome} for ${caseDef.concurrency}`;
    case "newer-wins":
      return `${caseDef.concurrency}, older ${caseDef.olderOutcome}, newer ${caseDef.newerOutcome}, ${caseDef.completionOrder}`;
  }
}

async function expectPreviewReplacementOracleInFlowTest(caseDef: ReplacementOracleCase) {
  const controls = createControlledSaveExitLayer();
  const { harness } = startPreviewFlowTest(caseDef, controls);

  if (caseDef.kind === "settled-predecessor") {
    const expected = settledPredecessorStages();
    harness.send({ type: "SAVE", name: "Older" });
    expect(readFlowTestStage(harness, caseDef.transactionId)).toEqual(expected.afterOlderSave);

    completeAttempt(
      controls,
      0,
      "success",
      "Older",
      "unreachable settled predecessor older defect",
    );
    await settleRawCompletionTurn();
    expect(readFlowTestStage(harness, caseDef.transactionId)).toEqual(expected.afterOlderSettle);

    harness.send({ type: "SAVE", name: "Newer" });
    expect(readFlowTestStage(harness, caseDef.transactionId)).toEqual(
      expected.afterNewerSaveBeforeFlush,
    );

    completeAttempt(
      controls,
      1,
      "success",
      "Newer",
      "unreachable settled predecessor newer defect",
    );
    await settleRawCompletionTurn();
    expect(readFlowTestStage(harness, caseDef.transactionId)).toEqual(expected.afterNewerSettle);

    await harness.flush();
    expect(callNames(controls)).toEqual(previewCompetitionCallNames);
    expect(readFlowTestStage(harness, caseDef.transactionId)).toEqual(expected.afterNewerFlush);
    return;
  }

  const expected =
    caseDef.kind === "late-older" ? lateOlderStages(caseDef) : newerWinningStages(caseDef);

  harness.send({ type: "SAVE", name: "Older" });
  harness.send({ type: "SAVE", name: "Newer" });
  await harness.flush();

  if (caseDef.kind === "late-older") {
    completeAttempt(
      controls,
      0,
      caseDef.olderOutcome,
      "Older",
      `older late ${caseDef.olderOutcome} competition defect`,
    );
    await settleRawCompletionTurn();
  } else if (caseDef.completionOrder === "older-first") {
    completeAttempt(
      controls,
      0,
      caseDef.olderOutcome,
      "Older",
      `older ${caseDef.olderOutcome} replacement competition defect`,
    );
    await settleRawCompletionTurn();
    completeAttempt(
      controls,
      1,
      caseDef.newerOutcome,
      "Newer",
      `newer ${caseDef.newerOutcome} replacement competition defect`,
    );
    await settleRawCompletionTurn();
  } else {
    completeAttempt(
      controls,
      1,
      caseDef.newerOutcome,
      "Newer",
      `newer ${caseDef.newerOutcome} replacement competition defect`,
    );
    await settleRawCompletionTurn();
    completeAttempt(
      controls,
      0,
      caseDef.olderOutcome,
      "Older",
      `older ${caseDef.olderOutcome} replacement competition defect`,
    );
    await settleRawCompletionTurn();
  }

  expect(callNames(controls)).toEqual(previewCompetitionCallNames);
  expect(readFlowTestStage(harness, caseDef.transactionId)).toEqual(expected.beforeFlush);
  await harness.flush();
  expect(readFlowTestStage(harness, caseDef.transactionId)).toEqual(expected.afterFlush);
}

async function expectPreviewReplacementOracleInRuntimeActors(caseDef: ReplacementOracleCase) {
  const controls = createControlledSaveExitLayer();
  const { actor, runtime } = startPreviewRuntimeActor(caseDef, controls);

  try {
    if (caseDef.kind === "settled-predecessor") {
      const expected = settledPredecessorStages();
      actor.send({ type: "SAVE", name: "Older" });
      expect(readRuntimeStage(actor, caseDef.transactionId)).toEqual(expected.afterOlderSave);

      completeAttempt(
        controls,
        0,
        "success",
        "Older",
        "unreachable settled predecessor older defect",
      );
      await settleRawCompletionTurn();
      expect(readRuntimeStage(actor, caseDef.transactionId)).toEqual(expected.afterOlderSettle);

      actor.send({ type: "SAVE", name: "Newer" });
      expect(readRuntimeStage(actor, caseDef.transactionId)).toEqual(
        expected.afterNewerSaveBeforeFlush,
      );

      completeAttempt(
        controls,
        1,
        "success",
        "Newer",
        "unreachable settled predecessor newer defect",
      );
      await settleRawCompletionTurn();
      expect(readRuntimeStage(actor, caseDef.transactionId)).toEqual(expected.afterNewerSettle);

      await actor.flush();
      expect(callNames(controls)).toEqual(previewCompetitionCallNames);
      expect(readRuntimeStage(actor, caseDef.transactionId)).toEqual(expected.afterNewerFlush);
      return;
    }

    const expected =
      caseDef.kind === "late-older" ? lateOlderStages(caseDef) : newerWinningStages(caseDef);

    actor.send({ type: "SAVE", name: "Older" });
    actor.send({ type: "SAVE", name: "Newer" });
    await actor.flush();

    if (caseDef.kind === "late-older") {
      completeAttempt(
        controls,
        0,
        caseDef.olderOutcome,
        "Older",
        `older late ${caseDef.olderOutcome} competition defect`,
      );
      await settleRawCompletionTurn();
    } else if (caseDef.completionOrder === "older-first") {
      completeAttempt(
        controls,
        0,
        caseDef.olderOutcome,
        "Older",
        `older ${caseDef.olderOutcome} replacement competition defect`,
      );
      await settleRawCompletionTurn();
      completeAttempt(
        controls,
        1,
        caseDef.newerOutcome,
        "Newer",
        `newer ${caseDef.newerOutcome} replacement competition defect`,
      );
      await settleRawCompletionTurn();
    } else {
      completeAttempt(
        controls,
        1,
        caseDef.newerOutcome,
        "Newer",
        `newer ${caseDef.newerOutcome} replacement competition defect`,
      );
      await settleRawCompletionTurn();
      completeAttempt(
        controls,
        0,
        caseDef.olderOutcome,
        "Older",
        `older ${caseDef.olderOutcome} replacement competition defect`,
      );
      await settleRawCompletionTurn();
    }

    expect(callNames(controls)).toEqual(previewCompetitionCallNames);
    expect(readRuntimeStage(actor, caseDef.transactionId)).toEqual(expected.beforeFlush);

    await actor.flush();
    expect(readRuntimeStage(actor, caseDef.transactionId)).toEqual(expected.afterFlush);
  } finally {
    await runtime.dispose();
  }
}

const settledPredecessorCases = [
  {
    kind: "settled-predecessor" as const,
    concurrency: "reject-while-running" as const,
    transactionId: "BT38.preview.reject-while-running.settled-predecessor",
    machineId: "bt38.preview.reject-while-running.settled-predecessor",
  },
] satisfies ReadonlyArray<SettledPredecessorCase>;

const lateOlderCases = (["allow", "cancel-previous"] as const).flatMap((concurrency) =>
  (["success", "failure", "defect"] as const).map((olderOutcome) => ({
    kind: "late-older" as const,
    concurrency,
    olderOutcome,
    transactionId: `BT38.preview.${concurrency}.${olderOutcome}.late-older`,
    machineId: `bt38.preview.${concurrency}.${olderOutcome}.late-older`,
  })),
) satisfies ReadonlyArray<LateOlderCase>;

const newerWinningCases = (["allow", "cancel-previous"] as const).flatMap((concurrency) =>
  (["success", "failure", "defect"] as const).flatMap((olderOutcome) =>
    (["success", "failure", "defect"] as const).flatMap((newerOutcome) =>
      (["older-first", "newer-first"] as const).map((completionOrder) => ({
        kind: "newer-wins" as const,
        concurrency,
        olderOutcome,
        newerOutcome,
        completionOrder,
        transactionId: `BT38.preview.${concurrency}.${olderOutcome}.${newerOutcome}.${completionOrder}`,
        machineId: `bt38.preview.${concurrency}.${olderOutcome}.${newerOutcome}.${completionOrder}`,
      })),
    ),
  ),
) satisfies ReadonlyArray<NewerWinningCase>;

describe("submit transaction preview replacement oracle", () => {
  for (const caseDef of settledPredecessorCases) {
    it(`matches the preview replacement oracle in flowTest for ${describeCase(caseDef)}`, async () => {
      await expectPreviewReplacementOracleInFlowTest(caseDef);
    });
  }

  for (const caseDef of lateOlderCases) {
    it(`matches the preview replacement oracle in flowTest for ${describeCase(caseDef)}`, async () => {
      await expectPreviewReplacementOracleInFlowTest(caseDef);
    });
  }

  for (const caseDef of newerWinningCases) {
    it(`matches the preview replacement oracle in flowTest for ${describeCase(caseDef)}`, async () => {
      await expectPreviewReplacementOracleInFlowTest(caseDef);
    });
  }

  for (const caseDef of settledPredecessorCases) {
    it(`matches the preview replacement oracle in runtime actors for ${describeCase(caseDef)}`, async () => {
      await expectPreviewReplacementOracleInRuntimeActors(caseDef);
    });
  }

  for (const caseDef of lateOlderCases) {
    it(`matches the preview replacement oracle in runtime actors for ${describeCase(caseDef)}`, async () => {
      await expectPreviewReplacementOracleInRuntimeActors(caseDef);
    });
  }

  for (const caseDef of newerWinningCases) {
    it(`matches the preview replacement oracle in runtime actors for ${describeCase(caseDef)}`, async () => {
      await expectPreviewReplacementOracleInRuntimeActors(caseDef);
    });
  }
});
