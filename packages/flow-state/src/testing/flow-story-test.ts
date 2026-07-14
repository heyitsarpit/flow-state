import type {
  AnyFlowMachine,
  FlowIssueSummary,
  FlowStoryTestCheck,
  FlowStoryTestCheckKind,
  FlowStoryTestReport,
  FlowStoryRunOutcome,
} from "../core/api/types.js";

function createCheck(
  kind: FlowStoryTestCheckKind,
  label: string,
  ok: boolean,
  expected?: string | ReadonlyArray<string>,
  actual?: string | ReadonlyArray<string>,
): FlowStoryTestCheck {
  return Object.freeze({
    kind,
    label,
    ok,
    ...(expected === undefined ? {} : { expected }),
    ...(actual === undefined ? {} : { actual }),
  });
}

function includesAll(actual: ReadonlyArray<string>, expected: ReadonlyArray<string>): boolean {
  return expected.every((value) => actual.includes(value));
}

function summarizeIssueField(
  issues: ReadonlyArray<FlowIssueSummary>,
  field: "kind" | "source",
): ReadonlyArray<string> {
  const seen = new Set<string>();
  const values: Array<string> = [];

  for (const issue of issues) {
    const value = issue[field];
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    values.push(value);
  }

  return Object.freeze(values);
}

function createChecks<Machine extends AnyFlowMachine>(
  outcome: FlowStoryRunOutcome<Machine>,
): ReadonlyArray<FlowStoryTestCheck> {
  if (outcome.kind === "story-run-blocked") {
    return Object.freeze([
      createCheck(
        "execution",
        `Story execution is blocked: ${outcome.reason}.`,
        false,
        "story-run",
        outcome.reason,
      ),
    ]);
  }

  const checks: Array<FlowStoryTestCheck> = [
    createCheck("execution", "Story executed successfully.", true, "story-run", outcome.kind),
  ];

  const { story } = outcome;
  const actualReceiptTypes = outcome.trace.report.summary.receiptTypes;
  const actualRelatedIds = outcome.trace.report.summary.relatedIds;
  const actualIssueKinds = summarizeIssueField(outcome.trace.report.issues, "kind");
  const actualIssueSources = summarizeIssueField(outcome.trace.report.issues, "source");
  const actualOutcomeKinds = Object.freeze(
    outcome.trace.report.outcomes.map((traceOutcome) => traceOutcome.kind),
  );
  const actualOutcomeSources = Object.freeze(
    outcome.trace.report.outcomes.map((traceOutcome) => traceOutcome.source),
  );

  if (story.expectedState !== undefined) {
    checks.push(
      createCheck(
        "expected-state",
        `Expected final state '${story.expectedState}'.`,
        outcome.finalSnapshot.value === story.expectedState,
        story.expectedState,
        outcome.finalSnapshot.value,
      ),
    );
  }

  if (story.expectedFacts?.receiptTypes !== undefined) {
    checks.push(
      createCheck(
        "receipt-types",
        "Expected receipt types were recorded.",
        includesAll(actualReceiptTypes, story.expectedFacts.receiptTypes),
        story.expectedFacts.receiptTypes,
        actualReceiptTypes,
      ),
    );
  }

  if (story.expectedFacts?.relatedIds !== undefined) {
    checks.push(
      createCheck(
        "related-ids",
        "Expected related ids were recorded.",
        includesAll(actualRelatedIds, story.expectedFacts.relatedIds),
        story.expectedFacts.relatedIds,
        actualRelatedIds,
      ),
    );
  }

  if (story.expectedFacts?.issueKinds !== undefined) {
    checks.push(
      createCheck(
        "issue-kinds",
        "Expected issue kinds were recorded.",
        includesAll(actualIssueKinds, story.expectedFacts.issueKinds),
        story.expectedFacts.issueKinds,
        actualIssueKinds,
      ),
    );
  }

  if (story.expectedFacts?.issueSources !== undefined) {
    checks.push(
      createCheck(
        "issue-sources",
        "Expected issue sources were recorded.",
        includesAll(actualIssueSources, story.expectedFacts.issueSources),
        story.expectedFacts.issueSources,
        actualIssueSources,
      ),
    );
  }

  if (story.expectedFacts?.outcomeKinds !== undefined) {
    checks.push(
      createCheck(
        "outcome-kinds",
        "Expected outcome kinds were recorded.",
        includesAll(actualOutcomeKinds, story.expectedFacts.outcomeKinds),
        story.expectedFacts.outcomeKinds,
        actualOutcomeKinds,
      ),
    );
  }

  if (story.expectedFacts?.outcomeSources !== undefined) {
    checks.push(
      createCheck(
        "outcome-sources",
        "Expected outcome sources were recorded.",
        includesAll(actualOutcomeSources, story.expectedFacts.outcomeSources),
        story.expectedFacts.outcomeSources,
        actualOutcomeSources,
      ),
    );
  }

  return Object.freeze(checks);
}

export function storyToTest<Machine extends AnyFlowMachine>(
  outcome: FlowStoryRunOutcome<Machine>,
): FlowStoryTestReport<Machine> {
  const checks = createChecks(outcome);
  const failures = Object.freeze(checks.filter((check) => !check.ok));

  return Object.freeze({
    kind: "story-test" as const,
    story: outcome.story,
    outcome,
    ok: failures.length === 0,
    checks,
    failures,
  });
}
