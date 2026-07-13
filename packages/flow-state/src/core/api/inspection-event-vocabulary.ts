export type FlowInspectionActorEventType =
  | "actor:start"
  | "actor:restore"
  | "actor:dispose"
  | "actor:subscribe"
  | "actor:unsubscribe"
  | "actor:snapshot";

export type FlowInspectionMachineEventType =
  | "machine:event"
  | "machine:guard"
  | "machine:transition"
  | "machine:microstep"
  | "machine:microstep-limit"
  | "machine:no-transition"
  | "machine:action"
  | "machine:update";

export type FlowInspectionResourceEventType =
  | "resource:start"
  | "resource:patch"
  | "resource:invalidate"
  | "resource:hydrate"
  | "resource:placeholder"
  | "resource:success"
  | "resource:failure"
  | "resource:defect"
  | "resource:interrupt"
  | "resource:freshness";

export type FlowInspectionTransactionEventType =
  | "transaction:queue"
  | "transaction:dequeue"
  | "transaction:start"
  | "transaction:success"
  | "transaction:failure"
  | "transaction:defect"
  | "transaction:interrupt"
  | "transaction:reject"
  | "transaction:retry"
  | "transaction:reset"
  | "transaction:preview-patch"
  | "transaction:rollback";

export type FlowInspectionStreamEventType =
  | "stream:start"
  | "stream:resume"
  | "stream:done"
  | "stream:failure"
  | "stream:defect"
  | "stream:interrupt";

export type FlowInspectionTimerEventType =
  | "timer:start"
  | "timer:resume"
  | "timer:fire"
  | "timer:interrupt";

export type FlowInspectionChildEventType =
  | "child:start"
  | "child:success"
  | "child:failure"
  | "child:defect"
  | "child:interrupt"
  | "child:stop"
  | "child:retry";

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

export type FlowInspectionEventFamily =
  | "actor"
  | "machine"
  | "resource"
  | "transaction"
  | "stream"
  | "timer"
  | "child";
