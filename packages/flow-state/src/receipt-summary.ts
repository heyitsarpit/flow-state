import type { FlowIssueFacts, FlowReceipt, FlowReceiptFacts } from "./public/data-types.js";

const defaultIssueReceiptLimit = 8;

function uniqueStrings(values: ReadonlyArray<string>): ReadonlyArray<string> {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    ordered.push(value);
  }

  return Object.freeze(ordered);
}

function receiptIds(receipts: ReadonlyArray<FlowReceipt>): ReadonlyArray<string> {
  return uniqueStrings(
    receipts.flatMap((receipt) => (typeof receipt.id === "string" ? [receipt.id] : [])),
  );
}

export function summarizeReceipts(
  receipts: ReadonlyArray<FlowReceipt>,
  options?: Readonly<{
    readonly limit?: number | undefined;
    readonly seedIds?: ReadonlyArray<string> | undefined;
  }>,
): FlowReceiptFacts {
  const limitedReceipts =
    options?.limit === undefined ? receipts : receipts.slice(-Math.max(options.limit, 0));

  return Object.freeze({
    receiptTypes: Object.freeze(limitedReceipts.map((receipt) => receipt.type)),
    relatedIds: uniqueStrings([...(options?.seedIds ?? []), ...receiptIds(limitedReceipts)]),
  });
}

export function issueFactsFromReceipts(
  issueId: string,
  options?: Readonly<{
    readonly correlationId?: string | undefined;
    readonly parentState?: string | undefined;
    readonly receipts?: ReadonlyArray<FlowReceipt> | undefined;
    readonly relatedIds?: ReadonlyArray<string> | undefined;
    readonly limit?: number | undefined;
  }>,
): FlowIssueFacts {
  const seedIds = uniqueStrings([issueId, ...(options?.relatedIds ?? [])]);
  const receipts = options?.receipts ?? [];
  const correlatedReceipts =
    typeof options?.correlationId === "string"
      ? receipts.filter((receipt) => receipt.correlationId === options.correlationId)
      : [];
  const idReceipts = receipts.filter(
    (receipt) => typeof receipt.id === "string" && seedIds.includes(receipt.id),
  );
  const relevantReceipts =
    correlatedReceipts.length > 0
      ? correlatedReceipts
      : idReceipts.length > 0
        ? idReceipts
        : receipts;
  const summary = summarizeReceipts(relevantReceipts, {
    limit: options?.limit ?? defaultIssueReceiptLimit,
    seedIds,
  });

  return Object.freeze({
    ...summary,
    ...(typeof options?.correlationId === "string" ? { correlationId: options.correlationId } : {}),
    ...(options?.parentState === undefined ? {} : { parentState: options.parentState }),
  });
}
