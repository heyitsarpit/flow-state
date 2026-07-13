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

export type StaleAllowRouteOutcome = "success" | "failure" | "defect";

export type StaleAllowRouteEvent =
  | Readonly<{ readonly type: "SAVE"; readonly name: string }>
  | Readonly<{ readonly type: "SAVED"; readonly project: ProjectRecord }>
  | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>
  | Readonly<{ readonly type: "SAVE_DEFECT" }>;

export interface StaleAllowRouteContext {
  readonly projectId: string;
  readonly draft: ProjectRecord;
  readonly savedNames: ReadonlyArray<string>;
  readonly error: "conflict" | null;
  readonly defected: boolean;
}

export type StaleAllowRouteTransactionStage =
  | Readonly<{ readonly status: "pending" }>
  | Readonly<{ readonly status: "success"; readonly valueName: string }>;

export type StaleAllowRouteBoundaryStage = Readonly<{
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
  }>;
  readonly transaction: StaleAllowRouteTransactionStage;
}>;

export const staleAllowRouteProjectId = "project-1";
export const staleAllowRouteProjectResourceId = "BT38.staleAllowRouteProject";
export const staleAllowRouteTransactionId = "BT38.staleAllowRouteTransaction";

export class StaleAllowRouteSaveProjectApi extends Context.Service<
  StaleAllowRouteSaveProjectApi,
  {
    readonly save: (params: SaveParams) => Effect.Effect<ProjectRecord, "conflict">;
  }
>()("test/BT38/StaleAllowRouteSaveProjectApi") {}

export const staleAllowRouteProjectResource = flow.resource<[projectId: string], ProjectRecord>({
  id: staleAllowRouteProjectResourceId,
  key: (projectId) => flow.createKey("bt38.stale-allow-route-project", projectId),
  lookup: (projectId) =>
    Effect.succeed({
      id: projectId,
      name: "Loaded",
    }),
});

export const seededStaleAllowRouteProject = {
  ref: staleAllowRouteProjectResource.ref(staleAllowRouteProjectId),
  value: { id: staleAllowRouteProjectId, name: "Seeded v1" },
} as const;

const staleSuccessRouteCause = new Error("stale success route exploded");
const staleFailureRouteCause = new Error("stale failure route exploded");
const staleDefectRouteCause = new Error("stale defect route exploded");

export function createControlledSaveExitLayer() {
  const calls: SaveParams[] = [];
  const completions: Array<{
    readonly succeed: (value: ProjectRecord) => void;
    readonly fail: (error: "conflict") => void;
    readonly defect: (cause: Error) => void;
  }> = [];

  const layer = Layer.succeed(
    StaleAllowRouteSaveProjectApi,
    StaleAllowRouteSaveProjectApi.of({
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
      throw new Error(`Expected completion controls for stale allow-route save attempt ${index}`);
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

export function createStaleAllowRouteMachine(machineId: string) {
  const transaction = flow.transaction<
    SaveParams,
    ProjectRecord,
    "conflict",
    StaleAllowRouteSaveProjectApi,
    StaleAllowRouteEvent
  >({
    id: staleAllowRouteTransactionId,
    params: ({ context }: { readonly context: StaleAllowRouteContext }) => ({
      id: context.projectId,
      draft: context.draft,
    }),
    preview: {
      apply: ({ params }) => [
        {
          ref: staleAllowRouteProjectResource.ref(params.id),
          replace: params.draft,
        },
      ],
    },
    commit: (params) =>
      Effect.flatMap(StaleAllowRouteSaveProjectApi, (api) =>
        api.save({
          id: params.id,
          draft: params.draft,
        }),
      ),
    invalidates: ({ params }) => [staleAllowRouteProjectResource.ref(params.id)],
    routes: flow.outcomes<ProjectRecord, "conflict", StaleAllowRouteEvent>({
      success: ({ value }) => {
        if (value.name.startsWith("Older stale")) {
          throw staleSuccessRouteCause;
        }

        return {
          type: "SAVED",
          project: value,
        };
      },
      failure: () => {
        throw staleFailureRouteCause;
      },
      defect: () => {
        throw staleDefectRouteCause;
      },
    }),
    concurrency: "allow",
  });

  return flow.machine<StaleAllowRouteContext, StaleAllowRouteEvent, "ready", "ready">({
    id: machineId,
    initial: "ready",
    context: () => ({
      projectId: staleAllowRouteProjectId,
      draft: { id: staleAllowRouteProjectId, name: "Draft v1" },
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

export function startStaleAllowRouteFlowTest(machineId: string, controls: ControlledSaveExitLayer) {
  const machine = createStaleAllowRouteMachine(machineId);
  return {
    machine,
    harness: test(machine)
      .with({
        provide: controls.layer,
        resources: [seededStaleAllowRouteProject],
      })
      .run(),
  };
}

export function startStaleAllowRouteRuntimeActor(
  machineId: string,
  actorId: string,
  controls: ControlledSaveExitLayer,
) {
  const machine = createStaleAllowRouteMachine(machineId);
  const runtime = flow.runtime(
    flow
      .app({
        modules: [
          flow.module(`BT38StaleAllowRoute.${machineId}`, {
            resources: {
              project: staleAllowRouteProjectResource,
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

  runtime.resources.seedResources([seededStaleAllowRouteProject]);

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
        receipt.id === staleAllowRouteTransactionId && receipt.type === "transaction:success",
    ).length,
    failure: receipts.filter(
      (receipt) =>
        receipt.id === staleAllowRouteTransactionId && receipt.type === "transaction:failure",
    ).length,
    defect: receipts.filter(
      (receipt) =>
        receipt.id === staleAllowRouteTransactionId && receipt.type === "transaction:defect",
    ).length,
  } as const;
}

function readTransactionStage(transaction: unknown): StaleAllowRouteTransactionStage {
  if (typeof transaction !== "object" || transaction === null || !("status" in transaction)) {
    throw new Error("Expected a transaction snapshot for the stale allow-route oracle");
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

  throw new Error("Unexpected stale allow-route transaction stage");
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

  throw new Error("Expected the stale allow-route resource snapshot to stay available");
}

type RuntimeActor = Readonly<{
  readonly snapshot: () => Readonly<{
    readonly context: StaleAllowRouteContext;
    readonly resources: Readonly<Record<string, unknown>>;
    readonly transactions: Readonly<Record<string, unknown>>;
    readonly receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>;
  }>;
  readonly issues: () => ReadonlyArray<unknown>;
}>;

function normalizeStage(
  snapshot: Readonly<{
    readonly context: StaleAllowRouteContext;
    readonly resources: Readonly<Record<string, unknown>>;
    readonly transactions: Readonly<Record<string, unknown>>;
    readonly receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>;
  }>,
  issues: ReadonlyArray<unknown>,
  ready: number,
): StaleAllowRouteBoundaryStage {
  return {
    draftName: snapshot.context.draft.name,
    savedNames: snapshot.context.savedNames,
    error: snapshot.context.error,
    defected: snapshot.context.defected,
    resourceName: readResourceName(snapshot.resources[staleAllowRouteProjectResourceId]),
    ready,
    issueCount: issues.length,
    receiptCounts: terminalReceiptCounts(snapshot.receipts),
    transaction: readTransactionStage(snapshot.transactions[staleAllowRouteTransactionId]),
  };
}

export function readFlowTestStage(
  harness: FlowTestHarness<StaleAllowRouteContext, StaleAllowRouteEvent, "ready">,
): StaleAllowRouteBoundaryStage {
  return normalizeStage(
    {
      context: harness.context(),
      resources: {
        [staleAllowRouteProjectResourceId]: harness.cache().query(staleAllowRouteProjectResourceId),
      },
      transactions: harness.snapshot().transactions,
      receipts: harness.snapshot().receipts,
    },
    harness.issues(),
    harness.pendingWork().ready,
  );
}

export function readRuntimeStage(actor: RuntimeActor): StaleAllowRouteBoundaryStage {
  return normalizeStage(actor.snapshot(), actor.issues(), readyWorkPendingCount(actor));
}

export function completeNewerAttempt(controls: ControlledSaveExitLayer, newerName: string) {
  controls.succeedAt(1, {
    id: staleAllowRouteProjectId,
    name: newerName,
  });
}

export function completeOlderAttempt(
  controls: ControlledSaveExitLayer,
  olderOutcome: StaleAllowRouteOutcome,
  olderName: string,
) {
  switch (olderOutcome) {
    case "success":
      controls.succeedAt(0, {
        id: staleAllowRouteProjectId,
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
