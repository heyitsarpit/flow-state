import { Clock, Context, Effect, Layer, Result } from "effect";

import { Failure, type PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type { EvidenceCredit, EvidenceJournal } from "./evidence/evidence-journal.js";
import type { LifecycleEvidenceDraft, TurnEvidenceDraft } from "./evidence/evidence-record.js";

/** The runtime service key retains the existing identity during the owner rewrite. */
export interface RuntimeEvidenceIdentity {
  _tag: "RuntimeEvidence";
}

/** The shell only needs terminal evidence draining; the journal supplies record operations. */
export interface RuntimeEvidenceService {
  drain: Effect.Effect<void, PublicDiagnostic>;
}

export const RuntimeEvidence = Context.Service<RuntimeEvidenceIdentity, RuntimeEvidenceService>(
  "flow-state/runtime/RuntimeEvidence",
);

export type RuntimeServiceContext = RuntimeEvidenceIdentity;

export type RuntimeServicesLayer = Layer.Layer<RuntimeServiceContext>;

const invalidClock = (reason: string) =>
  Failure({
    code: "InvalidTraceRecord",
    path: ["evidence", "timestamp"],
    details: { reason },
    summary: "The runtime clock did not provide a valid evidence timestamp.",
    help: "Provide a clock with a nonnegative safe-integer millisecond reading.",
  });

/** Captures the supplied runtime clock before handing an owned draft to the journal. */
export const makeRuntimeEvidencePolicy = (journal: EvidenceJournal, clock: Clock.Clock) => {
  const timestamp = () => {
    const reading = Result.try({
      try: () => clock.currentTimeMillisUnsafe(),
      catch: () => invalidClock("read-failed"),
    });

    if (Result.isFailure(reading)) return Result.fail(reading.failure);

    return Number.isSafeInteger(reading.success) && reading.success >= 0
      ? reading
      : Result.fail(invalidClock("invalid"));
  };

  const prepareTurn = <Before, After, Cause>(
    credit: EvidenceCredit,
    draft: TurnEvidenceDraft<Before, After, Cause>,
  ) => {
    const captured = timestamp();

    return Result.isFailure(captured)
      ? Result.fail(captured.failure)
      : journal.prepareTurn(credit, draft, captured.success);
  };

  const prepareLifecycle = <Before, After, Cause>(
    credit: EvidenceCredit,
    draft: LifecycleEvidenceDraft<Before, After, Cause>,
  ) => {
    const captured = timestamp();

    return Result.isFailure(captured)
      ? Result.fail(captured.failure)
      : journal.prepareLifecycle(credit, draft, captured.success);
  };

  return { prepareTurn, prepareLifecycle };
};

/** Assembly supplies already-created capabilities; their owners keep their lifetimes. */
export const makeRuntimeServicesLayer = (services: {
  clock: Clock.Clock;
  evidence: RuntimeEvidenceService;
}) =>
  Layer.mergeAll(
    Layer.succeed(Clock.Clock)(services.clock),
    Layer.succeed(RuntimeEvidence)(services.evidence),
  );
