import { Cause, Deferred, Effect, Exit, Option, Result } from "effect";

import {
  Defect,
  Diagnostic,
  Failure,
  Interrupt,
  type PublicDiagnostic,
} from "../../diagnostic/diagnostic.js";
import type { EvidenceRecord, EvidenceSequence } from "./evidence-record.js";

export type AttachmentOfferResult = {
  sink: string;
  sequence: EvidenceSequence;
  status: "accepted" | "dropped" | "detached";
};

// oxlint-disable-next-line anti-slop/no-readonly -- sink accounting is an immutable public observation.
export type SinkAccounting = Readonly<{
  accepted: number;
  dropped: number;
  delivered: number;
  truncated: number;
  failed: number;
  detached: number;
  greatestOmittedSequence: Option.Option<EvidenceSequence>;
}>;

// oxlint-disable-next-line anti-slop/no-readonly -- failure details are copied before publication.
export type SinkFailureDiagnostic = Readonly<{
  code: PublicDiagnostic["code"];
  // oxlint-disable-next-line anti-slop/no-readonly -- the published path cannot alias a caller's array.
  path: ReadonlyArray<string | number>;
  // oxlint-disable-next-line anti-slop/no-readonly -- the published details cannot alias a caller's record.
  details: Readonly<PublicDiagnostic["details"]>;
  summary: string;
  help: string;
}>;

export type SinkFailureReason =
  // oxlint-disable-next-line anti-slop/no-readonly -- each reason is a fixed observation, not an Effect Cause reason.
  | Readonly<{ _tag: "Fail"; error: SinkFailureDiagnostic }>
  // oxlint-disable-next-line anti-slop/no-readonly -- defect details are projected without exposing an arbitrary value.
  | Readonly<{ _tag: "Die"; defect: SinkFailureDiagnostic }>
  // oxlint-disable-next-line anti-slop/no-readonly -- interruption identity is fixed at publication.
  | Readonly<{ _tag: "Interrupt"; fiberId: Option.Option<number> }>;

// oxlint-disable-next-line anti-slop/no-readonly -- a sink publishes ordered immutable reason observations.
export type SinkFailure = Readonly<{
  // oxlint-disable-next-line anti-slop/no-readonly -- the reason list cannot alias Effect Cause internals.
  reasons: ReadonlyArray<SinkFailureReason>;
}>;

// oxlint-disable-next-line anti-slop/no-readonly -- a published drain result cannot expose mutable sink observations.
export type AttachmentDrainResult = Readonly<{
  sink: string;
  through: EvidenceSequence;
  status: "drained" | "pending" | "truncated" | "failed";
  truncatedBefore: Option.Option<EvidenceSequence>;
  accounting: SinkAccounting;
  failureCause: Option.Option<SinkFailure>;
}>;

export type SinkOfferPermit = {
  accept(record: EvidenceRecord): AttachmentOfferResult;
  cancel(): void;
};

export type EvidenceSink = {
  id: string;
  capacity: number;
  /** One-shot resource binding; attachment membership remains in the journal. */
  claimOnce(): Result.Result<void, PublicDiagnostic>;
  prepareOffer(): Result.Result<SinkOfferPermit, PublicDiagnostic>;
  drain(through: EvidenceSequence): Effect.Effect<AttachmentDrainResult, PublicDiagnostic>;
  close(): Effect.Effect<void, PublicDiagnostic>;
};

export type EvidenceSinkOptions = {
  id: string;
  capacity: number;
  deliver: (record: EvidenceRecord) => Effect.Effect<void, PublicDiagnostic>;
};

const sinkClosed = (id: string) =>
  Failure({
    code: "RuntimeDisposed",
    path: ["evidence", "sink", id],
    details: { sink: id },
    summary: "Evidence sink is closed.",
    help: "Prepare offers before closing the sink.",
  });

const sinkClaimed = (id: string) =>
  Failure({
    code: "InvalidTraceRecord",
    path: ["evidence", "sink", id],
    details: { sink: id },
    summary: "Evidence sink is already bound to a journal.",
    help: "Use a fresh sink for another journal.",
  });

const diagnosticFromCause = (cause: Cause.Cause<PublicDiagnostic>) => {
  const defect = cause.reasons.find(Cause.isDieReason);

  if (defect !== undefined) return Defect(defect.defect);
  const failure = cause.reasons.find(Cause.isFailReason);

  if (failure !== undefined)
    return failure.error instanceof Diagnostic ? failure.error : Defect(failure.error);

  return Interrupt();
};

const publishedOption = <Value>(value: Value | undefined) => {
  const option = Option.fromNullishOr(value);

  // oxlint-disable-next-line anti-slop/no-object-freeze -- a drain result must not publish a writable Option wrapper into cached close state.
  return Object.freeze(option);
};

const snapshotDiagnostic = (diagnostic: SinkFailureDiagnostic) => {
  // oxlint-disable-next-line anti-slop/no-object-freeze -- this path copy is owned by the published failure observation.
  const path = Object.freeze([...diagnostic.path]);
  // oxlint-disable-next-line anti-slop/no-object-freeze -- this details copy cannot mutate the caller's diagnostic.
  const details = Object.freeze({ ...diagnostic.details });

  // oxlint-disable-next-line anti-slop/no-object-freeze -- canonical diagnostic fields are a fixed sink observation.
  return Object.freeze({
    code: diagnostic.code,
    path,
    details,
    summary: diagnostic.summary,
    help: diagnostic.help,
  });
};

const snapshotFailure = (source: SinkFailure) => {
  const reasons = source.reasons.map((reason) => {
    if (reason._tag === "Fail") {
      // oxlint-disable-next-line anti-slop/no-object-freeze -- this new reason does not alias the source reason.
      return Object.freeze({
        _tag: "Fail",
        error: snapshotDiagnostic(reason.error),
      } satisfies SinkFailureReason);
    }

    if (reason._tag === "Die") {
      // oxlint-disable-next-line anti-slop/no-object-freeze -- the defect projection is owned by this result.
      return Object.freeze({
        _tag: "Die",
        defect: snapshotDiagnostic(reason.defect),
      } satisfies SinkFailureReason);
    }

    // oxlint-disable-next-line anti-slop/no-object-freeze -- interruption identity is copied as a primitive.
    return Object.freeze({
      _tag: "Interrupt",
      fiberId: publishedOption(Option.getOrUndefined(reason.fiberId)),
    } satisfies SinkFailureReason);
  });

  // oxlint-disable-next-line anti-slop/no-object-freeze -- no source reason collection reaches the published result.
  return Object.freeze({ reasons: Object.freeze(reasons) } satisfies SinkFailure);
};

const observeCause = (cause: Cause.Cause<PublicDiagnostic>) => {
  const reasons = cause.reasons.map((reason) => {
    if (Cause.isFailReason(reason)) {
      return {
        _tag: "Fail",
        error: snapshotDiagnostic(reason.error),
      } satisfies SinkFailureReason;
    }

    if (Cause.isDieReason(reason)) {
      return {
        _tag: "Die",
        defect: snapshotDiagnostic(Defect(reason.defect)),
      } satisfies SinkFailureReason;
    }

    return {
      _tag: "Interrupt",
      fiberId: Option.fromNullishOr(reason.fiberId),
    } satisfies SinkFailureReason;
  });

  return { reasons } satisfies SinkFailure;
};

/** Copy every sink-returned result at the journal port boundary. */
// RETURN_TYPE: This exported port must name the branded sequence through the stable result type.
export const snapshotAttachmentDrainResult = (
  source: AttachmentDrainResult,
): AttachmentDrainResult => {
  // oxlint-disable-next-line anti-slop/no-object-freeze -- copied counters do not alias a sink's retained result.
  const accounting = Object.freeze({
    accepted: source.accounting.accepted,
    dropped: source.accounting.dropped,
    delivered: source.accounting.delivered,
    truncated: source.accounting.truncated,
    failed: source.accounting.failed,
    detached: source.accounting.detached,
    greatestOmittedSequence: publishedOption(
      Option.getOrUndefined(source.accounting.greatestOmittedSequence),
    ),
  });

  // oxlint-disable-next-line anti-slop/no-object-freeze -- the journal receives an owned immutable result graph.
  return Object.freeze({
    sink: source.sink,
    through: source.through,
    status: source.status,
    truncatedBefore: publishedOption(Option.getOrUndefined(source.truncatedBefore)),
    accounting,
    failureCause: publishedOption(
      Option.isSome(source.failureCause) ? snapshotFailure(source.failureCause.value) : undefined,
    ),
  } satisfies AttachmentDrainResult);
};

type InFlight = {
  record: EvidenceRecord;
  fiberId: number;
  settled: Deferred.Deferred<void>;
};

/** An independently bounded delivery owner; the journal owns attachment and order. */
// RETURN_TYPE: The constructor exposes the sink's typed failure channel.
export const makeEvidenceSink = (
  options: Partial<EvidenceSinkOptions> = {},
): Effect.Effect<EvidenceSink, PublicDiagnostic> =>
  Effect.gen(function* () {
    const capacity = options.capacity ?? 256;

    if (!Number.isSafeInteger(capacity) || capacity < 0)
      return yield* Effect.fail(
        Failure({
          code: "BoundExceeded",
          path: ["evidence", "sink", "capacity"],
          details: { capacity },
          summary: "Evidence sink capacity must be a non-negative safe integer.",
          help: "Choose a finite non-negative sink capacity.",
        }),
      );

    const id = options.id ?? `sink-${crypto.randomUUID()}`;
    const deliver = options.deliver ?? (() => Effect.void);
    const queue: EvidenceRecord[] = [];
    let reserved = 0;
    let claimed = false;
    let closed = false;
    let failure: PublicDiagnostic | undefined;
    let failureObservation: SinkFailure | undefined;
    let inFlight: InFlight | undefined;
    let accepted = 0;
    let dropped = 0;
    let delivered = 0;
    let truncated = 0;
    let failed = 0;
    let detached = 0;
    let greatestOmittedSequence: EvidenceSequence | undefined;

    const omit = (sequence: EvidenceSequence) => {
      if (greatestOmittedSequence === undefined || sequence > greatestOmittedSequence)
        greatestOmittedSequence = sequence;
    };

    const truncateQueued = () => {
      for (const record of queue) {
        truncated++;
        omit(record.sequence);
      }

      queue.length = 0;
    };

    const accounting = () =>
      ({
        accepted,
        dropped,
        delivered,
        truncated,
        failed,
        detached,
        greatestOmittedSequence: Option.fromNullishOr(greatestOmittedSequence),
      }) satisfies SinkAccounting;

    const result = (through: EvidenceSequence, pending: boolean) => {
      let status: AttachmentDrainResult["status"] = "drained";

      if (failure !== undefined) status = "failed";
      else if (pending) status = "pending";
      else if (greatestOmittedSequence !== undefined) status = "truncated";

      return snapshotAttachmentDrainResult({
        sink: id,
        through,
        status,
        accounting: accounting(),
        truncatedBefore: Option.fromNullishOr(greatestOmittedSequence),
        failureCause: Option.fromNullishOr(failureObservation),
      });
    };

    const claimOnce: EvidenceSink["claimOnce"] = () => {
      if (closed) return Result.fail(sinkClosed(id));

      if (claimed) return Result.fail(sinkClaimed(id));
      claimed = true;

      return Result.succeed(undefined);
    };

    const prepareOffer: EvidenceSink["prepareOffer"] = () => {
      let live = true;

      const reservedSlot =
        !closed &&
        failure === undefined &&
        queue.length + reserved + (inFlight === undefined ? 0 : 1) < capacity;

      if (reservedSlot) reserved++;

      return Result.succeed({
        accept(record) {
          if (!live) {
            // A journal calls a permit exactly once; a duplicate cannot retain a record.
            return { sink: id, sequence: record.sequence, status: "detached" };
          }

          live = false;

          if (reservedSlot) reserved--;

          if (closed || failure !== undefined) {
            detached++;
            omit(record.sequence);

            return { sink: id, sequence: record.sequence, status: "detached" };
          }

          if (!reservedSlot) {
            dropped++;
            truncated++;
            omit(record.sequence);

            return { sink: id, sequence: record.sequence, status: "dropped" };
          }

          queue.push(record);
          accepted++;

          return { sink: id, sequence: record.sequence, status: "accepted" };
        },
        cancel() {
          if (!live) return;
          live = false;

          if (reservedSlot) reserved--;
        },
      });
    };

    const runDelivery = (record: EvidenceRecord, settled: Deferred.Deferred<void>) =>
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          // Only claim and settlement are masked. The callback runs outside the
          // owner transition and can be interrupted with an accounted outcome.
          const exit = yield* Effect.exit(restore(Effect.suspend(() => deliver(record))));

          inFlight = undefined;

          if (Exit.isFailure(exit)) {
            failure = diagnosticFromCause(exit.cause);
            failureObservation = observeCause(exit.cause);
            failed++;
            omit(record.sequence);
            truncateQueued();
          } else {
            delivered++;
          }

          yield* Deferred.succeed(settled, undefined);

          return Exit.isFailure(exit);
        }),
      );

    const takeNext = (through: EvidenceSequence) => {
      if (failure !== undefined || queue.length === 0 || queue[0]!.sequence > through)
        return undefined;

      return queue.shift();
    };

    const drain: EvidenceSink["drain"] = (through) =>
      Effect.gen(function* () {
        const fiberId = yield* Effect.fiberId;

        for (;;) {
          // No Effect is yielded between claiming a record and publishing its token.
          if (inFlight !== undefined) {
            if (inFlight.record.sequence > through) return result(through, false);

            if (inFlight.fiberId === fiberId) return result(through, true);
            yield* Deferred.await(inFlight.settled);
            continue;
          }

          const record = takeNext(through);

          if (record === undefined) return result(through, false);

          const settled = Deferred.makeUnsafe<void>();
          inFlight = { record, fiberId, settled };
          const failedDelivery = yield* runDelivery(record, settled);

          if (failedDelivery) return result(through, false);
        }
      });

    const close: EvidenceSink["close"] = () =>
      Effect.gen(function* () {
        const fiberId = yield* Effect.fiberId;

        if (!closed) {
          closed = true;
          truncateQueued();
        }

        if (inFlight !== undefined && inFlight.fiberId !== fiberId)
          yield* Deferred.await(inFlight.settled);
      });

    return { id, capacity, claimOnce, prepareOffer, drain, close };
  });
