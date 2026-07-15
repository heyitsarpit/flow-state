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

export type CancelStaleRouteOutcome = "success" | "failure" | "defect";

export type CancelStaleRouteEvent =
  | Readonly<{ readonly type: "SAVE"; readonly name: string }>
  | Readonly<{ readonly type: "SAVED"; readonly project: ProjectRecord }>
  | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>;

export interface CancelStaleRouteContext {
  readonly projectId: string;
  readonly draft: ProjectRecord;
  readonly savedNames: ReadonlyArray<string>;
  readonly error: "conflict" | null;
}

export type CancelStaleRouteTransactionStage =
  | Readonly<{ readonly status: "pending" }>
  | Readonly<{ readonly status: "success"; readonly valueName: string }>;

export type CancelStaleRouteBoundaryStage = Readonly<{
  readonly draftName: string;
  readonly savedNames: ReadonlyArray<string>;
  readonly error: "conflict" | null;
  readonly resourceName: string;
  readonly ready: number;
  readonly issueCount: number;
  readonly receiptCounts: Readonly<{
    readonly success: number;
    readonly failure: number;
    readonly defect: number;
    readonly interrupt: number;
  }>;
  readonly transaction: CancelStaleRouteTransactionStage;
}>;

export const cancelStaleRouteProjectId = "project-1";
export const cancelStaleRouteProjectResourceId = "BT38.cancelStaleRouteProject";
export const cancelStaleRouteTransactionId = "BT38.cancelStaleRouteTransaction";

export class CancelStaleRouteSaveProjectApi extends Context.Service<
  CancelStaleRouteSaveProjectApi,
  {
    readonly save: (params: SaveParams) => Effect.Effect<ProjectRecord, "conflict">;
  }
>()("test/BT38/CancelStaleRouteSaveProjectApi") {}

export const cancelStaleRouteProjectResource = flow.resource<[projectId: string], ProjectRecord>({
  id: cancelStaleRouteProjectResourceId,
  key: (projectId) => flow.createKey("bt38.cancel-stale-route-project", projectId),
  lookup: (projectId) =>
    Effect.succeed({
      id: projectId,
      name: "Loaded",
    }),
});

export const seededCancelStaleRouteProject = {
  ref: cancelStaleRouteProjectResource.ref(cancelStaleRouteProjectId),
  value: { id: cancelStaleRouteProjectId, name: "Seeded v1" },
} as const;

const cancelledSuccessRouteCause = new Error("cancelled success route exploded");
const cancelledFailureRouteCause = new Error("cancelled failure route exploded");
const cancelledDefectRouteCause = new Error("cancelled defect route exploded");

export function createControlledSaveExitLayer() {
  const calls: SaveParams[] = [];
  const completions: Array<{
    readonly succeed: (value: ProjectRecord) => void;
    readonly fail: (error: "conflict") => void;
    readonly defect: (cause: Error) => void;
  }> = [];

  const layer = Layer.succeed(
    CancelStaleRouteSaveProjectApi,
    CancelStaleRouteSaveProjectApi.of({
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
      throw new Error(`Expected completion controls for cancel stale-route save attempt ${index}`);
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

export function createCancelStaleRouteMachine(machineId: string) {
  const transaction = flow.transaction<
    SaveParams,
    ProjectRecord,
    "conflict",
    CancelStaleRouteSaveProjectApi,
    CancelStaleRouteEvent
  >({
    id: cancelStaleRouteTransactionId,
    params: ({ context }: { readonly context: CancelStaleRouteContext }) => ({
      id: context.projectId,
      draft: context.draft,
    }),
    preview: {
      apply: ({ params }) => [
        {
          ref: cancelStaleRouteProjectResource.ref(params.id),
          replace: params.draft,
        },
      ],
    },
    commit: (params) =>
      Effect.flatMap(CancelStaleRouteSaveProjectApi, (api) =>
        api.save({
          id: params.id,
          draft: params.draft,
        }),
      ),
    invalidates: ({ params }) => [cancelStaleRouteProjectResource.ref(params.id)],
    routes: flow.outcomes<ProjectRecord, "conflict", CancelStaleRouteEvent>({
      success: ({ value }) => {
        if (value.name.startsWith("Older cancelled")) {
          throw cancelledSuccessRouteCause;
        }

        return {
          type: "SAVED",
          project: value,
        };
      },
      failure: () => {
        throw cancelledFailureRouteCause;
      },
      defect: () => {
        throw cancelledDefectRouteCause;
      },
    }),
    concurrency: "cancel-previous",
  });

  return flow.machine<CancelStaleRouteContext, CancelStaleRouteEvent, "ready", "ready">({
    id: machineId,
    initial: "ready",
    context: () => ({
      projectId: cancelStaleRouteProjectId,
      draft: { id: cancelStaleRouteProjectId, name: "Draft v1" },
      savedNames: [],
      error: null,
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
        },
      },
    },
  });
}

export function startCancelStaleRouteFlowTest(
  machineId: string,
  controls: ControlledSaveExitLayer,
) {
  const machine = createCancelStaleRouteMachine(machineId);
  return {
    machine,
    harness: test(machine)
      .with({
        provide: controls.layer,
        resources: [seededCancelStaleRouteProject],
      })
      .run(),
  };
}

export function startCancelStaleRouteRuntimeActor(
  machineId: string,
  actorId: string,
  controls: ControlledSaveExitLayer,
) {
  const machine = createCancelStaleRouteMachine(machineId);
  const runtime = flow.runtime(
    flow
      .app({
        modules: [
          flow.module(`BT38CancelStaleRoute.${machineId}`, {
            resources: {
              project: cancelStaleRouteProjectResource,
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

  runtime.resources.seedResources([seededCancelStaleRouteProject]);

  return {
    machine,
    runtime,
    actor: runtime.orchestrators.start(machine, {
      id: actorId,
      policy: "keep-alive",
    }),
  };
}

export function callNames(controls: ControlledSaveExitLayer) {
  return controls.calls.map((call) => call.draft.name);
}

function terminalReceiptCounts(
  receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>,
) {
  return {
    success: receipts.filter(
      (receipt) =>
        receipt.id === cancelStaleRouteTransactionId && receipt.type === "transaction:success",
    ).length,
    failure: receipts.filter(
      (receipt) =>
        receipt.id === cancelStaleRouteTransactionId && receipt.type === "transaction:failure",
    ).length,
    defect: receipts.filter(
      (receipt) =>
        receipt.id === cancelStaleRouteTransactionId && receipt.type === "transaction:defect",
    ).length,
    interrupt: receipts.filter(
      (receipt) =>
        receipt.id === cancelStaleRouteTransactionId && receipt.type === "transaction:interrupt",
    ).length,
  } as const;
}

function readTransactionStage(transaction: unknown): CancelStaleRouteTransactionStage {
  if (typeof transaction !== "object" || transaction === null || !("status" in transaction)) {
    throw new Error("Expected a transaction snapshot for the cancel stale-route oracle");
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

  throw new Error("Unexpected cancel stale-route transaction stage");
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

  throw new Error("Expected the cancel stale-route resource snapshot to stay available");
}

type RuntimeActor = Readonly<{
  readonly getSnapshot: () => Readonly<{
    readonly context: CancelStaleRouteContext;
    readonly resources: Readonly<Record<string, unknown>>;
    readonly transactions: Readonly<Record<string, unknown>>;
    readonly receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>;
  }>;
  readonly issues: () => ReadonlyArray<unknown>;
}>;

function normalizeStage(
  snapshot: Readonly<{
    readonly context: CancelStaleRouteContext;
    readonly resources: Readonly<Record<string, unknown>>;
    readonly transactions: Readonly<Record<string, unknown>>;
    readonly receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>;
  }>,
  issues: ReadonlyArray<unknown>,
  ready: number,
): CancelStaleRouteBoundaryStage {
  return {
    draftName: snapshot.context.draft.name,
    savedNames: snapshot.context.savedNames,
    error: snapshot.context.error,
    resourceName: readResourceName(snapshot.resources[cancelStaleRouteProjectResourceId]),
    ready,
    issueCount: issues.length,
    receiptCounts: terminalReceiptCounts(snapshot.receipts),
    transaction: readTransactionStage(snapshot.transactions[cancelStaleRouteTransactionId]),
  };
}

export function readFlowTestStage(
  harness: FlowTestHarness<CancelStaleRouteContext, CancelStaleRouteEvent, "ready">,
): CancelStaleRouteBoundaryStage {
  return normalizeStage(
    {
      context: harness.context(),
      resources: {
        [cancelStaleRouteProjectResourceId]: harness
          .cache()
          .query(cancelStaleRouteProjectResourceId),
      },
      transactions: harness.getSnapshot().transactions,
      receipts: harness.getSnapshot().receipts,
    },
    harness.issues(),
    harness.pendingWork().ready,
  );
}

export function readRuntimeStage(actor: RuntimeActor): CancelStaleRouteBoundaryStage {
  return normalizeStage(actor.getSnapshot(), actor.issues(), readyWorkPendingCount(actor));
}

export function completeNewerAttempt(controls: ControlledSaveExitLayer, newerName: string) {
  controls.succeedAt(1, {
    id: cancelStaleRouteProjectId,
    name: newerName,
  });
}

export function completeOlderAttempt(
  controls: ControlledSaveExitLayer,
  olderOutcome: CancelStaleRouteOutcome,
  olderName: string,
) {
  switch (olderOutcome) {
    case "success":
      controls.succeedAt(0, {
        id: cancelStaleRouteProjectId,
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
