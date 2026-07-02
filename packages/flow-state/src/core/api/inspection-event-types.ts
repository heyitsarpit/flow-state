import type * as Duration from "effect/Duration";

import type { FlowActorSnapshotTree } from "./snapshot-types.js";

type BivariantCallback<Args, Result> = {
  bivarianceHack(args: Args): Result;
}["bivarianceHack"];

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
export type FlowInspectionEventType =
  | FlowInspectionActorEventType
  | FlowInspectionMachineEventType
  | FlowInspectionResourceEventType
  | FlowInspectionTransactionEventType
  | FlowInspectionStreamEventType
  | FlowInspectionTimerEventType
  | FlowInspectionChildEventType;
export type FlowInspectionEventFamily =
  | "actor"
  | "machine"
  | "resource"
  | "transaction"
  | "stream"
  | "timer"
  | "child";

export type FlowInspectionEventMetadata = Readonly<{
  readonly actorId: string;
  readonly rootActorId: string;
  readonly moduleId?: string;
  readonly appId?: string;
  readonly modulePath?: string;
  readonly ownerPath?: string;
  readonly machineName?: string;
  readonly screens?: ReadonlyArray<string>;
  readonly tags?: ReadonlyArray<string>;
  readonly dependencies?: ReadonlyArray<string>;
  readonly permissions?: ReadonlyArray<string>;
  readonly eventType?: string;
  readonly correlationId?: string;
  readonly timestamp: number;
  readonly sequence: number;
}>;

type FlowInspectionRecord = Readonly<{
  readonly id: string;
  readonly requestId?: string;
  readonly source?: string;
  readonly [key: string]: unknown;
}>;

type FlowInspectionReceiptEvent<
  Type extends Exclude<FlowInspectionEventType, "actor:snapshot">,
  Extra extends Readonly<Record<string, unknown>> = {},
> = FlowInspectionEventMetadata &
  FlowInspectionRecord &
  Readonly<{
    readonly type: Type;
  }> &
  Extra;

export type FlowInspectionActorReceiptEvent = FlowInspectionReceiptEvent<
  Exclude<FlowInspectionActorEventType, "actor:snapshot">
>;
export type FlowInspectionMachineEvent = FlowInspectionReceiptEvent<
  "machine:event",
  Readonly<{
    readonly eventType: string;
    readonly targetActorId: string;
    readonly sourceActorId?: string;
  }>
>;
export type FlowInspectionMachineReceiptEvent = FlowInspectionReceiptEvent<
  Exclude<FlowInspectionMachineEventType, "machine:event">
>;
export type FlowInspectionResourceEvent =
  FlowInspectionReceiptEvent<FlowInspectionResourceEventType>;
export type FlowInspectionTransactionEvent =
  FlowInspectionReceiptEvent<FlowInspectionTransactionEventType>;
export type FlowInspectionStreamEvent = FlowInspectionReceiptEvent<FlowInspectionStreamEventType>;
export type FlowInspectionTimerEvent = FlowInspectionReceiptEvent<FlowInspectionTimerEventType>;
export type FlowInspectionChildEvent = FlowInspectionReceiptEvent<
  FlowInspectionChildEventType,
  Readonly<{
    readonly childActorId: string;
  }>
>;

export type FlowInspectionSnapshotEvent = FlowInspectionEventMetadata &
  Readonly<{
    readonly type: "actor:snapshot";
    readonly id: string;
    readonly snapshot: FlowActorSnapshotTree;
    readonly sourceActorId?: string;
    readonly targetActorId?: string;
    readonly eventType?: string;
    readonly correlationId?: string;
  }>;

export type FlowInspectionEvent =
  | FlowInspectionActorReceiptEvent
  | FlowInspectionMachineEvent
  | FlowInspectionMachineReceiptEvent
  | FlowInspectionResourceEvent
  | FlowInspectionTransactionEvent
  | FlowInspectionStreamEvent
  | FlowInspectionTimerEvent
  | FlowInspectionChildEvent
  | FlowInspectionSnapshotEvent;

export type FlowInspectionListener<Message = FlowInspectionEvent> = BivariantCallback<
  Message,
  void
>;
export type FlowInspectionObserver<Message = FlowInspectionEvent> = Readonly<{
  readonly next: FlowInspectionListener<Message>;
  readonly error?: BivariantCallback<unknown, void>;
  readonly complete?: () => void;
}>;
export type FlowInspectionFilter = Readonly<{
  readonly type?: FlowInspectionEventType;
  readonly types?: ReadonlyArray<FlowInspectionEventType>;
  readonly family?: FlowInspectionEventFamily;
  readonly id?: string;
  readonly actorId?: string;
  readonly rootActorId?: string;
  readonly appId?: string;
  readonly moduleId?: string;
  readonly correlationId?: string;
  readonly eventType?: string;
  readonly afterSequence?: number;
  readonly predicate?: BivariantCallback<FlowInspectionEvent, boolean>;
}>;
export type FlowInspectionExportOptions<
  Redacted = FlowInspectionEvent,
  Serialized = Redacted,
> = Readonly<{
  readonly filter?: FlowInspectionFilter;
  readonly redact?: BivariantCallback<FlowInspectionEvent, Redacted>;
  readonly serialize?: BivariantCallback<Redacted, Serialized>;
}>;
export type FlowInspectionRetentionPolicy = Readonly<{
  readonly maxEvents?: number;
  readonly maxAge?: Duration.Input;
}>;
export type FlowInspectionSnapshot = Readonly<{
  readonly capturedAt: number;
  readonly lastSequence?: number;
  readonly entries: ReadonlyArray<FlowInspectionEvent>;
}>;
export type FlowInspectionSubscription = (() => void) &
  Readonly<{
    readonly unsubscribe: () => void;
    readonly closed: boolean;
  }>;
