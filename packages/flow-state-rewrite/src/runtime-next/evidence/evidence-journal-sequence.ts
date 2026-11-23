import { Result } from "effect";

import { Failure } from "../../diagnostic/diagnostic.js";
import type { EvidenceSequence } from "./evidence-record.js";

export type SequenceState = {
  accepted: number;
  pending: number;
  current: EvidenceSequence | 0;
};

const exhausted = () =>
  Failure({
    code: "InvariantViolation",
    path: ["evidence", "sequence"],
    details: { current: Number.MAX_SAFE_INTEGER },
    summary: "Evidence sequence cannot advance.",
    help: "Stop before counter wrap or sequence reuse.",
  });

/** The Journal's checked reservation transition; owner proofs exercise this exact operation. */
export const reserveEvidenceSequence = (state: SequenceState) => {
  if (
    !Number.isSafeInteger(state.accepted) ||
    state.accepted < 0 ||
    !Number.isSafeInteger(state.pending) ||
    state.pending < 0 ||
    state.accepted >= Number.MAX_SAFE_INTEGER - state.pending
  )
    return Result.fail(exhausted());

  state.pending += 1;

  return Result.succeed(undefined);
};

export const cancelEvidenceSequence = (state: SequenceState) => {
  state.pending -= 1;
};

/** Publishes a previously reserved successor without another fallible step. */
export const publishEvidenceSequence = (state: SequenceState) => {
  const next = state.accepted + 1;
  // SAFETY: Every pending permit came from reserveEvidenceSequence before publication.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the checked owner transition brands this successor.
  const sequence = next as EvidenceSequence;
  state.accepted = next;
  state.pending -= 1;
  state.current = sequence;

  return sequence;
};
