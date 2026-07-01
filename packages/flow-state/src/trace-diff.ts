import type {
  FlowReceipt,
  FlowTraceDescriptor,
  FlowTraceDiffDescriptor,
  FlowTraceDiffSection,
  FlowTraceDiffSectionName,
  FlowTraceOutcome,
} from "./public/types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  );
}

function stableKey(value: unknown): string {
  const serialized = JSON.stringify(stableValue(value));
  return serialized ?? String(value);
}

function createDiffSection<Item>(
  left: ReadonlyArray<Item>,
  right: ReadonlyArray<Item>,
): FlowTraceDiffSection<Item> {
  const length = Math.max(left.length, right.length);
  let firstDifferenceIndex: number | undefined;

  for (let index = 0; index < length; index += 1) {
    if (stableKey(left[index]) !== stableKey(right[index])) {
      firstDifferenceIndex = index;
      break;
    }
  }

  return Object.freeze({
    left,
    right,
    matches: firstDifferenceIndex === undefined,
    ...(firstDifferenceIndex === undefined ? {} : { firstDifferenceIndex }),
  });
}

function resourcePatches(trace: FlowTraceDescriptor): ReadonlyArray<FlowReceipt> {
  return Object.freeze(
    trace.report.resources.filter((receipt) => receipt.type === "resource:patch"),
  );
}

function transactionOutcomes(trace: FlowTraceDescriptor): ReadonlyArray<FlowTraceOutcome> {
  return Object.freeze(trace.report.outcomes.filter((outcome) => outcome.source === "transaction"));
}

export function diffTrace<Left extends FlowTraceDescriptor, Right extends FlowTraceDescriptor>(
  left: Left,
  right: Right,
): FlowTraceDiffDescriptor<Left, Right> {
  const eventSequence = createDiffSection(left.report.events, right.report.events);
  const transitions = createDiffSection(left.report.transitions, right.report.transitions);
  const issues = createDiffSection(left.report.issues, right.report.issues);
  const resourcePatchDiff = createDiffSection(resourcePatches(left), resourcePatches(right));
  const transactionOutcomeDiff = createDiffSection(
    transactionOutcomes(left),
    transactionOutcomes(right),
  );
  const changedSections: Array<FlowTraceDiffSectionName> = [];

  if (!eventSequence.matches) {
    changedSections.push("event-sequence");
  }
  if (!transitions.matches) {
    changedSections.push("transitions");
  }
  if (!issues.matches) {
    changedSections.push("issues");
  }
  if (!resourcePatchDiff.matches) {
    changedSections.push("resource-patches");
  }
  if (!transactionOutcomeDiff.matches) {
    changedSections.push("transaction-outcomes");
  }

  return Object.freeze({
    kind: "trace-diff" as const,
    left,
    right,
    summary: Object.freeze({
      matches: changedSections.length === 0,
      changedSections: Object.freeze(changedSections),
    }),
    eventSequence,
    transitions,
    issues,
    resourcePatches: resourcePatchDiff,
    transactionOutcomes: transactionOutcomeDiff,
  });
}
