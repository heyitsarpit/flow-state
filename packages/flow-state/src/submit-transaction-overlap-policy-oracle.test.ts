import { describe, expect, it } from "vite-plus/test";

import {
  callNames,
  createPendingSaveLayer,
  readFlowTestStage,
  readRuntimeStage,
  startOverlapPolicyFlowTest,
  startOverlapPolicyRuntimeActor,
  type OverlapPolicy,
  type OverlapPolicyBoundaryStage,
  type TransactionReceiptCounts,
} from "./testing/fixtures/submit-transaction-overlap-policy.js";

type OverlapPolicyCase = Readonly<{
  readonly policy: OverlapPolicy;
  readonly machineId: string;
  readonly actorId: string;
  readonly firstName: string;
  readonly secondName: string;
}>;

function pendingStage(
  resourceName: string,
  issueCode: string | null,
  previewPatchCount: number,
  rollbackCount: number,
  rejectCount: number,
  receiptCounts: TransactionReceiptCounts,
): OverlapPolicyBoundaryStage {
  return {
    savedNames: [],
    error: null,
    resourceName,
    issueCode,
    previewPatchCount,
    rollbackCount,
    rejectCount,
    receiptCounts,
    transaction: {
      status: "pending",
    },
  };
}

function oracle(caseDef: OverlapPolicyCase) {
  switch (caseDef.policy) {
    case "reject-while-running":
      return {
        callNames: [caseDef.firstName] as const,
        stage: pendingStage(caseDef.firstName, "FLOW-TXN-001", 1, 0, 1, {
          start: 1,
          queue: 0,
          dequeue: 0,
          success: 0,
          failure: 0,
          defect: 0,
          interrupt: 0,
        }),
      };
    case "serialize":
      return {
        callNames: [caseDef.firstName] as const,
        stage: pendingStage(caseDef.firstName, null, 1, 0, 0, {
          start: 1,
          queue: 1,
          dequeue: 0,
          success: 0,
          failure: 0,
          defect: 0,
          interrupt: 0,
        }),
      };
    case "cancel-previous":
      return {
        callNames: [caseDef.firstName, caseDef.secondName] as const,
        stage: pendingStage(caseDef.secondName, null, 2, 1, 0, {
          start: 2,
          queue: 0,
          dequeue: 0,
          success: 0,
          failure: 0,
          defect: 0,
          interrupt: 1,
        }),
      };
    case "allow":
      return {
        callNames: [caseDef.firstName, caseDef.secondName] as const,
        stage: pendingStage(caseDef.secondName, null, 2, 0, 0, {
          start: 2,
          queue: 0,
          dequeue: 0,
          success: 0,
          failure: 0,
          defect: 0,
          interrupt: 0,
        }),
      };
  }
}

function expectOverlapPolicyOracleInFlowTest(caseDef: OverlapPolicyCase) {
  const controls = createPendingSaveLayer();
  const { harness } = startOverlapPolicyFlowTest(caseDef.machineId, caseDef.policy, controls, [
    { type: "SAVE", name: caseDef.firstName },
    { type: "SAVE", name: caseDef.secondName },
  ]);
  const expected = oracle(caseDef);

  expect(callNames(controls)).toEqual(expected.callNames);
  expect(readFlowTestStage(harness, caseDef.policy)).toEqual(expected.stage);
}

async function expectOverlapPolicyOracleInRuntimeActors(caseDef: OverlapPolicyCase) {
  const controls = createPendingSaveLayer();
  const { actor, runtime } = startOverlapPolicyRuntimeActor(
    caseDef.machineId,
    caseDef.actorId,
    caseDef.policy,
    controls,
  );
  const expected = oracle(caseDef);

  try {
    actor.send({ type: "SAVE", name: caseDef.firstName });
    actor.send({ type: "SAVE", name: caseDef.secondName });

    expect(callNames(controls)).toEqual(expected.callNames);
    expect(readRuntimeStage(actor, caseDef.policy)).toEqual(expected.stage);
  } finally {
    await runtime.dispose();
  }
}

const overlapPolicyCases = [
  {
    policy: "reject-while-running",
    machineId: "bt38.overlap-policy.reject",
    actorId: "bt38.overlap-policy.reject.actor",
    firstName: "Draft A",
    secondName: "Draft B",
  },
  {
    policy: "serialize",
    machineId: "bt38.overlap-policy.serialize",
    actorId: "bt38.overlap-policy.serialize.actor",
    firstName: "Draft A",
    secondName: "Draft B",
  },
  {
    policy: "cancel-previous",
    machineId: "bt38.overlap-policy.cancel",
    actorId: "bt38.overlap-policy.cancel.actor",
    firstName: "Draft A",
    secondName: "Draft B",
  },
  {
    policy: "allow",
    machineId: "bt38.overlap-policy.allow",
    actorId: "bt38.overlap-policy.allow.actor",
    firstName: "Draft A",
    secondName: "Draft B",
  },
] as const satisfies ReadonlyArray<OverlapPolicyCase>;

describe("submit transaction overlap policy oracle", () => {
  for (const caseDef of overlapPolicyCases) {
    it(`matches the pending ${caseDef.policy} overlap oracle in flowTest`, () => {
      expectOverlapPolicyOracleInFlowTest(caseDef);
    });
  }

  for (const caseDef of overlapPolicyCases) {
    it(`matches the pending ${caseDef.policy} overlap oracle in runtime actors`, async () => {
      await expectOverlapPolicyOracleInRuntimeActors(caseDef);
    });
  }
});
