import type {
  FlowInspectionEvent,
  FlowIssueSummary,
  FlowTraceActorNode,
  FlowTraceDescriptor,
  FlowTraceIncidentOutcomeCounts,
} from "../api/types.js";

import { summarizeTrace as createTraceIncidentSummary } from "./trace-incident-summary.js";

function formatOutcomeCounts(counts: FlowTraceIncidentOutcomeCounts): string {
  return [
    `success=${counts.success}`,
    `failure=${counts.failure}`,
    `defect=${counts.defect}`,
    `interrupt=${counts.interrupt}`,
  ].join(" ");
}

function eventDetailPieces(event: FlowInspectionEvent): Array<string> {
  const pieces: Array<string> = [];

  if (typeof event.eventType === "string") {
    pieces.push(`event=${event.eventType}`);
  }
  if ("sourceActorId" in event && typeof event.sourceActorId === "string") {
    pieces.push(`source=${event.sourceActorId}`);
  }
  if ("targetActorId" in event && typeof event.targetActorId === "string") {
    pieces.push(`target=${event.targetActorId}`);
  }
  if ("from" in event && typeof event.from === "string" && "to" in event) {
    pieces.push(`${event.from}->${String(event.to)}`);
  }
  if ("parentState" in event && typeof event.parentState === "string") {
    pieces.push(`state=${event.parentState}`);
  }
  if ("childActorId" in event && typeof event.childActorId === "string") {
    pieces.push(`child=${event.childActorId}`);
  }
  if (event.type === "actor:snapshot") {
    pieces.push(`snapshot=${event.snapshot.value}`);
  }

  return pieces;
}

function eventMetadataPieces(event: FlowInspectionEvent): Array<string> {
  const pieces = [
    `actor=${event.actorId}`,
    `root=${event.rootActorId}`,
    `timestamp=${event.timestamp}`,
  ];

  if (typeof event.correlationId === "string") {
    pieces.push(`correlation=${event.correlationId}`);
  }
  if (typeof event.moduleId === "string") {
    pieces.push(`module=${event.moduleId}`);
  }
  if (typeof event.appId === "string") {
    pieces.push(`app=${event.appId}`);
  }
  if (typeof event.ownerPath === "string") {
    pieces.push(`owner=${event.ownerPath}`);
  }

  return pieces;
}

function formatSnapshotDetail(
  event: Extract<FlowInspectionEvent, { readonly type: "actor:snapshot" }>,
): string {
  return [
    `snapshot.state=${event.snapshot.value}`,
    `resources=${Object.keys(event.snapshot.resources).length}`,
    `transactions=${Object.keys(event.snapshot.transactions).length}`,
    `streams=${Object.keys(event.snapshot.streams).length}`,
    `timers=${Object.keys(event.snapshot.timers).length}`,
    `children=${Object.keys(event.snapshot.children).length}`,
    `receipts=${event.snapshot.receipts.length}`,
  ].join(" ");
}

function actorTreeLines(node: FlowTraceActorNode, depth = 0): Array<string> {
  const indent = "  ".repeat(depth);
  const pieces = [`${indent}- ${node.id}`];

  if (typeof node.actorId === "string") {
    pieces.push(`actor=${node.actorId}`);
  }
  if (typeof node.state === "string") {
    pieces.push(`state=${node.state}`);
  }
  if (typeof node.status === "string") {
    pieces.push(`status=${node.status}`);
  }
  if (typeof node.parentState === "string") {
    pieces.push(`parentState=${node.parentState}`);
  }
  if (typeof node.supervision === "string") {
    pieces.push(`supervision=${node.supervision}`);
  }

  return [
    pieces.join(" "),
    ...Object.entries(node.children)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([, child]) => actorTreeLines(child, depth + 1)),
  ];
}

function formatIssueSummary(issue: FlowIssueSummary): string {
  const pieces = [`${issue.kind}:${issue.source} [${issue.id}]`];

  if (typeof issue.correlationId === "string") {
    pieces.push(`correlation=${issue.correlationId}`);
  }
  if (typeof issue.parentState === "string") {
    pieces.push(`state=${issue.parentState}`);
  }
  if (issue.receiptTypes.length > 0) {
    pieces.push(`receiptTypes=${issue.receiptTypes.join(", ")}`);
  }
  if (issue.relatedIds.length > 0) {
    pieces.push(`relatedIds=${issue.relatedIds.join(", ")}`);
  }

  return pieces.join(" ");
}

export function formatInspectionEvent(event: FlowInspectionEvent): string {
  const pieces = [`${event.sequence}. ${event.type}`];

  if (typeof event.id === "string") {
    pieces.push(`[${event.id}]`);
  }

  return [...pieces, ...eventDetailPieces(event)].join(" ");
}

export function formatInspectionEventPretty(event: FlowInspectionEvent): string {
  const lines = [formatInspectionEvent(event), `  ${eventMetadataPieces(event).join(" ")}`];

  if (event.type === "actor:snapshot") {
    lines.push(`  ${formatSnapshotDetail(event)}`);
  }

  return lines.join("\n");
}

export function formatInspectionTimeline(events: ReadonlyArray<FlowInspectionEvent>): string {
  return events.length === 0
    ? "(no inspection events)"
    : events.map(formatInspectionEvent).join("\n");
}

export function formatInspectionTimelinePretty(events: ReadonlyArray<FlowInspectionEvent>): string {
  return events.length === 0
    ? "(no inspection events)"
    : events.map(formatInspectionEventPretty).join("\n\n");
}

export function formatTrace(trace: FlowTraceDescriptor): string {
  const summary = createTraceIncidentSummary(trace);
  const timeline =
    summary.correlations.length === 0
      ? "(none)"
      : summary.correlations.map((step) => `${step.correlationId}:${step.headline}`).join(" | ");
  const issues =
    summary.issues.length === 0 ? "(none)" : summary.issues.map(formatIssueSummary).join(" | ");

  return [
    `trace[${summary.machineId}] final=${summary.finalState} receipts=${summary.receiptCount} correlations=${summary.correlationCount} issues=${summary.issueCount}`,
    `outcomes ${formatOutcomeCounts(summary.outcomeCounts)}`,
    `timeline: ${timeline}`,
    `issues: ${issues}`,
  ].join("\n");
}

export function formatTracePretty(trace: FlowTraceDescriptor): string {
  const summary = createTraceIncidentSummary(trace);
  const bucketCounts = [
    `events=${summary.bucketCounts.events}`,
    `transitions=${summary.bucketCounts.transitions}`,
    `resources=${summary.bucketCounts.resources}`,
    `transactions=${summary.bucketCounts.transactions}`,
    `streams=${summary.bucketCounts.streams}`,
    `children=${summary.bucketCounts.children}`,
    `timers=${summary.bucketCounts.timers}`,
    `actors=${summary.bucketCounts.actors}`,
    `other=${summary.bucketCounts.other}`,
  ].join(" ");
  const correlationLines =
    summary.correlations.length === 0
      ? ["  (none)"]
      : summary.correlations.flatMap((step, index) => [
          `  ${index + 1}. ${step.headline}`,
          `     correlation=${step.correlationId} receipts=${step.receiptCount} issues=${step.issueCount} ${formatOutcomeCounts(step.outcomeCounts)}`,
          ...(step.receiptTypes.length === 0
            ? []
            : [`     receiptTypes=${step.receiptTypes.join(", ")}`]),
          ...(step.relatedIds.length === 0
            ? []
            : [`     relatedIds=${step.relatedIds.join(", ")}`]),
        ]);
  const issueLines =
    summary.issues.length === 0
      ? ["  (none)"]
      : summary.issues.map((issue, index) => `  ${index + 1}. ${formatIssueSummary(issue)}`);

  return [
    `Trace ${summary.machineId}`,
    `  finalState=${summary.finalState} receipts=${summary.receiptCount} correlations=${summary.correlationCount} issues=${summary.issueCount}`,
    "",
    "Headline",
    `  ${summary.headline}`,
    "",
    "Buckets",
    `  ${bucketCounts}`,
    "",
    "Actor tree",
    ...actorTreeLines(trace.actorHierarchy),
    "",
    "Correlation timeline",
    ...correlationLines,
    "",
    "Outcome summary",
    `  ${formatOutcomeCounts(summary.outcomeCounts)}`,
    "",
    "Issue summary",
    ...issueLines,
  ].join("\n");
}
