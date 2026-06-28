import type { FlowEvent, FlowReceipt, FlowSnapshot } from "./public/types.js";

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
    if (index < previousReceiptCount || receipt.type !== "machine:event") {
      return receipt;
    }

    changed = true;
    return Object.freeze({
      ...receipt,
      ...(metadata.sourceActorId === undefined ? {} : { sourceActorId: metadata.sourceActorId }),
      targetActorId: metadata.targetActorId,
      correlationId: metadata.correlationId,
    }) satisfies FlowReceipt;
  });

  if (!changed) {
    return snapshot;
  }

  return Object.freeze({
    ...snapshot,
    receipts: Object.freeze(receipts),
  });
}
