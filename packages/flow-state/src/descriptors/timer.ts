import type { FlowAfterConfig, FlowAfterDefinition, FlowEvent } from "../core/api/types.js";
import { copyAfterConfig } from "./config-copy.js";

export function createAfterDefinition<State extends string, Context, Event extends FlowEvent>(
  config: FlowAfterConfig<State, Context, Event>,
): FlowAfterDefinition<State, Context, Event> {
  const copiedConfig = copyAfterConfig(config);
  return Object.freeze({
    kind: "after",
    id: copiedConfig.id,
    config: copiedConfig,
  });
}
