import { describe, expect, it } from "vite-plus/test";

import {
  callNames,
  completeNewerSuccess,
  completeOlderFailure,
  createControlledSaveLayer,
  readFlowTestStage,
  readRuntimeStage,
  startAllowLatestWinsFlowTest,
  startAllowLatestWinsRuntimeActor,
  type AllowLatestWinsBoundaryStage,
} from "./testing/fixtures/submit-transaction-allow-latest-wins.js";

type AllowLatestWinsCase = Readonly<{
  readonly olderName: string;
  readonly newerName: string;
  readonly machineId: string;
  readonly actorId: string;
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

function pendingStage(newerName: string): Partial<AllowLatestWinsBoundaryStage> {
  return {
    draftName: newerName,
    savedNames: [],
    error: null,
    resourceName: newerName,
    issueCount: 0,
    receiptCounts: {
      start: 2,
      queue: 0,
      dequeue: 0,
      success: 0,
      failure: 0,
      defect: 0,
      interrupt: 0,
    },
    transaction: {
      status: "pending",
    },
  };
}

function staleFailureStage(newerName: string): AllowLatestWinsBoundaryStage {
  return {
    draftName: newerName,
    savedNames: [],
    error: null,
    resourceName: newerName,
    ready: 0,
    issueCount: 0,
    receiptCounts: {
      start: 2,
      queue: 0,
      dequeue: 0,
      success: 0,
      failure: 0,
      defect: 0,
      interrupt: 0,
    },
    transaction: {
      status: "pending",
    },
  };
}

function terminalStage(newerName: string): AllowLatestWinsBoundaryStage {
  return {
    draftName: newerName,
    savedNames: [newerName],
    error: null,
    resourceName: newerName,
    ready: 0,
    issueCount: 0,
    receiptCounts: {
      start: 2,
      queue: 0,
      dequeue: 0,
      success: 1,
      failure: 0,
      defect: 0,
      interrupt: 0,
    },
    transaction: {
      status: "success",
      valueName: newerName,
    },
  };
}

async function expectAllowLatestWinsOracleInFlowTest(caseDef: AllowLatestWinsCase) {
  const controls = createControlledSaveLayer();
  const { harness } = startAllowLatestWinsFlowTest(caseDef.machineId, controls);

  harness.send({ type: "SAVE", name: caseDef.olderName });
  harness.send({ type: "SAVE", name: caseDef.newerName });

  expect(callNames(controls)).toEqual([caseDef.olderName, caseDef.newerName]);
  expect(readFlowTestStage(harness)).toMatchObject(pendingStage(caseDef.newerName));

  completeOlderFailure(controls);
  await harness.flush();
  await harness.flush();

  expect(readFlowTestStage(harness)).toEqual(staleFailureStage(caseDef.newerName));

  completeNewerSuccess(controls, caseDef.newerName);
  await harness.flush();
  await harness.flush();

  expect(readFlowTestStage(harness)).toEqual(terminalStage(caseDef.newerName));
  expectNoPendingWork(harness.pendingWork());
}

async function expectAllowLatestWinsOracleInRuntimeActors(caseDef: AllowLatestWinsCase) {
  const controls = createControlledSaveLayer();
  const { actor, runtime } = startAllowLatestWinsRuntimeActor(
    caseDef.machineId,
    caseDef.actorId,
    controls,
  );

  try {
    actor.send({ type: "SAVE", name: caseDef.olderName });
    actor.send({ type: "SAVE", name: caseDef.newerName });
    await actor.flush();

    expect(callNames(controls)).toEqual([caseDef.olderName, caseDef.newerName]);
    expect(readRuntimeStage(actor)).toMatchObject(pendingStage(caseDef.newerName));

    completeOlderFailure(controls);
    await actor.flush();
    await actor.flush();

    expect(readRuntimeStage(actor)).toEqual(staleFailureStage(caseDef.newerName));

    completeNewerSuccess(controls, caseDef.newerName);
    await actor.flush();
    await actor.flush();

    expect(readRuntimeStage(actor)).toEqual(terminalStage(caseDef.newerName));
  } finally {
    await runtime.dispose();
  }
}

const allowLatestWinsCases = [
  {
    olderName: "Draft A",
    newerName: "Draft B",
    machineId: "bt38.allow-latest-wins.flow-test",
    actorId: "bt38.allow-latest-wins.flow-test.actor",
  },
  {
    olderName: "Draft A",
    newerName: "Draft B",
    machineId: "bt38.allow-latest-wins.runtime",
    actorId: "bt38.allow-latest-wins.runtime.actor",
  },
] as const satisfies ReadonlyArray<AllowLatestWinsCase>;

describe("submit transaction allow latest-wins oracle", () => {
  it("keeps the newer allow attempt pending after the older failure goes stale in flowTest", async () => {
    await expectAllowLatestWinsOracleInFlowTest(allowLatestWinsCases[0]);
  });

  it("keeps the newer allow attempt pending after the older failure goes stale in runtime actors", async () => {
    await expectAllowLatestWinsOracleInRuntimeActors(allowLatestWinsCases[1]);
  });
});
