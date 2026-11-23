import { Result } from "effect";

import type { PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { ActorIdentity } from "../actor/actor-directory.js";
import {
  conflictingCut,
  ownCut,
  sameCut,
  sameLineage,
  validateCut,
  validateLineage,
  type ContextCut,
  type ContextLineage,
  type ContextLineageProvider,
} from "./lineage-model.js";
import {
  isOwnedContextLineage,
  makeContextDebtOps as makeTrieContextDebtOps,
  makeContextLineageBuilder,
} from "./lineage-trie.js";

export type {
  ContextCut,
  ContextEdgeDebt,
  ContextLineage,
  ContextLineageProvider,
} from "./lineage-model.js";

export {
  conflictingCut,
  covers,
  ownCut,
  sameCut,
  sameLineage,
  validateCut,
  validateLineage,
} from "./lineage-model.js";

const ownedTree = (lineage: ContextLineage) => {
  if (isOwnedContextLineage(lineage)) return Result.succeed(lineage);
  const path = ["context", "lineage"];
  const valid = validateLineage(lineage, path);

  if (Result.isFailure(valid)) return Result.fail(valid.failure);
  const builder = makeContextLineageBuilder();

  for (const cut of lineage.values()) {
    const inserted = builder.add(cut, path);

    if (Result.isFailure(inserted)) return Result.fail(inserted.failure);
  }

  return Result.succeed(builder.finish());
};

/** Merge owned provider cuts with shared ancestry and exact conflict checks. */
// RETURN_TYPE: The production lineage merge exposes typed cut conflicts.
export const mergeOwnedContextLineage = (
  consumer: ActorIdentity,
  previous: ContextLineage,
  providers: ContextLineageProvider[],
): Result.Result<ContextLineage, PublicDiagnostic> => {
  const builder = makeContextLineageBuilder();

  for (const provider of providers) {
    const path = ["contextBindings", provider.slot];
    const valid = validateCut(provider.cut.identity.key, provider.cut, path);

    if (Result.isFailure(valid)) return Result.fail(valid.failure);
    const ancestry = ownedTree(provider.lineage);

    if (Result.isFailure(ancestry)) return Result.fail(ancestry.failure);
    const merged = builder.mergeWithCut(ancestry.success, provider.cut, path);

    if (Result.isFailure(merged)) return Result.fail(merged.failure);
  }

  const lineage = builder.finish();

  if (builder.has(consumer.key))
    return Result.fail(conflictingCut(["context", "lineage"], consumer.key));

  return Result.succeed(builder.matches(previous) ? previous : lineage);
};

/** Share unchanged wave cuts while propagating revised ancestors through a DAG. */
export const mergeContextLineageDeltas = (sources: ContextLineage[], own: ContextCut[] = []) => {
  const builder = makeContextLineageBuilder();

  for (const source of sources) {
    const tree = ownedTree(source);

    if (Result.isFailure(tree)) return Result.fail(tree.failure);
    const merged = builder.merge(tree.success, ["context", "changes"]);

    if (Result.isFailure(merged)) return Result.fail(merged.failure);
  }

  for (const cut of own) {
    const valid = validateCut(cut.identity.key, cut, ["context", "changes"]);

    if (Result.isFailure(valid)) return Result.fail(valid.failure);
    const inserted = builder.add(cut, ["context", "changes"]);

    if (Result.isFailure(inserted)) return Result.fail(inserted.failure);
  }

  return Result.succeed(builder.finish());
};

export const makeContextDebtOps = () => makeTrieContextDebtOps(ownedTree);

// RETURN_TYPE: The merge operation exposes only a typed failure, not the mutable destination.
const appendCut = (
  next: Map<string, ContextCut>,
  consumer: ActorIdentity,
  ancestor: string,
  cut: ContextCut,
  path: (string | number)[],
): Result.Result<void, PublicDiagnostic> => {
  if (ancestor === consumer.key) return Result.fail(conflictingCut(path, ancestor));

  const present = next.get(ancestor);

  if (present !== undefined && !sameCut(present, cut))
    return Result.fail(conflictingCut(path, ancestor));

  next.set(ancestor, ownCut(cut));

  return Result.succeed(undefined);
};

/** Merge provider ancestry without retaining mutable caller cuts. */
export const reconcileContextLineage = (
  consumer: ActorIdentity,
  previous: ContextLineage,
  providers: ContextLineageProvider[],
) => {
  const priorValidation = validateLineage(previous, ["context", "lineage"]);

  if (Result.isFailure(priorValidation)) return Result.fail(priorValidation.failure);

  const next = new Map<string, ContextCut>();

  for (const provider of providers) {
    const path = ["contextBindings", provider.slot];
    const providerValidation = validateCut(provider.cut.identity.key, provider.cut, path);

    if (Result.isFailure(providerValidation)) return Result.fail(providerValidation.failure);

    const lineageValidation = validateLineage(provider.lineage, path);

    if (Result.isFailure(lineageValidation)) return Result.fail(lineageValidation.failure);

    for (const [ancestor, cut] of provider.lineage) {
      const merged = appendCut(next, consumer, ancestor, cut, path);

      if (Result.isFailure(merged)) return Result.fail(merged.failure);
    }

    const merged = appendCut(next, consumer, provider.cut.identity.key, provider.cut, path);

    if (Result.isFailure(merged)) return Result.fail(merged.failure);
  }

  return Result.succeed(sameLineage(previous, next) ? previous : next);
};
