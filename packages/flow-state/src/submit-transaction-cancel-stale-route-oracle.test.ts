import { describe, expect, it } from "vite-plus/test";

import {
  callNames,
  completeNewerAttempt,
  completeOlderAttempt,
  createControlledSaveExitLayer,
  readFlowTestStage,
  readRuntimeStage,
  startCancelStaleRouteFlowTest,
  startCancelStaleRouteRuntimeActor,
  type CancelStaleRouteBoundaryStage,
  type CancelStaleRouteOutcome,
} from "./testing/fixtures/submit-transaction-cancel-stale-route.js";

type CancelStaleRouteCase = Readonly<{
  readonly outcome: CancelStaleRouteOutcome;
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

function pendingDispatchStage(newerName: string) {
  return {
    draftName: newerName,
    savedNames: [],
    error: null,
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
  } as const;
}

function finalStage(newerName: string): CancelStaleRouteBoundaryStage {
  return {
    draftName: newerName,
    savedNames: [newerName],
    error: null,
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
  };
}

async function expectCancelStaleRouteOracleInFlowTest(caseDef: CancelStaleRouteCase) {
  const controls = createControlledSaveExitLayer();
  const { harness } = startCancelStaleRouteFlowTest(caseDef.machineId, controls);
  const expectedFinal = finalStage(caseDef.newerName);

  harness.send({ type: "SAVE", name: caseDef.olderName });
  harness.send({ type: "SAVE", name: caseDef.newerName });

  expect(callNames(controls)).toEqual([caseDef.olderName, caseDef.newerName]);
  expect(readFlowTestStage(harness)).toMatchObject(pendingDispatchStage(caseDef.newerName));

  completeNewerAttempt(controls, caseDef.newerName);
  await harness.flush();
  await harness.flush();

  expect(readFlowTestStage(harness)).toEqual(expectedFinal);

  completeOlderAttempt(controls, caseDef.outcome, caseDef.olderName);
  await harness.flush();
  await harness.flush();

  expect(readFlowTestStage(harness)).toEqual(expectedFinal);
  expectNoPendingWork(harness.pendingWork());
}

async function expectCancelStaleRouteOracleInRuntimeActors(caseDef: CancelStaleRouteCase) {
  const controls = createControlledSaveExitLayer();
  const { actor, runtime } = startCancelStaleRouteRuntimeActor(
    caseDef.machineId,
    caseDef.actorId,
    controls,
  );
  const expectedFinal = finalStage(caseDef.newerName);

  try {
    actor.send({ type: "SAVE", name: caseDef.olderName });
    actor.send({ type: "SAVE", name: caseDef.newerName });

    expect(callNames(controls)).toEqual([caseDef.olderName, caseDef.newerName]);
    expect(readRuntimeStage(actor)).toMatchObject(pendingDispatchStage(caseDef.newerName));

    completeNewerAttempt(controls, caseDef.newerName);
    await actor.flush();
    await actor.flush();

    expect(readRuntimeStage(actor)).toEqual(expectedFinal);

    completeOlderAttempt(controls, caseDef.outcome, caseDef.olderName);
    await actor.flush();
    await actor.flush();

    expect(readRuntimeStage(actor)).toEqual(expectedFinal);
  } finally {
    await runtime.dispose();
  }
}

const cancelStaleRouteCases = (["success", "failure", "defect"] as const).map((outcome) => ({
  outcome,
  olderName: `Older cancelled ${outcome}`,
  newerName: `Newer winning ${outcome}`,
  machineId: `bt38.cancel-stale-route.${outcome}`,
  actorId: `bt38.cancel-stale-route.${outcome}.actor`,
})) satisfies ReadonlyArray<CancelStaleRouteCase>;

describe("submit transaction cancel-previous stale-route oracle", () => {
  for (const caseDef of cancelStaleRouteCases) {
    it(`keeps cancelled stale ${caseDef.outcome} completions silent in flowTest after the newer cancel-previous attempt wins`, async () => {
      await expectCancelStaleRouteOracleInFlowTest(caseDef);
    });
  }

  for (const caseDef of cancelStaleRouteCases) {
    it(`keeps cancelled stale ${caseDef.outcome} completions silent in runtime actors after the newer cancel-previous attempt wins`, async () => {
      await expectCancelStaleRouteOracleInRuntimeActors(caseDef);
    });
  }
});
