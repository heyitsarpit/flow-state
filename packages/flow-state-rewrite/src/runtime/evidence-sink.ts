import { Cause, Effect, Exit, Queue, Semaphore } from "effect";

import {
  Defect,
  Diagnostic,
  Failure,
  Interrupt,
  type PublicDiagnostic,
} from "../diagnostic/diagnostic.js";
import type {
  AttachmentDrainResult,
  AttachmentOfferResult,
  EvidenceAttachmentToken,
  EvidenceRecord,
  EvidenceSequence,
  SinkId,
} from "./evidence.js";

export type EvidenceSink = EvidenceAttachmentToken & {
  capacity: number;
  offer: (record: EvidenceRecord) => Effect.Effect<AttachmentOfferResult, PublicDiagnostic>;
};

type EvidenceSinkOptions = {
  id: string;
  capacity: number;
  deliver: (record: EvidenceRecord) => Effect.Effect<void, PublicDiagnostic>;
};

const sequenceOf = (record: EvidenceRecord) =>
  record._tag === "turn" ? record.sequence : record.evidenceSequence;

const sequenceValue = (value: number) => {
  // SAFETY: Journal records contain only positive safe integer sequences.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the Journal owns this numeric brand.
  return value as EvidenceSequence;
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

/** P10 owns one bounded queue and exposes its Journal attachment capability. */
// RETURN_TYPE: The sink factory keeps its typed construction failure channel explicit.
export const makeEvidenceSink = (
  options: Partial<EvidenceSinkOptions> = {},
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

    const offerUnsafe = (
      record: EvidenceRecord,
      acceptedSequence: EvidenceSequence,
    ): AttachmentOfferResult => {
      if (closed || failure !== undefined)
        return { sink: sinkId, sequence: acceptedSequence, status: "detached" };

      if (Queue.offerUnsafe(mailbox, record))
        return { sink: sinkId, sequence: acceptedSequence, status: "accepted" };

      if (truncatedBefore === undefined) truncatedBefore = acceptedSequence;

      return { sink: sinkId, sequence: acceptedSequence, status: "dropped" };
    };

    const offer = (record: EvidenceRecord) =>
      Effect.sync(() => offerUnsafe(record, sequenceValue(sequenceOf(record))));

    const drain = (through: EvidenceSequence) =>
      semaphore.withPermit(
        Effect.gen(function* () {
          if (failure !== undefined)
            return {
              sink: sinkId,
              through,
              status: "failed",
            } satisfies AttachmentDrainResult;

          while (Queue.sizeUnsafe(mailbox) > 0) {
            const next = yield* Queue.peek(mailbox);

            if (sequenceOf(next) > through) break;

            const record = yield* Queue.take(mailbox);
            const delivered = yield* Effect.exit(deliver(record));

            if (Exit.isFailure(delivered)) {
              failure = makeSinkFailure(delivered.cause);

              while (Queue.sizeUnsafe(mailbox) > 0) Queue.takeUnsafe(mailbox);

              return {
                sink: sinkId,
                through,
                status: "failed",
              } satisfies AttachmentDrainResult;
            }
          }

          return {
            sink: sinkId,
            through,
            status: truncatedBefore === undefined ? "drained" : "truncated",
          } satisfies AttachmentDrainResult;
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
      offerUnsafe,
      offer,
      drain,
      close: () => close,
      truncatedBefore: () => truncatedBefore,
    };

    return sink;
  });
