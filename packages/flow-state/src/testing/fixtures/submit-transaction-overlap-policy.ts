import { Context, Effect, Layer } from "effect";

import type { FlowTestHarness } from "../../core/api/types.js";
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

export type OverlapPolicy = "reject-while-running" | "serialize" | "cancel-previous" | "allow";

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

export type TransactionReceiptCounts = Readonly<{
  readonly start: number;
  readonly queue: number;
  readonly dequeue: number;
  readonly success: number;
  readonly failure: number;
  readonly defect: number;
  readonly interrupt: number;
}>;

export type OverlapPolicyBoundaryStage = Readonly<{
  readonly savedNames: ReadonlyArray<string>;
  readonly error: "conflict" | null;
  readonly resourceName: string;
  readonly issueCode: string | null;
  readonly previewPatchCount: number;
  readonly rollbackCount: number;
  readonly rejectCount: number;
  readonly receiptCounts: TransactionReceiptCounts;
  readonly transaction: Readonly<{ readonly status: "pending" }>;
}>;

export const overlapPolicyProjectId = "project-1";
export const overlapPolicyProjectResourceId = "BT38.overlapPolicyProject";

export class OverlapPolicySaveProjectApi extends Context.Service<
  OverlapPolicySaveProjectApi,
  {
    readonly save: (params: SaveParams) => Effect.Effect<ProjectRecord, "conflict">;
  }
>()("test/BT38/OverlapPolicySaveProjectApi") {}

export const overlapPolicyProjectResource = flow.resource<[projectId: string], ProjectRecord>({
  id: overlapPolicyProjectResourceId,
  key: (projectId) => flow.createKey("bt38.overlap-policy-project", projectId),
  lookup: (projectId) =>
    Effect.succeed({
      id: projectId,
      name: "Loaded",
    }),
});

export const seededOverlapPolicyProject = {
  ref: overlapPolicyProjectResource.ref(overlapPolicyProjectId),
  value: { id: overlapPolicyProjectId, name: "Seeded v1" },
} as const;

export function createPendingSaveLayer() {
  const calls: SaveParams[] = [];

  const layer = Layer.succeed(
    OverlapPolicySaveProjectApi,
    OverlapPolicySaveProjectApi.of({
      save: (params) =>
        Effect.promise<ProjectRecord>(() => {
          calls.push(params);
          return new Promise<ProjectRecord>(() => {});
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

  return {
    layer,
    calls,
  };
}

export type PendingSaveLayer = ReturnType<typeof createPendingSaveLayer>;

export function transactionIdForPolicy(policy: OverlapPolicy) {
  switch (policy) {
    case "reject-while-running":
      return "BT38.overlapPolicy.reject";
    case "serialize":
      return "BT38.overlapPolicy.serialize";
    case "cancel-previous":
      return "BT38.overlapPolicy.cancel";
    case "allow":
      return "BT38.overlapPolicy.allow";
  }
}

function machineKeyForPolicy(policy: OverlapPolicy) {
  switch (policy) {
    case "reject-while-running":
      return "reject";
    case "serialize":
      return "serialize";
    case "cancel-previous":
      return "cancel";
    case "allow":
      return "allow";
  }
}

export function createOverlapPolicyMachine(machineId: string, policy: OverlapPolicy) {
  const transaction = flow.transaction<
    SaveParams,
    ProjectRecord,
    "conflict",
    OverlapPolicySaveProjectApi,
    SaveEvent
  >({
    id: transactionIdForPolicy(policy),
    params: ({ context }: { readonly context: SaveContext }) => ({
      id: context.projectId,
      draft: context.draft,
    }),
    preview: {
      apply: ({ params }) => [
        {
          ref: overlapPolicyProjectResource.ref(params.id),
          replace: params.draft,
        },
      ],
    },
    commit: (params) =>
      Effect.flatMap(OverlapPolicySaveProjectApi, (api) =>
        api.save({
          id: params.id,
          draft: params.draft,
        }),
      ),
    invalidates: ({ params }) => [overlapPolicyProjectResource.ref(params.id)],
    routes: flow.outcomes<ProjectRecord, "conflict", SaveEvent>({
      success: ({ value }) => ({
        type: "SAVED",
        project: value,
      }),
      failure: ["SAVE_FAILED", "error"],
    }),
    concurrency: policy,
  });

  return flow.machine<SaveContext, SaveEvent, "ready", "ready">({
    id: machineId,
    initial: "ready",
    context: () => ({
      projectId: overlapPolicyProjectId,
      draft: { id: overlapPolicyProjectId, name: "Draft v1" },
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

export function startOverlapPolicyFlowTest(
  machineId: string,
  policy: OverlapPolicy,
  controls: PendingSaveLayer,
  events?: ReadonlyArray<SaveEvent>,
) {
  const machine = createOverlapPolicyMachine(machineId, policy);
  return {
    machine,
    harness: test(machine)
      .with({
        provide: controls.layer,
        resources: [seededOverlapPolicyProject],
      })
      .run(events),
  };
}

export function startOverlapPolicyRuntimeActor(
  machineId: string,
  actorId: string,
  policy: OverlapPolicy,
  controls: PendingSaveLayer,
) {
  const machine = createOverlapPolicyMachine(machineId, policy);
  const runtime = flow.runtime(
    flow
      .app({
        modules: [
          flow.module(`BT38OverlapPolicy.${machineKeyForPolicy(policy)}.${machineId}`, {
            resources: {
              project: overlapPolicyProjectResource,
            },
            machines: {
              policy: machine,
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

  runtime.resources.seedResources([seededOverlapPolicyProject]);

  return {
    machine,
    runtime,
    actor: runtime.orchestrators.start(machine, {
      id: actorId,
      policy: "keep-alive",
    }),
  };
}

export function callNames(controls: PendingSaveLayer) {
  return controls.calls.map((call) => call.draft.name);
}

function transactionReceiptCounts(
  receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>,
  policy: OverlapPolicy,
): TransactionReceiptCounts {
  const transactionId = transactionIdForPolicy(policy);

  return {
    start: receipts.filter(
      (receipt) => receipt.id === transactionId && receipt.type === "transaction:start",
    ).length,
    queue: receipts.filter(
      (receipt) => receipt.id === transactionId && receipt.type === "transaction:queue",
    ).length,
    dequeue: receipts.filter(
      (receipt) => receipt.id === transactionId && receipt.type === "transaction:dequeue",
    ).length,
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
  };
}

function previewPatchCount(
  receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>,
  policy: OverlapPolicy,
) {
  const transactionId = transactionIdForPolicy(policy);
  return receipts.filter(
    (receipt) => receipt.id === transactionId && receipt.type === "transaction:preview-patch",
  ).length;
}

function rollbackCount(
  receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>,
  policy: OverlapPolicy,
) {
  const transactionId = transactionIdForPolicy(policy);
  return receipts.filter(
    (receipt) => receipt.id === transactionId && receipt.type === "transaction:rollback",
  ).length;
}

function rejectCount(
  receipts: ReadonlyArray<Readonly<{ readonly id?: string; readonly type: string }>>,
  policy: OverlapPolicy,
) {
  const transactionId = transactionIdForPolicy(policy);
  return receipts.filter(
    (receipt) => receipt.id === transactionId && receipt.type === "transaction:reject",
  ).length;
}

function readPendingTransaction(transaction: unknown) {
  if (
    typeof transaction === "object" &&
    transaction !== null &&
    "status" in transaction &&
    transaction.status === "pending"
  ) {
    return {
      status: "pending",
    } as const;
  }

  throw new Error("Expected the overlap policy transaction to stay pending");
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

  throw new Error("Expected the overlap policy resource snapshot to stay available");
}

function readIssueCode(issues: ReadonlyArray<unknown>) {
  if (issues.length === 0) {
    return null;
  }

  const [firstIssue] = issues;
  if (
    typeof firstIssue === "object" &&
    firstIssue !== null &&
    "error" in firstIssue &&
    typeof firstIssue.error === "object" &&
    firstIssue.error !== null &&
    "code" in firstIssue.error &&
    typeof firstIssue.error.code === "string"
  ) {
    return firstIssue.error.code;
  }

  throw new Error("Expected the overlap policy issue to expose an error code");
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
  policy: OverlapPolicy,
): OverlapPolicyBoundaryStage {
  const transactionId = transactionIdForPolicy(policy);

  return {
    savedNames: snapshot.context.savedNames,
    error: snapshot.context.error,
    resourceName: readResourceName(snapshot.resources[overlapPolicyProjectResourceId]),
    issueCode: readIssueCode(issues),
    previewPatchCount: previewPatchCount(snapshot.receipts, policy),
    rollbackCount: rollbackCount(snapshot.receipts, policy),
    rejectCount: rejectCount(snapshot.receipts, policy),
    receiptCounts: transactionReceiptCounts(snapshot.receipts, policy),
    transaction: readPendingTransaction(snapshot.transactions[transactionId]),
  };
}

export function readFlowTestStage(
  harness: FlowTestHarness<SaveContext, SaveEvent, "ready">,
  policy: OverlapPolicy,
): OverlapPolicyBoundaryStage {
  return normalizeStage(
    {
      context: harness.context(),
      resources: {
        [overlapPolicyProjectResourceId]: harness.cache().query(overlapPolicyProjectResourceId),
      },
      transactions: harness.snapshot().transactions,
      receipts: harness.snapshot().receipts,
    },
    harness.issues(),
    policy,
  );
}

export function readRuntimeStage(
  actor: RuntimeActor,
  policy: OverlapPolicy,
): OverlapPolicyBoundaryStage {
  return normalizeStage(actor.snapshot(), actor.issues(), policy);
}
