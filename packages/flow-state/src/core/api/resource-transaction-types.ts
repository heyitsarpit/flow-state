import type { Effect, Option } from "effect";

import type { FlowConcurrencyPolicy } from "../../shared/contracts.js";
import type { FlowResourceSnapshot } from "./snapshot-types.js";

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

export type FlowTag<TId extends string = string, Schema = unknown> = Readonly<{
  readonly kind: "tag";
  readonly id: TId;
  readonly schema?: Schema;
  readonly __flowTagBrand?: "FlowTag";
}>;

export type FlowEvent = Readonly<{
  readonly type: string;
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
  readonly tags?: ReadonlyArray<FlowTag> | ((...params: Params) => ReadonlyArray<FlowTag>);
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

type FlowSuccessRoute<Value, Event extends FlowEvent> = [Value] extends [never]
  ? never
  : ((args: { readonly value: Value }) => Event) | FlowOutcomeTuple<Event>;

type FlowFailureRoute<Error, Event extends FlowEvent> = [Error] extends [never]
  ? never
  : ((args: { readonly error: Error }) => Event) | FlowOutcomeTuple<Event>;

export type FlowOutcomeRoutes<Value, Error, Event extends FlowEvent = FlowEvent> = Readonly<{
  readonly success?: FlowSuccessRoute<Value, Event>;
  readonly failure?: FlowFailureRoute<Error, Event>;
  readonly defect?: ((args: { readonly cause: unknown }) => Event) | FlowOutcomeTuple<Event>;
  readonly interrupt?: ((args: { readonly reason?: unknown }) => Event) | FlowOutcomeTuple<Event>;
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

export type UnknownFlowTransactionDefinition<Event extends FlowEvent = FlowEvent> = Readonly<{
  readonly kind: "transaction";
  readonly id: string;
  readonly config: Readonly<{
    readonly id: string;
    readonly params?: BivariantCallback<Record<string, unknown>, unknown>;
    readonly preview?: Readonly<{
      readonly apply: BivariantCallback<
        { readonly params: unknown },
        ReadonlyArray<FlowPreviewPatch>
      >;
    }>;
    readonly commit: BivariantCallback<unknown, Effect.Effect<unknown, unknown, unknown>>;
    readonly invalidates?:
      | ReadonlyArray<FlowInvalidationTarget>
      | BivariantCallback<{ readonly params: unknown }, ReadonlyArray<FlowInvalidationTarget>>;
    readonly routes?: Readonly<{
      readonly success?:
        | BivariantCallback<{ readonly value: unknown }, Event>
        | FlowOutcomeTuple<Event>;
      readonly failure?:
        | BivariantCallback<{ readonly error: unknown }, Event>
        | FlowOutcomeTuple<Event>;
      readonly defect?:
        | BivariantCallback<{ readonly cause: unknown }, Event>
        | FlowOutcomeTuple<Event>;
      readonly interrupt?:
        | BivariantCallback<{ readonly reason?: unknown }, Event>
        | FlowOutcomeTuple<Event>;
    }>;
    readonly scope?: FlowTransactionScope;
    readonly queue?: Readonly<{
      readonly when?: BivariantCallback<Record<string, unknown>, boolean>;
      readonly replay?: BivariantCallback<Record<string, unknown>, boolean>;
      readonly undo?: BivariantCallback<Record<string, unknown>, boolean>;
    }>;
    readonly concurrency?: FlowConcurrencyPolicy;
  }>;
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
