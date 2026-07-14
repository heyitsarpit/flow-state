import { Effect, Exit } from "effect";

import { receiptWithCorrelation } from "../inspection/receipt-correlation.js";
import {
  transactionPreviewReceiptFacts,
  transactionRollbackReceiptFacts,
} from "./transaction-inspection-facts.js";
import { resolveTransactionPreviewPatches } from "../transactions/transaction-callbacks.js";
import { clearIssue, issueFromExit, replaceIssue } from "./orchestrator-issues.js";
import {
  applyPreviewPatchSnapshot,
  replayPreviewOverlay,
} from "./orchestrator-transaction-preview-overlays.js";
import type {
  PreviewOverlay,
  PreviewOverlayLayer,
  SnapshotForMachine,
  TransactionControllerDeps,
  UnknownFlowTransactionDefinition,
} from "./orchestrator-transaction-types.js";

export function createTransactionPreviewController<
  Machine extends import("../api/types.js").FlowMachine,
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
    readonly previewFailure: Exit.Failure<unknown, unknown> | undefined;
  }> => {
    const previewPatches = resolveTransactionPreviewPatches(definition, params);
    if (previewPatches.length === 0) {
      return {
        snapshot: current,
        previewLayers: [],
        previewFailure: undefined,
      };
    }

    const updatedAt = deps.now();
    let stagedNextPreviewLayerOrder = nextPreviewLayerOrder;
    const stagedOverlays = new Map<string, PreviewOverlay>();
    const stagedSnapshots = new Map<string, import("../api/types.js").FlowResourceSnapshot>();
    const touchedRefs = new Map<string, import("../api/types.js").FlowResourceRef>();
    const previewLayers: Array<PreviewOverlayLayer> = [];
    const stageExit = deps.runSyncExit(
      Effect.sync(() => {
        for (const previewPatch of previewPatches) {
          const refKey = deps.resourceStore.resourceKeyOf(previewPatch.ref);
          const previousSnapshot =
            stagedSnapshots.get(refKey) ?? deps.currentResourceSnapshot(previewPatch.ref);
          const overlay = stagedOverlays.get(refKey) ?? previewOverlays.get(refKey);
          const previewLayer = Object.freeze({
            ref: previewPatch.ref,
            patch: previewPatch,
            order: stagedNextPreviewLayerOrder,
            state: "active" as const,
          });
          stagedNextPreviewLayerOrder += 1;
          stagedOverlays.set(
            refKey,
            Object.freeze({
              rootSnapshot: overlay?.rootSnapshot ?? previousSnapshot,
              layers: [...(overlay?.layers ?? []), previewLayer],
            }),
          );
          touchedRefs.set(refKey, previewPatch.ref);
          stagedSnapshots.set(
            refKey,
            applyPreviewPatchSnapshot(previewPatch.ref, previousSnapshot, previewPatch, updatedAt),
          );
          previewLayers.push(previewLayer);
        }
      }),
    );
    if (Exit.isFailure(stageExit)) {
      return {
        snapshot: current,
        previewLayers: [],
        previewFailure: stageExit,
      };
    }

    const hydrateExit = deps.runSyncExit(
      deps.resourceStore.hydrate(
        Array.from(touchedRefs.entries()).map(([refKey, ref]) => ({
          ref,
          snapshot: stagedSnapshots.get(refKey)!,
        })),
      ),
    );
    if (Exit.isFailure(hydrateExit)) {
      return {
        snapshot: current,
        previewLayers: [],
        previewFailure: hydrateExit,
      };
    }

    nextPreviewLayerOrder = stagedNextPreviewLayerOrder;
    for (const [refKey, overlay] of stagedOverlays.entries()) {
      if (touchedRefs.has(refKey)) {
        previewOverlays.set(refKey, overlay);
      }
    }

    const touchedRefsList = Array.from(touchedRefs.values());
    const nextResources = deps.syncResourceSnapshots(current.resources, touchedRefsList);
    let nextIssues = deps.currentIssues();
    for (const ref of touchedRefsList) {
      nextIssues = clearIssue(nextIssues, "resource", ref.id);
    }
    deps.replaceIssues(nextIssues);

    const nextReceipts = [
      ...current.receipts,
      ...previewLayers.map((previewLayer, index) =>
        receiptWithCorrelation(
          {
            type: "transaction:preview-patch",
            id: definition.id,
            ...transactionPreviewReceiptFacts(attempt.generation, attempt.queueKey, [
              previewLayer,
            ])[0],
            previewIndex: index + 1,
            previewCount: previewPatches.length,
            parentState: current.value,
          },
          correlationId,
        ),
      ),
    ];

    return {
      snapshot: Object.freeze({
        ...current,
        resources: nextResources,
        receipts: nextReceipts,
      }),
      previewLayers,
      previewFailure: undefined,
    };
  };

  const commit = (previewLayers: ReadonlyArray<PreviewOverlayLayer>) => {
    if (previewLayers.length === 0) {
      return;
    }

    const targetOrders = new Set(previewLayers.map((layer) => layer.order));
    const touchedRefKeys = new Set(
      previewLayers.map((layer) => deps.resourceStore.resourceKeyOf(layer.ref)),
    );

    for (const refKey of touchedRefKeys) {
      const overlay = previewOverlays.get(refKey);
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
        previewOverlays.delete(refKey);
        continue;
      }

      previewOverlays.set(
        refKey,
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
    const touchedRefs = new Map(
      previewLayers.map((layer) => [deps.resourceStore.resourceKeyOf(layer.ref), layer.ref]),
    );

    for (const [refKey, ref] of touchedRefs) {
      const overlay = previewOverlays.get(refKey);
      if (overlay === undefined) {
        continue;
      }

      const remainingLayers = overlay.layers.filter((layer) => !removedOrders.has(layer.order));
      if (remainingLayers.length === 0) {
        previewOverlays.delete(refKey);
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

        const issue = issueFromExit("resource", ref.id, exit, {
          correlationId,
          parentState: current.value,
          receipts: nextReceipts,
        });
        nextIssues =
          issue === undefined
            ? clearIssue(nextIssues, "resource", ref.id)
            : replaceIssue(nextIssues, issue);
        continue;
      }

      previewOverlays.set(
        refKey,
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

      const issue = issueFromExit("resource", ref.id, exit, {
        correlationId,
        parentState: current.value,
        receipts: nextReceipts,
      });
      nextIssues =
        issue === undefined
          ? clearIssue(nextIssues, "resource", ref.id)
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
