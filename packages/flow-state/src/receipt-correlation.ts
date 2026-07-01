import type { FlowReceipt } from "./core/api/types.js";

export function receiptWithCorrelation(
  receipt: FlowReceipt,
  correlationId: string | undefined,
): FlowReceipt {
  if (correlationId === undefined || typeof receipt.correlationId === "string") {
    return receipt;
  }

  return Object.freeze({
    ...receipt,
    correlationId,
  }) satisfies FlowReceipt;
}
