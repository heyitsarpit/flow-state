import { Cause, Deferred, Effect, Exit, Option, Result } from "effect";

import {
  Defect,
  Diagnostic,
  Failure,
  Interrupt,
  type PublicDiagnostic,
} from "../../diagnostic/diagnostic.js";
import type { EvidenceRecord, EvidenceSequence } from "./evidence-record.js";
import { publishEvidenceOption } from "./evidence-option.js";

export type AttachmentOfferResult = {
  sink: string;
  sequence: EvidenceSequence;
  status: "accepted" | "dropped" | "detached";
};

export type SinkAccounting = Readonly<{
  accepted: number;
  dropped: number;
  delivered: number;
  truncated: number;
  failed: number;
  detached: number;
  greatestOmittedSequence: Option.Option<EvidenceSequence>;
}>;

export type SinkFailureDiagnostic = Readonly<{
  code: PublicDiagnostic["code"];
  path: ReadonlyArray<string | number>;
  details: Readonly<PublicDiagnostic["details"]>;
  summary: string;
  help: string;
}>;

export type SinkFailureReason =
  | Readonly<{ _tag: "Fail"; error: SinkFailureDiagnostic }>
  | Readonly<{ _tag: "Die"; defect: SinkFailureDiagnostic }>
  | Readonly<{ _tag: "Interrupt"; fiberId: Option.Option<number> }>;

export type SinkFailure = Readonly<{
  reasons: ReadonlyArray<SinkFailureReason>;
}>;

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

const snapshotDiagnostic = (diagnostic: SinkFailureDiagnostic) => {
  // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: copied diagnostic path cannot change after failure publication; P055-SINK-FAILURE.
  const path = Object.freeze([...diagnostic.path]);
  // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: copied diagnostic details cannot change after failure publication; P055-JOURNAL-RETAINED.
  const details = Object.freeze({ ...diagnostic.details });

  // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: copied diagnostic fields cannot change after failure publication; P055-SINK-FAILURE.
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
      // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: published Fail reason cannot replace its diagnostic; P055-SINK-FAILURE.
      return Object.freeze({
        _tag: "Fail",
        error: snapshotDiagnostic(reason.error),
      } satisfies SinkFailureReason);
    }

    if (reason._tag === "Die") {
      // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: published Die reason cannot replace its diagnostic; P055-SINK-FAILURE.
      return Object.freeze({
        _tag: "Die",
        defect: snapshotDiagnostic(reason.defect),
      } satisfies SinkFailureReason);
    }

    // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: published Interrupt reason cannot replace its fiber identity; P055-SINK-FAILURE.
    return Object.freeze({
      _tag: "Interrupt",
      fiberId: publishEvidenceOption(Option.getOrUndefined(reason.fiberId)),
    } satisfies SinkFailureReason);
  });

  // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: published reason order cannot change; P055-SINK-FAILURE.
  const publishedReasons = Object.freeze(reasons);

  // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: published failure cannot replace its reason list; P055-SINK-FAILURE.
  return Object.freeze({ reasons: publishedReasons } satisfies SinkFailure);
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
  // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: copied sink accounting cannot change after drain; P055-SINK-DRAIN.
  const accounting = Object.freeze({
    accepted: source.accounting.accepted,
    dropped: source.accounting.dropped,
    delivered: source.accounting.delivered,
    truncated: source.accounting.truncated,
    failed: source.accounting.failed,
    detached: source.accounting.detached,
    greatestOmittedSequence: publishEvidenceOption(
      Option.getOrUndefined(source.accounting.greatestOmittedSequence),
    ),
  });

  // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: copied sink result cannot change after drain or close; P055-JOURNAL-RETAINED.
  return Object.freeze({
    sink: source.sink,
    through: source.through,
    status: source.status,
    truncatedBefore: publishEvidenceOption(Option.getOrUndefined(source.truncatedBefore)),
    accounting,
    failureCause: publishEvidenceOption(
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
