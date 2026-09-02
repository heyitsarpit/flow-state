import { Result } from "effect";

import type { DefinitionIdentity, StateToken } from "./domain.js";
import * as Diagnostic from "../diagnostic/diagnostic.js";

export type StateMetadata = {
  readonly name: string;
  readonly path: readonly string[];
  readonly token?: StateToken;
  readonly children: readonly StateMetadata[];
};

export type DefinitionMetadata = {
  readonly states: StateMetadata;
};

const metadata = new WeakMap<DefinitionIdentity, DefinitionMetadata>();

export const registerDefinitionMetadata = (
  definition: DefinitionIdentity,
  value: DefinitionMetadata,
): void => {
  metadata.set(definition, value);
};

export const definitionMetadata = (
  definition: DefinitionIdentity,
): Diagnostic.Result<DefinitionMetadata> => {
  const value = metadata.get(definition);
  return value === undefined
    ? Result.fail(Diagnostic.panic("Definition metadata is unavailable."))
    : Result.succeed(value);
};
