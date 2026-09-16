// oxlint-disable-next-line anti-slop/no-large-production-file -- evidence sequencing, attachment admission, and runtime publication form one owner boundary.
import { Cause, Clock, Deferred, Effect, Exit, Option, Result, Semaphore } from "effect";

import { appPlan, type App } from "../app/app.js";
import { Failure, type PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type { MachineDefinition } from "../machine/grammar.js";
import type { ActorFence, ActorIdentity } from "./actor-admission.js";
import type {
  ActorPublication,
  ActorSnapshot,
  ActorStoreResult,
  PreparedActorEvidence,
} from "./actor-engine.js";
import type { RuntimeEvidenceService, RuntimeLifecycleEvidence } from "./runtime-services.js";
import type { TurnCause } from "./turn-plan.js";

declare const evidenceSequenceBrand: unique symbol;

declare const sinkIdBrand: unique symbol;

/** Runtime-global evidence order is allocated only by an EvidenceJournal. */
export type EvidenceSequence = number & { [evidenceSequenceBrand]: void };

/** Sink identity is local to one EvidenceJournal. */
export type SinkId = string & { [sinkIdBrand]: void };

type RuntimePlan = ReturnType<typeof appPlan>;

/** Evidence retains exact app/plan identity and the actor incarnation. */
export type RuntimeProvenance<
  A extends App = App,
  DefinitionValue extends MachineDefinition = MachineDefinition,
> = {
  app: A;
  plan: RuntimePlan;
  actor: Pick<ActorIdentity<DefinitionValue>, "key" | "incarnation" | "leaseEpoch">;
};

/** A committed actor/store cut before Journal sequencing. */
export type TurnFact<A extends App, DefinitionValue extends MachineDefinition> = {
  fence: ActorFence;
  provenance: RuntimeProvenance<A, DefinitionValue>;
  cause: TurnCause<DefinitionValue>;
  before: ActorSnapshot<DefinitionValue>;
  after: ActorSnapshot<DefinitionValue>;
  store: ActorStoreResult<DefinitionValue>;
  publicationRevision: number;
  machineTurnRevision: number;
  timestamp: number;
};

/** Immutable actual evidence for one committed actor/store cut. */
export type TurnRecord<A extends App, DefinitionValue extends MachineDefinition> = TurnFact<
  A,
  DefinitionValue
> & {
  _tag: "turn";
  sequence: EvidenceSequence;
};

/** Lifecycle evidence is the record shape already consumed by lifecycle.ts. */
export type LifecycleFact<
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = Omit<
  RuntimeLifecycleEvidence<DefinitionValue, CleanupError, ProviderDefinition>,
  "evidenceSequence"
>;

export type LifecycleRecord<
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = LifecycleFact<DefinitionValue, CleanupError, ProviderDefinition> & {
  evidenceSequence: EvidenceSequence;
};

/** A prepared fact has no global sequence until the Journal commit gate accepts it. */
export type PreparedEvidenceRecord =
  | Omit<Extract<EvidenceRecord, { _tag: "turn" }>, "sequence">
  | Omit<Extract<EvidenceRecord, { _tag: "lifecycle" }>, "evidenceSequence">;

type EvidenceProvenance = {
  app: App;
  plan: RuntimePlan;
  actor: Pick<ActorIdentity, "key" | "incarnation" | "leaseEpoch">;
};

/** The sink boundary retains the concrete record fields without exposing their generic owners. */
export type EvidenceRecord =
  | {
      _tag: "turn";
      fence: ActorFence;
      provenance: EvidenceProvenance;
      cause: CauseEnvelope;
      before: SnapshotEnvelope;
      after: SnapshotEnvelope;
      store: StoreEnvelope;
      publicationRevision: number;
      machineTurnRevision: number;
      timestamp: number;
      sequence: number;
    }
  | {
      _tag: "lifecycle";
      machineTurn: false;
      from: string;
      to: string;
      cause: unknown;
      before: LifecycleSnapshotEnvelope;
      after: LifecycleSnapshotEnvelope;
      timestamp: number;
      publicationRevision: number;
      machineTurnRevision: number;
      evidenceSequence: number;
      provenance: EvidenceProvenance;
    };

export type EvidencePreparation = {
  journal: EvidenceJournal;
  token: object;
};

export type EvidenceCredit = {
  journal: EvidenceJournal;
  actorKey: string;
  fence: ActorFence;
  token: object;
};

export type AttachmentOfferResult = {
  sink: SinkId;
  sequence: EvidenceSequence;
  status: "accepted" | "dropped" | "detached";
};

export type AttachmentDrainResult = {
  sink: SinkId;
  through: EvidenceSequence;
  status: "drained" | "truncated" | "failed";
};

/** Journal-issued capability; P10 owns the queue and delivery behind this token. */
export type EvidenceAttachmentToken = {
  id: SinkId;
  offerUnsafe: (record: EvidenceRecord, sequence: EvidenceSequence) => AttachmentOfferResult;
  drain: (through: EvidenceSequence) => Effect.Effect<AttachmentDrainResult, PublicDiagnostic>;
  close: () => Effect.Effect<void, PublicDiagnostic>;
  truncatedBefore: () => EvidenceSequence | undefined;
};

export type EvidenceAcceptance = {
  preparation: EvidencePreparation;
  record: EvidenceRecord;
  sequence: EvidenceSequence;
  attachments: AttachmentOfferResult[];
};

type EvidenceReference = Exclude<WeakKey, symbol>;

export type EvidenceDrain = {
  through: EvidenceSequence | 0;
  truncatedBefore: Option.Option<EvidenceSequence>;
  attachments: AttachmentDrainResult[];
};

const invalidEvidence = (
  reason: string,
  details: Record<string, string | number | boolean | null>,
) =>
  Failure({
    code: "InvalidTraceRecord",
    path: ["evidence", reason],
    details,
    summary: "Evidence record is not valid for this runtime.",
    help: "Use a record created from this runtime's admitted app, plan, and preparation.",
  });

const closedEvidence = () =>
  Failure({
    code: "RuntimeDisposed",
    path: ["evidence", "closed"],
    details: {},
    summary: "Evidence admission is closed.",
    help: "Accept evidence before runtime disposal begins.",
  });

const counterOverflow = (name: string) =>
  Failure({
    code: "InvariantViolation",
    path: ["evidence", name],
    details: { current: Number.MAX_SAFE_INTEGER },
    summary: "Evidence counter cannot advance.",
    help: "Stop before counter wrap or sequence reuse.",
  });

const copyArray = <Value>(values: Iterable<Value>) => [...values];

const sequenceValue = (value: number) => {
  // SAFETY: callers validate positive safe integer bounds before branding a sequence.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the Journal owns this numeric brand.
  return value as EvidenceSequence;
};

// RETURN_TYPE: Weak collection membership needs the reference-only type guard before identity tracking.
const isReference = (value: unknown): value is EvidenceReference =>
  (typeof value === "object" && value !== null) || typeof value === "function";

// RETURN_TYPE: The copier only owns plain records and arrays; opaque references remain untouched.
const isStructuredContainer = (value: unknown): value is EvidenceReference => {
  if (Array.isArray(value)) return true;

  if (!isReference(value)) return false;
  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
};

const preserveOpaque = (preserved: WeakSet<EvidenceReference>, value: unknown) => {
  if (isReference(value)) preserved.add(value);
};

// RETURN_TYPE: Recursive copying changes only structured containers while retaining each evidence family.
const copyStructured = <Value>(value: Value, preserved: WeakSet<EvidenceReference>): Value => {
  const copied = new WeakMap<EvidenceReference, EvidenceReference>();

  const copyArrayLength = (clone: EvidenceReference, current: EvidenceReference) => {
    if (!Array.isArray(current)) return;
    Object.defineProperty(clone, "length", {
      value: current.length,
      writable: true,
      enumerable: false,
      configurable: false,
    });
  };

  const copyEnumerableProperties = (clone: EvidenceReference, current: EvidenceReference) => {
    for (const key of Reflect.ownKeys(current)) {
      if (Array.isArray(current) && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(current, key);

      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) continue;
      Object.defineProperty(clone, key, {
        value: copy(descriptor.value),
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  };

  const copy = (current: unknown) => {
    if (!isStructuredContainer(current) || preserved.has(current)) return current;
    const previous = copied.get(current);

    if (previous !== undefined) return previous;

    const clone: EvidenceReference = Array.isArray(current)
      ? []
      : Object.create(Object.getPrototypeOf(current));

    copied.set(current, clone);
    copyArrayLength(clone, current);
    copyEnumerableProperties(clone, current);

    return clone;
  };

  // SAFETY: copy preserves the input's structure while replacing owned structured containers.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- recursive structural copying retains the caller's evidence family.
  return copy(value) as Value;
};

type SnapshotEnvelope = {
  lifecycle: ActorSnapshot<MachineDefinition>["lifecycle"];
  state: unknown;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- context fields retain application values until opaque leaves are preserved.
  context: Record<string, unknown>;
  operations: { descriptor: unknown }[];
  issues: unknown[];
};

type StoreEnvelope = {
  revision: number;
  changed: { descriptor: unknown }[];
};

type CauseEnvelope =
  | { _tag: "event"; event: unknown }
  | {
      _tag: "projection";
      fact: ProjectionEnvelope;
    };

type ProjectionEnvelope =
  | {
      _tag: "completion-projection";
      completion: {
        fence: { descriptor: unknown };
        outcome: {
          _tag: string;
          value?: unknown;
          error?: unknown;
          exit?: unknown;
        };
      };
    }
  | {
      _tag: "stream-projection";
      fact: { fence: { descriptor: unknown }; value: unknown };
    }
  | {
      _tag: "context-projection";
      provider: { value: unknown };
    }
  | {
      _tag: "store-projection";
      fact: { changed: { descriptor: unknown }[] };
    }
  | { _tag: "timer-projection" }
  | { _tag: "lifecycle-projection" };

const preserveSnapshotOpaque = (
  snapshot: SnapshotEnvelope,
  preserved: WeakSet<EvidenceReference>,
) => {
  preserveOpaque(preserved, snapshot.state);

  for (const value of Object.values(snapshot.context)) preserveOpaque(preserved, value);

  for (const operation of snapshot.operations) preserveOpaque(preserved, operation.descriptor);

  for (const issue of snapshot.issues) preserveOpaque(preserved, issue);
};

type CompletionEnvelope = Extract<ProjectionEnvelope, { _tag: "completion-projection" }>;

const preserveCompletionOpaque = (
  completion: CompletionEnvelope["completion"],
  preserved: WeakSet<EvidenceReference>,
) => {
  preserveOpaque(preserved, completion.fence.descriptor);

  switch (completion.outcome._tag) {
    case "success":
      preserveOpaque(preserved, completion.outcome.value);

      return;
    case "failure":
      preserveOpaque(preserved, completion.outcome.error);

      return;
    case "defect":
    case "interrupt":
      preserveOpaque(preserved, completion.outcome.exit);

      return;
  }
};

const preserveProjectionOpaque = (
  fact: ProjectionEnvelope,
  preserved: WeakSet<EvidenceReference>,
) => {
  switch (fact._tag) {
    case "completion-projection":
      preserveCompletionOpaque(fact.completion, preserved);

      return;
    case "stream-projection":
      preserveOpaque(preserved, fact.fact.fence.descriptor);
      preserveOpaque(preserved, fact.fact.value);

      return;
    case "context-projection":
      preserveOpaque(preserved, fact.provider.value);

      return;
    case "store-projection":
      for (const changed of fact.fact.changed) preserveOpaque(preserved, changed.descriptor);

      return;
    case "timer-projection":
    case "lifecycle-projection":
      return;
  }
};

const preserveCauseOpaque = (cause: CauseEnvelope, preserved: WeakSet<EvidenceReference>) => {
  if (cause._tag === "event") return;
  preserveProjectionOpaque(cause.fact, preserved);
};

type LifecycleSnapshotEnvelope = {
  fence: ActorFence;
  attachment: {
    providerRevisions: unknown;
    cursors: unknown;
    resources: {
      close: unknown;
      reacquire?: unknown;
      cause: unknown;
    }[];
    work: {
      fiber: unknown;
      cancel: unknown;
      finalizer: unknown;
      reacquire?: unknown;
      cause: unknown;
      completion?: unknown;
    }[];
    bindings: {
      provider: unknown;
      select: unknown;
    }[];
    operations: { cause: unknown }[];
    timers: { refresh?: unknown }[];
    blockedDisposal?: { dependentActors: unknown[] };
  };
};

const preserveLifecycleOpaque = (
  snapshot: LifecycleSnapshotEnvelope,
  preserved: WeakSet<EvidenceReference>,
) => {
  const attachment = snapshot.attachment;
  preserveOpaque(preserved, attachment.providerRevisions);
  preserveOpaque(preserved, attachment.cursors);

  for (const resource of attachment.resources) {
    preserveOpaque(preserved, resource.close);
    preserveOpaque(preserved, resource.reacquire);
    preserveOpaque(preserved, resource.cause);
  }

  for (const work of attachment.work) {
    preserveOpaque(preserved, work.fiber);
    preserveOpaque(preserved, work.cancel);
    preserveOpaque(preserved, work.finalizer);
    preserveOpaque(preserved, work.reacquire);
    preserveOpaque(preserved, work.cause);
    preserveOpaque(preserved, work.completion);
  }

  for (const binding of attachment.bindings) {
    preserveOpaque(preserved, binding.provider);
    preserveOpaque(preserved, binding.select);
  }

  for (const operation of attachment.operations) preserveOpaque(preserved, operation.cause);

  for (const timer of attachment.timers) preserveOpaque(preserved, timer.refresh);

  for (const actor of attachment.blockedDisposal?.dependentActors ?? [])
    preserveOpaque(preserved, actor);
};

const copyRecord = (record: EvidenceRecord) => {
  const preserved = new WeakSet<EvidenceReference>();
  preserveOpaque(preserved, record.provenance.app);
  preserveOpaque(preserved, record.provenance.plan);

  if (record._tag === "turn") {
    preserveSnapshotOpaque(record.before, preserved);
    preserveSnapshotOpaque(record.after, preserved);
    preserveCauseOpaque(record.cause, preserved);

    for (const changed of record.store.changed) preserveOpaque(preserved, changed.descriptor);
  } else {
    preserveLifecycleOpaque(record.before, preserved);
    preserveLifecycleOpaque(record.after, preserved);
  }

  return copyStructured(record, preserved);
};

export type EvidenceJournal = {
  sequence: () => EvidenceSequence | 0;
  prepare: () => Result.Result<EvidencePreparation, PublicDiagnostic>;
  registerActor: (
    actorKey: string,
    fence: ActorFence,
  ) => Result.Result<EvidenceCredit, PublicDiagnostic>;
  releaseActor: (actorKey: string) => Result.Result<void, PublicDiagnostic>;
  prepareLifecycle: (actorKey: string) => Result.Result<EvidencePreparation, PublicDiagnostic>;
  settleOutcome: (
    preparation: EvidencePreparation,
    terminal: boolean,
  ) => Result.Result<void, PublicDiagnostic>;
  cancel: (preparation: EvidencePreparation) => Result.Result<void, PublicDiagnostic>;
  attach: (attachment: EvidenceAttachmentToken) => Result.Result<void, PublicDiagnostic>;
  attachmentTokens: () => readonly EvidenceAttachmentToken[];
  /** Synchronous acceptance is the only point where a global sequence is assigned. */
  acceptSync: (
    preparation: EvidencePreparation,
    record: PreparedEvidenceRecord,
  ) => Result.Result<EvidenceAcceptance, PublicDiagnostic>;
  accept: (
    preparation: EvidencePreparation,
    record: PreparedEvidenceRecord,
  ) => Effect.Effect<EvidenceAcceptance, PublicDiagnostic>;
  drain: () => Effect.Effect<EvidenceDrain, PublicDiagnostic>;
  close: () => Effect.Effect<EvidenceDrain, PublicDiagnostic>;
};

const attachmentOwners = new WeakMap<EvidenceAttachmentToken, EvidenceJournal>();

type PreparationState = {
  preparation: EvidencePreparation;
  status: "pending" | "accepted";
  credit?: EvidenceCredit;
};

type ActorCreditState = {
  credit: EvidenceCredit;
  status: "live" | "outcome" | "terminal";
  preparation?: EvidencePreparation;
};

type EvidenceDrainCapture = {
  through: EvidenceSequence | 0;
  attachmentThrough: EvidenceSequence;
  truncatedBefore: Option.Option<EvidenceSequence>;
  attachments: readonly EvidenceAttachmentToken[];
};

/** Owns sequence allocation, accepted-prefix ordering, attachment admission, and close drain. */
// RETURN_TYPE: The public Journal factory preserves the recursive preparation and sink contract.
export const makeEvidenceJournal = (options: {
  app: App;
  plan: RuntimePlan;
  capacity?: number;
}): EvidenceJournal => {
  const semaphore = Semaphore.makeUnsafe(1);
  const attachmentTokens: EvidenceAttachmentToken[] = [];
  const preparations = new Map<object, PreparationState>();
  const credits = new Map<string, ActorCreditState>();
  const outcomePreparations = new Map<object, EvidenceCredit>();
  const capacity = options.capacity ?? Number.MAX_SAFE_INTEGER;
  let ordinaryPrepared = 0;
  let accepted = 0;
  let closed = false;
  let truncatedBefore: EvidenceSequence | undefined;
  let creditWaiter: Deferred.Deferred<void> | undefined;
  let closeCell: Deferred.Deferred<Exit.Exit<EvidenceDrain, PublicDiagnostic>> | undefined;

  const wakeCreditWaiter = () => {
    if (credits.size !== 0 || creditWaiter === undefined) return;
    Deferred.doneUnsafe(creditWaiter, Effect.succeed(undefined));
    creditWaiter = undefined;
  };

  const registerActor = (
    actorKey: string,
    fence: ActorFence,
  ): Result.Result<EvidenceCredit, PublicDiagnostic> => {
    if (closed) return Result.fail(closedEvidence());

    if (actorKey !== fence.key)
      return Result.fail(invalidEvidence("credit", { reason: "actor-mismatch" }));

    if (credits.has(actorKey))
      return Result.fail(invalidEvidence("credit", { reason: "actor-already-registered" }));

    const credit: EvidenceCredit = { journal, actorKey, fence: { ...fence }, token: {} };

    credits.set(actorKey, { credit, status: "live" });

    return Result.succeed(credit);
  };

  const releaseActor = (actorKey: string) => {
    const state = credits.get(actorKey);

    if (state === undefined) return Result.succeed(undefined);
    credits.delete(actorKey);

    if (state.preparation !== undefined) {
      preparations.delete(state.preparation.token);
      outcomePreparations.delete(state.preparation.token);
    }

    wakeCreditWaiter();

    return Result.succeed(undefined);
  };

  const prepareUnsafe = (): Result.Result<EvidencePreparation, PublicDiagnostic> => {
    if (closed) return Result.fail(closedEvidence());

    if (!Number.isSafeInteger(capacity) || capacity < 1)
      return Result.fail(invalidEvidence("capacity", { reason: "invalid", capacity }));

    if (ordinaryPrepared >= capacity)
      return Result.fail(invalidEvidence("credit", { reason: "ordinary-capacity" }));
    const token = {};
    const preparation = { journal, token } satisfies EvidencePreparation;
    preparations.set(token, { preparation, status: "pending" });
    ordinaryPrepared += 1;

    return Result.succeed(preparation);
  };

  const prepareLifecycle = (actorKey: string) => {
    if (closed) return Result.fail(closedEvidence());
    const credit = credits.get(actorKey);

    if (credit === undefined)
      return Result.fail(invalidEvidence("credit", { reason: "actor-not-registered" }));

    if (credit.status !== "live")
      return Result.fail(invalidEvidence("credit", { reason: "outcome-in-flight" }));
    const token = {};
    const preparation = { journal, token } satisfies EvidencePreparation;
    credit.status = "outcome";
    credit.preparation = preparation;
    preparations.set(token, { preparation, status: "pending", credit: credit.credit });
    outcomePreparations.set(token, credit.credit);

    return Result.succeed(preparation);
  };

  const validatePreparation = (
    preparation: EvidencePreparation,
    record: PreparedEvidenceRecord,
  ) => {
    if (preparation.journal !== journal)
      return Result.fail(invalidEvidence("preparation", { reason: "foreign-journal" }));
    const retained = preparations.get(preparation.token);

    if (
      retained === undefined ||
      retained.preparation !== preparation ||
      retained.status !== "pending"
    )
      return Result.fail(invalidEvidence("preparation", { reason: "unknown" }));

    // Journal close fences new preparations but admits terminal outcomes already reserved by
    // a live actor so their accepted prefix can settle before the close waits for credits.
    if (closed && retained.credit === undefined) return Result.fail(closedEvidence());

    if (record.provenance.app !== options.app || record.provenance.plan !== options.plan)
      return Result.fail(invalidEvidence("provenance", { reason: "foreign-runtime" }));

    if (retained.credit !== undefined) {
      const credit = retained.credit;
      const recordFence = record._tag === "turn" ? record.fence : record.after.fence;

      if (
        record.provenance.actor.key !== credit.actorKey ||
        recordFence.key !== credit.actorKey ||
        record.provenance.actor.incarnation !== recordFence.incarnation ||
        record.provenance.actor.leaseEpoch !== recordFence.leaseEpoch ||
        recordFence.key !== credit.fence.key ||
        recordFence.incarnation !== credit.fence.incarnation ||
        recordFence.generation !== credit.fence.generation ||
        recordFence.leaseEpoch !== credit.fence.leaseEpoch
      )
        return Result.fail(invalidEvidence("credit", { reason: "actor-mismatch" }));
    }

    return Result.succeed(undefined);
  };

  const acceptUnsafe = (
    preparation: EvidencePreparation,
    record: PreparedEvidenceRecord,
  ): Result.Result<EvidenceAcceptance, PublicDiagnostic> => {
    const validation = validatePreparation(preparation, record);

    if (Result.isFailure(validation)) return Result.fail(validation.failure);

    if (accepted >= Number.MAX_SAFE_INTEGER) return Result.fail(counterOverflow("sequence"));
    const sequence = sequenceValue(accepted + 1);

    const sequenced: EvidenceRecord =
      record._tag === "turn" ? { ...record, sequence } : { ...record, evidenceSequence: sequence };

    const copied = Result.try({
      try: () => copyRecord(sequenced),
      catch: () => invalidEvidence("record", { reason: "copy-failed" }),
    });

    if (Result.isFailure(copied)) {
      cancelUnsafe(preparation);

      return Result.fail(copied.failure);
    }

    const state = preparations.get(preparation.token);

    if (state === undefined)
      return Result.fail(invalidEvidence("preparation", { reason: "unknown" }));
    state.status = "accepted";
    preparations.delete(preparation.token);

    if (state.credit === undefined) ordinaryPrepared -= 1;
    accepted += 1;

    const offers = attachmentTokens.map((attachment) => {
      const offer = attachment.offerUnsafe(copied.success, sequence);

      if (offer.status === "dropped" && truncatedBefore === undefined) truncatedBefore = sequence;

      return offer;
    });

    return Result.succeed({
      preparation,
      record: copied.success,
      sequence,
      attachments: copyArray(offers),
    });
  };

  const cancelUnsafe = (preparation: EvidencePreparation) => {
    if (preparation.journal !== journal)
      return Result.fail(invalidEvidence("preparation", { reason: "foreign-journal" }));
    const retained = preparations.get(preparation.token);

    if (retained === undefined || retained.preparation !== preparation)
      return Result.succeed(undefined);

    if (retained.status !== "pending")
      return Result.fail(invalidEvidence("preparation", { reason: "unknown" }));
    preparations.delete(preparation.token);

    if (retained.credit === undefined) ordinaryPrepared -= 1;
    else {
      const credit = credits.get(retained.credit.actorKey);

      if (credit !== undefined && credit.preparation === preparation) {
        credit.status = "live";
        delete credit.preparation;
      }

      outcomePreparations.delete(preparation.token);
    }

    return Result.succeed(undefined);
  };

  const settleOutcome = (preparation: EvidencePreparation, terminal: boolean) => {
    if (preparation.journal !== journal)
      return Result.fail(invalidEvidence("preparation", { reason: "foreign-journal" }));
    const credit = outcomePreparations.get(preparation.token);

    if (credit === undefined) {
      // Ordinary lifecycle tests may use an unregistered actor and therefore an ordinary
      // preparation. Such preparations have no lifecycle outcome credit to settle.
      return Result.succeed(undefined);
    }

    const state = credits.get(credit.actorKey);

    if (state === undefined) return Result.succeed(undefined);
    outcomePreparations.delete(preparation.token);

    if (terminal) {
      // Keep terminal credit until the ActorCell unregisters so Journal close cannot drain
      // ahead of an admitted lifecycle outcome's remaining actor cleanup.
      state.status = "terminal";
      delete state.preparation;
    } else {
      state.status = "live";
      delete state.preparation;
    }

    wakeCreditWaiter();

    return Result.succeed(undefined);
  };

  const accept = (preparation: EvidencePreparation, record: PreparedEvidenceRecord) =>
    semaphore
      .withPermit(
        Effect.yieldNow.pipe(
          Effect.flatMap(() => Effect.sync(() => acceptUnsafe(preparation, record))),
        ),
      )
      .pipe(
        Effect.onInterrupt(() =>
          Effect.sync(() => {
            cancelUnsafe(preparation);
          }),
        ),
        Effect.flatMap((result) =>
          Result.isFailure(result) ? Effect.fail(result.failure) : Effect.succeed(result.success),
        ),
      );

  const captureDrainUnsafe = (): EvidenceDrainCapture => ({
    through: accepted === 0 ? 0 : sequenceValue(accepted),
    attachmentThrough: accepted === 0 ? sequenceValue(1) : sequenceValue(accepted),
    truncatedBefore: Option.fromNullishOr(truncatedBefore),
    attachments: copyArray(attachmentTokens),
  });

  const drainCaptured = (capture: EvidenceDrainCapture) =>
    Effect.gen(function* () {
      const results: AttachmentDrainResult[] = [];

      for (const attachment of capture.attachments)
        results.push(yield* attachment.drain(capture.attachmentThrough));

      return {
        through: capture.through,
        truncatedBefore: capture.truncatedBefore,
        attachments: copyArray(results),
      } satisfies EvidenceDrain;
    });

  const drainSemaphore = Semaphore.makeUnsafe(1);

  const drain = () =>
    drainSemaphore.withPermit(
      semaphore.withPermit(Effect.sync(captureDrainUnsafe)).pipe(Effect.flatMap(drainCaptured)),
    );

  const awaitCredits = (): Effect.Effect<void> =>
    Effect.suspend(() => {
      if (credits.size === 0) return Effect.void;

      if (creditWaiter === undefined) creditWaiter = Deferred.makeUnsafe<void>();

      return Deferred.await(creditWaiter).pipe(Effect.flatMap(awaitCredits));
    });

  const closeOnce = Effect.uninterruptible(
    Effect.gen(function* () {
      yield* semaphore.withPermit(
        Effect.sync(() => {
          for (const [token, state] of preparations) {
            if (state.credit !== undefined) continue;

            preparations.delete(token);
            ordinaryPrepared -= 1;
          }
        }),
      );

      // Wait without the commit permit: an admitted lifecycle outcome still needs to accept
      // through that permit before releasing its actor credit.
      yield* awaitCredits();

      return yield* drainSemaphore.withPermit(
        semaphore
          .withPermit(Effect.sync(captureDrainUnsafe))
          .pipe(
            Effect.flatMap((capture) =>
              drainCaptured(capture).pipe(
                Effect.tap(() =>
                  Effect.forEach(capture.attachments, (attachment) => attachment.close()),
                ),
              ),
            ),
          ),
      );
    }),
  );

  const close = () =>
    Effect.suspend(() => {
      if (closeCell !== undefined)
        return Deferred.await(closeCell).pipe(Effect.flatMap(resolveExit));
      const cell = Deferred.makeUnsafe<Exit.Exit<EvidenceDrain, PublicDiagnostic>>();
      closeCell = cell;
      closed = true;

      return Effect.uninterruptible(
        Effect.exit(closeOnce).pipe(
          Effect.flatMap((exit) => Deferred.succeed(cell, exit).pipe(Effect.as(exit))),
          Effect.flatMap(resolveExit),
        ),
      );
    });

  const journal: EvidenceJournal = {
    sequence: () => (accepted === 0 ? 0 : sequenceValue(accepted)),
    prepare: prepareUnsafe,
    registerActor,
    releaseActor,
    prepareLifecycle,
    settleOutcome,
    cancel: cancelUnsafe,
    attach: (attachment) => {
      if (closed) return Result.fail(closedEvidence());

      const owner = attachmentOwners.get(attachment);

      if (owner !== undefined)
        return Result.fail(
          invalidEvidence("attachment", {
            reason: owner === journal ? "duplicate" : "foreign-journal",
          }),
        );

      attachmentOwners.set(attachment, journal);
      attachmentTokens.push(attachment);

      return Result.succeed(undefined);
    },
    attachmentTokens: () => copyArray(attachmentTokens),
    acceptSync: acceptUnsafe,
    accept,
    drain,
    close,
  };

  return journal;
};

const resolveExit = <Value>(exit: Exit.Exit<Value, PublicDiagnostic>) =>
  Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(exit.cause);

/** Builds a turn fact; the Journal adds its global sequence during acceptance. */
// RETURN_TYPE: The public constructor preserves its typed record failure channel.
export const makeTurnRecord = <A extends App, DefinitionValue extends MachineDefinition>(
  fact: TurnFact<A, DefinitionValue>,
  _preparation: EvidencePreparation,
): Result.Result<Omit<TurnRecord<A, DefinitionValue>, "sequence">, PublicDiagnostic> => {
  if (!Number.isSafeInteger(fact.timestamp) || fact.timestamp < 0) {
    return Result.fail(invalidEvidence("timestamp", { reason: "invalid" }));
  }

  return Result.succeed({ ...fact, _tag: "turn" });
};

/** Builds a lifecycle fact; the Journal adds its global sequence during acceptance. */
// RETURN_TYPE: The public constructor preserves its typed record failure channel.
export const makeLifecycleRecord = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  fact: LifecycleFact<DefinitionValue, CleanupError, ProviderDefinition>,
  _preparation: EvidencePreparation,
): Result.Result<
  LifecycleFact<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic
> => {
  if (!Number.isSafeInteger(fact.timestamp) || fact.timestamp < 0) {
    return Result.fail(invalidEvidence("timestamp", { reason: "invalid" }));
  }

  return Result.succeed(fact);
};

/** Cancels a Journal preparation when a later stage fails before acceptance. */
export const cancelPreparedEvidence = (
  service: RuntimeEvidenceService,
  preparation: EvidencePreparation,
) => service.cancel(preparation);

/** Reads lifecycle evidence inputs before the actor mutates its attachment. */
export const prepareLifecycleEvidenceAdmission = (
  service: RuntimeEvidenceService,
  timestamp: number,
  actorKey?: string,
): Result.Result<{ preparation: EvidencePreparation; timestamp: number }, PublicDiagnostic> => {
  let preparation = actorKey === undefined ? service.prepare() : service.prepareLifecycle(actorKey);

  if (
    Result.isFailure(preparation) &&
    preparation.failure.details.reason === "actor-not-registered"
  ) {
    preparation = service.prepare();
  }

  if (Result.isFailure(preparation)) return Result.fail(preparation.failure);

  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    service.cancel(preparation.success);

    return Result.fail(invalidEvidence("timestamp", { reason: "invalid" }));
  }

  return Result.succeed({ preparation: preparation.success, timestamp });
};

/** Builds lifecycle evidence without assigning a Journal sequence. */
export const makeLifecycleEvidence = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  service: RuntimeEvidenceService,
  fact: LifecycleFact<DefinitionValue, CleanupError, ProviderDefinition>,
  preparation?: EvidencePreparation,
) => {
  const prepared =
    preparation === undefined
      ? service.prepare()
      : preparation.journal === service.journal
        ? Result.succeed(preparation)
        : Result.fail(invalidEvidence("preparation", { reason: "foreign-journal" }));

  if (Result.isFailure(prepared)) return Result.fail(prepared.failure);

  const record = makeLifecycleRecord(fact, prepared.success);

  if (Result.isFailure(record)) {
    const cancelled = service.cancel(prepared.success);

    return Result.isFailure(cancelled)
      ? Result.fail(cancelled.failure)
      : Result.fail(record.failure);
  }

  return Result.succeed({ preparation: prepared.success, record: record.success });
};

type RuntimeEvidenceOwner = {
  journal: EvidenceJournal;
  service: RuntimeEvidenceService;
  preparePublication: <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
    fence: ActorFence,
    before: ActorSnapshot<DefinitionValue>,
    publication: ActorPublication<DefinitionValue>,
  ) => Result.Result<PreparedActorEvidence<DefinitionValue>, PublicDiagnostic>;
  acceptPublication: <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
    fence: ActorFence,
    before: ActorSnapshot<DefinitionValue>,
    publication: ActorPublication<DefinitionValue>,
  ) => Result.Result<number, PublicDiagnostic>;
  close: () => Effect.Effect<EvidenceDrain, PublicDiagnostic>;
};

type PreparedActorEvidenceData<DefinitionValue extends MachineDefinition> = {
  preparation: EvidencePreparation;
  timestamp: number;
  fence: ActorFence;
  provenance: RuntimeProvenance<App, DefinitionValue>;
  cause: TurnCause<DefinitionValue>;
  before: ActorSnapshot<DefinitionValue>;
  publicationRevision: number;
  machineTurnRevision: number;
};

const sameActorFence = (left: ActorFence, right: ActorFence) =>
  left.key === right.key &&
  left.incarnation === right.incarnation &&
  left.generation === right.generation &&
  left.leaseEpoch === right.leaseEpoch;

/** Creates the single runtime evidence capability used by actors and lifecycle. */
// RETURN_TYPE: The public owner exposes one stable Journal/service/close contract.
export const makeRuntimeEvidenceOwner = (options: {
  app: App;
  plan: RuntimePlan;
  clock: Clock.Clock;
}): RuntimeEvidenceOwner => {
  const journal = makeEvidenceJournal({ app: options.app, plan: options.plan });
  let closed = false;

  const timestamp = () => {
    return Result.try({
      try: () => options.clock.currentTimeMillisUnsafe(),
      catch: () => invalidEvidence("timestamp", { reason: "read-failed" }),
    });
  };

  const cancelPreparation = (preparation: EvidencePreparation) => {
    return journal.cancel(preparation);
  };

  const failPrepared = (preparation: EvidencePreparation, failure: PublicDiagnostic) => {
    const cancelled = cancelPreparation(preparation);

    return Result.isFailure(cancelled) ? Effect.fail(cancelled.failure) : Effect.fail(failure);
  };

  const cancelAndPreserveFailure = (
    preparation: EvidencePreparation,
    cause: Cause.Cause<PublicDiagnostic>,
  ) => {
    const cancelled = cancelPreparation(preparation);

    return Result.isFailure(cancelled) ? Effect.fail(cancelled.failure) : Effect.failCause(cause);
  };

  const prepareEvidence = () => {
    return journal.prepare();
  };

  const preparePublication = <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
    fence: ActorFence,
    before: ActorSnapshot<DefinitionValue>,
    publication: ActorPublication<DefinitionValue>,
  ) => {
    if (closed) return Result.fail(closedEvidence());
    const preparation = prepareEvidence();

    if (Result.isFailure(preparation)) return Result.fail(preparation.failure);

    const timestampResult = timestamp();

    if (Result.isFailure(timestampResult)) {
      cancelPreparation(preparation.success);

      return Result.fail(timestampResult.failure);
    }

    if (!Number.isSafeInteger(timestampResult.success) || timestampResult.success < 0) {
      cancelPreparation(preparation.success);

      return Result.fail(invalidEvidence("timestamp", { reason: "invalid" }));
    }

    if (
      identity.key !== fence.key ||
      identity.incarnation !== fence.incarnation ||
      identity.leaseEpoch !== fence.leaseEpoch ||
      !sameActorFence(publication.fence, fence)
    ) {
      cancelPreparation(preparation.success);

      return Result.fail(invalidEvidence("provenance", { reason: "actor-mismatch" }));
    }

    const preflight = makeTurnRecord(
      {
        fence,
        provenance: {
          app: options.app,
          plan: options.plan,
          actor: {
            key: identity.key,
            incarnation: identity.incarnation,
            leaseEpoch: identity.leaseEpoch,
          },
        },
        cause: publication.cause,
        before,
        after: publication.snapshot,
        store: publication.store,
        publicationRevision: publication.publicationRevision,
        machineTurnRevision: publication.machineTurnRevision,
        timestamp: timestampResult.success,
      },
      preparation.success,
    );

    if (Result.isFailure(preflight)) {
      cancelPreparation(preparation.success);

      return Result.fail(preflight.failure);
    }

    const preparedEvidence: PreparedActorEvidenceData<DefinitionValue> = {
      preparation: preparation.success,
      timestamp: timestampResult.success,
      fence,
      provenance: {
        app: options.app,
        plan: options.plan,
        actor: {
          key: identity.key,
          incarnation: identity.incarnation,
          leaseEpoch: identity.leaseEpoch,
        },
      },
      cause: publication.cause,
      before,
      publicationRevision: publication.publicationRevision,
      machineTurnRevision: publication.machineTurnRevision,
    };

    const finalize = (completed: ActorPublication<DefinitionValue>) => {
      const record = {
        _tag: "turn" as const,
        fence: preparedEvidence.fence,
        provenance: preparedEvidence.provenance,
        cause: preparedEvidence.cause,
        before: preparedEvidence.before,
        after: completed.snapshot,
        store: completed.store,
        publicationRevision: preparedEvidence.publicationRevision,
        machineTurnRevision: preparedEvidence.machineTurnRevision,
        timestamp: preparedEvidence.timestamp,
      };

      const accepted = journal.acceptSync(preparedEvidence.preparation, record);

      if (Result.isFailure(accepted)) throw new Error(accepted.failure.summary);

      return accepted.success.sequence;
    };

    return Result.succeed({
      finalize,
      cancel: () => cancelPreparation(preparation.success),
    } satisfies PreparedActorEvidence<DefinitionValue>);
  };

  const accept = <
    DefinitionValue extends MachineDefinition,
    CleanupError,
    ProviderDefinition extends MachineDefinition = DefinitionValue,
  >(
    record: Omit<
      RuntimeLifecycleEvidence<DefinitionValue, CleanupError, ProviderDefinition>,
      "evidenceSequence"
    >,
    preparation: EvidencePreparation,
  ) => {
    if (!Number.isSafeInteger(record.timestamp) || record.timestamp < 0)
      return failPrepared(preparation, invalidEvidence("timestamp", { reason: "invalid" }));

    if (
      record.provenance.app !== options.app ||
      record.provenance.plan !== options.plan ||
      record.provenance.actor.key !== record.after.fence.key ||
      record.provenance.actor.incarnation !== record.after.fence.incarnation ||
      record.provenance.actor.leaseEpoch !== record.after.fence.leaseEpoch
    )
      return failPrepared(
        preparation,
        invalidEvidence("provenance", { reason: "lifecycle-mismatch" }),
      );

    return Effect.exit(journal.accept(preparation, { ...record })).pipe(
      Effect.flatMap((exit) => {
        if (Exit.isSuccess(exit)) {
          return Effect.succeed(undefined);
        }

        return cancelAndPreserveFailure(preparation, exit.cause);
      }),
    );
  };

  const service: RuntimeEvidenceService = {
    journal,
    prepare: prepareEvidence,
    prepareLifecycle: (actorKey) => journal.prepareLifecycle(actorKey),
    cancel: cancelPreparation,
    settleOutcome: (preparation, terminal) => journal.settleOutcome(preparation, terminal),
    provenance: { app: options.app, plan: options.plan },
    accept,
    drain: journal.drain().pipe(Effect.asVoid),
  };

  const acceptPublication = <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
    fence: ActorFence,
    before: ActorSnapshot<DefinitionValue>,
    publication: ActorPublication<DefinitionValue>,
  ) => {
    if (closed) return Result.fail(closedEvidence());

    if (
      identity.key !== fence.key ||
      identity.incarnation !== fence.incarnation ||
      identity.leaseEpoch !== fence.leaseEpoch ||
      !sameActorFence(publication.fence, fence)
    )
      return Result.fail(invalidEvidence("provenance", { reason: "actor-mismatch" }));
    const preparation = prepareEvidence();

    if (Result.isFailure(preparation)) return Result.fail(preparation.failure);

    const timestampResult = timestamp();

    if (Result.isFailure(timestampResult)) {
      cancelPreparation(preparation.success);

      return Result.fail(timestampResult.failure);
    }

    const record = makeTurnRecord(
      {
        fence,
        provenance: {
          app: options.app,
          plan: options.plan,
          actor: {
            key: identity.key,
            incarnation: identity.incarnation,
            leaseEpoch: identity.leaseEpoch,
          },
        },
        cause: publication.cause,
        before,
        after: publication.snapshot,
        store: publication.store,
        publicationRevision: publication.publicationRevision,
        machineTurnRevision: publication.machineTurnRevision,
        timestamp: timestampResult.success,
      },
      preparation.success,
    );

    if (Result.isFailure(record)) {
      const cancelled = cancelPreparation(preparation.success);

      return Result.isFailure(cancelled)
        ? Result.fail(cancelled.failure)
        : Result.fail(record.failure);
    }

    const acceptedRecord = journal.acceptSync(preparation.success, record.success);

    if (Result.isFailure(acceptedRecord)) {
      cancelPreparation(preparation.success);

      return Result.fail(acceptedRecord.failure);
    }

    return Result.succeed(acceptedRecord.success.sequence);
  };

  const close = () =>
    Effect.suspend(() => {
      closed = true;

      return journal.close();
    });

  return {
    journal,
    service,
    preparePublication,
    acceptPublication,
    close,
  };
};
