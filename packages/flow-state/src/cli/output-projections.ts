import type { FlowBehaviorDiffDescriptor } from "../inspect.js";

import type {
  FlowCliTraceContextualizedSummaryEnvelope,
  FlowCliTraceSummaryEnvelope,
} from "./shared.js";
import { nonEmptySemanticSummaries } from "./shared.js";
import type { FlowCliTraceDiffEnvelope } from "./trace-diff.js";

type DiffRecord = Readonly<{
  added: ReadonlyArray<Readonly<{ id: string }>>;
  removed: ReadonlyArray<Readonly<{ id: string }>>;
  changed: ReadonlyArray<Readonly<{ id: string }>>;
}>;

function diffRecordProjection(record: DiffRecord) {
  const ids = (values: ReadonlyArray<Readonly<{ id: string }>>) => values.map((value) => value.id);

  return Object.freeze({
    added: ids(record.added),
    removed: ids(record.removed),
    changed: ids(record.changed),
  });
}

export function behaviorDiffProjection(diff: FlowBehaviorDiffDescriptor) {
  return Object.freeze({
    kind: diff.kind,
    app: Object.freeze({ left: diff.appSummary.left.id, right: diff.appSummary.right.id }),
    ...(diff.options.moduleId === undefined ? {} : { module: diff.options.moduleId }),
    summary: diff.summary,
    ...(diff.summary.matches
      ? {}
      : {
          changes: Object.freeze({
            modules: diffRecordProjection(diff.modules),
            machines: diffRecordProjection(diff.machines),
            resources: diffRecordProjection(diff.resources),
            transactions: diffRecordProjection(diff.transactions),
            streams: diffRecordProjection(diff.streams),
            views: diffRecordProjection(diff.views),
            stories: diffRecordProjection(diff.stories),
          }),
        }),
  });
}

export function traceSummaryProjection(summary: FlowCliTraceSummaryEnvelope["summary"]) {
  return Object.freeze({
    kind: summary.kind,
    machineId: summary.machineId,
    finalState: summary.finalState,
    headline: summary.headline,
    counts: Object.freeze({
      receipts: summary.receiptCount,
      correlations: summary.correlationCount,
      issues: summary.issueCount,
    }),
    receiptTypes: Object.freeze([...new Set(summary.receiptTypes)]),
    relatedIds: Object.freeze([...new Set(summary.relatedIds)]),
    outcomes: summary.outcomeCounts,
  });
}

export function traceSummaryEnvelopeProjection(envelope: FlowCliTraceSummaryEnvelope) {
  return Object.freeze({
    kind: envelope.kind,
    source: envelope.source,
    machineId: envelope.machineId,
    summary: traceSummaryProjection(envelope.summary),
  });
}

export function contextualizedTraceSummaryProjection(
  envelope: FlowCliTraceContextualizedSummaryEnvelope,
) {
  const semantic = nonEmptySemanticSummaries(envelope.semanticSummaries);

  return Object.freeze({
    kind: envelope.kind,
    source: envelope.source,
    machineId: envelope.machineId,
    summary: traceSummaryProjection(envelope.summary),
    graph: Object.freeze({
      machineId: envelope.graph.machineId,
      initial: envelope.graph.initial,
      stateCount: envelope.graph.nodes.length,
      transitionCount: envelope.graph.edges.length,
    }),
    ...(Object.keys(semantic).length === 0 ? {} : { semantic }),
  });
}

export function traceDiffProjection(envelope: FlowCliTraceDiffEnvelope) {
  return Object.freeze({
    kind: envelope.kind,
    left: envelope.left,
    right: envelope.right,
    summary: envelope.summary,
  });
}
