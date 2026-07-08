import {
  analyzeTrace,
  buildBehaviorContract,
  formatRehydrationSummary,
  formatResourceFreshnessReport,
  formatTransactionOverlapSummary,
  renderBehaviorCoverage,
  sliceBehaviorContract,
  summarizeTrace,
} from "../inspect.js";

import type { FlowGraphJson, FlowLocalInspectionProof, FlowTraceDescriptor } from "../inspect.js";
import type {
  FlowCliNormalizedTraceInput,
  FlowCliNormalizedTraceProofInput,
  FlowCliTraceInputSource,
} from "./trace-input.js";
export {
  loadBehaviorGateway,
  loadGatewayTarget,
  resolveGatewayPath,
  resolveProjectRoot,
} from "./gateway.js";
export {
  formatStoryDescribeText,
  formatStoryListText,
  storyDescribeJson,
  storyListJson,
} from "./story-read.js";
export {
  createStoryRunEnvelope,
  formatStoryRunCompact,
  formatStoryRunPretty,
} from "./story-run.js";
export { createMachineRegistry, createStoryRegistry } from "./story-registry.js";
export {
  createStoryPathCheckEnvelope,
  createStoryPathListEnvelope,
  formatStoryPathCheckText,
  formatStoryPathListText,
  normalizeStoryPathRequest,
} from "./story-paths.js";
export {
  createTraceDiffEnvelope,
  createTraceDiffSectionEnvelope,
  formatTraceDiffSectionText,
  formatTraceDiffText,
  traceDiffSectionNames,
} from "./trace-diff.js";
export { normalizeTraceInput, normalizeTraceProofInput } from "./trace-input.js";

type FlowCliBehaviorCoverageTarget = Parameters<typeof buildBehaviorContract>[0];
type FlowCliBehaviorCoverageOptions = NonNullable<Parameters<typeof renderBehaviorCoverage>[1]>;
export type FlowCliBehaviorCoverageEnvelope = Readonly<{
  kind: "behavior-coverage";
  source: "live-gateway";
  options: Readonly<{ readonly moduleId?: string }>;
  contract: ReturnType<typeof buildBehaviorContract>;
  rendered: string;
}>;

export type FlowCliTraceSummaryEnvelope = Readonly<{
  kind: "trace-summary";
  source: FlowCliTraceInputSource;
  machineId: string;
  summary: ReturnType<typeof summarizeTrace>;
}>;

export type FlowCliTraceContextualizedSummaryEnvelope = Readonly<{
  kind: "trace-summary-contextualized";
  source: FlowCliTraceInputSource;
  machineId: string;
  summary: ReturnType<typeof summarizeTrace>;
  graph: FlowGraphJson;
  semanticSummaries: Readonly<{
    resourceFreshness: string;
    transactionOverlap: string;
    rehydration: string;
  }>;
}>;

export type FlowCliTraceProofSelector =
  | Readonly<{ kind: "actor"; actorId: string }>
  | Readonly<{ kind: "correlation"; correlationId: string }>
  | Readonly<{ kind: "issues" }>
  | Readonly<{ kind: "timeline" }>;

type FlowCliTraceActorNode = FlowLocalInspectionProof["actorTree"];
type FlowCliTraceIssue = FlowTraceDescriptor["report"]["issues"][number];
type FlowCliTraceCorrelation = FlowLocalInspectionProof["correlations"][number];

type FlowCliTraceActorProofEnvelope = Readonly<{
  kind: "trace-proof";
  path: string;
  source: FlowCliTraceInputSource;
  machineId: string;
  selector: Readonly<{ kind: "actor"; actorId: string }>;
  actor: FlowCliTraceActorNode;
}>;

type FlowCliTraceCorrelationProofEnvelope = Readonly<{
  kind: "trace-proof";
  path: string;
  source: FlowCliTraceInputSource;
  machineId: string;
  selector: Readonly<{ kind: "correlation"; correlationId: string }>;
  correlation: FlowCliTraceCorrelation;
}>;

type FlowCliTraceIssuesProofEnvelope = Readonly<{
  kind: "trace-proof";
  path: string;
  source: FlowCliTraceInputSource;
  machineId: string;
  selector: Readonly<{ kind: "issues" }>;
  issues: ReadonlyArray<FlowCliTraceIssue>;
}>;

type FlowCliTraceTimelineProofEnvelope = Readonly<{
  kind: "trace-proof";
  path: string;
  source: FlowCliTraceInputSource;
  machineId: string;
  selector: Readonly<{ kind: "timeline" }>;
  eventTimeline: FlowLocalInspectionProof["eventTimeline"];
  formatted: string;
}>;

export type FlowCliTraceProofEnvelope =
  | FlowCliTraceActorProofEnvelope
  | FlowCliTraceCorrelationProofEnvelope
  | FlowCliTraceIssuesProofEnvelope
  | FlowCliTraceTimelineProofEnvelope;

function formatList(values: ReadonlyArray<string>): string {
  return values.length === 0 ? "none" : values.join(", ");
}

export function createBehaviorCoverageEnvelope(
  target: FlowCliBehaviorCoverageTarget,
  options: FlowCliBehaviorCoverageOptions = {},
): FlowCliBehaviorCoverageEnvelope {
  const contract = buildBehaviorContract(target);
  const selectedContract =
    options.moduleId === undefined ? contract : sliceBehaviorContract(contract, options.moduleId);
  const rendered = renderBehaviorCoverage(target, options);

  return Object.freeze({
    kind: "behavior-coverage",
    source: "live-gateway",
    options: Object.freeze(options.moduleId === undefined ? {} : { moduleId: options.moduleId }),
    contract: selectedContract,
    rendered,
  });
}

export function createTraceSummaryEnvelope(
  normalized: FlowCliNormalizedTraceInput,
): FlowCliTraceSummaryEnvelope {
  const summary = summarizeTrace(normalized.trace);

  return Object.freeze({
    kind: "trace-summary",
    source: normalized.source,
    machineId: summary.machineId,
    summary,
  });
}

export function formatTraceSummaryText(envelope: FlowCliTraceSummaryEnvelope): string {
  return [
    "# Trace Summary",
    `Machine: ${envelope.machineId}`,
    `Source: ${envelope.source}`,
    `Final state: ${envelope.summary.finalState}`,
    `Headline: ${envelope.summary.headline}`,
    `Receipt count: ${envelope.summary.receiptCount}`,
    `Correlation count: ${envelope.summary.correlationCount}`,
    `Issue count: ${envelope.summary.issueCount}`,
    `Receipt types: ${formatList(envelope.summary.receiptTypes)}`,
    `Related ids: ${formatList(envelope.summary.relatedIds)}`,
  ].join("\n");
}

export function createTraceContextualizedSummaryEnvelope(
  normalized: FlowCliNormalizedTraceInput,
  machine: Parameters<typeof analyzeTrace>[0],
): FlowCliTraceContextualizedSummaryEnvelope {
  const analysis = analyzeTrace(machine, normalized.trace);
  const summary = summarizeTrace(normalized.trace);

  return Object.freeze({
    kind: "trace-summary-contextualized",
    source: normalized.source,
    machineId: analysis.machine.id,
    summary,
    graph: analysis.graph.toJSON(),
    semanticSummaries: Object.freeze({
      resourceFreshness: formatResourceFreshnessReport(normalized.trace),
      transactionOverlap: formatTransactionOverlapSummary(normalized.trace),
      rehydration: formatRehydrationSummary(normalized.trace),
    }),
  });
}

export function formatTraceContextualizedSummaryText(
  envelope: FlowCliTraceContextualizedSummaryEnvelope,
): string {
  return [
    "# Trace Summary",
    `Machine: ${envelope.machineId}`,
    `Source: ${envelope.source}`,
    `Final state: ${envelope.summary.finalState}`,
    `Headline: ${envelope.summary.headline}`,
    `Receipt count: ${envelope.summary.receiptCount}`,
    `Correlation count: ${envelope.summary.correlationCount}`,
    `Issue count: ${envelope.summary.issueCount}`,
    `Receipt types: ${formatList(envelope.summary.receiptTypes)}`,
    `Related ids: ${formatList(envelope.summary.relatedIds)}`,
    "Contextualized: yes",
    `Graph: ${envelope.graph.machineId} initial=${envelope.graph.initial} states=${envelope.graph.nodes.length} transitions=${envelope.graph.edges.length}`,
    "",
    envelope.semanticSummaries.resourceFreshness,
    "",
    envelope.semanticSummaries.transactionOverlap,
    "",
    envelope.semanticSummaries.rehydration,
  ].join("\n");
}

function actorTreeLines(node: FlowCliTraceActorNode, depth = 0): ReadonlyArray<string> {
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

function findActorNode(
  node: FlowCliTraceActorNode,
  selector: string,
): FlowCliTraceActorNode | undefined {
  if (node.id === selector || node.actorId === selector) {
    return node;
  }

  for (const child of Object.values(node.children)) {
    const match = findActorNode(child, selector);

    if (match !== undefined) {
      return match;
    }
  }

  return undefined;
}

function collectActorSelectors(
  node: FlowCliTraceActorNode,
  values = new Set<string>(),
): Set<string> {
  values.add(node.id);

  if (typeof node.actorId === "string") {
    values.add(node.actorId);
  }

  for (const child of Object.values(node.children)) {
    collectActorSelectors(child, values);
  }

  return values;
}

function formatIssueLine(issue: FlowCliTraceIssue): string {
  const pieces = [`${issue.kind}:${issue.source} [${issue.id}]`];

  if (typeof issue.correlationId === "string") {
    pieces.push(`correlation=${issue.correlationId}`);
  }
  if (typeof issue.parentState === "string") {
    pieces.push(`state=${issue.parentState}`);
  }
  if (issue.receiptTypes.length > 0) {
    pieces.push(`receiptTypes=${issue.receiptTypes.join(",")}`);
  }
  if (issue.relatedIds.length > 0) {
    pieces.push(`relatedIds=${issue.relatedIds.join(",")}`);
  }

  return `- ${pieces.join(" ")}`;
}

function formatCorrelationHeadline(correlation: FlowCliTraceCorrelation): string {
  const eventLabel = correlation.summary.eventType ?? correlation.event.type;
  const stateChange =
    correlation.stateBefore === undefined && correlation.stateAfter === undefined
      ? undefined
      : `${correlation.stateBefore ?? "?"} -> ${correlation.stateAfter ?? "?"}`;
  const incidentSummary =
    correlation.issues.length > 0
      ? `${correlation.issues.length} issue(s)`
      : correlation.outcomes.length > 0
        ? `${correlation.outcomes.length} outcome(s)`
        : `${correlation.receipts.length} receipt(s)`;

  return stateChange === undefined
    ? `${eventLabel}: ${incidentSummary}`
    : `${eventLabel}: ${stateChange}; ${incidentSummary}`;
}

function formatCorrelationProofText(correlation: FlowCliTraceCorrelation): string {
  const lines = [
    `Correlation: ${correlation.correlationId}`,
    `Headline: ${formatCorrelationHeadline(correlation)}`,
    `Event: ${correlation.summary.eventType ?? correlation.event.type}`,
    `Receipt count: ${correlation.receipts.length}`,
    `Issue count: ${correlation.issues.length}`,
    `Outcome count: ${correlation.outcomes.length}`,
  ];

  if (correlation.stateBefore !== undefined || correlation.stateAfter !== undefined) {
    lines.push(
      `State change: ${correlation.stateBefore ?? "?"} -> ${correlation.stateAfter ?? "?"}`,
    );
  }

  if (correlation.summary.receiptTypes.length > 0) {
    lines.push(`Receipt types: ${correlation.summary.receiptTypes.join(", ")}`);
  }

  if (correlation.summary.relatedIds.length > 0) {
    lines.push(`Related ids: ${correlation.summary.relatedIds.join(", ")}`);
  }

  if (correlation.issues.length > 0) {
    lines.push("Issues:", ...correlation.issues.map(formatIssueLine));
  }

  return lines.join("\n");
}

export function createTraceProofEnvelope(
  normalized: FlowCliNormalizedTraceProofInput,
  selector: FlowCliTraceProofSelector,
): FlowCliTraceProofEnvelope {
  const base = {
    kind: "trace-proof" as const,
    path: normalized.path,
    source: normalized.source,
    machineId: normalized.proof.machineId,
  };

  switch (selector.kind) {
    case "actor": {
      const actor = findActorNode(normalized.proof.actorTree, selector.actorId);

      if (actor === undefined) {
        throw new Error(
          `Unknown actor '${selector.actorId}'. Available actor selectors: ${[
            ...collectActorSelectors(normalized.proof.actorTree),
          ]
            .sort()
            .join(", ")}.`,
        );
      }

      return Object.freeze({
        ...base,
        selector: Object.freeze(selector),
        actor,
      });
    }
    case "correlation": {
      const correlation = normalized.proof.correlations.find(
        (candidate) => candidate.correlationId === selector.correlationId,
      );

      if (correlation === undefined) {
        throw new Error(
          `Unknown correlation '${selector.correlationId}'. Available correlations: ${normalized.proof.correlations
            .map((candidate) => candidate.correlationId)
            .join(", ")}.`,
        );
      }

      return Object.freeze({
        ...base,
        selector: Object.freeze(selector),
        correlation,
      });
    }
    case "issues":
      return Object.freeze({
        ...base,
        selector: Object.freeze(selector),
        issues: normalized.trace.report.issues,
      });
    case "timeline":
      return Object.freeze({
        ...base,
        selector: Object.freeze(selector),
        eventTimeline: normalized.proof.eventTimeline,
        formatted: normalized.proof.formatted.eventTimeline,
      });
    default:
      throw new Error("Unsupported trace proof selector.");
  }
}

export function formatTraceProofText(envelope: FlowCliTraceProofEnvelope): string {
  const lines = [
    `# Trace Proof: ${envelope.selector.kind}`,
    `Machine: ${envelope.machineId}`,
    `Source: ${envelope.source}`,
  ];

  if (envelope.selector.kind === "actor") {
    const actorEnvelope = envelope as FlowCliTraceActorProofEnvelope;
    lines.push(
      `Selector: ${actorEnvelope.selector.actorId}`,
      "",
      ...actorTreeLines(actorEnvelope.actor),
    );
    return lines.join("\n");
  }

  if (envelope.selector.kind === "correlation") {
    const correlationEnvelope = envelope as FlowCliTraceCorrelationProofEnvelope;
    lines.push(
      `Selector: ${correlationEnvelope.selector.correlationId}`,
      "",
      formatCorrelationProofText(correlationEnvelope.correlation),
    );
    return lines.join("\n");
  }

  if (envelope.selector.kind === "issues") {
    const issuesEnvelope = envelope as FlowCliTraceIssuesProofEnvelope;
    lines.push(`Issue count: ${issuesEnvelope.issues.length}`);

    if (issuesEnvelope.issues.length === 0) {
      lines.push("", "(no issues)");
    } else {
      lines.push("", ...issuesEnvelope.issues.map(formatIssueLine));
    }

    return lines.join("\n");
  }

  if (envelope.selector.kind === "timeline") {
    const timelineEnvelope = envelope as FlowCliTraceTimelineProofEnvelope;
    lines.push(
      `Event count: ${timelineEnvelope.eventTimeline.length}`,
      "",
      timelineEnvelope.formatted,
    );
    return lines.join("\n");
  }

  throw new Error("Unsupported trace proof selector.");
}
