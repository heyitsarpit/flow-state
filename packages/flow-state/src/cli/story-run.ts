import type { FlowStoryRunOutcome, FlowStoryTestCheck, FlowStoryTestReport } from "../testing.js";

import type { FlowCliStoryRegistryEntry } from "./story-registry.js";

type FlowCliStoryRunEntry = FlowCliStoryRegistryEntry;

export type FlowCliStoryRunEnvelope = Readonly<{
  kind: "story-run";
  story: Readonly<{
    id: string;
    machineId: string;
    title: string;
    description?: string;
    start: string;
    tags: ReadonlyArray<string>;
    expectedState?: string;
    seed?: Readonly<{
      label: string;
      fixtures: ReadonlyArray<string>;
      resourceCount: number;
      hasBoot: boolean;
      actorId?: string;
    }>;
  }>;
  outcome:
    | Readonly<{
        kind: "story-run-blocked";
        reason: string;
      }>
    | Readonly<{
        kind: "story-run";
        finalState: string;
        receiptCount: number;
        issueCount: number;
        receiptSummary: Readonly<{
          receiptTypes: ReadonlyArray<string>;
          relatedIds: ReadonlyArray<string>;
        }>;
        issueSummary: Readonly<{
          count: number;
          kinds: ReadonlyArray<string>;
          sources: ReadonlyArray<string>;
        }>;
        outcomeSummary: Readonly<{
          count: number;
          kinds: ReadonlyArray<string>;
          sources: ReadonlyArray<string>;
        }>;
      }>;
  check?: Readonly<{
    kind: string;
    ok: boolean;
    checkCount: number;
    failureCount: number;
    checks: ReadonlyArray<FlowStoryTestCheck>;
    failures: ReadonlyArray<FlowStoryTestCheck>;
  }>;
}>;

function formatList(values: ReadonlyArray<string>): string {
  return values.length === 0 ? "none" : values.join(", ");
}

function uniqueValues(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return Object.freeze([...new Set(values)]);
}

function summarizeIssueField<
  Key extends "kind" | "source",
  Outcome extends Extract<FlowStoryRunOutcome, Readonly<{ kind: "story-run" }>>,
>(outcome: Outcome, field: Key): ReadonlyArray<string> {
  return uniqueValues(outcome.trace.report.issues.map((issue) => issue[field]));
}

function summarizeOutcomeField<
  Key extends "kind" | "source",
  Outcome extends Extract<FlowStoryRunOutcome, Readonly<{ kind: "story-run" }>>,
>(outcome: Outcome, field: Key): ReadonlyArray<string> {
  return uniqueValues(outcome.trace.report.outcomes.map((entry) => entry[field]));
}

function storySeedJson(entry: FlowCliStoryRunEntry) {
  if (entry.doc.seed === undefined) {
    return undefined;
  }

  return Object.freeze({
    label: entry.doc.seed.label,
    fixtures: entry.doc.seed.fixtures,
    resourceCount: entry.doc.seed.resourceCount,
    hasBoot: entry.doc.seed.hasBoot,
    ...(entry.doc.seed.actorId === undefined ? {} : { actorId: entry.doc.seed.actorId }),
  });
}

function storyMetadata(entry: FlowCliStoryRunEntry): FlowCliStoryRunEnvelope["story"] {
  const seed = storySeedJson(entry);

  return Object.freeze({
    id: entry.story.id,
    machineId: entry.machineId,
    title: entry.story.title,
    ...(entry.story.description === undefined ? {} : { description: entry.story.description }),
    start: entry.doc.start.kind,
    tags: entry.doc.tags,
    ...(entry.story.expectedState === undefined
      ? {}
      : { expectedState: entry.story.expectedState }),
    ...(seed === undefined ? {} : { seed }),
  });
}

function storyOutcome(outcome: FlowStoryRunOutcome): FlowCliStoryRunEnvelope["outcome"] {
  if (outcome.kind === "story-run-blocked") {
    return Object.freeze({
      kind: outcome.kind,
      reason: outcome.reason,
    });
  }

  return Object.freeze({
    kind: outcome.kind,
    finalState: outcome.finalSnapshot.value,
    receiptCount: outcome.receipts.length,
    issueCount: outcome.issues.length,
    receiptSummary: outcome.trace.report.summary,
    issueSummary: Object.freeze({
      count: outcome.trace.report.issues.length,
      kinds: summarizeIssueField(outcome, "kind"),
      sources: summarizeIssueField(outcome, "source"),
    }),
    outcomeSummary: Object.freeze({
      count: outcome.trace.report.outcomes.length,
      kinds: summarizeOutcomeField(outcome, "kind"),
      sources: summarizeOutcomeField(outcome, "source"),
    }),
  });
}

function storyCheck(check: FlowStoryTestReport | undefined): FlowCliStoryRunEnvelope["check"] {
  if (check === undefined) {
    return undefined;
  }

  return Object.freeze({
    kind: check.kind,
    ok: check.ok,
    checkCount: check.checks.length,
    failureCount: check.failures.length,
    checks: check.checks,
    failures: check.failures,
  });
}

export function createStoryRunEnvelope(
  entry: FlowCliStoryRunEntry,
  outcome: FlowStoryRunOutcome,
  check?: FlowStoryTestReport,
): FlowCliStoryRunEnvelope {
  const report = storyCheck(check);

  return Object.freeze({
    kind: "story-run",
    story: storyMetadata(entry),
    outcome: storyOutcome(outcome),
    ...(report === undefined ? {} : { check: report }),
  });
}

export function formatStoryRunPretty(envelope: FlowCliStoryRunEnvelope): string {
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

export function formatStoryRunCompact(envelope: FlowCliStoryRunEnvelope): string {
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
