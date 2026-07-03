import type {
  FlowTraceChildDetail,
  FlowReceipt,
  FlowTraceDescriptor,
  FlowTraceDiffDescriptor,
  FlowTraceDiffSection,
  FlowTraceDiffSectionName,
  FlowTraceOutcome,
  FlowTraceResourceDetail,
  FlowTraceStateChange,
  FlowTraceStreamDetail,
  FlowTraceTimerDetail,
} from "../api/types.js";
import { stableKey } from "./stable-value.js";

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

function stateChanges(trace: FlowTraceDescriptor): ReadonlyArray<FlowTraceStateChange> {
  return Object.freeze(
    trace.report.correlations
      .filter(
        (correlation) =>
          correlation.stateBefore !== undefined || correlation.stateAfter !== undefined,
      )
      .map((correlation) =>
        Object.freeze({
          correlationId: correlation.correlationId,
          ...(correlation.summary.eventType === undefined
            ? {}
            : { eventType: correlation.summary.eventType }),
          ...(correlation.stateBefore === undefined
            ? {}
            : { stateBefore: correlation.stateBefore }),
          ...(correlation.stateAfter === undefined ? {} : { stateAfter: correlation.stateAfter }),
        }),
      ),
  );
}

function resourceFreshness(trace: FlowTraceDescriptor): ReadonlyArray<FlowTraceResourceDetail> {
  return Object.freeze(
    trace.report.correlations.flatMap((correlation) => correlation.details.resources),
  );
}

function transactionOutcomes(trace: FlowTraceDescriptor): ReadonlyArray<FlowTraceOutcome> {
  return Object.freeze(trace.report.outcomes.filter((outcome) => outcome.source === "transaction"));
}

function streamOutcomes(trace: FlowTraceDescriptor): ReadonlyArray<FlowTraceStreamDetail> {
  return Object.freeze(
    trace.report.correlations.flatMap((correlation) => correlation.details.streams),
  );
}

function childOutcomes(trace: FlowTraceDescriptor): ReadonlyArray<FlowTraceChildDetail> {
  return Object.freeze(
    trace.report.correlations.flatMap((correlation) => correlation.details.children),
  );
}

function timerBehavior(trace: FlowTraceDescriptor): ReadonlyArray<FlowTraceTimerDetail> {
  return Object.freeze(
    trace.report.correlations.flatMap((correlation) => correlation.details.timers),
  );
}

export function diffTrace<Left extends FlowTraceDescriptor, Right extends FlowTraceDescriptor>(
  left: Left,
  right: Right,
): FlowTraceDiffDescriptor<Left, Right> {
  const eventSequence = createDiffSection(left.report.events, right.report.events);
  const transitions = createDiffSection(left.report.transitions, right.report.transitions);
  const stateChangeDiff = createDiffSection(stateChanges(left), stateChanges(right));
  const issues = createDiffSection(left.report.issues, right.report.issues);
  const resourcePatchDiff = createDiffSection(resourcePatches(left), resourcePatches(right));
  const resourceFreshnessDiff = createDiffSection(
    resourceFreshness(left),
    resourceFreshness(right),
  );
  const transactionOutcomeDiff = createDiffSection(
    transactionOutcomes(left),
    transactionOutcomes(right),
  );
  const streamOutcomeDiff = createDiffSection(streamOutcomes(left), streamOutcomes(right));
  const childOutcomeDiff = createDiffSection(childOutcomes(left), childOutcomes(right));
  const timerBehaviorDiff = createDiffSection(timerBehavior(left), timerBehavior(right));
  const changedSections: Array<FlowTraceDiffSectionName> = [];

  if (!eventSequence.matches) {
    changedSections.push("event-sequence");
  }
  if (!transitions.matches) {
    changedSections.push("transitions");
  }
  if (!stateChangeDiff.matches) {
    changedSections.push("state-changes");
  }
  if (!issues.matches) {
    changedSections.push("issues");
  }
  if (!resourcePatchDiff.matches) {
    changedSections.push("resource-patches");
  }
  if (!resourceFreshnessDiff.matches) {
    changedSections.push("resource-freshness");
  }
  if (!transactionOutcomeDiff.matches) {
    changedSections.push("transaction-outcomes");
  }
  if (!streamOutcomeDiff.matches) {
    changedSections.push("stream-outcomes");
  }
  if (!childOutcomeDiff.matches) {
    changedSections.push("child-outcomes");
  }
  if (!timerBehaviorDiff.matches) {
    changedSections.push("timer-behavior");
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
    stateChanges: stateChangeDiff,
    issues,
    resourcePatches: resourcePatchDiff,
    resourceFreshness: resourceFreshnessDiff,
    transactionOutcomes: transactionOutcomeDiff,
    streamOutcomes: streamOutcomeDiff,
    childOutcomes: childOutcomeDiff,
    timerBehavior: timerBehaviorDiff,
  });
}
