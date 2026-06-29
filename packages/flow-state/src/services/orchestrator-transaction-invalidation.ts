import { Exit } from "effect";

import { resolveTransactionInvalidationTargets } from "../transaction-callbacks.js";
import {
  transactionReceiptIdForInvalidationTarget,
  transactionRefsForInvalidationTarget,
} from "../transaction-invalidation.js";
import { receiptWithCorrelation } from "../receipt-correlation.js";
import { clearIssue, issueFromExit, replaceIssue } from "./orchestrator-issues.js";
import type {
  SnapshotForMachine,
  TransactionControllerDeps,
  UnknownFlowTransactionDefinition,
} from "./orchestrator-transaction-types.js";

export function invalidateTransactionTargets<
  Machine extends import("../public/types.js").FlowMachine,
>(
  deps: TransactionControllerDeps<Machine>,
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
    nextResources = deps.syncResourceSnapshots(
      nextResources,
      transactionRefsForInvalidationTarget(deps.knownResourceRefs(), target),
    );

    const issue = issueFromExit("resource", targetId, exit);
    nextIssues =
      issue === undefined
        ? clearIssue(nextIssues, "resource", targetId)
        : replaceIssue(nextIssues, issue);

    if (Exit.isSuccess(exit)) {
      nextReceipts.push(
        receiptWithCorrelation(
          {
            type: "resource:invalidate",
            id: targetId,
            count: exit.value,
            parentState: current.value,
          },
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
