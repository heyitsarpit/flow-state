import { analyzeTrace, captureTrace, graphOf, importTraceArtifact } from "flow-state/inspect";
import { runFlowScenario, scenarioToReport } from "flow-state/testing";

export function traceSummary(trace: ReturnType<typeof captureTrace>) {
  const actorIds: Array<string> = [];
  const isActorNode = (
    value: unknown,
  ): value is Readonly<{ id: string; children?: Record<string, unknown> }> =>
    typeof value === "object" && value !== null && "id" in value && typeof value.id === "string";
  const visitActor = (node: Readonly<{ id: string; children?: Record<string, unknown> }>) => {
    actorIds.push(node.id);
    const children = node.children;
    if (children === undefined || typeof children !== "object" || children === null) {
      return;
    }

    for (const child of Object.values(children)) {
      if (isActorNode(child)) {
        visitActor(child);
      }
    }
  };

  visitActor(trace.actorHierarchy);

  return {
    kind: trace.kind,
    receiptCount: trace.receipts.length,
    correlationCount: trace.report.correlations.length,
    issueCount: trace.report.issues.length,
    outcomeCount: trace.report.outcomes.length,
    summary: trace.report.summary,
    actorIds,
  };
}

export function scenarioOutcomeSummary(outcome: Awaited<ReturnType<typeof runFlowScenario>>) {
  if (outcome.kind === "story-run-blocked") {
    return {
      kind: outcome.kind,
      status: "blocked" as const,
      storyId: outcome.story.id,
      reason: outcome.reason,
    };
  }

  if (outcome.kind === "scenario-internal-error") {
    return {
      kind: outcome.kind,
      status: "internal-error" as const,
      storyId: outcome.story.id,
      message: outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
    };
  }

  return {
    kind: outcome.kind,
    status: outcome.status,
    storyId: outcome.story.id,
    finalState: outcome.finalSnapshot.value,
    receiptCount: outcome.receipts.length,
    issueCount: outcome.issues.length,
    trace: traceSummary(outcome.trace),
  };
}

export function scenarioReportSummary(report: ReturnType<typeof scenarioToReport>) {
  return {
    kind: report.kind,
    storyId: report.story.id,
    ok: report.ok,
    checks: report.checks,
    failures: report.failures,
  };
}

export function importedTraceSummary(trace: ReturnType<typeof importTraceArtifact>) {
  return trace === undefined
    ? { imported: false as const }
    : { imported: true as const, ...traceSummary(trace) };
}

export function graphSummary(graph: ReturnType<typeof graphOf>) {
  return graph.toJSON();
}

export function analysisSummary(analysis: ReturnType<typeof analyzeTrace>) {
  return {
    kind: analysis.kind,
    machineId: analysis.machine.id,
    graph: analysis.graph.toJSON(),
    receiptCount: analysis.receipts.length,
    summary: analysis.report.summary,
  };
}
