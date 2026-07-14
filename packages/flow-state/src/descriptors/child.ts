import type { AnyFlowMachine, FlowChildConfig, FlowChildDefinition } from "../core/api/types.js";
import { copyChildConfig } from "./config-copy.js";

export function createChildDefinition<Machine extends AnyFlowMachine>(
  config: FlowChildConfig<Machine>,
): FlowChildDefinition<Machine> {
  const copiedConfig = copyChildConfig(config);
  return Object.freeze({
    kind: "child",
    id: copiedConfig.id,
    config: copiedConfig,
  });
}
