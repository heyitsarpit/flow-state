import type { FlowMachine, FlowReceipt, FlowReceiptFacts, FlowSnapshot } from "@flow-state/core";

import {
  captureTrace as internalCaptureTrace,
  flowStories as internalFlowStories,
  graphOf as internalGraphOf,
  replayTrace as internalReplayTrace,
} from "../../flow-state/src/public/inspect.js";

export type FlowGraphDescriptor<Machine extends FlowMachine = FlowMachine> = Readonly<{
  readonly kind: "graph";
  readonly machine: Machine;
}>;

export type FlowTraceBuckets = Readonly<{
  readonly events: ReadonlyArray<FlowReceipt>;
  readonly transitions: ReadonlyArray<FlowReceipt>;
  readonly resources: ReadonlyArray<FlowReceipt>;
  readonly transactions: ReadonlyArray<FlowReceipt>;
  readonly streams: ReadonlyArray<FlowReceipt>;
  readonly children: ReadonlyArray<FlowReceipt>;
  readonly timers: ReadonlyArray<FlowReceipt>;
  readonly actors: ReadonlyArray<FlowReceipt>;
  readonly other: ReadonlyArray<FlowReceipt>;
}>;

export type FlowTraceLanes = Readonly<{
  readonly success: ReadonlyArray<FlowReceipt>;
  readonly failure: ReadonlyArray<FlowReceipt>;
  readonly defect: ReadonlyArray<FlowReceipt>;
  readonly interrupt: ReadonlyArray<FlowReceipt>;
}>;

export type FlowTraceSummary = FlowReceiptFacts &
  Readonly<{
    readonly eventType?: string;
  }>;

export type FlowTraceCorrelation = FlowTraceBuckets &
  Readonly<{
    readonly correlationId: string;
    readonly event: FlowReceipt;
    readonly receipts: ReadonlyArray<FlowReceipt>;
    readonly lanes: FlowTraceLanes;
    readonly summary: FlowTraceSummary;
    readonly sourceActorId?: string;
    readonly targetActorId?: string;
  }>;

export type FlowTraceReport = FlowTraceBuckets &
  Readonly<{
    readonly lanes: FlowTraceLanes;
    readonly correlations: ReadonlyArray<FlowTraceCorrelation>;
    readonly summary: FlowTraceSummary;
  }>;

export type FlowTraceDescriptor<
  Snapshot extends FlowSnapshot<any, any, any> = FlowSnapshot<any, any, any>,
  Options extends Readonly<Record<string, unknown>> | undefined =
    | Readonly<Record<string, unknown>>
    | undefined,
> = Readonly<{
  readonly kind: "trace";
  readonly snapshot: Snapshot;
  readonly receipts: Snapshot["receipts"];
  readonly report: FlowTraceReport;
  readonly options?: Options;
}>;

export type FlowReplayDescriptor<
  Machine extends FlowMachine = FlowMachine,
  Trace extends FlowTraceDescriptor<any, any> = FlowTraceDescriptor<any, any>,
> = Readonly<{
  readonly kind: "replay";
  readonly machine: Machine;
  readonly trace: Trace;
  readonly receipts: Trace["receipts"];
  readonly report: Trace["report"];
}>;

export type FlowStoriesDescriptor<Machine extends FlowMachine = FlowMachine> = Readonly<{
  readonly kind: "stories";
  readonly machine: Machine;
  readonly stories: ReadonlyArray<Readonly<Record<string, unknown>>>;
}>;

export type FlowInspectionSnapshotEvent = Readonly<{
  readonly type: "snapshot";
  readonly id: string;
  readonly snapshot: unknown;
}>;

export type FlowInspectionEvent = FlowInspectionSnapshotEvent | Readonly<Record<string, unknown>>;

export type FlowRuntimeInspection = Readonly<{
  readonly entries: () => ReadonlyArray<FlowInspectionEvent>;
  readonly subscribe: (listener: (event: FlowInspectionEvent) => void) => () => void;
}>;

// The facade owns public inspect types while the implementation still lives in core source.
export const graphOf = internalGraphOf as unknown as <Machine extends FlowMachine>(
  machine: Machine,
) => FlowGraphDescriptor<Machine>;

export const captureTrace = internalCaptureTrace as unknown as <
  Snapshot extends FlowSnapshot<any, any, any>,
  Options extends Readonly<Record<string, unknown>> | undefined = undefined,
>(
  snapshot: Snapshot,
  options?: Options,
) => FlowTraceDescriptor<Snapshot, Options>;

export const replayTrace = internalReplayTrace as unknown as <
  Machine extends FlowMachine,
  Trace extends FlowTraceDescriptor<any, any>,
>(
  machine: Machine,
  trace: Trace,
) => FlowReplayDescriptor<Machine, Trace>;

export const flowStories = internalFlowStories as unknown as <Machine extends FlowMachine>(
  machine: Machine,
  stories: ReadonlyArray<Readonly<Record<string, unknown>>>,
) => FlowStoriesDescriptor<Machine>;
