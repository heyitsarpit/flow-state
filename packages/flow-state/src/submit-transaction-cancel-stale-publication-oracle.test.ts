import { describe, expect, it } from "vite-plus/test";

import {
  callNames,
  completeNewerAttempt,
  completeOlderAttempt,
  createAbortableSaveExitLayer,
  readFlowTestStage,
  readRuntimeStage,
  startCancelStalePublicationFlowTest,
  startCancelStalePublicationRuntimeActor,
  type CancelStalePublicationBoundaryStage,
  type CancelStalePublicationOutcome,
} from "./testing/fixtures/submit-transaction-cancel-stale-publication.js";

type CancelStalePublicationCase = Readonly<{
  readonly outcome: CancelStalePublicationOutcome;
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

function pendingStage(newerName: string): Partial<CancelStalePublicationBoundaryStage> {
  return {
    draftName: newerName,
    savedNames: [],
    error: null,
    defected: false,
    resourceName: newerName,
    issueCount: 0,
    receiptCounts: {
      success: 0,
      failure: 0,
      defect: 0,
      interrupt: 1,
    },
    transaction: {
      status: "pending",
    },
    firstAbortCount: 1,
    secondAborted: false,
  };
}

function staleOlderStage(newerName: string): CancelStalePublicationBoundaryStage {
  return {
    draftName: newerName,
    savedNames: [],
    error: null,
    defected: false,
    resourceName: newerName,
    ready: 0,
    issueCount: 0,
    receiptCounts: {
      success: 0,
      failure: 0,
      defect: 0,
      interrupt: 1,
    },
    transaction: {
      status: "pending",
    },
    firstAbortCount: 1,
    secondAborted: false,
  };
}

function terminalStage(newerName: string): CancelStalePublicationBoundaryStage {
  return {
    draftName: newerName,
    savedNames: [newerName],
    error: null,
    defected: false,
    resourceName: newerName,
    ready: 0,
    issueCount: 0,
    receiptCounts: {
      success: 1,
      failure: 0,
      defect: 0,
      interrupt: 1,
    },
    transaction: {
      status: "success",
      valueName: newerName,
    },
    firstAbortCount: 1,
    secondAborted: false,
  };
}

async function expectCancelStalePublicationOracleInFlowTest(caseDef: CancelStalePublicationCase) {
  const controls = createAbortableSaveExitLayer();
  const { harness } = startCancelStalePublicationFlowTest(caseDef.machineId, controls);
  const expectedStale = staleOlderStage(caseDef.newerName);
  const expectedTerminal = terminalStage(caseDef.newerName);

  harness.send({ type: "SAVE", name: caseDef.olderName });
  harness.send({ type: "SAVE", name: caseDef.newerName });
  await harness.flush();

  expect(callNames(controls)).toEqual([caseDef.olderName, caseDef.newerName]);
  expect(readFlowTestStage(harness, controls)).toMatchObject(pendingStage(caseDef.newerName));

  completeOlderAttempt(controls, caseDef.outcome, caseDef.olderName);
  await harness.flush();
  await harness.flush();

  expect(readFlowTestStage(harness, controls)).toEqual(expectedStale);

  completeNewerAttempt(controls, caseDef.newerName);
  await harness.flush();
  await harness.flush();

  expect(readFlowTestStage(harness, controls)).toEqual(expectedTerminal);
  expectNoPendingWork(harness.pendingWork());
}

async function expectCancelStalePublicationOracleInRuntimeActors(
  caseDef: CancelStalePublicationCase,
) {
  const controls = createAbortableSaveExitLayer();
  const { actor, runtime } = startCancelStalePublicationRuntimeActor(
    caseDef.machineId,
    caseDef.actorId,
    controls,
  );
  const expectedStale = staleOlderStage(caseDef.newerName);
  const expectedTerminal = terminalStage(caseDef.newerName);

  try {
    actor.send({ type: "SAVE", name: caseDef.olderName });
    actor.send({ type: "SAVE", name: caseDef.newerName });
    await actor.flush();

    expect(callNames(controls)).toEqual([caseDef.olderName, caseDef.newerName]);
    expect(readRuntimeStage(actor, controls)).toMatchObject(pendingStage(caseDef.newerName));

    completeOlderAttempt(controls, caseDef.outcome, caseDef.olderName);
    await actor.flush();
    await actor.flush();

    expect(readRuntimeStage(actor, controls)).toEqual(expectedStale);

    completeNewerAttempt(controls, caseDef.newerName);
    await actor.flush();
    await actor.flush();

    expect(readRuntimeStage(actor, controls)).toEqual(expectedTerminal);
  } finally {
    await runtime.dispose();
  }
}

const cancelStalePublicationCases = (["success", "failure", "defect"] as const).map((outcome) => ({
  outcome,
  olderName: "Draft A",
  newerName: "Draft B",
  machineId: `bt38.cancel-stale-publication.${outcome}`,
  actorId: `bt38.cancel-stale-publication.${outcome}.actor`,
})) satisfies ReadonlyArray<CancelStalePublicationCase>;

describe("submit transaction cancel stale publication oracle", () => {
  for (const caseDef of cancelStalePublicationCases) {
    it(`keeps late cancelled ${caseDef.outcome} completions stale in flowTest until the newer cancel-previous attempt wins`, async () => {
      await expectCancelStalePublicationOracleInFlowTest(caseDef);
    });
  }

  for (const caseDef of cancelStalePublicationCases) {
    it(`keeps late cancelled ${caseDef.outcome} completions stale in runtime actors until the newer cancel-previous attempt wins`, async () => {
      await expectCancelStalePublicationOracleInRuntimeActors(caseDef);
    });
  }
});
