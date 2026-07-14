import type {
  FlowInspectionEventFamily,
  FlowReceipt,
  FlowResourceReceipt,
  FlowTransactionReceipt,
  FlowTraceOutcome,
} from "../api/types.js";
import { FLOW_INSPECTION_EVENT_TYPES_BY_FAMILY } from "../api/inspection-event-vocabulary.js";

function inspectionTypeSet(...types: ReadonlyArray<string>): ReadonlySet<string> {
  return new Set(types);
}

const factTypesByFamily = Object.freeze({
  actor: inspectionTypeSet(...FLOW_INSPECTION_EVENT_TYPES_BY_FAMILY.actor),
  machine: inspectionTypeSet(...FLOW_INSPECTION_EVENT_TYPES_BY_FAMILY.machine),
  resource: inspectionTypeSet(...FLOW_INSPECTION_EVENT_TYPES_BY_FAMILY.resource),
  transaction: inspectionTypeSet(...FLOW_INSPECTION_EVENT_TYPES_BY_FAMILY.transaction),
  stream: inspectionTypeSet(...FLOW_INSPECTION_EVENT_TYPES_BY_FAMILY.stream),
  timer: inspectionTypeSet(...FLOW_INSPECTION_EVENT_TYPES_BY_FAMILY.timer),
  child: inspectionTypeSet(...FLOW_INSPECTION_EVENT_TYPES_BY_FAMILY.child),
} satisfies Readonly<Record<FlowInspectionEventFamily, ReadonlySet<string>>>);

const factFamilies: ReadonlyArray<readonly [FlowInspectionEventFamily, ReadonlySet<string>]> =
  Object.freeze([
    ["actor", factTypesByFamily.actor],
    ["machine", factTypesByFamily.machine],
    ["resource", factTypesByFamily.resource],
    ["transaction", factTypesByFamily.transaction],
    ["stream", factTypesByFamily.stream],
    ["timer", factTypesByFamily.timer],
    ["child", factTypesByFamily.child],
  ]);

const outcomeTypes = Object.freeze({
  success: inspectionTypeSet(
    "resource:success",
    "transaction:success",
    "stream:done",
    "child:success",
    "timer:fire",
  ),
  failure: inspectionTypeSet(
    "resource:failure",
    "transaction:failure",
    "stream:failure",
    "child:failure",
  ),
  defect: inspectionTypeSet(
    "resource:defect",
    "transaction:defect",
    "stream:defect",
    "child:defect",
  ),
  interrupt: inspectionTypeSet(
    "resource:interrupt",
    "transaction:interrupt",
    "stream:interrupt",
    "timer:interrupt",
    "child:interrupt",
  ),
} satisfies Readonly<Record<FlowTraceOutcome["kind"], ReadonlySet<string>>>);

const outcomeKinds: ReadonlyArray<readonly [FlowTraceOutcome["kind"], ReadonlySet<string>]> =
  Object.freeze([
    ["success", outcomeTypes.success],
    ["failure", outcomeTypes.failure],
    ["defect", outcomeTypes.defect],
    ["interrupt", outcomeTypes.interrupt],
  ]);

export function canonicalFactFamily(type: string): FlowInspectionEventFamily | undefined {
  return factFamilies.find(([, types]) => types.has(type))?.[0];
}

export function canonicalFactOutcomeKind(type: string): FlowTraceOutcome["kind"] | undefined {
  return outcomeKinds.find(([, types]) => types.has(type))?.[0];
}

export function isCanonicalResourceReceipt(receipt: FlowReceipt): receipt is FlowResourceReceipt {
  return canonicalFactFamily(receipt.type) === "resource";
}

export function isCanonicalTransactionReceipt(
  receipt: FlowReceipt,
): receipt is FlowTransactionReceipt {
  return canonicalFactFamily(receipt.type) === "transaction";
}

export function canonicalReceiptFamily(
  receipt: FlowReceipt,
): "resources" | "transactions" | "streams" | "timers" | "children" | undefined {
  const family = canonicalFactFamily(receipt.type);
  return family === "resource"
    ? "resources"
    : family === "transaction"
      ? "transactions"
      : family === "stream"
        ? "streams"
        : family === "timer"
          ? "timers"
          : family === "child"
            ? "children"
            : undefined;
}
