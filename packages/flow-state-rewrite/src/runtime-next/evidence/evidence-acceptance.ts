import type { EvidenceRecord, EvidenceSequence } from "./evidence-record.js";
import type { AttachmentOfferResult } from "./evidence-sink.js";

/** Publishes one immutable acceptance value after the Journal's synchronous cut. */
export const publishEvidenceAcceptance = <Record extends EvidenceRecord>(
  record: Record,
  sequence: EvidenceSequence,
  offers: AttachmentOfferResult[],
) => {
  const publishedOffers = offers.map((offer) => {
    // Each offer may belong to a sink; only this fresh copy becomes a publication fact.
    // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: copied offer cannot change after acceptance; P055-RECORD-TURN.
    return Object.freeze({ sink: offer.sink, sequence: offer.sequence, status: offer.status });
  });

  // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: acceptance attachments cannot be reordered or replaced; P055-RECORD-TURN.
  const attachments = Object.freeze(publishedOffers);

  // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: acceptance record and sequence cannot be swapped; P055-RECORD-TURN.
  return Object.freeze({ record, sequence, attachments });
};

export type EvidenceAcceptance<Record extends EvidenceRecord = EvidenceRecord> = ReturnType<
  typeof publishEvidenceAcceptance<Record>
>;
