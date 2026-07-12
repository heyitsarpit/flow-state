import type { FlowInvalidationTarget, FlowKey, FlowResourceRef, FlowTag } from "../api/types.js";
import {
  flowKeyIdentity,
  resourceIdentityFor,
  type FlowKeyIdentityScope,
} from "../api/canonical-key.js";
import { resourceMetadataForRef } from "../api/resource-runtime.js";
import type { InternalResourceRecord } from "./resource-snapshot.js";

function tagsForRef(ref: FlowResourceRef): ReadonlyArray<FlowTag> {
  return resourceMetadataForRef(ref)?.tags ?? [];
}

export type ResourceInvalidationIdentity = Pick<
  FlowKeyIdentityScope,
  "flowKeyIdentity" | "resourceIdentityFor"
>;

export type ResourceInvalidation = Readonly<{
  readonly refMatchesInvalidationTarget: (
    ref: FlowResourceRef,
    target: FlowInvalidationTarget,
  ) => boolean;
  readonly matchesInvalidationTarget: (
    resource: InternalResourceRecord,
    target: FlowInvalidationTarget,
  ) => boolean;
  readonly resourceKeyOf: (ref: FlowResourceRef) => string;
}>;

export function createResourceInvalidation(
  identity: ResourceInvalidationIdentity,
): ResourceInvalidation {
  const sameKey = (left: FlowKey, right: FlowKey): boolean =>
    identity.flowKeyIdentity(left) === identity.flowKeyIdentity(right);

  const refMatchesInvalidationTarget = (
    ref: FlowResourceRef,
    target: FlowInvalidationTarget,
  ): boolean => {
    if ("kind" in target && target.kind === "resourceRef") {
      return sameKey(ref.key, target.key);
    }

    if ("kind" in target && target.kind === "tag") {
      return tagsForRef(ref).some((tag) => tag.id === (target as FlowTag).id);
    }

    return sameKey(ref.key, target as FlowKey);
  };

  const matchesInvalidationTarget = (
    resource: InternalResourceRecord,
    target: FlowInvalidationTarget,
  ): boolean => {
    if ("kind" in target && target.kind === "tag") {
      return resource.tags.some((tag) => tag.id === (target as FlowTag).id);
    }

    return refMatchesInvalidationTarget(resource.ref, target);
  };

  return {
    refMatchesInvalidationTarget,
    matchesInvalidationTarget,
    resourceKeyOf: identity.resourceIdentityFor,
  };
}

const defaultResourceInvalidation = createResourceInvalidation({
  flowKeyIdentity,
  resourceIdentityFor,
});

export const refMatchesInvalidationTarget =
  defaultResourceInvalidation.refMatchesInvalidationTarget;
export const matchesInvalidationTarget = defaultResourceInvalidation.matchesInvalidationTarget;
export const resourceKeyOf = defaultResourceInvalidation.resourceKeyOf;
