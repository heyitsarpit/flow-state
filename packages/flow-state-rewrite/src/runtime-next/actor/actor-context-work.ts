import { Deferred, Effect, Option, Result } from "effect";

import { Failure, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { MachineDefinition } from "../../machine/grammar.js";
import type { Machine } from "../../machine/machine.js";
import type { ActorSnapshot } from "../runtime.js";
import type { ContextNotification } from "../context/context-coordinator.js";
import type { ContextTicketOutcome } from "../context/context-participant.js";
import type { ContextOffer, ContextTicket } from "../context/context-ticket.js";
import type { ContextCut } from "../context/lineage.js";
import type { ActorIdentity } from "./actor-directory.js";
import { checkedActorSuccessor } from "./actor-state.js";
import { preparePublishedSnapshot, type ActorSnapshotCopyPolicy } from "./actor-snapshot.js";
import type { ActorCommandOutcome } from "./actor-mailbox.js";

const contextFailure = (reason: "closed" | "context-outcome") =>
  reason === "closed"
    ? Failure({
        code: "DisposedActorRef",
        path: ["actor", "mailbox"],
        details: { reason },
        summary: "Actor mailbox closed",
        help: "Dispatch only while the actor has admission and capacity.",
      })
    : Failure({
        code: "InvariantViolation",
        path: ["actor", reason],
        details: { reason },
        summary: "Actor cannot complete this command",
        help: "Use an active actor and a valid committed input.",
      });

const invalidContext = (reason: string) =>
  Failure({
    code: "SchemaValidation",
    path: ["snapshot", "context"],
    details: { reason },
    summary: "Actor snapshot is not a complete value for this machine.",
    help: "Supply one prepared snapshot with the machine's exact state and context.",
  });

/** A context offer becomes one complete passive cut without a machine turn. */
const prepareContextSnapshot = <D extends MachineDefinition>(
  copyPolicy: ActorSnapshotCopyPolicy,
  before: ActorSnapshot<D>,
  offer: ContextOffer<D>,
  initial: boolean,
) => {
  const revision = initial
    ? Result.succeed(before.revision)
    : checkedActorSuccessor(before.revision, "revision");

  if (Result.isFailure(revision)) return Result.fail(revision.failure);

  const context = { ...before.context };

  if (!offer.issueOnly)
    for (const entry of offer.entries)
      Object.defineProperty(context, entry.slot, {
        configurable: true,
        enumerable: true,
        value: entry.value,
        writable: true,
      });

  const candidate: ActorSnapshot<D> = {
    ...before,
    context,
    issues: [...before.issues, ...offer.selectorDefects.map(({ diagnostic }) => diagnostic)],
    revision: revision.success,
  };

  return preparePublishedSnapshot(candidate, copyPolicy);
};

export type ContextCursor = { cut: ContextCut; issueOnly: boolean };

type PreparedContextCut<D extends MachineDefinition> = {
  outcome: ContextTicketOutcome<D>;
  notification: Option.Option<ContextNotification>;
  // oxlint-disable-next-line anti-slop/no-readonly -- A prepared cut retains the current cursor map unchanged until publication installs its replacement.
  cursors: ReadonlyMap<string, ContextCursor>;
};

const isStaleContextEntry = <D extends MachineDefinition>(
  current: ContextCursor | undefined,
  entry: ContextOffer<D>["entries"][number],
) =>
  current !== undefined &&
  Object.is(current.cut.identity, entry.provider.identity) &&
  entry.provider.revision < current.cut.revision;

const advancesContextEntry = <D extends MachineDefinition>(
  current: ContextCursor | undefined,
  entry: ContextOffer<D>["entries"][number],
  issueOnly: boolean,
) =>
  current === undefined ||
  !Object.is(current.cut.identity, entry.provider.identity) ||
  entry.provider.revision > current.cut.revision ||
  current.issueOnly !== issueOnly;

const contextOfferStatus = <D extends MachineDefinition>(
  offer: ContextOffer<D>,
  initial: boolean,
  // oxlint-disable-next-line anti-slop/no-readonly -- Status compares against the retained publication cursor cut without mutation.
  cursors: ReadonlyMap<string, ContextCursor>,
) => {
  let status: "published" | "no-op" | "stale" = initial ? "published" : "no-op";

  for (const entry of offer.entries) {
    const current = cursors.get(entry.slot);

    if (isStaleContextEntry(current, entry)) status = "stale";
    else if (advancesContextEntry(current, entry, offer.issueOnly))
      if (status !== "stale") status = "published";
  }

  return status;
};

/** Finish the context candidate and downstream permit before the actor installs its cut. */
// RETURN_TYPE: This discriminated preparation result keeps routeContextTicket narrowing stable after inference produced TS2379 and TS2339.
export const prepareContextCut = <D extends MachineDefinition>(input: {
  machine: Machine<D>;
  copyPolicy: ActorSnapshotCopyPolicy;
  before: ActorSnapshot<D>;
  identity: ActorIdentity;
  ticket: ContextTicket<D>;
  initial: boolean;
  // oxlint-disable-next-line anti-slop/no-readonly -- Preflight reads the retained cursor cut without mutating it.
  cursors: ReadonlyMap<string, ContextCursor>;
  prepareNotification(
    snapshot: ActorSnapshot<D>,
  ): Result.Result<Option.Option<ContextNotification>, PublicDiagnostic>;
}): Result.Result<PreparedContextCut<D>, PublicDiagnostic> => {
  const consumed = input.ticket.consume(input.identity, input.before.revision);

  if (Result.isFailure(consumed)) return Result.fail(consumed.failure);
  const offer = consumed.success;
  const declared = Object.keys(input.machine.definition.context);
  const declaredSlots = new Set(declared);
  const slots = offer.entries.map((entry) => entry.slot);

  if (
    declared.length !== slots.length ||
    new Set(slots).size !== declared.length ||
    slots.some((slot) => !declaredSlots.has(slot))
  )
    return Result.fail(invalidContext("incomplete-offer"));

  const status = contextOfferStatus(offer, input.initial, input.cursors);

  if (status !== "published")
    return Result.succeed({
      outcome: { status, snapshot: input.before },
      notification: Option.none<ContextNotification>(),
      cursors: input.cursors,
    });

  const candidate = prepareContextSnapshot(input.copyPolicy, input.before, offer, input.initial);

  if (Result.isFailure(candidate)) return Result.fail(candidate.failure);

  const notification = input.initial
    ? Result.succeed(Option.none<ContextNotification>())
    : input.prepareNotification(candidate.success);

  if (Result.isFailure(notification)) return Result.fail(notification.failure);
  const cursors = new Map(input.cursors);

  for (const entry of offer.entries)
    cursors.set(entry.slot, { cut: entry.provider, issueOnly: offer.issueOnly });

  return Result.succeed({
    outcome: { status, snapshot: candidate.success },
    notification: notification.success,
    cursors,
  });
};

/** Prepare one context offer and delegate its only publication mutation to ActorEngine. */
export const routeContextTicket = <D extends MachineDefinition>(
  input: Parameters<typeof prepareContextCut<D>>[0] & {
    commitInitial(snapshot: ActorSnapshot<D>): void;
    commitActive(
      snapshot: ActorSnapshot<D>,
      notification: Option.Option<ContextNotification>,
    ): void;
    // oxlint-disable-next-line anti-slop/no-readonly -- Installation replaces the actor's complete cursor cut.
    installCursors(cursors: ReadonlyMap<string, ContextCursor>): void;
  },
) => {
  const prepared = prepareContextCut(input);

  if (Result.isFailure(prepared)) return Result.fail(prepared.failure);
  const { outcome, notification, cursors } = prepared.success;

  if (outcome.status !== "published") return Result.succeed(outcome);

  if (input.initial) input.commitInitial(outcome.snapshot);
  else input.commitActive(outcome.snapshot, notification);

  input.installCursors(cursors);

  return Result.succeed(outcome);
};

/** Prepare a one-shot context ticket for the actor's current admission phase. */
export const offerContextTicket = <D extends MachineDefinition>(options: {
  phase: "prepared" | "active" | "abandoned";
  ticket: ContextTicket<D>;
  applyInitial(ticket: ContextTicket<D>): Result.Result<ContextTicketOutcome<D>, PublicDiagnostic>;
  admitActive(
    ticket: ContextTicket<D>,
    isCancelled: () => boolean,
  ): Result.Result<Effect.Effect<ContextTicketOutcome<D>, PublicDiagnostic>, PublicDiagnostic>;
}) => {
  if (options.phase === "abandoned") return Result.fail(contextFailure("closed"));

  if (options.phase === "prepared") {
    const accepted = options.applyInitial(options.ticket);

    return Result.isFailure(accepted)
      ? Result.fail(accepted.failure)
      : Result.succeed({ wait: Effect.succeed(accepted.success), cancel() {} });
  }

  let cancelled = false;
  const admitted = options.admitActive(options.ticket, () => cancelled);

  return Result.isFailure(admitted)
    ? Result.fail(admitted.failure)
    : Result.succeed({
        wait: admitted.success,
        cancel() {
          cancelled = true;
        },
      });
};

/** Context command admission delegates to the engine's one bounded mailbox. */
export const makeActorContextAdmission =
  <D extends MachineDefinition>(options: {
    phase(): "prepared" | "active" | "abandoned";
    applyInitial(
      ticket: ContextTicket<D>,
    ): Result.Result<ContextTicketOutcome<D>, PublicDiagnostic>;
    admit(
      ticket: ContextTicket<D>,
      isCancelled: () => boolean,
    ): Result.Result<Deferred.Deferred<ActorCommandOutcome<D>, PublicDiagnostic>, PublicDiagnostic>;
  }) =>
  (ticket: ContextTicket<D>) =>
    offerContextTicket({
      phase: options.phase(),
      ticket,
      applyInitial: (issued) => options.applyInitial(issued),
      admitActive: (issued, isCancelled) => {
        const admitted = options.admit(issued, isCancelled);

        return Result.map(admitted, (acknowledgement) =>
          Deferred.await(acknowledgement).pipe(
            Effect.flatMap((outcome) =>
              outcome.kind === "context"
                ? Effect.succeed(outcome.outcome)
                : Effect.fail(contextFailure("context-outcome")),
            ),
          ),
        );
      },
    });
