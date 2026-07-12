import { Option } from "effect";

import type { FlowResourceRef } from "../api/types.js";
import type { InternalResourceRecord, ResourceHydrationEntry } from "./resource-snapshot.js";

export type PrevalidatedResourceRestoreTarget<Value = unknown> = Readonly<{
  readonly ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>;
  readonly schema?: unknown;
}>;

export type PrevalidatedResourceRestoreEntry<Value = unknown, Error = unknown> = Readonly<{
  readonly target: PrevalidatedResourceRestoreTarget<Value>;
  readonly record: InternalResourceRecord<Value, Error>;
}>;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasOwn(snapshot: ResourceHydrationEntry["snapshot"], key: string): boolean {
  return Object.prototype.hasOwnProperty.call(snapshot, key);
}

export function hydrateResourceRecord(
  current: InternalResourceRecord,
  entry: ResourceHydrationEntry,
): InternalResourceRecord {
  const updatedAt = entry.snapshot.updatedAt;
  if (!isFiniteNumber(updatedAt)) {
    return current;
  }

  const currentUpdatedAt = Option.getOrUndefined(current.updatedAt);
  if (currentUpdatedAt !== undefined && currentUpdatedAt > updatedAt) {
    return current;
  }

  return {
    ...current,
    value: hasOwn(entry.snapshot, "value") ? Option.some(entry.snapshot.value) : current.value,
    previousValue: hasOwn(entry.snapshot, "previousValue")
      ? Option.some(entry.snapshot.previousValue)
      : current.previousValue,
    error: hasOwn(entry.snapshot, "error") ? Option.some(entry.snapshot.error) : Option.none(),
    activity: entry.snapshot.activity === undefined ? current.activity : entry.snapshot.activity,
    freshness:
      entry.snapshot.freshness === undefined ? current.freshness : entry.snapshot.freshness,
    updatedAt: Option.some(updatedAt),
    invalidatedAt:
      entry.snapshot.invalidatedAt === undefined
        ? current.invalidatedAt
        : Option.some(entry.snapshot.invalidatedAt),
    expiresAt:
      entry.snapshot.expiresAt === undefined
        ? current.expiresAt
        : Option.some(entry.snapshot.expiresAt),
    requestId:
      typeof entry.snapshot.requestId === "string"
        ? Option.some(entry.snapshot.requestId)
        : current.requestId,
    revision: current.revision + 1,
    postFetchInvalidation: "none",
  };
}
