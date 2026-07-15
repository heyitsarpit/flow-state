import type {
  FlowInvalidationTarget,
  FlowResourceRef,
  FlowResourceSnapshot,
} from "../api/types.js";
import type { ResourceInvalidation } from "../store/invalidation.js";

type TransactionInvalidationIdentity = Pick<
  ResourceInvalidation,
  "refMatchesInvalidationTarget" | "resourceKeyOf"
> &
  Readonly<{ readonly flowKeyIdentity: (key: import("../api/types.js").FlowKey) => string }>;

export function transactionReceiptIdForInvalidationTarget(
  identity: TransactionInvalidationIdentity,
  target: FlowInvalidationTarget,
): string {
  return "kind" in target ? target.id : identity.flowKeyIdentity(target);
}

export function transactionRefsForInvalidationTarget(
  identity: TransactionInvalidationIdentity,
  knownRefs: Iterable<FlowResourceRef>,
  target: FlowInvalidationTarget,
): ReadonlyArray<FlowResourceRef> {
  const refs = new Map<string, FlowResourceRef>();

  if ("kind" in target && target.kind === "resourceRef") {
    refs.set(identity.resourceKeyOf(target), target);
  }

  for (const ref of knownRefs) {
    if (identity.refMatchesInvalidationTarget(ref, target)) {
      refs.set(identity.resourceKeyOf(ref), ref);
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
