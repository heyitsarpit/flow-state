import type { Effect, Option } from "effect";

import type { FlowConcurrencyPolicy } from "../shared-contracts.js";

declare const flowKeyBrand: unique symbol;
declare const flowTagBrand: unique symbol;

type BivariantCallback<Args, Result> = {
  bivarianceHack(args: Args): Result;
}["bivarianceHack"];

type EffectValue<T> = T extends Effect.Effect<infer Value, unknown, unknown> ? Value : never;
type EffectError<T> = T extends Effect.Effect<unknown, infer Error, unknown> ? Error : never;
type EffectRequirements<T> =
  T extends Effect.Effect<unknown, unknown, infer Requirements> ? Requirements : never;

export type FlowKey = ReadonlyArray<unknown> & {
  readonly [flowKeyBrand]: "FlowKey";
};

export type FlowTag<TId extends string = string> = Readonly<{
  readonly kind: "tag";
  readonly id: TId;
  readonly [flowTagBrand]: "FlowTag";
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

export type FlowReceipt = Readonly<{
  readonly type: string;
  readonly id?: string;
  readonly requestId?: string;
  readonly source?: string;
  readonly [key: string]: unknown;
}>;

export type FlowIssue = Readonly<{
  readonly kind: "failure" | "defect" | "interrupt";
  readonly source: "resource" | "transaction" | "machine" | "stream" | "child";
  readonly id: string;
  readonly error?: unknown;
  readonly cause?: unknown;
  readonly handled?: boolean;
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

export type FlowInspectionSnapshotEvent = Readonly<{
  readonly type: "actor:snapshot";
  readonly id: string;
  readonly snapshot: FlowActorSnapshotTree;
  readonly eventType?: string;
  readonly sourceActorId?: string;
  readonly targetActorId?: string;
  readonly correlationId?: string;
}>;

export type FlowInspectionEvent = FlowReceipt | FlowInspectionSnapshotEvent;

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

export type FlowInvalidationTarget = FlowKey | FlowTag | FlowResourceRef;

type InferResourceRefValue<Ref extends FlowResourceRef> =
  Ref extends FlowResourceRef<string, ReadonlyArray<unknown>, infer Value> ? Value : never;

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
