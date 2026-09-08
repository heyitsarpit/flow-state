// STUB: Replaceable/deletable implementation guidance; this file is not shipped behavior.

import type { Effect, Option, Queue, Result } from "effect";

import type { App } from "../app/app.js";
import type { MachineDefinition } from "../machine/grammar.js";
import type { ActorFence, ActorIdentity } from "./actor-admission.stub.js";
import type { ActorSnapshot } from "./actor-engine.stub.js";
import type { ActorLifecycle, LifecycleCause, LifecycleSnapshot } from "./lifecycle.stub.js";
import type { TurnCause } from "./turn-plan.stub.js";

declare const evidenceSequenceBrand: unique symbol;
declare const sinkIdBrand: unique symbol;

/** Runtime-global accepted evidence order, allocated only by an EvidenceHub. */
export type EvidenceSequence = number & { readonly [evidenceSequenceBrand]: void };

/** Sink identity is local to one evidence hub. */
export type SinkId = string & { readonly [sinkIdBrand]: void };

/** Records derive app and plan provenance from the current App and AppPlan types. */
export type RuntimeProvenance<A extends App, DefinitionValue extends MachineDefinition> = {
  readonly app: A;
  readonly plan: A["plan"];
  readonly actor: ActorIdentity<DefinitionValue>;
};

/** Unsequenced turn facts must contain a complete published before/after snapshot cut. */
export type TurnFact<A extends App, DefinitionValue extends MachineDefinition> = {
  readonly fence: ActorFence;
  readonly provenance: RuntimeProvenance<A, DefinitionValue>;
  readonly cause: TurnCause<DefinitionValue>;
  readonly before: ActorSnapshot<DefinitionValue>;
  readonly after: ActorSnapshot<DefinitionValue>;
  readonly publicationRevision: number;
  readonly machineTurnRevision: number;
  readonly storeRevision: number;
  readonly timestamp: number;
};

/** Immutable actual fact for one committed actor/store cut. */
export type TurnRecord<A extends App, DefinitionValue extends MachineDefinition> = TurnFact<
  A,
  DefinitionValue
> & {
  readonly _tag: "turn";
  readonly sequence: EvidenceSequence;
};

/** Lifecycle facts carry the same app/plan/actor provenance and published snapshot. */
export type LifecycleFact<
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
> = {
  readonly fence: ActorFence;
  readonly provenance: RuntimeProvenance<A, DefinitionValue>;
  readonly from: ActorLifecycle;
  readonly to: ActorLifecycle;
  readonly cause: LifecycleCause<CleanupError>;
  readonly snapshot: LifecycleSnapshot<DefinitionValue, CleanupError>;
  readonly publicationRevision: number;
  readonly machineTurnRevision: number;
  readonly timestamp: number;
};

/** Lifecycle evidence shares the sequence with turn records and follows its published cut. */
export type LifecycleRecord<
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
> = LifecycleFact<A, DefinitionValue, CleanupError> & {
  readonly _tag: "lifecycle";
  readonly sequence: EvidenceSequence;
};

/** The hub accepts only typed turn and lifecycle records. */
export type EvidenceRecord<
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
> = TurnRecord<A, DefinitionValue> | LifecycleRecord<A, DefinitionValue, CleanupError>;

/** A reservation proves that the hub allocated this sequence for one record. */
export type EvidenceReservation<
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
> = {
  readonly hub: EvidenceHub<A, DefinitionValue, CleanupError>;
  readonly sequence: EvidenceSequence;
};

/** Sink-local bounded delivery never blocks or rolls back runtime truth. */
export type EvidenceSink<A extends App, DefinitionValue extends MachineDefinition, CleanupError> = {
  readonly id: SinkId;
  readonly capacity: number;
  readonly mailbox: Queue.Queue<EvidenceRecord<A, DefinitionValue, CleanupError>>;
  readonly offer: (
    record: EvidenceRecord<A, DefinitionValue, CleanupError>,
  ) => Effect.Effect<SinkOfferResult, SinkError>;
  readonly drain: (through: EvidenceSequence) => Effect.Effect<SinkDrainResult, SinkError>;
  readonly close: () => Effect.Effect<void, SinkError>;
};

/** Sink overflow is local; another sink and runtime truth continue independently. */
export type SinkOfferResult = {
  readonly sink: SinkId;
  readonly sequence: EvidenceSequence;
  readonly status: "accepted" | "dropped" | "detached";
};

/** Sink processing outcomes expose delivery failure, detachment, and truncation. */
export type SinkDrainResult = {
  readonly sink: SinkId;
  readonly through: EvidenceSequence;
  readonly status: "drained" | "truncated" | "failed";
};

export type SinkError = {
  readonly _tag: "SinkError";
  readonly sink: SinkId;
  readonly reason: "overflow" | "delivery-failed" | "closed";
};

/** Acceptance is the barrier that private acknowledgement waits for. */
export type EvidenceAcceptance<
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
> = {
  readonly record: EvidenceRecord<A, DefinitionValue, CleanupError>;
  readonly sequence: EvidenceSequence;
  readonly sinks: readonly SinkOfferResult[];
};

/** Drain reports the accepted prefix and any sink-local truncation explicitly. */
export type EvidenceDrain = {
  readonly through: EvidenceSequence;
  readonly truncatedBefore: Option.Option<EvidenceSequence>;
  readonly sinks: readonly SinkDrainResult[];
};

/** Sequence exhaustion is explicit and cannot erase already accepted records. */
export type EvidenceError = {
  readonly _tag: "EvidenceError";
  readonly reason: "sequence-exhausted" | "closed" | "record-invalid" | "wrong-hub";
};

/** EvidenceHub owns sequence allocation and accepted-prefix drain. */
export interface EvidenceHub<
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
> {
  readonly sequence: () => EvidenceSequence;
  readonly reserve: () => Result.Result<
    EvidenceReservation<A, DefinitionValue, CleanupError>,
    EvidenceError
  >;
  readonly attach: (
    sink: EvidenceSink<A, DefinitionValue, CleanupError>,
  ) => Result.Result<void, EvidenceError>;
  readonly accept: (
    record: EvidenceRecord<A, DefinitionValue, CleanupError>,
  ) => Effect.Effect<EvidenceAcceptance<A, DefinitionValue, CleanupError>, EvidenceError>;
  readonly drain: () => Effect.Effect<EvidenceDrain, EvidenceError>;
  readonly close: () => Effect.Effect<EvidenceDrain, EvidenceError>;
}

/** Builds an immutable turn record only from a hub reservation and published snapshots. */
export declare const makeTurnRecord: <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(
  fact: TurnFact<A, DefinitionValue>,
  reservation: EvidenceReservation<A, DefinitionValue, CleanupError>,
) => Result.Result<TurnRecord<A, DefinitionValue>, EvidenceError>;

/** Builds lifecycle evidence only from a hub reservation and its published lifecycle snapshot. */
export declare const makeLifecycleRecord: <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(
  fact: LifecycleFact<A, DefinitionValue, CleanupError>,
  reservation: EvidenceReservation<A, DefinitionValue, CleanupError>,
) => Result.Result<LifecycleRecord<A, DefinitionValue, CleanupError>, EvidenceError>;

/** Validates and accepts one record before command acknowledgement. */
export declare const acceptEvidence: <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(
  hub: EvidenceHub<A, DefinitionValue, CleanupError>,
  record: EvidenceRecord<A, DefinitionValue, CleanupError>,
) => Effect.Effect<EvidenceAcceptance<A, DefinitionValue, CleanupError>, EvidenceError>;

/** Drains exactly the accepted prefix after terminal lifecycle evidence. */
export declare const drainAcceptedEvidence: <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(
  hub: EvidenceHub<A, DefinitionValue, CleanupError>,
) => Effect.Effect<EvidenceDrain, EvidenceError>;

/** Closes admission, drains sinks, and then closes each sink in isolation. */
export declare const closeEvidence: <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>(
  hub: EvidenceHub<A, DefinitionValue, CleanupError>,
) => Effect.Effect<EvidenceDrain, EvidenceError>;

/** Constructs a hub without allocating sinks or publishing records. */
export declare const makeEvidenceHub: <
  A extends App,
  DefinitionValue extends MachineDefinition,
  CleanupError,
>() => EvidenceHub<A, DefinitionValue, CleanupError>;
