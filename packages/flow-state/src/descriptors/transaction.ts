import type {
  FlowEvent,
  FlowOutcomeRoutes,
  FlowTransactionCallbackDefinition,
  FlowTransactionConfig,
  FlowTransactionDefinition,
} from "../core/api/types.js";
import { flowTransactionRuntime } from "../core/api/types.js";
import { withRoutedEventBrand } from "../core/api/routed-event-brand.js";
import {
  createRuntimeTransactionDefinition,
  createVoidRuntimeTransactionDefinition,
} from "../core/transactions/transaction-runtime.js";
import { copyTransactionConfig } from "./config-copy.js";

export function createTransactionDefinition<
  const Id extends string,
  Params,
  Value,
  Error,
  Requirements,
  Event extends FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<
    import("../core/api/types.js").FlowPreviewPatch
  >,
  SelectorInput = unknown,
>(
  config: FlowTransactionConfig<Id, Params, Value, Error, Requirements, Event, PreviewPatches> &
    Readonly<{
      readonly params: (args: Readonly<Record<string, unknown>>) => Params | null;
    }>,
): FlowTransactionDefinition<
  Id,
  Params,
  Value,
  Error,
  Requirements,
  Event,
  PreviewPatches,
  SelectorInput
> {
  const copiedConfig = copyTransactionConfig(config);
  const runtimeConfig = Object.freeze({
    ...copiedConfig,
    params: config.params,
  });
  const definition = {
    kind: "transaction",
    id: runtimeConfig.id,
    config: runtimeConfig,
  } satisfies FlowTransactionCallbackDefinition<
    Id,
    Params,
    Value,
    Error,
    Requirements,
    Event,
    PreviewPatches
  >;
  return withRoutedEventBrand<FlowEvent extends Event ? never : Event>()(
    Object.freeze({
      ...definition,
      [flowTransactionRuntime]: createRuntimeTransactionDefinition(definition),
    }),
  );
}

export function createVoidTransactionDefinition<
  const Id extends string,
  Value,
  Error,
  Requirements,
  Event extends FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<
    import("../core/api/types.js").FlowPreviewPatch
  >,
>(
  config: Omit<
    FlowTransactionConfig<Id, void, Value, Error, Requirements, Event, PreviewPatches>,
    "params"
  > &
    Readonly<{ readonly params?: undefined }>,
): FlowTransactionDefinition<Id, void, Value, Error, Requirements, Event, PreviewPatches> {
  const { params: _params, ...configWithoutParams } = config;
  const copiedConfig = copyTransactionConfig(configWithoutParams);
  const definition = {
    kind: "transaction",
    id: copiedConfig.id,
    config: copiedConfig,
  } satisfies FlowTransactionCallbackDefinition<
    Id,
    void,
    Value,
    Error,
    Requirements,
    Event,
    PreviewPatches
  >;
  return withRoutedEventBrand<FlowEvent extends Event ? never : Event>()(
    Object.freeze({
      ...definition,
      [flowTransactionRuntime]: createVoidRuntimeTransactionDefinition(definition),
    }),
  );
}

export function createOutcomeRoutes<Value, Error, Event extends FlowEvent>(
  routes: FlowOutcomeRoutes<Value, Error, Event>,
): FlowOutcomeRoutes<Value, Error, Event> {
  return routes;
}
