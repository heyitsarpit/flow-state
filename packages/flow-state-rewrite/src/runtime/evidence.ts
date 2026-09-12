// oxlint-disable-next-line anti-slop/no-large-production-file -- evidence sequencing, sink isolation, and runtime publication form one owner boundary.
import { Cause, Deferred, Effect, Exit, Option, Queue, Result, Semaphore } from "effect";

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
import type {
  RuntimeClockService,
  RuntimeEvidenceService,
  RuntimeLifecycleEvidence,
} from "./runtime-services.js";
import type { TurnCause } from "./turn-plan.js";

declare const evidenceSequenceBrand: unique symbol;

declare const sinkIdBrand: unique symbol;

/** Runtime-global evidence order is allocated only by an EvidenceHub. */
export type EvidenceSequence = number & { readonly [evidenceSequenceBrand]: void };

/** Sink identity is local to one EvidenceHub. */
export type SinkId = string & { readonly [sinkIdBrand]: void };

type RuntimePlan = ReturnType<typeof appPlan>;

/** Evidence retains exact app/plan identity and the actor incarnation. */
export type RuntimeProvenance<
  A extends App = App,
  DefinitionValue extends MachineDefinition = MachineDefinition,
> = {
  readonly app: A;
  readonly plan: RuntimePlan;
  readonly actor: Pick<ActorIdentity<DefinitionValue>, "key" | "incarnation" | "leaseEpoch">;
};

/** A committed actor/store cut before hub sequencing. */
export type TurnFact<A extends App, DefinitionValue extends MachineDefinition> = {
  readonly fence: ActorFence;
  readonly provenance: RuntimeProvenance<A, DefinitionValue>;
  readonly cause: TurnCause<DefinitionValue>;
  readonly before: ActorSnapshot<DefinitionValue>;
  readonly after: ActorSnapshot<DefinitionValue>;
  readonly store: ActorStoreResult<DefinitionValue>;
  readonly publicationRevision: number;
  readonly machineTurnRevision: number;
  readonly timestamp: number;
};

/** Immutable actual evidence for one committed actor/store cut. */
export type TurnRecord<A extends App, DefinitionValue extends MachineDefinition> = TurnFact<
  A,
  DefinitionValue
> & {
  readonly _tag: "turn";
  readonly sequence: EvidenceSequence;
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
  readonly evidenceSequence: EvidenceSequence;
};

type EvidenceProvenance = {
  readonly app: App;
  readonly plan: RuntimePlan;
  readonly actor: Pick<ActorIdentity, "key" | "incarnation" | "leaseEpoch">;
};

/** The sink boundary retains the concrete record fields without exposing their generic owners. */
export type EvidenceRecord =
  | {
      readonly _tag: "turn";
      readonly fence: ActorFence;
      readonly provenance: EvidenceProvenance;
      readonly cause: CauseEnvelope;
      readonly before: SnapshotEnvelope;
      readonly after: SnapshotEnvelope;
      readonly store: StoreEnvelope;
      readonly publicationRevision: number;
      readonly machineTurnRevision: number;
      readonly timestamp: number;
      readonly sequence: number;
    }
  | {
      readonly _tag: "lifecycle";
      readonly machineTurn: false;
      readonly from: string;
      readonly to: string;
      readonly cause: unknown;
      readonly before: LifecycleSnapshotEnvelope;
      readonly after: LifecycleSnapshotEnvelope;
      readonly timestamp: number;
      readonly publicationRevision: number;
      readonly machineTurnRevision: number;
      readonly evidenceSequence: number;
      readonly provenance: EvidenceProvenance;
    };

export type EvidenceReservation = {
  readonly hub: EvidenceHub;
  readonly sequence: EvidenceSequence;
};

export type SinkOfferResult = {
  readonly sink: SinkId;
  readonly sequence: EvidenceSequence;
  readonly status: "accepted" | "dropped" | "detached";
};

export type SinkDrainResult = {
  readonly sink: SinkId;
  readonly through: EvidenceSequence;
  readonly status: "drained" | "truncated" | "failed";
};

export type EvidenceAcceptance = {
  readonly reservation: EvidenceReservation;
  readonly record: EvidenceRecord;
  readonly sequence: EvidenceSequence;
  readonly sinks: readonly SinkOfferResult[];
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
  readonly through: EvidenceSequence | 0;
  readonly truncatedBefore: Option.Option<EvidenceSequence>;
  readonly sinks: readonly SinkDrainResult[];
};

type EvidenceSinkInternals = {
  readonly offerUnsafe: (record: EvidenceRecord, sequence: EvidenceSequence) => SinkOfferResult;
  readonly drain: (through: EvidenceSequence) => Effect.Effect<SinkDrainResult, PublicDiagnostic>;
  readonly close: Effect.Effect<void>;
  readonly truncatedBefore: () => EvidenceSequence | undefined;
};

export type EvidenceSink = {
  readonly id: SinkId;
  readonly capacity: number;
  readonly mailbox: Queue.Queue<EvidenceRecord>;
  readonly offer: (record: EvidenceRecord) => Effect.Effect<SinkOfferResult, PublicDiagnostic>;
  readonly drain: (through: EvidenceSequence) => Effect.Effect<SinkDrainResult, PublicDiagnostic>;
  readonly close: () => Effect.Effect<void, PublicDiagnostic>;
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

const serviceReservationLookups = new WeakMap<
  EvidenceReference,
  (sequence: number) => EvidenceReservation | undefined
>();

const hubReservationLookups = new WeakMap<
  EvidenceReference,
  (sequence: number) => EvidenceReservation | undefined
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

const immutableArray = <Value>(values: Iterable<Value>) => {
  // oxlint-disable-next-line anti-slop/no-object-freeze -- accepted sink results are immutable boundary data.
  return Object.freeze([...values]);
};

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

    // oxlint-disable-next-line anti-slop/no-object-freeze -- accepted evidence envelopes are immutable copies.
    return Object.freeze(clone);
  };

  // SAFETY: copy preserves the input's structure and changes only structured containers to frozen copies.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- recursive structural copying retains the caller's evidence family.
  return copy(value) as Value;
};

type SnapshotEnvelope = {
  readonly lifecycle: ActorSnapshot<MachineDefinition>["lifecycle"];
  readonly state: unknown;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- context fields retain application values until opaque leaves are preserved.
  readonly context: Readonly<Record<string, unknown>>;
  readonly operations: readonly { readonly descriptor: unknown }[];
  readonly issues: readonly unknown[];
};

type StoreEnvelope = {
  readonly revision: number;
  readonly changed: readonly { readonly descriptor: unknown }[];
};

type CauseEnvelope =
  | { readonly _tag: "event"; readonly event: unknown }
  | {
      readonly _tag: "projection";
      readonly fact: ProjectionEnvelope;
    };

type ProjectionEnvelope =
  | {
      readonly _tag: "completion-projection";
      readonly completion: {
        readonly fence: { readonly descriptor: unknown };
        readonly outcome: {
          readonly _tag: string;
          readonly value?: unknown;
          readonly error?: unknown;
          readonly exit?: unknown;
        };
      };
    }
  | {
      readonly _tag: "stream-projection";
      readonly fact: { readonly fence: { readonly descriptor: unknown }; readonly value: unknown };
    }
  | {
      readonly _tag: "context-projection";
      readonly provider: { readonly value: unknown };
    }
  | {
      readonly _tag: "store-projection";
      readonly fact: { readonly changed: readonly { readonly descriptor: unknown }[] };
    }
  | { readonly _tag: "timer-projection" }
  | { readonly _tag: "lifecycle-projection" };

const preserveSnapshotOpaque = (
  snapshot: SnapshotEnvelope,
  preserved: WeakSet<EvidenceReference>,
) => {
  preserveOpaque(preserved, snapshot.state);

  for (const value of Object.values(snapshot.context)) preserveOpaque(preserved, value);

  for (const operation of snapshot.operations) preserveOpaque(preserved, operation.descriptor);

  for (const issue of snapshot.issues) preserveOpaque(preserved, issue);
};

type CompletionEnvelope = Extract<ProjectionEnvelope, { readonly _tag: "completion-projection" }>;

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
  readonly attachment: {
    readonly providerRevisions: unknown;
    readonly cursors: unknown;
    readonly resources: readonly {
      readonly scope: unknown;
      readonly close: unknown;
      readonly reacquire?: unknown;
      readonly cause: unknown;
    }[];
    readonly work: readonly {
      readonly fiber: unknown;
      readonly cancel: unknown;
      readonly finalizer: unknown;
      readonly reacquire?: unknown;
      readonly cause: unknown;
      readonly completion?: unknown;
    }[];
    readonly bindings: readonly {
      readonly provider: unknown;
      readonly select: unknown;
    }[];
    readonly operations: readonly { readonly cause: unknown }[];
    readonly timers: readonly { readonly refresh?: unknown }[];
    readonly blockedDisposal?: { readonly dependentActors: readonly unknown[] };
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
    preserveOpaque(preserved, resource.scope);
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
    readonly id?: string;
    readonly capacity?: number;
    readonly deliver?: (record: EvidenceRecord) => Effect.Effect<void, PublicDiagnostic>;
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

        return Effect.succeed(offerUnsafe(record, sequenceValue(sequence)));
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
  readonly sequence: () => EvidenceSequence | 0;
  readonly reserve: () => Result.Result<EvidenceReservation, PublicDiagnostic>;
  readonly cancel: (reservation: EvidenceReservation) => Result.Result<void, PublicDiagnostic>;
  readonly attach: (sink: EvidenceSink) => Result.Result<void, PublicDiagnostic>;
  /** Synchronous actor publication uses the same prefix transition as async acceptance. */
  readonly acceptSync: (
    reservation: EvidenceReservation,
    record: EvidenceRecord,
  ) => Result.Result<EvidenceAcceptance, PublicDiagnostic>;
  /** Consumes a fully prepared actor record after its store cut commits. */
  readonly acceptPreparedSync: (
    reservation: EvidenceReservation,
    record: EvidenceRecord,
  ) => EvidenceAcceptance;
  readonly accept: (
    reservation: EvidenceReservation,
    record: EvidenceRecord,
  ) => Effect.Effect<EvidenceAcceptance, PublicDiagnostic>;
  readonly drain: () => Effect.Effect<EvidenceDrain, PublicDiagnostic>;
  readonly close: () => Effect.Effect<EvidenceDrain, PublicDiagnostic>;
};

type AcceptAttempt =
  | { readonly _tag: "wait"; readonly waiter: Deferred.Deferred<void, PublicDiagnostic> }
  | { readonly _tag: "done"; readonly acceptance: EvidenceAcceptance };

type ReservationState = {
  readonly reservation: EvidenceReservation;
  status: "pending" | "accepted" | "tombstoned";
};

/** Owns sequence allocation, prefix ordering, sink isolation, and close drain. */
// RETURN_TYPE: The public hub factory preserves the recursive reservation and sink contract.
export const makeEvidenceHub = (options: {
  readonly app: App;
  readonly plan: RuntimePlan;
}): EvidenceHub => {
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

    const immutable = Result.try({
      try: () => copyRecord(record),
      catch: () => invalidEvidence("record", { reason: "copy-failed" }),
    });

    if (Result.isFailure(immutable)) {
      cancelUnsafe(reservation);

      return Result.fail(immutable.failure);
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
      const offer = internal.offerUnsafe(immutable.success, sequence);

      if (offer.status === "dropped" && truncatedBefore === undefined) truncatedBefore = sequence;

      return offer;
    });

    return Result.succeed({
      reservation,
      record: immutable.success,
      sequence,
      sinks: immutableArray(offers),
    });
  };

  const acceptPreparedUnsafe = (
    reservation: EvidenceReservation,
    record: EvidenceRecord,
  ): EvidenceAcceptance => {
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
      sinks: immutableArray(offers),
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

  // RETURN_TYPE: Prefix admission relies on the explicit wait/done union for narrowing.
  const attempt = (
    reservation: EvidenceReservation,
    record: EvidenceRecord,
  ): AcceptAttempt | Result.Result<EvidenceAcceptance, PublicDiagnostic> => {
    const validated = validateReservation(reservation, record);

    if (Result.isFailure(validated)) return Result.fail(validated.failure);
    const sequence = validated.success;

    if (sequence === accepted + 1) {
      const acceptedRecord = acceptUnsafe(reservation, record);

      return Result.isFailure(acceptedRecord)
        ? acceptedRecord
        : { _tag: "done", acceptance: acceptedRecord.success };
    }

    if (sequence > accepted + 1) {
      let waiter = waiters.get(accepted + 1);

      if (waiter === undefined) {
        const created = Deferred.makeUnsafe<void, PublicDiagnostic>();
        waiters.set(accepted + 1, created);
        waiter = created;
      }

      return { _tag: "wait", waiter };
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
        sinks: immutableArray(results),
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

  // oxlint-disable-next-line anti-slop/no-object-freeze -- turn records are immutable evidence boundary values.
  return Result.succeed(Object.freeze({ ...fact, _tag: "turn", sequence: reservation.sequence }));
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

  // oxlint-disable-next-line anti-slop/no-object-freeze -- lifecycle records are immutable evidence boundary values.
  return Result.succeed(Object.freeze({ ...fact, evidenceSequence: reservation.sequence }));
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
export const cancelRuntimeEvidence = (
  service: RuntimeEvidenceService,
  sequence: number,
): Result.Result<void, PublicDiagnostic> => {
  const cancel = serviceCancellers.get(service);

  if (cancel !== undefined) return cancel(sequence);

  if (isReference(service.hub)) {
    const cancelHub = hubCancellers.get(service.hub);

    if (cancelHub !== undefined) return cancelHub(sequence);
  }

  return Result.succeed(undefined);
};

const reservationLookupForService = (service: RuntimeEvidenceService) => {
  const direct = serviceReservationLookups.get(service);

  if (direct !== undefined) return direct;

  if (!isReference(service.hub)) return undefined;

  return hubReservationLookups.get(service.hub);
};

/** Prepares lifecycle evidence through the reservation and record owner used by turn evidence. */
export const prepareLifecycleEvidence = <
  DefinitionValue extends MachineDefinition,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  service: RuntimeEvidenceService,
  fact: LifecycleFact<DefinitionValue, CleanupError, ProviderDefinition>,
): Result.Result<
  RuntimeLifecycleEvidence<DefinitionValue, CleanupError, ProviderDefinition>,
  PublicDiagnostic
> => {
  const sequence = Result.try({
    try: () => service.nextEvidenceSequence(),
    catch: () => invalidEvidence("sequence", { reason: "allocation-failed" }),
  });

  if (Result.isFailure(sequence)) return Result.fail(sequence.failure);
  const reservationLookup = reservationLookupForService(service);

  if (reservationLookup === undefined) {
    cancelRuntimeEvidence(service, sequence.success);

    return Result.fail(invalidEvidence("reservation", { reason: "owner-unavailable" }));
  }

  const reservation = reservationLookup(sequence.success);

  if (reservation === undefined) {
    cancelRuntimeEvidence(service, sequence.success);

    return Result.fail(invalidEvidence("reservation", { reason: "not-reserved" }));
  }

  const prepared = makeLifecycleRecord(fact, reservation);

  if (Result.isFailure(prepared)) {
    const cancelled = cancelRuntimeEvidence(service, sequence.success);

    return Result.isFailure(cancelled)
      ? Result.fail(cancelled.failure)
      : Result.fail(prepared.failure);
  }

  return prepared;
};

type RuntimeEvidenceOwner = {
  readonly hub: EvidenceHub;
  readonly service: RuntimeEvidenceService;
  readonly projectPublication: <DefinitionValue extends MachineDefinition>(
    publication: ActorPublication<DefinitionValue>,
    project: (snapshot: ActorSnapshot<DefinitionValue>) => ActorSnapshot<DefinitionValue>,
  ) => void;
  readonly acceptPublication: <DefinitionValue extends MachineDefinition>(
    identity: ActorIdentity<DefinitionValue>,
    fence: ActorFence,
    before: ActorSnapshot<DefinitionValue>,
    publication: ActorPublication<DefinitionValue>,
  ) => Result.Result<number, PublicDiagnostic>;
  readonly close: () => Effect.Effect<EvidenceDrain, PublicDiagnostic>;
};

type PreparedActorEvidence<DefinitionValue extends MachineDefinition> = {
  readonly reservation: EvidenceReservation;
  readonly timestamp: number;
  readonly fence: ActorFence;
  readonly provenance: RuntimeProvenance<App, DefinitionValue>;
  readonly cause: TurnCause<DefinitionValue>;
  readonly before: ActorSnapshot<DefinitionValue>;
  readonly project: (snapshot: ActorSnapshot<DefinitionValue>) => ActorSnapshot<DefinitionValue>;
  readonly publicationRevision: number;
  readonly machineTurnRevision: number;
};

/** Creates the single runtime evidence capability used by actors and lifecycle. */
// RETURN_TYPE: The public owner exposes one stable hub/service/close contract.
export const makeRuntimeEvidenceOwner = (options: {
  readonly app: App;
  readonly plan: RuntimePlan;
  readonly clock: RuntimeClockService;
}): RuntimeEvidenceOwner => {
  const hub = makeEvidenceHub({ app: options.app, plan: options.plan });
  const reservations = new Map<number, EvidenceReservation>();
  // oxlint-disable-next-line anti-slop/no-object-type -- publication identity is tracked privately by weak object membership.
  const published = new WeakSet<object>();
  let latestMachineTurnRevision = 0;
  let closed = false;
  const timestamp = () => Effect.runSync(options.clock.now);

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

  const nextEvidenceSequence = () => {
    const reservation = hub.reserve();

    if (Result.isFailure(reservation)) throw reservation.failure;
    reservations.set(reservation.success.sequence, reservation.success);

    return reservation.success.sequence;
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
    const reservation = hub.reserve();

    if (Result.isFailure(reservation)) return Result.fail(reservation.failure);
    reservations.set(reservation.success.sequence, reservation.success);

    const timestampResult = Result.try({
      try: timestamp,
      catch: () => invalidEvidence("timestamp", { reason: "read-failed" }),
    });

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

      // oxlint-disable-next-line anti-slop/no-object-freeze -- accepted evidence is an immutable boundary value.
      const record = Object.freeze({
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
      });

      const accepted = hub.acceptPreparedSync(preparedEvidence.reservation, record);
      reservations.delete(preparedEvidence.reservation.sequence);
      latestMachineTurnRevision = preparedEvidence.machineTurnRevision;

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
    get machineTurnRevision() {
      return latestMachineTurnRevision;
    },
    nextEvidenceSequence,
    publish,
    accept,
    drain: hub.drain().pipe(Effect.asVoid),
  };

  serviceCancellers.set(service, (sequence) => {
    const reservation = reservations.get(sequence);

    return reservation === undefined ? Result.succeed(undefined) : cancelReservation(reservation);
  });
  serviceReservationLookups.set(service, (sequence) => reservations.get(sequence));
  hubReservationLookups.set(hub, (sequence) => reservations.get(sequence));

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
    const reservation = hub.reserve();

    if (Result.isFailure(reservation)) return Result.fail(reservation.failure);

    const timestampResult = Result.try({
      try: timestamp,
      catch: () => invalidEvidence("timestamp", { reason: "read-failed" }),
    });

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
    latestMachineTurnRevision = publication.machineTurnRevision;

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
