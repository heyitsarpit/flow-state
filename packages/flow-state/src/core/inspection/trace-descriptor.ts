import type { FlowTraceDescriptor, FlowTraceSnapshot } from "../api/types.js";

import { createTraceActorHierarchy } from "./trace-actor-hierarchy.js";
import { createTraceReport } from "./trace-report.js";

export function createTraceDescriptor<
  Snapshot extends FlowTraceSnapshot,
  Options extends Readonly<Record<string, unknown>> | undefined = undefined,
>(snapshot: Snapshot, options?: Options): FlowTraceDescriptor<Snapshot, Options> {
  const receipts = snapshot.receipts;
  const actorHierarchy = createTraceActorHierarchy(snapshot);
  const report = createTraceReport(receipts, snapshot);

  return Object.freeze({
    kind: "trace" as const,
    snapshot,
    actorHierarchy,
    receipts,
    report,
    ...(options === undefined ? {} : { options }),
  });
}
