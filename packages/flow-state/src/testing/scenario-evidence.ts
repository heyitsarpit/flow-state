import type {
  FlowScenarioEvidence,
  FlowScenarioEvidenceOutcome,
  FlowScenarioBlocked,
  FlowScenarioInternalError,
  FlowScenarioOutcome,
  FlowScenarioReport,
  FlowScenarioResult,
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

function runEvidenceOutcome(
  outcome: FlowScenarioResult,
): Extract<FlowScenarioEvidenceOutcome, Readonly<{ kind: "story-run" }>> {
  return Object.freeze({
    kind: outcome.kind,
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

function blockedEvidenceOutcome(
  outcome: FlowScenarioBlocked,
): Extract<FlowScenarioEvidenceOutcome, Readonly<{ kind: "story-run-blocked" }>> {
  return Object.freeze({
    kind: outcome.kind,
    reason: outcome.reason,
  });
}

function internalErrorEvidenceOutcome(
  outcome: FlowScenarioInternalError,
): Extract<FlowScenarioEvidenceOutcome, Readonly<{ kind: "scenario-internal-error" }>> {
  return Object.freeze({
    kind: outcome.kind,
    message: outcome.error instanceof Error ? outcome.error.message : String(outcome.error),
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
  source: FlowScenarioOutcome | FlowScenarioReport,
): FlowScenarioEvidence {
  const report = source.kind === "story-test" ? source : undefined;
  const outcome: FlowScenarioOutcome = source.kind === "story-test" ? source.outcome : source;
  const check = evidenceCheck(report);

  if (outcome.status === "success") {
    return Object.freeze({
      kind: "scenario-evidence",
      status: outcome.status,
      ok: check?.ok !== false,
      outcome: runEvidenceOutcome(outcome),
      ...(check === undefined ? {} : { check }),
    });
  }

  if (outcome.status === "blocked") {
    return Object.freeze({
      kind: "scenario-evidence",
      status: outcome.status,
      ok: false,
      outcome: blockedEvidenceOutcome(outcome),
      ...(check === undefined ? {} : { check }),
    });
  }

  if (outcome.status === "internal-error") {
    return Object.freeze({
      kind: "scenario-evidence",
      status: outcome.status,
      ok: false,
      outcome: internalErrorEvidenceOutcome(outcome),
      ...(check === undefined ? {} : { check }),
    });
  }

  return Object.freeze({
    kind: "scenario-evidence",
    status: outcome.status,
    ok: false,
    outcome: runEvidenceOutcome(outcome),
    ...(check === undefined ? {} : { check }),
  });
}
