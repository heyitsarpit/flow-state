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
import { Data, Effect } from "effect";

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
  appId: string;
  storyCount: number;
  coverage: string;
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
type FlowCliTraceCorrelationProjection = Readonly<{
  correlationId: string;
  event: string;
  stateBefore?: string;
  stateAfter?: string;
  counts: Readonly<{ receipts: number; outcomes: number; issues: number }>;
  relatedIds: ReadonlyArray<string>;
  outcomes: ReadonlyArray<Readonly<{ kind: string; source: string }>>;
  issues: ReadonlyArray<FlowCliTraceIssue>;
}>;

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
  correlation: FlowCliTraceCorrelationProjection;
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
}>;

export type FlowCliTraceProofEnvelope =
  | FlowCliTraceActorProofEnvelope
  | FlowCliTraceCorrelationProofEnvelope
  | FlowCliTraceIssuesProofEnvelope
  | FlowCliTraceTimelineProofEnvelope;

export class FlowCliProofSelectionError extends Data.TaggedError("FlowCliProofSelectionError")<{
  readonly message: string;
}> {}

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
    appId: selectedContract.app.id,
    storyCount: selectedContract.stories.length,
    coverage: rendered,
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
  const events = [
    ...new Set(
      envelope.summary.correlations.flatMap((correlation) =>
        correlation.eventType === undefined ? [] : [correlation.eventType],
      ),
    ),
  ];
  return [
    `trace.summary ${envelope.machineId} — ${envelope.summary.finalState}`,
    `events: ${events.length === 0 ? "uncorrelated receipts" : events.join(", ")}`,
    `evidence: ${envelope.summary.receiptCount} receipts, ${envelope.summary.correlationCount} correlations, ${envelope.summary.issueCount} issues`,
    ...(envelope.summary.relatedIds.length === 0
      ? []
      : [
          `related: ${[...new Set(envelope.summary.relatedIds.filter((id) => id !== envelope.machineId))].join(", ")}`,
        ]),
  ].join("\n");
}

export function nonEmptySemanticSummaries(
  summaries: FlowCliTraceContextualizedSummaryEnvelope["semanticSummaries"],
) {
  return Object.fromEntries(
    Object.entries(summaries).filter(([, value]) => !value.includes("\n  (no ")),
  );
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
  const base = formatTraceSummaryText({
    kind: "trace-summary",
    source: envelope.source,
    machineId: envelope.machineId,
    summary: envelope.summary,
  });
  const semantic = nonEmptySemanticSummaries(envelope.semanticSummaries);
  return [
    base,
    `context: graph initial=${envelope.graph.initial}, ${envelope.graph.nodes.length} states, ${envelope.graph.edges.length} transitions`,
    ...(Object.keys(semantic).length === 0
      ? ["activity: no freshness, transaction-overlap, or rehydration activity"]
      : Object.values(semantic)),
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

function formatTimelineEvent(event: FlowLocalInspectionProof["eventTimeline"][number]): string {
  const sequence = typeof event.sequence === "number" ? `${event.sequence}` : "?";
  const details = [
    typeof event.id === "string" ? event.id : undefined,
    "eventType" in event && typeof event.eventType === "string" ? event.eventType : undefined,
    ("from" in event && typeof event.from === "string") ||
    ("to" in event && typeof event.to === "string")
      ? `${"from" in event ? String(event.from ?? "?") : "?"} -> ${"to" in event ? String(event.to ?? "?") : "?"}`
      : undefined,
  ].filter((part): part is string => part !== undefined);
  return `${sequence}  ${event.type}${details.length === 0 ? "" : `  ${details.join("  ")}`}`;
}

export const createTraceProofEnvelope = Effect.fn("FlowCli.createTraceProofEnvelope")(function* (
  normalized: FlowCliNormalizedTraceProofInput,
  selector: FlowCliTraceProofSelector,
) {
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
        return yield* new FlowCliProofSelectionError({
          message: `Unknown actor '${selector.actorId}'. Available actor selectors: ${[
            ...collectActorSelectors(normalized.proof.actorTree),
          ]
            .sort()
            .join(", ")}.`,
        });
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
        return yield* new FlowCliProofSelectionError({
          message: `Unknown correlation '${selector.correlationId}'. Available correlations: ${normalized.proof.correlations
            .map((candidate) => candidate.correlationId)
            .join(", ")}.`,
        });
      }

      return Object.freeze({
        ...base,
        selector: Object.freeze(selector),
        correlation: Object.freeze({
          correlationId: correlation.correlationId,
          event: correlation.summary.eventType ?? correlation.event.type,
          ...(correlation.stateBefore === undefined
            ? {}
            : { stateBefore: correlation.stateBefore }),
          ...(correlation.stateAfter === undefined ? {} : { stateAfter: correlation.stateAfter }),
          counts: Object.freeze({
            receipts: correlation.receipts.length,
            outcomes: correlation.outcomes.length,
            issues: correlation.issues.length,
          }),
          relatedIds: Object.freeze([...new Set(correlation.summary.relatedIds)]),
          outcomes: Object.freeze(
            correlation.outcomes.map((outcome) =>
              Object.freeze({ kind: outcome.kind, source: outcome.source }),
            ),
          ),
          issues: correlation.issues,
        }),
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
      });
  }
});

export function formatTraceProofText(envelope: FlowCliTraceProofEnvelope): string {
  const lines = [`trace.proof ${envelope.selector.kind}`];

  if ("actor" in envelope) {
    const actorEnvelope = envelope;
    lines.push(`actor: ${actorEnvelope.selector.actorId}`, ...actorTreeLines(actorEnvelope.actor));
    return lines.join("\n");
  }

  if ("correlation" in envelope) {
    const correlationEnvelope = envelope;
    lines.push(
      `correlation: ${correlationEnvelope.selector.correlationId}`,
      `${correlationEnvelope.correlation.event}: ${correlationEnvelope.correlation.stateBefore ?? "?"} -> ${correlationEnvelope.correlation.stateAfter ?? "?"}`,
      `evidence: ${correlationEnvelope.correlation.counts.receipts} receipts, ${correlationEnvelope.correlation.counts.outcomes} outcomes, ${correlationEnvelope.correlation.counts.issues} issues`,
      ...(correlationEnvelope.correlation.relatedIds.length === 0
        ? []
        : [`related: ${correlationEnvelope.correlation.relatedIds.join(", ")}`]),
    );
    return lines.join("\n");
  }

  if ("issues" in envelope) {
    const issuesEnvelope = envelope;
    lines[0] = `trace.proof issues — ${issuesEnvelope.issues.length === 0 ? "NONE" : issuesEnvelope.issues.length}`;

    if (issuesEnvelope.issues.length === 0) {
      return lines.join("\n");
    } else {
      lines.push(...issuesEnvelope.issues.map(formatIssueLine));
    }

    return lines.join("\n");
  }

  const timelineEnvelope = envelope;
  lines.push(
    `events: ${timelineEnvelope.eventTimeline.length}`,
    ...(timelineEnvelope.eventTimeline.length === 0
      ? []
      : timelineEnvelope.eventTimeline.map(formatTimelineEvent)),
  );
  return lines.join("\n");
}
