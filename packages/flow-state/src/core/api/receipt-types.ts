type FlowReceiptBase<Type extends string = string> = Readonly<{
  readonly type: Type;
  readonly id?: string;
  readonly requestId?: string;
  readonly source?: string;
  readonly correlationId?: string;
  readonly [key: string]: unknown;
}>;

type FlowIdentifiedReceipt<Type extends string> = FlowReceiptBase<Type> &
  Readonly<{
    readonly id: string;
  }>;

type FlowResourceQueryMode = "ensure" | "observe" | "refresh";
type FlowResourceStatus = "idle" | "loading" | "success" | "failure" | "stale";
type FlowResourceAvailability = "empty" | "value" | "failure";
type FlowResourceActivity = "idle" | "fetching" | "paused";
type FlowResourceFreshnessStatus = "fresh" | "stale" | "invalidated";
type FlowResourceFreshnessReason =
  | "patch"
  | "lookup-success"
  | "lookup-failure"
  | "invalidate:command"
  | "invalidate:transaction";
type FlowResourceInvalidationReason = "command" | "transaction";

type FlowTransactionTrigger = "state" | "event";
type FlowTransactionOverlapCause =
  | "active-attempt"
  | "serialize-scope"
  | "cancel-previous"
  | "reject-while-running";

export type FlowResourceReceipt =
  | (FlowIdentifiedReceipt<"resource:start"> &
      Readonly<{
        readonly mode: FlowResourceQueryMode;
        readonly parentState: string;
      }>)
  | (FlowIdentifiedReceipt<"resource:patch"> &
      Readonly<{
        readonly parentState: string;
      }>)
  | (FlowIdentifiedReceipt<"resource:invalidate"> &
      Readonly<{
        readonly count: number;
        readonly reason: FlowResourceInvalidationReason;
        readonly parentState: string;
      }>)
  | (FlowIdentifiedReceipt<"resource:hydrate"> &
      Readonly<{
        readonly parentState: string;
        readonly status: FlowResourceStatus;
        readonly availability: FlowResourceAvailability;
        readonly activity: FlowResourceActivity;
        readonly freshness: FlowResourceFreshnessStatus;
        readonly updatedAt?: number;
        readonly invalidatedAt?: number;
      }>)
  | (FlowIdentifiedReceipt<"resource:placeholder"> &
      Readonly<{
        readonly mode: FlowResourceQueryMode;
        readonly parentState: string;
      }>)
  | (FlowIdentifiedReceipt<"resource:freshness"> &
      Readonly<{
        readonly from?: FlowResourceFreshnessStatus;
        readonly to: FlowResourceFreshnessStatus;
        readonly reason: FlowResourceFreshnessReason;
        readonly parentState: string;
      }>)
  | (FlowIdentifiedReceipt<
      "resource:success" | "resource:failure" | "resource:defect" | "resource:interrupt"
    > &
      Readonly<{
        readonly mode: FlowResourceQueryMode;
        readonly parentState: string;
        readonly status?: FlowResourceStatus;
        readonly availability?: FlowResourceAvailability;
        readonly freshness?: FlowResourceFreshnessStatus;
        readonly updatedAt?: number;
        readonly invalidatedAt?: number;
      }>);

type FlowTransactionTimedReceipt<
  Type extends "transaction:success" | "transaction:failure" | "transaction:defect",
> = FlowIdentifiedReceipt<Type> &
  Readonly<{
    readonly generation: number;
    readonly queueKey: string;
    readonly startedAt: number;
    readonly endedAt: number;
    readonly durationMillis: number;
    readonly routedEventType?: string;
    readonly parentState: string;
  }>;

type FlowTransactionInterruptReceipt =
  | (FlowIdentifiedReceipt<"transaction:interrupt"> &
      Readonly<{
        readonly parentState: string;
      }>)
  | (FlowIdentifiedReceipt<"transaction:interrupt"> &
      Readonly<{
        readonly generation: number;
        readonly queueKey: string;
        readonly startedAt: number;
        readonly endedAt: number;
        readonly durationMillis: number;
        readonly overlapCause?: FlowTransactionOverlapCause;
        readonly parentState: string;
      }>);

type FlowTransactionRejectReceipt =
  | (FlowIdentifiedReceipt<"transaction:reject"> &
      Readonly<{
        readonly queueKey: string;
        readonly overlapCause: FlowTransactionOverlapCause;
        readonly activeAttemptCount: number;
        readonly parentState: string;
      }>)
  | (FlowIdentifiedReceipt<"transaction:reject"> &
      Readonly<{
        readonly queueKey: string;
        readonly overlapCause: FlowTransactionOverlapCause;
        readonly activeAttemptCount: number;
        readonly queuedAttemptCount: number;
        readonly queueCapacity: number;
        readonly parentState: string;
      }>);

export type FlowTransactionReceipt =
  | (FlowIdentifiedReceipt<"transaction:queue"> &
      Readonly<{
        readonly queueKey: string;
        readonly overlapCause: FlowTransactionOverlapCause;
        readonly parentState: string;
      }>)
  | (FlowIdentifiedReceipt<"transaction:dequeue"> &
      Readonly<{
        readonly queueKey: string;
        readonly overlapCause: FlowTransactionOverlapCause;
        readonly parentState: string;
      }>)
  | (FlowIdentifiedReceipt<"transaction:start"> &
      Readonly<{
        readonly generation: number;
        readonly trigger: FlowTransactionTrigger;
        readonly queueKey: string;
        readonly startedAt: number;
        readonly parentState: string;
      }>)
  | FlowTransactionTimedReceipt<"transaction:success">
  | FlowTransactionTimedReceipt<"transaction:failure">
  | FlowTransactionTimedReceipt<"transaction:defect">
  | FlowTransactionInterruptReceipt
  | FlowTransactionRejectReceipt
  | (FlowIdentifiedReceipt<"transaction:retry"> &
      Readonly<{
        readonly parentState: string;
      }>)
  | (FlowIdentifiedReceipt<"transaction:reset"> &
      Readonly<{
        readonly parentState: string;
      }>)
  | (FlowIdentifiedReceipt<"transaction:preview-patch"> &
      Readonly<{
        readonly generation: number;
        readonly queueKey: string;
        readonly refId: string;
        readonly previewIndex: number;
        readonly previewCount: number;
        readonly parentState: string;
      }>)
  | (FlowIdentifiedReceipt<"transaction:rollback"> &
      Readonly<{
        readonly generation: number;
        readonly queueKey: string;
        readonly refId: string;
        readonly rollbackIndex: number;
        readonly rollbackCount: number;
        readonly parentState: string;
      }>);

type FlowLooseReceipt = FlowReceiptBase<string>;

export type FlowReceipt = FlowResourceReceipt | FlowTransactionReceipt | FlowLooseReceipt;

export type FlowReceiptFacts = Readonly<{
  readonly receiptTypes: ReadonlyArray<string>;
  readonly relatedIds: ReadonlyArray<string>;
}>;

export type FlowIssueFacts = FlowReceiptFacts &
  Readonly<{
    readonly correlationId?: string;
    readonly parentState?: string;
  }>;

export type FlowIssueSummary = FlowIssueFacts &
  Readonly<{
    readonly kind: "failure" | "defect" | "interrupt";
    readonly source: "resource" | "transaction" | "machine" | "stream" | "child";
    readonly id: string;
  }>;

export type FlowIssue = Readonly<{
  readonly kind: "failure" | "defect" | "interrupt";
  readonly source: "resource" | "transaction" | "machine" | "stream" | "child";
  readonly id: string;
  readonly error?: unknown;
  readonly cause?: unknown;
  readonly handled?: boolean;
  readonly facts?: FlowIssueFacts;
}>;
