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

export type CancelStalePublicationOutcome = "success" | "failure" | "defect";

export type CancelStalePublicationEvent =
  | Readonly<{ readonly type: "SAVE"; readonly name: string }>
  | Readonly<{ readonly type: "SAVED"; readonly project: ProjectRecord }>
  | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>
  | Readonly<{ readonly type: "SAVE_DEFECT" }>;

export interface CancelStalePublicationContext {
  readonly projectId: string;
  readonly draft: ProjectRecord;
  readonly savedNames: ReadonlyArray<string>;
  readonly error: "conflict" | null;
  readonly defected: boolean;
}

export type CancelStalePublicationTransactionStage =
  | Readonly<{ readonly status: "pending" }>
  | Readonly<{ readonly status: "success"; readonly valueName: string }>;

export type CancelStalePublicationBoundaryStage = Readonly<{
  readonly draftName: string;
  readonly savedNames: ReadonlyArray<string>;
  readonly error: "conflict" | null;
  readonly defected: boolean;
  readonly resourceName: string;
  readonly ready: number;
  readonly issueCount: number;
  readonly receiptCounts: Readonly<{
    readonly success: number;
    readonly failure: number;
    readonly defect: number;
    readonly interrupt: number;
  }>;
  readonly transaction: CancelStalePublicationTransactionStage;
  readonly firstAbortCount: number;
  readonly secondAborted: boolean;
}>;

export const cancelStalePublicationProjectId = "project-1";
export const cancelStalePublicationProjectResourceId = "BT38.cancelStalePublicationProject";
export const cancelStalePublicationTransactionId = "BT38.cancelStalePublicationTransaction";

export class CancelStalePublicationSaveProjectApi extends Context.Service<
  CancelStalePublicationSaveProjectApi,
  {
    readonly save: (params: SaveParams) => Effect.Effect<ProjectRecord, "conflict">;
  }
>()("test/BT38/CancelStalePublicationSaveProjectApi") {}

export const cancelStalePublicationProjectResource = flow.resource<
  [projectId: string],
  ProjectRecord
>({
  id: cancelStalePublicationProjectResourceId,
  key: (projectId) => flow.createKey("bt38.cancel-stale-publication-project", projectId),
  lookup: (projectId) =>
    Effect.succeed({
      id: projectId,
      name: "Loaded",
    }),
});

export const seededCancelStalePublicationProject = {
  ref: cancelStalePublicationProjectResource.ref(cancelStalePublicationProjectId),
  value: { id: cancelStalePublicationProjectId, name: "Seeded v1" },
} as const;

export function createAbortableSaveExitLayer() {
  const calls: SaveParams[] = [];
  const entries: Array<{
    readonly name: string;
    readonly signal: AbortSignal;
    readonly abortCount: () => number;
    readonly succeed: (value: ProjectRecord) => void;
    readonly fail: (error: "conflict") => void;
    readonly defect: (cause: Error) => void;
  }> = [];

  const layer = Layer.succeed(
    CancelStalePublicationSaveProjectApi,
    CancelStalePublicationSaveProjectApi.of({
      save: (params) =>
        Effect.promise<ProjectRecord>((signal) => {
          let abortCount = 0;
          signal.addEventListener("abort", () => {
            abortCount += 1;
          });

          return new Promise<ProjectRecord>((resolve, reject) => {
            calls.push(params);
            entries.push({
              name: params.draft.name,
              signal,
              abortCount: () => abortCount,
              succeed: resolve,
              fail: reject,
              defect: reject,
            });
          });
        }).pipe(
          Effect.mapError((error) => {
            if (error === "conflict") {
              return "conflict" as const;
            }

            throw error;
          }),
        ),
    }),
  );

  const entryAt = (index: number) => {
    const entry = entries[index];
    if (entry === undefined) {
      throw new Error(
        `Expected abortable completion controls for cancel stale publication attempt ${index}`,
      );
    }

    return entry;
  };

  return {
    layer,
    calls,
    entries,
    entryAt,
    succeedAt: (index: number, value: ProjectRecord) => entryAt(index).succeed(value),
    failAt: (index: number, error: "conflict") => entryAt(index).fail(error),
    defectAt: (index: number, cause: Error) => entryAt(index).defect(cause),
  };
}

export type AbortableSaveExitLayer = ReturnType<typeof createAbortableSaveExitLayer>;

export function createCancelStalePublicationMachine(machineId: string) {
  const transaction = flow.transaction<
    SaveParams,
    ProjectRecord,
    "conflict",
    CancelStalePublicationSaveProjectApi,
    CancelStalePublicationEvent
  >({
    id: cancelStalePublicationTransactionId,
    params: ({ context }: { readonly context: CancelStalePublicationContext }) => ({
      id: context.projectId,
      draft: context.draft,
    }),
    preview: {
      apply: ({ params }) => [
        {
          ref: cancelStalePublicationProjectResource.ref(params.id),
          replace: params.draft,
        },
      ],
    },
    commit: (params) =>
      Effect.flatMap(CancelStalePublicationSaveProjectApi, (api) =>
        api.save({
          id: params.id,
          draft: params.draft,
        }),
      ),
    invalidates: ({ params }) => [cancelStalePublicationProjectResource.ref(params.id)],
    routes: flow.outcomes<ProjectRecord, "conflict", CancelStalePublicationEvent>({
      success: ({ value }) => ({
        type: "SAVED",
        project: value,
      }),
      failure: ["SAVE_FAILED", "error"],
      defect: () => ({
        type: "SAVE_DEFECT",
      }),
    }),
    concurrency: "cancel-previous",
  });

  return flow.machine<CancelStalePublicationContext, CancelStalePublicationEvent, "ready", "ready">(
    {
      id: machineId,
      initial: "ready",
      context: () => ({
        projectId: cancelStalePublicationProjectId,
        draft: { id: cancelStalePublicationProjectId, name: "Draft v1" },
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
    },
  );
}

export function startCancelStalePublicationFlowTest(
  machineId: string,
  controls: AbortableSaveExitLayer,
) {
  const machine = createCancelStalePublicationMachine(machineId);
  return {
    machine,
    harness: test(machine)
      .with({
        provide: controls.layer,
        resources: [seededCancelStalePublicationProject],
      })
      .run(),
  };
}

export function startCancelStalePublicationRuntimeActor(
  machineId: string,
  actorId: string,
  controls: AbortableSaveExitLayer,
) {
  const machine = createCancelStalePublicationMachine(machineId);
  const runtime = flow.runtime(
    flow
      .app({
        modules: [
          flow.module(`BT38CancelStalePublication.${machineId}`, {
            resources: {
              project: cancelStalePublicationProjectResource,
            },
            machines: {
              cancel: machine,
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

  runtime.resources.seedResources([seededCancelStalePublicationProject]);

  return {
    machine,
    runtime,
    actor: runtime.orchestrators.start(machine, {
      id: actorId,
      policy: "keep-alive",
    }),
  };
}

export function callNames(controls: AbortableSaveExitLayer) {
  return controls.calls.map((call) => call.draft.name);
}

function terminalReceiptCounts(
  receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>,
) {
  return {
    success: receipts.filter(
      (receipt) =>
        receipt.id === cancelStalePublicationTransactionId &&
        receipt.type === "transaction:success",
    ).length,
    failure: receipts.filter(
      (receipt) =>
        receipt.id === cancelStalePublicationTransactionId &&
        receipt.type === "transaction:failure",
    ).length,
    defect: receipts.filter(
      (receipt) =>
        receipt.id === cancelStalePublicationTransactionId && receipt.type === "transaction:defect",
    ).length,
    interrupt: receipts.filter(
      (receipt) =>
        receipt.id === cancelStalePublicationTransactionId &&
        receipt.type === "transaction:interrupt",
    ).length,
  } as const;
}

function readTransactionStage(transaction: unknown): CancelStalePublicationTransactionStage {
  if (typeof transaction !== "object" || transaction === null || !("status" in transaction)) {
    throw new Error("Expected a transaction snapshot for the cancel stale publication oracle");
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

  throw new Error("Unexpected cancel stale publication transaction stage");
}

function readResourceName(resource: unknown) {
  if (
    typeof resource === "object" &&
    resource !== null &&
    "value" in resource &&
    typeof resource.value === "object" &&
    resource.value !== null &&
    "name" in resource.value &&
    typeof resource.value.name === "string"
  ) {
    return resource.value.name;
  }

  throw new Error("Expected the cancel stale publication resource snapshot to stay available");
}

type RuntimeActor = Readonly<{
  readonly getSnapshot: () => Readonly<{
    readonly context: CancelStalePublicationContext;
    readonly resources: Readonly<Record<string, unknown>>;
    readonly transactions: Readonly<Record<string, unknown>>;
    readonly receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>;
  }>;
  readonly issues: () => ReadonlyArray<unknown>;
}>;

function normalizeStage(
  snapshot: Readonly<{
    readonly context: CancelStalePublicationContext;
    readonly resources: Readonly<Record<string, unknown>>;
    readonly transactions: Readonly<Record<string, unknown>>;
    readonly receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>;
  }>,
  issues: ReadonlyArray<unknown>,
  ready: number,
  controls: AbortableSaveExitLayer,
): CancelStalePublicationBoundaryStage {
  return {
    draftName: snapshot.context.draft.name,
    savedNames: snapshot.context.savedNames,
    error: snapshot.context.error,
    defected: snapshot.context.defected,
    resourceName: readResourceName(snapshot.resources[cancelStalePublicationProjectResourceId]),
    ready,
    issueCount: issues.length,
    receiptCounts: terminalReceiptCounts(snapshot.receipts),
    transaction: readTransactionStage(snapshot.transactions[cancelStalePublicationTransactionId]),
    firstAbortCount: controls.entryAt(0).abortCount(),
    secondAborted: controls.entryAt(1).signal.aborted,
  };
}

export function readFlowTestStage(
  harness: FlowTestHarness<CancelStalePublicationContext, CancelStalePublicationEvent, "ready">,
  controls: AbortableSaveExitLayer,
): CancelStalePublicationBoundaryStage {
  return normalizeStage(
    {
      context: harness.context(),
      resources: {
        [cancelStalePublicationProjectResourceId]: harness
          .cache()
          .query(cancelStalePublicationProjectResourceId),
      },
      transactions: harness.getSnapshot().transactions,
      receipts: harness.getSnapshot().receipts,
    },
    harness.issues(),
    harness.pendingWork().ready,
    controls,
  );
}

export function readRuntimeStage(
  actor: RuntimeActor,
  controls: AbortableSaveExitLayer,
): CancelStalePublicationBoundaryStage {
  return normalizeStage(
    actor.getSnapshot(),
    actor.issues(),
    readyWorkPendingCount(actor),
    controls,
  );
}

export function completeOlderAttempt(
  controls: AbortableSaveExitLayer,
  olderOutcome: CancelStalePublicationOutcome,
  olderName: string,
) {
  switch (olderOutcome) {
    case "success":
      controls.succeedAt(0, {
        id: cancelStalePublicationProjectId,
        name: olderName,
      });
      return;
    case "failure":
      controls.failAt(0, "conflict");
      return;
    case "defect":
      controls.defectAt(0, new Error("older defect"));
      return;
  }
}

export function completeNewerAttempt(controls: AbortableSaveExitLayer, newerName: string) {
  controls.succeedAt(1, {
    id: cancelStalePublicationProjectId,
    name: newerName,
  });
}
