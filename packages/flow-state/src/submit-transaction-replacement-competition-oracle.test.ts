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

type LateOlderCase = Readonly<{
  readonly kind: "late-older";
  readonly policy: ReplacementPolicy;
  readonly olderOutcome: OlderOutcome;
  readonly transactionId: string;
  readonly machineId: string;
}>;

type NewerWinningCase = Readonly<{
  readonly kind: "newer-wins";
  readonly policy: ReplacementPolicy;
  readonly olderOutcome: OlderOutcome;
  readonly newerOutcome: PreviewOutcome;
  readonly completionOrder: CompletionOrder;
  readonly transactionId: string;
  readonly machineId: string;
}>;

type ReplacementCompetitionCase = LateOlderCase | NewerWinningCase;

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

function lateOlderStages(caseDef: LateOlderCase) {
  const beforeFlushReceipts = initialReceiptTypes(caseDef.policy);
  const afterFlushReceipts =
    caseDef.policy === "allow" && caseDef.olderOutcome !== "success"
      ? [...beforeFlushReceipts, "transaction:rollback"]
      : [...beforeFlushReceipts];

  return {
    beforeFlush: {
      draftName: "Newer",
      savedNames: [],
      error: null,
      defected: false,
      resourceName: "Newer",
      ready: caseDef.policy === "allow" ? 1 : 0,
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
  const beforeFlushReceipts = initialReceiptTypes(caseDef.policy);

  if (caseDef.newerOutcome === "success") {
    const terminalReceiptTypes =
      caseDef.policy === "cancel-previous" || caseDef.olderOutcome === "success"
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
        ready: caseDef.policy === "allow" ? 2 : 1,
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
  const olderRollbackIncluded = caseDef.policy === "allow" && caseDef.olderOutcome !== "success";
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
      ready: caseDef.policy === "allow" ? 2 : 1,
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
        caseDef.policy === "cancel-previous" || caseDef.olderOutcome === "success"
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

function expectedStages(caseDef: ReplacementCompetitionCase) {
  return caseDef.kind === "late-older" ? lateOlderStages(caseDef) : newerWinningStages(caseDef);
}

function describeCase(caseDef: ReplacementCompetitionCase) {
  return caseDef.kind === "late-older"
    ? `late older ${caseDef.olderOutcome} for ${caseDef.policy}`
    : `${caseDef.policy}, older ${caseDef.olderOutcome}, newer ${caseDef.newerOutcome}, ${caseDef.completionOrder}`;
}

async function expectReplacementCompetitionInFlowTest(caseDef: ReplacementCompetitionCase) {
  const controls = createControlledSaveExitLayer();
  const { harness } = startPreviewFlowTest(caseDef, controls);
  const expected = expectedStages(caseDef);

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

async function expectReplacementCompetitionInRuntimeActors(caseDef: ReplacementCompetitionCase) {
  const controls = createControlledSaveExitLayer();
  const { actor, runtime } = startPreviewRuntimeActor(caseDef, controls);
  const expected = expectedStages(caseDef);

  try {
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

const lateOlderCases = (["allow", "cancel-previous"] as const).flatMap((policy) =>
  (["success", "failure", "defect"] as const).map((olderOutcome) => ({
    kind: "late-older" as const,
    policy,
    olderOutcome,
    transactionId: `BT38.preview.${policy}.${olderOutcome}.late-older`,
    machineId: `bt38.preview.${policy}.${olderOutcome}.late-older`,
  })),
) satisfies ReadonlyArray<LateOlderCase>;

const newerWinningCases = (["allow", "cancel-previous"] as const).flatMap((policy) =>
  (["success", "failure", "defect"] as const).flatMap((olderOutcome) =>
    (["success", "failure", "defect"] as const).flatMap((newerOutcome) =>
      (["older-first", "newer-first"] as const).map((completionOrder) => ({
        kind: "newer-wins" as const,
        policy,
        olderOutcome,
        newerOutcome,
        completionOrder,
        transactionId: `BT38.preview.${policy}.${olderOutcome}.${newerOutcome}.${completionOrder}`,
        machineId: `bt38.preview.${policy}.${olderOutcome}.${newerOutcome}.${completionOrder}`,
      })),
    ),
  ),
) satisfies ReadonlyArray<NewerWinningCase>;

describe("submit transaction replacement competition oracle", () => {
  for (const caseDef of lateOlderCases) {
    it(`matches the preview-backed replacement competition oracle in flowTest for ${describeCase(caseDef)}`, async () => {
      await expectReplacementCompetitionInFlowTest(caseDef);
    });
  }

  for (const caseDef of newerWinningCases) {
    it(`matches the preview-backed replacement competition oracle in flowTest for ${describeCase(caseDef)}`, async () => {
      await expectReplacementCompetitionInFlowTest(caseDef);
    });
  }

  for (const caseDef of lateOlderCases) {
    it(`matches the preview-backed replacement competition oracle in runtime actors for ${describeCase(caseDef)}`, async () => {
      await expectReplacementCompetitionInRuntimeActors(caseDef);
    });
  }

  for (const caseDef of newerWinningCases) {
    it(`matches the preview-backed replacement competition oracle in runtime actors for ${describeCase(caseDef)}`, async () => {
      await expectReplacementCompetitionInRuntimeActors(caseDef);
    });
  }
});
