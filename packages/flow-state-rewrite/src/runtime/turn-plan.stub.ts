// STUB: Replaceable/deletable implementation guidance; this file is not shipped behavior.

import type { Effect, Option, Result } from "effect";

import type { App } from "../app/app.js";
import type { PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type {
  EventName,
  EventValue,
  MachineAction,
  MachineActivityPlan,
  MachineDefinition,
} from "../machine/grammar.js";
import type { ActorCommand, ActorSnapshot, OperationCompletionFact } from "./actor-engine.stub.js";
import type { ActorFence } from "./actor-admission.stub.js";
import type { EvidenceRecord } from "./evidence.stub.js";

/** A typed event value is ordinary data consumed by the event route only. */
export type ActorEvent<DefinitionValue extends MachineDefinition> = {
  readonly name: EventName<DefinitionValue>;
  readonly value: EventValue<DefinitionValue, EventName<DefinitionValue>>;
};

/** Projection facts never fabricate an event or request event-machine evaluation. */
export type ProjectionFact<DefinitionValue extends MachineDefinition> =
  | { readonly _tag: "timer-projection"; readonly name: string; readonly dueAt: number }
  | {
      readonly _tag: "completion-projection";
      readonly fact: OperationCompletionFact<DefinitionValue>;
    }
  | { readonly _tag: "stream-projection"; readonly descriptor: string; readonly value: unknown }
  | { readonly _tag: "context-projection"; readonly providerRevision: number }
  | { readonly _tag: "store-projection"; readonly revision: number }
  | { readonly _tag: "lifecycle-projection"; readonly lifecycle: string };

/** Causes distinguish event turns from passive projection publication. */
export type TurnCause<DefinitionValue extends MachineDefinition> =
  | { readonly _tag: "event"; readonly command: ActorCommand<DefinitionValue> }
  | { readonly _tag: "projection"; readonly fact: ProjectionFact<DefinitionValue> };

/** Event input admits a command; projection input carries only passive external facts. */
export type EventTurnInput<DefinitionValue extends MachineDefinition> = {
  readonly _tag: "event";
  readonly snapshot: ActorSnapshot<DefinitionValue>;
  readonly event: ActorEvent<DefinitionValue>;
  readonly fence: ActorFence;
};

export type ProjectionTurnInput<DefinitionValue extends MachineDefinition> = {
  readonly _tag: "projection";
  readonly snapshot: ActorSnapshot<DefinitionValue>;
  readonly fact: ProjectionFact<DefinitionValue>;
  readonly fence: ActorFence;
};

export type TurnInput<DefinitionValue extends MachineDefinition> =
  | EventTurnInput<DefinitionValue>
  | ProjectionTurnInput<DefinitionValue>;

/** Finite action intents are materialized only by the event route. */
export type FiniteActionIntent<DefinitionValue extends MachineDefinition> = {
  readonly ordinal: number;
  readonly action: MachineAction<DefinitionValue>;
};

/** Continuing work is compared by declaration slot and retained generation. */
export type ActivityIntent<DefinitionValue extends MachineDefinition> = {
  readonly slot: string;
  readonly desired: Option.Option<MachineActivityPlan<DefinitionValue>>;
  readonly generation: number;
};

/** Canonical store changes remain staged plain data until the serialized commit. */
export type StoreChange =
  | { readonly _tag: "invalidate"; readonly descriptor: string; readonly key: string }
  | { readonly _tag: "clear"; readonly descriptor: string; readonly key: string }
  | {
      readonly _tag: "write";
      readonly descriptor: string;
      readonly key: string;
      readonly value: unknown;
    };

/** Mapped outcomes become later ordinary mailbox turns, never hidden plan effects. */
export type MappedEvent = {
  readonly name: string;
  readonly value: unknown;
};

/** The event route contains machine actions; projection routes contain no action fields. */
export type EventTurnPlan<DefinitionValue extends MachineDefinition> = {
  readonly _tag: "event-plan";
  readonly cause: Extract<TurnCause<DefinitionValue>, { readonly _tag: "event" }>;
  readonly fence: ActorFence;
  readonly before: ActorSnapshot<DefinitionValue>;
  readonly candidate: ActorSnapshot<DefinitionValue>;
  readonly actions: readonly FiniteActionIntent<DefinitionValue>[];
  readonly activities: readonly ActivityIntent<DefinitionValue>[];
  readonly storeChanges: readonly StoreChange[];
  readonly mappedEvents: readonly MappedEvent[];
  readonly issues: readonly PublicDiagnostic[];
};

/** Projection publication retains a snapshot cut without transition/action evaluation fields. */
export type ProjectionTurnPlan<DefinitionValue extends MachineDefinition> = {
  readonly _tag: "projection-plan";
  readonly cause: Extract<TurnCause<DefinitionValue>, { readonly _tag: "projection" }>;
  readonly fence: ActorFence;
  readonly before: ActorSnapshot<DefinitionValue>;
  readonly candidate: ActorSnapshot<DefinitionValue>;
  readonly issues: readonly PublicDiagnostic[];
};

export type TurnPlan<DefinitionValue extends MachineDefinition> =
  | EventTurnPlan<DefinitionValue>
  | ProjectionTurnPlan<DefinitionValue>;

/** A no-op carries only its cause and snapshot; it never requires a fabricated event. */
export type NoopTurnPlan<DefinitionValue extends MachineDefinition> = {
  readonly _tag: "noop";
  readonly fence: ActorFence;
  readonly before: ActorSnapshot<DefinitionValue>;
  readonly cause: TurnCause<DefinitionValue>;
};

/** One commit plan contains every staged actor and store change before validation. */
export type CommitPlan<A extends App, DefinitionValue extends MachineDefinition, CleanupError> = {
  readonly _tag: "commit-plan";
  readonly plan: TurnPlan<DefinitionValue>;
  readonly publication: {
    readonly publicationRevision: number;
    readonly machineTurnRevision: number;
    readonly storeRevision: number;
  };
  readonly evidence: EvidenceRecord<A, DefinitionValue, CleanupError>;
  readonly acknowledge: { readonly sequence: number };
  readonly reconcile: readonly ActivityIntent<DefinitionValue>[];
};

export type ValidatedCommitPlan<
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
> = {
  readonly _tag: "validated-commit-plan";
  readonly commit: CommitPlan<A, DefinitionValue, CleanupError>;
};

export type CommittedTurn<
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
> = {
  readonly _tag: "committed-turn";
  readonly plan: ValidatedCommitPlan<A, DefinitionValue, CleanupError>;
  readonly record: EvidenceRecord<A, DefinitionValue, CleanupError>;
};

export type PublishedTurn<
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
> = {
  readonly _tag: "published-turn";
  readonly committed: CommittedTurn<A, DefinitionValue, CleanupError>;
  readonly snapshot: ActorSnapshot<DefinitionValue>;
};

export type AcceptedTurn<A extends App, DefinitionValue extends MachineDefinition, CleanupError> = {
  readonly _tag: "accepted-turn";
  readonly published: PublishedTurn<A, DefinitionValue, CleanupError>;
  readonly evidenceSequence: number;
};

/** Pure planner failures discard the whole candidate. */
export type TurnPlanError = {
  readonly _tag: "TurnPlanError";
  readonly reason: "guard-defect" | "redirect-defect" | "invalid-action" | "candidate-defect";
  readonly diagnostics: readonly PublicDiagnostic[];
};

/** Serialized commit failures retain a typed error boundary. */
export type TurnExecutionError = {
  readonly _tag: "TurnExecutionError";
  readonly reason: "store-conflict" | "publication-failed" | "evidence-failed";
};

/** Event input evaluates transitions; projection input only computes passive publication. */
export declare const planTurn: <DefinitionValue extends MachineDefinition>(
  input: TurnInput<DefinitionValue>,
) => Result.Result<TurnPlan<DefinitionValue> | NoopTurnPlan<DefinitionValue>, TurnPlanError>;

/** Completes every staged fact into one candidate commit plan. */
export declare const completeCommitPlan: <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(
  plan: TurnPlan<DefinitionValue>,
  evidence: EvidenceRecord<A, DefinitionValue, CleanupError>,
) => Result.Result<CommitPlan<A, DefinitionValue, CleanupError>, TurnPlanError>;

/** Validates the complete action batch and store changes before any mutation. */
export declare const validateCommitPlan: <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(
  plan: CommitPlan<A, DefinitionValue, CleanupError>,
) => Result.Result<ValidatedCommitPlan<A, DefinitionValue, CleanupError>, TurnPlanError>;

/** Performs only the serialized actor/store commit. */
export declare const commitTurn: <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(
  plan: ValidatedCommitPlan<A, DefinitionValue, CleanupError>,
) => Effect.Effect<CommittedTurn<A, DefinitionValue, CleanupError>, TurnExecutionError>;

/** Publishes the complete actor snapshot after the store cut is committed. */
export declare const publishTurn: <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(
  turn: CommittedTurn<A, DefinitionValue, CleanupError>,
) => Effect.Effect<PublishedTurn<A, DefinitionValue, CleanupError>, TurnExecutionError>;

/** Accepts immutable evidence after publication without waiting for user work. */
export declare const acceptTurnEvidence: <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(
  turn: PublishedTurn<A, DefinitionValue, CleanupError>,
) => Effect.Effect<AcceptedTurn<A, DefinitionValue, CleanupError>, TurnExecutionError>;

/** Resolves a private acknowledgement after publication and evidence acceptance. */
export declare const acknowledgeTurn: <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(
  turn: AcceptedTurn<A, DefinitionValue, CleanupError>,
) => Effect.Effect<void, TurnExecutionError>;

/** Reconciles owned activity starts/releases only after the published cut. */
export declare const reconcileTurn: <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(
  turn: AcceptedTurn<A, DefinitionValue, CleanupError>,
) => Effect.Effect<void, TurnExecutionError>;
