import { Predicate, Result } from "effect";

import type * as Diagnostic from "../diagnostic/diagnostic.js";
import { invalidConfigurationKey } from "./diagnostic.js";
import type { ConfigurationSnapshot } from "./reflection.js";

export type ConfigurationEntry<Value> = [string, Value];

type ConfigurationEntryFailure = {
  reason: "NonStringConfigurationKey" | "UnexpectedConfigurationField";
  key: PropertyKey;
};

// RETURN_TYPE: Keeps shared snapshot projection failures separate from each caller's diagnostic adapter.
export const captureConfigurationEntries = <Value, Fallback>(
  snapshot: ConfigurationSnapshot<Value>,
  inaccessibleValue: Fallback,
): Result.Result<ConfigurationEntry<Value | Fallback>[], ConfigurationEntryFailure> => {
  const entries: ConfigurationEntry<Value | Fallback>[] = [];

  for (const [key, property] of snapshot.properties) {
    if (!Predicate.isString(key)) return Result.fail({ reason: "NonStringConfigurationKey", key });

    if (!property.enumerable) return Result.fail({ reason: "UnexpectedConfigurationField", key });
    entries.push([key, property.kind === "data" ? property.value : inaccessibleValue]);
  }

  return Result.succeed(entries);
};

// RETURN_TYPE: Keeps the pinned Object.fromEntries overload opaque before schema decoding.
export const captureConfigurationData = <Value, Fallback>(
  snapshot: ConfigurationSnapshot<Value>,
  path: Diagnostic.Path,
  inaccessibleValue: Fallback,
): Result.Result<Record<string, Value | Fallback>, Diagnostic.PublicDiagnostic> => {
  const entryResult = captureConfigurationEntries(snapshot, inaccessibleValue);

  if (Result.isFailure(entryResult))
    return invalidConfigurationKey(entryResult.failure.reason, path, entryResult.failure.key);

  const entries = entryResult.success;
  const captured: Record<string, Value | Fallback> = Object.fromEntries(entries);

  return Result.succeed(captured);
};
