import type {
  FlowInvalidationTarget,
  FlowResourceAvailability,
  FlowResourceRef,
  FlowResourceSnapshot,
} from "../api/types.js";
import { flowKeyIdentity } from "../api/canonical-key.js";
import { refMatchesInvalidationTarget, resourceKeyOf } from "../store/invalidation.js";

function invalidatedStatusFor(
  availability: FlowResourceAvailability,
  activity: FlowResourceSnapshot["activity"],
): FlowResourceSnapshot["status"] {
  if (availability === "failure") {
    return "failure";
  }

  if (availability === "empty") {
    return activity === "fetching" ? "loading" : "idle";
  }

  return "stale";
}

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

  return {
    ...snapshot,
    freshness: "invalidated",
    status: invalidatedStatusFor(snapshot.availability, snapshot.activity),
    invalidatedAt,
  };
}
