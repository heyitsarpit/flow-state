// STUB: Replaceable/deletable compile-surface guidance; this file is not shipped behavior.

import type { App } from "../app/app.js";
import type { Implementation } from "../implementation/implementation.js";
import type { MachineDefinition } from "../machine/grammar.js";
import type * as Admission from "./actor-admission.stub.js";
import type * as Engine from "./actor-engine.stub.js";
import type * as ContextWave from "./context-wave.stub.js";
import type * as Evidence from "./evidence.stub.js";
import type * as Lifecycle from "./lifecycle.stub.js";
import type * as Owner from "./runtime-owner.stub.js";
import type * as Services from "./runtime-services.stub.js";
import type * as Turn from "./turn-plan.stub.js";

/** Type-only aggregate proving exact app/input/definition/implementation relationships. */
export type RuntimeArchitectureStubSurface<
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
  CleanupError,
> = {
  readonly services: {
    readonly clockIdentity: Services.RuntimeClockIdentity;
    readonly clockService: Services.RuntimeClockService;
    readonly schedulerIdentity: Services.RuntimeSchedulerIdentity;
    readonly schedulerService: Services.RuntimeSchedulerService;
    readonly schedulerError: Services.RuntimeSchedulerError;
    readonly workRequest: Services.RuntimeWorkRequest<void, CleanupError>;
    readonly running: Services.RuntimeRunningFiber<void, CleanupError>;
    readonly evidenceIdentity: Services.RuntimeEvidenceIdentity;
    readonly evidenceService: Services.RuntimeEvidenceService<A, DefinitionValue, CleanupError>;
    readonly error: Services.RuntimeServiceError;
    readonly clock: typeof Services.RuntimeClock;
    readonly scheduler: typeof Services.RuntimeScheduler;
    readonly evidence: typeof Services.RuntimeEvidence;
    readonly context: Services.RuntimeServiceContext;
    readonly layer: Services.RuntimeServicesLayer;
    readonly makeLayer: typeof Services.makeRuntimeServicesLayer;
  };
  readonly owner: {
    readonly input: Owner.RuntimeOwnerInput<A, I>;
    readonly owner: Owner.RuntimeOwner<A, I>;
    readonly construct: typeof Owner.constructRuntimeOwner;
  };
  readonly admission: {
    readonly key: Admission.ActorKey;
    readonly incarnation: Admission.ActorIncarnation;
    readonly occurrence: Admission.OperationOccurrence;
    readonly occurrenceFence: Admission.OperationOccurrenceFence<DefinitionValue>;
    readonly fence: Admission.ActorFence;
    readonly contextValue: Admission.ActorContextValue<DefinitionValue>;
    readonly binding: Admission.ActorContextBinding<DefinitionValue>;
    readonly edge: Admission.ActorDependencyEdge;
    readonly identity: Admission.ActorIdentity<DefinitionValue>;
    readonly tombstone: Admission.ActorTombstone;
    readonly input: Admission.ActorAdmissionInput<A, Input, DefinitionValue, I>;
    readonly rollbackStep: Admission.AdmissionRollbackStep<CleanupError>;
    readonly error: Admission.ActorAdmissionError<CleanupError>;
    readonly disposalError: Admission.ActorDisposalError<CleanupError>;
    readonly validated: Admission.ValidatedActorAdmission<A, Input, DefinitionValue, I>;
    readonly reservation: Admission.ActorAdmissionReservation<
      A,
      Input,
      DefinitionValue,
      I,
      CleanupError
    >;
    readonly prepared: Admission.PreparedActorAdmission<A, Input, DefinitionValue, I, CleanupError>;
    readonly attached: Admission.AttachedActorAdmission<A, Input, DefinitionValue, I, CleanupError>;
    readonly activated: Admission.ActivatedActorAdmission<
      A,
      Input,
      DefinitionValue,
      I,
      CleanupError
    >;
    readonly lease: Admission.ActorLease<A, Input, DefinitionValue, I, CleanupError>;
    readonly exposed: Admission.ExposedActorAdmission<A, Input, DefinitionValue, I, CleanupError>;
    readonly stage: Admission.ActorAdmissionStage<A, Input, DefinitionValue, I, CleanupError>;
    readonly authority: Admission.ActorAdmissionAuthority<
      A,
      Input,
      DefinitionValue,
      I,
      CleanupError
    >;
    readonly validate: typeof Admission.validateActorAdmission;
    readonly admit: typeof Admission.admitActor;
  };
  readonly engine: {
    readonly command: Engine.ActorCommand<DefinitionValue>;
    readonly outcome: Engine.FiniteOperationOutcome<unknown, CleanupError>;
    readonly completion: Engine.OperationCompletionFact<DefinitionValue>;
    readonly fact: Engine.ActorMailboxFact<DefinitionValue>;
    readonly error: Engine.ActorMailboxError;
    readonly operation: Engine.OperationProjection;
    readonly timer: Engine.TimerProjection;
    readonly snapshot: Engine.ActorSnapshot<DefinitionValue>;
    readonly receipt: Engine.DispatchReceipt;
    readonly dispatchError: Engine.DispatchError;
    readonly acknowledged: Engine.AcknowledgedDispatch;
    readonly input: Engine.ActorEngineInput<DefinitionValue>;
    readonly engine: Engine.ActorEngine<DefinitionValue>;
    readonly handle: Engine.ActorHandle<DefinitionValue>;
    readonly create: typeof Engine.createActorEngine;
    readonly makeHandle: typeof Engine.actorHandle;
  };
  readonly turn: {
    readonly event: Turn.ActorEvent<DefinitionValue>;
    readonly projectionFact: Turn.ProjectionFact<DefinitionValue>;
    readonly cause: Turn.TurnCause<DefinitionValue>;
    readonly input: Turn.TurnInput<DefinitionValue>;
    readonly eventInput: Turn.EventTurnInput<DefinitionValue>;
    readonly projectionInput: Turn.ProjectionTurnInput<DefinitionValue>;
    readonly action: Turn.FiniteActionIntent<DefinitionValue>;
    readonly activity: Turn.ActivityIntent<DefinitionValue>;
    readonly store: Turn.StoreChange;
    readonly mapped: Turn.MappedEvent;
    readonly eventPlan: Turn.EventTurnPlan<DefinitionValue>;
    readonly projectionPlan: Turn.ProjectionTurnPlan<DefinitionValue>;
    readonly plan: Turn.TurnPlan<DefinitionValue>;
    readonly noop: Turn.NoopTurnPlan<DefinitionValue>;
    readonly commit: Turn.CommitPlan<A, DefinitionValue, CleanupError>;
    readonly validated: Turn.ValidatedCommitPlan<A, DefinitionValue, CleanupError>;
    readonly committed: Turn.CommittedTurn<A, DefinitionValue, CleanupError>;
    readonly published: Turn.PublishedTurn<A, DefinitionValue, CleanupError>;
    readonly accepted: Turn.AcceptedTurn<A, DefinitionValue, CleanupError>;
    readonly planError: Turn.TurnPlanError;
    readonly executionError: Turn.TurnExecutionError;
    readonly planTurn: typeof Turn.planTurn;
    readonly complete: typeof Turn.completeCommitPlan;
    readonly validate: typeof Turn.validateCommitPlan;
    readonly commitTurn: typeof Turn.commitTurn;
    readonly publish: typeof Turn.publishTurn;
    readonly accept: typeof Turn.acceptTurnEvidence;
    readonly acknowledge: typeof Turn.acknowledgeTurn;
    readonly reconcile: typeof Turn.reconcileTurn;
  };
  readonly context: {
    readonly binding: ContextWave.ContextBinding<DefinitionValue>;
    readonly provider: ContextWave.ContextProviderNode<DefinitionValue>;
    readonly graph: ContextWave.ContextGraph<DefinitionValue>;
    readonly revisions: ContextWave.ProviderRevisionVector;
    readonly graphError: ContextWave.ContextGraphError;
    readonly selection: ContextWave.ContextSelection<DefinitionValue>;
    readonly defect: ContextWave.ContextSelectorDefect<DefinitionValue>;
    readonly ledgerEntry: ContextWave.ContextSelectionLedgerEntry<DefinitionValue>;
    readonly ledger: ContextWave.ContextSelectionLedger<DefinitionValue>;
    readonly projection: ContextWave.ContextProjection<DefinitionValue>;
    readonly wave: ContextWave.ContextWave;
    readonly result: ContextWave.ContextWaveResult<DefinitionValue>;
    readonly build: typeof ContextWave.buildContextGraph;
    readonly cycles: typeof ContextWave.detectContextCycles;
    readonly order: typeof ContextWave.topologicalContextOrder;
    readonly equal: typeof ContextWave.equalContextSelection;
    readonly select: typeof ContextWave.selectContext;
    readonly plan: typeof ContextWave.planContextWave;
    readonly apply: typeof ContextWave.applyContextWave;
  };
  readonly lifecycle: {
    readonly state: Lifecycle.ActorLifecycle;
    readonly cause: Lifecycle.LifecycleCause<CleanupError>;
    readonly command: Lifecycle.LifecycleCommand<CleanupError>;
    readonly resource: Lifecycle.LifecycleResource<CleanupError>;
    readonly work: Lifecycle.LifecycleWork<CleanupError>;
    readonly operation: Lifecycle.LifecycleOperationRecord<DefinitionValue, CleanupError>;
    readonly timer: Lifecycle.LifecycleTimer;
    readonly blocked: Lifecycle.BlockedDisposal<DefinitionValue>;
    readonly attachment: Lifecycle.LifecycleAttachment<DefinitionValue, CleanupError>;
    readonly snapshot: Lifecycle.LifecycleSnapshot<DefinitionValue, CleanupError>;
    readonly error: Lifecycle.LifecycleError<DefinitionValue, CleanupError>;
    readonly transition: Lifecycle.LifecycleTransition<CleanupError>;
    readonly move: typeof Lifecycle.transitionLifecycle;
    readonly prepare: typeof Lifecycle.prepareLifecycle;
    readonly activate: typeof Lifecycle.activateLifecycle;
    readonly suspend: typeof Lifecycle.suspendLifecycle;
    readonly resume: typeof Lifecycle.resumeLifecycle;
    readonly dispose: typeof Lifecycle.disposeLifecycle;
    readonly run: typeof Lifecycle.runLifecycleCommand;
  };
  readonly evidence: {
    readonly sequence: Evidence.EvidenceSequence;
    readonly sinkId: Evidence.SinkId;
    readonly reservation: Evidence.EvidenceReservation<A, DefinitionValue, CleanupError>;
    readonly provenance: Evidence.RuntimeProvenance<A, DefinitionValue>;
    readonly turnFact: Evidence.TurnFact<A, DefinitionValue>;
    readonly turn: Evidence.TurnRecord<A, DefinitionValue>;
    readonly lifecycleFact: Evidence.LifecycleFact<A, DefinitionValue, CleanupError>;
    readonly lifecycle: Evidence.LifecycleRecord<A, DefinitionValue, CleanupError>;
    readonly record: Evidence.EvidenceRecord<A, DefinitionValue, CleanupError>;
    readonly sink: Evidence.EvidenceSink<A, DefinitionValue, CleanupError>;
    readonly offer: Evidence.SinkOfferResult;
    readonly drainResult: Evidence.SinkDrainResult;
    readonly sinkError: Evidence.SinkError;
    readonly acceptance: Evidence.EvidenceAcceptance<A, DefinitionValue, CleanupError>;
    readonly drain: Evidence.EvidenceDrain;
    readonly error: Evidence.EvidenceError;
    readonly makeTurn: typeof Evidence.makeTurnRecord;
    readonly makeLifecycle: typeof Evidence.makeLifecycleRecord;
    readonly accept: typeof Evidence.acceptEvidence;
    readonly drainAccepted: typeof Evidence.drainAcceptedEvidence;
    readonly close: typeof Evidence.closeEvidence;
    readonly hub: Evidence.EvidenceHub<A, DefinitionValue, CleanupError>;
    readonly makeHub: typeof Evidence.makeEvidenceHub;
  };
};
