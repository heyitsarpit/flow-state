import type { FlowViewConfig, FlowViewDefinition } from "../public/types.js";

export function createViewDefinition<
  const Id extends string,
  Context,
  State extends string,
  Selected,
>(
  config: FlowViewConfig<Id, Context, State, Selected>,
): FlowViewDefinition<Context, State, Selected, Id> {
  return Object.freeze({
    kind: "view",
    id: config.id,
    config,
  });
}
