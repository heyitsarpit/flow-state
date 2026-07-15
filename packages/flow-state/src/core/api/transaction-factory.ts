import type { Effect } from "effect";

import type {
  FlowEvent,
  FlowInvalidationTarget,
  FlowOutcomeRoutes,
  FlowPreviewPatch,
  FlowRouteFreeTransactionDefinition,
  FlowTransactionConfig,
  FlowTransactionDefinition,
  FlowTransactionPreview,
} from "./types.js";

import {
  createTransactionDefinition,
  createVoidTransactionDefinition,
} from "../../descriptors/transaction.js";

type InferredEffectValue<Return extends Effect.Effect<unknown, unknown, unknown>> =
  Return extends Effect.Effect<infer Value, unknown, unknown> ? Value : never;
type InferredEffectError<Return extends Effect.Effect<unknown, unknown, unknown>> =
  Return extends Effect.Effect<unknown, infer Error, unknown> ? Error : never;
type InferredEffectRequirements<Return extends Effect.Effect<unknown, unknown, unknown>> =
  Return extends Effect.Effect<unknown, unknown, infer Requirements> ? Requirements : never;

type BivariantSelectorCallback<Args, Result> = {
  select(args: Args): Result;
}["select"];

type ExactTransactionCallbackConfigWithParamsSelector<
  Id extends string,
  Params,
  Value,
  Error,
  Requirements,
  Event extends FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown>,
  SelectorInput,
> = Omit<
  FlowTransactionConfig<Id, Params, Value, Error, Requirements, Event, PreviewPatches>,
  "params" | "preview" | "commit" | "invalidates" | "routes" | "queue"
> &
  Readonly<{
    readonly params: BivariantSelectorCallback<SelectorInput, Params | null>;
    readonly preview?: FlowTransactionPreview<NoInfer<Params>, PreviewPatches>;
    readonly commit: (params: NoInfer<Params>) => Effect.Effect<Value, Error, Requirements>;
    readonly invalidates?:
      | ReadonlyArray<FlowInvalidationTarget>
      | ((args: { readonly params: NoInfer<Params> }) => ReadonlyArray<FlowInvalidationTarget>);
    readonly routes?: FlowOutcomeRoutes<Value, Error, Event>;
    readonly queue?: Readonly<{
      readonly when?: BivariantSelectorCallback<Record<string, unknown>, boolean>;
      readonly replay?: BivariantSelectorCallback<Record<string, unknown>, boolean>;
      readonly undo?: BivariantSelectorCallback<Record<string, unknown>, boolean>;
    }>;
  }>;

type FlowTransactionConfigWithoutParamsSelector<
  Id extends string,
  Params,
  Value,
  Error,
  Requirements,
  Event extends FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown>,
> = Omit<
  FlowTransactionConfig<Id, Params, Value, Error, Requirements, Event, PreviewPatches>,
  "params" | "routes"
> &
  Readonly<{
    readonly params?: undefined;
    readonly routes?: FlowOutcomeRoutes<Value, Error, Event>;
  }>;

type InferredTransactionConfigWithParams<
  Id extends string,
  Params,
  CommitReturn extends Effect.Effect<unknown, unknown, unknown>,
  Event extends FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown>,
  SelectorInput,
> = Omit<
  ExactTransactionCallbackConfigWithParamsSelector<
    Id,
    Params,
    InferredEffectValue<CommitReturn>,
    InferredEffectError<CommitReturn>,
    InferredEffectRequirements<CommitReturn>,
    Event,
    PreviewPatches,
    SelectorInput
  >,
  "commit"
> &
  Readonly<{ readonly commit: (params: NoInfer<Params>) => CommitReturn }>;

type InferredTransactionConfigWithoutParams<
  Id extends string,
  CommitReturn extends Effect.Effect<unknown, unknown, unknown>,
  Event extends FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown>,
> = Omit<
  FlowTransactionConfigWithoutParamsSelector<
    Id,
    void,
    InferredEffectValue<CommitReturn>,
    InferredEffectError<CommitReturn>,
    InferredEffectRequirements<CommitReturn>,
    Event,
    PreviewPatches
  >,
  "commit"
> &
  Readonly<{ readonly commit: () => CommitReturn }>;

function flowTransaction<
  Params,
  Value,
  Error = never,
  Requirements = never,
  const Event extends FlowEvent = FlowEvent,
  const Id extends string = string,
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<FlowPreviewPatch>,
  SelectorInput = Readonly<Record<string, unknown>>,
>(
  config: ExactTransactionCallbackConfigWithParamsSelector<
    Id,
    Params,
    Value,
    Error,
    Requirements,
    Event,
    PreviewPatches,
    SelectorInput
  > &
    Readonly<{ readonly routes: FlowOutcomeRoutes<Value, Error, Event> }>,
): FlowTransactionDefinition<
  Id,
  Params,
  Value,
  Error,
  Requirements,
  Event,
  PreviewPatches,
  SelectorInput,
  Event
>;
function flowTransaction<
  Params,
  Value,
  Error = never,
  Requirements = never,
  const Event extends FlowEvent = FlowEvent,
  const Id extends string = string,
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<FlowPreviewPatch>,
  SelectorInput = Readonly<Record<string, unknown>>,
>(
  config: ExactTransactionCallbackConfigWithParamsSelector<
    Id,
    Params,
    Value,
    Error,
    Requirements,
    Event,
    PreviewPatches,
    SelectorInput
  > &
    Readonly<{ readonly routes?: undefined }>,
): FlowRouteFreeTransactionDefinition<
  Id,
  Params,
  Value,
  Error,
  Requirements,
  Event,
  PreviewPatches,
  SelectorInput
>;
function flowTransaction<
  const Id extends string,
  CommitReturn extends Effect.Effect<unknown, unknown, unknown>,
  const Event extends FlowEvent = FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<FlowPreviewPatch>,
>(
  config: InferredTransactionConfigWithoutParams<Id, CommitReturn, Event, PreviewPatches> &
    Readonly<{
      readonly routes: FlowOutcomeRoutes<
        InferredEffectValue<CommitReturn>,
        InferredEffectError<CommitReturn>,
        Event
      >;
    }>,
): FlowTransactionDefinition<
  Id,
  void,
  InferredEffectValue<CommitReturn>,
  InferredEffectError<CommitReturn>,
  InferredEffectRequirements<CommitReturn>,
  Event,
  PreviewPatches,
  unknown,
  Event
>;
function flowTransaction<
  const Id extends string,
  CommitReturn extends Effect.Effect<unknown, unknown, unknown>,
  const Event extends FlowEvent = FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<FlowPreviewPatch>,
>(
  config: InferredTransactionConfigWithoutParams<Id, CommitReturn, Event, PreviewPatches> &
    Readonly<{ readonly routes?: undefined }>,
): FlowRouteFreeTransactionDefinition<
  Id,
  void,
  InferredEffectValue<CommitReturn>,
  InferredEffectError<CommitReturn>,
  InferredEffectRequirements<CommitReturn>,
  Event,
  PreviewPatches,
  unknown
>;
function flowTransaction<
  Params,
  Value,
  Error = never,
  Requirements = never,
  const Event extends FlowEvent = FlowEvent,
  const Id extends string = string,
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<FlowPreviewPatch>,
  SelectorInput = Readonly<Record<string, unknown>>,
>(
  config: ExactTransactionCallbackConfigWithParamsSelector<
    Id,
    Params,
    Value,
    Error,
    Requirements,
    Event,
    PreviewPatches,
    SelectorInput
  >,
): FlowTransactionDefinition<
  Id,
  Params,
  Value,
  Error,
  Requirements,
  Event,
  PreviewPatches,
  SelectorInput,
  Event
>;
function flowTransaction<
  Params extends void,
  Value,
  Error = never,
  Requirements = never,
  const Event extends FlowEvent = FlowEvent,
  const Id extends string = string,
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<FlowPreviewPatch>,
>(
  config: FlowTransactionConfigWithoutParamsSelector<
    Id,
    void,
    Value,
    Error,
    Requirements,
    Event,
    PreviewPatches
  > &
    Readonly<{ readonly routes: FlowOutcomeRoutes<Value, Error, Event> }>,
): FlowTransactionDefinition<
  Id,
  Params,
  Value,
  Error,
  Requirements,
  Event,
  PreviewPatches,
  unknown,
  Event
>;
function flowTransaction<
  Params extends void,
  Value,
  Error = never,
  Requirements = never,
  const Event extends FlowEvent = FlowEvent,
  const Id extends string = string,
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<FlowPreviewPatch>,
>(
  config: FlowTransactionConfigWithoutParamsSelector<
    Id,
    void,
    Value,
    Error,
    Requirements,
    Event,
    PreviewPatches
  > &
    Readonly<{ readonly routes?: undefined }>,
): FlowRouteFreeTransactionDefinition<
  Id,
  Params,
  Value,
  Error,
  Requirements,
  Event,
  PreviewPatches,
  unknown
>;
function flowTransaction<
  Params extends void,
  Value,
  Error = never,
  Requirements = never,
  const Event extends FlowEvent = FlowEvent,
  const Id extends string = string,
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<FlowPreviewPatch>,
>(
  config: FlowTransactionConfigWithoutParamsSelector<
    Id,
    void,
    Value,
    Error,
    Requirements,
    Event,
    PreviewPatches
  >,
): FlowTransactionDefinition<
  Id,
  Params,
  Value,
  Error,
  Requirements,
  Event,
  PreviewPatches,
  unknown,
  Event
>;
function flowTransaction<
  const Id extends string,
  Params,
  CommitReturn extends Effect.Effect<unknown, unknown, unknown>,
  const Event extends FlowEvent = FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<FlowPreviewPatch>,
  SelectorInput = Readonly<Record<string, unknown>>,
>(
  config: InferredTransactionConfigWithParams<
    Id,
    Params,
    CommitReturn,
    Event,
    PreviewPatches,
    SelectorInput
  > &
    Readonly<{
      readonly routes: FlowOutcomeRoutes<
        InferredEffectValue<CommitReturn>,
        InferredEffectError<CommitReturn>,
        Event
      >;
    }>,
): FlowTransactionDefinition<
  Id,
  Params,
  InferredEffectValue<CommitReturn>,
  InferredEffectError<CommitReturn>,
  InferredEffectRequirements<CommitReturn>,
  Event,
  PreviewPatches,
  SelectorInput,
  Event
>;
function flowTransaction<
  const Id extends string,
  Params,
  CommitReturn extends Effect.Effect<unknown, unknown, unknown>,
  const Event extends FlowEvent = FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<FlowPreviewPatch>,
  SelectorInput = Readonly<Record<string, unknown>>,
>(
  config: InferredTransactionConfigWithParams<
    Id,
    Params,
    CommitReturn,
    Event,
    PreviewPatches,
    SelectorInput
  > &
    Readonly<{ readonly routes?: undefined }>,
): FlowRouteFreeTransactionDefinition<
  Id,
  Params,
  InferredEffectValue<CommitReturn>,
  InferredEffectError<CommitReturn>,
  InferredEffectRequirements<CommitReturn>,
  Event,
  PreviewPatches,
  SelectorInput
>;
function flowTransaction<
  Params,
  Value,
  Error = never,
  Requirements = never,
  const Event extends FlowEvent = FlowEvent,
  const Id extends string = string,
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<FlowPreviewPatch>,
  SelectorInput = Readonly<Record<string, unknown>>,
>(
  config:
    | ExactTransactionCallbackConfigWithParamsSelector<
        Id,
        Params,
        Value,
        Error,
        Requirements,
        Event,
        PreviewPatches,
        SelectorInput
      >
    | FlowTransactionConfigWithoutParamsSelector<
        Id,
        void,
        Value,
        Error,
        Requirements,
        Event,
        PreviewPatches
      >,
):
  | FlowTransactionDefinition<
      Id,
      Params,
      Value,
      Error,
      Requirements,
      Event,
      PreviewPatches,
      SelectorInput,
      Event
    >
  | FlowTransactionDefinition<
      Id,
      void,
      Value,
      Error,
      Requirements,
      Event,
      PreviewPatches,
      unknown,
      Event
    > {
  if (config.params === undefined) {
    return createVoidTransactionDefinition<
      Id,
      Value,
      Error,
      Requirements,
      Event,
      PreviewPatches,
      Event
    >(config);
  }
  return createTransactionDefinition<
    Id,
    Params,
    Value,
    Error,
    Requirements,
    Event,
    PreviewPatches,
    SelectorInput,
    Event
  >(
    config as FlowTransactionConfig<Id, Params, Value, Error, Requirements, Event, PreviewPatches> &
      Readonly<{ readonly params: (args: Record<string, unknown>) => Params | null }>,
  );
}

export const transaction = flowTransaction;
