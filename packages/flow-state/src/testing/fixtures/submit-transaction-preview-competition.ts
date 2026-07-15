import { Context, Effect, Layer } from "effect";

import type { FlowTestHarness } from "../../core/api/types.js";
import { readyWorkPendingCount } from "../../core/scheduling/ready-work.js";
import * as flow from "../../index.js";
import { test } from "../../testing.js";

export interface ProjectRecord {
  readonly id: string;
  readonly name: string;
}

export interface SaveParams {
  readonly id: string;
  readonly draft: ProjectRecord;
}

export type SaveEvent =
  | Readonly<{ readonly type: "SAVE"; readonly name: string }>
  | Readonly<{ readonly type: "SAVED"; readonly project: ProjectRecord }>
  | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>
  | Readonly<{ readonly type: "SAVE_DEFECT" }>;

export interface SaveContext {
  readonly projectId: string;
  readonly draft: ProjectRecord;
  readonly savedNames: ReadonlyArray<string>;
  readonly error: "conflict" | null;
  readonly defected: boolean;
}

export type ReplacementPolicy = "allow" | "cancel-previous";
export type PreviewConcurrency = ReplacementPolicy | "reject-while-running";
export type PreviewOutcome = "success" | "failure" | "defect";

export type PreviewBoundaryTransaction =
  | Readonly<{ readonly status: "pending" }>
  | Readonly<{ readonly status: "success"; readonly valueName: string }>
  | Readonly<{ readonly status: "failure"; readonly error: "conflict" }>
  | Readonly<{ readonly status: "defect" }>;

export type PreviewBoundaryStage = Readonly<{
  readonly draftName: string;
  readonly savedNames: ReadonlyArray<string>;
  readonly error: "conflict" | null;
  readonly defected: boolean;
  readonly resourceName: string;
  readonly ready: number;
  readonly issueKind: "failure" | "defect" | null;
  readonly receiptTypes: ReadonlyArray<string>;
  readonly transaction: PreviewBoundaryTransaction;
}>;

export const previewCompetitionProjectId = "project-1";
export const previewCompetitionResourceId = "BT38.previewReplacementCompetitionProject";
export const previewCompetitionCallNames = ["Older", "Newer"] as const;

export class PreviewCompetitionSaveProjectApi extends Context.Service<
  PreviewCompetitionSaveProjectApi,
  {
    readonly save: (params: SaveParams) => Effect.Effect<ProjectRecord, "conflict">;
  }
>()("test/BT38/PreviewCompetitionSaveProjectApi") {}

export const previewCompetitionProjectResource = flow.resource<[projectId: string], ProjectRecord>({
  id: previewCompetitionResourceId,
  key: (projectId) => flow.createKey("bt38.preview-replacement-competition-project", projectId),
  lookup: (projectId) =>
    Effect.succeed({
      id: projectId,
      name: "Loaded",
    }),
});

export function createControlledSaveExitLayer() {
  const calls: SaveParams[] = [];
  const completions: Array<{
    readonly succeed: (value: ProjectRecord) => void;
    readonly fail: (error: "conflict") => void;
    readonly defect: (cause: Error) => void;
  }> = [];

  const layer = Layer.succeed(
    PreviewCompetitionSaveProjectApi,
    PreviewCompetitionSaveProjectApi.of({
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
    if (completion === undefined) {
      throw new Error(`Expected completion controls for save attempt ${index}`);
    }

    return completion;
  };

  return {
    layer,
    calls,
    succeedAt: (index: number, value: ProjectRecord) => completionAt(index).succeed(value),
    failAt: (index: number, error: "conflict") => completionAt(index).fail(error),
    defectAt: (index: number, cause: Error) => completionAt(index).defect(cause),
  };
}

export type ControlledSaveExitLayer = ReturnType<typeof createControlledSaveExitLayer>;

export function createPreviewMachine(caseDef: {
  readonly concurrency: PreviewConcurrency;
  readonly transactionId: string;
  readonly machineId: string;
}) {
  const transaction = flow.transaction<
    SaveParams,
    ProjectRecord,
    "conflict",
    PreviewCompetitionSaveProjectApi,
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
          ref: previewCompetitionProjectResource.ref(params.id),
          replace: params.draft,
        },
      ],
    },
    commit: (params) => Effect.flatMap(PreviewCompetitionSaveProjectApi, (api) => api.save(params)),
    invalidates: ({ params }) => [previewCompetitionProjectResource.ref(params.id)],
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
    concurrency: caseDef.concurrency,
  });

  return flow.machine<SaveContext, SaveEvent, "ready", "ready">({
    id: caseDef.machineId,
    initial: "ready",
    context: () => ({
      projectId: previewCompetitionProjectId,
      draft: { id: previewCompetitionProjectId, name: "Draft v1" },
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

export function startPreviewFlowTest(
  caseDef: {
    readonly concurrency: PreviewConcurrency;
    readonly transactionId: string;
    readonly machineId: string;
  },
  controls: ControlledSaveExitLayer,
) {
  const machine = createPreviewMachine(caseDef);
  const app = flow.app({
    modules: [
      flow.module(`BT38PreviewReplacementCompetition.${caseDef.machineId}`, {
        resources: {
          project: previewCompetitionProjectResource,
        },
        machines: {
          preview: machine,
        },
      }),
    ],
  });
  return {
    machine,
    harness: test
      .app(app)
      .scenario(machine)
      .with({
        provide: controls.layer,
      })
      .run(),
  };
}

export function startPreviewRuntimeActor(
  caseDef: {
    readonly concurrency: PreviewConcurrency;
    readonly transactionId: string;
    readonly machineId: string;
  },
  controls: ControlledSaveExitLayer,
) {
  const machine = createPreviewMachine(caseDef);
  const runtime = flow.runtime(
    flow
      .app({
        modules: [
          flow.module(`BT38PreviewReplacementCompetition.${caseDef.machineId}`, {
            resources: {
              project: previewCompetitionProjectResource,
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

  return {
    machine,
    runtime,
    actor: runtime.createActor(machine),
  };
}

export function settleRawCompletionTurn() {
  return Promise.resolve();
}

export function callNames(controls: ControlledSaveExitLayer) {
  return controls.calls.map((call) => call.draft.name);
}

export function transactionReceiptTypes(
  receipts: ReadonlyArray<{
    readonly id?: string;
    readonly type: string;
  }>,
  transactionId: string,
) {
  return receipts.filter((receipt) => receipt.id === transactionId).map((receipt) => receipt.type);
}

function isProjectRecord(value: unknown): value is ProjectRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string"
  );
}

function readTransactionSnapshot(transaction: unknown): PreviewBoundaryTransaction {
  if (typeof transaction !== "object" || transaction === null || !("status" in transaction)) {
    return {
      status: "pending",
    };
  }

  switch (transaction.status) {
    case "pending":
      return {
        status: "pending",
      };
    case "success":
      if (!("value" in transaction) || !isProjectRecord(transaction.value)) {
        throw new Error("Expected a project record value for a successful preview transaction");
      }

      return {
        status: "success",
        valueName: transaction.value.name,
      };
    case "failure":
      if (!("error" in transaction) || transaction.error !== "conflict") {
        throw new Error("Expected the preview transaction failure error to remain conflict");
      }

      return {
        status: "failure",
        error: "conflict",
      };
    case "defect":
      return {
        status: "defect",
      };
    default:
      throw new Error(`Unsupported preview transaction status: ${String(transaction.status)}`);
  }
}

function readIssueKind(issues: ReadonlyArray<unknown>): "failure" | "defect" | null {
  if (issues.length === 0) {
    return null;
  }

  const firstIssue = issues[0];
  if (
    typeof firstIssue === "object" &&
    firstIssue !== null &&
    "kind" in firstIssue &&
    (firstIssue.kind === "failure" || firstIssue.kind === "defect")
  ) {
    return firstIssue.kind;
  }

  throw new Error("Expected preview competition issues to stay on the failure/defect lane");
}

function readResourceName(resource: unknown) {
  if (
    typeof resource === "object" &&
    resource !== null &&
    "value" in resource &&
    isProjectRecord(resource.value)
  ) {
    return resource.value.name;
  }

  throw new Error("Expected the preview competition resource snapshot to stay available");
}

type PreviewRuntimeActor = Readonly<{
  readonly getSnapshot: () => Readonly<{
    readonly value: string;
    readonly context: SaveContext;
    readonly resources: Readonly<Record<string, unknown>>;
    readonly transactions: Readonly<Record<string, unknown>>;
    readonly receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>;
  }>;
  readonly issues: () => ReadonlyArray<unknown>;
}>;

function normalizeStage(
  snapshot: Readonly<{
    readonly context: SaveContext;
    readonly resources: Readonly<Record<string, unknown>>;
    readonly transactions: Readonly<Record<string, unknown>>;
    readonly receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>;
  }>,
  issues: ReadonlyArray<unknown>,
  ready: number,
  transactionId: string,
): PreviewBoundaryStage {
  return {
    draftName: snapshot.context.draft.name,
    savedNames: snapshot.context.savedNames,
    error: snapshot.context.error,
    defected: snapshot.context.defected,
    resourceName: readResourceName(snapshot.resources[previewCompetitionResourceId]),
    ready,
    issueKind: readIssueKind(issues),
    receiptTypes: transactionReceiptTypes(snapshot.receipts, transactionId),
    transaction: readTransactionSnapshot(snapshot.transactions[transactionId]),
  };
}

export function readFlowTestStage(
  harness: FlowTestHarness<SaveContext, SaveEvent, "ready">,
  transactionId: string,
): PreviewBoundaryStage {
  return normalizeStage(
    {
      context: harness.context(),
      resources: {
        [previewCompetitionResourceId]: harness.cache().query(previewCompetitionResourceId),
      },
      transactions: harness.getSnapshot().transactions,
      receipts: harness.getSnapshot().receipts,
    },
    harness.issues(),
    harness.pendingWork().ready,
    transactionId,
  );
}

export function readRuntimeStage(
  actor: PreviewRuntimeActor,
  transactionId: string,
): PreviewBoundaryStage {
  return normalizeStage(
    actor.getSnapshot(),
    actor.issues(),
    readyWorkPendingCount(actor),
    transactionId,
  );
}

export function completeAttempt(
  controls: ControlledSaveExitLayer,
  attemptIndex: number,
  outcome: PreviewOutcome,
  name: string,
  defectMessage: string,
) {
  switch (outcome) {
    case "success":
      controls.succeedAt(attemptIndex, {
        id: previewCompetitionProjectId,
        name,
      });
      return;
    case "failure":
      controls.failAt(attemptIndex, "conflict");
      return;
    case "defect":
      controls.defectAt(attemptIndex, new Error(defectMessage));
      return;
  }
}
