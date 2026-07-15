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

export type StaleAllowPublicationOutcome = "success" | "failure" | "defect";

export type StaleAllowPublicationEvent =
  | Readonly<{ readonly type: "SAVE"; readonly name: string }>
  | Readonly<{ readonly type: "SAVED"; readonly project: ProjectRecord }>
  | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>
  | Readonly<{ readonly type: "SAVE_DEFECT" }>;

export interface StaleAllowPublicationContext {
  readonly projectId: string;
  readonly draft: ProjectRecord;
  readonly savedNames: ReadonlyArray<string>;
  readonly error: "conflict" | null;
  readonly defected: boolean;
}

export type StaleAllowPublicationTransactionStage =
  | Readonly<{ readonly status: "pending" }>
  | Readonly<{ readonly status: "success"; readonly valueName: string }>;

export type StaleAllowPublicationBoundaryStage = Readonly<{
  readonly draftName: string;
  readonly savedNames: ReadonlyArray<string>;
  readonly error: "conflict" | null;
  readonly defected: boolean;
  readonly resourceName: string;
  readonly ready: number;
  readonly issueCount: number;
  readonly invalidateCount: number;
  readonly receiptCounts: Readonly<{
    readonly success: number;
    readonly failure: number;
    readonly defect: number;
  }>;
  readonly transaction: StaleAllowPublicationTransactionStage;
}>;

export const staleAllowPublicationProjectId = "project-1";
export const staleAllowPublicationProjectResourceId = "BT38.staleAllowPublicationProject";
export const staleAllowPublicationTransactionId = "BT38.staleAllowPublicationTransaction";

export class StaleAllowPublicationSaveProjectApi extends Context.Service<
  StaleAllowPublicationSaveProjectApi,
  {
    readonly save: (params: SaveParams) => Effect.Effect<ProjectRecord, "conflict">;
  }
>()("test/BT38/StaleAllowPublicationSaveProjectApi") {}

export const staleAllowPublicationProjectResource = flow.resource<
  [projectId: string],
  ProjectRecord
>({
  id: staleAllowPublicationProjectResourceId,
  key: (projectId) => flow.createKey("bt38.stale-allow-publication-project", projectId),
  lookup: (projectId) =>
    Effect.succeed({
      id: projectId,
      name: "Loaded",
    }),
});

export const seededStaleAllowPublicationProject = {
  ref: staleAllowPublicationProjectResource.ref(staleAllowPublicationProjectId),
  value: { id: staleAllowPublicationProjectId, name: "Seeded v1" },
} as const;

export function createControlledSaveExitLayer() {
  const calls: SaveParams[] = [];
  const completions: Array<{
    readonly succeed: (value: ProjectRecord) => void;
    readonly fail: (error: "conflict") => void;
    readonly defect: (cause: Error) => void;
  }> = [];

  const layer = Layer.succeed(
    StaleAllowPublicationSaveProjectApi,
    StaleAllowPublicationSaveProjectApi.of({
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
      throw new Error(`Expected completion controls for stale allow publication attempt ${index}`);
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

export function createStaleAllowPublicationMachine(machineId: string) {
  const transaction = flow.transaction<
    SaveParams,
    ProjectRecord,
    "conflict",
    StaleAllowPublicationSaveProjectApi,
    StaleAllowPublicationEvent
  >({
    id: staleAllowPublicationTransactionId,
    params: ({ context }: { readonly context: StaleAllowPublicationContext }) => ({
      id: context.projectId,
      draft: context.draft,
    }),
    preview: {
      apply: ({ params }) => [
        {
          ref: staleAllowPublicationProjectResource.ref(params.id),
          replace: params.draft,
        },
      ],
    },
    commit: (params) =>
      Effect.flatMap(StaleAllowPublicationSaveProjectApi, (api) =>
        api.save({
          id: params.id,
          draft: params.draft,
        }),
      ),
    invalidates: ({ params }) => [staleAllowPublicationProjectResource.ref(params.id)],
    routes: flow.outcomes<ProjectRecord, "conflict", StaleAllowPublicationEvent>({
      success: ({ value }) => ({
        type: "SAVED",
        project: value,
      }),
      failure: ["SAVE_FAILED", "error"],
      defect: () => ({
        type: "SAVE_DEFECT",
      }),
    }),
    concurrency: "allow",
  });

  return flow.machine<StaleAllowPublicationContext, StaleAllowPublicationEvent, "ready", "ready">({
    id: machineId,
    initial: "ready",
    context: () => ({
      projectId: staleAllowPublicationProjectId,
      draft: { id: staleAllowPublicationProjectId, name: "Draft v1" },
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

export function startStaleAllowPublicationFlowTest(
  machineId: string,
  controls: ControlledSaveExitLayer,
) {
  const machine = createStaleAllowPublicationMachine(machineId);
  return {
    machine,
    harness: test(machine)
      .with({
        provide: controls.layer,
        resources: [seededStaleAllowPublicationProject],
      })
      .run(),
  };
}

export function startStaleAllowPublicationRuntimeActor(
  machineId: string,
  actorId: string,
  controls: ControlledSaveExitLayer,
) {
  const machine = createStaleAllowPublicationMachine(machineId);
  const runtime = flow.runtime(
    flow
      .app({
        modules: [
          flow.module(`BT38StaleAllowPublication.${machineId}`, {
            resources: {
              project: staleAllowPublicationProjectResource,
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

  runtime.resources.seedResources([seededStaleAllowPublicationProject]);

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
        receipt.id === staleAllowPublicationTransactionId && receipt.type === "transaction:success",
    ).length,
    failure: receipts.filter(
      (receipt) =>
        receipt.id === staleAllowPublicationTransactionId && receipt.type === "transaction:failure",
    ).length,
    defect: receipts.filter(
      (receipt) =>
        receipt.id === staleAllowPublicationTransactionId && receipt.type === "transaction:defect",
    ).length,
  } as const;
}

function invalidateCount(
  receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>,
) {
  return receipts.filter(
    (receipt) =>
      receipt.id === staleAllowPublicationProjectResourceId &&
      receipt.type === "resource:invalidate",
  ).length;
}

function readTransactionStage(transaction: unknown): StaleAllowPublicationTransactionStage {
  if (typeof transaction !== "object" || transaction === null || !("status" in transaction)) {
    throw new Error("Expected a transaction snapshot for the stale allow publication oracle");
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

  throw new Error("Unexpected stale allow publication transaction stage");
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

  throw new Error("Expected the stale allow publication resource snapshot to stay available");
}

type RuntimeActor = Readonly<{
  readonly getSnapshot: () => Readonly<{
    readonly context: StaleAllowPublicationContext;
    readonly resources: Readonly<Record<string, unknown>>;
    readonly transactions: Readonly<Record<string, unknown>>;
    readonly receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>;
  }>;
  readonly issues: () => ReadonlyArray<unknown>;
}>;

function normalizeStage(
  snapshot: Readonly<{
    readonly context: StaleAllowPublicationContext;
    readonly resources: Readonly<Record<string, unknown>>;
    readonly transactions: Readonly<Record<string, unknown>>;
    readonly receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>;
  }>,
  issues: ReadonlyArray<unknown>,
  ready: number,
): StaleAllowPublicationBoundaryStage {
  return {
    draftName: snapshot.context.draft.name,
    savedNames: snapshot.context.savedNames,
    error: snapshot.context.error,
    defected: snapshot.context.defected,
    resourceName: readResourceName(snapshot.resources[staleAllowPublicationProjectResourceId]),
    ready,
    issueCount: issues.length,
    invalidateCount: invalidateCount(snapshot.receipts),
    receiptCounts: terminalReceiptCounts(snapshot.receipts),
    transaction: readTransactionStage(snapshot.transactions[staleAllowPublicationTransactionId]),
  };
}

export function readFlowTestStage(
  harness: FlowTestHarness<StaleAllowPublicationContext, StaleAllowPublicationEvent, "ready">,
): StaleAllowPublicationBoundaryStage {
  return normalizeStage(
    {
      context: harness.context(),
      resources: {
        [staleAllowPublicationProjectResourceId]: harness
          .cache()
          .query(staleAllowPublicationProjectResourceId),
      },
      transactions: harness.getSnapshot().transactions,
      receipts: harness.getSnapshot().receipts,
    },
    harness.issues(),
    harness.pendingWork().ready,
  );
}

export function readRuntimeStage(actor: RuntimeActor): StaleAllowPublicationBoundaryStage {
  return normalizeStage(actor.getSnapshot(), actor.issues(), readyWorkPendingCount(actor));
}

export function completeNewerAttempt(controls: ControlledSaveExitLayer, newerName: string) {
  controls.succeedAt(1, {
    id: staleAllowPublicationProjectId,
    name: newerName,
  });
}

export function completeOlderAttempt(
  controls: ControlledSaveExitLayer,
  olderOutcome: StaleAllowPublicationOutcome,
  olderName: string,
) {
  switch (olderOutcome) {
    case "success":
      controls.succeedAt(0, {
        id: staleAllowPublicationProjectId,
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
