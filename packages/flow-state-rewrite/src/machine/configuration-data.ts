import { Predicate, Result } from "effect";

import type * as Diagnostic from "../diagnostic/diagnostic.js";
import { invalidConfigurationKey } from "./diagnostic.js";
import type { ConfigurationSnapshot } from "./reflection.js";

export type ConfigurationEntry = readonly [string, unknown];

type ConfigurationEntryFailure = {
  readonly reason: "NonStringConfigurationKey" | "UnexpectedConfigurationField";
  readonly key: PropertyKey;
};

// RETURN_TYPE: Keeps shared snapshot projection failures separate from each caller's diagnostic adapter.
export const captureConfigurationEntries = (
  snapshot: ConfigurationSnapshot,
  inaccessibleValue: unknown,
): Result.Result<ConfigurationEntry[], ConfigurationEntryFailure> => {
  const entries: ConfigurationEntry[] = [];
  for (const [key, property] of snapshot.properties) {
    if (!Predicate.isString(key)) return Result.fail({ reason: "NonStringConfigurationKey", key });
    if (!property.enumerable) return Result.fail({ reason: "UnexpectedConfigurationField", key });
    entries.push([key, property.kind === "data" ? property.value : inaccessibleValue]);
  }
  return Result.succeed(entries);
};

// RETURN_TYPE: Keeps the pinned Object.fromEntries overload opaque before schema decoding.
export const captureConfigurationData = (
  snapshot: ConfigurationSnapshot,
  path: Diagnostic.Path,
  inaccessibleValue: unknown,
): Result.Result<unknown, Diagnostic.PublicDiagnostic> => {
  const entryResult = captureConfigurationEntries(snapshot, inaccessibleValue);
  if (Result.isFailure(entryResult))
    return invalidConfigurationKey(entryResult.failure.reason, path, entryResult.failure.key);

  const entries = entryResult.success;
  const captured: unknown = Object.fromEntries(entries);
  return Result.succeed(captured);
};
