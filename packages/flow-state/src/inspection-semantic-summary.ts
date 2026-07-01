import type {
  FlowNoTransitionExplanation,
  FlowTraceDescriptor,
  FlowTraceResourceDetail,
  FlowTraceTransactionDetail,
} from "./public/types.js";

function uniqueOrdered<T>(values: ReadonlyArray<T>): ReadonlyArray<T> {
  const seen = new Set<T>();
  const ordered: Array<T> = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    ordered.push(value);
  }

  return Object.freeze(ordered);
}

function joinList(values: ReadonlyArray<string>, empty = "(none)"): string {
  return values.length === 0 ? empty : values.join(", ");
}

function formatFreshnessChange(detail: FlowTraceResourceDetail): string {
  return detail.freshnessChanges.length === 0
    ? "(none)"
    : detail.freshnessChanges
        .map((change) => {
          const transition = `${change.from ?? "unknown"}->${change.to}`;
          return change.reason === undefined ? transition : `${transition} (${change.reason})`;
        })
        .join(", ");
}

function transactionDurations(detail: FlowTraceTransactionDetail): string {
  const durations = detail.attemptTimings
    .map((timing) => timing.durationMillis)
    .filter((value): value is number => value !== undefined);

  return durations.length === 0 ? "(unknown)" : durations.map((value) => `${value}ms`).join(", ");
}

export function formatNoTransitionSummary(explanation: FlowNoTransitionExplanation): string {
  switch (explanation.reason) {
    case "unknown":
      return [
        `Event ${explanation.event.type} has no transition from ${explanation.state}.`,
        explanation.availableInStates.length === 0
          ? "It is not handled in any state."
          : `It is handled in: ${joinList(explanation.availableInStates)}.`,
      ].join(" ");
    case "ignored-in-state":
      return [
        `Event ${explanation.event.type} has no transition from ${explanation.state}.`,
        `It is handled in: ${joinList(explanation.availableInStates)}.`,
      ].join(" ");
    case "blocked-by-guard":
      return [
        `Event ${explanation.event.type} is blocked in ${explanation.state} by guard(s) ${explanation.guardFailures
          .map((index) => `#${index}`)
          .join(", ")}.`,
        explanation.availableInStates.length === 0
          ? "No candidate transitions were available in this state."
          : `Candidate transitions exist in: ${joinList(explanation.availableInStates)}.`,
      ].join(" ");
    case "stopped-by-microstep-limit":
      return `Event ${explanation.event.type} reached the microstep limit (${explanation.limitReached?.limit ?? "unknown"}) and stopped in ${explanation.nextSnapshot.value} at step ${explanation.limitReached?.step ?? "unknown"}.`;
  }
}

export function formatResourceFreshnessReport(trace: FlowTraceDescriptor): string {
  const resources = trace.report.timeline.flatMap((correlation) => correlation.details.resources);

  if (resources.length === 0) {
    return ["Resource freshness report", "  (no resource freshness activity)"].join("\n");
  }

  const counts = {
    fresh: 0,
    stale: 0,
    invalidated: 0,
    unknown: 0,
  };

  for (const detail of resources) {
    const freshness = detail.freshnessAfter;
    if (freshness === undefined) {
      counts.unknown += 1;
      continue;
    }

    counts[freshness] += 1;
  }

  return [
    "Resource freshness report",
    `  resources=${resources.length} fresh=${counts.fresh} stale=${counts.stale} invalidated=${counts.invalidated} unknown=${counts.unknown}`,
    ...resources.map(
      (detail, index) =>
        `  ${index + 1}. ${detail.id} final=${detail.freshnessAfter ?? "unknown"} status=${detail.statusAfter ?? "unknown"} modes=${joinList(uniqueOrdered(detail.queryModes))} fetch=${joinList(uniqueOrdered(detail.fetchOutcomes))} placeholder=${detail.usedPlaceholder ? "yes" : "no"} changes=${formatFreshnessChange(detail)} invalidations=${joinList(uniqueOrdered(detail.invalidationReasons))}`,
    ),
  ].join("\n");
}

export function formatTransactionOverlapSummary(trace: FlowTraceDescriptor): string {
  const transactions = trace.report.timeline
    .flatMap((correlation) => correlation.details.transactions)
    .filter(
      (detail) =>
        detail.queued ||
        detail.queueCause !== undefined ||
        detail.queueKey !== undefined ||
        detail.overlapCauses.length > 0,
    );

  if (transactions.length === 0) {
    return ["Transaction overlap summary", "  (no transaction overlap detected)"].join("\n");
  }

  const queuedCount = transactions.filter((detail) => detail.queued).length;

  return [
    "Transaction overlap summary",
    `  overlapping=${transactions.length} queued=${queuedCount}`,
    ...transactions.map(
      (detail, index) =>
        `  ${index + 1}. ${detail.id} final=${detail.statusAfter ?? "unknown"} attempts=${detail.attempts} queue=${detail.queueKey ?? "(none)"} causes=${joinList(uniqueOrdered(detail.overlapCauses))} queueCause=${detail.queueCause ?? "(none)"} routed=${joinList(
          uniqueOrdered(detail.routedEvents.map((event) => event.eventType)),
        )} duration=${transactionDurations(detail)}`,
    ),
  ].join("\n");
}

export function formatRehydrationSummary(trace: FlowTraceDescriptor): string {
  const restoredActors = uniqueOrdered(
    trace.report.timeline.flatMap((correlation) =>
      correlation.actors
        .filter((receipt) => receipt.type === "actor:restore" && typeof receipt.id === "string")
        .map((receipt) => receipt.id)
        .filter((id): id is string => id !== undefined),
    ),
  );
  const hydratedResources = trace.report.timeline.flatMap((correlation) =>
    correlation.details.resources.filter((detail) =>
      detail.receiptTypes.includes("resource:hydrate"),
    ),
  );
  const resumedStreams = trace.report.timeline.flatMap((correlation) =>
    correlation.details.streams.filter(
      (detail) => detail.restored || detail.receiptTypes.includes("stream:resume"),
    ),
  );
  const resumedTimers = trace.report.timeline.flatMap((correlation) =>
    correlation.details.timers.filter(
      (detail) => detail.restored || detail.receiptTypes.includes("timer:resume"),
    ),
  );
  const reconciledTransactions = trace.report.timeline.flatMap((correlation) =>
    correlation.details.transactions.filter((detail) =>
      detail.receiptTypes.includes("transaction:interrupt"),
    ),
  );

  if (
    restoredActors.length === 0 &&
    hydratedResources.length === 0 &&
    resumedStreams.length === 0 &&
    resumedTimers.length === 0 &&
    reconciledTransactions.length === 0
  ) {
    return ["Rehydration summary", "  (no rehydration activity detected)"].join("\n");
  }

  const resourceLines = hydratedResources.map(
    (detail) =>
      `${detail.id} -> ${detail.statusAfter ?? "unknown"}/${detail.freshnessAfter ?? "unknown"}`,
  );
  const streamLines = resumedStreams.map(
    (detail) =>
      `${detail.id} -> ${detail.statusAfter ?? "unknown"} emitted=${detail.emittedCount ?? 0} lastValue=${detail.lastValueAvailable === true ? "yes" : "no"}`,
  );
  const timerLines = resumedTimers.map(
    (detail) =>
      `${detail.id} -> ${detail.statusAfter ?? "unknown"} dueAt=${detail.dueAt ?? "unknown"}`,
  );
  const transactionLines = reconciledTransactions.map(
    (detail) => `${detail.id} -> ${detail.statusAfter ?? "unknown"}`,
  );

  return [
    "Rehydration summary",
    `  restoredActors=${restoredActors.length} hydratedResources=${hydratedResources.length} resumedStreams=${resumedStreams.length} resumedTimers=${resumedTimers.length} reconciledTransactions=${reconciledTransactions.length}`,
    ...(restoredActors.length === 0 ? [] : [`  actors: ${joinList(restoredActors)}`]),
    ...(resourceLines.length === 0 ? [] : [`  resources: ${joinList(resourceLines)}`]),
    ...(streamLines.length === 0 ? [] : [`  streams: ${joinList(streamLines)}`]),
    ...(timerLines.length === 0 ? [] : [`  timers: ${joinList(timerLines)}`]),
    ...(transactionLines.length === 0 ? [] : [`  transactions: ${joinList(transactionLines)}`]),
  ].join("\n");
}
