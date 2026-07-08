// @ts-nocheck
import {
  analyzeTrace,
  buildBehaviorContract,
  formatRehydrationSummary,
  formatResourceFreshnessReport,
  formatTransactionOverlapSummary,
  renderBehaviorCoverage,
  sliceBehaviorContract,
  summarizeTrace,
} from "../../dist/inspect.mjs";
export {
  loadBehaviorGateway,
  loadGatewayTarget,
  resolveGatewayPath,
  resolveProjectRoot,
} from "./gateway.ts";
export {
  formatStoryDescribeText,
  formatStoryListText,
  storyDescribeJson,
  storyListJson,
} from "./story-read.ts";
export {
  createStoryRunEnvelope,
  formatStoryRunCompact,
  formatStoryRunPretty,
} from "./story-run.ts";
export { createMachineRegistry, createStoryRegistry } from "./story-registry.ts";
export {
  createStoryPathCheckEnvelope,
  createStoryPathListEnvelope,
  formatStoryPathCheckText,
  formatStoryPathListText,
  normalizeStoryPathRequest,
} from "./story-paths.ts";
export {
  createTraceDiffEnvelope,
  createTraceDiffSectionEnvelope,
  formatTraceDiffSectionText,
  formatTraceDiffText,
  traceDiffSectionNames,
} from "./trace-diff.ts";
export { normalizeTraceInput, normalizeTraceProofInput } from "./trace-input.ts";

function formatList(values) {
  return values.length === 0 ? "none" : values.join(", ");
}

export function createBehaviorCoverageEnvelope(target, options = {}) {
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

export function createTraceSummaryEnvelope(normalized) {
  const summary = summarizeTrace(normalized.trace);

  return Object.freeze({
    kind: "trace-summary",
    source: normalized.source,
    machineId: summary.machineId,
    summary,
  });
}

export function formatTraceSummaryText(envelope) {
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

export function createTraceContextualizedSummaryEnvelope(normalized, machine) {
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

export function formatTraceContextualizedSummaryText(envelope) {
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

function actorTreeLines(node, depth = 0) {
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

function findActorNode(node, selector) {
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

function collectActorSelectors(node, values = new Set()) {
  values.add(node.id);

  if (typeof node.actorId === "string") {
    values.add(node.actorId);
  }

  for (const child of Object.values(node.children)) {
    collectActorSelectors(child, values);
  }

  return values;
}

function formatIssueLine(issue) {
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

function formatCorrelationHeadline(correlation) {
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

function formatCorrelationProofText(correlation) {
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

export function createTraceProofEnvelope(normalized, selector) {
  const base = {
    kind: "trace-proof",
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
      throw new Error(`Unsupported trace proof selector '${selector.kind}'.`);
  }
}

export function formatTraceProofText(envelope) {
  const lines = [
    `# Trace Proof: ${envelope.selector.kind}`,
    `Machine: ${envelope.machineId}`,
    `Source: ${envelope.source}`,
  ];

  switch (envelope.selector.kind) {
    case "actor":
      lines.push(`Selector: ${envelope.selector.actorId}`, "", ...actorTreeLines(envelope.actor));
      break;
    case "correlation":
      lines.push(
        `Selector: ${envelope.selector.correlationId}`,
        "",
        formatCorrelationProofText(envelope.correlation),
      );
      break;
    case "issues":
      lines.push(`Issue count: ${envelope.issues.length}`);

      if (envelope.issues.length === 0) {
        lines.push("", "(no issues)");
      } else {
        lines.push("", ...envelope.issues.map(formatIssueLine));
      }
      break;
    case "timeline":
      lines.push(`Event count: ${envelope.eventTimeline.length}`, "", envelope.formatted);
      break;
    default:
      throw new Error(`Unsupported trace proof selector '${envelope.selector.kind}'.`);
  }

  return lines.join("\n");
}
