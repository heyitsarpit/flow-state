import type { FlowPreviewPatch, FlowResourceRef, FlowResourceSnapshot } from "../api/types.js";
import { applyResourcePatch } from "../store/resource-patch.js";
import type { PreviewOverlayLayer } from "./orchestrator-transaction-types.js";

export function applyPreviewPatchSnapshot(
  ref: FlowResourceRef,
  baseSnapshot: FlowResourceSnapshot | undefined,
  patch: FlowPreviewPatch,
  updatedAt: number,
): FlowResourceSnapshot {
  const previousValue = baseSnapshot?.value;
  const nextValue =
    "replace" in patch ? patch.replace : applyResourcePatch(previousValue, patch.patch);
  return Object.freeze({
    id: ref.id,
    status: "success" as const,
    availability: "value" as const,
    activity: "idle" as const,
    freshness: "fresh" as const,
    value: nextValue,
    ...(previousValue === undefined ? {} : { previousValue }),
    updatedAt,
    isPlaceholderData: false,
  });
}

export function replayPreviewOverlay(
  rootSnapshot: FlowResourceSnapshot | undefined,
  layers: ReadonlyArray<PreviewOverlayLayer>,
  updatedAt: number,
): FlowResourceSnapshot | undefined {
  let nextSnapshot = rootSnapshot;
  for (const layer of layers) {
    nextSnapshot = applyPreviewPatchSnapshot(layer.ref, nextSnapshot, layer.patch, updatedAt);
  }
  return nextSnapshot;
}
