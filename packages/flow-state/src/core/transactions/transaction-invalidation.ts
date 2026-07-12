import type {
  FlowInvalidationTarget,
  FlowResourceRef,
  FlowResourceSnapshot,
} from "../api/types.js";
import { flowKeyIdentity } from "../api/canonical-key.js";
import { refMatchesInvalidationTarget, resourceKeyOf } from "../store/invalidation.js";

export function transactionReceiptIdForInvalidationTarget(target: FlowInvalidationTarget): string {
  return "kind" in target ? target.id : flowKeyIdentity(target);
}

export function transactionRefsForInvalidationTarget(
  knownRefs: Iterable<FlowResourceRef>,
  target: FlowInvalidationTarget,
): ReadonlyArray<FlowResourceRef> {
  const refs = new Map<string, FlowResourceRef>();

  if ("kind" in target && target.kind === "resourceRef") {
    refs.set(resourceKeyOf(target), target);
  }

  for (const ref of knownRefs) {
    if (refMatchesInvalidationTarget(ref, target)) {
      refs.set(resourceKeyOf(ref), ref);
    }
  }

  return Array.from(refs.values());
}

export function invalidateTransactionResourceSnapshot(
  snapshot: FlowResourceSnapshot,
  invalidatedAt: number,
): FlowResourceSnapshot {
  if (snapshot.freshness === "invalidated") {
    return snapshot;
  }

  if (snapshot.availability === "value") {
    return {
      ...snapshot,
      freshness: "invalidated",
      status: "stale",
      invalidatedAt,
    };
  }

  if (snapshot.availability === "failure") {
    return {
      ...snapshot,
      freshness: "invalidated",
      status: "failure",
      invalidatedAt,
    };
  }

  return {
    ...snapshot,
    freshness: "invalidated",
    status: snapshot.activity === "fetching" ? "loading" : "idle",
    invalidatedAt,
  };
}
