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
type NewerOutcome = "failure" | "defect";
type CompletionOrder = "older-first" | "newer-first";

type FailureCompetitionCase = Readonly<{
  readonly policy: ReplacementPolicy;
  readonly olderOutcome: OlderOutcome;
  readonly newerOutcome: NewerOutcome;
  readonly completionOrder: CompletionOrder;
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
  readonly issueKind: "failure" | "defect" | null;
  readonly receiptTypes: ReadonlyArray<string>;
  readonly transaction:
    | Readonly<{ readonly status: "pending" }>
    | Readonly<{ readonly status: "failure"; readonly error: "conflict" }>
    | Readonly<{ readonly status: "defect" }>;
}>;

const resourceId = "BT38.previewFailureProject";
const projectId = "project-1";

class SaveProjectApi extends Context.Service<
  SaveProjectApi,
  {
    readonly save: (params: SaveParams) => Effect.Effect<ProjectRecord, "conflict">;
  }
>()("test/BT38/PreviewFailureSaveProjectApi") {}

const projectResource = flow.resource<[projectId: string], ProjectRecord>({
  id: resourceId,
  key: (nextProjectId) => flow.createKey("bt38.preview-failure-project", nextProjectId),
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

function createPreviewMachine(caseDef: FailureCompetitionCase) {
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

function competitionStages(caseDef: FailureCompetitionCase) {
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

  const terminalReceiptType =
    caseDef.newerOutcome === "failure" ? "transaction:failure" : "transaction:defect";
  const olderRollbackIncluded = caseDef.policy === "allow" && caseDef.olderOutcome !== "success";
  const terminalReceiptTypes =
    olderRollbackIncluded && caseDef.completionOrder === "older-first"
      ? (["transaction:rollback", terminalReceiptType, "transaction:rollback"] as const)
      : olderRollbackIncluded
        ? ([terminalReceiptType, "transaction:rollback", "transaction:rollback"] as const)
        : ([terminalReceiptType, "transaction:rollback"] as const);

  return {
    beforeFlush: {
      draftName: "Newer",
      savedNames: [],
      error: null,
      defected: false,
      resourceName: "Newer",
      ready: caseDef.policy === "allow" ? 2 : 1,
      issueKind: null,
      receiptTypes: [...initialReceiptTypes],
      transaction: {
        status: "pending",
      },
    } satisfies BoundaryStage,
    afterFlush: {
      draftName: "Newer",
      savedNames: [],
      error: caseDef.newerOutcome === "failure" ? "conflict" : null,
      defected: caseDef.newerOutcome === "defect",
      resourceName:
        caseDef.policy === "cancel-previous" || caseDef.olderOutcome === "success"
          ? "Older"
          : caseDef.completionOrder === "older-first"
            ? "Newer"
            : "Older",
      ready: 0,
      issueKind: caseDef.newerOutcome,
      receiptTypes: [...initialReceiptTypes, ...terminalReceiptTypes],
      transaction:
        caseDef.newerOutcome === "failure"
          ? {
              status: "failure",
              error: "conflict",
            }
          : {
              status: "defect",
            },
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

function expectTransactionSnapshot(
  transaction:
    | Readonly<{
        readonly status?: string;
        readonly error?: unknown;
      }>
    | undefined,
  expected: BoundaryStage["transaction"],
) {
  switch (expected.status) {
    case "pending":
      expect(transaction).toMatchObject({
        status: "pending",
      });
      return;
    case "failure":
      expect(transaction).toMatchObject({
        status: "failure",
        error: "conflict",
      });
      return;
    case "defect":
      expect(transaction).toMatchObject({
        status: "defect",
      });
      return;
  }
}

function expectIssues(
  issues: ReadonlyArray<{
    readonly kind: string;
    readonly source: string;
    readonly id: string;
  }>,
  caseDef: FailureCompetitionCase,
  expected: BoundaryStage,
) {
  if (expected.issueKind === null) {
    expect(issues).toEqual([]);
    return;
  }

  expect(issues).toEqual([
    expect.objectContaining({
      kind: expected.issueKind,
      source: "transaction",
      id: caseDef.transactionId,
    }),
  ]);
}

function expectFlowTestStage(
  harness: FlowTestHarness<SaveContext, SaveEvent, "ready">,
  controls: ReturnType<typeof createControlledSaveExitLayer>,
  caseDef: FailureCompetitionCase,
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
  expectTransactionSnapshot(
    harness.snapshot().transactions[caseDef.transactionId],
    expected.transaction,
  );
  expectIssues(harness.issues(), caseDef, expected);
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
  caseDef: FailureCompetitionCase,
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
  expectTransactionSnapshot(
    actor.snapshot().transactions[caseDef.transactionId] as
      | Readonly<{ readonly status?: string; readonly error?: unknown }>
      | undefined,
    expected.transaction,
  );
  expectIssues(
    actor.issues() as ReadonlyArray<{
      readonly kind: string;
      readonly source: string;
      readonly id: string;
    }>,
    caseDef,
    expected,
  );
  expect(controls.calls.map((call) => call.draft.name)).toEqual(["Older", "Newer"]);
  expect(transactionReceiptTypes(actor.snapshot().receipts, caseDef.transactionId)).toEqual(
    expected.receiptTypes,
  );
}

function completeOlderAttempt(
  caseDef: FailureCompetitionCase,
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
      controls.defectAt(0, new Error("older failure-order defect"));
      return;
  }
}

function completeNewerAttempt(
  caseDef: FailureCompetitionCase,
  controls: ReturnType<typeof createControlledSaveExitLayer>,
) {
  switch (caseDef.newerOutcome) {
    case "failure":
      controls.failAt(1, "conflict");
      return;
    case "defect":
      controls.defectAt(1, new Error("newer failure-order defect"));
      return;
  }
}

async function expectFailureCompetitionInFlowTest(caseDef: FailureCompetitionCase) {
  const controls = createControlledSaveExitLayer();
  const machine = createPreviewMachine(caseDef);
  const harness = flowTest(machine).provide(controls.layer).start();
  const expected = competitionStages(caseDef);

  harness.send({ type: "SAVE", name: "Older" });
  harness.send({ type: "SAVE", name: "Newer" });
  await harness.flush();

  if (caseDef.completionOrder === "older-first") {
    completeOlderAttempt(caseDef, controls);
    await settleRawCompletionTurn();
    completeNewerAttempt(caseDef, controls);
    await settleRawCompletionTurn();
  } else {
    completeNewerAttempt(caseDef, controls);
    await settleRawCompletionTurn();
    completeOlderAttempt(caseDef, controls);
    await settleRawCompletionTurn();
  }

  expectFlowTestStage(harness, controls, caseDef, expected.beforeFlush);

  await harness.flush();
  expectFlowTestStage(harness, controls, caseDef, expected.afterFlush);
}

async function expectFailureCompetitionInRuntimeActors(caseDef: FailureCompetitionCase) {
  const controls = createControlledSaveExitLayer();
  const machine = createPreviewMachine(caseDef);
  const runtime = flow.runtime(
    flow
      .app({
        modules: [
          flow.module(`BT38PreviewFailureOrder.${caseDef.machineId}`, {
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
  const expected = competitionStages(caseDef);

  try {
    actor.send({ type: "SAVE", name: "Older" });
    actor.send({ type: "SAVE", name: "Newer" });
    await actor.flush();

    if (caseDef.completionOrder === "older-first") {
      completeOlderAttempt(caseDef, controls);
      await settleRawCompletionTurn();
      completeNewerAttempt(caseDef, controls);
      await settleRawCompletionTurn();
    } else {
      completeNewerAttempt(caseDef, controls);
      await settleRawCompletionTurn();
      completeOlderAttempt(caseDef, controls);
      await settleRawCompletionTurn();
    }

    expectRuntimeStage(actor, controls, caseDef, expected.beforeFlush);

    await actor.flush();
    expectRuntimeStage(actor, controls, caseDef, expected.afterFlush);
  } finally {
    await runtime.dispose();
  }
}

const failureCompetitionCases = (["allow", "cancel-previous"] as const).flatMap((policy) =>
  (["success", "failure", "defect"] as const).flatMap((olderOutcome) =>
    (["failure", "defect"] as const).flatMap((newerOutcome) =>
      (["older-first", "newer-first"] as const).map((completionOrder) => ({
        policy,
        olderOutcome,
        newerOutcome,
        completionOrder,
        transactionId: `BT38.preview.${policy}.${olderOutcome}.${newerOutcome}.${completionOrder}`,
        machineId: `bt38.preview.${policy}.${olderOutcome}.${newerOutcome}.${completionOrder}`,
      })),
    ),
  ),
) satisfies ReadonlyArray<FailureCompetitionCase>;

describe("submit transaction failure order oracle", () => {
  for (const caseDef of failureCompetitionCases) {
    it(`matches preview-backed failure/defect-winning competition in flowTest for ${caseDef.policy}, ${caseDef.olderOutcome}, ${caseDef.newerOutcome}, and ${caseDef.completionOrder}`, async () => {
      await expectFailureCompetitionInFlowTest(caseDef);
    });
  }

  for (const caseDef of failureCompetitionCases) {
    it(`matches preview-backed failure/defect-winning competition in runtime actors for ${caseDef.policy}, ${caseDef.olderOutcome}, ${caseDef.newerOutcome}, and ${caseDef.completionOrder}`, async () => {
      await expectFailureCompetitionInRuntimeActors(caseDef);
    });
  }
});
