import { Context, Effect, Layer } from "effect";

import type { FlowTestHarness } from "../../core/api/types.js";
import { readyWorkPendingCount } from "../../core/scheduling/ready-work.js";
import * as flow from "../../index.js";
import { test } from "../../testing.js";

export interface ProjectRecord {
  readonly id: string;
  readonly name: string;
}

export interface ProjectSummaryRecord {
  readonly id: string;
  readonly summary: string;
}

export interface SaveParams {
  readonly id: string;
  readonly draft: ProjectRecord;
}

export type OverlapSaveEvent =
  | Readonly<{ readonly type: "SAVE_A" }>
  | Readonly<{ readonly type: "SAVE_B" }>
  | Readonly<{ readonly type: "SAVED"; readonly project: ProjectRecord }>
  | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>;

export interface SerialSaveContext {
  readonly projectId: string;
  readonly draft: ProjectRecord;
  readonly savedNames: ReadonlyArray<string>;
  readonly error: "conflict" | null;
}

export type OlderOutcome = "success" | "defect";

export type MultiRefResourceStage =
  | Readonly<{ readonly status: "value"; readonly name: string }>
  | Readonly<{ readonly status: "stale"; readonly freshness: "invalidated" }>;

export type MultiRefSummaryStage =
  | Readonly<{ readonly status: "value"; readonly summary: string }>
  | Readonly<{ readonly status: "stale"; readonly freshness: "invalidated" }>;

export type MultiRefTransactionStage =
  | Readonly<{ readonly status: "pending" }>
  | Readonly<{ readonly status: "success"; readonly valueName: string }>;

export type MultiRefBoundaryStage = Readonly<{
  readonly draftName: string;
  readonly savedNames: ReadonlyArray<string>;
  readonly error: "conflict" | null;
  readonly ready: number;
  readonly issueCount: number;
  readonly project: MultiRefResourceStage;
  readonly summary: MultiRefSummaryStage;
  readonly invalidationCounts: Readonly<{
    readonly project: number;
    readonly projectSummary: number;
  }>;
  readonly receiptTypes: ReadonlyArray<string>;
  readonly transaction: MultiRefTransactionStage;
}>;

export const multiRefProjectId = "project-1";
export const multiRefProjectResourceId = "BT38.multiRefReplacementProject";
export const multiRefSummaryResourceId = "BT38.multiRefReplacementSummary";
export const multiRefTransactionId = "BT38.multiRefReplacementCancel";
export const multiRefCallNames = ["Draft A", "Draft B"] as const;

export class MultiRefSaveProjectApi extends Context.Service<
  MultiRefSaveProjectApi,
  {
    readonly save: (params: SaveParams) => Effect.Effect<ProjectRecord, "conflict">;
  }
>()("test/BT38/MultiRefSaveProjectApi") {}

export const multiRefProjectResource = flow.resource<[projectId: string], ProjectRecord>({
  id: multiRefProjectResourceId,
  key: (projectId) => flow.createKey("bt38.multi-ref-project", projectId),
  lookup: (projectId) =>
    Effect.succeed({
      id: projectId,
      name: "Loaded",
    }),
});

export const multiRefSummaryResource = flow.resource<[projectId: string], ProjectSummaryRecord>({
  id: multiRefSummaryResourceId,
  key: (projectId) => flow.createKey("bt38.multi-ref-summary", projectId),
  lookup: (projectId) =>
    Effect.succeed({
      id: projectId,
      summary: "Loaded summary",
    }),
});

export const seededMultiRefProject = {
  ref: multiRefProjectResource.ref(multiRefProjectId),
  value: { id: multiRefProjectId, name: "Seeded v1" },
} as const;

export const seededMultiRefSummary = {
  ref: multiRefSummaryResource.ref(multiRefProjectId),
  value: { id: multiRefProjectId, summary: "Seeded summary v1" },
} as const;

export function createControlledSaveExitLayer() {
  const calls: SaveParams[] = [];
  const completions: Array<{
    readonly succeed: (value: ProjectRecord) => void;
    readonly defect: (cause: Error) => void;
  }> = [];

  const layer = Layer.succeed(
    MultiRefSaveProjectApi,
    MultiRefSaveProjectApi.of({
      save: (params) =>
        Effect.promise<
          | Readonly<{ readonly tag: "success"; readonly value: ProjectRecord }>
          | Readonly<{ readonly tag: "defect"; readonly cause: Error }>
        >(
          () =>
            new Promise((resolve) => {
              calls.push(params);
              completions.push({
                succeed: (value) => {
                  resolve({ tag: "success", value });
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
      throw new Error(`Expected completion controls for multi-ref save attempt ${index}`);
    }

    return completion;
  };

  return {
    layer,
    calls,
    succeedAt: (index: number, value: ProjectRecord) => completionAt(index).succeed(value),
    defectAt: (index: number, cause: Error) => completionAt(index).defect(cause),
  };
}

export type ControlledSaveExitLayer = ReturnType<typeof createControlledSaveExitLayer>;

export function createMultiRefCancelMachine(machineId: string) {
  const transaction = flow.transaction<
    SaveParams,
    ProjectRecord,
    "conflict",
    MultiRefSaveProjectApi,
    OverlapSaveEvent
  >({
    id: multiRefTransactionId,
    params: ({ context }: { readonly context: SerialSaveContext }) => ({
      id: context.projectId,
      draft: context.draft,
    }),
    preview: {
      apply: ({ params }) => [
        {
          ref: multiRefProjectResource.ref(params.id),
          replace: params.draft,
        },
        {
          ref: multiRefSummaryResource.ref(params.id),
          replace: {
            id: params.id,
            summary: params.draft.name,
          },
        },
      ],
    },
    commit: (params) => Effect.flatMap(MultiRefSaveProjectApi, (api) => api.save(params)),
    invalidates: ({ params }) => [
      multiRefProjectResource.ref(params.id),
      multiRefSummaryResource.ref(params.id),
    ],
    routes: flow.outcomes<ProjectRecord, "conflict", OverlapSaveEvent>({
      success: ({ value }) => ({
        type: "SAVED",
        project: value,
      }),
      failure: ["SAVE_FAILED", "error"],
    }),
    concurrency: "cancel-previous",
  });

  return flow.machine<SerialSaveContext, OverlapSaveEvent, "ready", "ready">({
    id: machineId,
    initial: "ready",
    context: () => ({
      projectId: multiRefProjectId,
      draft: { id: multiRefProjectId, name: "Draft v1" },
      savedNames: [],
      error: null,
    }),
    states: {
      ready: {
        on: {
          SAVE_A: {
            submit: transaction,
            update: ({ context, event }) =>
              event.type === "SAVE_A"
                ? {
                    draft: {
                      ...context.draft,
                      name: "Draft A",
                    },
                  }
                : {},
          },
          SAVE_B: {
            submit: transaction,
            update: ({ context, event }) =>
              event.type === "SAVE_B"
                ? {
                    draft: {
                      ...context.draft,
                      name: "Draft B",
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

export function startMultiRefFlowTest(machineId: string, controls: ControlledSaveExitLayer) {
  const machine = createMultiRefCancelMachine(machineId);
  return {
    machine,
    harness: test(machine)
      .with({
        provide: controls.layer,
        resources: [seededMultiRefProject, seededMultiRefSummary],
      })
      .run(),
  };
}

export function startMultiRefRuntimeActor(machineId: string, controls: ControlledSaveExitLayer) {
  const machine = createMultiRefCancelMachine(machineId);
  const runtime = flow.runtime(
    flow
      .app({
        modules: [
          flow.module(`BT38MultiRefReplacement.${machineId}`, {
            resources: {
              project: multiRefProjectResource,
              projectSummary: multiRefSummaryResource,
            },
            machines: {
              multiRefCancel: machine,
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

  runtime.resources.seedResources([seededMultiRefProject, seededMultiRefSummary]);

  return {
    machine,
    runtime,
    actor: runtime.createActor(machine),
  };
}

export function callNames(controls: ControlledSaveExitLayer) {
  return controls.calls.map((call) => call.draft.name);
}

function transactionReceiptTypes(
  receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>,
) {
  return receipts
    .filter((receipt) => receipt.id === multiRefTransactionId)
    .map((receipt) => receipt.type);
}

function invalidationCounts(
  receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>,
) {
  return {
    project: receipts.filter(
      (receipt) =>
        receipt.id === multiRefProjectResourceId && receipt.type === "resource:invalidate",
    ).length,
    projectSummary: receipts.filter(
      (receipt) =>
        receipt.id === multiRefSummaryResourceId && receipt.type === "resource:invalidate",
    ).length,
  } as const;
}

function readTransactionStage(transaction: unknown): MultiRefTransactionStage {
  if (typeof transaction !== "object" || transaction === null || !("status" in transaction)) {
    throw new Error("Expected a transaction snapshot for the multi-ref replacement oracle");
  }

  if (transaction.status === "pending") {
    return {
      status: "pending",
    };
  }

  if (
    transaction.status === "success" &&
    "value" in transaction &&
    typeof transaction.value === "object" &&
    transaction.value !== null &&
    "name" in transaction.value &&
    typeof transaction.value.name === "string"
  ) {
    return {
      status: "success",
      valueName: transaction.value.name,
    };
  }

  throw new Error("Unexpected multi-ref transaction stage");
}

function readProjectStage(resource: unknown): MultiRefResourceStage {
  if (
    typeof resource === "object" &&
    resource !== null &&
    "status" in resource &&
    resource.status === "stale" &&
    "freshness" in resource &&
    resource.freshness === "invalidated"
  ) {
    return {
      status: "stale",
      freshness: "invalidated",
    };
  }

  if (
    typeof resource === "object" &&
    resource !== null &&
    "value" in resource &&
    typeof resource.value === "object" &&
    resource.value !== null &&
    "name" in resource.value &&
    typeof resource.value.name === "string"
  ) {
    return {
      status: "value",
      name: resource.value.name,
    };
  }

  throw new Error("Unexpected multi-ref project resource stage");
}

function readSummaryStage(resource: unknown): MultiRefSummaryStage {
  if (
    typeof resource === "object" &&
    resource !== null &&
    "status" in resource &&
    resource.status === "stale" &&
    "freshness" in resource &&
    resource.freshness === "invalidated"
  ) {
    return {
      status: "stale",
      freshness: "invalidated",
    };
  }

  if (
    typeof resource === "object" &&
    resource !== null &&
    "value" in resource &&
    typeof resource.value === "object" &&
    resource.value !== null &&
    "summary" in resource.value &&
    typeof resource.value.summary === "string"
  ) {
    return {
      status: "value",
      summary: resource.value.summary,
    };
  }

  throw new Error("Unexpected multi-ref summary resource stage");
}

type RuntimeActor = Readonly<{
  readonly snapshot: () => Readonly<{
    readonly context: SerialSaveContext;
    readonly resources: Readonly<Record<string, unknown>>;
    readonly transactions: Readonly<Record<string, unknown>>;
    readonly receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>;
  }>;
  readonly issues: () => ReadonlyArray<unknown>;
  readonly receipts: () => ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>;
}>;

function normalizeStage(
  snapshot: Readonly<{
    readonly context: SerialSaveContext;
    readonly resources: Readonly<Record<string, unknown>>;
    readonly transactions: Readonly<Record<string, unknown>>;
    readonly receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>;
  }>,
  issues: ReadonlyArray<unknown>,
  ready: number,
  receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>,
): MultiRefBoundaryStage {
  return {
    draftName: snapshot.context.draft.name,
    savedNames: snapshot.context.savedNames,
    error: snapshot.context.error,
    ready,
    issueCount: issues.length,
    project: readProjectStage(snapshot.resources[multiRefProjectResourceId]),
    summary: readSummaryStage(snapshot.resources[multiRefSummaryResourceId]),
    invalidationCounts: invalidationCounts(receipts),
    receiptTypes: transactionReceiptTypes(receipts),
    transaction: readTransactionStage(snapshot.transactions[multiRefTransactionId]),
  };
}

export function readFlowTestStage(
  harness: FlowTestHarness<SerialSaveContext, OverlapSaveEvent, "ready">,
): MultiRefBoundaryStage {
  return normalizeStage(
    {
      context: harness.context(),
      resources: harness.snapshot().resources,
      transactions: harness.snapshot().transactions,
      receipts: harness.snapshot().receipts,
    },
    harness.issues(),
    harness.pendingWork().ready,
    harness.receipts(),
  );
}

export function readRuntimeStage(actor: RuntimeActor): MultiRefBoundaryStage {
  return normalizeStage(
    actor.snapshot(),
    actor.issues(),
    readyWorkPendingCount(actor),
    actor.receipts(),
  );
}

export function completeOlderAttempt(
  controls: ControlledSaveExitLayer,
  olderOutcome: OlderOutcome,
) {
  if (olderOutcome === "success") {
    controls.succeedAt(0, {
      id: multiRefProjectId,
      name: "Draft A",
    });
    return;
  }

  controls.defectAt(0, new Error("older cancelled defect"));
}

export function completeNewerAttempt(controls: ControlledSaveExitLayer) {
  controls.succeedAt(1, {
    id: multiRefProjectId,
    name: "Draft B",
  });
}
