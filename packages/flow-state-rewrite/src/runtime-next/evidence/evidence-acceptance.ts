import type { EvidenceRecord, EvidenceSequence } from "./evidence-record.js";
import type { AttachmentOfferResult } from "./evidence-sink.js";

/** Publishes one immutable acceptance value after the Journal's synchronous cut. */
export const publishEvidenceAcceptance = <Record extends EvidenceRecord>(
  record: Record,
  sequence: EvidenceSequence,
  offers: AttachmentOfferResult[],
) => {
  const publishedOffers = offers.map((offer) => {
    // oxlint-disable-next-line anti-slop/no-object-freeze -- each newly returned sink outcome becomes a fixed publication fact.
    return Object.freeze(offer);
  });

  // oxlint-disable-next-line anti-slop/no-object-freeze -- callers receive no mutable attachment collection capability.
  const attachments = Object.freeze(publishedOffers);

  // oxlint-disable-next-line anti-slop/no-object-freeze -- sequence, record, and offer bindings form one immutable acceptance.
  return Object.freeze({ record, sequence, attachments });
};

export type EvidenceAcceptance<Record extends EvidenceRecord = EvidenceRecord> = ReturnType<
  typeof publishEvidenceAcceptance<Record>
>;
