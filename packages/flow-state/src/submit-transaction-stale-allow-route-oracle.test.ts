import { describe, expect, it } from "vite-plus/test";

import {
  callNames,
  completeNewerAttempt,
  completeOlderAttempt,
  createControlledSaveExitLayer,
  readFlowTestStage,
  readRuntimeStage,
  startStaleAllowRouteFlowTest,
  startStaleAllowRouteRuntimeActor,
  type StaleAllowRouteBoundaryStage,
  type StaleAllowRouteOutcome,
} from "./testing/fixtures/submit-transaction-stale-allow-route.js";

type StaleAllowRouteCase = Readonly<{
  readonly outcome: StaleAllowRouteOutcome;
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
    defected: false,
    resourceName: newerName,
    issueCount: 0,
    receiptCounts: {
      success: 0,
      failure: 0,
      defect: 0,
    },
    transaction: {
      status: "pending",
    },
  } as const;
}

function finalStage(newerName: string): StaleAllowRouteBoundaryStage {
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
    },
    transaction: {
      status: "success",
      valueName: newerName,
    },
  };
}

async function expectStaleAllowRouteOracleInFlowTest(caseDef: StaleAllowRouteCase) {
  const controls = createControlledSaveExitLayer();
  const { harness } = startStaleAllowRouteFlowTest(caseDef.machineId, controls);
  const expectedFinal = finalStage(caseDef.newerName);

  harness.send({ type: "SAVE", name: caseDef.olderName });
  harness.send({ type: "SAVE", name: caseDef.newerName });

  expect(callNames(controls)).toEqual([caseDef.olderName, caseDef.newerName]);
  expect(readFlowTestStage(harness)).toMatchObject(pendingDispatchStage(caseDef.newerName));

  if (caseDef.outcome === "defect") {
    await harness.flush();
  }

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

async function expectStaleAllowRouteOracleInRuntimeActors(caseDef: StaleAllowRouteCase) {
  const controls = createControlledSaveExitLayer();
  const { actor, runtime } = startStaleAllowRouteRuntimeActor(
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

    if (caseDef.outcome === "defect") {
      await actor.flush();
    }

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

const staleAllowRouteCases = (["success", "failure", "defect"] as const).map((outcome) => ({
  outcome,
  olderName: `Older stale ${outcome}`,
  newerName: `Newer winning ${outcome}`,
  machineId: `bt38.stale-allow-route.${outcome}`,
  actorId: `bt38.stale-allow-route.${outcome}.actor`,
})) satisfies ReadonlyArray<StaleAllowRouteCase>;

describe("submit transaction stale allow-route oracle", () => {
  for (const caseDef of staleAllowRouteCases) {
    it(`keeps stale ${caseDef.outcome} completions silent in flowTest after the newer allow attempt wins`, async () => {
      await expectStaleAllowRouteOracleInFlowTest(caseDef);
    });
  }

  for (const caseDef of staleAllowRouteCases) {
    it(`keeps stale ${caseDef.outcome} completions silent in runtime actors after the newer allow attempt wins`, async () => {
      await expectStaleAllowRouteOracleInRuntimeActors(caseDef);
    });
  }
});
