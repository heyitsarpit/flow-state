import { constructDefinitionResult } from "./construction.js";
import type { DefinitionConfig, DefinitionFromConfig, DefinitionIdentity } from "./domain.js";
import type * as Diagnostic from "../diagnostic/diagnostic.js";

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
): Diagnostic.Result<DefinitionFromConfig<Config>>;

export function definition(config: DefinitionConfig): Diagnostic.Result<DefinitionIdentity> {
  return constructDefinitionResult(config);
}
