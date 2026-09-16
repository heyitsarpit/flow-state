// oxlint-disable-next-line anti-slop/no-large-production-file -- evidence sequencing, sink isolation, and runtime publication form one owner boundary.
import { Cause, Clock, Deferred, Effect, Exit, Option, Queue, Result, Semaphore } from "effect";

import { appPlan, type App } from "../app/app.js";
import {
  Defect,
  Diagnostic,
  Failure,
  Interrupt,
  type PublicDiagnostic,
} from "../diagnostic/diagnostic.js";
import type { MachineDefinition } from "../machine/grammar.js";
import type { ActorFence, ActorIdentity } from "./actor-admission.js";
import type { ActorPublication, ActorSnapshot, ActorStoreResult } from "./actor-engine.js";
import type { LifecycleSnapshot } from "./lifecycle.js";
import type { RuntimeEvidenceService, RuntimeLifecycleEvidence } from "./runtime-services.js";
import type { TurnCause } from "./turn-plan.js";

declare const evidenceSequenceBrand: unique symbol;

declare const sinkIdBrand: unique symbol;

/** Runtime-global evidence order is allocated only by an EvidenceHub. */
export type EvidenceSequence = number & { [evidenceSequenceBrand]: void };

/** Sink identity is local to one EvidenceHub. */
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

/** A committed actor/store cut before hub sequencing. */
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
      evidenceSequence: number;
      provenance: EvidenceProvenance;
    };

export type EvidenceReservation = {
  hub: EvidenceHub;
  sequence: EvidenceSequence;
};

export type SinkOfferResult = {
  sink: SinkId;
  sequence: EvidenceSequence;
  status: "accepted" | "dropped" | "detached";
};

export type SinkDrainResult = {
  sink: SinkId;
  through: EvidenceSequence;
  status: "drained" | "truncated" | "failed";
};

export type EvidenceAcceptance = {
  reservation: EvidenceReservation;
  record: EvidenceRecord;
  sequence: EvidenceSequence;
  sinks: SinkOfferResult[];
};

const preparedActorPublication = Symbol("prepared-actor-publication");

type EvidenceReference = Exclude<WeakKey, symbol>;

const preparedPublicationFinalizers = new WeakMap<
  EvidenceReference,
  (publication: unknown) => number
>();

const preparedPublicationCancellers = new WeakMap<
  EvidenceReference,
  () => Result.Result<void, PublicDiagnostic>
>();

const projectedPublicationSnapshots = new WeakMap<ActorPublication<MachineDefinition>, unknown>();

/** Marks an actor publication whose evidence is prepared before store commit. */
export const prepareActorPublication = <DefinitionValue extends MachineDefinition>(
  publication: ActorPublication<DefinitionValue>,
) => {
  Object.defineProperty(publication, preparedActorPublication, { value: true });

  return publication;
};

const isPreparedActorPublication = (publication: EvidenceReference) =>
  preparedActorPublication in publication;

/** Completes prepared evidence after the matching store result is available. */
export const finalizePreparedActorPublication = <DefinitionValue extends MachineDefinition>(
  prepared: ActorPublication<DefinitionValue>,
  publication: ActorPublication<DefinitionValue>,
) => {
  const finalize = preparedPublicationFinalizers.get(prepared);

  if (finalize === undefined) return undefined;
  preparedPublicationFinalizers.delete(prepared);
  preparedPublicationCancellers.delete(prepared);

  return finalize(publication);
};

/** Cancels prepared evidence when store commit is rejected before mutation. */
export const cancelPreparedActorPublication = <DefinitionValue extends MachineDefinition>(
  prepared: ActorPublication<DefinitionValue>,
) => {
  const cancel = preparedPublicationCancellers.get(prepared);

  if (cancel === undefined) return Result.succeed(undefined);
  preparedPublicationCancellers.delete(prepared);

  return cancel();
};

export type EvidenceDrain = {
  through: EvidenceSequence | 0;
  truncatedBefore: Option.Option<EvidenceSequence>;
  sinks: SinkDrainResult[];
};

type EvidenceSinkInternals = {
  offerUnsafe: (record: EvidenceRecord, sequence: EvidenceSequence) => SinkOfferResult;
  drain: (through: EvidenceSequence) => Effect.Effect<SinkDrainResult, PublicDiagnostic>;
  close: Effect.Effect<void>;
  truncatedBefore: () => EvidenceSequence | undefined;
};

export type EvidenceSink = {
  id: SinkId;
  capacity: number;
  mailbox: Queue.Queue<EvidenceRecord>;
  offer: (record: EvidenceRecord) => Effect.Effect<SinkOfferResult, PublicDiagnostic>;
  drain: (through: EvidenceSequence) => Effect.Effect<SinkDrainResult, PublicDiagnostic>;
  close: () => Effect.Effect<void, PublicDiagnostic>;
};

const sinkInternals = new WeakMap<EvidenceSink, EvidenceSinkInternals>();

const serviceCancellers = new WeakMap<
  EvidenceReference,
  (sequence: number) => Result.Result<void, PublicDiagnostic>
>();

const hubCancellers = new WeakMap<
  EvidenceReference,
  (sequence: number) => Result.Result<void, PublicDiagnostic>
>();

const serviceReservationOwners = new WeakMap<
  EvidenceReference,
  () => Result.Result<EvidenceReservation, PublicDiagnostic>
>();

const hubReservationOwners = new WeakMap<
  EvidenceReference,
  () => Result.Result<EvidenceReservation, PublicDiagnostic>
>();

const invalidEvidence = (
  reason: string,
  details: Record<string, string | number | boolean | null>,
) =>
  Failure({
    code: "InvalidTraceRecord",
    path: ["evidence", reason],
    details,
    summary: "Evidence record is not valid for this runtime.",
    help: "Use a record created from this runtime's admitted app, plan, and reservation.",
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

const sequenceOf = (record: EvidenceRecord) =>
  record._tag === "turn" ? record.sequence : record.evidenceSequence;

const copyArray = <Value>(values: Iterable<Value>) => [...values];

const sequenceValue = (value: number) => {
  // SAFETY: callers validate positive safe integer bounds before branding a sequence.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the hub owns this numeric brand.
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

const diagnosticFromCause = (cause: Cause.Cause<PublicDiagnostic>) => {
  const defect = cause.reasons.find(Cause.isDieReason);

  if (defect !== undefined) return Defect(defect.defect);
  const failure = cause.reasons.find(Cause.isFailReason);

  if (failure !== undefined)
    return failure.error instanceof Diagnostic ? failure.error : Defect(failure.error);

  return Interrupt();
};

const makeSinkFailure = (cause: Cause.Cause<PublicDiagnostic>) => diagnosticFromCause(cause);

/** Makes one bounded sink. Offers only enqueue; delivery runs during drain. */
// RETURN_TYPE: The public sink factory keeps its typed construction failure channel explicit.
export const makeEvidenceSink = (
  options: {
    id?: string;
    capacity?: number;
    deliver?: (record: EvidenceRecord) => Effect.Effect<void, PublicDiagnostic>;
  } = {},
): Effect.Effect<EvidenceSink, PublicDiagnostic> =>
  Effect.gen(function* () {
    const capacity = options.capacity ?? 64;

    if (!Number.isSafeInteger(capacity) || capacity < 1)
      return yield* Effect.fail(
        Failure({
          code: "BoundExceeded",
          path: ["evidence", "sink", "capacity"],
          details: { capacity },
          summary: "Evidence sink capacity must be positive.",
          help: "Choose a finite positive sink capacity.",
        }),
      );

    const mailbox = yield* Queue.bounded<EvidenceRecord>(capacity);
    const sinkName = options.id ?? `sink-${crypto.randomUUID()}`;
    // SAFETY: sinkName is either a caller label or a runtime-generated local identity.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SinkId is a private nominal label.
    const sinkId = sinkName as SinkId;
    const semaphore = Semaphore.makeUnsafe(1);
    let closed = false;
    let failure: PublicDiagnostic | undefined;
    let truncatedBefore: EvidenceSequence | undefined;
    const deliver = options.deliver ?? (() => Effect.void);

    // RETURN_TYPE: Sink status literals must remain narrow for the bounded offer contract.
    const offerUnsafe = (record: EvidenceRecord, sequence: EvidenceSequence): SinkOfferResult => {
      if (closed || failure !== undefined) return { sink: sinkId, sequence, status: "detached" };

      if (Queue.offerUnsafe(mailbox, record)) return { sink: sinkId, sequence, status: "accepted" };

      if (truncatedBefore === undefined) truncatedBefore = sequence;

      return { sink: sinkId, sequence, status: "dropped" };
    };

    const drain = (through: EvidenceSequence) =>
      semaphore.withPermit(
        Effect.gen(function* () {
          if (failure !== undefined)
            return {
              sink: sinkId,
              through,
              status: "failed",
            } satisfies SinkDrainResult;

          while (Queue.sizeUnsafe(mailbox) > 0) {
            const record = yield* Queue.take(mailbox);
            const delivered = yield* Effect.exit(deliver(record));

            if (Exit.isFailure(delivered)) {
              failure = makeSinkFailure(delivered.cause);

              while (Queue.sizeUnsafe(mailbox) > 0) Queue.takeUnsafe(mailbox);

              return {
                sink: sinkId,
                through,
                status: "failed",
              } satisfies SinkDrainResult;
            }
          }

          return {
            sink: sinkId,
            through,
            status: truncatedBefore === undefined ? "drained" : "truncated",
          } satisfies SinkDrainResult;
        }),
      );

    const close = semaphore.withPermit(
      Effect.gen(function* () {
        if (closed) return;
        closed = true;
        yield* Queue.shutdown(mailbox);
      }),
    );

    const sink: EvidenceSink = {
      id: sinkId,
      capacity,
      mailbox,
      offer: (record) => {
        const sequence = sequenceOf(record);

        return Effect.sync(() => offerUnsafe(record, sequenceValue(sequence)));
      },
      drain: (through) => drain(through),
      close: () => close,
    };

    sinkInternals.set(sink, {
      offerUnsafe,
      drain,
      close,
      truncatedBefore: () => truncatedBefore,
    });

    return sink;
  });

export type EvidenceHub = {
  sequence: () => EvidenceSequence | 0;
  reserve: () => Result.Result<EvidenceReservation, PublicDiagnostic>;
  cancel: (reservation: EvidenceReservation) => Result.Result<void, PublicDiagnostic>;
  attach: (sink: EvidenceSink) => Result.Result<void, PublicDiagnostic>;
  /** Synchronous actor publication uses the same prefix transition as async acceptance. */
  acceptSync: (
    reservation: EvidenceReservation,
    record: EvidenceRecord,
  ) => Result.Result<EvidenceAcceptance, PublicDiagnostic>;
  /** Consumes a fully prepared actor record after its store cut commits. */
  acceptPreparedSync: (
    reservation: EvidenceReservation,
    record: EvidenceRecord,
  ) => EvidenceAcceptance;
  accept: (
    reservation: EvidenceReservation,
    record: EvidenceRecord,
  ) => Effect.Effect<EvidenceAcceptance, PublicDiagnostic>;
  drain: () => Effect.Effect<EvidenceDrain, PublicDiagnostic>;
  close: () => Effect.Effect<EvidenceDrain, PublicDiagnostic>;
};

type AcceptAttempt =
  | { _tag: "wait"; waiter: Deferred.Deferred<void, PublicDiagnostic> }
  | { _tag: "done"; acceptance: EvidenceAcceptance };

type ReservationState = {
  reservation: EvidenceReservation;
  status: "pending" | "accepted" | "tombstoned";
};

/** Owns sequence allocation, prefix ordering, sink isolation, and close drain. */
// RETURN_TYPE: The public hub factory preserves the recursive reservation and sink contract.
export const makeEvidenceHub = (options: { app: App; plan: RuntimePlan }): EvidenceHub => {
  const semaphore = Semaphore.makeUnsafe(1);
  const sinks: EvidenceSink[] = [];
  const reservations = new Map<number, ReservationState>();
  const waiters = new Map<number, Deferred.Deferred<void, PublicDiagnostic>>();
  let allocated = 0;
  let accepted = 0;
  let closed = false;
  let truncatedBefore: EvidenceSequence | undefined;
  let closeCell: Deferred.Deferred<Exit.Exit<EvidenceDrain, PublicDiagnostic>> | undefined;

  // RETURN_TYPE: This callback closes over the hub identity used by each reservation.
  const reserveUnsafe = (): Result.Result<EvidenceReservation, PublicDiagnostic> => {
    if (closed) return Result.fail(closedEvidence());

    if (allocated >= Number.MAX_SAFE_INTEGER) return Result.fail(counterOverflow("sequence"));
    allocated += 1;

    const reservation = {
      hub,
      sequence: sequenceValue(allocated),
    } satisfies EvidenceReservation;

    reservations.set(allocated, { reservation, status: "pending" });

    return Result.succeed(reservation);
  };

  const advancePrefix = () => {
    for (;;) {
      const next = reservations.get(accepted + 1);

      if (next === undefined || next.status === "pending") break;
      accepted += 1;
      reservations.delete(accepted);
    }

    for (const [sequence, waiter] of waiters) {
      if (sequence > accepted + 1) continue;
      waiters.delete(sequence);
      Deferred.doneUnsafe(waiter, Effect.succeed(undefined));
    }
  };

  const validateReservation = (reservation: EvidenceReservation, record: EvidenceRecord) => {
    if (closed) return Result.fail(closedEvidence());

    if (reservation.hub !== hub)
      return Result.fail(invalidEvidence("reservation", { reason: "foreign-hub" }));
    const sequence = sequenceOf(record);

    if (!Number.isSafeInteger(sequence) || sequence < 1)
      return Result.fail(invalidEvidence("sequence", { reason: "missing-or-invalid" }));

    if (sequence !== reservation.sequence)
      return Result.fail(invalidEvidence("sequence", { reason: "reservation-mismatch", sequence }));
    const retained = reservations.get(sequence);

    if (
      retained === undefined ||
      retained.reservation !== reservation ||
      retained.status !== "pending"
    )
      return Result.fail(invalidEvidence("reservation", { reason: "unknown" }));

    if (record.provenance.app !== options.app || record.provenance.plan !== options.plan)
      return Result.fail(invalidEvidence("provenance", { reason: "foreign-runtime" }));

    return Result.succeed(sequence);
  };

  const validate = (reservation: EvidenceReservation, record: EvidenceRecord) => {
    const validated = validateReservation(reservation, record);

    if (Result.isFailure(validated)) return Result.fail(validated.failure);

    if (validated.success !== accepted + 1)
      return Result.fail(
        invalidEvidence("prefix", { reason: "out-of-order", sequence: validated.success }),
      );

    return validated;
  };

  const acceptUnsafe = (reservation: EvidenceReservation, record: EvidenceRecord) => {
    const validation = validate(reservation, record);

    if (Result.isFailure(validation)) return Result.fail(validation.failure);
    const sequence = sequenceValue(validation.success);

    const copied = Result.try({
      try: () => copyRecord(record),
      catch: () => invalidEvidence("record", { reason: "copy-failed" }),
    });

    if (Result.isFailure(copied)) {
      cancelUnsafe(reservation);

      return Result.fail(copied.failure);
    }

    const state = reservations.get(validation.success);

    if (state === undefined)
      return Result.fail(invalidEvidence("reservation", { reason: "unknown" }));
    state.status = "accepted";
    advancePrefix();

    const offers = sinks.map((sink) => {
      const internal = sinkInternals.get(sink);

      if (internal === undefined)
        return {
          sink: sink.id,
          sequence,
          status: "detached",
        } satisfies SinkOfferResult;
      const offer = internal.offerUnsafe(copied.success, sequence);

      if (offer.status === "dropped" && truncatedBefore === undefined) truncatedBefore = sequence;

      return offer;
    });

    return Result.succeed({
      reservation,
      record: copied.success,
      sequence,
      sinks: copyArray(offers),
    });
  };

  const acceptPreparedUnsafe = (reservation: EvidenceReservation, record: EvidenceRecord) => {
    const sequence = reservation.sequence;
    const state = reservations.get(sequence);

    if (
      state === undefined ||
      state.reservation !== reservation ||
      state.status !== "pending" ||
      sequence !== accepted + 1
    )
      throw new Error("Prepared actor evidence was consumed outside its validated prefix");
    state.status = "accepted";
    advancePrefix();

    const offers = sinks.map((sink) => {
      const internal = sinkInternals.get(sink);

      if (internal === undefined)
        return {
          sink: sink.id,
          sequence,
          status: "detached",
        } satisfies SinkOfferResult;
      const offer = internal.offerUnsafe(record, sequence);

      if (offer.status === "dropped" && truncatedBefore === undefined) truncatedBefore = sequence;

      return offer;
    });

    return {
      reservation,
      record,
      sequence,
      sinks: copyArray(offers),
    };
  };

  const cancelUnsafe = (reservation: EvidenceReservation) => {
    if (reservation.hub !== hub)
      return Result.fail(invalidEvidence("reservation", { reason: "foreign-hub" }));
    const sequence = reservation.sequence;
    const retained = reservations.get(sequence);

    if (
      retained === undefined ||
      retained.reservation !== reservation ||
      retained.status !== "pending"
    )
      return Result.fail(invalidEvidence("reservation", { reason: "unknown" }));
    retained.status = "tombstoned";
    advancePrefix();

    return Result.succeed(undefined);
  };

  const attempt = (reservation: EvidenceReservation, record: EvidenceRecord) => {
    const validated = validateReservation(reservation, record);

    if (Result.isFailure(validated)) return Result.fail(validated.failure);
    const sequence = validated.success;

    if (sequence === accepted + 1) {
      const acceptedRecord = acceptUnsafe(reservation, record);

      return Result.isFailure(acceptedRecord)
        ? acceptedRecord
        : ({ _tag: "done", acceptance: acceptedRecord.success } satisfies AcceptAttempt);
    }

    if (sequence > accepted + 1) {
      let waiter = waiters.get(accepted + 1);

      if (waiter === undefined) {
        const created = Deferred.makeUnsafe<void, PublicDiagnostic>();
        waiters.set(accepted + 1, created);
        waiter = created;
      }

      return { _tag: "wait", waiter } satisfies AcceptAttempt;
    }

    return acceptUnsafe(reservation, record);
  };

  const accept = (reservation: EvidenceReservation, record: EvidenceRecord) =>
    Effect.gen(function* () {
      for (;;) {
        const attempted = yield* semaphore.withPermit(
          Effect.sync(() => attempt(reservation, record)),
        );

        if ("_tag" in attempted && attempted._tag === "wait") {
          yield* Deferred.await(attempted.waiter);
          continue;
        }

        if ("_tag" in attempted && attempted._tag === "done") return attempted.acceptance;

        if (Result.isFailure(attempted)) return yield* Effect.fail(attempted.failure);

        return attempted.success;
      }
    });

  const drainUnsafe = () =>
    Effect.gen(function* () {
      const through = accepted === 0 ? 0 : sequenceValue(accepted);

      const sinkThrough: EvidenceSequence =
        accepted === 0 ? sequenceValue(1) : sequenceValue(accepted);

      const results: SinkDrainResult[] = [];

      for (const sink of sinks) {
        const internal = sinkInternals.get(sink);

        if (internal === undefined) {
          results.push({ sink: sink.id, through: sinkThrough, status: "failed" });
          continue;
        }

        results.push(yield* internal.drain(sinkThrough));
      }

      return {
        through,
        truncatedBefore: Option.fromNullishOr(truncatedBefore),
        sinks: copyArray(results),
      } satisfies EvidenceDrain;
    });

  const drain = () => semaphore.withPermit(drainUnsafe());

  const closeOnce = Effect.uninterruptible(
    Effect.gen(function* () {
      closed = true;

      for (const state of reservations.values())
        if (state.status === "pending") state.status = "tombstoned";
      advancePrefix();

      for (const waiter of waiters.values())
        Deferred.doneUnsafe(waiter, Effect.fail(closedEvidence()));
      waiters.clear();
      const drained = yield* drainUnsafe();

      for (const sink of sinks) {
        const internal = sinkInternals.get(sink);

        if (internal !== undefined) yield* internal.close;
      }

      return drained;
    }),
  );

  const close = () =>
    Effect.suspend(() => {
      if (closeCell !== undefined)
        return Deferred.await(closeCell).pipe(Effect.flatMap(resolveExit));
      const cell = Deferred.makeUnsafe<Exit.Exit<EvidenceDrain, PublicDiagnostic>>();
      closeCell = cell;

      return Effect.uninterruptible(
        Effect.exit(semaphore.withPermit(closeOnce)).pipe(
          Effect.flatMap((exit) => Deferred.succeed(cell, exit).pipe(Effect.as(exit))),
          Effect.flatMap(resolveExit),
        ),
      );
    });

  const hub: EvidenceHub = {
    sequence: () => (accepted === 0 ? 0 : sequenceValue(accepted)),
    reserve: reserveUnsafe,
    cancel: cancelUnsafe,
    attach: (sink) => {
      if (closed) return Result.fail(closedEvidence());

      if (!sinkInternals.has(sink))
        return Result.fail(invalidEvidence("sink", { reason: "foreign-sink" }));
      sinks.push(sink);

      return Result.succeed(undefined);
    },
    acceptSync: (reservation, record) => {
      const attempted = attempt(reservation, record);

      if ("_tag" in attempted && attempted._tag === "wait")
        return Result.fail(
          invalidEvidence("prefix", { reason: "out-of-order", sequence: reservation.sequence }),
        );

      if ("_tag" in attempted && attempted._tag === "done")
        return Result.succeed(attempted.acceptance);

      if (Result.isFailure(attempted)) return Result.fail(attempted.failure);

      return attempted;
    },
    acceptPreparedSync: acceptPreparedUnsafe,
    accept,
    drain,
    close,
  };

  hubCancellers.set(hub, (sequence) => {
    const reservation = reservations.get(sequence)?.reservation;

    return reservation === undefined ? Result.succeed(undefined) : cancelUnsafe(reservation);
  });

  return hub;
};

const resolveExit = <Value>(exit: Exit.Exit<Value, PublicDiagnostic>) =>
  Exit.isSuccess(exit) ? Effect.succeed(exit.value) : Effect.failCause(exit.cause);

/** Builds a turn record from an actor publication and a hub reservation. */
// RETURN_TYPE: The public constructor preserves its typed record failure channel.
export const makeTurnRecord = <A extends App, DefinitionValue extends MachineDefinition>(
  fact: TurnFact<A, DefinitionValue>,
  reservation: EvidenceReservation,
): Result.Result<TurnRecord<A, DefinitionValue>, PublicDiagnostic> => {
  if (!Number.isSafeInteger(fact.timestamp) || fact.timestamp < 0) {
    return Result.fail(invalidEvidence("timestamp", { reason: "invalid" }));
  }

  if (!Number.isSafeInteger(reservation.sequence) || reservation.sequence < 1) {
    return Result.fail(invalidEvidence("sequence", { reason: "invalid" }));
  }

  return Result.succeed({ ...fact, _tag: "turn", sequence: reservation.sequence });
};

/** Builds lifecycle evidence with the reservation-owned global sequence. */
// RETURN_TYPE: The public constructor preserves its typed record failure channel.
export const makeLifecycleRecord = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  fact: LifecycleFact<DefinitionValue, CleanupError, ProviderDefinition>,
  reservation: EvidenceReservation,
): Result.Result<
  LifecycleRecord<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic
> => {
  if (!Number.isSafeInteger(fact.timestamp) || fact.timestamp < 0) {
    return Result.fail(invalidEvidence("timestamp", { reason: "invalid" }));
  }

  if (!Number.isSafeInteger(reservation.sequence) || reservation.sequence < 1) {
    return Result.fail(invalidEvidence("sequence", { reason: "invalid" }));
  }

  return Result.succeed({ ...fact, evidenceSequence: reservation.sequence });
};

/** Accepts a record through the hub's reservation and prefix barrier. */
export const acceptEvidence = (
  hub: EvidenceHub,
  reservation: EvidenceReservation,
  record: EvidenceRecord,
) => hub.accept(reservation, record);

export const drainAcceptedEvidence = (hub: EvidenceHub) => hub.drain();

export const closeEvidence = (hub: EvidenceHub) => hub.close();

/** Cancels a runtime-owned reservation when a later preparation stage fails. */
export const cancelRuntimeEvidence = (service: RuntimeEvidenceService, sequence: number) => {
  const cancel = serviceCancellers.get(service);

  if (cancel !== undefined) return cancel(sequence);

  if (isReference(service.hub)) {
    const cancelHub = hubCancellers.get(service.hub);

    if (cancelHub !== undefined) return cancelHub(sequence);
  }

  return Result.succeed(undefined);
};

const reservationOwnerForService = (service: RuntimeEvidenceService) => {
  const direct = serviceReservationOwners.get(service);

  if (direct !== undefined) return direct;

  if (!isReference(service.hub)) return undefined;

  return hubReservationOwners.get(service.hub);
};

const reserveRuntimeEvidence = (service: RuntimeEvidenceService) => {
  const reserve = reservationOwnerForService(service);

  if (reserve === undefined)
    return Result.fail(invalidEvidence("reservation", { reason: "owner-unavailable" }));

  return reserve();
};

/** Reserves one lifecycle evidence sequence before its owner begins cleanup. */
export const reserveLifecycleEvidence = (service: RuntimeEvidenceService) =>
  reserveRuntimeEvidence(service);

/** Reads and validates lifecycle evidence inputs before the actor mutates its attachment. */
export const preflightLifecycleEvidence = (service: RuntimeEvidenceService, timestamp: number) => {
  const reservation = reserveLifecycleEvidence(service);

  if (Result.isFailure(reservation)) return Result.fail(reservation.failure);

  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    cancelRuntimeEvidence(service, reservation.success.sequence);

    return Result.fail(invalidEvidence("timestamp", { reason: "invalid" }));
  }

  return Result.succeed({ reservation: reservation.success, timestamp });
};

/** Prepares lifecycle evidence through the reservation and record owner used by turn evidence. */
export const prepareLifecycleEvidence = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  service: RuntimeEvidenceService,
  fact: LifecycleFact<DefinitionValue, CleanupError, ProviderDefinition>,
  reservation?: EvidenceReservation,
) => {
  const reserved =
    reservation === undefined
      ? reserveRuntimeEvidence(service)
      : reservation.hub === service.hub
        ? Result.succeed(reservation)
        : Result.fail(invalidEvidence("reservation", { reason: "foreign-hub" }));

  if (Result.isFailure(reserved)) return Result.fail(reserved.failure);

  const prepared = makeLifecycleRecord(fact, reserved.success);

  if (Result.isFailure(prepared)) {
    const cancelled = cancelRuntimeEvidence(service, reserved.success.sequence);

    return Result.isFailure(cancelled)
      ? Result.fail(cancelled.failure)
      : Result.fail(prepared.failure);
  }

  return prepared;
};

type RuntimeEvidenceOwner = {
  hub: EvidenceHub;
  service: RuntimeEvidenceService;
  projectPublication: <DefinitionValue extends MachineDefinition>(
    publication: ActorPublication<DefinitionValue>,
    project: (snapshot: ActorSnapshot<DefinitionValue>) => ActorSnapshot<DefinitionValue>,
  ) => void;
  acceptPublication: <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
    fence: ActorFence,
    before: ActorSnapshot<DefinitionValue>,
    publication: ActorPublication<DefinitionValue>,
  ) => Result.Result<number, PublicDiagnostic>;
  close: () => Effect.Effect<EvidenceDrain, PublicDiagnostic>;
};

type PreparedActorEvidence<DefinitionValue extends MachineDefinition> = {
  reservation: EvidenceReservation;
  timestamp: number;
  fence: ActorFence;
  provenance: RuntimeProvenance<App, DefinitionValue>;
  cause: TurnCause<DefinitionValue>;
  before: ActorSnapshot<DefinitionValue>;
  project: (snapshot: ActorSnapshot<DefinitionValue>) => ActorSnapshot<DefinitionValue>;
  publicationRevision: number;
  machineTurnRevision: number;
};

/** Creates the single runtime evidence capability used by actors and lifecycle. */
// RETURN_TYPE: The public owner exposes one stable hub/service/close contract.
export const makeRuntimeEvidenceOwner = (options: {
  app: App;
  plan: RuntimePlan;
  clock: Clock.Clock;
}): RuntimeEvidenceOwner => {
  const hub = makeEvidenceHub({ app: options.app, plan: options.plan });
  const reservations = new Map<number, EvidenceReservation>();
  // oxlint-disable-next-line anti-slop/no-object-type -- publication identity is tracked privately by weak object membership.
  const published = new WeakSet<object>();
  let closed = false;

  const timestamp = () => {
    return Result.try({
      try: () => options.clock.currentTimeMillisUnsafe(),
      catch: () => invalidEvidence("timestamp", { reason: "read-failed" }),
    });
  };

  const cancelReservation = (reservation: EvidenceReservation) => {
    const cancelled = hub.cancel(reservation);

    if (Result.isSuccess(cancelled)) reservations.delete(reservation.sequence);

    return cancelled;
  };

  const failReserved = (reservation: EvidenceReservation, failure: PublicDiagnostic) => {
    const cancelled = cancelReservation(reservation);

    return Result.isFailure(cancelled) ? Effect.fail(cancelled.failure) : Effect.fail(failure);
  };

  const cancelAndPreserveFailure = (
    reservation: EvidenceReservation,
    cause: Cause.Cause<PublicDiagnostic>,
  ) => {
    const cancelled = cancelReservation(reservation);

    return Result.isFailure(cancelled) ? Effect.fail(cancelled.failure) : Effect.failCause(cause);
  };

  const reserveEvidence = () => {
    const reservation = hub.reserve();

    if (Result.isSuccess(reservation))
      reservations.set(reservation.success.sequence, reservation.success);

    return reservation;
  };

  const projectPublication = <DefinitionValue extends MachineDefinition>(
    publication: ActorPublication<DefinitionValue>,
    project: (snapshot: ActorSnapshot<DefinitionValue>) => ActorSnapshot<DefinitionValue>,
  ) => {
    projectedPublicationSnapshots.set(publication, project);
  };

  const takePublicationProject = <DefinitionValue extends MachineDefinition>(
    publication: ActorPublication<DefinitionValue>,
  ) => {
    const project = projectedPublicationSnapshots.get(publication);
    projectedPublicationSnapshots.delete(publication);

    if (project === undefined) return (snapshot: ActorSnapshot<DefinitionValue>) => snapshot;

    // SAFETY: projectPublication stores only a projection for this exact publication identity;
    // the generic boundary is erased while the owner retains the precise callback.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return project as (snapshot: ActorSnapshot<DefinitionValue>) => ActorSnapshot<DefinitionValue>;
  };

  const preparePublication = <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
    fence: ActorFence,
    before: ActorSnapshot<DefinitionValue>,
    publication: ActorPublication<DefinitionValue>,
    project: (snapshot: ActorSnapshot<DefinitionValue>) => ActorSnapshot<DefinitionValue>,
  ) => {
    if (closed) return Result.fail(closedEvidence());
    const reservation = reserveEvidence();

    if (Result.isFailure(reservation)) return Result.fail(reservation.failure);

    const timestampResult = timestamp();

    if (Result.isFailure(timestampResult)) {
      cancelReservation(reservation.success);

      return Result.fail(timestampResult.failure);
    }

    if (!Number.isSafeInteger(timestampResult.success) || timestampResult.success < 0) {
      cancelReservation(reservation.success);

      return Result.fail(invalidEvidence("timestamp", { reason: "invalid" }));
    }

    if (
      identity.key !== fence.key ||
      identity.incarnation !== fence.incarnation ||
      identity.leaseEpoch !== fence.leaseEpoch
    ) {
      cancelReservation(reservation.success);

      return Result.fail(invalidEvidence("provenance", { reason: "actor-mismatch" }));
    }

    if (reservation.success.sequence !== hub.sequence() + 1) {
      cancelReservation(reservation.success);

      return Result.fail(
        invalidEvidence("prefix", {
          reason: "out-of-order",
          sequence: reservation.success.sequence,
        }),
      );
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
        after: project(publication.snapshot),
        store: publication.store,
        publicationRevision: publication.publicationRevision,
        machineTurnRevision: publication.machineTurnRevision,
        timestamp: timestampResult.success,
      },
      reservation.success,
    );

    if (Result.isFailure(preflight)) {
      cancelReservation(reservation.success);

      return Result.fail(preflight.failure);
    }

    const preparedEvidence: PreparedActorEvidence<DefinitionValue> = {
      reservation: reservation.success,
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
      project,
      publicationRevision: publication.publicationRevision,
      machineTurnRevision: publication.machineTurnRevision,
    };

    preparedPublicationFinalizers.set(publication, (finalPublication) => {
      // SAFETY: preparation validated every fallible field and the actor engine supplies the committed store cut.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- package-private generic finalization preserves the actor boundary.
      const completed = finalPublication as ActorPublication<DefinitionValue>;

      const record = {
        _tag: "turn" as const,
        fence: preparedEvidence.fence,
        provenance: preparedEvidence.provenance,
        cause: preparedEvidence.cause,
        before: preparedEvidence.before,
        after: preparedEvidence.project(completed.snapshot),
        store: completed.store,
        publicationRevision: preparedEvidence.publicationRevision,
        machineTurnRevision: preparedEvidence.machineTurnRevision,
        timestamp: preparedEvidence.timestamp,
        sequence: preparedEvidence.reservation.sequence,
      };

      const accepted = hub.acceptPreparedSync(preparedEvidence.reservation, record);
      reservations.delete(preparedEvidence.reservation.sequence);

      return accepted.sequence;
    });
    preparedPublicationCancellers.set(publication, () => cancelReservation(reservation.success));

    return Result.succeed(reservation.success.sequence);
  };

  const publish = <
    DefinitionValue extends MachineDefinition,
    CleanupError,
    ProviderDefinition extends MachineDefinition = DefinitionValue,
  >(
    snapshot: LifecycleSnapshot<DefinitionValue, CleanupError, ProviderDefinition>,
  ) => {
    if (closed) return Effect.fail(closedEvidence());

    return Effect.sync(() => {
      published.add(snapshot);
    });
  };

  const accept = <
    DefinitionValue extends MachineDefinition,
    CleanupError,
    ProviderDefinition extends MachineDefinition = DefinitionValue,
  >(
    record: RuntimeLifecycleEvidence<DefinitionValue, CleanupError, ProviderDefinition>,
  ) => {
    const reservation = reservations.get(record.evidenceSequence);

    if (reservation === undefined)
      return Effect.fail(invalidEvidence("reservation", { reason: "not-reserved" }));

    if (!published.has(record.after))
      return failReserved(
        reservation,
        invalidEvidence("publication", { reason: "snapshot-not-published" }),
      );

    if (!Number.isSafeInteger(record.timestamp) || record.timestamp < 0)
      return failReserved(reservation, invalidEvidence("timestamp", { reason: "invalid" }));

    if (
      record.provenance.app !== options.app ||
      record.provenance.plan !== options.plan ||
      record.provenance.actor.key !== record.after.fence.key ||
      record.provenance.actor.incarnation !== record.after.fence.incarnation ||
      record.provenance.actor.leaseEpoch !== record.after.fence.leaseEpoch
    )
      return failReserved(
        reservation,
        invalidEvidence("provenance", { reason: "lifecycle-mismatch" }),
      );

    return Effect.exit(hub.accept(reservation, record)).pipe(
      Effect.flatMap((exit) => {
        if (Exit.isSuccess(exit)) {
          reservations.delete(record.evidenceSequence);

          return Effect.succeed(undefined);
        }

        return cancelAndPreserveFailure(reservation, exit.cause);
      }),
    );
  };

  const service: RuntimeEvidenceService = {
    hub,
    provenance: { app: options.app, plan: options.plan },
    publish,
    accept,
    drain: hub.drain().pipe(Effect.asVoid),
  };

  serviceCancellers.set(service, (sequence) => {
    const reservation = reservations.get(sequence);

    return reservation === undefined ? Result.succeed(undefined) : cancelReservation(reservation);
  });
  serviceReservationOwners.set(service, reserveEvidence);
  hubReservationOwners.set(hub, reserveEvidence);

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
      identity.leaseEpoch !== fence.leaseEpoch
    )
      return Result.fail(invalidEvidence("provenance", { reason: "actor-mismatch" }));
    const project = takePublicationProject(publication);

    if (isPreparedActorPublication(publication))
      return preparePublication(identity, fence, before, publication, project);
    const reservation = reserveEvidence();

    if (Result.isFailure(reservation)) return Result.fail(reservation.failure);

    const timestampResult = timestamp();

    if (Result.isFailure(timestampResult)) {
      cancelReservation(reservation.success);

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
        after: project(publication.snapshot),
        store: publication.store,
        publicationRevision: publication.publicationRevision,
        machineTurnRevision: publication.machineTurnRevision,
        timestamp: timestampResult.success,
      },
      reservation.success,
    );

    if (Result.isFailure(record)) {
      const cancelled = cancelReservation(reservation.success);

      return Result.isFailure(cancelled)
        ? Result.fail(cancelled.failure)
        : Result.fail(record.failure);
    }

    const acceptedRecord = hub.acceptSync(reservation.success, record.success);

    if (Result.isFailure(acceptedRecord)) {
      cancelReservation(reservation.success);

      return Result.fail(acceptedRecord.failure);
    }

    reservations.delete(reservation.success.sequence);

    return Result.succeed(acceptedRecord.success.sequence);
  };

  const close = () =>
    Effect.suspend(() => {
      closed = true;

      return hub.close();
    });

  return {
    hub,
    service,
    projectPublication,
    acceptPublication,
    close,
  };
};
