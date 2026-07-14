import type {
  FlowScenarioCheck,
  FlowScenarioOutcome,
  FlowScenarioReport,
  FlowScenarioStatus,
  FlowTestPendingWork,
} from "../testing.js";

import type { FlowCliStoryRegistryEntry } from "./story-registry.js";

type FlowCliScenarioEntry = FlowCliStoryRegistryEntry;

export type FlowCliScenarioEnvelope = Readonly<{
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
        status: "blocked";
        reason: string;
      }>
    | Readonly<{
        kind: "story-run";
        status: Exclude<FlowScenarioStatus, "blocked" | "internal-error">;
        finalState: string;
        receiptCount: number;
        correlationCount: number;
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
          outcomes: ReadonlyArray<string>;
        }>;
      }>
    | Readonly<{
        kind: "scenario-internal-error";
        status: "internal-error";
        message: string;
      }>;
  check?: Readonly<{
    kind: string;
    ok: boolean;
    checkCount: number;
    failureCount: number;
    checks: ReadonlyArray<FlowScenarioCheck>;
    failures: ReadonlyArray<FlowScenarioCheck>;
  }>;
  pendingWork?: FlowTestPendingWork;
  savedTrace?: string;
}>;

function formatList(values: ReadonlyArray<string>): string {
  return values.length === 0 ? "none" : values.join(", ");
}

function countedList(values: ReadonlyArray<string>): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts]
    .map(([value, count]) => (count === 1 ? value : `${value}×${count}`))
    .join(", ");
}

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

function storySeedJson(entry: FlowCliScenarioEntry) {
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

function storyMetadata(entry: FlowCliScenarioEntry): FlowCliScenarioEnvelope["story"] {
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

function scenarioOutcome(outcome: FlowScenarioOutcome): FlowCliScenarioEnvelope["outcome"] {
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
      outcomes: uniqueValues(
        outcome.trace.report.outcomes.map((entry) => `${entry.source}.${entry.kind}`),
      ),
    }),
  });
}

function scenarioCheck(check: FlowScenarioReport | undefined): FlowCliScenarioEnvelope["check"] {
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

export function createScenarioEnvelope(
  entry: FlowCliScenarioEntry,
  outcome: FlowScenarioOutcome,
  check?: FlowScenarioReport,
  pendingWork?: FlowTestPendingWork,
  savedTrace?: string,
): FlowCliScenarioEnvelope {
  const report = scenarioCheck(check);

  return Object.freeze({
    kind: "story-run",
    story: storyMetadata(entry),
    outcome: scenarioOutcome(outcome),
    ...(report === undefined ? {} : { check: report }),
    ...(pendingWork === undefined ? {} : { pendingWork }),
    ...(savedTrace === undefined ? {} : { savedTrace }),
  });
}

function formatPendingWorkCompact(pending: FlowTestPendingWork): string {
  const mailboxes =
    pending.mailboxes.length === 0
      ? "none"
      : pending.mailboxes.map((entry) => `${entry.id}(${entry.pending})`).join(",");
  const timers =
    pending.timers.length === 0
      ? "none"
      : pending.timers.map((entry) => `${entry.id}@${entry.dueAt}`).join(",");
  const streams = pending.streams.length === 0 ? "none" : pending.streams.join(",");
  const transactions = pending.transactions.length === 0 ? "none" : pending.transactions.join(",");
  const children =
    pending.children.length === 0
      ? "none"
      : pending.children.map((child) => `${child.id}[${child.status}]`).join(",");

  return [
    `pendingReady=${pending.ready}`,
    `pendingFibers=${pending.activeFibers}`,
    `pendingMailboxes=${mailboxes}`,
    `pendingTimers=${timers}`,
    `pendingStreams=${streams}`,
    `pendingTransactions=${transactions}`,
    `pendingChildren=${children}`,
    ...(pending.nextAfterMillis === undefined
      ? []
      : [`pendingNextAfterMillis=${pending.nextAfterMillis}`]),
  ].join(" ");
}

export function formatScenarioPretty(envelope: FlowCliScenarioEnvelope): string {
  const verdict =
    envelope.outcome.kind === "story-run-blocked"
      ? "BLOCKED"
      : envelope.outcome.kind === "scenario-internal-error"
        ? "ERROR"
        : envelope.check?.ok === false || envelope.outcome.status !== "success"
          ? "FAIL"
          : "PASS";
  const lines = [
    `story.run ${envelope.story.id} — ${verdict}`,
    `machine: ${envelope.story.machineId}`,
  ];

  if (envelope.outcome.kind === "story-run-blocked") {
    lines.push(`reason: ${envelope.outcome.reason}`);
  } else if (envelope.outcome.kind === "scenario-internal-error") {
    lines.push(`error: ${envelope.outcome.message}`);
  } else {
    lines.push(
      `status: ${envelope.outcome.status}`,
      `state: ${envelope.outcome.finalState}`,
      `evidence: ${envelope.outcome.receiptCount} receipts, ${envelope.outcome.correlationCount} correlations, ${envelope.outcome.issueCount} issues`,
    );
    if (envelope.outcome.outcomeSummary.count > 0) {
      lines.push(`outcomes: ${envelope.outcome.outcomeSummary.outcomes.join(", ")}`);
    }
    if (envelope.outcome.receiptSummary.relatedIds.length > 0) {
      const related = [...new Set(envelope.outcome.receiptSummary.relatedIds)].filter(
        (id) => id !== envelope.story.machineId,
      );
      if (related.length > 0) lines.push(`related: ${related.join(", ")}`);
    }
  }

  if (envelope.check !== undefined) {
    lines.push(
      `check: ${envelope.check.checkCount - envelope.check.failureCount}/${envelope.check.checkCount} passed`,
    );

    if (envelope.check.failureCount > 0) {
      lines.push("failed checks:");

      for (const failure of envelope.check.failures) {
        lines.push(`- ${failure.label}`);
      }
    }
  }

  if (envelope.pendingWork !== undefined) {
    const pending = envelope.pendingWork;
    const active: Array<string> = [];
    if (pending.ready > 0) active.push(`${pending.ready} ready`);
    if (pending.activeFibers > 0) active.push(`${pending.activeFibers} fibers`);
    if (pending.mailboxes.length > 0)
      active.push(`mailboxes ${pending.mailboxes.map((x) => `${x.id}(${x.pending})`).join(", ")}`);
    if (pending.timers.length > 0)
      active.push(`timers ${pending.timers.map((x) => `${x.id}@${x.dueAt}`).join(", ")}`);
    if (pending.streams.length > 0) active.push(`streams ${pending.streams.join(", ")}`);
    if (pending.transactions.length > 0)
      active.push(`transactions ${pending.transactions.join(", ")}`);
    if (pending.children.length > 0)
      active.push(`children ${pending.children.map((x) => `${x.id}[${x.status}]`).join(", ")}`);
    lines.push(`pending: ${active.length === 0 ? "none" : active.join("; ")}`);
  }
  if (envelope.savedTrace !== undefined) lines.push(`trace: ${envelope.savedTrace}`);

  return lines.join("\n");
}

export function formatScenarioCompact(envelope: FlowCliScenarioEnvelope): string {
  const head = `story ${envelope.story.id} [${envelope.story.machineId}]`;

  if (envelope.outcome.kind === "story-run-blocked") {
    return `${head} blocked reason=${envelope.outcome.reason}${
      envelope.check === undefined ? "" : ` check=${envelope.check.ok ? "pass" : "fail"}`
    }`;
  }

  if (envelope.outcome.kind === "scenario-internal-error") {
    return `${head} error=${JSON.stringify(envelope.outcome.message)}`;
  }

  return [
    head,
    `status=${envelope.outcome.status}`,
    `finalState=${envelope.outcome.finalState}`,
    `receipts=${envelope.outcome.receiptCount}`,
    `issues=${envelope.outcome.issueCount}`,
    `receiptTypes=${countedList(envelope.outcome.receiptSummary.receiptTypes)}`,
    `relatedIds=${formatList(envelope.outcome.receiptSummary.relatedIds)}`,
    `issueKinds=${formatList(envelope.outcome.issueSummary.kinds)}`,
    `outcomeKinds=${formatList(envelope.outcome.outcomeSummary.kinds)}`,
    ...(envelope.check === undefined
      ? []
      : [
          `check=${envelope.check.ok ? "pass" : "fail"}`,
          `failures=${envelope.check.failureCount}`,
        ]),
    ...(envelope.pendingWork === undefined ? [] : [formatPendingWorkCompact(envelope.pendingWork)]),
  ].join(" ");
}
