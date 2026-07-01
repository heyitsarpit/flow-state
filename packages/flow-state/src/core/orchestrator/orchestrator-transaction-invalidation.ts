import { Exit } from "effect";

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
  SnapshotForMachine,
  TransactionControllerDeps,
  UnknownFlowTransactionDefinition,
} from "./orchestrator-transaction-types.js";

export function invalidateTransactionTargets<Machine extends import("../api/types.js").FlowMachine>(
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
    const exit = deps.runSyncExit(deps.resourceStore.invalidate(target));
    const targetId = transactionReceiptIdForInvalidationTarget(target);
    const refs = transactionRefsForInvalidationTarget(deps.knownResourceRefs(), target);
    nextResources = deps.syncResourceSnapshots(nextResources, refs);

    const issue = issueFromExit("resource", targetId, exit, {
      correlationId,
      parentState: current.value,
      receipts: current.receipts,
    });
    nextIssues =
      issue === undefined
        ? clearIssue(nextIssues, "resource", targetId)
        : replaceIssue(nextIssues, issue);

    if (Exit.isSuccess(exit)) {
      nextReceipts.push(
        resourceInvalidationSummaryReceipt(
          targetId,
          exit.value,
          current.value,
          "transaction",
          correlationId,
        ),
      );
      nextReceipts.push(
        ...resourceFreshnessReceiptsForRefs(
          refs,
          current.resources,
          nextResources,
          current.value,
          "invalidate:transaction",
          correlationId,
        ),
      );
    }
  }

  deps.replaceIssues(nextIssues);

  return Object.freeze({
    ...current,
    resources: nextResources,
    receipts: nextReceipts,
  });
}
