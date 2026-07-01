import type {
  FlowActionInspection,
  AnyFlowMachine,
  FlowGraphDescriptor,
  FlowInspectionEvent,
  FlowLocalInspectionProof,
  FlowMicrostepInspection,
  FlowNoTransitionExplanation,
  FlowSnapshot,
  FlowStory,
  FlowStoryDocDescriptor,
  FlowStoriesDescriptor,
  FlowTraceAnalysisDescriptor,
  FlowTraceArtifact,
  FlowTraceDiffDescriptor,
  FlowTraceIncidentSummary,
  FlowTransitionInspection,
  FlowTraceDescriptor,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "../../core/api/types.js";

import { createGraphDescriptor } from "./graph-descriptor.js";
import {
  createInspectionBufferSink,
  attachInspectionSink as connectInspectionSink,
} from "./inspection-sink.js";
import {
  formatInspectionEvent,
  formatInspectionEventPretty,
  formatInspectionTimeline,
  formatInspectionTimelinePretty,
  formatTrace,
  formatTracePretty,
} from "./inspection-format.js";
import { createLocalInspectionProof as createLocalInspectionProofBundle } from "./inspection-local-proof.js";
import {
  formatNoTransitionSummary,
  formatRehydrationSummary,
  formatResourceFreshnessReport,
  formatTransactionOverlapSummary,
} from "./inspection-semantic-summary.js";
import {
  inspectMachineActions,
  inspectMachineMicrosteps,
  inspectMachineTransition,
  whyNoMachineTransition,
} from "./machine-transition-inspection.js";
import { createStoryDoc } from "../../story-doc.js";
import {
  compressTraceArtifact as createCompressedTraceArtifact,
  decompressTraceArtifact as createDecompressedTraceArtifact,
  exportTraceArtifact as createTraceArtifact,
  importTraceArtifact as createImportedTraceArtifact,
} from "../../trace-artifact.js";
import { createTraceDescriptor } from "../../trace-descriptor.js";
import { diffTrace as createTraceDiff } from "../../trace-diff.js";
import { summarizeTrace as createTraceIncidentSummary } from "../../trace-incident-summary.js";

export const graphOf = <Machine extends AnyFlowMachine>(
  machine: Machine,
): FlowGraphDescriptor<Machine> => createGraphDescriptor(machine);

export const captureTrace = <
  Snapshot extends FlowSnapshot<any, any, any>,
  Options extends Readonly<Record<string, unknown>> | undefined = undefined,
>(
  snapshot: Snapshot,
  options?: Options,
): FlowTraceDescriptor<Snapshot, Options> => createTraceDescriptor(snapshot, options);

export const inspectTransition = <Machine extends AnyFlowMachine>(
  machine: Machine,
  snapshot: FlowSnapshot<
    InferMachineContext<Machine>,
    InferMachineState<Machine>,
    InferMachineEvent<Machine>
  >,
  event: InferMachineEvent<Machine>,
): FlowTransitionInspection<
  InferMachineContext<Machine>,
  InferMachineEvent<Machine>,
  InferMachineState<Machine>,
  Machine
> => inspectMachineTransition(machine, snapshot, event);

export const inspectMicrosteps = <Machine extends AnyFlowMachine>(
  machine: Machine,
  snapshot: FlowSnapshot<
    InferMachineContext<Machine>,
    InferMachineState<Machine>,
    InferMachineEvent<Machine>
  >,
  event: InferMachineEvent<Machine>,
): FlowMicrostepInspection<
  InferMachineContext<Machine>,
  InferMachineEvent<Machine>,
  InferMachineState<Machine>,
  Machine
> => inspectMachineMicrosteps(machine, snapshot, event);

export const inspectActions = <Machine extends AnyFlowMachine>(
  machine: Machine,
  snapshot: FlowSnapshot<
    InferMachineContext<Machine>,
    InferMachineState<Machine>,
    InferMachineEvent<Machine>
  >,
  event: InferMachineEvent<Machine>,
): FlowActionInspection<
  InferMachineContext<Machine>,
  InferMachineEvent<Machine>,
  InferMachineState<Machine>,
  Machine
> => inspectMachineActions(machine, snapshot, event);

export const whyNoTransition = <Machine extends AnyFlowMachine>(
  machine: Machine,
  snapshot: FlowSnapshot<
    InferMachineContext<Machine>,
    InferMachineState<Machine>,
    InferMachineEvent<Machine>
  >,
  event: InferMachineEvent<Machine>,
):
  | FlowNoTransitionExplanation<
      InferMachineContext<Machine>,
      InferMachineEvent<Machine>,
      InferMachineState<Machine>,
      Machine
    >
  | undefined => whyNoMachineTransition(machine, snapshot, event);

export const analyzeTrace = <
  Machine extends AnyFlowMachine,
  Trace extends FlowTraceDescriptor<any, any>,
>(
  machine: Machine,
  trace: Trace,
): FlowTraceAnalysisDescriptor<Machine, Trace> => {
  return Object.freeze({
    kind: "trace-analysis" as const,
    machine,
    graph: graphOf(machine),
    trace,
    receipts: trace.receipts,
    report: trace.report,
  });
};

export const diffTrace = <Left extends FlowTraceDescriptor, Right extends FlowTraceDescriptor>(
  left: Left,
  right: Right,
): FlowTraceDiffDescriptor<Left, Right> => createTraceDiff(left, right);

export const exportTraceArtifact = (trace: FlowTraceDescriptor): FlowTraceArtifact =>
  createTraceArtifact(trace);

export const importTraceArtifact = (value: unknown) => createImportedTraceArtifact(value);

export const compressTraceArtifact = (trace: FlowTraceDescriptor) =>
  createCompressedTraceArtifact(trace);

export const decompressTraceArtifact = (bytes: Uint8Array) =>
  createDecompressedTraceArtifact(bytes);

export const summarizeTrace = (trace: FlowTraceDescriptor): FlowTraceIncidentSummary =>
  createTraceIncidentSummary(trace);

export const createLocalInspectionProof = (
  trace: FlowTraceDescriptor,
  eventTimeline?: ReadonlyArray<FlowInspectionEvent>,
): FlowLocalInspectionProof => createLocalInspectionProofBundle(trace, eventTimeline);

export const attachInspectionSink = connectInspectionSink;

export { createInspectionBufferSink };
export {
  formatInspectionEvent,
  formatInspectionEventPretty,
  formatInspectionTimeline,
  formatInspectionTimelinePretty,
  formatNoTransitionSummary,
  formatRehydrationSummary,
  formatResourceFreshnessReport,
  formatTrace,
  formatTracePretty,
  formatTransactionOverlapSummary,
};

export const flowStories = <Machine extends AnyFlowMachine, FixtureName extends string = string>(
  machine: Machine,
  stories: ReadonlyArray<FlowStory<Machine, FixtureName>>,
): FlowStoriesDescriptor<Machine, FixtureName> =>
  Object.freeze({
    kind: "stories" as const,
    machine,
    stories,
  });

export const storyToDoc = <Machine extends AnyFlowMachine, FixtureName extends string>(
  story: FlowStory<Machine, FixtureName>,
): FlowStoryDocDescriptor<Machine, FixtureName> => createStoryDoc(story);
