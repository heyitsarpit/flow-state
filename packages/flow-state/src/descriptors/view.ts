import type { FlowViewConfig, FlowViewDefinition } from "../core/api/types.js";
import { copyViewConfig } from "./config-copy.js";

export function createViewDefinition<
  const Id extends string,
  Context,
  State extends string,
  Selected,
>(
  config: FlowViewConfig<Id, Context, State, Selected>,
): FlowViewDefinition<Context, State, Selected, Id> {
  const copiedConfig = copyViewConfig(config);
  return Object.freeze({
    kind: "view",
    id: copiedConfig.id,
    config: copiedConfig,
  });
}
