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
export type OlderOutcome = "success" | "failure" | "defect";

export type ReplacementInterleavingBoundaryTransaction =
  | Readonly<{ readonly status: "pending" }>
  | Readonly<{ readonly status: "success"; readonly valueName: string }>;

export type ReplacementInterleavingBoundaryStage = Readonly<{
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
  readonly transaction: ReplacementInterleavingBoundaryTransaction;
}>;

export const replacementInterleavingProjectId = "project-1";
export const replacementInterleavingResourceId = "BT38.replacementInterleavingProject";

export class ReplacementInterleavingSaveProjectApi extends Context.Service<
  ReplacementInterleavingSaveProjectApi,
  {
    readonly save: (params: SaveParams) => Effect.Effect<ProjectRecord, "conflict">;
  }
>()("test/BT38/ReplacementInterleavingSaveProjectApi") {}

export const replacementInterleavingProjectResource = flow.resource<
  [projectId: string],
  ProjectRecord
>({
  id: replacementInterleavingResourceId,
  key: (projectId) => flow.createKey("bt38.replacement-interleaving-project", projectId),
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
    ReplacementInterleavingSaveProjectApi,
    ReplacementInterleavingSaveProjectApi.of({
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
      throw new Error(`Expected completion controls for replacement attempt ${index}`);
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

export function createReplacementInterleavingMachine(caseDef: {
  readonly policy: ReplacementPolicy;
  readonly transactionId: string;
  readonly machineId: string;
}) {
  const transaction = flow.transaction<
    SaveParams,
    ProjectRecord,
    "conflict",
    ReplacementInterleavingSaveProjectApi,
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
          ref: replacementInterleavingProjectResource.ref(params.id),
          replace: params.draft,
        },
      ],
    },
    commit: (params) =>
      Effect.flatMap(ReplacementInterleavingSaveProjectApi, (api) => api.save(params)),
    invalidates: ({ params }) => [replacementInterleavingProjectResource.ref(params.id)],
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
      projectId: replacementInterleavingProjectId,
      draft: { id: replacementInterleavingProjectId, name: "Draft v1" },
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

export function startReplacementInterleavingFlowTest(
  caseDef: {
    readonly policy: ReplacementPolicy;
    readonly transactionId: string;
    readonly machineId: string;
  },
  controls: ControlledSaveExitLayer,
) {
  const machine = createReplacementInterleavingMachine(caseDef);
  const app = flow.app({
    modules: [
      flow.module(`BT39ReplacementInterleaving.${caseDef.machineId}`, {
        resources: {
          project: replacementInterleavingProjectResource,
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

export function startReplacementInterleavingRuntimeActor(
  caseDef: {
    readonly policy: ReplacementPolicy;
    readonly transactionId: string;
    readonly machineId: string;
  },
  controls: ControlledSaveExitLayer,
) {
  const machine = createReplacementInterleavingMachine(caseDef);
  const runtime = flow.runtime(
    flow
      .app({
        modules: [
          flow.module(`BT38ReplacementInterleaving.${caseDef.machineId}`, {
            resources: {
              project: replacementInterleavingProjectResource,
            },
            machines: {
              replacement: machine,
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

export function callNames(controls: ControlledSaveExitLayer) {
  return controls.calls.map((call) => call.draft.name);
}

function terminalReceiptCounts(
  receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>,
  transactionId: string,
) {
  return {
    success: receipts.filter(
      (receipt) => receipt.id === transactionId && receipt.type === "transaction:success",
    ).length,
    failure: receipts.filter(
      (receipt) => receipt.id === transactionId && receipt.type === "transaction:failure",
    ).length,
    defect: receipts.filter(
      (receipt) => receipt.id === transactionId && receipt.type === "transaction:defect",
    ).length,
    interrupt: receipts.filter(
      (receipt) => receipt.id === transactionId && receipt.type === "transaction:interrupt",
    ).length,
  } as const;
}

function readTransactionSnapshot(transaction: unknown): ReplacementInterleavingBoundaryTransaction {
  if (typeof transaction !== "object" || transaction === null || !("status" in transaction)) {
    return {
      status: "pending",
    };
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

  throw new Error("Unexpected replacement interleaving transaction stage");
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

  throw new Error("Expected the replacement interleaving resource snapshot to stay available");
}

type ReplacementRuntimeActor = Readonly<{
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
  transactionId: string,
): ReplacementInterleavingBoundaryStage {
  return {
    draftName: snapshot.context.draft.name,
    savedNames: snapshot.context.savedNames,
    error: snapshot.context.error,
    defected: snapshot.context.defected,
    resourceName: readResourceName(snapshot.resources[replacementInterleavingResourceId]),
    ready,
    issueCount: issues.length,
    receiptCounts: terminalReceiptCounts(snapshot.receipts, transactionId),
    transaction: readTransactionSnapshot(snapshot.transactions[transactionId]),
  };
}

export function readFlowTestStage(
  harness: FlowTestHarness<SaveContext, SaveEvent, "ready">,
  transactionId: string,
): ReplacementInterleavingBoundaryStage {
  return normalizeStage(
    {
      context: harness.context(),
      resources: {
        [replacementInterleavingResourceId]: harness
          .cache()
          .query(replacementInterleavingResourceId),
      },
      transactions: harness.snapshot().transactions,
      receipts: harness.snapshot().receipts,
    },
    harness.issues(),
    harness.pendingWork().ready,
    transactionId,
  );
}

export function readRuntimeStage(
  actor: ReplacementRuntimeActor,
  transactionId: string,
): ReplacementInterleavingBoundaryStage {
  return normalizeStage(
    actor.snapshot(),
    actor.issues(),
    readyWorkPendingCount(actor),
    transactionId,
  );
}

export function completeAttempt(
  controls: ControlledSaveExitLayer,
  attemptIndex: number,
  outcome: OlderOutcome | "success",
  name: string,
  defectMessage: string,
) {
  switch (outcome) {
    case "success":
      controls.succeedAt(attemptIndex, {
        id: replacementInterleavingProjectId,
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
