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
  | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>
  | Readonly<{ readonly type: "SAVE_DEFECT" }>;

interface SaveContext {
  readonly projectId: string;
  readonly draft: ProjectRecord;
  readonly savedNames: ReadonlyArray<string>;
  readonly error: "conflict" | null;
  readonly defected: boolean;
}

type ReplacementPolicy = "allow" | "cancel-previous";
type OlderOutcome = "success" | "failure" | "defect";

type LateTerminalCase = Readonly<{
  readonly policy: ReplacementPolicy;
  readonly olderOutcome: OlderOutcome;
  readonly transactionId: string;
  readonly machineId: string;
}>;

type BoundaryStage = Readonly<{
  readonly draftName: string;
  readonly savedNames: ReadonlyArray<string>;
  readonly error: "conflict" | null;
  readonly defected: boolean;
  readonly resourceName: string;
  readonly ready: number;
  readonly receiptTypes: ReadonlyArray<string>;
}>;

const resourceId = "BT38.previewProject";
const projectId = "project-1";

class SaveProjectApi extends Context.Service<
  SaveProjectApi,
  {
    readonly save: (params: SaveParams) => Effect.Effect<ProjectRecord, "conflict">;
  }
>()("test/BT38/PreviewSaveProjectApi") {}

const projectResource = flow.resource<[projectId: string], ProjectRecord>({
  id: resourceId,
  key: (nextProjectId) => flow.createKey("bt38.preview-project", nextProjectId),
  lookup: (nextProjectId) =>
    Effect.succeed({
      id: nextProjectId,
      name: "Loaded",
    }),
});

function createControlledSaveExitLayer() {
  const calls: SaveParams[] = [];
  const completions: Array<{
    readonly succeed: (value: ProjectRecord) => void;
    readonly fail: (error: "conflict") => void;
    readonly defect: (cause: Error) => void;
  }> = [];

  const layer = Layer.succeed(
    SaveProjectApi,
    SaveProjectApi.of({
      save: (params) =>
        Effect.promise<
          | Readonly<{ readonly tag: "success"; readonly value: ProjectRecord }>
          | Readonly<{ readonly tag: "failure"; readonly error: "conflict" }>
          | Readonly<{ readonly tag: "defect"; readonly cause: Error }>
        >(
          () =>
            new Promise((resolve) => {
              calls.push(params);
              completions.push({
                succeed: (value) => {
                  resolve({ tag: "success", value });
                },
                fail: (error) => {
                  resolve({ tag: "failure", error });
                },
                defect: (cause) => {
                  resolve({ tag: "defect", cause });
                },
              });
            }),
        ).pipe(
          Effect.flatMap((result) => {
            switch (result.tag) {
              case "success":
                return Effect.succeed(result.value);
              case "failure":
                return Effect.fail(result.error);
              case "defect":
                return Effect.die(result.cause);
            }
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
    failAt: (index: number, error: "conflict") => completionAt(index).fail(error),
    defectAt: (index: number, cause: Error) => completionAt(index).defect(cause),
  };
}

function createPreviewMachine(caseDef: LateTerminalCase) {
  const transaction = flow.transaction<
    SaveParams,
    ProjectRecord,
    "conflict",
    SaveProjectApi,
    SaveEvent
  >({
    id: caseDef.transactionId,
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
      defect: () => ({
        type: "SAVE_DEFECT",
      }),
    }),
    concurrency: caseDef.policy,
  });

  return flow.machine<SaveContext, SaveEvent, "ready", "ready">({
    id: caseDef.machineId,
    initial: "ready",
    context: () => ({
      projectId,
      draft: { id: projectId, name: "Draft v1" },
      savedNames: [],
      error: null,
      defected: false,
    }),
    states: {
      ready: {
        on: {
          SAVE: {
            submit: transaction,
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
          SAVE_DEFECT: {
            update: () => ({
              defected: true,
            }),
          },
        },
      },
    },
  });
}

function settleRawCompletionTurn() {
  return Promise.resolve();
}

function replacementBoundaryCaseStages(caseDef: LateTerminalCase) {
  const initialReceiptTypes =
    caseDef.policy === "allow"
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

  const afterFlushReceiptTypes =
    caseDef.policy === "allow" &&
    (caseDef.olderOutcome === "failure" || caseDef.olderOutcome === "defect")
      ? [...initialReceiptTypes, "transaction:rollback"]
      : [...initialReceiptTypes];

  return {
    afterSettleOlder: {
      draftName: "Newer",
      savedNames: [],
      error: null,
      defected: false,
      resourceName: "Newer",
      ready: caseDef.policy === "allow" ? 1 : 0,
      receiptTypes: [...initialReceiptTypes],
    } satisfies BoundaryStage,
    afterFlushOlder: {
      draftName: "Newer",
      savedNames: [],
      error: null,
      defected: false,
      resourceName: "Newer",
      ready: 0,
      receiptTypes: afterFlushReceiptTypes,
    } satisfies BoundaryStage,
  };
}

function transactionReceiptTypes(
  receipts: ReadonlyArray<{
    readonly id?: string;
    readonly type: string;
  }>,
  transactionId: string,
) {
  return receipts.filter((receipt) => receipt.id === transactionId).map((receipt) => receipt.type);
}

function expectFlowTestStage(
  harness: FlowTestHarness<SaveContext, SaveEvent, "ready">,
  controls: ReturnType<typeof createControlledSaveExitLayer>,
  caseDef: LateTerminalCase,
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
    error: expected.error,
    defected: expected.defected,
  });
  expect(harness.cache().query(resourceId)).toMatchObject({
    value: {
      id: projectId,
      name: expected.resourceName,
    },
  });
  expect(harness.pendingWork().ready).toBe(expected.ready);
  expect(harness.snapshot().transactions[caseDef.transactionId]).toMatchObject({
    status: "pending",
  });
  expect(harness.issues()).toEqual([]);
  expect(controls.calls.map((call) => call.draft.name)).toEqual(["Older", "Newer"]);
  expect(transactionReceiptTypes(harness.snapshot().receipts, caseDef.transactionId)).toEqual(
    expected.receiptTypes,
  );
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
  controls: ReturnType<typeof createControlledSaveExitLayer>,
  caseDef: LateTerminalCase,
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
    error: expected.error,
    defected: expected.defected,
  });
  expect(actor.snapshot().resources[resourceId]).toMatchObject({
    value: {
      id: projectId,
      name: expected.resourceName,
    },
  });
  expect(readyWorkPendingCount(actor)).toBe(expected.ready);
  expect(actor.snapshot().transactions[caseDef.transactionId]).toMatchObject({
    status: "pending",
  });
  expect(actor.issues()).toEqual([]);
  expect(controls.calls.map((call) => call.draft.name)).toEqual(["Older", "Newer"]);
  expect(transactionReceiptTypes(actor.snapshot().receipts, caseDef.transactionId)).toEqual(
    expected.receiptTypes,
  );
}

function completeOlderAttempt(
  caseDef: LateTerminalCase,
  controls: ReturnType<typeof createControlledSaveExitLayer>,
) {
  switch (caseDef.olderOutcome) {
    case "success":
      controls.succeedAt(0, { id: projectId, name: "Older" });
      return;
    case "failure":
      controls.failAt(0, "conflict");
      return;
    case "defect":
      controls.defectAt(0, new Error("older late defect"));
      return;
  }
}

async function expectLateOlderTerminalBoundaryInFlowTest(caseDef: LateTerminalCase) {
  const controls = createControlledSaveExitLayer();
  const machine = createPreviewMachine(caseDef);
  const harness = flowTest(machine).provide(controls.layer).start();
  const expected = replacementBoundaryCaseStages(caseDef);

  harness.send({ type: "SAVE", name: "Older" });
  harness.send({ type: "SAVE", name: "Newer" });
  await harness.flush();

  completeOlderAttempt(caseDef, controls);
  await settleRawCompletionTurn();
  expectFlowTestStage(harness, controls, caseDef, expected.afterSettleOlder);

  await harness.flush();
  expectFlowTestStage(harness, controls, caseDef, expected.afterFlushOlder);
}

async function expectLateOlderTerminalBoundaryInRuntimeActors(caseDef: LateTerminalCase) {
  const controls = createControlledSaveExitLayer();
  const machine = createPreviewMachine(caseDef);
  const runtime = flow.runtime(
    flow
      .app({
        modules: [
          flow.module(`BT38PreviewLateBoundary.${caseDef.machineId}`, {
            resources: {
              project: projectResource,
            },
            machines: {
              preview: machine,
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
  const expected = replacementBoundaryCaseStages(caseDef);

  try {
    actor.send({ type: "SAVE", name: "Older" });
    actor.send({ type: "SAVE", name: "Newer" });
    await actor.flush();

    completeOlderAttempt(caseDef, controls);
    await settleRawCompletionTurn();
    expectRuntimeStage(actor, controls, caseDef, expected.afterSettleOlder);

    await actor.flush();
    expectRuntimeStage(actor, controls, caseDef, expected.afterFlushOlder);
  } finally {
    await runtime.dispose();
  }
}

const lateTerminalCases = [
  {
    policy: "allow",
    olderOutcome: "success",
    transactionId: "BT38.previewAllowSuccess",
    machineId: "bt38.preview.allow-success",
  },
  {
    policy: "allow",
    olderOutcome: "failure",
    transactionId: "BT38.previewAllowFailure",
    machineId: "bt38.preview.allow-failure",
  },
  {
    policy: "allow",
    olderOutcome: "defect",
    transactionId: "BT38.previewAllowDefect",
    machineId: "bt38.preview.allow-defect",
  },
  {
    policy: "cancel-previous",
    olderOutcome: "success",
    transactionId: "BT38.previewCancelSuccess",
    machineId: "bt38.preview.cancel-success",
  },
  {
    policy: "cancel-previous",
    olderOutcome: "failure",
    transactionId: "BT38.previewCancelFailure",
    machineId: "bt38.preview.cancel-failure",
  },
  {
    policy: "cancel-previous",
    olderOutcome: "defect",
    transactionId: "BT38.previewCancelDefect",
    machineId: "bt38.preview.cancel-defect",
  },
] as const satisfies ReadonlyArray<LateTerminalCase>;

describe("submit transaction late terminal oracle", () => {
  for (const caseDef of lateTerminalCases) {
    it(`keeps the older late ${caseDef.olderOutcome} invisible across settle/flush in flowTest for ${caseDef.policy}`, async () => {
      await expectLateOlderTerminalBoundaryInFlowTest(caseDef);
    });
  }

  for (const caseDef of lateTerminalCases) {
    it(`keeps the older late ${caseDef.olderOutcome} invisible across settle/flush in runtime actors for ${caseDef.policy}`, async () => {
      await expectLateOlderTerminalBoundaryInRuntimeActors(caseDef);
    });
  }
});
