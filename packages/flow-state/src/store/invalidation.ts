import type {
  FlowInvalidationTarget,
  FlowKey,
  FlowResourceRef,
  FlowTag,
} from "../core/api/types.js";
import type { InternalResourceRecord } from "./resource-snapshot.js";

type RuntimeResourceDetails = Readonly<{
  readonly tags: ReadonlyArray<FlowTag>;
}>;

type RuntimeResourceRef = FlowResourceRef &
  Readonly<{
    readonly __runtime?: RuntimeResourceDetails;
  }>;

function sameKey(left: FlowKey, right: FlowKey): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function tagsForRef(ref: FlowResourceRef): ReadonlyArray<FlowTag> {
  return (ref as RuntimeResourceRef).__runtime?.tags ?? [];
}

export function refMatchesInvalidationTarget(
  ref: FlowResourceRef,
  target: FlowInvalidationTarget,
): boolean {
  if ("kind" in target && target.kind === "resourceRef") {
    return sameKey(ref.key, target.key);
  }

  if ("kind" in target && target.kind === "tag") {
    return tagsForRef(ref).some((tag) => tag.id === (target as FlowTag).id);
  }

  return sameKey(ref.key, target as FlowKey);
}

export function matchesInvalidationTarget(
  resource: InternalResourceRecord,
  target: FlowInvalidationTarget,
): boolean {
  if ("kind" in target && target.kind === "tag") {
    return resource.tags.some((tag) => tag.id === (target as FlowTag).id);
  }

  return refMatchesInvalidationTarget(resource.ref, target);
}

export function resourceKeyOf(ref: FlowResourceRef): string {
  return `${ref.id}:${JSON.stringify(ref.key)}`;
}
