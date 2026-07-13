import { Context, Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";

import type { FlowTestHarness } from "./core/api/types.js";
import * as flow from "./index.js";
import { readyWorkPendingCount } from "./core/scheduling/ready-work.js";
import { flowTest } from "./testing.js";

interface ProjectRecord {
  readonly id: string;
  readonly name: string;
}

interface SaveParams {
  readonly id: string;
  readonly draft: ProjectRecord;
}

type SaveEvent =
  | Readonly<{ readonly type: "SAVE"; readonly name: string }>
  | Readonly<{ readonly type: "SAVED"; readonly project: ProjectRecord }>
  | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>;

interface SaveContext {
  readonly projectId: string;
  readonly draft: ProjectRecord;
  readonly savedNames: ReadonlyArray<string>;
  readonly error: "conflict" | null;
}

const transactionId = "BT38.submitSave";
const resourceId = "BT38.project";
const projectId = "project-1";

class SaveProjectApi extends Context.Service<
  SaveProjectApi,
  {
    readonly save: (params: SaveParams) => Effect.Effect<ProjectRecord, "conflict">;
  }
>()("test/BT38/SubmitSaveProjectApi") {}

type BoundaryStage = Readonly<{
  readonly draftName: string;
  readonly savedNames: ReadonlyArray<string>;
  readonly resourceName: string;
  readonly ready: number;
  readonly callNames: ReadonlyArray<string>;
  readonly receiptTypes: ReadonlyArray<string>;
  readonly transaction:
    | Readonly<{ readonly status: "pending" }>
    | Readonly<{ readonly status: "success"; readonly valueName: string }>;
}>;

const projectResource = flow.resource<[projectId: string], ProjectRecord>({
  id: resourceId,
  key: (nextProjectId) => flow.createKey("bt38.project", nextProjectId),
  lookup: (nextProjectId) =>
    Effect.succeed({
      id: nextProjectId,
      name: "Loaded",
    }),
});

function createControlledSaveLayer() {
  const calls: SaveParams[] = [];
  const completions: Array<{
    readonly succeed: (value: ProjectRecord) => void;
  }> = [];

  const layer = Layer.succeed(
    SaveProjectApi,
    SaveProjectApi.of({
      save: (params) =>
        Effect.promise<ProjectRecord>(
          () =>
            new Promise((resolve) => {
              calls.push(params);
              completions.push({
                succeed: (value) => {
                  resolve(value);
                },
              });
            }),
        ),
    }),
  );

  const completionAt = (index: number) => {
    const completion = completions[index];
    expect(completion).toBeDefined();
    return completion!;
  };

  return {
    layer,
    calls,
    succeedAt: (index: number, value: ProjectRecord) => completionAt(index).succeed(value),
  };
}

function createSubmitMachine() {
  const saveProjectTransaction = flow.transaction<
    SaveParams,
    ProjectRecord,
    "conflict",
    SaveProjectApi,
    SaveEvent
  >({
    id: transactionId,
    params: ({ context }: { readonly context: SaveContext }) => ({
      id: context.projectId,
      draft: context.draft,
    }),
    preview: {
      apply: ({ params }) => [
        {
          ref: projectResource.ref(params.id),
          replace: params.draft,
        },
      ],
    },
    commit: (params) => Effect.flatMap(SaveProjectApi, (api) => api.save(params)),
    invalidates: ({ params }) => [projectResource.ref(params.id)],
    routes: flow.outcomes<ProjectRecord, "conflict", SaveEvent>({
      success: ({ value }) => ({
        type: "SAVED",
        project: value,
      }),
      failure: ["SAVE_FAILED", "error"],
    }),
    concurrency: "reject-while-running",
  });

  return flow.machine<SaveContext, SaveEvent, "ready", "ready">({
    id: "bt38.submit-replacement.machine",
    initial: "ready",
    context: () => ({
      projectId,
      draft: { id: projectId, name: "Draft v1" },
      savedNames: [],
      error: null,
    }),
    states: {
      ready: {
        on: {
          SAVE: {
            submit: saveProjectTransaction,
            update: ({ context, event }) =>
              event.type === "SAVE"
                ? {
                    draft: {
                      ...context.draft,
                      name: event.name,
                    },
                  }
                : {},
          },
          SAVED: {
            update: ({ context, event }) =>
              event.type === "SAVED"
                ? {
                    savedNames: [...context.savedNames, event.project.name],
                    error: null,
                  }
                : {},
          },
          SAVE_FAILED: {
            update: ({ event }) =>
              event.type === "SAVE_FAILED"
                ? {
                    error: event.error,
                  }
                : {},
          },
        },
      },
    },
  });
}

function settleRawCompletionTurn() {
  return Promise.resolve();
}

function expectTransactionSnapshot(
  transaction:
    | Readonly<{
        readonly status?: string;
        readonly value?: unknown;
      }>
    | undefined,
  expected: BoundaryStage["transaction"],
) {
  if (expected.status === "pending") {
    expect(transaction).toMatchObject({
      status: "pending",
    });
    return;
  }

  expect(transaction).toMatchObject({
    status: "success",
    value: {
      id: projectId,
      name: expected.valueName,
    },
  });
}

function receiptTypes(
  receipts: ReadonlyArray<{
    readonly id?: string;
    readonly type: string;
  }>,
) {
  return receipts.filter((receipt) => receipt.id === transactionId).map((receipt) => receipt.type);
}

function replacementDispatchBoundaryStages() {
  return {
    afterSaveA: {
      draftName: "A",
      savedNames: [],
      resourceName: "A",
      ready: 0,
      callNames: ["A"],
      receiptTypes: ["transaction:start", "transaction:preview-patch"],
      transaction: {
        status: "pending",
      },
    } satisfies BoundaryStage,
    afterSettleA: {
      draftName: "A",
      savedNames: [],
      resourceName: "A",
      ready: 1,
      callNames: ["A"],
      receiptTypes: ["transaction:start", "transaction:preview-patch"],
      transaction: {
        status: "pending",
      },
    } satisfies BoundaryStage,
    afterSaveBBeforeFlush: {
      draftName: "B",
      savedNames: ["A"],
      resourceName: "B",
      ready: 0,
      callNames: ["A", "B"],
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
    } satisfies BoundaryStage,
    afterSettleB: {
      draftName: "B",
      savedNames: ["A"],
      resourceName: "B",
      ready: 1,
      callNames: ["A", "B"],
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
    } satisfies BoundaryStage,
    afterFlushB: {
      draftName: "B",
      savedNames: ["A", "B"],
      resourceName: "B",
      ready: 0,
      callNames: ["A", "B"],
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
        valueName: "B",
      },
    } satisfies BoundaryStage,
  };
}

function expectFlowTestStage(
  harness: FlowTestHarness<SaveContext, SaveEvent, "ready">,
  controls: ReturnType<typeof createControlledSaveLayer>,
  expected: BoundaryStage,
) {
  expect(harness.state()).toBe("ready");
  expect(harness.context()).toEqual({
    projectId,
    draft: {
      id: projectId,
      name: expected.draftName,
    },
    savedNames: expected.savedNames,
    error: null,
  });
  expect(harness.cache().query(resourceId)).toMatchObject({
    value: {
      id: projectId,
      name: expected.resourceName,
    },
  });
  expect(harness.pendingWork().ready).toBe(expected.ready);
  expectTransactionSnapshot(harness.snapshot().transactions[transactionId], expected.transaction);
  expect(harness.issues()).toEqual([]);
  expect(controls.calls.map((call) => call.draft.name)).toEqual(expected.callNames);
  expect(receiptTypes(harness.snapshot().receipts)).toEqual(expected.receiptTypes);
}

function expectRuntimeStage(
  actor: Readonly<{
    readonly snapshot: () => Readonly<{
      readonly value: string;
      readonly context: SaveContext;
      readonly resources: Readonly<Record<string, unknown>>;
      readonly transactions: Readonly<Record<string, unknown>>;
      readonly receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>;
    }>;
    readonly issues: () => ReadonlyArray<unknown>;
  }>,
  controls: ReturnType<typeof createControlledSaveLayer>,
  expected: BoundaryStage,
) {
  expect(actor.snapshot().value).toBe("ready");
  expect(actor.snapshot().context).toEqual({
    projectId,
    draft: {
      id: projectId,
      name: expected.draftName,
    },
    savedNames: expected.savedNames,
    error: null,
  });
  expect(actor.snapshot().resources[resourceId]).toMatchObject({
    value: {
      id: projectId,
      name: expected.resourceName,
    },
  });
  expect(readyWorkPendingCount(actor)).toBe(expected.ready);
  expectTransactionSnapshot(
    actor.snapshot().transactions[transactionId] as
      | Readonly<{ readonly status?: string; readonly value?: unknown }>
      | undefined,
    expected.transaction,
  );
  expect(actor.issues()).toEqual([]);
  expect(controls.calls.map((call) => call.draft.name)).toEqual(expected.callNames);
  expect(receiptTypes(actor.snapshot().receipts)).toEqual(expected.receiptTypes);
}

async function expectReplacementDispatchBoundaryInFlowTest() {
  const controls = createControlledSaveLayer();
  const machine = createSubmitMachine();
  const harness = flowTest(machine).provide(controls.layer).start();
  const expected = replacementDispatchBoundaryStages();

  harness.send({ type: "SAVE", name: "A" });
  expectFlowTestStage(harness, controls, expected.afterSaveA);

  controls.succeedAt(0, { id: projectId, name: "A" });
  await settleRawCompletionTurn();
  expectFlowTestStage(harness, controls, expected.afterSettleA);

  harness.send({ type: "SAVE", name: "B" });
  expectFlowTestStage(harness, controls, expected.afterSaveBBeforeFlush);

  controls.succeedAt(1, { id: projectId, name: "B" });
  await settleRawCompletionTurn();
  expectFlowTestStage(harness, controls, expected.afterSettleB);

  await harness.flush();
  expectFlowTestStage(harness, controls, expected.afterFlushB);
}

async function expectReplacementDispatchBoundaryInRuntimeActors() {
  const controls = createControlledSaveLayer();
  const machine = createSubmitMachine();
  const runtime = flow.runtime(
    flow
      .app({
        modules: [
          flow.module("BT38SubmitReplacementRuntime", {
            resources: {
              project: projectResource,
            },
            machines: {
              submit: machine,
            },
          }),
        ],
      })
      .layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [controls.layer],
      }),
  );
  const actor = runtime.createActor(machine);
  const expected = replacementDispatchBoundaryStages();

  try {
    actor.send({ type: "SAVE", name: "A" });
    expectRuntimeStage(actor, controls, expected.afterSaveA);

    controls.succeedAt(0, { id: projectId, name: "A" });
    await settleRawCompletionTurn();
    expectRuntimeStage(actor, controls, expected.afterSettleA);

    actor.send({ type: "SAVE", name: "B" });
    expectRuntimeStage(actor, controls, expected.afterSaveBBeforeFlush);

    controls.succeedAt(1, { id: projectId, name: "B" });
    await settleRawCompletionTurn();
    expectRuntimeStage(actor, controls, expected.afterSettleB);

    await actor.flush();
    expectRuntimeStage(actor, controls, expected.afterFlushB);
  } finally {
    await runtime.dispose();
  }
}

describe("submit transaction replacement oracle", () => {
  it("publishes a settled predecessor before replacement dispatch in flowTest", async () => {
    await expectReplacementDispatchBoundaryInFlowTest();
  });

  it("publishes a settled predecessor before replacement dispatch in runtime actors", async () => {
    await expectReplacementDispatchBoundaryInRuntimeActors();
  });
});
