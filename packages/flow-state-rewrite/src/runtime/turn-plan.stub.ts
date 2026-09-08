// STUB: Replaceable/deletable implementation guidance; this file is not shipped behavior.

import type { Effect, Option, Result } from "effect";

import type { App } from "../app/app.js";
import type { EventOf } from "../definition/domain.js";
import type { PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type {
  MachineAction,
  MachineActivityPlan,
  MachineDefinition,
  MachineStoreAction,
} from "../machine/grammar.js";
import type {
  ActorCommand,
  ActorSnapshot,
  OperationCompletionFact,
  StoreRevisionFact,
  StreamProjectionFact,
} from "./actor-engine.stub.js";
import type { ActorFence, ProviderRevisionFence } from "./actor-admission.stub.js";
import type { EvidenceRecord, TurnFact } from "./evidence.stub.js";

/*
 * Data
 *
 * A turn is a plain candidate cut: one admitted EventOf envelope or one
 * passive projection, a before/after snapshot pair, staged actions, exact
 * MachineStoreAction targets, and mapped EventOf envelopes. No Effect runs
 * while this data is being shaped.
 *
 * Admission and invariants
 *
 * Event plans may evaluate transitions, actions, and callbacks; projection
 * plans may publish passive values only. Validate the whole candidate before
 * actor/store mutation. A planning defect drops every staged action and emits
 * no partial snapshot, operation occurrence, or store change.
 *
 * Pure data operations
 *
 * Planning, action ordering, activity reconciliation, fence checks, and
 * commit-plan validation are Result operations. Expected failures are mapped
 * to canonical PublicDiagnostic values. `null` and `false` remain authored
 * callback control values rather than missing data.
 *
 * Effect execution
 *
 * One serialized commit writes the actor/store cut, then publication accepts
 * evidence, acknowledges private callers, and only afterward reconciles owned
 * activity lifetimes. User work never becomes an implicit plan effect.
 */

/** A typed event value is the existing EventOf envelope from an event token. */
export type ActorEvent<DefinitionValue extends MachineDefinition> = EventOf<DefinitionValue>;

/** Projection facts never fabricate an event or request event-machine evaluation. */
export type ProjectionFact<DefinitionValue extends MachineDefinition, StreamValue = never> =
  | { readonly _tag: "timer-projection"; readonly name: string; readonly dueAt: number }
  | {
      readonly _tag: "completion-projection";
      readonly fact: OperationCompletionFact<DefinitionValue>;
    }
  | {
      readonly _tag: "stream-projection";
      readonly fact: StreamProjectionFact<DefinitionValue, StreamValue>;
    }
  | { readonly _tag: "context-projection"; readonly provider: ProviderRevisionFence }
  | { readonly _tag: "store-projection"; readonly fact: StoreRevisionFact<DefinitionValue> }
  | {
      readonly _tag: "lifecycle-projection";
      readonly lifecycle: ActorSnapshot<DefinitionValue>["lifecycle"];
    };

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
export type StoreChange<DefinitionValue extends MachineDefinition = MachineDefinition> =
  MachineStoreAction<DefinitionValue>;

/** Mapped outcomes become later ordinary EventOf mailbox turns. */
export type MappedEvent<DefinitionValue extends MachineDefinition = MachineDefinition> =
  EventOf<DefinitionValue>;

/** The event route contains machine actions; projection routes contain no action fields. */
export type EventTurnPlan<DefinitionValue extends MachineDefinition> = {
  readonly _tag: "event-plan";
  readonly cause: Extract<TurnCause<DefinitionValue>, { readonly _tag: "event" }>;
  readonly fence: ActorFence;
  readonly before: ActorSnapshot<DefinitionValue>;
  readonly candidate: ActorSnapshot<DefinitionValue>;
  readonly actions: readonly FiniteActionIntent<DefinitionValue>[];
  readonly activities: readonly ActivityIntent<DefinitionValue>[];
  readonly storeChanges: readonly StoreChange<DefinitionValue>[];
  readonly mappedEvents: readonly MappedEvent<DefinitionValue>[];
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

/** One commit plan contains every staged actor/store change and an unsequenced fact. */
export type CommitPlan<A extends App, DefinitionValue extends MachineDefinition, _CleanupError> = {
  readonly _tag: "commit-plan";
  readonly plan: TurnPlan<DefinitionValue>;
  readonly publication: {
    readonly publicationRevision: number;
    readonly machineTurnRevision: number;
    readonly storeRevision: number;
  };
  readonly evidence: TurnFact<A, DefinitionValue>;
  readonly acknowledge: { readonly publicationRevision: number };
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
  readonly fact: TurnFact<A, DefinitionValue>;
};

export type PublishedTurn<
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
> = {
  readonly _tag: "published-turn";
  readonly committed: CommittedTurn<A, DefinitionValue, CleanupError>;
  readonly fact: TurnFact<A, DefinitionValue>;
  readonly snapshot: ActorSnapshot<DefinitionValue>;
};

export type AcceptedTurn<A extends App, DefinitionValue extends MachineDefinition, CleanupError> = {
  readonly _tag: "accepted-turn";
  readonly published: PublishedTurn<A, DefinitionValue, CleanupError>;
  readonly record: EvidenceRecord<A, DefinitionValue, CleanupError>;
  readonly evidenceSequence: number;
};

/** Event input evaluates transitions; projection input only computes passive publication. */
export declare const planTurn: <DefinitionValue extends MachineDefinition>(
  input: TurnInput<DefinitionValue>,
) => Result.Result<TurnPlan<DefinitionValue> | NoopTurnPlan<DefinitionValue>, PublicDiagnostic>;

/** Completes every staged fact into one candidate commit plan before sequence allocation. */
export declare const completeCommitPlan: <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(
  plan: TurnPlan<DefinitionValue>,
  evidence: TurnFact<A, DefinitionValue>,
) => Result.Result<CommitPlan<A, DefinitionValue, CleanupError>, PublicDiagnostic>;

/** Validates the complete action batch and store changes before any mutation. */
export declare const validateCommitPlan: <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(
  plan: CommitPlan<A, DefinitionValue, CleanupError>,
) => Result.Result<ValidatedCommitPlan<A, DefinitionValue, CleanupError>, PublicDiagnostic>;

/** Performs only the serialized actor/store commit. */
export declare const commitTurn: <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(
  plan: ValidatedCommitPlan<A, DefinitionValue, CleanupError>,
) => Effect.Effect<CommittedTurn<A, DefinitionValue, CleanupError>, PublicDiagnostic>;

/** Publishes the complete actor snapshot after the store cut is committed. */
export declare const publishTurn: <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(
  turn: CommittedTurn<A, DefinitionValue, CleanupError>,
) => Effect.Effect<PublishedTurn<A, DefinitionValue, CleanupError>, PublicDiagnostic>;

/** Accepts immutable evidence after publication without waiting for user work. */
export declare const acceptTurnEvidence: <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(
  turn: PublishedTurn<A, DefinitionValue, CleanupError>,
) => Effect.Effect<AcceptedTurn<A, DefinitionValue, CleanupError>, PublicDiagnostic>;

/** Resolves a private acknowledgement after publication and evidence acceptance. */
export declare const acknowledgeTurn: <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(
  turn: AcceptedTurn<A, DefinitionValue, CleanupError>,
) => Effect.Effect<void, PublicDiagnostic>;

/** Reconciles owned activity starts/releases only after the published cut. */
export declare const reconcileTurn: <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(
  turn: AcceptedTurn<A, DefinitionValue, CleanupError>,
) => Effect.Effect<void, PublicDiagnostic>;
