export const FLOW_INSPECTION_EVENT_TYPES_BY_FAMILY = Object.freeze({
  actor: Object.freeze([
    "actor:start",
    "actor:restore",
    "actor:dispose",
    "actor:subscribe",
    "actor:unsubscribe",
    "actor:snapshot",
  ] as const),
  machine: Object.freeze([
    "machine:event",
    "machine:guard",
    "machine:transition",
    "machine:microstep",
    "machine:microstep-limit",
    "machine:no-transition",
    "machine:action",
    "machine:update",
  ] as const),
  resource: Object.freeze([
    "resource:start",
    "resource:patch",
    "resource:invalidate",
    "resource:hydrate",
    "resource:placeholder",
    "resource:success",
    "resource:failure",
    "resource:defect",
    "resource:interrupt",
    "resource:freshness",
  ] as const),
  transaction: Object.freeze([
    "transaction:queue",
    "transaction:dequeue",
    "transaction:start",
    "transaction:success",
    "transaction:failure",
    "transaction:defect",
    "transaction:interrupt",
    "transaction:reject",
    "transaction:retry",
    "transaction:reset",
    "transaction:preview-patch",
    "transaction:rollback",
  ] as const),
  stream: Object.freeze([
    "stream:start",
    "stream:resume",
    "stream:done",
    "stream:failure",
    "stream:defect",
    "stream:interrupt",
  ] as const),
  timer: Object.freeze(["timer:start", "timer:resume", "timer:fire", "timer:interrupt"] as const),
  child: Object.freeze([
    "child:start",
    "child:success",
    "child:failure",
    "child:defect",
    "child:interrupt",
    "child:stop",
    "child:retry",
  ] as const),
});

export type FlowInspectionEventFamily = keyof typeof FLOW_INSPECTION_EVENT_TYPES_BY_FAMILY;

export type FlowInspectionActorEventType =
  (typeof FLOW_INSPECTION_EVENT_TYPES_BY_FAMILY.actor)[number];

export type FlowInspectionMachineEventType =
  (typeof FLOW_INSPECTION_EVENT_TYPES_BY_FAMILY.machine)[number];

export type FlowInspectionResourceEventType =
  (typeof FLOW_INSPECTION_EVENT_TYPES_BY_FAMILY.resource)[number];

export type FlowInspectionTransactionEventType =
  (typeof FLOW_INSPECTION_EVENT_TYPES_BY_FAMILY.transaction)[number];

export type FlowInspectionStreamEventType =
  (typeof FLOW_INSPECTION_EVENT_TYPES_BY_FAMILY.stream)[number];

export type FlowInspectionTimerEventType =
  (typeof FLOW_INSPECTION_EVENT_TYPES_BY_FAMILY.timer)[number];

export type FlowInspectionChildEventType =
  (typeof FLOW_INSPECTION_EVENT_TYPES_BY_FAMILY.child)[number];

export type FlowInspectionReceiptEventType =
  | Exclude<FlowInspectionActorEventType, "actor:snapshot">
  | FlowInspectionMachineEventType
  | FlowInspectionResourceEventType
  | FlowInspectionTransactionEventType
  | FlowInspectionStreamEventType
  | FlowInspectionTimerEventType
  | FlowInspectionChildEventType;

export type FlowInspectionEventType =
  | FlowInspectionReceiptEventType
  | Extract<FlowInspectionActorEventType, "actor:snapshot">;
