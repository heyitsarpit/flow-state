import { Clock, Duration, Option } from "effect";

import type {
  FlowResourceActivity,
  FlowResourceAvailability,
  FlowResourceFreshness,
  FlowResourceFreshnessStatus,
  FlowResourceHydrationEntry,
  FlowResourceRef,
  FlowResourceSnapshot,
  FlowResourceStatus,
  FlowTag,
} from "../public/types.js";

type RuntimeResourceDetails<Value> = Readonly<{
  readonly tags: ReadonlyArray<FlowTag>;
  readonly placeholder?: Value | Option.Option<Value> | null | undefined;
  readonly freshness?: FlowResourceFreshness;
}>;

type RuntimeResourceRef<Value> = FlowResourceRef<string, ReadonlyArray<unknown>, Value> &
  Readonly<{
    readonly __runtime?: RuntimeResourceDetails<Value>;
  }>;

export type InternalResourceRecord<Value = unknown, Error = unknown> = Readonly<{
  readonly ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>;
  readonly tags: ReadonlyArray<FlowTag>;
  readonly value: Option.Option<Value>;
  readonly previousValue: Option.Option<Value>;
  readonly placeholder: Option.Option<Value>;
  readonly error: Option.Option<Error>;
  readonly activity: FlowResourceActivity;
  readonly freshness: FlowResourceFreshnessStatus;
  readonly updatedAt: Option.Option<number>;
  readonly invalidatedAt: Option.Option<number>;
  readonly expiresAt: Option.Option<number>;
  readonly requestId: Option.Option<string>;
  readonly revision: number;
  readonly latestRequest: number;
  readonly postFetchInvalidation: "none" | "invalidate" | "refresh";
}>;

export type ResourceHydrationEntry = FlowResourceHydrationEntry;

export function staleAfterMillis(
  freshness: FlowResourceFreshness | undefined,
): Option.Option<number> {
  if (freshness === undefined) {
    return Option.none();
  }

  return Option.some(
    Duration.toMillis(Duration.fromInputUnsafe(freshness.staleAfter as Duration.Input)),
  );
}

function toPlaceholderOption<Value>(
  placeholder: Value | Option.Option<Value> | null | undefined,
): Option.Option<Value> {
  if (placeholder === undefined || placeholder === null) {
    return Option.none();
  }

  return Option.isOption(placeholder)
    ? (placeholder as Option.Option<Value>)
    : Option.some(placeholder);
}

function deriveFreshness(
  now: number,
  resource: InternalResourceRecord,
): FlowResourceFreshnessStatus {
  if (resource.freshness === "invalidated") {
    return "invalidated";
  }

  const staleAfter = staleAfterMillis(
    (resource.ref as RuntimeResourceRef<unknown>).__runtime?.freshness,
  );
  if (Option.isNone(staleAfter) || Option.isNone(resource.updatedAt)) {
    return resource.freshness;
  }

  return now - resource.updatedAt.value >= staleAfter.value ? "stale" : resource.freshness;
}

function deriveAvailability(
  value: unknown,
  error: Option.Option<unknown>,
): FlowResourceAvailability {
  if (value !== undefined) {
    return "value";
  }

  return Option.isSome(error) ? "failure" : "empty";
}

function deriveStatus(
  availability: FlowResourceAvailability,
  activity: FlowResourceActivity,
  freshness: FlowResourceFreshnessStatus,
): FlowResourceStatus {
  if (availability === "empty") {
    return activity === "idle" ? "idle" : "loading";
  }

  if (availability === "failure") {
    return "failure";
  }

  return freshness === "fresh" ? "success" : "stale";
}

export function createEmptyResourceRecord<Value, Error>(
  ref: FlowResourceRef<string, ReadonlyArray<unknown>, Value>,
): InternalResourceRecord<Value, Error> {
  const runtime = (ref as RuntimeResourceRef<Value>).__runtime;
  const placeholder = toPlaceholderOption(runtime?.placeholder);

  return {
    ref,
    tags: runtime?.tags ?? [],
    value: Option.none(),
    previousValue: Option.none(),
    placeholder,
    error: Option.none(),
    activity: "idle",
    freshness: "fresh",
    updatedAt: Option.none(),
    invalidatedAt: Option.none(),
    expiresAt: Option.none(),
    requestId: Option.none(),
    revision: 0,
    latestRequest: 0,
    postFetchInvalidation: "none",
  };
}

export function toPublicResourceSnapshot<Value, Error>(
  now: number,
  resource: InternalResourceRecord<Value, Error>,
): FlowResourceSnapshot<Value, Error> {
  const freshness = deriveFreshness(now, resource);
  const canonicalValue = Option.getOrUndefined(resource.value);
  const placeholderValue = Option.getOrUndefined(resource.placeholder);
  const visibleValue = canonicalValue ?? placeholderValue;
  const previousValue = Option.getOrUndefined(resource.previousValue);
  const error = Option.getOrUndefined(resource.error);
  const updatedAt = Option.getOrUndefined(resource.updatedAt);
  const invalidatedAt = Option.getOrUndefined(resource.invalidatedAt);
  const expiresAt = Option.getOrUndefined(resource.expiresAt);
  const requestId = Option.getOrUndefined(resource.requestId);
  const availability = deriveAvailability(visibleValue, resource.error);

  return {
    id: resource.ref.id,
    status: deriveStatus(availability, resource.activity, freshness),
    availability,
    activity: resource.activity,
    freshness,
    ...(visibleValue === undefined ? {} : { value: visibleValue }),
    ...(previousValue === undefined ? {} : { previousValue }),
    ...(placeholderValue === undefined ? {} : { placeholder: placeholderValue }),
    ...(error === undefined ? {} : { error }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
    ...(invalidatedAt === undefined ? {} : { invalidatedAt }),
    ...(expiresAt === undefined ? {} : { expiresAt }),
    ...(requestId === undefined ? {} : { requestId }),
    isPlaceholderData: canonicalValue === undefined && placeholderValue !== undefined,
  };
}

export const currentTimeMillis = Clock.currentTimeMillis;
