import { Duration, Option } from "effect";

import { invalidInspectionRetentionDiagnostic } from "../../shared/diagnostics.js";
import type {
  FlowInspectionEvent,
  FlowInspectionFilter,
  FlowInspectionRetentionPolicy,
  FlowInspectionSnapshot,
} from "../api/types.js";
import { matchesInspectionFilter } from "./inspection-events.js";

export type NormalizedFlowInspectionRetention = Readonly<{
  readonly policy: FlowInspectionRetentionPolicy;
  readonly maxEvents?: number;
  readonly maxAgeMillis?: number;
}>;

export type PrunedInspectionHistory = Readonly<{
  readonly entries: ReadonlyArray<FlowInspectionEvent>;
  readonly truncatedBeforeSequence?: number;
}>;

export const defaultInspectionEventHistoryLimit = 256;

const defaultInspectionRetentionPolicy = Object.freeze({
  maxEvents: defaultInspectionEventHistoryLimit,
}) satisfies FlowInspectionRetentionPolicy;

export function normalizeInspectionRetentionPolicy(
  policy?: FlowInspectionRetentionPolicy,
): NormalizedFlowInspectionRetention {
  const maxEvents = policy?.maxEvents ?? defaultInspectionEventHistoryLimit;
  if (maxEvents !== undefined && (!Number.isInteger(maxEvents) || maxEvents < 0)) {
    throw invalidInspectionRetentionDiagnostic({
      field: "maxEvents",
      reason: "expected a non-negative integer",
    });
  }

  const maxAge = policy?.maxAge;
  let maxAgeMillis: number | undefined;
  if (maxAge !== undefined) {
    const decoded = Duration.fromInput(maxAge);
    if (Option.isNone(decoded)) {
      throw invalidInspectionRetentionDiagnostic({
        field: "maxAge",
        reason: "expected a valid Duration.Input",
      });
    }

    const millis = Duration.toMillis(decoded.value);
    if (!Number.isFinite(millis) || millis < 0) {
      throw invalidInspectionRetentionDiagnostic({
        field: "maxAge",
        reason: "expected a finite non-negative duration",
      });
    }

    maxAgeMillis = millis;
  }

  const normalizedPolicy = Object.freeze({
    ...(maxEvents === undefined ? {} : { maxEvents }),
    ...(maxAge === undefined ? {} : { maxAge }),
  }) satisfies FlowInspectionRetentionPolicy;

  return Object.freeze({
    policy:
      maxAge === undefined && maxEvents === defaultInspectionEventHistoryLimit
        ? defaultInspectionRetentionPolicy
        : normalizedPolicy,
    maxEvents,
    ...(maxAgeMillis === undefined ? {} : { maxAgeMillis }),
  });
}

export function pruneInspectionEntries(
  entries: ReadonlyArray<FlowInspectionEvent>,
  now: number,
  retention: NormalizedFlowInspectionRetention,
  previousTruncatedBeforeSequence?: number,
): PrunedInspectionHistory {
  let retained = entries;

  if (retention.maxAgeMillis !== undefined) {
    const cutoff = now - retention.maxAgeMillis;
    retained = retained.filter((event) => event.timestamp >= cutoff);
  }

  if (retention.maxEvents !== undefined && retained.length > retention.maxEvents) {
    retained = retained.slice(-retention.maxEvents);
  }

  const truncatedBeforeSequence =
    retained.length === entries.length
      ? previousTruncatedBeforeSequence
      : Math.max(
          previousTruncatedBeforeSequence ?? 0,
          retained.length === 0
            ? (entries[entries.length - 1]?.sequence ?? 0)
            : (retained[0]?.sequence ?? 1) - 1,
        );

  return Object.freeze({
    entries: retained === entries ? entries : Object.freeze(retained),
    ...(truncatedBeforeSequence === undefined || truncatedBeforeSequence <= 0
      ? {}
      : { truncatedBeforeSequence }),
  });
}

export function createInspectionSnapshot(
  entries: ReadonlyArray<FlowInspectionEvent>,
  capturedAt: number,
  truncatedBeforeSequence?: number,
  filter?: FlowInspectionFilter,
): FlowInspectionSnapshot {
  const selected =
    filter === undefined
      ? Object.freeze([...entries])
      : Object.freeze(entries.filter((event) => matchesInspectionFilter(event, filter)));
  const lastSequence = selected.length === 0 ? undefined : selected[selected.length - 1]?.sequence;

  return Object.freeze({
    capturedAt,
    ...(truncatedBeforeSequence === undefined ? {} : { truncatedBeforeSequence }),
    ...(lastSequence === undefined ? {} : { lastSequence }),
    entries: selected,
  });
}
