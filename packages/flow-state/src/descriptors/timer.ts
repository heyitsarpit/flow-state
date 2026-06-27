import type { FlowAfterConfig, FlowAfterDefinition, FlowEvent } from "../public/types.js";

export function createAfterDefinition<
  State extends string,
  Context,
  Event extends FlowEvent,
>(
  config: FlowAfterConfig<State, Context, Event>,
): FlowAfterDefinition<State, Context, Event> {
  return Object.freeze({
    kind: "after",
    id: config.id,
    config,
  });
}
