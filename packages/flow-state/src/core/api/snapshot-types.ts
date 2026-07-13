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
  | "defect"
  | "queued"
  | "interrupt";
export type FlowStreamStatus = "idle" | "running" | "success" | "failure" | "defect" | "interrupt";
export type FlowTimerStatus = "scheduled" | "fired" | "interrupt";
export type FlowChildLifecycleSpawnReason = "state-entry" | "retry";
export type FlowChildLifecycleStopReason = "state-exit" | "parent-dispose" | "child-dispose";
export type FlowChildLifecycleRetryCause = "manual";

type FlowResourceSnapshotBase<Value> = Readonly<{
  readonly id: string;
  readonly activity: FlowResourceActivity;
  readonly freshness: FlowResourceFreshnessStatus;
  readonly previousValue?: Value;
  readonly updatedAt?: number;
  readonly invalidatedAt?: number;
  readonly expiresAt?: number;
  readonly requestId?: string;
  readonly isPlaceholderData: boolean;
}>;

export type FlowResourceEmptySnapshot<Value = unknown> = FlowResourceSnapshotBase<Value> &
  Readonly<{
    readonly status: "idle" | "loading";
    readonly availability: "empty";
    readonly value?: never;
    readonly placeholder?: never;
    readonly error?: never;
  }>;

export type FlowResourceValueSnapshot<
  Value = unknown,
  Error = unknown,
> = FlowResourceSnapshotBase<Value> &
  Readonly<{
    readonly status: "success" | "stale";
    readonly availability: "value";
    readonly value: Value;
    readonly placeholder?: Value;
    readonly error?: Error;
  }>;

export type FlowResourceFailureSnapshot<
  Value = unknown,
  Error = unknown,
> = FlowResourceSnapshotBase<Value> &
  Readonly<{
    readonly status: "failure";
    readonly availability: "failure";
    readonly value?: never;
    readonly placeholder?: never;
    readonly error: Error;
  }>;

export type FlowResourceSnapshot<Value = unknown, Error = unknown> =
  | FlowResourceEmptySnapshot<Value>
  | FlowResourceValueSnapshot<Value, Error>
  | FlowResourceFailureSnapshot<Value, Error>;

type FlowTransactionSnapshotBase = Readonly<{
  readonly id: string;
}>;

type FlowTransactionIdleSnapshot = FlowTransactionSnapshotBase &
  Readonly<{
    readonly status: "idle" | "pending" | "queued" | "interrupt";
    readonly value?: never;
    readonly error?: never;
  }>;

type FlowTransactionSuccessSnapshot<Value> = FlowTransactionSnapshotBase &
  Readonly<{
    readonly status: "success";
    readonly value: Value;
    readonly error?: never;
  }>;

type FlowTransactionFailureSnapshot<Error> = FlowTransactionSnapshotBase &
  Readonly<{
    readonly status: "failure";
    readonly value?: never;
    readonly error: Error;
  }>;

type FlowTransactionDefectSnapshot = FlowTransactionSnapshotBase &
  Readonly<{
    readonly status: "defect";
    readonly value?: never;
    readonly error?: never;
  }>;

export type FlowTransactionSnapshot<Value = unknown, Error = unknown> =
  | FlowTransactionIdleSnapshot
  | FlowTransactionSuccessSnapshot<Value>
  | FlowTransactionFailureSnapshot<Error>
  | FlowTransactionDefectSnapshot;

type FlowStreamSnapshotBase<Value> = Readonly<{
  readonly id: string;
  readonly generation?: number;
  readonly emitted?: number;
  readonly value?: Value;
}>;

type FlowStreamIdleSnapshot = FlowStreamSnapshotBase<never> &
  Readonly<{
    readonly status: "idle";
    readonly generation?: never;
    readonly emitted?: never;
    readonly value?: never;
    readonly error?: never;
  }>;

type FlowStreamRunningSnapshot<Value> = FlowStreamSnapshotBase<Value> &
  Readonly<{
    readonly status: "running";
    readonly error?: never;
  }>;

type FlowStreamSuccessSnapshot<Value> = FlowStreamSnapshotBase<Value> &
  Readonly<{
    readonly status: "success";
    readonly error?: never;
  }>;

type FlowStreamFailureSnapshot<Value, Error> = FlowStreamSnapshotBase<Value> &
  Readonly<{
    readonly status: "failure";
    readonly error: Error;
  }>;

type FlowStreamDefectSnapshot<Value> = FlowStreamSnapshotBase<Value> &
  Readonly<{
    readonly status: "defect";
    readonly error?: never;
  }>;

type FlowStreamInterruptSnapshot<Value> = FlowStreamSnapshotBase<Value> &
  Readonly<{
    readonly status: "interrupt";
    readonly error?: never;
  }>;

export type FlowStreamSnapshot<Value = unknown, Error = unknown> =
  | FlowStreamIdleSnapshot
  | FlowStreamRunningSnapshot<Value>
  | FlowStreamSuccessSnapshot<Value>
  | FlowStreamFailureSnapshot<Value, Error>
  | FlowStreamDefectSnapshot<Value>
  | FlowStreamInterruptSnapshot<Value>;

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
  readonly truncatedBeforeReceiptCount?: number;
  readonly receipts: ReadonlyArray<FlowReceipt>;
}>;

export type FlowRuntimeBootActorSnapshot = Readonly<{
  readonly id: string;
  readonly snapshot: FlowActorSnapshotTree;
}>;
