import type { FlowReceipt, FlowTraceReport } from "./public/types.js";

function receiptGroup(receipt: FlowReceipt): keyof Omit<FlowTraceReport, "lanes"> {
  if (receipt.type === "machine:event") {
    return "events";
  }

  if (receipt.type.startsWith("machine:")) {
    return "transitions";
  }

  if (receipt.type.startsWith("query:") || receipt.type.startsWith("resource:")) {
    return "resources";
  }

  if (receipt.type.startsWith("transaction:")) {
    return "transactions";
  }

  if (receipt.type.startsWith("stream:")) {
    return "streams";
  }

  if (receipt.type.startsWith("child:")) {
    return "children";
  }

  if (receipt.type.startsWith("timer:")) {
    return "timers";
  }

  if (receipt.type.startsWith("actor:")) {
    return "actors";
  }

  return "other";
}

function receiptLane(receipt: FlowReceipt): keyof FlowTraceReport["lanes"] | undefined {
  if (receipt.type.endsWith(":failure")) {
    return "failure";
  }

  if (receipt.type.endsWith(":defect")) {
    return "defect";
  }

  if (receipt.type.endsWith(":interrupt")) {
    return "interrupt";
  }

  if (receipt.type.endsWith(":success") || receipt.type === "stream:done") {
    return "success";
  }

  return undefined;
}

export function createTraceReport(receipts: ReadonlyArray<FlowReceipt>): FlowTraceReport {
  const report = {
    events: [] as Array<FlowReceipt>,
    transitions: [] as Array<FlowReceipt>,
    resources: [] as Array<FlowReceipt>,
    transactions: [] as Array<FlowReceipt>,
    streams: [] as Array<FlowReceipt>,
    children: [] as Array<FlowReceipt>,
    timers: [] as Array<FlowReceipt>,
    actors: [] as Array<FlowReceipt>,
    other: [] as Array<FlowReceipt>,
    lanes: {
      success: [] as Array<FlowReceipt>,
      failure: [] as Array<FlowReceipt>,
      defect: [] as Array<FlowReceipt>,
      interrupt: [] as Array<FlowReceipt>,
    },
  };

  for (const receipt of receipts) {
    report[receiptGroup(receipt)].push(receipt);
    const lane = receiptLane(receipt);
    if (lane !== undefined) {
      report.lanes[lane].push(receipt);
    }
  }

  return Object.freeze({
    ...report,
    events: Object.freeze(report.events),
    transitions: Object.freeze(report.transitions),
    resources: Object.freeze(report.resources),
    transactions: Object.freeze(report.transactions),
    streams: Object.freeze(report.streams),
    children: Object.freeze(report.children),
    timers: Object.freeze(report.timers),
    actors: Object.freeze(report.actors),
    other: Object.freeze(report.other),
    lanes: Object.freeze({
      success: Object.freeze(report.lanes.success),
      failure: Object.freeze(report.lanes.failure),
      defect: Object.freeze(report.lanes.defect),
      interrupt: Object.freeze(report.lanes.interrupt),
    }),
  });
}
