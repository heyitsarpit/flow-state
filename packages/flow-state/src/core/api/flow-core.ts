import type { Effect, Layer, Option, Stream as StreamType } from "effect";

import type {
  AnyFlowMachine,
  AnyFlowResourceDefinition,
  FlowEnsureDefinition,
  FlowEvent,
  FlowInvalidateDefinition,
  FlowInvalidationTarget,
  FlowIssue,
  FlowMachine,
  FlowMachineConfig,
  FlowMachineConfigShape,
  FlowModuleDefinition,
  FlowModuleInventory,
  FlowModuleMeta,
  FlowObserveDefinition,
  FlowOutcomeRoutes,
  FlowPatchDefinition,
  FlowRefreshDefinition,
  FlowKey,
  FlowTag,
  FlowResourceRef,
  FlowSelectedResourceQueryConfig,
  FlowSelectedResourceQueryDefinition,
  FlowRunDefinition,
  FlowRouteFreeTransactionDefinition,
  FlowRuntime,
  FlowSnapshot,
  InferEffectRequirements,
  InferMachineConfigContext,
  InferMachineConfigEvent,
  InferMachineConfigInitial,
  InferMachineConfigState,
} from "../../core/api/types.js";
import type {
  FlowAppDefinition,
  FlowChildConfig,
  FlowChildDefinition,
  FlowResourceConfig,
  FlowStreamConfig,
  FlowStreamDefinition,
  FlowStreamParamsArgs,
  FlowStreamPressure,
  FlowMachineRoutedBinding,
  FlowTransactionConfig,
  FlowTransactionBinding,
  FlowTransactionDefinition,
  FlowTransactionPreview,
  FlowViewConfig,
  FlowViewDefinition,
} from "../../core/api/types.js";

import { createAppDefinition } from "../../descriptors/app.js";
import { createChildDefinition } from "../../descriptors/child.js";
import { createMachineDefinition } from "../../descriptors/machine.js";
import { createModuleDefinition } from "../../descriptors/module.js";
import { createResourceDefinition } from "../../descriptors/resource.js";
import { createStreamDefinition } from "../../descriptors/stream.js";
import { createAfterDefinition } from "../../descriptors/timer.js";
import {
  createOutcomeRoutes,
  createTransactionDefinition,
  createVoidTransactionDefinition,
} from "../../descriptors/transaction.js";
import { viewSelectThrewDiagnostic } from "../../shared/diagnostics.js";
import { canMachineTransition } from "../machines/machine-transition.js";
import { withRoutedEventBrand } from "./routed-event-brand.js";
import { createViewDefinition } from "../../descriptors/view.js";
import { createRuntime, type RuntimeReadyLayer } from "../../runtime/contract-runtime.js";

type FlowResourceTags<Params extends ReadonlyArray<unknown>> =
  | ReadonlyArray<FlowTag>
  | ((...params: Params) => ReadonlyArray<FlowTag>);

type FlowResourceFreshnessConfig = Readonly<{
  readonly staleAfter: string | number;
  readonly onInvalidate?: "active" | "lazy" | "never";
}>;

type InferredResourceValue<LookupReturn extends Effect.Effect<unknown, unknown, unknown>> =
  LookupReturn extends Effect.Effect<infer Value, unknown, unknown> ? Value : never;

type InferredResourceError<LookupReturn extends Effect.Effect<unknown, unknown, unknown>> =
  LookupReturn extends Effect.Effect<unknown, infer Error, unknown> ? Error : never;

type InferredResourceRequirements<LookupReturn extends Effect.Effect<unknown, unknown, unknown>> =
  LookupReturn extends Effect.Effect<unknown, unknown, infer Requirements> ? Requirements : never;

type InferredEffectValue<Return extends Effect.Effect<unknown, unknown, unknown>> =
  Return extends Effect.Effect<infer Value, unknown, unknown> ? Value : never;
type InferredEffectError<Return extends Effect.Effect<unknown, unknown, unknown>> =
  Return extends Effect.Effect<unknown, infer Error, unknown> ? Error : never;
type InferredEffectRequirements<Return extends Effect.Effect<unknown, unknown, unknown>> =
  Return extends Effect.Effect<unknown, unknown, infer Requirements> ? Requirements : never;

type InferredStreamValue<Return extends StreamType.Stream<unknown, unknown, unknown>> =
  Return extends StreamType.Stream<infer Value, unknown, unknown> ? Value : never;
type InferredStreamError<Return extends StreamType.Stream<unknown, unknown, unknown>> =
  Return extends StreamType.Stream<unknown, infer Error, unknown> ? Error : never;
type InferredStreamRequirements<Return extends StreamType.Stream<unknown, unknown, unknown>> =
  Return extends StreamType.Stream<unknown, unknown, infer Requirements> ? Requirements : never;

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

type FlowResourceConfigInput<
  Id extends string,
  Params extends ReadonlyArray<unknown>,
  Value,
  LookupReturn extends Effect.Effect<unknown, unknown, unknown>,
  Schema,
> = Readonly<{
  readonly id: Id;
  readonly key: (...params: Params) => FlowKey;
  readonly lookup: (...params: Params) => LookupReturn;
  readonly schema?: Schema;
  readonly tags?: FlowResourceTags<Params>;
  readonly placeholder?: (...params: Params) => Option.Option<Value> | Value | null | undefined;
  readonly freshness?: FlowResourceFreshnessConfig;
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

type ExactStreamValueRoute<Value, Event extends FlowEvent> = [Value] extends [never]
  ? never
  : (value: NoInfer<Value>) => Event;

type ExactStreamFailureRoute<Error, Event extends FlowEvent> = [Error] extends [never]
  ? never
  : (error: NoInfer<Error>) => Event;

type ExactStreamRoutes<Value, Error, Event extends FlowEvent> = Readonly<{
  readonly value?: ExactStreamValueRoute<Value, Event>;
  readonly done?: () => Event;
  readonly failure?: ExactStreamFailureRoute<Error, Event>;
  readonly defect?: (cause: unknown) => Event;
  readonly interrupt?: () => Event;
}>;

type ExactStreamPressure<Value> =
  | Exclude<FlowStreamPressure, Readonly<{ readonly strategy: "coalesce-latest" }>>
  | Readonly<{
      readonly strategy: "coalesce-latest";
      readonly limit: number;
      readonly key: (value: NoInfer<Value>) => string;
    }>;

type ExactStreamParamsArgs<Context> = FlowStreamParamsArgs<Context>;

type ExactStreamCallbackConfig<
  Id extends string,
  Context,
  Event extends FlowEvent,
  Params,
  Value,
  Error,
  Requirements,
> = Omit<
  FlowStreamConfig<Id, Context, Event, Params, Value, Error, Requirements>,
  "params" | "pressure" | "subscribe" | "routes"
> &
  Readonly<{
    readonly params?: (args: ExactStreamParamsArgs<Context>) => Params;
    readonly subscribe: (args: {
      readonly params: NoInfer<Params>;
    }) => StreamType.Stream<Value, Error, Requirements>;
    readonly pressure?: ExactStreamPressure<Value>;
    readonly routes?: ExactStreamRoutes<Value, Error, Event>;
  }>;

type InferredStreamCallbackConfig<
  Id extends string,
  Context,
  Event extends FlowEvent,
  Params,
  SubscribeReturn extends StreamType.Stream<unknown, unknown, unknown>,
> = Omit<
  ExactStreamCallbackConfig<
    Id,
    Context,
    Event,
    Params,
    InferredStreamValue<SubscribeReturn>,
    InferredStreamError<SubscribeReturn>,
    InferredStreamRequirements<SubscribeReturn>
  >,
  "subscribe"
> &
  Readonly<{
    readonly subscribe: (args: { readonly params: NoInfer<Params> }) => SubscribeReturn;
  }>;

function flowResource<
  const Id extends string,
  Params extends ReadonlyArray<unknown>,
  LookupReturn extends Effect.Effect<unknown, unknown, unknown>,
  Schema = unknown,
>(
  config: FlowResourceConfigInput<
    Id,
    Params,
    InferredResourceValue<LookupReturn>,
    LookupReturn,
    Schema
  >,
): import("../../core/api/types.js").FlowResourceDefinition<
  Id,
  Params,
  InferredResourceValue<LookupReturn>,
  InferredResourceError<LookupReturn>,
  InferredResourceRequirements<LookupReturn>,
  Schema
>;
function flowResource<
  Params extends ReadonlyArray<unknown>,
  Value,
  Error = never,
  LookupReturn extends Effect.Effect<Value, Error, unknown> = Effect.Effect<Value, Error, never>,
  const Id extends string = string,
  Schema = unknown,
>(
  config: FlowResourceConfigInput<Id, Params, Value, LookupReturn, Schema>,
): import("../../core/api/types.js").FlowResourceDefinition<
  Id,
  Params,
  Value,
  Error,
  InferEffectRequirements<LookupReturn>,
  Schema
>;
function flowResource<
  Params extends ReadonlyArray<unknown>,
  Value,
  Error = never,
  LookupReturn extends Effect.Effect<Value, Error, unknown> = Effect.Effect<Value, Error, never>,
  const Id extends string = string,
  Schema = unknown,
>(
  config: FlowResourceConfigInput<Id, Params, Value, LookupReturn, Schema>,
): import("../../core/api/types.js").FlowResourceDefinition<
  Id,
  Params,
  Value,
  Error,
  InferEffectRequirements<LookupReturn>,
  Schema
> {
  return createResourceDefinition<
    Id,
    Params,
    Value,
    Error,
    InferEffectRequirements<LookupReturn>,
    Schema
  >(
    config as FlowResourceConfig<
      Id,
      Params,
      Value,
      Error,
      InferEffectRequirements<LookupReturn>,
      Schema
    >,
  );
}

type FlowAppConfig<Modules extends ReadonlyArray<FlowModuleDefinition>> = Readonly<{
  readonly modules: Modules;
}>;

function flowApp<const Modules extends ReadonlyArray<FlowModuleDefinition>>(
  config: FlowAppConfig<Modules>,
): FlowAppDefinition<Modules>;
function flowApp<const Modules extends ReadonlyArray<FlowModuleDefinition>>(
  config: FlowAppConfig<Modules>,
): FlowAppDefinition<Modules> {
  return createAppDefinition(config);
}

export const resource = flowResource;
export const app = flowApp;

function flowTransaction<
  Params,
  Value,
  Error = never,
  Requirements = never,
  const Event extends FlowEvent = FlowEvent,
  const Id extends string = string,
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<
    import("../../core/api/types.js").FlowPreviewPatch
  >,
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
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<
    import("../../core/api/types.js").FlowPreviewPatch
  >,
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
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<
    import("../../core/api/types.js").FlowPreviewPatch
  >,
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
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<
    import("../../core/api/types.js").FlowPreviewPatch
  >,
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
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<
    import("../../core/api/types.js").FlowPreviewPatch
  >,
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
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<
    import("../../core/api/types.js").FlowPreviewPatch
  >,
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
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<
    import("../../core/api/types.js").FlowPreviewPatch
  >,
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
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<
    import("../../core/api/types.js").FlowPreviewPatch
  >,
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
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<
    import("../../core/api/types.js").FlowPreviewPatch
  >,
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
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<
    import("../../core/api/types.js").FlowPreviewPatch
  >,
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
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<
    import("../../core/api/types.js").FlowPreviewPatch
  >,
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

type ArrayMember<Value> = Value extends ReadonlyArray<infer Member> ? Member : Value;

type MachineStateNodes<Config> = Config extends {
  readonly states: infer States;
}
  ? States[keyof States]
  : never;

type Property<Value, Key extends PropertyKey> =
  Value extends Readonly<Record<Key, infer Entry>> ? Entry : never;

type MachineTransitions<Config> =
  MachineStateNodes<Config> extends infer Node
    ? Node extends unknown
      ? Property<Property<Node, "on">, keyof Property<Node, "on">> | Property<Node, "always">
      : never
    : never;

type SubmittedTransactions<Config> =
  ArrayMember<MachineTransitions<Config>> extends infer Transition
    ? Transition extends { readonly submit: infer Transaction }
      ? Transaction
      : never
    : never;

type MachineInvokes<Config> =
  MachineStateNodes<Config> extends infer Node
    ? Node extends { readonly invoke: infer Invoke }
      ? ArrayMember<Invoke>
      : never
    : never;

type InvokedTransactions<Config> =
  MachineInvokes<Config> extends infer Invoke
    ? Invoke extends { readonly kind: "run"; readonly transaction: infer Transaction }
      ? Transaction
      : never
    : never;

type InvokedStreams<Config> = Extract<MachineInvokes<Config>, { readonly kind: "stream" }>;
type InvokedChildren<Config> = Extract<MachineInvokes<Config>, { readonly kind: "child" }>;

type TransactionSelectorInput<Transaction> = Transaction extends {
  readonly __flowTransactionFamily?: Readonly<{ readonly selectorInput: infer SelectorInput }>;
}
  ? SelectorInput
  : unknown;

type InvalidTransactionContext<Transaction, Context> = Transaction extends unknown
  ? unknown extends TransactionSelectorInput<Transaction>
    ? never
    : Readonly<{ readonly context: Context }> extends TransactionSelectorInput<Transaction>
      ? never
      : Transaction
  : never;

type StreamParamsInput<Definition> = Definition extends {
  readonly config: Readonly<{
    readonly params?: (args: infer ParamsInput) => unknown;
  }>;
}
  ? ParamsInput
  : unknown;

type InvalidStreamContext<Definition, Context> = Definition extends unknown
  ? unknown extends StreamParamsInput<Definition>
    ? never
    : Readonly<{ readonly context: Context }> extends StreamParamsInput<Definition>
      ? never
      : Definition
  : never;

type ChildInputParentContext<Definition> =
  Definition extends FlowChildDefinition<
    infer _Machine,
    infer _ChildEvent,
    infer _RoutedEvent,
    infer ParentContext
  >
    ? ParentContext
    : unknown;

type ChildInputEvent<Definition> =
  Definition extends FlowChildDefinition<
    infer _Machine,
    infer ChildEvent,
    infer _RoutedEvent,
    infer _ParentContext
  >
    ? ChildEvent
    : unknown;

type InvalidChildInput<Definition, Context, Event extends FlowEvent> = Definition extends unknown
  ? unknown extends ChildInputParentContext<Definition>
    ? never
    : Readonly<{ readonly context: Context; readonly event?: Event }> extends Readonly<{
          readonly context: ChildInputParentContext<Definition>;
          readonly event?: ChildInputEvent<Definition>;
        }>
      ? never
      : Definition
  : never;

type InvalidMachineBindings<Config, Context, Event extends FlowEvent> =
  | InvalidTransactionContext<SubmittedTransactions<Config>, Context>
  | InvalidTransactionContext<InvokedTransactions<Config>, Context>
  | InvalidStreamContext<InvokedStreams<Config>, Context>
  | InvalidChildInput<InvokedChildren<Config>, Context, Event>;

type ValidateMachineBindings<Config, Context, Event extends FlowEvent> = [
  InvalidMachineBindings<Config, Context, Event>,
] extends [never]
  ? unknown
  : Readonly<{ readonly __flowInvalidMachineBinding: never }>;

type ValidateCheckedMachineConfig<Config extends FlowMachineConfigShape> =
  Config extends FlowMachineConfig<
    Config["id"],
    InferMachineConfigContext<Config>,
    InferMachineConfigEvent<Config>,
    InferMachineConfigState<Config>,
    InferMachineConfigInitial<Config>
  >
    ? unknown
    : Readonly<{ readonly __flowInvalidCheckedMachineConfig: never }>;

type ValidateBoundMachineInitial<Config extends FlowMachineConfigShape> =
  Config["initial"] extends InferMachineConfigState<Config>
    ? unknown
    : Readonly<{ readonly __flowInvalidBoundMachineInitial: never }>;

type ConfiguredMachineTarget<Config> =
  ArrayMember<MachineTransitions<Config>> extends infer Entry
    ? Entry extends string
      ? Entry
      : Entry extends Readonly<{ readonly target?: infer Target }>
        ? Target
        : never
    : never;

type ValidateBoundMachineTargets<Config extends FlowMachineConfigShape> = [
  Exclude<Extract<ConfiguredMachineTarget<Config>, string>, InferMachineConfigState<Config>>,
] extends [never]
  ? unknown
  : Readonly<{ readonly __flowInvalidBoundMachineTarget: never }>;

type BoundMachineFactory<Context, Event extends FlowEvent> = <
  State extends string,
  Initial extends State = State,
  const Id extends string = string,
  const Config extends FlowMachineConfig<Id, Context, Event, State, Initial> = FlowMachineConfig<
    Id,
    Context,
    Event,
    State,
    Initial
  >,
>(
  config: Config &
    ValidateBoundMachineInitial<Config> &
    ValidateBoundMachineTargets<Config> &
    ValidateMachineBindings<Config, Context, Event>,
) => FlowMachine<
  Context,
  Event,
  InferMachineConfigState<Config>,
  InferMachineConfigInitial<Config>,
  Config["id"],
  Config
>;

export function machine<Context, Event extends FlowEvent>(): BoundMachineFactory<Context, Event>;

export function machine<const Config extends FlowMachineConfigShape>(
  config: Config &
    NoInfer<
      FlowMachineConfig<
        Config["id"],
        InferMachineConfigContext<Config>,
        InferMachineConfigEvent<Config>,
        InferMachineConfigState<Config>,
        InferMachineConfigInitial<Config>
      >
    > &
    ValidateMachineBindings<
      Config,
      InferMachineConfigContext<Config>,
      InferMachineConfigEvent<Config>
    >,
): FlowMachine<
  InferMachineConfigContext<Config>,
  InferMachineConfigEvent<Config>,
  InferMachineConfigState<Config>,
  InferMachineConfigInitial<Config>,
  Config["id"],
  Config
>;
export function machine<const Config extends FlowMachineConfigShape>(
  config: Config &
    ValidateCheckedMachineConfig<Config> &
    ValidateMachineBindings<
      Config,
      InferMachineConfigContext<Config>,
      InferMachineConfigEvent<Config>
    >,
): FlowMachine<
  InferMachineConfigContext<Config>,
  InferMachineConfigEvent<Config>,
  InferMachineConfigState<Config>,
  InferMachineConfigInitial<Config>,
  Config["id"],
  Config
>;
export function machine<
  Context,
  Event extends FlowEvent,
  State extends string,
  Initial extends State = State,
  const Id extends string = string,
  const Config extends FlowMachineConfig<Id, Context, Event, State, Initial> = FlowMachineConfig<
    Id,
    Context,
    Event,
    State,
    Initial
  >,
>(
  config: Config & ValidateMachineBindings<Config, Context, Event>,
): FlowMachine<Context, Event, State, Initial, Id, Config>;
export function machine<
  Context,
  Event extends FlowEvent,
  State extends string,
  Initial extends State = State,
  const Id extends string = string,
>(
  config?: FlowMachineConfig<Id, Context, Event, State, Initial>,
): FlowMachine<Context, Event, State, Initial, Id> | BoundMachineFactory<Context, Event> {
  if (config === undefined) {
    return ((boundConfig: FlowMachineConfig<Id, Context, Event, State, Initial>) =>
      createMachineDefinition<
        Context,
        Event,
        State,
        Initial,
        Id,
        FlowMachineConfig<Id, Context, Event, State, Initial>
      >(boundConfig)) as BoundMachineFactory<Context, Event>;
  }
  return createMachineDefinition(config);
}

export const view = <Context, State extends string, Selected, const Id extends string = string>(
  config: FlowViewConfig<Id, Context, State, Selected>,
): FlowViewDefinition<Context, State, Selected, Id> => createViewDefinition(config);

function flowStream<
  Context = unknown,
  const Event extends FlowEvent = FlowEvent,
  Params = void,
  Value = unknown,
  Error = never,
  Requirements = never,
  const Id extends string = string,
>(
  config: ExactStreamCallbackConfig<Id, Context, Event, Params, Value, Error, Requirements> &
    Readonly<{ readonly routes: ExactStreamRoutes<Value, Error, Event> }>,
): FlowStreamDefinition<
  Value,
  Error,
  Params,
  Event,
  Context,
  Id,
  Requirements,
  Params,
  Value,
  Error,
  Context,
  Event
>;
function flowStream<
  const Id extends string,
  Context = unknown,
  const Event extends FlowEvent = FlowEvent,
  Params = void,
  SubscribeReturn extends StreamType.Stream<unknown, unknown, unknown> = StreamType.Stream<
    unknown,
    never,
    never
  >,
>(
  config: InferredStreamCallbackConfig<Id, Context, Event, Params, SubscribeReturn> &
    Readonly<{
      readonly routes: ExactStreamRoutes<
        InferredStreamValue<SubscribeReturn>,
        InferredStreamError<SubscribeReturn>,
        Event
      >;
    }>,
): FlowStreamDefinition<
  InferredStreamValue<SubscribeReturn>,
  InferredStreamError<SubscribeReturn>,
  Params,
  Event,
  Context,
  Id,
  InferredStreamRequirements<SubscribeReturn>,
  Params,
  InferredStreamValue<SubscribeReturn>,
  InferredStreamError<SubscribeReturn>,
  Context,
  Event
>;
function flowStream<
  const Id extends string,
  Context = unknown,
  const Event extends FlowEvent = FlowEvent,
  Params = void,
  SubscribeReturn extends StreamType.Stream<unknown, unknown, unknown> = StreamType.Stream<
    unknown,
    never,
    never
  >,
>(
  config: InferredStreamCallbackConfig<Id, Context, Event, Params, SubscribeReturn> &
    Readonly<{ readonly routes?: undefined }>,
): FlowStreamDefinition<
  InferredStreamValue<SubscribeReturn>,
  InferredStreamError<SubscribeReturn>,
  Params,
  Event,
  Context,
  Id,
  InferredStreamRequirements<SubscribeReturn>,
  Params,
  InferredStreamValue<SubscribeReturn>,
  InferredStreamError<SubscribeReturn>,
  Context,
  never
> &
  Readonly<{ readonly config: Readonly<{ readonly routes?: undefined }> }>;
function flowStream<
  Context = unknown,
  const Event extends FlowEvent = FlowEvent,
  Params = void,
  Value = unknown,
  Error = never,
  Requirements = never,
  const Id extends string = string,
>(
  config: ExactStreamCallbackConfig<Id, Context, Event, Params, Value, Error, Requirements> &
    Readonly<{ readonly routes?: undefined }>,
): FlowStreamDefinition<
  Value,
  Error,
  Params,
  Event,
  Context,
  Id,
  Requirements,
  Params,
  Value,
  Error,
  Context,
  never
> &
  Readonly<{
    readonly config: Readonly<{ readonly routes?: undefined }>;
  }>;
function flowStream<
  Context = unknown,
  const Event extends FlowEvent = FlowEvent,
  Params = void,
  Value = unknown,
  Error = never,
  Requirements = never,
  const Id extends string = string,
>(
  config: ExactStreamCallbackConfig<Id, Context, Event, Params, Value, Error, Requirements>,
): FlowStreamDefinition<
  Value,
  Error,
  Params,
  Event,
  Context,
  Id,
  Requirements,
  Params,
  Value,
  Error,
  Context,
  Event
>;
function flowStream<
  Context = unknown,
  const Event extends FlowEvent = FlowEvent,
  Params = void,
  Value = unknown,
  Error = never,
  Requirements = never,
  const Id extends string = string,
>(
  config: ExactStreamCallbackConfig<Id, Context, Event, Params, Value, Error, Requirements>,
): FlowStreamDefinition<
  Value,
  Error,
  Params,
  Event,
  Context,
  Id,
  Requirements,
  Params,
  Value,
  Error,
  Context,
  Event
> {
  return createStreamDefinition<Context, Event, Params, Value, Error, Requirements, Id, Event>(
    config,
  );
}

export const stream = flowStream;

export const after = createAfterDefinition;

export function child<
  Machine extends AnyFlowMachine,
  Context = unknown,
  const Event extends FlowEvent = FlowEvent,
>(
  config: FlowChildConfig<Machine, Event, Context> &
    Readonly<{ readonly routes: NonNullable<FlowChildConfig<Machine, Event, Context>["routes"]> }>,
): FlowChildDefinition<Machine, Event, Event, Context>;
export function child<
  Machine extends AnyFlowMachine,
  Context,
  const Event extends FlowEvent = FlowEvent,
>(
  config: FlowChildConfig<Machine, Event, Context> &
    Readonly<{
      readonly input: NonNullable<FlowChildConfig<Machine, Event, Context>["input"]>;
      readonly routes?: undefined;
    }>,
): FlowChildDefinition<Machine, Event, never, Context>;
export function child<Machine extends AnyFlowMachine>(
  config: FlowChildConfig<Machine, never, unknown> &
    Readonly<{ readonly input?: undefined; readonly routes?: undefined }>,
): FlowChildDefinition<Machine, never, never, unknown>;
export function child(config: any): unknown {
  return createChildDefinition<any, any, any, any>(config);
}

export const module = <
  const Id extends string,
  const Inventory extends FlowModuleInventory,
  const Meta extends FlowModuleMeta = FlowModuleMeta,
>(
  id: Id,
  inventory: Inventory,
  meta?: Meta,
): FlowModuleDefinition<Id, Inventory, Meta> => createModuleDefinition(id, inventory, meta);

export const runtime = <AppLayer extends Layer.Any>(
  layer: RuntimeReadyLayer<AppLayer>,
): FlowRuntime<Layer.Success<AppLayer>, Layer.Error<AppLayer>> => createRuntime(layer);

export const outcomes = createOutcomeRoutes;

type RouteFreeSelectedResourceQuery<
  Kind extends "ensure" | "observe" | "refresh",
  Resource extends AnyFlowResourceDefinition,
  Context,
  Event extends FlowEvent,
> = FlowSelectedResourceQueryDefinition<Kind, Resource, Context, Event, never> &
  Readonly<{ readonly config: Readonly<{ readonly routes?: undefined }> }>;

function selectedResourceQuery<
  Kind extends "ensure" | "observe" | "refresh",
  Resource extends AnyFlowResourceDefinition,
  Context,
  Event extends FlowEvent,
  RoutedEvent extends FlowEvent,
>(
  kind: Kind,
  resource: Resource,
  config: FlowSelectedResourceQueryConfig<Resource, Context, Event>,
): FlowSelectedResourceQueryDefinition<Kind, Resource, Context, Event, RoutedEvent> {
  return withRoutedEventBrand<RoutedEvent>()(
    Object.freeze({
      kind,
      resource,
      config: Object.freeze({ ...config }),
    }),
  );
}

export function ensure<Ref extends FlowResourceRef>(ref: Ref): FlowEnsureDefinition<Ref>;
export function ensure<
  Resource extends AnyFlowResourceDefinition,
  Context,
  const Event extends FlowEvent,
>(
  resource: Resource,
  config: FlowSelectedResourceQueryConfig<Resource, Context, Event> &
    Readonly<{
      readonly routes: NonNullable<
        FlowSelectedResourceQueryConfig<Resource, Context, Event>["routes"]
      >;
    }>,
): FlowSelectedResourceQueryDefinition<"ensure", Resource, Context, Event, Event>;
export function ensure<
  Resource extends AnyFlowResourceDefinition,
  Context,
  const Event extends FlowEvent = FlowEvent,
>(
  resource: Resource,
  config: FlowSelectedResourceQueryConfig<Resource, Context, Event> &
    Readonly<{ readonly routes?: undefined }>,
): RouteFreeSelectedResourceQuery<"ensure", Resource, Context, Event>;
export function ensure(
  resourceOrRef: AnyFlowResourceDefinition | FlowResourceRef,
  config?: unknown,
): unknown {
  return resourceOrRef.kind === "resourceRef"
    ? Object.freeze({ kind: "ensure" as const, ref: resourceOrRef })
    : selectedResourceQuery(
        "ensure",
        resourceOrRef,
        config as FlowSelectedResourceQueryConfig<AnyFlowResourceDefinition, unknown, FlowEvent>,
      );
}

export function observe<Ref extends FlowResourceRef>(ref: Ref): FlowObserveDefinition<Ref>;
export function observe<
  Resource extends AnyFlowResourceDefinition,
  Context,
  const Event extends FlowEvent,
>(
  resource: Resource,
  config: FlowSelectedResourceQueryConfig<Resource, Context, Event> &
    Readonly<{
      readonly routes: NonNullable<
        FlowSelectedResourceQueryConfig<Resource, Context, Event>["routes"]
      >;
    }>,
): FlowSelectedResourceQueryDefinition<"observe", Resource, Context, Event, Event>;
export function observe<
  Resource extends AnyFlowResourceDefinition,
  Context,
  const Event extends FlowEvent = FlowEvent,
>(
  resource: Resource,
  config: FlowSelectedResourceQueryConfig<Resource, Context, Event> &
    Readonly<{ readonly routes?: undefined }>,
): RouteFreeSelectedResourceQuery<"observe", Resource, Context, Event>;
export function observe(
  resourceOrRef: AnyFlowResourceDefinition | FlowResourceRef,
  config?: unknown,
): unknown {
  return resourceOrRef.kind === "resourceRef"
    ? Object.freeze({ kind: "observe" as const, ref: resourceOrRef })
    : selectedResourceQuery(
        "observe",
        resourceOrRef,
        config as FlowSelectedResourceQueryConfig<AnyFlowResourceDefinition, unknown, FlowEvent>,
      );
}

export function refresh<Ref extends FlowResourceRef>(ref: Ref): FlowRefreshDefinition<Ref>;
export function refresh<
  Resource extends AnyFlowResourceDefinition,
  Context,
  const Event extends FlowEvent,
>(
  resource: Resource,
  config: FlowSelectedResourceQueryConfig<Resource, Context, Event> &
    Readonly<{
      readonly routes: NonNullable<
        FlowSelectedResourceQueryConfig<Resource, Context, Event>["routes"]
      >;
    }>,
): FlowSelectedResourceQueryDefinition<"refresh", Resource, Context, Event, Event>;
export function refresh<
  Resource extends AnyFlowResourceDefinition,
  Context,
  const Event extends FlowEvent = FlowEvent,
>(
  resource: Resource,
  config: FlowSelectedResourceQueryConfig<Resource, Context, Event> &
    Readonly<{ readonly routes?: undefined }>,
): RouteFreeSelectedResourceQuery<"refresh", Resource, Context, Event>;
export function refresh(
  resourceOrRef: FlowResourceRef | AnyFlowResourceDefinition,
  options?: unknown,
): unknown {
  return resourceOrRef.kind === "resourceRef"
    ? Object.freeze({ kind: "refresh" as const, ref: resourceOrRef })
    : selectedResourceQuery(
        "refresh",
        resourceOrRef,
        options as FlowSelectedResourceQueryConfig<AnyFlowResourceDefinition, unknown, FlowEvent>,
      );
}

export const run = <
  Transaction extends Omit<
    FlowTransactionBinding<FlowEvent>,
    keyof FlowMachineRoutedBinding<FlowEvent>
  >,
>(
  transaction: Transaction,
): FlowRunDefinition<Transaction> =>
  Object.freeze({
    kind: "run" as const,
    id: transaction.id,
    transaction,
  });

export const patch = <Ref extends FlowResourceRef, Patch>(
  ref: Ref,
  patch: Patch,
): FlowPatchDefinition<Ref, Patch> =>
  Object.freeze({
    kind: "patch" as const,
    ref,
    patch,
  });

export const invalidate = <Target extends FlowInvalidationTarget>(
  target: Target,
): FlowInvalidateDefinition<Target> =>
  Object.freeze({
    kind: "invalidate" as const,
    target,
  });

export const can = (snapshot: FlowSnapshot<unknown, string>, event: FlowEvent) =>
  canMachineTransition(snapshot, event);

export const store = Object.freeze({
  memory: () =>
    Object.freeze({
      kind: "store" as const,
      mode: "memory" as const,
    }),
  test: () =>
    Object.freeze({
      kind: "store" as const,
      mode: "test" as const,
    }),
});

export const orchestrators = Object.freeze({
  live: () =>
    Object.freeze({
      kind: "orchestrators" as const,
      mode: "live" as const,
    }),
  test: () =>
    Object.freeze({
      kind: "orchestrators" as const,
      mode: "test" as const,
    }),
});

export function selectView<Context, State extends string, Selected>(
  snapshot: FlowSnapshot<Context, State>,
  view: FlowViewDefinition<Context, State, Selected>,
  options?: Readonly<{
    readonly issues?: ReadonlyArray<FlowIssue>;
  }>,
): Selected {
  try {
    return view.config.select({
      context: snapshot.context,
      value: snapshot.value,
      resources: snapshot.resources,
      transactions: snapshot.transactions,
      streams: snapshot.streams,
      timers: snapshot.timers,
      children: snapshot.children,
      issues: options?.issues ?? [],
      receipts: snapshot.receipts,
    });
  } catch (cause) {
    throw viewSelectThrewDiagnostic({
      viewId: view.id,
      callback: "select",
      cause,
    });
  }
}
