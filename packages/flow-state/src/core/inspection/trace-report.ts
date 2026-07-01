import type {
  FlowIssueSummary,
  FlowReceipt,
  FlowSnapshot,
  FlowTraceBuckets,
  FlowTraceCorrelation,
  FlowTraceLanes,
  FlowTraceOutcome,
  FlowTraceReport,
  FlowTraceSummary,
} from "../api/types.js";
import { issueFactsFromReceipts, summarizeReceipts } from "./receipt-summary.js";
import {
  createTraceCorrelationDetailContext,
  createTraceCorrelationDetails,
} from "../../trace-correlation-details.js";

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

function actorIdForCorrelationEvent(event: FlowReceipt): string | undefined {
  if (typeof event.targetActorId === "string") {
    return event.targetActorId;
  }

  return typeof event.id === "string" ? event.id : undefined;
}

function transitionStateBefore(receipts: ReadonlyArray<FlowReceipt>): string | undefined {
  const receipt = receipts.find(
    (candidate) => candidate.type === "machine:transition" && typeof candidate.from === "string",
  );

  return typeof receipt?.from === "string" ? receipt.from : undefined;
}

function transitionStateAfter(receipts: ReadonlyArray<FlowReceipt>): string | undefined {
  for (let index = receipts.length - 1; index >= 0; index -= 1) {
    const receipt = receipts[index];
    if (receipt?.type === "machine:transition" && typeof receipt.to === "string") {
      return receipt.to;
    }
  }

  return undefined;
}

function receiptOutcomeKind(receipt: FlowReceipt): FlowTraceOutcome["kind"] | undefined {
  if (receipt.type === "timer:fire") {
    return "success";
  }

  return receiptLane(receipt);
}

function receiptOutcomeSource(receipt: FlowReceipt): FlowTraceOutcome["source"] | undefined {
  if (receipt.type.startsWith("machine:")) {
    return "machine";
  }

  if (receipt.type.startsWith("query:") || receipt.type.startsWith("resource:")) {
    return "resource";
  }

  if (receipt.type.startsWith("transaction:")) {
    return "transaction";
  }

  if (receipt.type.startsWith("stream:")) {
    return "stream";
  }

  if (receipt.type.startsWith("child:")) {
    return "child";
  }

  if (receipt.type.startsWith("timer:")) {
    return "timer";
  }

  return undefined;
}

function parentStateFromReceipt(receipt: FlowReceipt): string | undefined {
  if (typeof receipt.parentState === "string") {
    return receipt.parentState;
  }

  return typeof receipt.from === "string" ? receipt.from : undefined;
}

function traceOutcomes(receipts: ReadonlyArray<FlowReceipt>): ReadonlyArray<FlowTraceOutcome> {
  const outcomes: Array<FlowTraceOutcome> = [];

  for (const receipt of receipts) {
    if (typeof receipt.id !== "string") {
      continue;
    }

    const kind = receiptOutcomeKind(receipt);
    const source = receiptOutcomeSource(receipt);
    if (kind === undefined || source === undefined) {
      continue;
    }

    const parentState = parentStateFromReceipt(receipt);
    outcomes.push(
      Object.freeze({
        kind,
        source,
        type: receipt.type,
        id: receipt.id,
        ...(typeof receipt.correlationId === "string"
          ? { correlationId: receipt.correlationId }
          : {}),
        ...(parentState === undefined ? {} : { parentState }),
      }),
    );
  }

  return Object.freeze(outcomes);
}

function traceIssues(
  receipts: ReadonlyArray<FlowReceipt>,
  outcomes: ReadonlyArray<FlowTraceOutcome>,
): ReadonlyArray<FlowIssueSummary> {
  const issues: Array<FlowIssueSummary> = [];
  const seen = new Set<string>();

  for (const outcome of outcomes) {
    if (outcome.kind === "success" || outcome.source === "timer") {
      continue;
    }

    const key = `${outcome.correlationId ?? "uncorrelated"}:${outcome.kind}:${outcome.source}:${outcome.id}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    const facts = issueFactsFromReceipts(outcome.id, {
      receipts,
      ...(outcome.correlationId === undefined ? {} : { correlationId: outcome.correlationId }),
      ...(outcome.parentState === undefined ? {} : { parentState: outcome.parentState }),
    });
    issues.push(
      Object.freeze({
        kind: outcome.kind,
        source: outcome.source,
        id: outcome.id,
        receiptTypes: facts.receiptTypes,
        relatedIds: facts.relatedIds,
        ...(facts.correlationId === undefined ? {} : { correlationId: facts.correlationId }),
        ...(facts.parentState === undefined ? {} : { parentState: facts.parentState }),
      }),
    );
  }

  return Object.freeze(issues);
}

function correlationReports(
  receipts: ReadonlyArray<FlowReceipt>,
  detailContext: ReturnType<typeof createTraceCorrelationDetailContext>,
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

  const lastKnownStateByActor = new Map<string, string>();

  return Object.freeze(
    Array.from(correlations.entries())
      .map(([correlationId, groupedReceipts], index) => {
        const event =
          groupedReceipts.find((receipt) => receipt.type === "machine:event") ?? groupedReceipts[0];
        if (event === undefined) {
          return undefined;
        }

        const { buckets, lanes } = createBuckets(groupedReceipts);
        const actorId = actorIdForCorrelationEvent(event);
        const fallbackStateBefore =
          actorId === undefined ? undefined : lastKnownStateByActor.get(actorId);
        const stateBefore = transitionStateBefore(groupedReceipts) ?? fallbackStateBefore;
        const stateAfterFromTransitions = transitionStateAfter(groupedReceipts);
        const stateAfter =
          stateAfterFromTransitions ??
          (groupedReceipts.some((receipt) => receipt.type === "machine:no-transition")
            ? stateBefore
            : undefined);
        const outcomes = traceOutcomes(groupedReceipts);
        const issues = traceIssues(groupedReceipts, outcomes);
        if (actorId !== undefined && stateAfter !== undefined) {
          lastKnownStateByActor.set(actorId, stateAfter);
        }
        const summary = {
          ...summarizeReceipts(groupedReceipts),
          ...(typeof event.eventType === "string" ? { eventType: event.eventType } : {}),
        } satisfies FlowTraceSummary;
        return Object.freeze({
          correlationId,
          index,
          event,
          receipts: Object.freeze([...groupedReceipts]),
          ...freezeBuckets(buckets),
          lanes: freezeLanes(lanes),
          details: createTraceCorrelationDetails(groupedReceipts, detailContext),
          issues,
          outcomes,
          summary,
          ...(stateBefore === undefined ? {} : { stateBefore }),
          ...(stateAfter === undefined ? {} : { stateAfter }),
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

export function createTraceReport(
  receipts: ReadonlyArray<FlowReceipt>,
  snapshot?: FlowSnapshot<any, any, any>,
): FlowTraceReport {
  const { buckets, lanes } = createBuckets(receipts);
  const detailContext = createTraceCorrelationDetailContext(receipts, snapshot);
  const correlations = correlationReports(receipts, detailContext);
  const outcomes = traceOutcomes(receipts);
  const issues = traceIssues(receipts, outcomes);
  return Object.freeze({
    ...freezeBuckets(buckets),
    lanes: freezeLanes(lanes),
    correlations,
    timeline: correlations,
    issues,
    outcomes,
    summary: summarizeReceipts(receipts),
  });
}
