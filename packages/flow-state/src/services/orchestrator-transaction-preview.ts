import { Exit } from "effect";

import { receiptWithCorrelation } from "../core/inspection/receipt-correlation.js";
import { applyResourcePatch } from "../store/resource-patch.js";
import {
  transactionPreviewReceiptFacts,
  transactionRollbackReceiptFacts,
} from "../transaction-inspection-facts.js";
import { resolveTransactionPreviewPatches } from "../core/transactions/transaction-callbacks.js";
import { clearIssue, issueFromExit, replaceIssue } from "./orchestrator-issues.js";
import type {
  PreviewOverlay,
  PreviewOverlayLayer,
  SnapshotForMachine,
  TransactionControllerDeps,
  UnknownFlowTransactionDefinition,
} from "./orchestrator-transaction-types.js";

function applyPreviewPatchSnapshot(
  ref: import("../core/api/types.js").FlowResourceRef,
  baseSnapshot: import("../core/api/types.js").FlowResourceSnapshot | undefined,
  patch: import("../core/api/types.js").FlowPreviewPatch,
  updatedAt: number,
): import("../core/api/types.js").FlowResourceSnapshot {
  const previousValue = baseSnapshot?.value;
  const nextValue =
    "replace" in patch ? patch.replace : applyResourcePatch(previousValue, patch.patch);
  return Object.freeze({
    id: ref.id,
    status: "success" as const,
    availability: "value" as const,
    activity: "idle" as const,
    freshness: "fresh" as const,
    value: nextValue,
    ...(previousValue === undefined ? {} : { previousValue }),
    updatedAt,
    isPlaceholderData: false,
  });
}

function replayPreviewOverlay(
  rootSnapshot: import("../core/api/types.js").FlowResourceSnapshot | undefined,
  layers: ReadonlyArray<PreviewOverlayLayer>,
  updatedAt: number,
): import("../core/api/types.js").FlowResourceSnapshot | undefined {
  let nextSnapshot = rootSnapshot;
  for (const layer of layers) {
    nextSnapshot = applyPreviewPatchSnapshot(layer.ref, nextSnapshot, layer.patch, updatedAt);
  }
  return nextSnapshot;
}

export function createTransactionPreviewController<
  Machine extends import("../core/api/types.js").FlowMachine,
>(deps: TransactionControllerDeps<Machine>) {
  const previewOverlays = new Map<string, PreviewOverlay>();
  let nextPreviewLayerOrder = 0;

  const apply = (
    current: SnapshotForMachine<Machine>,
    definition: UnknownFlowTransactionDefinition,
    params: unknown,
    correlationId: string | undefined,
    attempt: Readonly<{
      readonly generation: number;
      readonly queueKey: string;
    }>,
  ): Readonly<{
    readonly snapshot: SnapshotForMachine<Machine>;
    readonly previewLayers: ReadonlyArray<PreviewOverlayLayer>;
  }> => {
    const previewPatches = resolveTransactionPreviewPatches(definition, params);
    if (previewPatches.length === 0) {
      return {
        snapshot: current,
        previewLayers: [],
      };
    }

    let nextResources = current.resources;
    const nextReceipts = [...current.receipts];
    let nextIssues = deps.currentIssues();
    const previewLayers: Array<PreviewOverlayLayer> = [];

    for (const [index, previewPatch] of previewPatches.entries()) {
      const previousSnapshot = deps.currentResourceSnapshot(previewPatch.ref);
      const overlay = previewOverlays.get(previewPatch.ref.id);
      const previewLayer = Object.freeze({
        ref: previewPatch.ref,
        patch: previewPatch,
        order: nextPreviewLayerOrder,
        state: "active" as const,
      });
      nextPreviewLayerOrder += 1;
      previewOverlays.set(
        previewPatch.ref.id,
        Object.freeze({
          rootSnapshot: overlay?.rootSnapshot ?? previousSnapshot,
          layers: [...(overlay?.layers ?? []), previewLayer],
        }),
      );
      previewLayers.push(previewLayer);

      const exit = deps.runSyncExit(
        deps.resourceStore.patch(previewPatch.ref, (currentValue) =>
          "replace" in previewPatch
            ? previewPatch.replace
            : applyResourcePatch(currentValue, previewPatch.patch),
        ),
      );
      nextResources = deps.syncResourceSnapshots(nextResources, [previewPatch.ref]);

      const issue = issueFromExit("resource", previewPatch.ref.id, exit, {
        correlationId,
        parentState: current.value,
        receipts: current.receipts,
      });
      nextIssues =
        issue === undefined
          ? clearIssue(nextIssues, "resource", previewPatch.ref.id)
          : replaceIssue(nextIssues, issue);

      if (Exit.isSuccess(exit)) {
        const receiptFacts = transactionPreviewReceiptFacts(attempt.generation, attempt.queueKey, [
          previewLayer,
        ])[0];
        nextReceipts.push(
          receiptWithCorrelation(
            {
              type: "transaction:preview-patch",
              id: definition.id,
              ...receiptFacts,
              previewIndex: index + 1,
              previewCount: previewPatches.length,
              parentState: current.value,
            },
            correlationId,
          ),
        );
      }
    }

    deps.replaceIssues(nextIssues);

    return {
      snapshot: Object.freeze({
        ...current,
        resources: nextResources,
        receipts: nextReceipts,
      }),
      previewLayers,
    };
  };

  const commit = (previewLayers: ReadonlyArray<PreviewOverlayLayer>) => {
    if (previewLayers.length === 0) {
      return;
    }

    const targetOrders = new Set(previewLayers.map((layer) => layer.order));
    const touchedRefIds = new Set(previewLayers.map((layer) => layer.ref.id));

    for (const refId of touchedRefIds) {
      const overlay = previewOverlays.get(refId);
      if (overlay === undefined) {
        continue;
      }

      const nextLayers = overlay.layers.map((layer) =>
        targetOrders.has(layer.order)
          ? Object.freeze({
              ...layer,
              state: "committed" as const,
            })
          : layer,
      );

      if (nextLayers.every((layer) => layer.state === "committed")) {
        previewOverlays.delete(refId);
        continue;
      }

      previewOverlays.set(
        refId,
        Object.freeze({
          rootSnapshot: overlay.rootSnapshot,
          layers: nextLayers,
        }),
      );
    }
  };

  const rollback = (
    current: SnapshotForMachine<Machine>,
    definition: UnknownFlowTransactionDefinition,
    previewLayers: ReadonlyArray<PreviewOverlayLayer>,
    correlationId: string | undefined,
    attempt: Readonly<{
      readonly generation: number;
      readonly queueKey: string;
    }>,
  ): SnapshotForMachine<Machine> => {
    if (previewLayers.length === 0) {
      return current;
    }

    let nextResources = current.resources;
    const nextReceipts = [
      ...current.receipts,
      ...transactionRollbackReceiptFacts(attempt.generation, attempt.queueKey, previewLayers).map(
        (receiptFacts) =>
          receiptWithCorrelation(
            {
              type: "transaction:rollback",
              id: definition.id,
              ...receiptFacts,
              parentState: current.value,
            },
            correlationId,
          ),
      ),
    ];
    let nextIssues = deps.currentIssues();
    const removedOrders = new Set(previewLayers.map((layer) => layer.order));
    const touchedRefIds = new Set(previewLayers.map((layer) => layer.ref.id));

    for (const refId of touchedRefIds) {
      const overlay = previewOverlays.get(refId);
      if (overlay === undefined) {
        continue;
      }

      const ref =
        Array.from(deps.knownResourceRefs()).find((resourceRef) => resourceRef.id === refId) ??
        previewLayers.find((layer) => layer.ref.id === refId)?.ref;
      if (ref === undefined) {
        continue;
      }

      const remainingLayers = overlay.layers.filter((layer) => !removedOrders.has(layer.order));
      if (remainingLayers.length === 0) {
        previewOverlays.delete(refId);
        const priorSnapshot = overlay.rootSnapshot;
        if (priorSnapshot?.updatedAt === undefined) {
          continue;
        }

        // Rollback must override the optimistic patch even when the root snapshot
        // was captured before the preview wrote a newer updatedAt into the store.
        const restoreSnapshot = {
          ...priorSnapshot,
          updatedAt: Math.max(
            priorSnapshot.updatedAt,
            deps.currentResourceSnapshot(ref)?.updatedAt ?? priorSnapshot.updatedAt,
          ),
        };
        const exit = deps.runSyncExit(
          deps.resourceStore.hydrate([
            {
              ref,
              snapshot: restoreSnapshot,
            },
          ]),
        );
        nextResources = deps.syncResourceSnapshots(nextResources, [ref]);

        const issue = issueFromExit("resource", refId, exit, {
          correlationId,
          parentState: current.value,
          receipts: nextReceipts,
        });
        nextIssues =
          issue === undefined
            ? clearIssue(nextIssues, "resource", refId)
            : replaceIssue(nextIssues, issue);
        continue;
      }

      previewOverlays.set(
        refId,
        Object.freeze({
          rootSnapshot: overlay.rootSnapshot,
          layers: remainingLayers,
        }),
      );

      const replayedSnapshot = replayPreviewOverlay(
        overlay.rootSnapshot,
        remainingLayers,
        deps.now(),
      );
      if (replayedSnapshot?.updatedAt === undefined) {
        continue;
      }

      const exit = deps.runSyncExit(
        deps.resourceStore.hydrate([
          {
            ref,
            snapshot: replayedSnapshot,
          },
        ]),
      );
      nextResources = deps.syncResourceSnapshots(nextResources, [ref]);

      const issue = issueFromExit("resource", refId, exit, {
        correlationId,
        parentState: current.value,
        receipts: nextReceipts,
      });
      nextIssues =
        issue === undefined
          ? clearIssue(nextIssues, "resource", refId)
          : replaceIssue(nextIssues, issue);
    }

    deps.replaceIssues(nextIssues);

    return Object.freeze({
      ...current,
      resources: nextResources,
      receipts: nextReceipts,
    });
  };

  return {
    apply,
    commit,
    rollback,
  } as const;
}
