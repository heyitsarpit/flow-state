import { Cause, Clock, Deferred, Effect, FiberMap, Option, Result, Scope } from "effect";

import type { EventOf } from "../../definition/domain.js";
import type { PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { MachineDefinition } from "../../machine/grammar.js";
import type { ActorSnapshot } from "../runtime.js";
import type { ContextTicketOutcome } from "../context/context-participant.js";
import type { ContextTicket } from "../context/context-ticket.js";
import { makeActorActivities } from "./actor-activities.js";
import {
  cancelPreparedLifecycleCut,
  failActorPreparation,
  makeActorEngineLifecycle,
} from "./actor-engine-lifecycle.js";
import {
  makeActorOperationCut,
  type OperationLaunch,
  type OperationStop,
} from "./actor-operation-cut.js";
import {
  finishEventOperationWork,
  startOperationLaunches,
  type OperationFact,
} from "./actor-operation-work.js";
import {
  actorFailure,
  makeActorEventFacade,
  makeActorMailbox,
  type ActorCommand,
  type ActorCommandOutcome,
} from "./actor-mailbox.js";
import {
  makeActorContextAdmission,
  routeContextTicket,
  type ContextCursor,
} from "./actor-context-work.js";
import { makeActorContextNotifications, makeActorObservation } from "./actor-observation.js";
import {
  isPermitRollbackFailure,
  prepareInitialActorPublication,
  type StoreCut,
} from "./actor-state.js";
import {
  admitLifecycleCommand,
  isActorInactive,
  makeActorShutdown,
  runPreparedLifecycleWork,
  settleCommittedLifecycle,
  type LifecycleCommand,
} from "./lifecycle.js";
import {
  prepareActorLifecycleWork,
  reconcileLifecycleWork,
  startCommittedTimerWork,
  type LiveLifecycleWork,
} from "./lifecycle-work.js";
import type { EventTurnPlan } from "../turn-plan.js";
import type { ActorEngine, ActorEngineInput, PreparedActorEngine } from "./actor-engine-types.js";

export type { ActorEngine, ActorEngineInput, PreparedActorEngine } from "./actor-engine-types.js";

import { makeActorTurnRunner, prepareIssueCut } from "./actor-turn-work.js";
import type { ActorPublication } from "./actor-snapshot.js";

type ActorMailbox<D extends MachineDefinition> = Effect.Success<
  ReturnType<typeof makeActorMailbox<ActorCommand<D>, ActorCommandOutcome<D>>>
>;

/** Preparation owns its snapshot and mailbox but starts no user work. */
export const prepareActorEngine = <D extends MachineDefinition>(input: ActorEngineInput<D>) =>
  Effect.gen(function* () {
    const activities = makeActorActivities(input.machine);

    const initial = prepareInitialActorPublication({
      machine: input.machine,
      ref: input.ref,
      identity: input.identity,
      provenance: input.provenance,
      initial: input.initial,
      machineTurnRevision: input.initialMachineTurnRevision,
      evidenceSequence: input.journal.sequence(),
      store: input.store,
      captureReaders: (cut) => activities.captureReaders(cut),
      reject: actorFailure,
    });

    if (Result.isFailure(initial)) return yield* failActorPreparation(initial.failure);
    const copyPolicy = initial.success.copyPolicy;
    let publication: ActorPublication<D> = initial.success.publication;

    const lifecycle = makeActorEngineLifecycle<D>();

    let detachedWork = input.work;
    let liveWork: Option.Option<LiveLifecycleWork> = Option.none();
    let cleanupFailure: Option.Option<Cause.Cause<PublicDiagnostic>> = Option.none();
    // oxlint-disable-next-line anti-slop/no-readonly -- Each context publication replaces this cursor cut; readers never mutate it.
    let contextCursors: ReadonlyMap<string, ContextCursor> = new Map();

    const clock = yield* Clock.Clock;
    const ownerScope = yield* Scope.Scope;

    const operationFibers = yield* FiberMap.make<string, void>();

    const observation = makeActorObservation(() => publication.snapshot, {
      onSnapshot: input.onSnapshot,
      onObserverIssue: input.onObserverIssue,
    });

    const pendingLaunches: OperationLaunch<D>[] = [];
    const pendingStops: OperationStop<D>[] = [];
    const pendingGates: Deferred.Deferred<void>[] = [];

    const afterAcknowledgement = () => {
      for (const gate of pendingGates.splice(0)) Deferred.doneUnsafe(gate, Effect.void);
      observation.afterAcknowledgement();
    };

    const publish = (snapshot: ActorSnapshot<D>, machineTurnRevision: number, sequence: number) => {
      publication = { snapshot, machineTurnRevision, evidenceSequence: sequence };
      observation.stage(snapshot);
    };

    const notifications = makeActorContextNotifications<D>(input.identity, input.context);

    const operationCut = makeActorOperationCut({
      machine: input.machine,
      copyPolicy,
      store: input.store,
      credit: input.credit,
      identity: input.identity,
      provenance: input.provenance,
      evidence: input.evidence,
      captureReaders: (cut) => activities.captureReaders(cut),
      prepareNotification: notifications.prepare,
      hasRunner: Option.isSome(input.operationRunner),
      resolveDescriptor: (id) => activities.resolveDescriptor(id),
      prepareOccurrence: (descriptor, key, activitySlot) =>
        activities.prepareOccurrence(descriptor, key, activitySlot),
      cancelNotification: (notification) => notifications.cancel(notification),
    });

    const eventCut = (event: EventOf<D>, planned: EventTurnPlan<D>) => {
      if (publication.snapshot.lifecycle !== "active") return Result.fail(actorFailure("inactive"));

      const before = publication.snapshot;

      if (planned._tag === "noop")
        return Result.succeed({
          publicationRevision: before.revision,
          evidenceSequence: publication.evidenceSequence,
        });

      const prepared = operationCut.prepareEvent(publication, planned, event);

      if (Result.isFailure(prepared)) return Result.fail(prepared.failure);

      const { owned, storePermit, storeRevision, evidence, notification, work } = prepared.success;

      const store: StoreCut = Option.isSome(storePermit)
        ? storePermit.value.commit()
        : { revision: storeRevision, changed: [] };

      const accepted = evidence.accept(store);

      for (const stop of work.stops)
        activities.evict(stop.descriptor, stop.key, Option.some(stop.activitySlot));

      for (const launch of work.launches) launch.permit.commit();
      publish(owned.snapshot, owned.turnRevision, accepted.sequence);
      notifications.publish(notification);
      pendingLaunches.push(...work.launches);
      pendingStops.push(...work.stops);

      return Result.succeed({
        publicationRevision: owned.snapshot.revision,
        evidenceSequence: accepted.sequence,
      });
    };

    const runEvent = makeActorTurnRunner({
      machine: input.machine,
      copyPolicy,
      current: () => publication,
      commitEvent: eventCut,
      commitIssue: (event, failure) => {
        const issue = prepareIssueCut({
          machine: input.machine,
          copyPolicy,
          publication,
          event,
          failure,
          credit: input.credit,
          identity: input.identity,
          provenance: input.provenance,
          evidence: input.evidence,
          prepareNotification: notifications.prepare,
          cancelNotification: notifications.cancel,
        });

        if (Result.isFailure(issue)) return Result.fail(issue.failure);

        const accepted = issue.success.evidence.accept({
          revision: publication.snapshot.observedStoreRevision,
          changed: [],
        });

        publish(issue.success.snapshot, publication.machineTurnRevision, accepted.sequence);
        notifications.publish(issue.success.notification);

        return Result.succeed(undefined);
      },
      afterEvent: () =>
        Effect.gen(function* () {
          if (Option.isNone(input.operationRunner)) return;

          const gates = yield* finishEventOperationWork({
            fibers: operationFibers,
            runner: input.operationRunner.value,
            launches: pendingLaunches.splice(0),
            stops: pendingStops.splice(0),
            isLive: (occurrence) => activities.isLive(occurrence),
            offer: (fact) => mailbox.admitInternal({ kind: "operation", fact }),
          });

          pendingGates.push(...gates);
        }),
    });

    const applyLifecycleWork = (command: LifecycleCommand) =>
      Effect.gen(function* () {
        const next = yield* prepareActorLifecycleWork({
          command,
          fibers: operationFibers,
          clearActivities: () => activities.clear(),
          reconcile: reconcileLifecycleWork(
            command,
            detachedWork,
            liveWork,
            input.validateProviders,
            clock,
            ownerScope,
          ),
        });

        detachedWork = next.detached;
        liveWork = next.live;
        cleanupFailure = next.cause;
      });

    const runLifecycle = (command: LifecycleCommand) => {
      const cleanupReasons: Cause.Reason<PublicDiagnostic>[] = [];

      return runPreparedLifecycleWork({
        prepare: () =>
          operationCut.prepareLifecycle(publication, command, Option.isNone(cleanupFailure)),
        work: applyLifecycleWork(command),
        cancel: (prepared) =>
          cleanupReasons.push(
            ...cancelPreparedLifecycleCut(
              prepared.work.launches,
              () => notifications.cancel(prepared.lifecycle.notification),
              () => prepared.lifecycle.evidence.cancel(),
            ),
          ),
        commit: (prepared) =>
          Effect.gen(function* () {
            const accepted = prepared.lifecycle.evidence.accept();

            for (const launch of prepared.work.launches) launch.permit.commit();
            publish(
              prepared.lifecycle.snapshot,
              publication.machineTurnRevision,
              accepted.sequence,
            );
            notifications.publish(prepared.lifecycle.notification);
            startCommittedTimerWork(liveWork);

            if (Option.isSome(input.operationRunner)) {
              const gates = yield* startOperationLaunches({
                fibers: operationFibers,
                runner: input.operationRunner.value,
                launches: prepared.work.launches,
                offer: (fact) => mailbox.admitInternal({ kind: "operation", fact }),
              });

              pendingGates.push(...gates);
            }

            if (command.to === "disposed") input.credit.release();

            return {
              publicationRevision: prepared.lifecycle.snapshot.revision,
              evidenceSequence: accepted.sequence,
            };
          }),
      }).pipe(
        Effect.catchCause((cause) =>
          cleanupReasons.length === 0
            ? Effect.failCause(cause)
            : Effect.failCause(Cause.fromReasons([...cause.reasons, ...cleanupReasons])),
        ),
        Effect.flatMap((receipt) => settleCommittedLifecycle(receipt, command, cleanupFailure)),
        Effect.catchIf(isPermitRollbackFailure, failActorPreparation),
      );
    };

    const applyContextTicket = (ticket: ContextTicket<D>, initial: boolean) =>
      routeContextTicket({
        machine: input.machine,
        copyPolicy,
        before: publication.snapshot,
        identity: input.identity,
        ticket,
        initial,
        cursors: contextCursors,
        prepareNotification: notifications.prepare,
        commitInitial: (snapshot) => {
          publication = { ...publication, snapshot };
          observation.publish(snapshot);
        },
        commitActive: (snapshot, notification) => {
          publish(snapshot, publication.machineTurnRevision, publication.evidenceSequence);
          notifications.publish(notification);
        },
        installCursors: (cursors) => {
          contextCursors = cursors;
        },
      });

    const applyOperationFact = (fact: OperationFact<D>) => {
      if (publication.snapshot.lifecycle !== "active" || !activities.isLive(fact.occurrence))
        return Result.succeed(undefined);

      const prepared = operationCut.prepareFact(publication, fact);

      if (Result.isFailure(prepared)) return Result.fail(prepared.failure);

      if (fact._tag !== "value") activities.settle(fact.occurrence);
      prepared.success.permit.commit();
      publish(
        prepared.success.snapshot,
        publication.machineTurnRevision,
        publication.evidenceSequence,
      );
      notifications.publish(prepared.success.notification);

      return Result.succeed(undefined);
    };

    const mailbox: ActorMailbox<D> = yield* makeActorMailbox<
      ActorCommand<D>,
      ActorCommandOutcome<D>
    >({
      run: (command) => {
        if (command.kind === "event")
          return runEvent(command.event).pipe(
            Effect.catchIf(isPermitRollbackFailure, failActorPreparation),
            Effect.map(
              (receipt) => ({ kind: "receipt", receipt }) satisfies ActorCommandOutcome<D>,
            ),
          );

        if (command.kind === "lifecycle")
          return runLifecycle(command.command).pipe(
            Effect.map(
              (receipt) => ({ kind: "receipt", receipt }) satisfies ActorCommandOutcome<D>,
            ),
          );

        if (command.kind === "operation")
          return Effect.sync(() => applyOperationFact(command.fact)).pipe(
            Effect.flatMap(Effect.fromResult),
            Effect.catchIf(isPermitRollbackFailure, failActorPreparation),
            Effect.map(() => ({ kind: "operation" }) satisfies ActorCommandOutcome<D>),
          );

        return Effect.sync(() =>
          command.isCancelled()
            ? Result.succeed<ContextTicketOutcome<D>>({
                status: "stale",
                snapshot: publication.snapshot,
              })
            : applyContextTicket(command.ticket, false),
        ).pipe(
          Effect.flatMap(Effect.fromResult),
          Effect.map((outcome) => ({ kind: "context", outcome }) satisfies ActorCommandOutcome<D>),
        );
      },
      afterAcknowledgement,
      onInternalFailure: (command) => {
        if (command.kind === "operation") activities.settle(command.fact.occurrence);
      },
    });

    const { send, dispatch } = makeActorEventFacade({
      machine: input.machine,
      mailbox,
      isInactive: () => isActorInactive(publication.snapshot.lifecycle),
    });

    const transitionLifecycle = (command: LifecycleCommand) =>
      admitLifecycleCommand({
        command,
        admit: (issued) => mailbox.admit({ kind: "lifecycle", command: issued }, true),
      });

    const offerOperationFact = (fact: OperationFact<D>) =>
      Result.map(mailbox.admit({ kind: "operation", fact }, false), (acknowledgement) =>
        Deferred.await(acknowledgement).pipe(Effect.asVoid),
      );

    const offerContext = makeActorContextAdmission<D>({
      phase: () => (mailbox.isSealed() ? "abandoned" : lifecycle.phase()),
      applyInitial: (issued) => applyContextTicket(issued, true),
      admit: (issued, isCancelled) =>
        mailbox.admit({ kind: "context", ticket: issued, isCancelled }, false),
    });

    const shutdown = makeActorShutdown({
      seal: mailbox.seal,
      unseal: mailbox.unseal,
      startWorker: (work) =>
        Effect.forkIn(work, ownerScope, { startImmediately: true }).pipe(Effect.asVoid),
      awaitActivation: lifecycle.awaitActivation,
      phase: lifecycle.phase,
      drain: mailbox.drain,
      lifecycle: () => publication.snapshot.lifecycle,
      retire: lifecycle.retire,
      admitTerminal: (command) => mailbox.admitTerminal({ kind: "lifecycle", command }),
      close: () => mailbox.close(),
      complete: () => observation.complete(),
      release: () => input.credit.release(),
    });

    const engine: ActorEngine<D> = {
      ref: input.ref,
      snapshots: observation.stream,
      send,
      dispatch,
      snapshot: () => publication.snapshot,
      flush: mailbox.flush,
      transitionLifecycle,
      offerOperationFact,
      offerContext,
      shutdown,
    };

    const prepared: PreparedActorEngine<D> = {
      ...engine,
      activate: () =>
        lifecycle.activate(engine, {
          restored: input.restored,
          ownerScope,
          runLifecycle,
          activateMailbox: mailbox.activate,
          afterAcknowledgement,
          rejectAbandoned: () => actorFailure("abandoned"),
        }),
      abandon: () =>
        lifecycle.abandon({
          shutdown,
          closeMailbox: mailbox.close,
          completeObservation: () => observation.complete(),
          releaseCredit: () => input.credit.release(),
        }),
    };

    return prepared;
  });
