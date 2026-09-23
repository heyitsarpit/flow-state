import { Predicate, Result } from "effect";

import { Failure, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { ActorIdentity } from "../actor/actor-directory.js";
import { copyStructural } from "../structural-copy.js";

declare const evidenceSequenceBrand: unique symbol;

type Reference = Exclude<WeakKey, symbol>;

export type EvidenceSequence = number & { [evidenceSequenceBrand]: void };

// oxlint-disable-next-line anti-slop/no-readonly -- Provenance is part of the copied immutable evidence fact.
export type EvidenceProvenance = Readonly<{
  app: Reference;
  plan: Reference;
  actor: ActorIdentity;
}>;

// oxlint-disable-next-line anti-slop/no-readonly -- Captured revisions and timestamps cannot drift after journal preparation.
type EvidenceMetadata = Readonly<{
  fence: ActorIdentity;
  provenance: EvidenceProvenance;
  timestamp: number;
  publicationRevision: number;
  machineTurnRevision: number;
}>;

export type TurnEvidenceDraft<
  Before = unknown,
  After = unknown,
  Cause = unknown,
> = EvidenceMetadata &
  // oxlint-disable-next-line anti-slop/no-readonly -- Prepared turn facts are copied before the store commit and remain fixed.
  Readonly<{
    _tag: "turn";
    cause: Cause;
    before: Before;
    after: After;
  }>;

export type LifecycleEvidenceDraft<
  Before = unknown,
  After = unknown,
  Cause = unknown,
> = EvidenceMetadata &
  // oxlint-disable-next-line anti-slop/no-readonly -- Prepared lifecycle facts are copied before acceptance and remain fixed.
  Readonly<{
    _tag: "lifecycle";
    machineTurn: false;
    from: string;
    to: string;
    cause: Cause;
    before: Before;
    after: After;
    terminal: boolean;
  }>;

// oxlint-disable-next-line anti-slop/no-readonly -- Preparation freezes the owned draft until total completion binds its result.
export type PreparedTurnEvidence<Before = unknown, After = unknown, Cause = unknown> = Readonly<{
  draft: TurnEvidenceDraft<Before, After, Cause>;
}>;

export type PreparedLifecycleEvidence<
  Before = unknown,
  After = unknown,
  Cause = unknown,
  // oxlint-disable-next-line anti-slop/no-readonly -- Preparation freezes the owned draft until total completion binds its result.
> = Readonly<{
  draft: LifecycleEvidenceDraft<Before, After, Cause>;
}>;

export type TurnEvidenceRecord<
  StoreResult = unknown,
  Before = unknown,
  After = unknown,
  Cause = unknown,
> = TurnEvidenceDraft<Before, After, Cause> &
  // oxlint-disable-next-line anti-slop/no-readonly -- Published records freeze their store result and allocated sequence.
  Readonly<{
    store: StoreResult;
    sequence: EvidenceSequence;
  }>;

export type LifecycleEvidenceRecord<
  Before = unknown,
  After = unknown,
  Cause = unknown,
> = LifecycleEvidenceDraft<Before, After, Cause> &
  // oxlint-disable-next-line anti-slop/no-readonly -- Published records freeze their allocated sequence and disposition.
  Readonly<{ sequence: EvidenceSequence }>;

export type EvidenceRecord = TurnEvidenceRecord | LifecycleEvidenceRecord;

const invalidRecord = (reason: string) =>
  Failure({
    code: "InvalidTraceRecord",
    path: ["evidence", reason],
    details: { reason },
    summary: "Evidence record is invalid.",
    help: "Prepare a complete record for the admitted actor before committing the store.",
  });

// RETURN_TYPE: The brand constructor's failure channel is part of the journal preflight contract.
export const evidenceSequence = (
  value: number,
): Result.Result<EvidenceSequence, PublicDiagnostic> => {
  if (!Number.isSafeInteger(value) || value < 1) return Result.fail(invalidRecord("sequence"));

  // SAFETY: Only the journal calls this after checking the positive safe-integer successor.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the runtime evidence sequence brand is constructed here.
  return Result.succeed(value as EvidenceSequence);
};

const ownData = (value: Reference, key: PropertyKey) => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);

  // FLOW_STATE_ALLOW_UNKNOWN: Own descriptor values are untrusted until the evidence copy validates them.
  const captured: unknown =
    descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;

  return captured;
};

const addIdentity = <Value>(identities: Set<Reference>, value: Value) => {
  if (Predicate.isObject(value)) identities.add(value);
};

const opaqueIdentities = (draft: Reference, additional: Iterable<Reference>) => {
  const identities = new Set<Reference>(additional);
  const provenance = ownData(draft, "provenance");
  addIdentity(identities, ownData(draft, "fence"));

  if (Predicate.isObject(provenance)) {
    addIdentity(identities, ownData(provenance, "app"));
    addIdentity(identities, ownData(provenance, "plan"));
    addIdentity(identities, ownData(provenance, "actor"));
  }

  return identities;
};

const validMetadata = (draft: EvidenceMetadata) =>
  (Object.getPrototypeOf(draft) === Object.prototype || Object.getPrototypeOf(draft) === null) &&
  Number.isSafeInteger(draft.timestamp) &&
  draft.timestamp >= 0 &&
  Number.isSafeInteger(draft.publicationRevision) &&
  draft.publicationRevision >= 0 &&
  Number.isSafeInteger(draft.machineTurnRevision) &&
  draft.machineTurnRevision >= 0;

const validProvenance = (draft: EvidenceMetadata) => {
  const provenance = draft.provenance;

  return (
    Predicate.isObject(provenance) &&
    (Object.getPrototypeOf(provenance) === Object.prototype ||
      Object.getPrototypeOf(provenance) === null) &&
    provenance.actor === draft.fence
  );
};

// RETURN_TYPE: The preparation result is the only typed input to total completion.
export const prepareTurnEvidence = <Before, After, Cause>(
  draft: TurnEvidenceDraft<Before, After, Cause>,
  opaque: Iterable<Reference> = [],
  timestampOverride?: number,
): Result.Result<PreparedTurnEvidence<Before, After, Cause>, PublicDiagnostic> => {
  const identities = Result.try({
    try: () => opaqueIdentities(draft, opaque),
    catch: () => invalidRecord("turn-reflection"),
  });

  if (Result.isFailure(identities)) return Result.fail(identities.failure);

  const copied = copyStructural(
    draft,
    "evidence",
    identities.success,
    timestampOverride === undefined ? undefined : { key: "timestamp", value: timestampOverride },
  );

  if (Result.isFailure(copied)) return Result.fail(copied.failure);

  const validated = Result.try({
    try: () =>
      validMetadata(copied.success) &&
      validProvenance(copied.success) &&
      ownData(copied.success, "_tag") === "turn",
    catch: () => invalidRecord("turn-metadata"),
  });

  if (Result.isFailure(validated)) return Result.fail(validated.failure);

  if (!validated.success) return Result.fail(invalidRecord("turn-metadata"));

  // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: prepared turn cannot swap its owned draft before completion; P055-RECORD-TURN.
  return Result.succeed(Object.freeze({ draft: copied.success }));
};

// RETURN_TYPE: The lifecycle preparation carries captured terminal disposition into total completion.
export const prepareLifecycleEvidence = <Before, After, Cause>(
  draft: LifecycleEvidenceDraft<Before, After, Cause>,
  opaque: Iterable<Reference> = [],
  timestampOverride?: number,
): Result.Result<PreparedLifecycleEvidence<Before, After, Cause>, PublicDiagnostic> => {
  const identities = Result.try({
    try: () => opaqueIdentities(draft, opaque),
    catch: () => invalidRecord("lifecycle-reflection"),
  });

  if (Result.isFailure(identities)) return Result.fail(identities.failure);

  const copied = copyStructural(
    draft,
    "evidence",
    identities.success,
    timestampOverride === undefined ? undefined : { key: "timestamp", value: timestampOverride },
  );

  if (Result.isFailure(copied)) return Result.fail(copied.failure);

  const validated = Result.try({
    try: () =>
      validMetadata(copied.success) &&
      validProvenance(copied.success) &&
      ownData(copied.success, "_tag") === "lifecycle" &&
      ownData(copied.success, "machineTurn") === false &&
      Predicate.isString(copied.success.from) &&
      Predicate.isString(copied.success.to) &&
      Predicate.isBoolean(copied.success.terminal),
    catch: () => invalidRecord("lifecycle-metadata"),
  });

  if (Result.isFailure(validated)) return Result.fail(validated.failure);

  if (!validated.success) return Result.fail(invalidRecord("lifecycle-metadata"));

  // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: prepared lifecycle cannot swap its owned draft before completion; P055-RECORD-LIFECYCLE.
  return Result.succeed(Object.freeze({ draft: copied.success }));
};

/** Only the already-owned store result and journal-issued sequence remain after preparation. */
// RETURN_TYPE: Completion preserves the exact store-result and snapshot families.
export const completeTurnEvidence = <StoreResult, Before, After, Cause>(
  prepared: PreparedTurnEvidence<Before, After, Cause>,
  store: StoreResult,
  sequence: EvidenceSequence,
): TurnEvidenceRecord<StoreResult, Before, After, Cause> => {
  const record = { ...prepared.draft, store, sequence };

  // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: published turn record cannot change sequence or store; P055-RECORD-TURN.
  return Object.freeze(record);
};

// RETURN_TYPE: Lifecycle completion preserves the prepared snapshot and Cause families.
export const completeLifecycleEvidence = <Before, After, Cause>(
  prepared: PreparedLifecycleEvidence<Before, After, Cause>,
  sequence: EvidenceSequence,
): LifecycleEvidenceRecord<Before, After, Cause> => {
  const record = { ...prepared.draft, sequence };

  // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: published lifecycle record cannot change sequence or disposition; P055-RECORD-LIFECYCLE.
  return Object.freeze(record);
};
