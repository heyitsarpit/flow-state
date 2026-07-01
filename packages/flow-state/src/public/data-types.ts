import type { Effect, Option } from "effect";
import type * as Duration from "effect/Duration";

import type { FlowConcurrencyPolicy } from "../shared-contracts.js";

type BivariantCallback<Args, Result> = {
  bivarianceHack(args: Args): Result;
}["bivarianceHack"];

type EffectValue<T> = T extends Effect.Effect<infer Value, unknown, unknown> ? Value : never;
type EffectError<T> = T extends Effect.Effect<unknown, infer Error, unknown> ? Error : never;
type EffectRequirements<T> =
  T extends Effect.Effect<unknown, unknown, infer Requirements> ? Requirements : never;

export type FlowKey = ReadonlyArray<unknown> & {
  readonly __flowKeyBrand?: "FlowKey";
};

export type FlowTag<TId extends string = string> = Readonly<{
  readonly kind: "tag";
  readonly id: TId;
  readonly __flowTagBrand?: "FlowTag";
}>;

export type FlowEvent = Readonly<{
  readonly type: string;
}>;

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

export type FlowReceipt = Readonly<{
  readonly type: string;
  readonly id?: string;
  readonly requestId?: string;
  readonly source?: string;
  readonly [key: string]: unknown;
}>;

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
  | "query:start"
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

export type FlowInspectionListener = BivariantCallback<FlowInspectionEvent, void>;
export type FlowInspectionObserver = Readonly<{
  readonly next: FlowInspectionListener;
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

export type FlowResourceFreshness = Readonly<{
  readonly staleAfter: string | number;
  readonly onInvalidate?: "active" | "lazy" | "never";
}>;

export type FlowResourceConfig<
  Id extends string = string,
  Params extends ReadonlyArray<unknown> = ReadonlyArray<unknown>,
  Value = unknown,
  Error = never,
  Requirements = never,
  Schema = unknown,
> = Readonly<{
  readonly id: Id;
  readonly key: (...params: Params) => FlowKey;
  readonly lookup: (...params: Params) => Effect.Effect<Value, Error, Requirements>;
  readonly schema?: Schema;
  readonly tags?: (...params: Params) => ReadonlyArray<FlowTag>;
  readonly placeholder?: (...params: Params) => Option.Option<Value> | Value | null | undefined;
  readonly freshness?: FlowResourceFreshness;
}>;

export type FlowResourceRef<
  Id extends string = string,
  Params extends ReadonlyArray<unknown> = ReadonlyArray<unknown>,
  Value = unknown,
> = Readonly<{
  readonly kind: "resourceRef";
  readonly id: Id;
  readonly params: Params;
  readonly key: FlowKey;
  readonly __value?: Value;
}>;

export type FlowResourceDefinition<
  Id extends string = string,
  Params extends ReadonlyArray<unknown> = ReadonlyArray<unknown>,
  Value = unknown,
  Error = never,
  Requirements = never,
  Schema = unknown,
> = Readonly<{
  readonly kind: "resource";
  readonly id: Id;
  readonly config: FlowResourceConfig<Id, Params, Value, Error, Requirements, Schema>;
  readonly ref: (...params: Params) => FlowResourceRef<Id, Params, Value>;
}>;

export type FlowSeededResource<Ref extends FlowResourceRef = FlowResourceRef> = Readonly<{
  readonly ref: Ref;
  readonly value: Ref extends FlowResourceRef<string, ReadonlyArray<unknown>, infer Value>
    ? Value
    : never;
}>;

type InferResourceRefValue<Ref extends FlowResourceRef> =
  Ref extends FlowResourceRef<string, ReadonlyArray<unknown>, infer Value> ? Value : never;

export type FlowResourceHydrationEntry<Ref extends FlowResourceRef = FlowResourceRef> = Readonly<{
  readonly ref: Ref;
  readonly snapshot: Partial<FlowResourceSnapshot<InferResourceRefValue<Ref>>> &
    Readonly<Record<string, unknown>>;
}>;

export type FlowInvalidationTarget = FlowKey | FlowTag | FlowResourceRef;

export type FlowEnsureDefinition<Ref extends FlowResourceRef = FlowResourceRef> = Readonly<{
  readonly kind: "ensure";
  readonly ref: Ref;
}>;

export type FlowObserveDefinition<Ref extends FlowResourceRef = FlowResourceRef> = Readonly<{
  readonly kind: "observe";
  readonly ref: Ref;
}>;

export type FlowRefreshDefinition<Ref extends FlowResourceRef = FlowResourceRef> = Readonly<{
  readonly kind: "refresh";
  readonly ref: Ref;
}>;

export type FlowPatchDefinition<
  Ref extends FlowResourceRef = FlowResourceRef,
  Patch = unknown,
> = Readonly<{
  readonly kind: "patch";
  readonly ref: Ref;
  readonly patch: Patch;
}>;

export type FlowInvalidateDefinition<
  Target extends FlowInvalidationTarget = FlowInvalidationTarget,
> = Readonly<{
  readonly kind: "invalidate";
  readonly target: Target;
}>;

export type FlowPreviewPatch<Ref extends FlowResourceRef = FlowResourceRef> =
  | Readonly<{
      readonly ref: Ref;
      readonly replace: InferResourceRefValue<Ref>;
    }>
  | Readonly<{
      readonly ref: Ref;
      readonly patch: unknown;
    }>;

type ValidateFlowPreviewPatch<Patch> = Patch extends {
  readonly ref: infer Ref extends FlowResourceRef;
}
  ? Patch extends { readonly replace: infer Replace }
    ? Replace extends InferResourceRefValue<Ref>
      ? Readonly<{
          readonly ref: Ref;
          readonly replace: Replace;
        }>
      : never
    : Patch extends { readonly patch: infer PatchValue }
      ? Readonly<{
          readonly ref: Ref;
          readonly patch: PatchValue;
        }>
      : never
  : never;

type ValidateFlowPreviewPatches<PreviewPatches extends ReadonlyArray<unknown>> = PreviewPatches &
  ReadonlyArray<ValidateFlowPreviewPatch<PreviewPatches[number]>>;

export type FlowOutcomeTuple<Event extends FlowEvent> = readonly [Event["type"], string?];

export type FlowOutcomeRoutes<Value, Error, Event extends FlowEvent = FlowEvent> = Readonly<{
  readonly success?: BivariantCallback<{ readonly value: Value }, Event> | FlowOutcomeTuple<Event>;
  readonly failure?: BivariantCallback<{ readonly error: Error }, Event> | FlowOutcomeTuple<Event>;
  readonly defect?: BivariantCallback<{ readonly cause: unknown }, Event> | FlowOutcomeTuple<Event>;
  readonly interrupt?:
    | BivariantCallback<{ readonly reason?: unknown }, Event>
    | FlowOutcomeTuple<Event>;
}>;

export type FlowTransactionPreview<
  Params,
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<FlowPreviewPatch>,
> = Readonly<{
  readonly apply: BivariantCallback<
    { readonly params: Params },
    ValidateFlowPreviewPatches<PreviewPatches>
  >;
}>;

export type FlowTransactionScope = Readonly<{
  readonly id: string;
}>;

export type FlowTransactionConfig<
  Id extends string = string,
  Params = unknown,
  Value = unknown,
  Error = never,
  Requirements = never,
  Event extends FlowEvent = FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<FlowPreviewPatch>,
> = Readonly<{
  readonly id: Id;
  readonly params?: BivariantCallback<Record<string, unknown>, Params | null>;
  readonly preview?: FlowTransactionPreview<Params, PreviewPatches>;
  readonly commit: BivariantCallback<Params, Effect.Effect<Value, Error, Requirements>>;
  readonly invalidates?:
    | ReadonlyArray<FlowInvalidationTarget>
    | BivariantCallback<{ readonly params: Params }, ReadonlyArray<FlowInvalidationTarget>>;
  readonly routes?: FlowOutcomeRoutes<Value, Error, Event>;
  readonly scope?: FlowTransactionScope;
  readonly queue?: Readonly<{
    readonly when?: BivariantCallback<Record<string, unknown>, boolean>;
    readonly replay?: BivariantCallback<Record<string, unknown>, boolean>;
    readonly undo?: BivariantCallback<Record<string, unknown>, boolean>;
  }>;
  readonly concurrency?: FlowConcurrencyPolicy;
}>;

export type FlowTransactionDefinition<
  Id extends string = string,
  Params = unknown,
  Value = unknown,
  Error = never,
  Requirements = never,
  Event extends FlowEvent = FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<FlowPreviewPatch>,
> = Readonly<{
  readonly kind: "transaction";
  readonly id: Id;
  readonly config: FlowTransactionConfig<
    Id,
    Params,
    Value,
    Error,
    Requirements,
    Event,
    PreviewPatches
  >;
}>;

export type FlowRunDefinition<
  Transaction extends Readonly<{ readonly id: string }> = Readonly<{ readonly id: string }>,
> = Readonly<{
  readonly kind: "run";
  readonly id: Transaction["id"];
  readonly transaction: Transaction;
}>;

export type InferResourceValue<Resource extends FlowResourceDefinition> =
  Resource extends FlowResourceDefinition<
    string,
    ReadonlyArray<unknown>,
    infer Value,
    unknown,
    unknown
  >
    ? Value
    : never;

export type InferResourceSchema<Resource extends FlowResourceDefinition> =
  Resource extends FlowResourceDefinition<
    string,
    ReadonlyArray<unknown>,
    unknown,
    unknown,
    unknown,
    infer Schema
  >
    ? Schema
    : never;

export type InferEffectValue<F> = EffectValue<F>;
export type InferEffectError<F> = EffectError<F>;
export type InferEffectRequirements<F> = EffectRequirements<F>;
