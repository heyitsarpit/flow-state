import type {
  AnyFlowMachine,
  FlowGraphDescriptor,
  FlowReplayDescriptor,
  FlowSnapshot,
  FlowStoriesDescriptor,
  FlowTraceDescriptor,
} from "./types.js";

import { createTraceReport } from "../trace-report.js";

export const flowExperimental: Readonly<{
  readonly graphOf: <Machine extends AnyFlowMachine>(
    machine: Machine,
  ) => FlowGraphDescriptor<Machine>;
  readonly captureTrace: <
    Snapshot extends FlowSnapshot<any, any, any>,
    Options extends Readonly<Record<string, unknown>> | undefined = undefined,
  >(
    snapshot: Snapshot,
    options?: Options,
  ) => FlowTraceDescriptor<Snapshot, Options>;
  readonly replayTrace: <
    Machine extends AnyFlowMachine,
    Trace extends FlowTraceDescriptor<any, any>,
  >(
    machine: Machine,
    trace: Trace,
  ) => FlowReplayDescriptor<Machine, Trace>;
  readonly flowStories: <Machine extends AnyFlowMachine>(
    machine: Machine,
    stories: ReadonlyArray<Readonly<Record<string, unknown>>>,
  ) => FlowStoriesDescriptor<Machine>;
}> = Object.freeze({
  graphOf: <Machine extends AnyFlowMachine>(machine: Machine): FlowGraphDescriptor<Machine> =>
    Object.freeze({
      kind: "graph" as const,
      machine,
    }),
  captureTrace: <
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
  },
  replayTrace: <Machine extends AnyFlowMachine, Trace extends FlowTraceDescriptor<any, any>>(
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
  },
  flowStories: <Machine extends AnyFlowMachine>(
    machine: Machine,
    stories: ReadonlyArray<Readonly<Record<string, unknown>>>,
  ): FlowStoriesDescriptor<Machine> =>
    Object.freeze({
      kind: "stories" as const,
      machine,
      stories,
    }),
});
