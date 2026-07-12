import type { FlowEvent, FlowStreamConfig, FlowStreamDefinition } from "../core/api/types.js";
import { copyStreamConfig } from "./config-copy.js";

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
  const copiedConfig = copyStreamConfig(config);
  return Object.freeze({
    kind: "stream",
    id: copiedConfig.id,
    config: copiedConfig,
  });
}
