import type {
  FlowActionInspection,
  AnyFlowMachine,
  FlowGraphDescriptor,
  FlowMicrostepInspection,
  FlowReplayDescriptor,
  FlowSnapshot,
  FlowStoriesDescriptor,
  FlowTransitionInspection,
  FlowTraceDescriptor,
  InferMachineContext,
  InferMachineEvent,
  InferMachineState,
} from "./types.js";

import { createGraphDescriptor } from "../graph-descriptor.js";
import {
  inspectMachineActions,
  inspectMachineMicrosteps,
  inspectMachineTransition,
} from "../machine-transition-inspection.js";
import { createTraceReport } from "../trace-report.js";

export const graphOf = <Machine extends AnyFlowMachine>(
  machine: Machine,
): FlowGraphDescriptor<Machine> => createGraphDescriptor(machine);

export const captureTrace = <
  Snapshot extends FlowSnapshot<any, any, any>,
  Options extends Readonly<Record<string, unknown>> | undefined = undefined,
>(
  snapshot: Snapshot,
  options?: Options,
): FlowTraceDescriptor<Snapshot, Options> => {
  const receipts = snapshot.receipts;
  const report = createTraceReport(receipts);

  return Object.freeze({
    kind: "trace" as const,
    snapshot,
    receipts,
    report,
    ...(options === undefined ? {} : { options }),
  });
};

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

export const replayTrace = <
  Machine extends AnyFlowMachine,
  Trace extends FlowTraceDescriptor<any, any>,
>(
  machine: Machine,
  trace: Trace,
): FlowReplayDescriptor<Machine, Trace> => {
  const report = createTraceReport(trace.receipts);

  return Object.freeze({
    kind: "replay" as const,
    machine,
    trace,
    receipts: trace.receipts,
    report,
  });
};

export const flowStories = <Machine extends AnyFlowMachine>(
  machine: Machine,
  stories: ReadonlyArray<Readonly<Record<string, unknown>>>,
): FlowStoriesDescriptor<Machine> =>
  Object.freeze({
    kind: "stories" as const,
    machine,
    stories,
  });
