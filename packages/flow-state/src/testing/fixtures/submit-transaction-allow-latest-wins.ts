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
  | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>;

export interface SaveContext {
  readonly projectId: string;
  readonly draft: ProjectRecord;
  readonly savedNames: ReadonlyArray<string>;
  readonly error: "conflict" | null;
}

export type AllowLatestWinsBoundaryTransaction =
  | Readonly<{ readonly status: "pending" }>
  | Readonly<{ readonly status: "success"; readonly valueName: string }>;

export type AllowLatestWinsBoundaryStage = Readonly<{
  readonly draftName: string;
  readonly savedNames: ReadonlyArray<string>;
  readonly error: "conflict" | null;
  readonly resourceName: string;
  readonly ready: number;
  readonly issueCount: number;
  readonly receiptCounts: Readonly<{
    readonly start: number;
    readonly queue: number;
    readonly dequeue: number;
    readonly success: number;
    readonly failure: number;
    readonly defect: number;
    readonly interrupt: number;
  }>;
  readonly transaction: AllowLatestWinsBoundaryTransaction;
}>;

export const allowLatestWinsProjectId = "project-1";
export const allowLatestWinsResourceId = "BT38.allowLatestWinsProject";
export const allowLatestWinsTransactionId = "BT38.allowLatestWinsTransaction";

export class AllowLatestWinsSaveProjectApi extends Context.Service<
  AllowLatestWinsSaveProjectApi,
  {
    readonly save: (params: SaveParams) => Effect.Effect<ProjectRecord, "conflict">;
  }
>()("test/BT38/AllowLatestWinsSaveProjectApi") {}

export const allowLatestWinsProjectResource = flow.resource<[projectId: string], ProjectRecord>({
  id: allowLatestWinsResourceId,
  key: (projectId) => flow.createKey("bt38.allow-latest-wins-project", projectId),
  lookup: (projectId) =>
    Effect.succeed({
      id: projectId,
      name: "Loaded",
    }),
});

export const seededAllowLatestWinsProject = {
  ref: allowLatestWinsProjectResource.ref(allowLatestWinsProjectId),
  value: { id: allowLatestWinsProjectId, name: "Seeded v1" },
} as const;

export function createControlledSaveLayer() {
  const calls: SaveParams[] = [];
  const completions: Array<{
    readonly succeed: (value: ProjectRecord) => void;
    readonly fail: (error: "conflict") => void;
  }> = [];

  const layer = Layer.succeed(
    AllowLatestWinsSaveProjectApi,
    AllowLatestWinsSaveProjectApi.of({
      save: (params) =>
        Effect.promise<
          | Readonly<{ readonly tag: "success"; readonly value: ProjectRecord }>
          | Readonly<{ readonly tag: "failure"; readonly error: "conflict" }>
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
              });
            }),
        ).pipe(
          Effect.flatMap((result) =>
            result.tag === "success" ? Effect.succeed(result.value) : Effect.fail(result.error),
          ),
        ),
    }),
  );

  const completionAt = (index: number) => {
    const completion = completions[index];
    if (completion === undefined) {
      throw new Error(`Expected completion controls for allow latest-wins attempt ${index}`);
    }

    return completion;
  };

  return {
    layer,
    calls,
    succeedAt: (index: number, value: ProjectRecord) => completionAt(index).succeed(value),
    failAt: (index: number, error: "conflict") => completionAt(index).fail(error),
  };
}

export type ControlledSaveLayer = ReturnType<typeof createControlledSaveLayer>;

export function createAllowLatestWinsMachine(machineId: string) {
  const transaction = flow.transaction<
    SaveParams,
    ProjectRecord,
    "conflict",
    AllowLatestWinsSaveProjectApi,
    SaveEvent
  >({
    id: allowLatestWinsTransactionId,
    params: ({ context }: { readonly context: SaveContext }) => ({
      id: context.projectId,
      draft: context.draft,
    }),
    preview: {
      apply: ({ params }) => [
        {
          ref: allowLatestWinsProjectResource.ref(params.id),
          replace: params.draft,
        },
      ],
    },
    commit: (params) =>
      Effect.flatMap(AllowLatestWinsSaveProjectApi, (api) =>
        api.save({
          id: params.id,
          draft: params.draft,
        }),
      ),
    invalidates: ({ params }) => [allowLatestWinsProjectResource.ref(params.id)],
    routes: flow.outcomes<ProjectRecord, "conflict", SaveEvent>({
      success: ({ value }) => ({
        type: "SAVED",
        project: value,
      }),
      failure: ["SAVE_FAILED", "error"],
    }),
    concurrency: "allow",
  });

  return flow.machine<SaveContext, SaveEvent, "ready", "ready">({
    id: machineId,
    initial: "ready",
    context: () => ({
      projectId: allowLatestWinsProjectId,
      draft: { id: allowLatestWinsProjectId, name: "Draft v1" },
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

export function startAllowLatestWinsFlowTest(machineId: string, controls: ControlledSaveLayer) {
  const machine = createAllowLatestWinsMachine(machineId);
  return {
    machine,
    harness: test(machine)
      .with({
        provide: controls.layer,
        resources: [seededAllowLatestWinsProject],
      })
      .run(),
  };
}

export function startAllowLatestWinsRuntimeActor(
  machineId: string,
  actorId: string,
  controls: ControlledSaveLayer,
) {
  const machine = createAllowLatestWinsMachine(machineId);
  const runtime = flow.runtime(
    flow
      .app({
        modules: [
          flow.module(`BT38AllowLatestWins.${machineId}`, {
            resources: {
              project: allowLatestWinsProjectResource,
            },
            machines: {
              allow: machine,
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

  runtime.resources.seedResources([seededAllowLatestWinsProject]);

  return {
    machine,
    runtime,
    actor: runtime.orchestrators.start(machine, {
      id: actorId,
      policy: "keep-alive",
    }),
  };
}

export function callNames(controls: ControlledSaveLayer) {
  return controls.calls.map((call) => call.draft.name);
}

function terminalReceiptCounts(
  receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>,
) {
  return {
    start: receipts.filter(
      (receipt) =>
        receipt.id === allowLatestWinsTransactionId && receipt.type === "transaction:start",
    ).length,
    queue: receipts.filter(
      (receipt) =>
        receipt.id === allowLatestWinsTransactionId && receipt.type === "transaction:queue",
    ).length,
    dequeue: receipts.filter(
      (receipt) =>
        receipt.id === allowLatestWinsTransactionId && receipt.type === "transaction:dequeue",
    ).length,
    success: receipts.filter(
      (receipt) =>
        receipt.id === allowLatestWinsTransactionId && receipt.type === "transaction:success",
    ).length,
    failure: receipts.filter(
      (receipt) =>
        receipt.id === allowLatestWinsTransactionId && receipt.type === "transaction:failure",
    ).length,
    defect: receipts.filter(
      (receipt) =>
        receipt.id === allowLatestWinsTransactionId && receipt.type === "transaction:defect",
    ).length,
    interrupt: receipts.filter(
      (receipt) =>
        receipt.id === allowLatestWinsTransactionId && receipt.type === "transaction:interrupt",
    ).length,
  } as const;
}

function readTransactionStage(transaction: unknown): AllowLatestWinsBoundaryTransaction {
  if (typeof transaction !== "object" || transaction === null || !("status" in transaction)) {
    throw new Error("Expected a transaction snapshot for the allow latest-wins oracle");
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

  throw new Error("Unexpected allow latest-wins transaction stage");
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

  throw new Error("Expected the allow latest-wins resource snapshot to stay available");
}

type RuntimeActor = Readonly<{
  readonly snapshot: () => Readonly<{
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
): AllowLatestWinsBoundaryStage {
  return {
    draftName: snapshot.context.draft.name,
    savedNames: snapshot.context.savedNames,
    error: snapshot.context.error,
    resourceName: readResourceName(snapshot.resources[allowLatestWinsResourceId]),
    ready,
    issueCount: issues.length,
    receiptCounts: terminalReceiptCounts(snapshot.receipts),
    transaction: readTransactionStage(snapshot.transactions[allowLatestWinsTransactionId]),
  };
}

export function readFlowTestStage(
  harness: FlowTestHarness<SaveContext, SaveEvent, "ready">,
): AllowLatestWinsBoundaryStage {
  return normalizeStage(
    {
      context: harness.context(),
      resources: {
        [allowLatestWinsResourceId]: harness.cache().query(allowLatestWinsResourceId),
      },
      transactions: harness.snapshot().transactions,
      receipts: harness.snapshot().receipts,
    },
    harness.issues(),
    harness.pendingWork().ready,
  );
}

export function readRuntimeStage(actor: RuntimeActor): AllowLatestWinsBoundaryStage {
  return normalizeStage(actor.snapshot(), actor.issues(), readyWorkPendingCount(actor));
}

export function completeOlderFailure(controls: ControlledSaveLayer) {
  controls.failAt(0, "conflict");
}

export function completeNewerSuccess(controls: ControlledSaveLayer, newerName: string) {
  controls.succeedAt(1, {
    id: allowLatestWinsProjectId,
    name: newerName,
  });
}
