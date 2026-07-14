import { describe, expect, it } from "vite-plus/test";

import {
  callNames,
  completeNewerAttempt,
  completeOlderAttempt,
  createControlledSaveExitLayer,
  readFlowTestStage,
  readRuntimeStage,
  startStaleAllowPublicationFlowTest,
  startStaleAllowPublicationRuntimeActor,
  staleAllowPublicationProjectResourceId,
  staleAllowPublicationTransactionId,
  type StaleAllowPublicationBoundaryStage,
  type StaleAllowPublicationOutcome,
} from "./testing/fixtures/submit-transaction-stale-allow-publication.js";

type StaleAllowPublicationCase = Readonly<{
  readonly outcome: StaleAllowPublicationOutcome;
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

function winningStage(newerName: string): StaleAllowPublicationBoundaryStage {
  return {
    draftName: newerName,
    savedNames: [newerName],
    error: null,
    defected: false,
    resourceName: newerName,
    ready: 0,
    issueCount: 0,
    invalidateCount: 1,
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

async function expectStaleAllowPublicationOracleInFlowTest(caseDef: StaleAllowPublicationCase) {
  const controls = createControlledSaveExitLayer();
  const { harness } = startStaleAllowPublicationFlowTest(caseDef.machineId, controls);
  const expectedTerminal = winningStage(caseDef.newerName);

  harness.send({ type: "SAVE", name: caseDef.olderName });
  harness.send({ type: "SAVE", name: caseDef.newerName });

  if (caseDef.outcome === "defect") {
    await harness.flush();
  }

  expect(callNames(controls)).toEqual([caseDef.olderName, caseDef.newerName]);

  completeNewerAttempt(controls, caseDef.newerName);
  await harness.flush();
  await harness.flush();

  expect(readFlowTestStage(harness)).toEqual(expectedTerminal);

  completeOlderAttempt(controls, caseDef.outcome, caseDef.olderName);
  await harness.flush();
  await harness.flush();

  expect(readFlowTestStage(harness)).toEqual(expectedTerminal);
  expectNoPendingWork(harness.pendingWork());
}

async function expectStaleAllowPublicationOracleInRuntimeActors(
  caseDef: StaleAllowPublicationCase,
) {
  const controls = createControlledSaveExitLayer();
  const { actor, runtime } = startStaleAllowPublicationRuntimeActor(
    caseDef.machineId,
    caseDef.actorId,
    controls,
  );
  const expectedTerminal = winningStage(caseDef.newerName);

  try {
    actor.send({ type: "SAVE", name: caseDef.olderName });
    actor.send({ type: "SAVE", name: caseDef.newerName });

    if (caseDef.outcome === "defect") {
      await actor.flush();
    }

    expect(callNames(controls)).toEqual([caseDef.olderName, caseDef.newerName]);

    completeNewerAttempt(controls, caseDef.newerName);
    await actor.flush();
    await actor.flush();

    expect(readRuntimeStage(actor)).toEqual(expectedTerminal);

    completeOlderAttempt(controls, caseDef.outcome, caseDef.olderName);
    await actor.flush();
    await actor.flush();

    expect(readRuntimeStage(actor)).toEqual(expectedTerminal);
  } finally {
    await runtime.dispose();
  }
}

const staleAllowPublicationCases = (["success", "failure", "defect"] as const).map((outcome) => ({
  outcome,
  olderName: "Draft A",
  newerName: "Draft B",
  machineId: `bt38.stale-allow-publication.${outcome}`,
  actorId: `bt38.stale-allow-publication.${outcome}.actor`,
})) satisfies ReadonlyArray<StaleAllowPublicationCase>;

describe("submit transaction stale allow publication oracle", () => {
  it("discards an older stale-success preview after the newer attempt fails", async () => {
    const controls = createControlledSaveExitLayer();
    const { actor, runtime } = startStaleAllowPublicationRuntimeActor(
      "bt38.stale-allow-publication.newer-failure",
      "bt38.stale-allow-publication.newer-failure.actor",
      controls,
    );

    try {
      actor.send({ type: "SAVE", name: "Draft A" });
      actor.send({ type: "SAVE", name: "Draft B" });
      controls.failAt(1, "conflict");
      await actor.flush();
      await actor.flush();

      expect(actor.snapshot().resources[staleAllowPublicationProjectResourceId]).toMatchObject({
        value: { name: "Draft A" },
      });
      expect(actor.snapshot().transactions[staleAllowPublicationTransactionId]).toMatchObject({
        status: "failure",
      });

      controls.succeedAt(0, { id: "project-1", name: "Draft A committed too late" });
      await actor.flush();
      await actor.flush();

      expect(actor.snapshot().resources[staleAllowPublicationProjectResourceId]).toMatchObject({
        value: { name: "Seeded v1" },
      });
      expect(actor.snapshot().transactions[staleAllowPublicationTransactionId]).toMatchObject({
        status: "failure",
      });
    } finally {
      await runtime.dispose();
    }
  });

  for (const caseDef of staleAllowPublicationCases) {
    it(`keeps late stale ${caseDef.outcome} completions from publishing in flowTest after the newer allow attempt wins`, async () => {
      await expectStaleAllowPublicationOracleInFlowTest(caseDef);
    });
  }

  for (const caseDef of staleAllowPublicationCases) {
    it(`keeps late stale ${caseDef.outcome} completions from publishing in runtime actors after the newer allow attempt wins`, async () => {
      await expectStaleAllowPublicationOracleInRuntimeActors(caseDef);
    });
  }
});
