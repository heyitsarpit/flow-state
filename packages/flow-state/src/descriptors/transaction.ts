import type {
  FlowEvent,
  FlowOutcomeRoutes,
  FlowTransactionConfig,
  FlowTransactionDefinition,
} from "../core/api/types.js";
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
  config: FlowTransactionConfig<Id, Params, Value, Error, Requirements, Event, PreviewPatches>,
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
  return Object.freeze({
    kind: "transaction",
    id: copiedConfig.id,
    config: copiedConfig,
  });
}

export function createOutcomeRoutes<Value, Error, Event extends FlowEvent>(
  routes: FlowOutcomeRoutes<Value, Error, Event>,
): FlowOutcomeRoutes<Value, Error, Event> {
  return routes;
}
