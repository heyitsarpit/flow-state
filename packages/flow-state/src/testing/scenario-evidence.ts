import type {
  FlowScenarioEvidence,
  FlowScenarioEvidenceOutcome,
  FlowScenarioOutcome,
  FlowScenarioReport,
} from "../core/api/types.js";

function uniqueValues(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return Object.freeze([...new Set(values)]);
}

function summarizeIssueField<
  Key extends "kind" | "source",
  Outcome extends Extract<FlowScenarioOutcome, Readonly<{ kind: "story-run" }>>,
>(outcome: Outcome, field: Key): ReadonlyArray<string> {
  return uniqueValues(outcome.trace.report.issues.map((issue) => issue[field]));
}

function summarizeOutcomeField<
  Key extends "kind" | "source",
  Outcome extends Extract<FlowScenarioOutcome, Readonly<{ kind: "story-run" }>>,
>(outcome: Outcome, field: Key): ReadonlyArray<string> {
  return uniqueValues(outcome.trace.report.outcomes.map((entry) => entry[field]));
}

function evidenceOutcome(outcome: FlowScenarioOutcome): FlowScenarioEvidenceOutcome {
  if (outcome.kind === "story-run-blocked") {
    return Object.freeze({
      kind: outcome.kind,
      status: outcome.status,
      reason: outcome.reason,
    });
  }

  if (outcome.kind === "scenario-internal-error") {
    return Object.freeze({
      kind: outcome.kind,
      status: outcome.status,
      message: outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
    });
  }

  return Object.freeze({
    kind: outcome.kind,
    status: outcome.status,
    finalState: outcome.finalSnapshot.value,
    receiptCount: outcome.receipts.length,
    correlationCount: outcome.trace.report.correlations.length,
    issueCount: outcome.issues.length,
    receiptSummary: Object.freeze({
      receiptTypes: outcome.trace.report.summary.receiptTypes,
      relatedIds: outcome.trace.report.summary.relatedIds,
    }),
    issueSummary: Object.freeze({
      count: outcome.trace.report.issues.length,
      kinds: summarizeIssueField(outcome, "kind"),
      sources: summarizeIssueField(outcome, "source"),
    }),
    outcomeSummary: Object.freeze({
      count: outcome.trace.report.outcomes.length,
      kinds: summarizeOutcomeField(outcome, "kind"),
      sources: summarizeOutcomeField(outcome, "source"),
      outcomes: uniqueValues(
        outcome.trace.report.outcomes.map((entry) => `${entry.source}.${entry.kind}`),
      ),
    }),
  });
}

function evidenceCheck(report: FlowScenarioReport | undefined): FlowScenarioEvidence["check"] {
  if (report === undefined) {
    return undefined;
  }

  return Object.freeze({
    kind: report.kind,
    ok: report.ok,
    checkCount: report.checks.length,
    failureCount: report.failures.length,
    checks: report.checks,
    failures: report.failures,
  });
}

export function createScenarioEvidence(
  outcome: FlowScenarioOutcome,
  report?: FlowScenarioReport,
): FlowScenarioEvidence {
  const check = evidenceCheck(report);
  const ok = outcome.status === "success" && check?.ok !== false;

  return Object.freeze({
    kind: "scenario-evidence" as const,
    status: outcome.status,
    ok,
    outcome: evidenceOutcome(outcome),
    ...(check === undefined ? {} : { check }),
  });
}
