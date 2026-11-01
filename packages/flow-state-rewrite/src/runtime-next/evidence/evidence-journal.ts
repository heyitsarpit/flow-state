import { Deferred, Effect, Exit, Option, Result, Scope } from "effect";

import { Failure, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { ActorIdentity } from "../actor/actor-directory.js";
import { publishEvidenceAcceptance, type EvidenceAcceptance } from "./evidence-acceptance.js";
import {
  cancelEvidenceSequence,
  publishEvidenceSequence,
  reserveEvidenceSequence,
  type SequenceState,
} from "./evidence-journal-sequence.js";
import { publishEvidenceOption } from "./evidence-option.js";
import {
  completeLifecycleEvidence,
  completeTurnEvidence,
  prepareLifecycleEvidence,
  prepareTurnEvidence,
  type EvidenceRecord,
  type EvidenceProvenance,
  type EvidenceSequence,
  type LifecycleEvidenceDraft,
  type LifecycleEvidenceRecord,
  type TurnEvidenceRecord,
  type TurnEvidenceDraft,
} from "./evidence-record.js";
import { snapshotAttachmentDrainResult as snapshotDrain } from "./evidence-sink.js";
import type { AttachmentDrainResult, EvidenceSink, SinkOfferPermit } from "./evidence-sink.js";

const attachmentBrand: unique symbol = Symbol("EvidenceAttachmentToken");

/** The journal mints this opaque attachment authority for one sink and one journal. */
export type EvidenceAttachmentToken = { [attachmentBrand]: true };

export interface EvidenceCredit {
  // oxlint-disable-next-line anti-slop/no-readonly -- The journal-issued credit keeps its actor fence fixed for exact release and validation.
  readonly fence: ActorIdentity;
  release(): void;
}

// oxlint-disable-next-line anti-slop/no-readonly -- Drain results are frozen snapshots of the journal's accepted prefix.
export type EvidenceDrain = Readonly<{
  through: EvidenceSequence | 0;
  truncatedBefore: Option.Option<EvidenceSequence>;
  // oxlint-disable-next-line anti-slop/no-readonly -- The published attachment list is frozen with the drain snapshot.
  attachments: ReadonlyArray<AttachmentDrainResult>;
}>;

export interface TurnEvidencePermit<Before, After, Cause> {
  accept<StoreResult>(
    store: StoreResult,
  ): EvidenceAcceptance<TurnEvidenceRecord<StoreResult, Before, After, Cause>>;
  cancel(): void;
}

export interface LifecycleEvidencePermit<Before, After, Cause> {
  accept(): EvidenceAcceptance<LifecycleEvidenceRecord<Before, After, Cause>>;
  cancel(): void;
}

export interface EvidenceJournal {
  sequence(): EvidenceSequence | 0;
  registerActor(fence: ActorIdentity): Result.Result<EvidenceCredit, PublicDiagnostic>;
  prepareTurn<Before, After, Cause>(
    credit: EvidenceCredit,
    draft: TurnEvidenceDraft<Before, After, Cause>,
    timestampOverride?: number,
  ): Result.Result<TurnEvidencePermit<Before, After, Cause>, PublicDiagnostic>;
  prepareLifecycle<Before, After, Cause>(
    credit: EvidenceCredit,
    draft: LifecycleEvidenceDraft<Before, After, Cause>,
    timestampOverride?: number,
  ): Result.Result<LifecycleEvidencePermit<Before, After, Cause>, PublicDiagnostic>;
  issueAttachment(sink: EvidenceSink): Result.Result<EvidenceAttachmentToken, PublicDiagnostic>;
  attach(token: EvidenceAttachmentToken): Result.Result<void, PublicDiagnostic>;
  drain(): Effect.Effect<EvidenceDrain, PublicDiagnostic>;
  close(): Effect.Effect<EvidenceDrain, PublicDiagnostic>;
}

type Offer = { sink: EvidenceSink; permit: SinkOfferPermit };

type Pending = {
  credit: CreditState;
  offers: Offer[];
  kind: "turn" | "lifecycle";
  status: "live" | "accepted" | "cancelled";
};

type CreditState = {
  credit: EvidenceCredit;
  status: "live" | "terminal" | "released";
  lifecyclePending: boolean;
};

type Attachment = {
  sink: EvidenceSink;
  status: "issued" | "attached";
};

const invalid = (reason: string, details: Record<string, string | number | boolean | null> = {}) =>
  Failure({
    code: "InvalidTraceRecord",
    path: ["evidence", reason],
    details,
    summary: "Evidence authority is invalid for this journal.",
    help: "Use the current journal's actor credit, permit, and attachment token.",
  });

const disposed = () =>
  Failure({
    code: "RuntimeDisposed",
    path: ["evidence", "closed"],
    details: {},
    summary: "Evidence admission is closed.",
    help: "Accept evidence before runtime disposal begins.",
  });

type JournalOptions = {
  app: EvidenceProvenance["app"];
  plan: EvidenceProvenance["plan"];
  ownerScope: Scope.Scope;
  capacity: number;
};

/** One runtime-local authority for credits, preparation, sequence, attachment, and close. */
// RETURN_TYPE: Construction keeps capacity validation in the typed Result channel.
export const makeEvidenceJournal = (
  options: JournalOptions,
): Result.Result<EvidenceJournal, PublicDiagnostic> => {
  const capacity = options.capacity;

  if (!Number.isSafeInteger(capacity) || capacity < 0)
    return Result.fail(invalid("capacity", { capacity }));

  const credits = new Map<ActorIdentity, CreditState>();
  const issuedCredits = new WeakMap<EvidenceCredit, CreditState>();
  const pending = new Set<Pending>();
  const issued = new Map<EvidenceAttachmentToken, Attachment>();
  const attachments: Attachment[] = [];
  let ordinaryPending = 0;
  const sequenceState: SequenceState = { accepted: 0, pending: 0, current: 0 };
  let closed = false;
  let closeCell: Deferred.Deferred<Exit.Exit<EvidenceDrain, PublicDiagnostic>> | undefined;

  const sequence = () => sequenceState.current;

  const validCredit = (credit: EvidenceCredit) => {
    const state = issuedCredits.get(credit);

    return state?.credit === credit &&
      credits.get(state.credit.fence) === state &&
      state.status === "live"
      ? state
      : undefined;
  };

  const cancelPending = (state: Pending) => {
    if (state.status !== "live") return;
    state.status = "cancelled";
    pending.delete(state);
    cancelEvidenceSequence(sequenceState);

    if (state.kind === "turn") ordinaryPending -= 1;
    else state.credit.lifecyclePending = false;

    for (const offer of state.offers) offer.permit.cancel();
  };

  const registerActor = (fence: ActorIdentity) => {
    if (closed) return Result.fail(disposed());

    if (credits.has(fence)) return Result.fail(invalid("credit", { reason: "duplicate" }));

    const state: CreditState = {
      credit: {
        fence,
        release: () => {
          if (state.status === "released" || credits.get(fence) !== state) return;
          state.status = "released";

          for (const preparation of pending) {
            if (preparation.credit === state) cancelPending(preparation);
          }

          credits.delete(fence);
          issuedCredits.delete(state.credit);
        },
      },
      status: "live",
      lifecyclePending: false,
    };

    // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: issued credit cannot replace its fence or release authority; P055-JOURNAL-CREDIT.
    Object.freeze(state.credit);
    credits.set(fence, state);
    issuedCredits.set(state.credit, state);

    return Result.succeed(state.credit);
  };

  const prepareOffers = () => {
    const offers: Offer[] = [];

    for (const attachment of attachments) {
      const prepared = attachment.sink.prepareOffer();

      if (Result.isFailure(prepared)) {
        for (const offer of offers) offer.permit.cancel();

        return Result.fail(prepared.failure);
      }

      offers.push({ sink: attachment.sink, permit: prepared.success });
    }

    return Result.succeed(offers);
  };

  const preflight = (credit: EvidenceCredit, draftFence: ActorIdentity, kind: Pending["kind"]) => {
    if (closed) return Result.fail(disposed());
    const state = validCredit(credit);

    if (state === undefined || draftFence !== state.credit.fence)
      return Result.fail(invalid("credit", { reason: "foreign-or-stale" }));

    if (kind === "turn" && ordinaryPending >= capacity)
      return Result.fail(invalid("capacity", { reason: "ordinary-full" }));

    if (kind === "lifecycle" && state.lifecyclePending)
      return Result.fail(invalid("credit", { reason: "lifecycle-pending" }));

    return Result.succeed(state);
  };

  // RETURN_TYPE: Preserve the exact prepared record family through synchronous acceptance.
  const accept = <Record extends EvidenceRecord>(
    state: Pending,
    complete: (sequence: EvidenceSequence) => Record,
  ): EvidenceAcceptance<Record> => {
    if (state.status !== "live") throw invalid("permit", { reason: "consumed" });

    // Every live preparation owns one checked reservation.
    const evidenceSequence = publishEvidenceSequence(sequenceState);
    const completed = complete(evidenceSequence);
    const offers = state.offers.map((offer) => offer.permit.accept(completed));
    state.status = "accepted";
    pending.delete(state);

    if (state.kind === "turn") ordinaryPending -= 1;
    else state.credit.lifecyclePending = false;

    return publishEvidenceAcceptance(completed, evidenceSequence, offers);
  };

  const prepareTurn = <Before, After, Cause>(
    credit: EvidenceCredit,
    draft: TurnEvidenceDraft<Before, After, Cause>,
    timestampOverride?: number,
  ) => {
    const prepared = prepareTurnEvidence(draft, [], timestampOverride);

    if (Result.isFailure(prepared)) return Result.fail(prepared.failure);
    const checked = preflight(credit, prepared.success.draft.fence, "turn");

    if (Result.isFailure(checked)) return Result.fail(checked.failure);

    if (
      prepared.success.draft.provenance.app !== options.app ||
      prepared.success.draft.provenance.plan !== options.plan
    )
      return Result.fail(invalid("provenance", { reason: "foreign-runtime" }));

    const reserved = reserveEvidenceSequence(sequenceState);

    if (Result.isFailure(reserved)) return Result.fail(reserved.failure);

    const offers = prepareOffers();

    if (Result.isFailure(offers)) {
      cancelEvidenceSequence(sequenceState);

      return Result.fail(offers.failure);
    }

    const state: Pending = {
      credit: checked.success,
      kind: "turn",
      offers: offers.success,
      status: "live",
    };

    pending.add(state);
    ordinaryPending += 1;

    const permit: TurnEvidencePermit<Before, After, Cause> = {
      accept: (store) =>
        accept(state, (issuedSequence) =>
          completeTurnEvidence(prepared.success, store, issuedSequence),
        ),
      cancel: () => cancelPending(state),
    };

    return Result.succeed(permit);
  };

  const prepareLifecycle = <Before, After, Cause>(
    credit: EvidenceCredit,
    draft: LifecycleEvidenceDraft<Before, After, Cause>,
    timestampOverride?: number,
  ) => {
    const prepared = prepareLifecycleEvidence(draft, [], timestampOverride);

    if (Result.isFailure(prepared)) return Result.fail(prepared.failure);
    const checked = preflight(credit, prepared.success.draft.fence, "lifecycle");

    if (Result.isFailure(checked)) return Result.fail(checked.failure);

    if (
      prepared.success.draft.provenance.app !== options.app ||
      prepared.success.draft.provenance.plan !== options.plan
    )
      return Result.fail(invalid("provenance", { reason: "foreign-runtime" }));

    const reserved = reserveEvidenceSequence(sequenceState);

    if (Result.isFailure(reserved)) return Result.fail(reserved.failure);

    const offers = prepareOffers();

    if (Result.isFailure(offers)) {
      cancelEvidenceSequence(sequenceState);

      return Result.fail(offers.failure);
    }

    const state: Pending = {
      credit: checked.success,
      kind: "lifecycle",
      offers: offers.success,
      status: "live",
    };

    pending.add(state);
    checked.success.lifecyclePending = true;

    const permit: LifecycleEvidencePermit<Before, After, Cause> = {
      accept: () => {
        const acceptance = accept(state, (issuedSequence) =>
          completeLifecycleEvidence(prepared.success, issuedSequence),
        );

        if (prepared.success.draft.terminal) checked.success.status = "terminal";

        return acceptance;
      },
      cancel: () => cancelPending(state),
    };

    return Result.succeed(permit);
  };

  const issueAttachment = (sink: EvidenceSink) => {
    if (closed) return Result.fail(disposed());
    const token = { [attachmentBrand]: true } satisfies EvidenceAttachmentToken;
    const claimed = sink.claimOnce();

    if (Result.isFailure(claimed)) return Result.fail(claimed.failure);

    issued.set(token, { sink, status: "issued" });

    return Result.succeed(token);
  };

  const attach = (token: EvidenceAttachmentToken) => {
    if (closed) return Result.fail(disposed());
    const attachment = issued.get(token);

    if (attachment === undefined || attachment.status !== "issued")
      return Result.fail(invalid("attachment", { reason: "foreign-or-replayed" }));

    const added: { state: Pending; offer: Offer }[] = [];

    for (const state of pending) {
      const prepared = attachment.sink.prepareOffer();

      if (Result.isFailure(prepared)) {
        for (const entry of added) entry.offer.permit.cancel();

        return Result.fail(prepared.failure);
      }

      added.push({ state, offer: { sink: attachment.sink, permit: prepared.success } });
    }

    for (const entry of added) entry.state.offers.push(entry.offer);
    attachment.status = "attached";
    attachments.push(attachment);

    return Result.succeed(undefined);
  };

  const drainCaptured = (through: EvidenceSequence | 0, sinks: Attachment[]) =>
    Effect.gen(function* () {
      const results: AttachmentDrainResult[] = [];

      for (const attachment of sinks) {
        if (through === 0) continue;
        results.push(snapshotDrain(yield* attachment.sink.drain(through)));
      }

      let truncatedBefore: EvidenceSequence | undefined;

      for (const result of results) {
        if (
          Option.isSome(result.truncatedBefore) &&
          (truncatedBefore === undefined || result.truncatedBefore.value > truncatedBefore)
        )
          truncatedBefore = result.truncatedBefore.value;
      }

      // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: cached close attachments cannot be replaced after settlement; P055-JOURNAL-CLOSE.
      const publishedResults = Object.freeze(results);

      // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: repeated close callers cannot rewrite terminal counts; P055-JOURNAL-CLOSE.
      return Object.freeze({
        through,
        truncatedBefore: publishEvidenceOption(truncatedBefore),
        attachments: publishedResults,
      } satisfies EvidenceDrain);
    });

  const drain = () => Effect.suspend(() => drainCaptured(sequence(), [...attachments]));

  const closeWorker = (completion: Deferred.Deferred<Exit.Exit<EvidenceDrain, PublicDiagnostic>>) =>
    Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          restore(
            Effect.gen(function* () {
              if (credits.size !== 0) {
                const fences = [...credits.values()].map((state) => state.credit.fence);

                return yield* Effect.fail(
                  invalid("stranded-credit", {
                    actors: fences.map((fence) => `${fence.key}@${fence.incarnation}`).join(", "),
                  }),
                );
              }

              for (const state of pending) cancelPending(state);
              const captured = sequence();
              const sinks = [...attachments];
              const result = yield* drainCaptured(captured, sinks);

              for (const attachment of sinks) yield* attachment.sink.close();

              attachments.length = 0;
              issued.clear();

              return result;
            }),
          ),
        );

        yield* Deferred.succeed(completion, exit);
      }),
    );

  const close = () =>
    Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        let completion = closeCell;

        if (completion === undefined) {
          completion = Deferred.makeUnsafe<Exit.Exit<EvidenceDrain, PublicDiagnostic>>();
          closeCell = completion;
          closed = true;
          yield* Effect.forkIn(closeWorker(completion), options.ownerScope, {
            startImmediately: true,
            uninterruptible: false,
          });
        }

        return yield* restore(Deferred.await(completion).pipe(Effect.flatMap((exit) => exit)));
      }),
    );

  return Result.succeed({
    sequence,
    registerActor,
    prepareTurn,
    prepareLifecycle,
    issueAttachment,
    attach,
    drain,
    close,
  });
};
