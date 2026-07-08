import { diffTrace as diffTraceRuntime } from "../../dist/inspect.mjs";

import type { FlowTraceDescriptor, FlowTraceDiffSectionName } from "../inspect.js";

import type { FlowCliNormalizedTraceInput, FlowCliTraceInputSource } from "./trace-input.js";

type FlowCliTraceDiffSide = Readonly<{
  path: string;
  source: FlowCliTraceInputSource;
  machineId: string;
}>;

type FlowCliTraceDiffSummary = Readonly<{
  matches: boolean;
  changedSections: ReadonlyArray<FlowTraceDiffSectionName>;
}>;

type FlowCliTraceDiffSection = Readonly<{
  matches: boolean;
  firstDifferenceIndex?: number;
  left: ReadonlyArray<unknown>;
  right: ReadonlyArray<unknown>;
}>;

export type FlowCliTraceDiffEnvelope = Readonly<{
  kind: "trace-diff";
  left: FlowCliTraceDiffSide;
  right: FlowCliTraceDiffSide;
  summary: FlowCliTraceDiffSummary;
  sections: Readonly<Record<FlowTraceDiffSectionName, FlowCliTraceDiffSection>>;
}>;

export type FlowCliTraceDiffSectionEnvelope = Readonly<{
  kind: "trace-diff-section";
  section: FlowTraceDiffSectionName;
  left: FlowCliTraceDiffSide;
  right: FlowCliTraceDiffSide;
  diff: FlowCliTraceDiffSection;
}>;

const diffTrace = diffTraceRuntime as <
  Left extends FlowTraceDescriptor,
  Right extends FlowTraceDescriptor,
>(
  left: Left,
  right: Right,
) => Readonly<{
  summary: FlowCliTraceDiffSummary;
  eventSequence: FlowCliTraceDiffSection;
  transitions: FlowCliTraceDiffSection;
  stateChanges: FlowCliTraceDiffSection;
  issues: FlowCliTraceDiffSection;
  resourcePatches: FlowCliTraceDiffSection;
  resourceFreshness: FlowCliTraceDiffSection;
  transactionOutcomes: FlowCliTraceDiffSection;
  streamOutcomes: FlowCliTraceDiffSection;
  childOutcomes: FlowCliTraceDiffSection;
  timerBehavior: FlowCliTraceDiffSection;
}>;

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
] as const satisfies ReadonlyArray<FlowTraceDiffSectionName>);

function traceDiffSections(
  diff: ReturnType<typeof diffTrace>,
): FlowCliTraceDiffEnvelope["sections"] {
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

export function createTraceDiffEnvelope(
  left: FlowCliNormalizedTraceInput,
  right: FlowCliNormalizedTraceInput,
): FlowCliTraceDiffEnvelope {
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

export function createTraceDiffSectionEnvelope(
  envelope: FlowCliTraceDiffEnvelope,
  section: FlowTraceDiffSectionName,
): FlowCliTraceDiffSectionEnvelope {
  return Object.freeze({
    kind: "trace-diff-section",
    section,
    left: envelope.left,
    right: envelope.right,
    diff: envelope.sections[section],
  });
}

function formatList(values: ReadonlyArray<string>): string {
  return values.length === 0 ? "none" : values.join(", ");
}

function formatTraceDiffItem(item: unknown): string {
  return JSON.stringify(item);
}

export function formatTraceDiffText(envelope: FlowCliTraceDiffEnvelope): string {
  return [
    "# Trace Diff",
    `Left: ${envelope.left.machineId} (${envelope.left.source})`,
    `Right: ${envelope.right.machineId} (${envelope.right.source})`,
    `Matches: ${envelope.summary.matches ? "yes" : "no"}`,
    `Changed sections: ${formatList(envelope.summary.changedSections)}`,
  ].join("\n");
}

export function formatTraceDiffSectionText(envelope: FlowCliTraceDiffSectionEnvelope): string {
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
