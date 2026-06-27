import type { FlowInvalidationTarget, FlowKey, FlowResourceRef, FlowTag } from "../public/types.js";
import type { InternalResourceRecord } from "./resource-snapshot.js";

function sameKey(left: FlowKey, right: FlowKey): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function matchesInvalidationTarget(
  resource: InternalResourceRecord,
  target: FlowInvalidationTarget,
): boolean {
  if ("kind" in target && target.kind === "resourceRef") {
    return sameKey(resource.ref.key, target.key);
  }

  if ("kind" in target && target.kind === "tag") {
    return resource.tags.some((tag) => tag.id === (target as FlowTag).id);
  }

  return sameKey(resource.ref.key, target as FlowKey);
}

export function resourceKeyOf(ref: FlowResourceRef): string {
  return `${ref.id}:${JSON.stringify(ref.key)}`;
}
