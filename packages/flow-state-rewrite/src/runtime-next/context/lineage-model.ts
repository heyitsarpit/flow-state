import { Option, Result } from "effect";

import { Failure, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { ActorIdentity } from "../actor/actor-directory.js";

/** One exact actor lifetime at one published revision. */
// oxlint-disable-next-line anti-slop/no-readonly -- A context cut fixes one actor incarnation and revision across sibling lineage views.
export type ContextCut = { readonly identity: ActorIdentity; readonly revision: number };

/** A consumer's inherited ancestors, keyed by actor key. */
// oxlint-disable-next-line anti-slop/no-readonly -- The lineage map exposes inherited cuts for reading; only its debt owner creates updated lineage.
export type ContextLineage = ReadonlyMap<string, ContextCut>;

/** Unsettled ancestor requirements grouped by incoming provider key. */
export type ContextEdgeDebt = Map<string, ContextLineage>;

export type ContextLineageProvider = {
  slot: string;
  cut: ContextCut;
  lineage: ContextLineage;
};

const invalidCut = (path: (string | number)[], summary: string) =>
  Failure({
    code: "MissingContextProvider",
    path,
    details: {},
    summary,
    help: "Reconcile the provider at a valid current revision.",
  });

export const conflictingCut = (path: (string | number)[], ancestor: string) =>
  Failure({
    code: "MissingContextProvider",
    path,
    details: { ancestor, reason: "incompatible-ancestor-cut" },
    summary: "Context providers require incompatible ancestor cuts.",
    help: "Reconcile the stale provider before selecting this consumer context.",
  });

// RETURN_TYPE: Keep validation failures independent of the cut value they inspect.
export const validateCut = (
  key: string,
  cut: ContextCut,
  path: (string | number)[],
): Result.Result<void, PublicDiagnostic> => {
  if (cut.identity.key !== key)
    return Result.fail(invalidCut(path, "Context cut does not match its actor key."));

  if (!Number.isSafeInteger(cut.revision) || cut.revision < 0)
    return Result.fail(invalidCut(path, "Context revision must be a non-negative safe integer."));

  return Result.succeed(undefined);
};

// RETURN_TYPE: A validated lineage remains owned by its caller until reconciliation succeeds.
export const validateLineage = (
  lineage: ContextLineage,
  path: (string | number)[],
): Result.Result<void, PublicDiagnostic> => {
  for (const [key, cut] of lineage) {
    const validation = validateCut(key, cut, [...path, key]);

    if (Result.isFailure(validation)) return Result.fail(validation.failure);
  }

  return Result.succeed(undefined);
};

export const sameCut = (left: ContextCut, right: ContextCut) =>
  Object.is(left.identity, right.identity) && left.revision === right.revision;

export const covers = (actual: ContextCut, required: ContextCut) =>
  Object.is(actual.identity, required.identity) && actual.revision >= required.revision;

export const sameLineage = (left: ContextLineage, right: ContextLineage) => {
  if (left.size !== right.size) return false;

  for (const [key, cut] of right) {
    const current = left.get(key);

    if (current === undefined || !sameCut(current, cut)) return false;
  }

  return true;
};

/** Shared ancestry keeps the copied cut immutable across sibling edge views. */
export const ownCut = (cut: ContextCut) =>
  // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: copied shared cut cannot change identity or revision; P055-CONTEXT-CUT.
  Object.freeze({ identity: cut.identity, revision: cut.revision });

export const addDebtCut = (
  required: Option.Option<ContextCut>,
  observed: Option.Option<ContextCut>,
) => {
  if (Option.isNone(required)) return { cut: observed, conflict: Option.none<string>() };

  if (Option.isNone(observed)) return { cut: required, conflict: Option.none<string>() };

  if (!Object.is(required.value.identity, observed.value.identity))
    return { cut: required, conflict: Option.some(required.value.identity.key) };

  const cut = covers(observed.value, required.value) ? observed.value : required.value;

  return { cut: Option.some(cut), conflict: Option.none<string>() };
};

export const settleDebtCut = (
  required: Option.Option<ContextCut>,
  observed: Option.Option<ContextCut>,
  inherited: boolean,
) => {
  if (Option.isNone(required)) return { cut: required, conflict: Option.none<string>() };

  if (Option.isNone(observed))
    return {
      cut: inherited ? Option.none<ContextCut>() : required,
      conflict: Option.none<string>(),
    };

  if (!Object.is(required.value.identity, observed.value.identity))
    return { cut: required, conflict: Option.some(required.value.identity.key) };

  const cut = covers(observed.value, required.value) ? Option.none<ContextCut>() : required;

  return { cut, conflict: Option.none<string>() };
};
