import type { FlowScenarioEvidence, FlowTestPendingWork } from "../testing.js";

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
  evidence: FlowScenarioEvidence;
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

export function createScenarioEnvelope(
  entry: FlowCliScenarioEntry,
  evidence: FlowScenarioEvidence,
  pendingWork?: FlowTestPendingWork,
  savedTrace?: string,
): FlowCliScenarioEnvelope {
  return Object.freeze({
    kind: "story-run",
    story: storyMetadata(entry),
    evidence,
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
  const { evidence } = envelope;
  const { outcome } = evidence;
  const verdict =
    evidence.status === "blocked"
      ? "BLOCKED"
      : evidence.status === "internal-error"
        ? "ERROR"
        : evidence.ok
          ? "PASS"
          : "FAIL";
  const lines = [
    `story.run ${envelope.story.id} — ${verdict}`,
    `machine: ${envelope.story.machineId}`,
  ];

  if (outcome.kind === "story-run-blocked") {
    lines.push(`reason: ${outcome.reason}`);
  } else if (outcome.kind === "scenario-internal-error") {
    lines.push(`error: ${outcome.message}`);
  } else {
    lines.push(
      `status: ${evidence.status}`,
      `state: ${outcome.finalState}`,
      `evidence: ${outcome.receiptCount} receipts, ${outcome.correlationCount} correlations, ${outcome.issueCount} issues`,
    );
    if (outcome.outcomeSummary.count > 0) {
      lines.push(`outcomes: ${outcome.outcomeSummary.outcomes.join(", ")}`);
    }
    if (outcome.receiptSummary.relatedIds.length > 0) {
      const related = [...new Set(outcome.receiptSummary.relatedIds)].filter(
        (id) => id !== envelope.story.machineId,
      );
      if (related.length > 0) lines.push(`related: ${related.join(", ")}`);
    }
  }

  if (evidence.check !== undefined) {
    lines.push(
      `check: ${evidence.check.checkCount - evidence.check.failureCount}/${evidence.check.checkCount} passed`,
    );

    if (evidence.check.failureCount > 0) {
      lines.push("failed checks:");

      for (const failure of evidence.check.failures) {
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
  const { evidence } = envelope;
  const { outcome } = evidence;

  if (outcome.kind === "story-run-blocked") {
    return `${head} blocked reason=${outcome.reason}${
      evidence.check === undefined ? "" : ` check=${evidence.check.ok ? "pass" : "fail"}`
    }`;
  }

  if (outcome.kind === "scenario-internal-error") {
    return `${head} error=${JSON.stringify(outcome.message)}`;
  }

  return [
    head,
    `status=${evidence.status}`,
    `finalState=${outcome.finalState}`,
    `receipts=${outcome.receiptCount}`,
    `issues=${outcome.issueCount}`,
    `receiptTypes=${countedList(outcome.receiptSummary.receiptTypes)}`,
    `relatedIds=${formatList(outcome.receiptSummary.relatedIds)}`,
    `issueKinds=${formatList(outcome.issueSummary.kinds)}`,
    `outcomeKinds=${formatList(outcome.outcomeSummary.kinds)}`,
    ...(evidence.check === undefined
      ? []
      : [
          `check=${evidence.check.ok ? "pass" : "fail"}`,
          `failures=${evidence.check.failureCount}`,
        ]),
    ...(envelope.pendingWork === undefined ? [] : [formatPendingWorkCompact(envelope.pendingWork)]),
  ].join(" ");
}
