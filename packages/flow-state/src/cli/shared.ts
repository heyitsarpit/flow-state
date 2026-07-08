// @ts-nocheck
import {
  analyzeTrace,
  buildBehaviorContract,
  diffTrace,
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
export { createMachineRegistry, createStoryRegistry } from "./story-registry.ts";
export {
  createStoryPathCheckEnvelope,
  createStoryPathListEnvelope,
  formatStoryPathCheckText,
  formatStoryPathListText,
  normalizeStoryPathRequest,
} from "./story-paths.ts";
export { normalizeTraceInput, normalizeTraceProofInput } from "./trace-input.ts";

export function formatStoryListText(entries) {
  const lines = ["# Stories"];

  if (entries.length === 0) {
    lines.push("", "- No stories matched the current filters.");
    return lines.join("\n");
  }

  for (const entry of entries) {
    const detailParts = [`start=${entry.doc.start.kind}`];

    if (entry.story.expectedState !== undefined) {
      detailParts.push(`expectedState=${entry.story.expectedState}`);
    }

    if (entry.doc.tags.length > 0) {
      detailParts.push(`tags=${entry.doc.tags.join(",")}`);
    }

    if (entry.doc.seed !== undefined) {
      detailParts.push(`seed=${entry.doc.seed.label}`);
    }

    lines.push(
      "",
      `- ${entry.story.id} [${entry.machineId}] ${entry.story.title}`,
      `  ${detailParts.join(" | ")}`,
    );
  }

  return lines.join("\n");
}

function formatList(values) {
  return values.length === 0 ? "none" : values.join(", ");
}

export function formatStoryDescribeText(entry) {
  const lines = [
    `# Story: ${entry.story.id}`,
    `Machine: ${entry.machineId}`,
    `Title: ${entry.story.title}`,
  ];

  if (entry.story.description !== undefined) {
    lines.push(`Description: ${entry.story.description}`);
  }

  lines.push(`Start: ${entry.doc.start.label}`);

  if (entry.doc.seed !== undefined) {
    lines.push(`Seed: ${entry.doc.seed.label}`);
  }

  lines.push(`Tags: ${formatList(entry.doc.tags)}`);
  lines.push("Events:");

  if (entry.doc.events.length === 0) {
    lines.push("- none");
  } else {
    for (const event of entry.doc.events) {
      lines.push(`- ${event.label}`);
    }
  }

  lines.push("Expectations:");
  if (entry.doc.expectations.length === 0) {
    lines.push("- none");
  } else {
    for (const expectation of entry.doc.expectations) {
      lines.push(`- ${expectation.label}`);
    }
  }

  return lines.join("\n");
}

export function storyListJson(entries) {
  return Object.freeze({
    kind: "story-list",
    stories: Object.freeze(
      entries.map((entry) =>
        Object.freeze({
          id: entry.story.id,
          machineId: entry.machineId,
          title: entry.story.title,
          description: entry.story.description,
          start: entry.doc.start.kind,
          expectedState: entry.story.expectedState,
          tags: entry.doc.tags,
          ...(entry.doc.seed === undefined
            ? {}
            : {
                seed: Object.freeze({
                  label: entry.doc.seed.label,
                  fixtures: entry.doc.seed.fixtures,
                  resourceCount: entry.doc.seed.resourceCount,
                  hasBoot: entry.doc.seed.hasBoot,
                  ...(entry.doc.seed.actorId === undefined
                    ? {}
                    : { actorId: entry.doc.seed.actorId }),
                }),
              }),
        }),
      ),
    ),
  });
}

export function storyDescribeJson(entry) {
  return Object.freeze({
    kind: "story-describe",
    machineId: entry.machineId,
    story: entry.doc,
  });
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

function uniqueValues(values) {
  return Object.freeze([...new Set(values)]);
}

function summarizeIssueField(issues, field) {
  return uniqueValues(issues.map((issue) => issue[field]));
}

function summarizeOutcomeField(outcomes, field) {
  return uniqueValues(outcomes.map((outcome) => outcome[field]));
}

export function createStoryRunEnvelope(entry, outcome, check) {
  const story = Object.freeze({
    id: entry.story.id,
    machineId: entry.machineId,
    title: entry.story.title,
    ...(entry.story.description === undefined ? {} : { description: entry.story.description }),
    start: entry.doc.start.kind,
    tags: entry.doc.tags,
    ...(entry.story.expectedState === undefined
      ? {}
      : { expectedState: entry.story.expectedState }),
    ...(entry.doc.seed === undefined
      ? {}
      : {
          seed: Object.freeze({
            label: entry.doc.seed.label,
            fixtures: entry.doc.seed.fixtures,
            resourceCount: entry.doc.seed.resourceCount,
            hasBoot: entry.doc.seed.hasBoot,
            ...(entry.doc.seed.actorId === undefined ? {} : { actorId: entry.doc.seed.actorId }),
          }),
        }),
  });

  const envelope = {
    kind: "story-run",
    story,
    outcome:
      outcome.kind === "story-run-blocked"
        ? Object.freeze({
            kind: outcome.kind,
            reason: outcome.reason,
          })
        : Object.freeze({
            kind: outcome.kind,
            finalState: outcome.finalSnapshot.value,
            receiptCount: outcome.receipts.length,
            issueCount: outcome.issues.length,
            receiptSummary: outcome.trace.report.summary,
            issueSummary: Object.freeze({
              count: outcome.trace.report.issues.length,
              kinds: summarizeIssueField(outcome.trace.report.issues, "kind"),
              sources: summarizeIssueField(outcome.trace.report.issues, "source"),
            }),
            outcomeSummary: Object.freeze({
              count: outcome.trace.report.outcomes.length,
              kinds: summarizeOutcomeField(outcome.trace.report.outcomes, "kind"),
              sources: summarizeOutcomeField(outcome.trace.report.outcomes, "source"),
            }),
          }),
    ...(check === undefined
      ? {}
      : {
          check: Object.freeze({
            kind: check.kind,
            ok: check.ok,
            checkCount: check.checks.length,
            failureCount: check.failures.length,
            checks: check.checks,
            failures: check.failures,
          }),
        }),
  };

  return Object.freeze(envelope);
}

export function formatStoryRunPretty(envelope) {
  const lines = [
    `# Story Run: ${envelope.story.id}`,
    `Machine: ${envelope.story.machineId}`,
    `Title: ${envelope.story.title}`,
  ];

  if (envelope.outcome.kind === "story-run-blocked") {
    lines.push("Execution: blocked", `Blocked reason: ${envelope.outcome.reason}`);
  } else {
    lines.push(
      "Execution: story-run",
      `Final state: ${envelope.outcome.finalState}`,
      `Receipt count: ${envelope.outcome.receiptCount}`,
      `Issue count: ${envelope.outcome.issueCount}`,
      `Receipt types: ${formatList(envelope.outcome.receiptSummary.receiptTypes)}`,
      `Related ids: ${formatList(envelope.outcome.receiptSummary.relatedIds)}`,
      `Issue kinds: ${formatList(envelope.outcome.issueSummary.kinds)}`,
      `Issue sources: ${formatList(envelope.outcome.issueSummary.sources)}`,
      `Outcome kinds: ${formatList(envelope.outcome.outcomeSummary.kinds)}`,
      `Outcome sources: ${formatList(envelope.outcome.outcomeSummary.sources)}`,
    );
  }

  if (envelope.check !== undefined) {
    lines.push(
      `Check: ${envelope.check.ok ? "pass" : "fail"} (${envelope.check.checkCount} checks, ${envelope.check.failureCount} failures)`,
    );

    if (envelope.check.failureCount > 0) {
      lines.push("Failures:");

      for (const failure of envelope.check.failures) {
        lines.push(`- ${failure.label}`);
      }
    }
  }

  return lines.join("\n");
}

export function formatStoryRunCompact(envelope) {
  const head = `story ${envelope.story.id} [${envelope.story.machineId}]`;

  if (envelope.outcome.kind === "story-run-blocked") {
    return `${head} blocked reason=${envelope.outcome.reason}${
      envelope.check === undefined ? "" : ` check=${envelope.check.ok ? "pass" : "fail"}`
    }`;
  }

  return [
    head,
    `finalState=${envelope.outcome.finalState}`,
    `receipts=${envelope.outcome.receiptCount}`,
    `issues=${envelope.outcome.issueCount}`,
    `receiptTypes=${formatList(envelope.outcome.receiptSummary.receiptTypes)}`,
    `relatedIds=${formatList(envelope.outcome.receiptSummary.relatedIds)}`,
    `issueKinds=${formatList(envelope.outcome.issueSummary.kinds)}`,
    `outcomeKinds=${formatList(envelope.outcome.outcomeSummary.kinds)}`,
    ...(envelope.check === undefined
      ? []
      : [
          `check=${envelope.check.ok ? "pass" : "fail"}`,
          `failures=${envelope.check.failureCount}`,
        ]),
  ].join(" ");
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

export const traceDiffSectionNames = Object.freeze([
  "event-sequence",
  "transitions",
  "state-changes",
  "issues",
  "resource-patches",
  "resource-freshness",
  "transaction-outcomes",
  "stream-outcomes",
  "child-outcomes",
  "timer-behavior",
]);

function traceDiffSections(diff) {
  return Object.freeze({
    "event-sequence": diff.eventSequence,
    transitions: diff.transitions,
    "state-changes": diff.stateChanges,
    issues: diff.issues,
    "resource-patches": diff.resourcePatches,
    "resource-freshness": diff.resourceFreshness,
    "transaction-outcomes": diff.transactionOutcomes,
    "stream-outcomes": diff.streamOutcomes,
    "child-outcomes": diff.childOutcomes,
    "timer-behavior": diff.timerBehavior,
  });
}

export function createTraceDiffEnvelope(left, right) {
  const diff = diffTrace(left.trace, right.trace);

  return Object.freeze({
    kind: "trace-diff",
    left: Object.freeze({
      path: left.path,
      source: left.source,
      machineId: left.trace.snapshot.machine.id,
    }),
    right: Object.freeze({
      path: right.path,
      source: right.source,
      machineId: right.trace.snapshot.machine.id,
    }),
    summary: diff.summary,
    sections: traceDiffSections(diff),
  });
}

export function createTraceDiffSectionEnvelope(envelope, section) {
  return Object.freeze({
    kind: "trace-diff-section",
    section,
    left: envelope.left,
    right: envelope.right,
    diff: envelope.sections[section],
  });
}

function formatTraceDiffItem(item) {
  return JSON.stringify(item);
}

export function formatTraceDiffText(envelope) {
  return [
    "# Trace Diff",
    `Left: ${envelope.left.machineId} (${envelope.left.source})`,
    `Right: ${envelope.right.machineId} (${envelope.right.source})`,
    `Matches: ${envelope.summary.matches ? "yes" : "no"}`,
    `Changed sections: ${formatList(envelope.summary.changedSections)}`,
  ].join("\n");
}

export function formatTraceDiffSectionText(envelope) {
  const firstDifferenceIndex = envelope.diff.firstDifferenceIndex ?? 0;
  const lines = [
    `# Trace Diff Section: ${envelope.section}`,
    `Left: ${envelope.left.machineId} (${envelope.left.source})`,
    `Right: ${envelope.right.machineId} (${envelope.right.source})`,
    `Matches: ${envelope.diff.matches ? "yes" : "no"}`,
    `First difference index: ${
      envelope.diff.firstDifferenceIndex === undefined ? "none" : envelope.diff.firstDifferenceIndex
    }`,
    `Left count: ${envelope.diff.left.length}`,
    `Right count: ${envelope.diff.right.length}`,
  ];

  if (!envelope.diff.matches) {
    if (envelope.diff.left[firstDifferenceIndex] !== undefined) {
      lines.push(
        `Left[${firstDifferenceIndex}]: ${formatTraceDiffItem(envelope.diff.left[firstDifferenceIndex])}`,
      );
    }

    if (envelope.diff.right[firstDifferenceIndex] !== undefined) {
      lines.push(
        `Right[${firstDifferenceIndex}]: ${formatTraceDiffItem(envelope.diff.right[firstDifferenceIndex])}`,
      );
    }
  }

  return lines.join("\n");
}
