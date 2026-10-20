import { Option, Result } from "effect";

import type { EventOf } from "../../definition/domain.js";
import type { ActorIdentity } from "./actor-directory.js";
import type { ContextNotification } from "../context/context-coordinator.js";
import { Defect, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { Machine } from "../../machine/machine.js";
import type { MachineAction, MachineDefinition } from "../../machine/grammar.js";
import type { ActorRef } from "../../public/types.js";
import type { ActorSnapshot } from "../runtime.js";
import type { EventTurnPlan } from "../turn-plan.js";
import type { OperationDeclaration } from "../../operation/operation.js";
import type { OperationKey } from "../../operation/key.js";
import type { EvidenceCredit } from "../evidence/evidence-journal.js";
import type { EvidenceProvenance } from "../evidence/evidence-record.js";
import type { makeRuntimeEvidencePolicy } from "../runtime-services.js";
import {
  invalidSnapshot,
  prepareActorSnapshot,
  preparePublishedSnapshot,
  type ActorPublication,
  type ActorSnapshotCopyPolicy,
} from "./actor-snapshot.js";
import type { ActorOperationReadCut, ActorOperationReaders } from "./actor-activities.js";
import type { OperationFact } from "./actor-operation-work.js";

export type StoreCut = {
  revision: number;
  changed: { descriptor: OperationDeclaration; key: OperationKey }[];
};

/** A store owner preflights its next revision and guarantees total commit once accepted. */
export interface ActorStorePermit<D extends MachineDefinition> {
  revision: number;
  readCut: ActorOperationReadCut<D>;
  commit(): StoreCut;
  cancel(): void;
}

export interface ActorStore<D extends MachineDefinition> {
  captureReadCut(): ActorOperationReadCut<D>;
  prepare(
    // oxlint-disable-next-line anti-slop/no-readonly -- A prepared store batch retains the exact authored actions until its total commit.
    actions: readonly MachineAction<D>[],
  ): Result.Result<ActorStorePermit<D>, PublicDiagnostic>;
  prepareProjection(fact: OperationFact<D>): Result.Result<ActorStorePermit<D>, PublicDiagnostic>;
}

/** Validate a prepared actor's identity, initial snapshot, and captured operation read cut. */
export const prepareInitialActorPublication = <D extends MachineDefinition>(input: {
  machine: Machine<D>;
  ref: ActorRef<Machine<D>>;
  identity: ActorIdentity;
  provenance: EvidenceProvenance;
  initial: ActorSnapshot<D>;
  machineTurnRevision: number;
  evidenceSequence: number;
  store: Option.Option<ActorStore<D>>;
  captureReaders(cut: ActorOperationReadCut<D>): ActorOperationReaders<D>;
  reject(reason: string): PublicDiagnostic;
}) => {
  if (
    !Object.is(input.identity.ref, input.ref) ||
    !Object.is(input.provenance.actor, input.identity)
  )
    return Result.fail(input.reject("identity"));

  if (!Number.isSafeInteger(input.machineTurnRevision) || input.machineTurnRevision < 0)
    return Result.fail(input.reject("machine-turn-revision"));

  const readers = Option.isSome(input.store)
    ? Result.succeed(input.captureReaders(input.store.value.captureReadCut()))
    : Result.try({
        try: () => input.initial.O,
        catch: () => invalidSnapshot("O", "reflection"),
      });

  if (Result.isFailure(readers)) return Result.fail(readers.failure);
  const initial = prepareActorSnapshot(input.machine, input.initial, readers.success);

  return Result.map(initial, ({ snapshot, copyPolicy }) => ({
    publication: {
      snapshot,
      machineTurnRevision: input.machineTurnRevision,
      evidenceSequence: input.evidenceSequence,
    } satisfies ActorPublication<D>,
    copyPolicy,
  }));
};

/** Build the complete event publication candidate before evidence or store mutation. */
export const prepareEventSnapshot = <D extends MachineDefinition>(
  publication: ActorPublication<D>,
  plan: Extract<EventTurnPlan<D>, { _tag: "planned" }>,
  observedStoreRevision: number,
  readers: ActorOperationReaders<D>,
  copyPolicy: ActorSnapshotCopyPolicy,
) => {
  const revision = checkedActorSuccessor(publication.snapshot.revision, "revision");

  const turnRevision = checkedActorSuccessor(
    publication.machineTurnRevision,
    "machineTurnRevision",
  );

  if (Result.isFailure(revision)) return Result.fail(revision.failure);

  if (Result.isFailure(turnRevision)) return Result.fail(turnRevision.failure);

  const candidate: ActorSnapshot<D> = {
    ...publication.snapshot,
    state: plan.candidate.state,
    memory: plan.candidate.memory,
    context: plan.candidate.context,
    O: readers,
    observedStoreRevision,
    revision: revision.success,
  };

  const owned = preparePublishedSnapshot(candidate, copyPolicy);

  return Result.isFailure(owned)
    ? Result.fail(owned.failure)
    : Result.succeed({ snapshot: owned.success, turnRevision: turnRevision.success });
};

/** Every actor-owned monotonic cursor rejects its last successor before mutation. */
export const checkedActorSuccessor = (value: number, part: string) =>
  Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER
    ? Result.succeed(value + 1)
    : Result.fail(invalidSnapshot(part, "overflow"));

// FLOW_STATE_ALLOW_UNKNOWN: JavaScript callbacks may throw any value; retain identity until ActorEngine classifies a Cause reason.
type ThrownValue = unknown;

type PermitRollbackPrimary =
  | { _tag: "Failure"; failure: PublicDiagnostic }
  | { _tag: "Defect"; defect: ThrownValue };

export type PermitRollbackFailure = {
  _tag: "PermitRollbackFailure";
  primary: PermitRollbackPrimary;
  cleanupFailures: ThrownValue[];
};

export const isPermitRollbackFailure = (failure: PublicDiagnostic | PermitRollbackFailure) =>
  failure._tag === "PermitRollbackFailure";

const makePermitRollbackFailure = (
  primary: PermitRollbackPrimary,
  cleanupFailures: ThrownValue[],
) => ({ _tag: "PermitRollbackFailure", primary, cleanupFailures }) satisfies PermitRollbackFailure;

const retainPermitRollbackFailure = (
  failure: PublicDiagnostic | PermitRollbackFailure,
  cleanupFailures: ThrownValue[],
) =>
  failure._tag === "PermitRollbackFailure"
    ? makePermitRollbackFailure(failure.primary, [...failure.cleanupFailures, ...cleanupFailures])
    : makePermitRollbackFailure({ _tag: "Failure", failure }, cleanupFailures);

/** A preflight owns only the permits it acquired, releasing them in reverse order on rejection. */
export const withPermitRollback = <
  Value,
  Error extends PublicDiagnostic | PermitRollbackFailure = PublicDiagnostic,
>(
  prepare: (register: (cancel: () => void) => void) => Result.Result<Value, Error>,
) => {
  const retainResult = (result: Result.Result<Value, Error | PermitRollbackFailure>) => result;
  const cancellations: (() => void)[] = [];

  const rollback = () => {
    const failures: ThrownValue[] = [];

    for (const cancel of cancellations.reverse()) {
      const cancelled = Result.try({ try: cancel, catch: (cause) => cause });

      if (Result.isFailure(cancelled)) failures.push(cancelled.failure);
    }

    return failures;
  };

  const prepared = Result.try({
    try: () =>
      prepare((cancel) => {
        cancellations.push(cancel);
      }),
    catch: Defect,
  });

  if (Result.isFailure(prepared)) {
    const cleanupFailures = rollback();

    if (cleanupFailures.length > 0) {
      // FLOW_STATE_ALLOW_UNKNOWN: The thrown primary stays verbatim until ActorEngine classifies it as an Effect defect.
      return retainResult(
        Result.fail(
          makePermitRollbackFailure(
            { _tag: "Defect", defect: prepared.failure.cause },
            cleanupFailures,
          ),
        ),
      );
    }

    throw prepared.failure.cause;
  }

  const outcome = prepared.success;

  if (Result.isFailure(outcome)) {
    const cleanupFailures = rollback();

    if (cleanupFailures.length > 0) {
      return retainResult(
        Result.fail(retainPermitRollbackFailure(outcome.failure, cleanupFailures)),
      );
    }
  }

  return retainResult(outcome);
};

/** Reserve every fallible event-cut dependency before the ActorEngine commits store or evidence. */
export const prepareEventCut = <D extends MachineDefinition>(input: {
  machine: Machine<D>;
  copyPolicy: ActorSnapshotCopyPolicy;
  publication: ActorPublication<D>;
  plan: Extract<EventTurnPlan<D>, { _tag: "planned" }>;
  event: EventOf<D>;
  store: Option.Option<ActorStore<D>>;
  credit: EvidenceCredit;
  identity: ActorIdentity;
  provenance: EvidenceProvenance;
  evidence: Pick<ReturnType<typeof makeRuntimeEvidencePolicy>, "prepareTurn">;
  captureReaders(readCut: ActorOperationReadCut<D>): ActorOperationReaders<D>;
  prepareNotification(
    snapshot: ActorSnapshot<D>,
  ): Result.Result<Option.Option<ContextNotification>, PublicDiagnostic>;
  cancelNotification(notification: Option.Option<ContextNotification>): void;
}) =>
  withPermitRollback((register) => {
    const actions = input.plan.actions.map(({ action }) => action);
    let preparedStore: Result.Result<Option.Option<ActorStorePermit<D>>, PublicDiagnostic>;

    if (actions.length === 0) preparedStore = Result.succeed(Option.none());
    else if (Option.isNone(input.store))
      preparedStore = Result.fail(invalidSnapshot("store", "missing"));
    else preparedStore = Result.map(input.store.value.prepare(actions), Option.some);

    if (Result.isFailure(preparedStore)) return Result.fail(preparedStore.failure);

    const storePermit = preparedStore.success;

    if (Option.isSome(storePermit)) register(() => storePermit.value.cancel());

    const storeRevision = Option.isSome(storePermit)
      ? storePermit.value.revision
      : input.publication.snapshot.observedStoreRevision;

    const readers = Option.isSome(storePermit)
      ? input.captureReaders(storePermit.value.readCut)
      : input.publication.snapshot.O;

    const owned = prepareEventSnapshot(
      input.publication,
      input.plan,
      storeRevision,
      readers,
      input.copyPolicy,
    );

    if (Result.isFailure(owned)) return Result.fail(owned.failure);

    const evidence = input.evidence.prepareTurn(input.credit, {
      _tag: "turn",
      cause: { kind: "event", event: input.event },
      fence: input.identity,
      provenance: input.provenance,
      timestamp: 0,
      publicationRevision: owned.success.snapshot.revision,
      machineTurnRevision: owned.success.turnRevision,
      before: input.publication.snapshot,
      after: owned.success.snapshot,
    });

    if (Result.isFailure(evidence)) return Result.fail(evidence.failure);
    register(() => evidence.success.cancel());

    const notification = input.prepareNotification(owned.success.snapshot);

    if (Result.isFailure(notification)) return Result.fail(notification.failure);

    if (Option.isSome(notification.success))
      register(() => input.cancelNotification(notification.success));

    return Result.succeed({
      owned: owned.success,
      storePermit,
      storeRevision,
      evidence: evidence.success,
      notification: notification.success,
    });
  });
