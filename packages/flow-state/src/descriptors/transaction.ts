import type {
  FlowEvent,
  FlowOutcomeRoutes,
  FlowTransactionConfig,
  FlowTransactionDefinition,
} from "../public/types.js";

export function createTransactionDefinition<
  const Id extends string,
  Params,
  Value,
  Error,
  Requirements,
  Event extends FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown> = ReadonlyArray<
    import("../public/types.js").FlowPreviewPatch
  >,
>(
  config: FlowTransactionConfig<Id, Params, Value, Error, Requirements, Event, PreviewPatches>,
): FlowTransactionDefinition<Id, Params, Value, Error, Requirements, Event, PreviewPatches> {
  return Object.freeze({
    kind: "transaction",
    id: config.id,
    config,
  });
}

export function createOutcomeRoutes<Value, Error, Event extends FlowEvent>(
  routes: FlowOutcomeRoutes<Value, Error, Event>,
): FlowOutcomeRoutes<Value, Error, Event> {
  return routes;
}
