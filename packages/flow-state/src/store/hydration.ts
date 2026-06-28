import { Option } from "effect";

import type { InternalResourceRecord, ResourceHydrationEntry } from "./resource-snapshot.js";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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
    value: entry.snapshot.value === undefined ? current.value : Option.some(entry.snapshot.value),
    previousValue:
      entry.snapshot.previousValue === undefined
        ? current.previousValue
        : Option.some(entry.snapshot.previousValue),
    error: entry.snapshot.error === undefined ? Option.none() : Option.some(entry.snapshot.error),
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
