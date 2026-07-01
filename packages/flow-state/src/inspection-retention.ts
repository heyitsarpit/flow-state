import { Duration, Option } from "effect";

import { invalidInspectionRetentionDiagnostic } from "./shared/diagnostics.js";
import { matchesInspectionFilter } from "./inspection-events.js";
import type {
  FlowInspectionEvent,
  FlowInspectionFilter,
  FlowInspectionRetentionPolicy,
  FlowInspectionSnapshot,
} from "./core/api/types.js";

export type NormalizedFlowInspectionRetention = Readonly<{
  readonly policy: FlowInspectionRetentionPolicy;
  readonly maxEvents?: number;
  readonly maxAgeMillis?: number;
}>;

const defaultInspectionRetentionPolicy = Object.freeze({}) satisfies FlowInspectionRetentionPolicy;

export function normalizeInspectionRetentionPolicy(
  policy?: FlowInspectionRetentionPolicy,
): NormalizedFlowInspectionRetention {
  const maxEvents = policy?.maxEvents;
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
      maxEvents === undefined && maxAge === undefined
        ? defaultInspectionRetentionPolicy
        : normalizedPolicy,
    ...(maxEvents === undefined ? {} : { maxEvents }),
    ...(maxAgeMillis === undefined ? {} : { maxAgeMillis }),
  });
}

export function pruneInspectionEntries(
  entries: ReadonlyArray<FlowInspectionEvent>,
  now: number,
  retention: NormalizedFlowInspectionRetention,
): ReadonlyArray<FlowInspectionEvent> {
  let retained = entries;

  if (retention.maxAgeMillis !== undefined) {
    const cutoff = now - retention.maxAgeMillis;
    retained = retained.filter((event) => event.timestamp >= cutoff);
  }

  if (retention.maxEvents !== undefined && retained.length > retention.maxEvents) {
    retained = retained.slice(-retention.maxEvents);
  }

  return retained === entries ? entries : Object.freeze(retained);
}

export function createInspectionSnapshot(
  entries: ReadonlyArray<FlowInspectionEvent>,
  capturedAt: number,
  filter?: FlowInspectionFilter,
): FlowInspectionSnapshot {
  const selected =
    filter === undefined
      ? Object.freeze([...entries])
      : Object.freeze(entries.filter((event) => matchesInspectionFilter(event, filter)));
  const lastSequence = selected.length === 0 ? undefined : selected[selected.length - 1]?.sequence;

  return Object.freeze({
    capturedAt,
    ...(lastSequence === undefined ? {} : { lastSequence }),
    entries: selected,
  });
}
