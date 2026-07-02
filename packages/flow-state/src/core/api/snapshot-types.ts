import type { FlowReceipt } from "./receipt-types.js";

export type FlowResourceStatus = "idle" | "loading" | "success" | "failure" | "stale";
export type FlowResourceAvailability = "empty" | "value" | "failure";
export type FlowResourceActivity = "idle" | "fetching" | "paused";
export type FlowResourceFreshnessStatus = "fresh" | "stale" | "invalidated";
export type FlowTransactionStatus =
  | "idle"
  | "pending"
  | "success"
  | "failure"
  | "queued"
  | "interrupt";
export type FlowStreamStatus = "idle" | "running" | "success" | "failure" | "interrupt";
export type FlowTimerStatus = "scheduled" | "fired" | "interrupt";
export type FlowChildLifecycleSpawnReason = "state-entry" | "retry";
export type FlowChildLifecycleStopReason = "state-exit" | "parent-dispose" | "child-dispose";
export type FlowChildLifecycleRetryCause = "manual";

export type FlowResourceSnapshot<Value = unknown, Error = unknown> = Readonly<{
  readonly id: string;
  readonly status: FlowResourceStatus;
  readonly availability: FlowResourceAvailability;
  readonly activity: FlowResourceActivity;
  readonly freshness: FlowResourceFreshnessStatus;
  readonly value?: Value;
  readonly previousValue?: Value;
  readonly placeholder?: Value;
  readonly error?: Error;
  readonly updatedAt?: number;
  readonly invalidatedAt?: number;
  readonly expiresAt?: number;
  readonly requestId?: string;
  readonly isPlaceholderData: boolean;
}>;

export type FlowTransactionSnapshot<Value = unknown, Error = unknown> = Readonly<{
  readonly id: string;
  readonly status: FlowTransactionStatus;
  readonly value?: Value;
  readonly error?: Error;
}>;

export type FlowStreamSnapshot<Value = unknown, Error = unknown> = Readonly<{
  readonly id: string;
  readonly status: FlowStreamStatus;
  readonly generation?: number;
  readonly emitted?: number;
  readonly value?: Value;
  readonly error?: Error;
}>;

export type FlowTimerSnapshot = Readonly<{
  readonly id: string;
  readonly status: FlowTimerStatus;
  readonly generation: number;
  readonly parentState: string;
  readonly startedAt: number;
  readonly dueAt: number;
  readonly endedAt?: number;
}>;

export type FlowTestStreamSnapshot<Value = unknown, Error = unknown> = FlowStreamSnapshot<
  Value,
  Error
> &
  Readonly<{
    readonly generation: number;
    readonly emitted: number;
  }>;

export type FlowChildSnapshot = Readonly<{
  readonly id: string;
  readonly actorId?: string;
  readonly status: "idle" | "active" | "success" | "failure" | "interrupt" | "stopped";
  readonly state?: string;
  readonly snapshot?: FlowActorSnapshotTree;
  readonly parentState?: string;
  readonly supervision?: "stop-on-failure" | "continue-on-failure";
}>;

export type FlowActorSnapshotTree = Readonly<{
  readonly value: string;
  readonly context: unknown;
  readonly resources: Readonly<Record<string, FlowResourceSnapshot>>;
  readonly transactions: Readonly<Record<string, FlowTransactionSnapshot>>;
  readonly streams: Readonly<Record<string, FlowStreamSnapshot>>;
  readonly timers: Readonly<Record<string, FlowTimerSnapshot>>;
  readonly children: Readonly<Record<string, FlowChildSnapshot>>;
  readonly receipts: ReadonlyArray<FlowReceipt>;
}>;

export type FlowRuntimeBootActorSnapshot = Readonly<{
  readonly id: string;
  readonly snapshot: FlowActorSnapshotTree;
}>;
