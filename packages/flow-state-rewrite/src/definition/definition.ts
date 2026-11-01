import { constructDefinitionResult } from "./construction.js";
import type { Result } from "effect";
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
): Result.Result<DefinitionFromConfig<Config>, Diagnostic.PublicDiagnostic>;

// RETURN_TYPE: Preserves overload compatibility by fixing the implementation to the identity-wide Result accepted by the generic overload.
export function definition(
  config: DefinitionConfig,
): Result.Result<DefinitionIdentity, Diagnostic.PublicDiagnostic> {
  return constructDefinitionResult(config);
}
