import { describe, expect, it } from "vite-plus/test";

import {
  callNames,
  completeNewerAttempt,
  completeOlderAttempt,
  createControlledSaveExitLayer,
  multiRefCallNames,
  type MultiRefBoundaryStage,
  type OlderOutcome,
  readFlowTestStage,
  readRuntimeStage,
  startMultiRefFlowTest,
  startMultiRefRuntimeActor,
} from "./testing/fixtures/submit-transaction-multi-ref-replacement.js";

type MultiRefReplacementCase = Readonly<{
  readonly olderOutcome: OlderOutcome;
  readonly machineId: string;
}>;

function expectedStages() {
  return {
    pendingAfterDispatch: {
      draftName: "Draft B",
      savedNames: [],
      error: null,
      ready: 1,
      issueCount: 0,
      project: {
        status: "value",
        name: "Draft B",
      },
      summary: {
        status: "value",
        summary: "Draft B",
      },
      invalidationCounts: {
        project: 0,
        projectSummary: 0,
      },
      receiptTypes: [
        "transaction:start",
        "transaction:preview-patch",
        "transaction:preview-patch",
        "transaction:interrupt",
        "transaction:rollback",
        "transaction:rollback",
        "transaction:start",
        "transaction:preview-patch",
        "transaction:preview-patch",
      ],
      transaction: {
        status: "pending",
      },
    } satisfies MultiRefBoundaryStage,
    afterNewerSuccess: {
      draftName: "Draft B",
      savedNames: ["Draft B"],
      error: null,
      ready: 0,
      issueCount: 0,
      project: {
        status: "stale",
        freshness: "invalidated",
      },
      summary: {
        status: "stale",
        freshness: "invalidated",
      },
      invalidationCounts: {
        project: 1,
        projectSummary: 1,
      },
      receiptTypes: [
        "transaction:start",
        "transaction:preview-patch",
        "transaction:preview-patch",
        "transaction:interrupt",
        "transaction:rollback",
        "transaction:rollback",
        "transaction:start",
        "transaction:preview-patch",
        "transaction:preview-patch",
        "transaction:success",
      ],
      transaction: {
        status: "success",
        valueName: "Draft B",
      },
    } satisfies MultiRefBoundaryStage,
  };
}

async function expectMultiRefReplacementOracleInFlowTest(caseDef: MultiRefReplacementCase) {
  const controls = createControlledSaveExitLayer();
  const { harness } = startMultiRefFlowTest(caseDef.machineId, controls);
  const expected = expectedStages();

  harness.send({ type: "SAVE_A" });
  harness.send({ type: "SAVE_B" });
  expect(callNames(controls)).toEqual(multiRefCallNames);
  expect(readFlowTestStage(harness)).toEqual(expected.pendingAfterDispatch);

  completeNewerAttempt(controls);
  await harness.flush();
  await harness.flush();
  expect(readFlowTestStage(harness)).toEqual(expected.afterNewerSuccess);

  completeOlderAttempt(controls, caseDef.olderOutcome);
  await harness.flush();
  await harness.flush();
  expect(readFlowTestStage(harness)).toEqual(expected.afterNewerSuccess);
}

async function expectMultiRefReplacementOracleInRuntimeActors(caseDef: MultiRefReplacementCase) {
  const controls = createControlledSaveExitLayer();
  const { actor, runtime } = startMultiRefRuntimeActor(caseDef.machineId, controls);
  const expected = expectedStages();

  try {
    actor.send({ type: "SAVE_A" });
    actor.send({ type: "SAVE_B" });
    expect(callNames(controls)).toEqual(multiRefCallNames);
    expect(readRuntimeStage(actor)).toEqual(expected.pendingAfterDispatch);

    completeNewerAttempt(controls);
    await actor.flush();
    await actor.flush();
    expect(readRuntimeStage(actor)).toEqual(expected.afterNewerSuccess);

    completeOlderAttempt(controls, caseDef.olderOutcome);
    await actor.flush();
    await actor.flush();
    expect(readRuntimeStage(actor)).toEqual(expected.afterNewerSuccess);
  } finally {
    await runtime.dispose();
  }
}

const multiRefReplacementCases = (["success", "defect"] as const).map((olderOutcome) => ({
  olderOutcome,
  machineId: `bt38.multi-ref-cancel.${olderOutcome}`,
})) satisfies ReadonlyArray<MultiRefReplacementCase>;

describe("submit transaction multi-ref replacement oracle", () => {
  for (const caseDef of multiRefReplacementCases) {
    it(`matches the multi-ref cancel-previous replacement oracle in flowTest for stale older ${caseDef.olderOutcome}`, async () => {
      await expectMultiRefReplacementOracleInFlowTest(caseDef);
    });
  }

  for (const caseDef of multiRefReplacementCases) {
    it(`matches the multi-ref cancel-previous replacement oracle in runtime actors for stale older ${caseDef.olderOutcome}`, async () => {
      await expectMultiRefReplacementOracleInRuntimeActors(caseDef);
    });
  }
});
