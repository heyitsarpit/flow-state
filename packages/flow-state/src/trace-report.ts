import type {
  FlowReceipt,
  FlowTraceBuckets,
  FlowTraceCorrelation,
  FlowTraceLanes,
  FlowTraceReport,
} from "./public/types.js";

function receiptGroup(receipt: FlowReceipt): keyof FlowTraceBuckets {
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

function createBuckets(receipts: ReadonlyArray<FlowReceipt>): Readonly<{
  readonly buckets: { readonly [Key in keyof FlowTraceBuckets]: Array<FlowReceipt> };
  readonly lanes: { readonly [Key in keyof FlowTraceLanes]: Array<FlowReceipt> };
}> {
  const buckets = {
    events: [] as Array<FlowReceipt>,
    transitions: [] as Array<FlowReceipt>,
    resources: [] as Array<FlowReceipt>,
    transactions: [] as Array<FlowReceipt>,
    streams: [] as Array<FlowReceipt>,
    children: [] as Array<FlowReceipt>,
    timers: [] as Array<FlowReceipt>,
    actors: [] as Array<FlowReceipt>,
    other: [] as Array<FlowReceipt>,
  };
  const lanes = {
    success: [] as Array<FlowReceipt>,
    failure: [] as Array<FlowReceipt>,
    defect: [] as Array<FlowReceipt>,
    interrupt: [] as Array<FlowReceipt>,
  };

  for (const receipt of receipts) {
    buckets[receiptGroup(receipt)].push(receipt);
    const lane = receiptLane(receipt);
    if (lane !== undefined) {
      lanes[lane].push(receipt);
    }
  }

  return {
    buckets,
    lanes,
  };
}

function freezeBuckets(buckets: {
  readonly [Key in keyof FlowTraceBuckets]: Array<FlowReceipt>;
}): FlowTraceBuckets {
  return Object.freeze({
    events: Object.freeze(buckets.events),
    transitions: Object.freeze(buckets.transitions),
    resources: Object.freeze(buckets.resources),
    transactions: Object.freeze(buckets.transactions),
    streams: Object.freeze(buckets.streams),
    children: Object.freeze(buckets.children),
    timers: Object.freeze(buckets.timers),
    actors: Object.freeze(buckets.actors),
    other: Object.freeze(buckets.other),
  });
}

function freezeLanes(lanes: {
  readonly [Key in keyof FlowTraceLanes]: Array<FlowReceipt>;
}): FlowTraceLanes {
  return Object.freeze({
    success: Object.freeze(lanes.success),
    failure: Object.freeze(lanes.failure),
    defect: Object.freeze(lanes.defect),
    interrupt: Object.freeze(lanes.interrupt),
  });
}

function correlationReports(
  receipts: ReadonlyArray<FlowReceipt>,
): ReadonlyArray<FlowTraceCorrelation> {
  const correlations = new Map<string, Array<FlowReceipt>>();

  for (const receipt of receipts) {
    if (typeof receipt.correlationId !== "string") {
      continue;
    }

    const grouped = correlations.get(receipt.correlationId) ?? [];
    grouped.push(receipt);
    correlations.set(receipt.correlationId, grouped);
  }

  return Object.freeze(
    Array.from(correlations.entries())
      .map(([correlationId, groupedReceipts]) => {
        const event =
          groupedReceipts.find((receipt) => receipt.type === "machine:event") ?? groupedReceipts[0];
        if (event === undefined) {
          return undefined;
        }

        const { buckets, lanes } = createBuckets(groupedReceipts);
        return Object.freeze({
          correlationId,
          event,
          receipts: Object.freeze([...groupedReceipts]),
          ...freezeBuckets(buckets),
          lanes: freezeLanes(lanes),
          ...(typeof event.sourceActorId === "string"
            ? { sourceActorId: event.sourceActorId }
            : {}),
          ...(typeof event.targetActorId === "string"
            ? { targetActorId: event.targetActorId }
            : {}),
        }) satisfies FlowTraceCorrelation;
      })
      .filter((correlation): correlation is FlowTraceCorrelation => correlation !== undefined),
  );
}

export function createTraceReport(receipts: ReadonlyArray<FlowReceipt>): FlowTraceReport {
  const { buckets, lanes } = createBuckets(receipts);
  return Object.freeze({
    ...freezeBuckets(buckets),
    lanes: freezeLanes(lanes),
    correlations: correlationReports(receipts),
  });
}
