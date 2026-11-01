import type { Effect, Option, Result } from "effect";

import type { PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { Machine } from "../../machine/machine.js";
import type { MachineDefinition } from "../../machine/grammar.js";
import type { ActorRef } from "../../public/types.js";
import type { ActorHandle, ActorSnapshot } from "../runtime.js";
import type { makeRuntimeEvidencePolicy } from "../runtime-services.js";
import type { ContextCoordinator } from "../context/context-coordinator.js";
import type { ContextProjectionTicket } from "../context/context-participant.js";
import type { ContextTicket } from "../context/context-ticket.js";
import type { EvidenceCredit, EvidenceJournal } from "../evidence/evidence-journal.js";
import type { EvidenceProvenance } from "../evidence/evidence-record.js";
import type { ActorIdentity } from "./actor-directory.js";
import type { ActorOperationRunner, OperationFact } from "./actor-operation-work.js";
import type { ActorStore } from "./actor-state.js";
import type { DetachedLifecycleWork } from "./lifecycle-work.js";
import type { LifecycleCommand } from "./lifecycle.js";

type EvidencePolicy = {
  prepareTurn: ReturnType<typeof makeRuntimeEvidencePolicy>["prepareTurn"];
  prepareLifecycle: ReturnType<typeof makeRuntimeEvidencePolicy>["prepareLifecycle"];
};

export type ActorEngineInput<D extends MachineDefinition> = {
  machine: Machine<D>;
  ref: ActorRef<Machine<D>>;
  identity: ActorIdentity;
  initial: ActorSnapshot<D>;
  initialMachineTurnRevision: number;
  restored: boolean;
  journal: EvidenceJournal;
  credit: EvidenceCredit;
  provenance: EvidenceProvenance;
  evidence: EvidencePolicy;
  store: Option.Option<ActorStore<D>>;
  operationRunner: Option.Option<ActorOperationRunner<D>>;
  context: Option.Option<ContextCoordinator>;
  onSnapshot: Option.Option<(snapshot: ActorSnapshot<D>) => void>;
  onObserverIssue: Option.Option<(issue: PublicDiagnostic) => void>;
  work: DetachedLifecycleWork;
  validateProviders: Effect.Effect<void, PublicDiagnostic>;
};

export interface ActorEngine<D extends MachineDefinition> extends ActorHandle<D> {
  transitionLifecycle(command: LifecycleCommand): Effect.Effect<void, PublicDiagnostic>;
  offerOperationFact(
    fact: OperationFact<D>,
  ): Result.Result<Effect.Effect<void, PublicDiagnostic>, PublicDiagnostic>;
  offerContext(
    ticket: ContextTicket<D>,
  ): Result.Result<ContextProjectionTicket<D>, PublicDiagnostic>;
  shutdown(): Effect.Effect<void, PublicDiagnostic>;
}

export interface PreparedActorEngine<D extends MachineDefinition> extends ActorEngine<D> {
  activate(): Effect.Effect<ActorEngine<D>, PublicDiagnostic>;
  abandon(): Effect.Effect<void, PublicDiagnostic>;
}
