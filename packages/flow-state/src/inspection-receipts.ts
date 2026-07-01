import type { FlowEvent, FlowReceipt, FlowSnapshot } from "./core/api/types.js";
import { receiptWithCorrelation } from "./receipt-correlation.js";

export type FlowInspectionEventMetadata = Readonly<{
  readonly sourceActorId?: string;
  readonly targetActorId: string;
  readonly correlationId: string;
}>;

export function annotateNewMachineEventReceipts<
  Context,
  Event extends FlowEvent,
  State extends string,
>(
  snapshot: FlowSnapshot<Context, State, Event>,
  previousReceiptCount: number,
  metadata: FlowInspectionEventMetadata,
): FlowSnapshot<Context, State, Event> {
  let changed = false;
  const receipts = snapshot.receipts.map((receipt, index) => {
    if (index < previousReceiptCount) {
      return receipt;
    }

    const correlated = receiptWithCorrelation(receipt, metadata.correlationId);
    if (correlated.type !== "machine:event") {
      if (correlated !== receipt) {
        changed = true;
      }
      return correlated;
    }

    const annotated = Object.freeze({
      ...correlated,
      ...(metadata.sourceActorId === undefined ? {} : { sourceActorId: metadata.sourceActorId }),
      targetActorId: metadata.targetActorId,
    }) satisfies FlowReceipt;
    changed = true;
    return annotated;
  });

  if (!changed) {
    return snapshot;
  }

  return Object.freeze({
    ...snapshot,
    receipts: Object.freeze(receipts),
  });
}
