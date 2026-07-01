import type {
  FlowTraceCorrelation,
  FlowTraceDescriptor,
  FlowTraceIncidentBucketCounts,
  FlowTraceIncidentOutcomeCounts,
  FlowTraceIncidentStep,
  FlowTraceIncidentSummary,
  FlowTraceOutcome,
} from "../api/types.js";

function createOutcomeCounts(
  outcomes: ReadonlyArray<FlowTraceOutcome>,
): FlowTraceIncidentOutcomeCounts {
  const counts = {
    success: 0,
    failure: 0,
    defect: 0,
    interrupt: 0,
  };

  for (const outcome of outcomes) {
    counts[outcome.kind] += 1;
  }

  return Object.freeze(counts);
}

function createBucketCounts(report: FlowTraceDescriptor["report"]): FlowTraceIncidentBucketCounts {
  return Object.freeze({
    events: report.events.length,
    transitions: report.transitions.length,
    resources: report.resources.length,
    transactions: report.transactions.length,
    streams: report.streams.length,
    children: report.children.length,
    timers: report.timers.length,
    actors: report.actors.length,
    other: report.other.length,
  });
}

function uniqueStrings(values: ReadonlyArray<string>): ReadonlyArray<string> {
  const seen = new Set<string>();
  const ordered: Array<string> = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    ordered.push(value);
  }

  return Object.freeze(ordered);
}

function formatEventTypes(values: ReadonlyArray<string>): string {
  if (values.length === 0) {
    return "uncorrelated receipts";
  }

  if (values.length <= 3) {
    return values.join(", ");
  }

  return `${values.slice(0, 3).join(", ")} +${values.length - 3} more`;
}

function formatStateChange(correlation: FlowTraceCorrelation): string | undefined {
  if (correlation.stateBefore === undefined && correlation.stateAfter === undefined) {
    return undefined;
  }

  return `${correlation.stateBefore ?? "?"} -> ${correlation.stateAfter ?? "?"}`;
}

function correlationHeadline(correlation: FlowTraceCorrelation, issueCount: number): string {
  const eventLabel = correlation.summary.eventType ?? correlation.event.type;
  const stateChange = formatStateChange(correlation);
  const incidentSummary =
    issueCount > 0
      ? `${issueCount} issue(s)`
      : correlation.outcomes.length > 0
        ? `${correlation.outcomes.length} outcome(s)`
        : `${correlation.receipts.length} receipt(s)`;

  if (stateChange === undefined) {
    return `${eventLabel}: ${incidentSummary}`;
  }

  return `${eventLabel}: ${stateChange}; ${incidentSummary}`;
}

function createCorrelationStep(correlation: FlowTraceCorrelation): FlowTraceIncidentStep {
  const issueCount = correlation.issues.length;

  return Object.freeze({
    correlationId: correlation.correlationId,
    headline: correlationHeadline(correlation, issueCount),
    ...(correlation.summary.eventType === undefined
      ? {}
      : { eventType: correlation.summary.eventType }),
    ...(correlation.stateBefore === undefined ? {} : { stateBefore: correlation.stateBefore }),
    ...(correlation.stateAfter === undefined ? {} : { stateAfter: correlation.stateAfter }),
    receiptCount: correlation.receipts.length,
    issueCount,
    outcomeCounts: createOutcomeCounts(correlation.outcomes),
    receiptTypes: correlation.summary.receiptTypes,
    relatedIds: correlation.summary.relatedIds,
  });
}

function traceHeadline(trace: FlowTraceDescriptor): string {
  const eventTypes = uniqueStrings(
    trace.report.correlations.flatMap((correlation) =>
      correlation.summary.eventType === undefined ? [] : [correlation.summary.eventType],
    ),
  );
  const incidentSummary =
    trace.report.issues.length > 0
      ? `${trace.report.issues.length} issue(s)`
      : trace.report.outcomes.length > 0
        ? `${trace.report.outcomes.length} outcome(s)`
        : "no recorded issues";

  return `${trace.snapshot.machine.id} ended in ${trace.snapshot.value} after ${formatEventTypes(eventTypes)} with ${incidentSummary}`;
}

export function summarizeTrace(trace: FlowTraceDescriptor): FlowTraceIncidentSummary {
  return Object.freeze({
    kind: "trace-summary" as const,
    machineId: trace.snapshot.machine.id,
    finalState: trace.snapshot.value,
    headline: traceHeadline(trace),
    receiptCount: trace.receipts.length,
    correlationCount: trace.report.correlations.length,
    issueCount: trace.report.issues.length,
    bucketCounts: createBucketCounts(trace.report),
    outcomeCounts: createOutcomeCounts(trace.report.outcomes),
    receiptTypes: trace.report.summary.receiptTypes,
    relatedIds: trace.report.summary.relatedIds,
    issues: trace.report.issues,
    correlations: Object.freeze(trace.report.correlations.map(createCorrelationStep)),
    ...(trace.options === undefined ? {} : { options: trace.options }),
  });
}
