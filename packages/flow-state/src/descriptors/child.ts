import type { FlowChildConfig, FlowChildDefinition, FlowMachine } from "../core/api/types.js";

export function createChildDefinition<Machine extends FlowMachine>(
  config: FlowChildConfig<Machine>,
): FlowChildDefinition<Machine> {
  return Object.freeze({
    kind: "child",
    id: config.id,
    config,
  });
}
