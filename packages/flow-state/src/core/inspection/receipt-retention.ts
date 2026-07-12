import type { FlowReceipt } from "../api/types.js";

export const defaultEvidenceReceiptHistoryLimit = 256;

export type FlowReceiptHistory = Readonly<{
  readonly receipts: ReadonlyArray<FlowReceipt>;
  readonly truncatedBeforeReceiptCount?: number;
}>;

export function totalReceiptHistoryCount(history: FlowReceiptHistory): number {
  return (history.truncatedBeforeReceiptCount ?? 0) + history.receipts.length;
}

export function pruneReceiptHistory<History extends FlowReceiptHistory>(
  history: History,
  maxEntries = defaultEvidenceReceiptHistoryLimit,
): History {
  const retained =
    history.receipts.length > maxEntries ? history.receipts.slice(-maxEntries) : history.receipts;
  const truncatedBeforeReceiptCount =
    (history.truncatedBeforeReceiptCount ?? 0) + (history.receipts.length - retained.length);

  if (
    retained === history.receipts &&
    truncatedBeforeReceiptCount === (history.truncatedBeforeReceiptCount ?? 0)
  ) {
    return history;
  }

  return Object.freeze({
    ...history,
    receipts: retained === history.receipts ? history.receipts : Object.freeze(retained),
    ...(truncatedBeforeReceiptCount <= 0 ? {} : { truncatedBeforeReceiptCount }),
  }) as History;
}
