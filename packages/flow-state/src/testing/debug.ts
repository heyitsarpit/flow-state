import type {
  FlowReceipt,
  FlowTestPendingWork,
  FlowTraceDescriptor,
  FlowTraceReport,
} from "../public/types.js";

function receiptLabel(receipt: FlowReceipt): string {
  const pieces = [receipt.type];

  if (typeof receipt.id === "string") {
    pieces.push(`[${receipt.id}]`);
  }
  if (typeof receipt.eventType === "string") {
    pieces.push(`event=${receipt.eventType}`);
  }
  if ("from" in receipt && typeof receipt.from === "string" && "to" in receipt) {
    pieces.push(`${receipt.from}->${String(receipt.to)}`);
  }
  if ("parentState" in receipt && typeof receipt.parentState === "string") {
    pieces.push(`state=${receipt.parentState}`);
  }

  return pieces.join(" ");
}

function traceReportOf(input: FlowTraceDescriptor<any, any> | FlowTraceReport): FlowTraceReport {
  return "kind" in input ? input.report : input;
}

function totalReceipts(report: FlowTraceReport): number {
  return (
    report.events.length +
    report.transitions.length +
    report.resources.length +
    report.transactions.length +
    report.streams.length +
    report.children.length +
    report.timers.length +
    report.actors.length +
    report.other.length
  );
}

export function formatPendingWorkPretty(pending: FlowTestPendingWork): string {
  const sections = [
    `ready=${pending.ready} activeFibers=${pending.activeFibers}`,
    `mailboxes: ${pending.mailboxes.length === 0 ? "(none)" : pending.mailboxes.map((entry) => `${entry.id}(${entry.pending})`).join(", ")}`,
    `timers: ${pending.timers.length === 0 ? "(none)" : pending.timers.map((entry) => `${entry.id}@${entry.dueAt}`).join(", ")}`,
    `streams: ${pending.streams.length === 0 ? "(none)" : pending.streams.join(", ")}`,
    `transactions: ${pending.transactions.length === 0 ? "(none)" : pending.transactions.join(", ")}`,
    `children: ${pending.children.length === 0 ? "(none)" : pending.children.map((child) => `${child.id}[${child.status}]`).join(", ")}`,
  ];

  if (pending.nextAfterMillis !== undefined) {
    sections.push(`nextAfterMillis=${pending.nextAfterMillis}`);
  }

  return sections.join("\n");
}

export function formatHarnessTracePretty(
  input: FlowTraceDescriptor<any, any> | FlowTraceReport,
): string {
  const report = traceReportOf(input);

  return [
    `receipts=${totalReceipts(report)} correlations=${report.correlations.length}`,
    `events: ${report.events.length === 0 ? "(none)" : report.events.map(receiptLabel).join(", ")}`,
    `transitions: ${report.transitions.length === 0 ? "(none)" : report.transitions.map(receiptLabel).join(", ")}`,
    `transactions: ${report.transactions.length === 0 ? "(none)" : report.transactions.map(receiptLabel).join(", ")}`,
    `streams: ${report.streams.length === 0 ? "(none)" : report.streams.map(receiptLabel).join(", ")}`,
    `timers: ${report.timers.length === 0 ? "(none)" : report.timers.map(receiptLabel).join(", ")}`,
    `lanes: success=${report.lanes.success.length} failure=${report.lanes.failure.length} defect=${report.lanes.defect.length} interrupt=${report.lanes.interrupt.length}`,
  ].join("\n");
}

export function formatTransactionEventsPretty(receipts: ReadonlyArray<FlowReceipt>): string {
  const transactionReceipts = receipts.filter((receipt) => receipt.type.startsWith("transaction:"));

  return transactionReceipts.length === 0
    ? "(no transaction receipts)"
    : transactionReceipts
        .map((receipt, index) => `${index + 1}. ${receiptLabel(receipt)}`)
        .join("\n");
}

export function formatScenarioTranscript(receipts: ReadonlyArray<FlowReceipt>): string {
  return receipts.length === 0
    ? "(no receipts)"
    : receipts.map((receipt, index) => `${index + 1}. ${receiptLabel(receipt)}`).join("\n");
}
