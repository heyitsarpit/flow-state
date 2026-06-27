import type { FlowEvent, FlowStreamConfig, FlowStreamDefinition } from "../public/types.js";

export function createStreamDefinition<
  Context,
  Event extends FlowEvent,
  Params,
  Value,
  Error,
  Requirements,
  const Id extends string,
>(
  config: FlowStreamConfig<Id, Context, Event, Params, Value, Error, Requirements>,
): FlowStreamDefinition<Value, Error, Params, Event, Context, Id, Requirements> {
  return Object.freeze({
    kind: "stream",
    id: config.id,
    config,
  });
}
