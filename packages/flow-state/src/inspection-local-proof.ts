import type {
  FlowInspectionEvent,
  FlowLocalInspectionProof,
  FlowTraceDescriptor,
} from "./core/api/types.js";

import {
  formatInspectionTimelinePretty,
  formatTracePretty,
} from "./core/inspection/inspection-format.js";
import { exportTraceArtifact } from "./trace-artifact.js";

export function createLocalInspectionProof(
  trace: FlowTraceDescriptor,
  eventTimeline: ReadonlyArray<FlowInspectionEvent> = [],
): FlowLocalInspectionProof {
  const timeline = Object.freeze([...eventTimeline]);

  return Object.freeze({
    kind: "local-inspection-proof" as const,
    machineId: trace.snapshot.machine.id,
    actorTree: trace.actorHierarchy,
    eventTimeline: timeline,
    correlations: trace.report.correlations,
    traceArtifact: exportTraceArtifact(trace),
    formatted: Object.freeze({
      eventTimeline: formatInspectionTimelinePretty(timeline),
      trace: formatTracePretty(trace),
    }),
  });
}
