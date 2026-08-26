import { createDefinitionRuntime } from "./construction.js";
import type { DefinitionConfig, DefinitionFromConfig, DefinitionIdentity } from "./domain.js";

export type {
  Definition,
  EventOf,
  EventToken,
  InputOf,
  MemoryOf,
  StateOf,
  StateToken,
} from "./domain.js";

export function definition<const Config extends DefinitionConfig>(
  config: Config,
): DefinitionFromConfig<Config>;

export function definition(config: DefinitionConfig): DefinitionIdentity {
  return createDefinitionRuntime(config);
}
