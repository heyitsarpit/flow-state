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
>(
  config: FlowTransactionConfig<Id, Params, Value, Error, Requirements, Event>,
): FlowTransactionDefinition<Id, Params, Value, Error, Requirements, Event> {
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
