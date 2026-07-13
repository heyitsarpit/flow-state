import { describe, expect, it } from "vite-plus/test";

import {
  callNames,
  completeAttempt,
  createControlledSaveExitLayer,
  readFlowTestStage,
  readRuntimeStage,
  startReplacementInterleavingFlowTest,
  startReplacementInterleavingRuntimeActor,
  type OlderOutcome,
  type ReplacementInterleavingBoundaryStage,
  type ReplacementPolicy,
} from "./testing/fixtures/submit-transaction-replacement-interleaving.js";

type CompletionOrder = "older-first" | "newer-first";

type ReplacementInterleavingCase = Readonly<{
  readonly policy: ReplacementPolicy;
  readonly olderOutcome: OlderOutcome;
  readonly completionOrder: CompletionOrder;
  readonly olderName: string;
  readonly newerName: string;
  readonly transactionId: string;
  readonly machineId: string;
}>;

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

function pendingStage(caseDef: ReplacementInterleavingCase) {
  return {
    draftName: caseDef.newerName,
    savedNames: [],
    error: null,
    defected: false,
    resourceName: caseDef.newerName,
    issueCount: 0,
    receiptCounts: {
      success: 0,
      failure: 0,
      defect: 0,
      interrupt: caseDef.policy === "cancel-previous" ? 1 : 0,
    },
    transaction: {
      status: "pending",
    },
  } as const;
}

function afterFirstStage(
  caseDef: ReplacementInterleavingCase,
): ReplacementInterleavingBoundaryStage {
  if (caseDef.completionOrder === "older-first") {
    return {
      draftName: caseDef.newerName,
      savedNames: [],
      error: null,
      defected: false,
      resourceName: caseDef.newerName,
      ready: 0,
      issueCount: 0,
      receiptCounts: {
        success: 0,
        failure: 0,
        defect: 0,
        interrupt: caseDef.policy === "cancel-previous" ? 1 : 0,
      },
      transaction: {
        status: "pending",
      },
    };
  }

  return {
    draftName: caseDef.newerName,
    savedNames: [caseDef.newerName],
    error: null,
    defected: false,
    resourceName: caseDef.newerName,
    ready: 0,
    issueCount: 0,
    receiptCounts: {
      success: 1,
      failure: 0,
      defect: 0,
      interrupt: caseDef.policy === "cancel-previous" ? 1 : 0,
    },
    transaction: {
      status: "success",
      valueName: caseDef.newerName,
    },
  };
}

function finalStage(caseDef: ReplacementInterleavingCase): ReplacementInterleavingBoundaryStage {
  return {
    draftName: caseDef.newerName,
    savedNames: [caseDef.newerName],
    error: null,
    defected: false,
    resourceName: caseDef.newerName,
    ready: 0,
    issueCount: 0,
    receiptCounts: {
      success: 1,
      failure: 0,
      defect: 0,
      interrupt: caseDef.policy === "cancel-previous" ? 1 : 0,
    },
    transaction: {
      status: "success",
      valueName: caseDef.newerName,
    },
  };
}

async function expectReplacementInterleavingOracleInFlowTest(caseDef: ReplacementInterleavingCase) {
  const controls = createControlledSaveExitLayer();
  const { harness } = startReplacementInterleavingFlowTest(caseDef, controls);

  harness.send({ type: "SAVE", name: caseDef.olderName });
  harness.send({ type: "SAVE", name: caseDef.newerName });
  await harness.flush();

  expect(callNames(controls)).toEqual([caseDef.olderName, caseDef.newerName]);
  expect(readFlowTestStage(harness, caseDef.transactionId)).toMatchObject(pendingStage(caseDef));

  if (caseDef.completionOrder === "older-first") {
    completeAttempt(
      controls,
      0,
      caseDef.olderOutcome,
      caseDef.olderName,
      "older replacement defect",
    );
  } else {
    completeAttempt(controls, 1, "success", caseDef.newerName, "newer replacement defect");
  }
  await harness.flush();
  await harness.flush();

  expect(readFlowTestStage(harness, caseDef.transactionId)).toEqual(afterFirstStage(caseDef));

  if (caseDef.completionOrder === "older-first") {
    completeAttempt(controls, 1, "success", caseDef.newerName, "newer replacement defect");
  } else {
    completeAttempt(
      controls,
      0,
      caseDef.olderOutcome,
      caseDef.olderName,
      "older replacement defect",
    );
  }
  await harness.flush();
  await harness.flush();

  expect(readFlowTestStage(harness, caseDef.transactionId)).toEqual(finalStage(caseDef));
  expectNoPendingWork(harness.pendingWork());
}

async function expectReplacementInterleavingOracleInRuntimeActors(
  caseDef: ReplacementInterleavingCase,
) {
  const controls = createControlledSaveExitLayer();
  const { actor, runtime } = startReplacementInterleavingRuntimeActor(caseDef, controls);

  try {
    actor.send({ type: "SAVE", name: caseDef.olderName });
    actor.send({ type: "SAVE", name: caseDef.newerName });
    await actor.flush();

    expect(callNames(controls)).toEqual([caseDef.olderName, caseDef.newerName]);
    expect(readRuntimeStage(actor, caseDef.transactionId)).toMatchObject(pendingStage(caseDef));

    if (caseDef.completionOrder === "older-first") {
      completeAttempt(
        controls,
        0,
        caseDef.olderOutcome,
        caseDef.olderName,
        "older replacement defect",
      );
    } else {
      completeAttempt(controls, 1, "success", caseDef.newerName, "newer replacement defect");
    }
    await actor.flush();
    await actor.flush();

    expect(readRuntimeStage(actor, caseDef.transactionId)).toEqual(afterFirstStage(caseDef));

    if (caseDef.completionOrder === "older-first") {
      completeAttempt(controls, 1, "success", caseDef.newerName, "newer replacement defect");
    } else {
      completeAttempt(
        controls,
        0,
        caseDef.olderOutcome,
        caseDef.olderName,
        "older replacement defect",
      );
    }
    await actor.flush();
    await actor.flush();

    expect(readRuntimeStage(actor, caseDef.transactionId)).toEqual(finalStage(caseDef));
  } finally {
    await runtime.dispose();
  }
}

const replacementInterleavingCases: ReadonlyArray<ReplacementInterleavingCase> = (
  ["allow", "cancel-previous"] as const
).flatMap((policy) =>
  (["success", "failure", "defect"] as const).flatMap((olderOutcome) =>
    (["older-first", "newer-first"] as const).map((completionOrder) => ({
      policy,
      olderOutcome,
      completionOrder,
      olderName: "Draft A",
      newerName: "Draft B",
      transactionId: `BT38.replacementInterleaving.${policy}.${olderOutcome}`,
      machineId: `bt38.replacement-interleaving.${policy}.${olderOutcome}.${completionOrder}`,
    })),
  ),
);

describe("submit transaction replacement interleaving oracle", () => {
  for (const caseDef of replacementInterleavingCases) {
    it(`matches the replacement interleaving oracle in flowTest for ${caseDef.policy}, ${caseDef.olderOutcome}, and ${caseDef.completionOrder}`, async () => {
      await expectReplacementInterleavingOracleInFlowTest(caseDef);
    });
  }

  for (const caseDef of replacementInterleavingCases) {
    it(`matches the replacement interleaving oracle in runtime actors for ${caseDef.policy}, ${caseDef.olderOutcome}, and ${caseDef.completionOrder}`, async () => {
      await expectReplacementInterleavingOracleInRuntimeActors(caseDef);
    });
  }
});
