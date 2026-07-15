import type {
  FlowInvalidationTarget,
  FlowResourceRef,
  FlowResourceSnapshot,
} from "../api/types.js";
import { createFlowKeyIdentityScope } from "../api/canonical-key.js";
import type { FlowKeyIdentityScope } from "../api/canonical-key.js";
import { createResourceInvalidation } from "../store/invalidation.js";
import { applyResourcePatch } from "../store/resource-patch.js";
import { invalidateTransactionResourceSnapshot } from "../transactions/transaction-invalidation.js";

type PreviewPatch = Readonly<{
  readonly ref: FlowResourceRef;
  readonly replace?: unknown;
  readonly patch?: unknown;
}>;

const modeledResourceIdentity = Symbol("flow-state/model-resource-identity");
const modeledPreviousSnapshot = Symbol("flow-state/model-previous-resource-snapshot");
const absentSnapshot = Symbol("flow-state/model-absent-resource-snapshot");
const modeledIdentityScope = Symbol("flow-state/model-resource-identity-scope");

type ModeledResources = Readonly<Record<string, FlowResourceSnapshot>> &
  Readonly<{ [modeledIdentityScope]?: FlowKeyIdentityScope }>;

type ModeledSnapshot = FlowResourceSnapshot &
  Readonly<{
    [modeledResourceIdentity]?: string;
    [modeledPreviousSnapshot]?: FlowResourceSnapshot | typeof absentSnapshot;
  }>;

function defineModelMetadata(
  snapshot: FlowResourceSnapshot,
  identity: string,
  previous: FlowResourceSnapshot | typeof absentSnapshot,
): FlowResourceSnapshot {
  Object.defineProperties(snapshot, {
    [modeledResourceIdentity]: { value: identity },
    [modeledPreviousSnapshot]: { value: previous },
  });
  return Object.freeze(snapshot);
}

function identityScopeFor(resources: ModeledResources): FlowKeyIdentityScope {
  return resources[modeledIdentityScope] ?? createFlowKeyIdentityScope();
}

function copyResources(
  resources: ModeledResources,
  scope: FlowKeyIdentityScope = identityScopeFor(resources),
): Record<string, FlowResourceSnapshot> & { [modeledIdentityScope]?: FlowKeyIdentityScope } {
  const copy = { ...resources };
  Object.defineProperty(copy, modeledIdentityScope, { value: scope });
  return copy;
}

function locateResourceSnapshot(
  resources: ModeledResources,
  ref: FlowResourceRef,
): Readonly<{
  readonly key: string;
  readonly resources: Record<string, FlowResourceSnapshot>;
}> {
  const scope = identityScopeFor(resources);
  const identity = scope.resourceIdentityFor(ref);
  const exactEntry = Object.entries(resources).find(
    ([, snapshot]) => (snapshot as ModeledSnapshot)[modeledResourceIdentity] === identity,
  );
  if (exactEntry !== undefined)
    return { key: exactEntry[0], resources: copyResources(resources, scope) };

  const descriptorSnapshot = resources[ref.id] as ModeledSnapshot | undefined;
  const descriptorIdentity = descriptorSnapshot?.[modeledResourceIdentity];
  if (
    descriptorSnapshot === undefined ||
    descriptorIdentity === undefined ||
    descriptorIdentity === identity
  ) {
    return { key: ref.id, resources: copyResources(resources, scope) };
  }

  const promoted = copyResources(resources, scope);
  const nextOpaqueKey = () => {
    let index = 1;
    while (promoted[`resource:${index}`] !== undefined) index += 1;
    return `resource:${index}`;
  };
  promoted[nextOpaqueKey()] = descriptorSnapshot;
  delete promoted[ref.id];
  return { key: nextOpaqueKey(), resources: promoted };
}

export function applyModeledTransactionPreview(
  resources: Readonly<Record<string, FlowResourceSnapshot>>,
  previewPatch: PreviewPatch,
): Readonly<Record<string, FlowResourceSnapshot>> {
  const location = locateResourceSnapshot(resources, previewPatch.ref);
  const scope = identityScopeFor(location.resources);
  const previousSnapshot = location.resources[location.key];
  const previousValue = previousSnapshot?.value;
  const nextValue =
    "replace" in previewPatch
      ? previewPatch.replace
      : applyResourcePatch(previousValue, previewPatch.patch);
  const snapshot = defineModelMetadata(
    {
      id: previewPatch.ref.id,
      status: "success",
      availability: "value",
      activity: "idle",
      freshness: "fresh",
      value: nextValue,
      updatedAt: 0,
      ...(previousSnapshot !== undefined && Object.hasOwn(previousSnapshot, "value")
        ? { previousValue }
        : {}),
      isPlaceholderData: false,
    },
    scope.resourceIdentityFor(previewPatch.ref),
    previousSnapshot ?? absentSnapshot,
  );

  const next = copyResources(location.resources, scope);
  next[location.key] = snapshot;
  return Object.freeze(next);
}

export function rollbackModeledTransactionPreviews(
  resources: Readonly<Record<string, FlowResourceSnapshot>>,
  previewPatches: ReadonlyArray<PreviewPatch>,
): Readonly<Record<string, FlowResourceSnapshot>> {
  let next = copyResources(resources);
  for (const previewPatch of [...previewPatches].reverse()) {
    const location = locateResourceSnapshot(next, previewPatch.ref);
    next = location.resources;
    const snapshot = location.resources[location.key] as ModeledSnapshot | undefined;
    const previous = snapshot?.[modeledPreviousSnapshot];
    if (previous === absentSnapshot) {
      delete next[location.key];
    } else if (previous !== undefined) {
      next[location.key] = Object.freeze({
        ...previous,
        ...(Object.hasOwn(previous, "value") ? { previousValue: previous.value } : {}),
      });
    }
  }
  return Object.freeze(next);
}

export function invalidateModeledTransactionTargets(
  resources: Readonly<Record<string, FlowResourceSnapshot>>,
  previewPatches: ReadonlyArray<PreviewPatch>,
  targets: ReadonlyArray<FlowInvalidationTarget>,
): Readonly<{
  readonly resources: Readonly<Record<string, FlowResourceSnapshot>>;
  readonly targets: ReadonlyArray<
    Readonly<{
      readonly id: string;
      readonly invalidated: ReadonlyArray<FlowResourceRef>;
    }>
  >;
}> {
  const identity = identityScopeFor(resources);
  const invalidation = createResourceInvalidation(identity);
  const knownRefs = new Map<string, FlowResourceRef>();
  for (const patch of previewPatches)
    knownRefs.set(identity.resourceIdentityFor(patch.ref), patch.ref);
  for (const target of targets) {
    if ("kind" in target && target.kind === "resourceRef") {
      knownRefs.set(identity.resourceIdentityFor(target), target);
    }
  }

  let next = copyResources(resources, identity);
  const targetResults: Array<
    Readonly<{ readonly id: string; readonly invalidated: ReadonlyArray<FlowResourceRef> }>
  > = [];
  for (const target of targets) {
    const invalidated = new Map<string, FlowResourceRef>();
    for (const ref of knownRefs.values()) {
      if (!invalidation.refMatchesInvalidationTarget(ref, target)) continue;
      const location = locateResourceSnapshot(next, ref);
      next = location.resources;
      const snapshot = location.resources[location.key];
      if (snapshot === undefined) continue;
      next[location.key] = invalidateTransactionResourceSnapshot(snapshot, 0);
      invalidated.set(identity.resourceIdentityFor(ref), ref);
    }
    targetResults.push(
      Object.freeze({
        id: "kind" in target ? target.id : identity.flowKeyIdentity(target),
        invalidated: Object.freeze(Array.from(invalidated.values())),
      }),
    );
  }
  return Object.freeze({
    resources: Object.freeze(next),
    targets: Object.freeze(targetResults),
  });
}

export function modeledResourceSnapshotKey(
  resources: Readonly<Record<string, FlowResourceSnapshot>>,
  ref: FlowResourceRef,
): string {
  return locateResourceSnapshot(resources, ref).key;
}
