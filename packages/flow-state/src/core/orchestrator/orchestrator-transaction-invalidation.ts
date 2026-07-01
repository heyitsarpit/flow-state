import { Exit } from "effect";

import type {
  FlowIssue,
  FlowInvalidationTarget,
  FlowMachine,
  FlowReceipt,
  FlowResourceRef,
  FlowResourceSnapshot,
} from "../api/types.js";
import { resolveTransactionInvalidationTargets } from "../transactions/transaction-callbacks.js";
import {
  transactionReceiptIdForInvalidationTarget,
  transactionRefsForInvalidationTarget,
} from "../transactions/transaction-invalidation.js";
import { clearIssue, issueFromExit, replaceIssue } from "./orchestrator-issues.js";
import {
  resourceFreshnessReceiptsForRefs,
  resourceInvalidationSummaryReceipt,
} from "../../services/resource-lifecycle-receipts.js";
import type {
  ResourceStoreService,
  SnapshotForMachine,
  SyncExitRunner,
  TransactionControllerDeps,
  UnknownFlowTransactionDefinition,
} from "./orchestrator-transaction-types.js";

type ResourceInvalidationReason = "transaction" | "command";

type ResourceInvalidationDeps = Readonly<{
  readonly runSyncExit: SyncExitRunner;
  readonly resourceStore: ResourceStoreService;
  readonly syncResourceSnapshots: (
    currentResources: Readonly<Record<string, FlowResourceSnapshot>>,
    refs: ReadonlyArray<FlowResourceRef>,
  ) => Record<string, FlowResourceSnapshot>;
  readonly knownResourceRefs: () => Iterable<FlowResourceRef>;
}>;

type AppliedResourceInvalidation = Readonly<{
  readonly resources: Record<string, FlowResourceSnapshot>;
  readonly issues: ReadonlyArray<FlowIssue>;
  readonly receipts: ReadonlyArray<FlowReceipt>;
}>;

export function applyResourceInvalidationTarget<
  Machine extends FlowMachine,
  Reason extends ResourceInvalidationReason,
>(
  deps: ResourceInvalidationDeps,
  args: Readonly<{
    readonly current: SnapshotForMachine<Machine>;
    readonly currentResources: Readonly<Record<string, FlowResourceSnapshot>>;
    readonly currentIssues: ReadonlyArray<FlowIssue>;
    readonly target: FlowInvalidationTarget;
    readonly reason: Reason;
    readonly correlationId: string | undefined;
  }>,
): AppliedResourceInvalidation {
  const exit = deps.runSyncExit(deps.resourceStore.invalidate(args.target));
  const targetId = transactionReceiptIdForInvalidationTarget(args.target);
  const refs = transactionRefsForInvalidationTarget(deps.knownResourceRefs(), args.target);
  const nextResources = deps.syncResourceSnapshots(args.currentResources, refs);
  const issue = issueFromExit("resource", targetId, exit, {
    correlationId: args.correlationId,
    parentState: args.current.value,
    receipts: args.current.receipts,
  });
  const nextIssues =
    issue === undefined
      ? clearIssue(args.currentIssues, "resource", targetId)
      : replaceIssue(args.currentIssues, issue);

  if (!Exit.isSuccess(exit)) {
    return Object.freeze({
      resources: nextResources,
      issues: nextIssues,
      receipts: [],
    });
  }

  return Object.freeze({
    resources: nextResources,
    issues: nextIssues,
    receipts: [
      resourceInvalidationSummaryReceipt(
        targetId,
        exit.value,
        args.current.value,
        args.reason,
        args.correlationId,
      ),
      ...resourceFreshnessReceiptsForRefs(
        refs,
        args.current.resources,
        nextResources,
        args.current.value,
        `invalidate:${args.reason}`,
        args.correlationId,
      ),
    ],
  });
}

export function invalidateTransactionTargets<Machine extends FlowMachine>(
  deps: Pick<
    TransactionControllerDeps<Machine>,
    | "currentIssues"
    | "replaceIssues"
    | "runSyncExit"
    | "resourceStore"
    | "syncResourceSnapshots"
    | "knownResourceRefs"
  >,
  current: SnapshotForMachine<Machine>,
  definition: UnknownFlowTransactionDefinition,
  params: unknown,
  correlationId: string | undefined,
): SnapshotForMachine<Machine> {
  const targets = resolveTransactionInvalidationTargets(definition, params);
  if (targets.length === 0) {
    return current;
  }

  let nextResources = current.resources;
  const nextReceipts = [...current.receipts];
  let nextIssues = deps.currentIssues();

  for (const target of targets) {
    const invalidation = applyResourceInvalidationTarget(deps, {
      current,
      currentResources: nextResources,
      currentIssues: nextIssues,
      target,
      reason: "transaction",
      correlationId,
    });
    nextResources = invalidation.resources;
    nextIssues = invalidation.issues;
    nextReceipts.push(...invalidation.receipts);
  }

  deps.replaceIssues(nextIssues);

  return Object.freeze({
    ...current,
    resources: nextResources,
    receipts: nextReceipts,
  });
}
