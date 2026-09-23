import { Result } from "effect";

import type { PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { ActorIdentity } from "../actor/actor-directory.js";
import {
  validateLineage,
  makeContextDebtOps,
  mergeContextLineageDeltas,
  type ContextCut,
  type ContextEdgeDebt,
  type ContextLineage,
} from "./lineage.js";

type CapturedCut = { identity: ActorIdentity; snapshot: { revision: number } };

const changedDirectCut = (
  provider: ActorIdentity,
  previous: ContextLineage,
  captured: Map<string, CapturedCut>,
) => {
  const observed = captured.get(provider.key);

  if (observed === undefined) return undefined;
  const covered = previous.get(provider.key);

  return covered === undefined ||
    !Object.is(covered.identity, observed.identity) ||
    covered.revision !== observed.snapshot.revision
    ? { identity: observed.identity, revision: observed.snapshot.revision }
    : undefined;
};

type ContextWaveChanges = {
  cuts: Map<string, ContextLineage>;
  debt: ReturnType<typeof makeContextDebtOps>;
  inherit(
    identity: ActorIdentity,
    node: { providers: Array<{ provider: ActorIdentity }>; lineage: ContextLineage } | undefined,
    captured: Map<string, CapturedCut>,
  ): Result.Result<ContextLineage, PublicDiagnostic>;
  published(
    identity: ActorIdentity,
    previous: number | undefined,
    revision: number,
  ): Result.Result<void, PublicDiagnostic>;
};

/** One wave's shared changed cuts, inherited in topological order. */
// RETURN_TYPE: The wave port hides the private persistent trie implementation.
export const makeContextWaveChanges = (
  root: ActorIdentity,
  revision: number,
): Result.Result<ContextWaveChanges, PublicDiagnostic> => {
  const seeded = mergeContextLineageDeltas([], [{ identity: root, revision }]);

  if (Result.isFailure(seeded)) return Result.fail(seeded.failure);
  const cuts = new Map<string, ContextLineage>([[root.key, seeded.success]]);
  const debt = makeContextDebtOps();

  return Result.succeed({
    cuts,
    debt,
    inherit(
      identity: ActorIdentity,
      node: { providers: Array<{ provider: ActorIdentity }>; lineage: ContextLineage } | undefined,
      captured: Map<string, CapturedCut>,
    ) {
      const sources: ContextLineage[] = [];
      const direct: ContextCut[] = [];
      const previous = node?.lineage ?? new Map();

      for (const { provider } of node?.providers ?? []) {
        sources.push(cuts.get(provider.key) ?? new Map());
        const changed = changedDirectCut(provider, previous, captured);

        if (changed !== undefined) direct.push(changed);
      }

      const inherited = mergeContextLineageDeltas(sources, direct);

      if (Result.isSuccess(inherited)) cuts.set(identity.key, inherited.success);

      return inherited;
    },
    published(identity: ActorIdentity, previous: number | undefined, revision: number) {
      if (previous === revision) return Result.succeed(undefined);

      const revised = mergeContextLineageDeltas(
        [cuts.get(identity.key) ?? new Map()],
        [{ identity, revision }],
      );

      if (Result.isSuccess(revised)) cuts.set(identity.key, revised.success);

      return Result.isFailure(revised) ? Result.fail(revised.failure) : Result.succeed(undefined);
    },
  });
};

/** One incoming edge's changed requirements and currently attested ancestry. */
export type ContextDebtUpdate = {
  edge: string;
  changed: ContextLineage;
  covered: ContextLineage;
  /** A blocked edge inherits only ancestors already present in its provider lineage. */
  inherited: boolean;
};

/** Apply every edge update with shared wave-local trie work. */
export const reconcileOwnedContextDebtBatch = (
  previous: ContextEdgeDebt,
  updates: ContextDebtUpdate[],
  debt = makeContextDebtOps(),
) => {
  if (updates.length === 0) return Result.succeed(previous);

  const next = new Map(previous);
  const touched = new Map<string, ContextLineage>();

  for (const update of updates) {
    const pending = touched.get(update.edge) ?? next.get(update.edge) ?? new Map();

    const reconciled = debt.reconcile(
      pending,
      update.changed,
      update.covered,
      update.inherited,
      update.edge,
    );

    if (Result.isFailure(reconciled)) return Result.fail(reconciled.failure);
    touched.set(update.edge, reconciled.success);
  }

  for (const [edge, pending] of touched) {
    if (pending.size === 0) next.delete(edge);
    else next.set(edge, pending);
  }

  return Result.succeed(next);
};

/** Strict standalone boundary validates caller-owned lineages before reconciliation. */
export const reconcileContextEdgeDebt = (
  previous: ContextEdgeDebt,
  edge: string,
  required: ContextLineage,
  covered: ContextLineage,
) => {
  for (const [provider, lineage] of previous) {
    const valid = validateLineage(lineage, ["context", "debt", provider]);

    if (Result.isFailure(valid)) return Result.fail(valid.failure);
  }

  const requiredValidation = validateLineage(required, ["context", "required", edge]);

  if (Result.isFailure(requiredValidation)) return Result.fail(requiredValidation.failure);
  const coveredValidation = validateLineage(covered, ["context", "covered", edge]);

  if (Result.isFailure(coveredValidation)) return Result.fail(coveredValidation.failure);

  return reconcileOwnedContextDebtBatch(previous, [
    { edge, changed: required, covered, inherited: false },
  ]);
};
