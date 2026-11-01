import { Result } from "effect";

import { Failure } from "../../diagnostic/diagnostic.js";
import type { ActorFence, ActorKey } from "../actor-admission.js";

/** An inherited ancestor's exact actor lifetime and publication cut. */
export type ContextCut = { fence: ActorFence; revision: number };

/** The consumer's ancestors only; its own publication belongs to ActorPublication. */
export type ContextLineage = Map<ActorKey, ContextCut>;

/** Outstanding ancestor requirements grouped by the incoming provider edge. */
export type ContextEdgeDebt = Map<ActorKey, ContextLineage>;

export type ContextLineageProvider = {
  slot: string;
  cut: ContextCut;
  lineage: ContextLineage;
};

const sameFence = (left: ActorFence, right: ActorFence) =>
  left.key === right.key &&
  left.incarnation === right.incarnation &&
  left.generation === right.generation &&
  left.leaseEpoch === right.leaseEpoch;

const covers = (actual: ContextCut, required: ContextCut) =>
  sameFence(actual.fence, required.fence) && actual.revision >= required.revision;

const sameCut = (left: ContextCut, right: ContextCut) =>
  sameFence(left.fence, right.fence) && left.revision === right.revision;

const sameLineage = (left: ContextLineage, right: ContextLineage) =>
  left.size === right.size &&
  [...right].every(([ancestor, cut]) => {
    const current = left.get(ancestor);

    return current !== undefined && sameCut(current, cut);
  });

const conflictingAncestor = (slot: string, provider: ActorKey, ancestor: ActorKey) =>
  Failure({
    code: "MissingContextProvider",
    path: ["contextBindings", slot],
    details: { provider, ancestor, reason: "incompatible-ancestor-cut" },
    summary: "The context providers do not share a coherent ancestor cut.",
    help: "Reconcile the stale provider before selecting this consumer context.",
  });

const conflictingDebt = (edge: ActorKey, ancestor: ActorKey) =>
  Failure({
    code: "MissingContextProvider",
    path: ["context", "debt"],
    details: { provider: edge, ancestor, reason: "incompatible-ancestor-cut" },
    summary: "Context debt contains incompatible actor lifetimes.",
    help: "Reconcile the outstanding ancestor before accepting a new provider lifetime.",
  });

const mergeRequiredDebt = (pending: ContextLineage, required: ContextLineage, edge: ActorKey) => {
  for (const [ancestor, cut] of required) {
    const existing = pending.get(ancestor);

    if (existing !== undefined && !sameFence(cut.fence, existing.fence))
      return Result.fail(conflictingDebt(edge, ancestor));

    if (existing === undefined || covers(cut, existing))
      pending.set(ancestor, { fence: { ...cut.fence }, revision: cut.revision });
  }

  return Result.succeed(pending);
};

/** Merges provider-first ancestry in authored slot order, rejecting mixed shared cuts. */
export const reconcileContextLineage = (
  consumer: ActorKey,
  previous: ContextLineage,
  providers: ContextLineageProvider[],
) => {
  const next: ContextLineage = new Map();

  for (const provider of providers) {
    for (const [ancestor, cut] of [
      ...provider.lineage,
      [provider.cut.fence.key, provider.cut] as const,
    ]) {
      if (ancestor === consumer)
        return Result.fail(conflictingAncestor(provider.slot, provider.cut.fence.key, ancestor));
      const present = next.get(ancestor);

      if (present !== undefined && !sameCut(present, cut))
        return Result.fail(conflictingAncestor(provider.slot, provider.cut.fence.key, ancestor));
      next.set(ancestor, { fence: { ...cut.fence }, revision: cut.revision });
    }
  }

  if (sameLineage(previous, next)) return Result.succeed(previous);

  return Result.succeed(next);
};

/** Keeps every unresolved requirement until this edge attests a covering cut. */
export const reconcileContextEdgeDebt = (
  previous: ContextEdgeDebt,
  edge: ActorKey,
  required: ContextLineage,
  covered: ContextLineage,
) => {
  const next = new Map(previous);
  const pending = new Map(previous.get(edge) ?? []);
  const merged = mergeRequiredDebt(pending, required, edge);

  if (Result.isFailure(merged)) return Result.fail(merged.failure);

  for (const [ancestor, cut] of pending) {
    const attested = covered.get(ancestor);

    if (attested !== undefined && covers(attested, cut)) pending.delete(ancestor);
  }

  if (pending.size === 0) next.delete(edge);
  else next.set(edge, pending);

  return Result.succeed(next);
};
