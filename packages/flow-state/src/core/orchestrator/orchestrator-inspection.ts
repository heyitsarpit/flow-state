import {
  type FlowInspectionEventInput,
  type FlowInspectionOwner,
  withInspectionOwnership,
} from "../inspection/inspection-events.js";
import { annotateNewMachineEventReceipts } from "../inspection/inspection-receipts.js";
import { pruneReceiptHistory } from "../inspection/receipt-retention.js";
import type {
  AnyFlowMachine,
  FlowReceipt,
  FlowSnapshot,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../api/types.js";
import { receiptWithCorrelation } from "../inspection/receipt-correlation.js";
import { appendNewReceipts, toActorSnapshotTree } from "./orchestrator-helpers.js";

type SnapshotForMachine<Machine extends AnyFlowMachine> = FlowSnapshot<
  InferMachineContext<Machine>,
  InferMachineState<Machine>,
  InferMachineEvent<Machine>
>;

type OrchestratorInspectionControllerDeps<Machine extends AnyFlowMachine> = Readonly<{
  readonly actorId: string;
  readonly inspectionOwner: FlowInspectionOwner;
  readonly currentSnapshot: () => SnapshotForMachine<Machine>;
  readonly replaceCurrentSnapshot: (nextSnapshot: SnapshotForMachine<Machine>) => void;
  readonly notifyListeners: () => void;
  readonly appendTrace: ((receipt: FlowReceipt) => void) | undefined;
  readonly appendInspection: ((event: FlowInspectionEventInput) => void) | undefined;
}>;

export function createOrchestratorInspectionController<Machine extends AnyFlowMachine>(
  deps: OrchestratorInspectionControllerDeps<Machine>,
) {
  let nextInspectionCorrelationId = 0;
  let activeInspectionCorrelationId: string | undefined;
  const appendInspection = deps.appendInspection;

  const appendInspectionReceipt =
    appendInspection === undefined
      ? undefined
      : (receipt: FlowReceipt) => {
          appendInspection(withInspectionOwnership(deps.inspectionOwner, receipt));
        };

  const withInspectionCorrelation = <Value>(
    correlationId: string | undefined,
    work: () => Value,
  ): Value => {
    const previous = activeInspectionCorrelationId;
    activeInspectionCorrelationId = correlationId;
    try {
      return work();
    } finally {
      activeInspectionCorrelationId = previous;
    }
  };

  const replaceSnapshot = (
    nextSnapshot: SnapshotForMachine<Machine>,
    notifyListenersAfter = false,
  ) => {
    const previousSnapshot = deps.currentSnapshot();
    const retainedSnapshot = pruneReceiptHistory(nextSnapshot);
    deps.replaceCurrentSnapshot(retainedSnapshot);
    appendNewReceipts(previousSnapshot.receipts, nextSnapshot.receipts, deps.appendTrace);
    appendNewReceipts(previousSnapshot.receipts, nextSnapshot.receipts, appendInspectionReceipt);
    if (appendInspection !== undefined && retainedSnapshot !== previousSnapshot) {
      let latestEvent: FlowReceipt | undefined;
      let latestCorrelatedReceipt: FlowReceipt | undefined;
      for (let index = nextSnapshot.receipts.length - 1; index >= 0; index -= 1) {
        const receipt = nextSnapshot.receipts[index];
        if (latestCorrelatedReceipt === undefined && typeof receipt?.correlationId === "string") {
          latestCorrelatedReceipt = receipt;
        }
        if (receipt?.type === "machine:event") {
          latestEvent = receipt;
          break;
        }
      }

      appendInspection(
        withInspectionOwnership(deps.inspectionOwner, {
          type: "actor:snapshot",
          id: deps.actorId,
          snapshot: toActorSnapshotTree(retainedSnapshot),
          ...(typeof latestEvent?.eventType === "string"
            ? { eventType: latestEvent.eventType }
            : {}),
          ...(typeof latestEvent?.sourceActorId === "string"
            ? { sourceActorId: latestEvent.sourceActorId }
            : {}),
          ...(typeof latestEvent?.targetActorId === "string"
            ? { targetActorId: latestEvent.targetActorId }
            : {}),
          ...(typeof latestCorrelatedReceipt?.correlationId === "string"
            ? { correlationId: latestCorrelatedReceipt.correlationId }
            : {}),
        }),
      );
    }
    if (notifyListenersAfter) {
      deps.notifyListeners();
    }
  };

  const appendReceipt = (receipt: FlowReceipt, notifyListenersAfter = false) => {
    const currentSnapshot = deps.currentSnapshot();
    replaceSnapshot(
      Object.freeze({
        ...currentSnapshot,
        receipts: [
          ...currentSnapshot.receipts,
          receiptWithCorrelation(receipt, activeInspectionCorrelationId),
        ],
      }),
      notifyListenersAfter,
    );
  };

  const appendRestoreFacts = (
    current: SnapshotForMachine<Machine>,
    correlationId: string,
  ): SnapshotForMachine<Machine> => {
    const nextReceipts = [
      ...current.receipts,
      receiptWithCorrelation(
        {
          type: "actor:restore",
          id: deps.actorId,
          state: current.value,
        },
        correlationId,
      ),
    ];

    for (const [resourceId, resource] of Object.entries(current.resources)) {
      nextReceipts.push(
        receiptWithCorrelation(
          {
            type: "resource:hydrate",
            id: resourceId,
            parentState: current.value,
            status: resource.status,
            availability: resource.availability,
            activity: resource.activity,
            freshness: resource.freshness,
            ...(resource.updatedAt === undefined ? {} : { updatedAt: resource.updatedAt }),
            ...(resource.invalidatedAt === undefined
              ? {}
              : { invalidatedAt: resource.invalidatedAt }),
          },
          correlationId,
        ),
      );
    }

    return Object.freeze({
      ...current,
      receipts: nextReceipts,
    }) as SnapshotForMachine<Machine>;
  };

  const annotateMachineEventReceipts = (
    previousReceiptCount: number,
    nextSnapshot: SnapshotForMachine<Machine>,
    correlationId: string,
    sourceActorId?: string,
  ): SnapshotForMachine<Machine> =>
    annotateNewMachineEventReceipts(nextSnapshot, previousReceiptCount, {
      ...(sourceActorId === undefined ? {} : { sourceActorId }),
      targetActorId: deps.actorId,
      correlationId,
    }) as SnapshotForMachine<Machine>;

  const createCorrelationId = (kind: "event" | "restore") =>
    `${deps.actorId}:${kind}:${++nextInspectionCorrelationId}`;

  return {
    currentCorrelationId: () => activeInspectionCorrelationId,
    withInspectionCorrelation,
    replaceSnapshot,
    appendReceipt,
    appendRestoreFacts,
    annotateMachineEventReceipts,
    createCorrelationId,
  };
}
