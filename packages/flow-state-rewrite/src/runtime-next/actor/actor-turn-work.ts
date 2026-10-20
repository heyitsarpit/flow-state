import { Effect, Option, Result } from "effect";

import type { EventOf } from "../../definition/domain.js";
import type { PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { MachineDefinition } from "../../machine/grammar.js";
import type { Machine } from "../../machine/machine.js";
import type { DispatchReceipt } from "../runtime.js";
import { planEventTurn, type EventTurnPlan } from "../turn-plan.js";
import { runMappedContinuations } from "./actor-mailbox.js";
import type { ActorIdentity } from "./actor-directory.js";
import type { ContextNotification } from "../context/context-coordinator.js";
import type { EvidenceCredit } from "../evidence/evidence-journal.js";
import type { EvidenceProvenance } from "../evidence/evidence-record.js";
import type { makeRuntimeEvidencePolicy } from "../runtime-services.js";
import type { ActorSnapshot } from "../runtime.js";
import {
  checkedActorSuccessor,
  isPermitRollbackFailure,
  withPermitRollback,
  type PermitRollbackFailure,
} from "./actor-state.js";
import {
  preparePublishedSnapshot,
  type ActorPublication,
  type ActorSnapshotCopyPolicy,
} from "./actor-snapshot.js";

type ActorTurnFailure = PublicDiagnostic | PermitRollbackFailure;

/** Execute one planned turn and its causal mapped continuation against the engine's current cut. */
export const makeActorTurnRunner = <D extends MachineDefinition>(input: {
  machine: Machine<D>;
  copyPolicy: ActorSnapshotCopyPolicy;
  current(): ActorPublication<D>;
  commitEvent(
    event: EventOf<D>,
    plan: EventTurnPlan<D>,
  ): Result.Result<DispatchReceipt, ActorTurnFailure>;
  commitIssue(event: EventOf<D>, failure: PublicDiagnostic): Result.Result<void, ActorTurnFailure>;
  afterEvent(): Effect.Effect<void, PublicDiagnostic>;
}) => {
  const executeOne = (event: EventOf<D>) => {
    const planned = planEventTurn({
      machine: input.machine,
      copyPolicy: input.copyPolicy,
      before: input.current().snapshot,
      event,
    });

    const committed = Result.isSuccess(planned)
      ? input.commitEvent(event, planned.success)
      : Result.fail(planned.failure);

    if (Result.isFailure(committed)) {
      if (isPermitRollbackFailure(committed.failure)) return Result.fail(committed.failure);

      const issue = input.commitIssue(event, committed.failure);

      return Result.isFailure(issue) ? Result.fail(issue.failure) : Result.fail(committed.failure);
    }

    return Result.succeed({
      receipt: committed.success,
      mapped:
        Result.isSuccess(planned) && planned.success._tag === "planned"
          ? planned.success.mappedEvents
          : [],
    });
  };

  const runEvent = (event: EventOf<D>) =>
    runMappedContinuations<EventOf<D>, DispatchReceipt, ActorTurnFailure>({
      first: event,
      execute: executeOne,
      current: () => ({
        publicationRevision: input.current().snapshot.revision,
        evidenceSequence: input.current().evidenceSequence,
      }),
    }).pipe(Effect.onExit(() => input.afterEvent()));

  return runEvent;
};

/** A failed plan publishes one issue-only actor revision from the last committed cut. */
export const prepareIssueCut = <D extends MachineDefinition>(input: {
  machine: Machine<D>;
  copyPolicy: ActorSnapshotCopyPolicy;
  publication: ActorPublication<D>;
  event: EventOf<D>;
  failure: PublicDiagnostic;
  credit: EvidenceCredit;
  identity: ActorIdentity;
  provenance: EvidenceProvenance;
  evidence: Pick<ReturnType<typeof makeRuntimeEvidencePolicy>, "prepareTurn">;
  prepareNotification(
    snapshot: ActorSnapshot<D>,
  ): Result.Result<Option.Option<ContextNotification>, PublicDiagnostic>;
  cancelNotification(notification: Option.Option<ContextNotification>): void;
}) =>
  withPermitRollback((register) => {
    const before = input.publication.snapshot;
    const revision = checkedActorSuccessor(before.revision, "revision");

    if (Result.isFailure(revision)) return Result.fail(revision.failure);

    const owned = preparePublishedSnapshot<D>(
      {
        ...before,
        issues: [input.failure],
        revision: revision.success,
      },
      input.copyPolicy,
    );

    if (Result.isFailure(owned)) return Result.fail(owned.failure);

    const evidence = input.evidence.prepareTurn(input.credit, {
      _tag: "turn",
      cause: { kind: "event", event: input.event },
      fence: input.identity,
      provenance: input.provenance,
      timestamp: 0,
      publicationRevision: revision.success,
      machineTurnRevision: input.publication.machineTurnRevision,
      before,
      after: owned.success,
    });

    if (Result.isFailure(evidence)) return Result.fail(evidence.failure);
    register(() => evidence.success.cancel());
    const notification = input.prepareNotification(owned.success);

    if (Result.isFailure(notification)) return Result.fail(notification.failure);

    if (Option.isSome(notification.success))
      register(() => input.cancelNotification(notification.success));

    return Result.succeed({
      snapshot: owned.success,
      evidence: evidence.success,
      notification: notification.success,
    });
  });
