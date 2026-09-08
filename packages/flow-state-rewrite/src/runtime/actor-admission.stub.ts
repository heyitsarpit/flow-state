// STUB: Replaceable/deletable implementation guidance; this file is not shipped behavior.

import type { Cause, Effect, Exit, Option, Queue, Result } from "effect";

import type { App } from "../app/app.js";
import type { ContextOf } from "../definition/domain.js";
import type { Implementation } from "../implementation/implementation.js";
import type { OperationDeclaration } from "../operation/operation.js";
import type { OperationKey, ReadonlyCanonical } from "../operation/key.js";
import type { PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type { Machine } from "../machine/machine.js";
import type { MachineDefinition } from "../machine/grammar.js";
import type { ActorHandle, ActorMailboxFact, ActorSnapshot } from "./actor-engine.stub.js";
import type { ActorRef } from "./actor-ref.js";
import type { RuntimeOwner } from "./runtime-owner.stub.js";

declare const actorKeyBrand: unique symbol;
declare const actorIncarnationBrand: unique symbol;
declare const occurrenceOrdinalBrand: unique symbol;

/** Runtime-local stable key used by the registry and dependency graph. */
export type ActorKey = string & { readonly [actorKeyBrand]: void };

/** Monotonic actor-lifetime token that is never reused within one runtime. */
export type ActorIncarnation = number & { readonly [actorIncarnationBrand]: void };

/** One-based ordinal allocated once per descriptor/key and never reused in an incarnation. */
export type OperationOccurrence = number & { readonly [occurrenceOrdinalBrand]: void };

/** Every asynchronous fact carries actor identity, generation, and lease epoch. */
export type ActorFence = {
  readonly key: ActorKey;
  readonly incarnation: ActorIncarnation;
  readonly generation: number;
  readonly leaseEpoch: number;
};

/** Context values are the exact authored vocabulary of the active definition. */
export type ActorContextValue<DefinitionValue extends MachineDefinition> =
  ContextOf<DefinitionValue>[keyof ContextOf<DefinitionValue>];

export type ActorContextSnapshot<DefinitionValue extends MachineDefinition> = Readonly<
  ContextOf<DefinitionValue>
>;

/** One exact context slot binds one provider identity for the consumer lifetime. */
export type ActorContextBinding<DefinitionValue extends MachineDefinition> = {
  readonly slot: keyof ContextOf<DefinitionValue> & string;
  readonly provider: ActorRef<Machine<DefinitionValue>>;
  readonly providerFence: ActorFence;
  readonly select: (
    snapshot: ActorContextSnapshot<DefinitionValue>,
  ) => ActorContextValue<DefinitionValue>;
};

/** Logical dependency ownership retained while a consumer is suspended. */
export type ActorDependencyEdge = {
  readonly consumer: ActorKey;
  readonly provider: ActorKey;
  readonly slot: string;
};

/** Stable identity admitted before any registry, store, edge, or mailbox mutation. */
export type ActorIdentity<DefinitionValue extends MachineDefinition> = {
  readonly ref: ActorRef<Machine<DefinitionValue>>;
  readonly key: ActorKey;
  readonly incarnation: ActorIncarnation;
  readonly leaseEpoch: number;
};

/** Tombstones prevent recreation of a successfully disposed stable identity in this runtime. */
export type ActorTombstone = {
  readonly key: ActorKey;
  readonly incarnation: ActorIncarnation;
  readonly disposedAtSequence: number;
};

type DefinitionOperation<DefinitionValue extends MachineDefinition> =
  DefinitionValue["operations"][keyof DefinitionValue["operations"]];

export type OperationDescriptorOf<DefinitionValue extends MachineDefinition> = Extract<
  DefinitionOperation<DefinitionValue>,
  OperationDeclaration
>;

export type OperationKeyOfDescriptor<Descriptor> = Descriptor extends {
  readonly key: (...args: never[]) => infer Key;
}
  ? Key extends OperationKey
    ? Key
    : OperationKey
  : OperationKey;

/** One package-local occurrence fence protects every operation completion lane. */
export type OperationOccurrenceFence<
  DefinitionValue extends MachineDefinition,
  Descriptor extends OperationDeclaration = OperationDescriptorOf<DefinitionValue>,
  Key extends OperationKey = OperationKeyOfDescriptor<Descriptor>,
> = {
  readonly actor: ActorFence;
  readonly actorKey: ActorKey;
  readonly actorIncarnation: ActorIncarnation;
  readonly actorGeneration: number;
  readonly kind: Descriptor["kind"];
  readonly descriptor: Descriptor;
  readonly descriptorId: Descriptor["id"];
  readonly key: ReadonlyCanonical<Key>;
  readonly occurrence: OperationOccurrence;
  readonly storeGeneration: number | undefined;
  readonly leaseEpoch: number;
};

/** Inputs are exact app, input, definition, and implementation values for one admission. */
export type ActorAdmissionInput<
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
> = {
  readonly app: A;
  readonly implementation: I;
  readonly ref: ActorRef<Machine<DefinitionValue>>;
  readonly input: Input;
  readonly bindings: readonly ActorContextBinding<DefinitionValue>[];
  readonly dependencies: readonly ActorDependencyEdge[];
};

/** Cleanup retains typed failure evidence instead of erasing it to never. */
export type AdmissionRollbackStep<CleanupError> = {
  readonly name: string;
  readonly release: Effect.Effect<void, CleanupError>;
  readonly failure: Option.Option<Cause.Cause<CleanupError>>;
};

export type ActorDisposalError<CleanupError> = {
  readonly _tag: "ActorDisposalError";
  readonly reason: "already-disposed" | "blocked-by-dependent" | "cleanup-failed";
  readonly exit: Exit.Exit<void, CleanupError>;
  readonly cause: Cause.Cause<CleanupError>;
};

/** Expected admission failures distinguish validation, attachment, activation, and cleanup. */
export type ActorAdmissionError<CleanupError> =
  | {
      readonly _tag: "ActorAdmissionError";
      readonly reason:
        | "invalid-app"
        | "foreign-machine"
        | "duplicate-identity"
        | "tombstoned"
        | "dependency-cycle";
      readonly diagnostics: readonly PublicDiagnostic[];
    }
  | {
      readonly _tag: "ActorAdmissionAttachmentError";
      readonly reason: "missing-provider" | "foreign-provider" | "selector-defect";
      readonly diagnostics: readonly PublicDiagnostic[];
    }
  | {
      readonly _tag: "ActorAdmissionActivationError";
      readonly reason: "activation-failed" | "cleanup-failed";
      readonly diagnostics: readonly PublicDiagnostic[];
      readonly cleanup: Option.Option<Cause.Cause<CleanupError>>;
    };

/** Validation output contains exact values but no live resources. */
export type ValidatedActorAdmission<
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
> = {
  readonly input: ActorAdmissionInput<A, Input, DefinitionValue, I>;
  readonly identity: ActorIdentity<DefinitionValue>;
  readonly edges: readonly ActorDependencyEdge[];
};

/** Reserve/join makes duplicate ensure calls share one admission transaction. */
export type ActorAdmissionReservation<
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
  CleanupError,
> =
  | {
      readonly mode: "leader";
      readonly validated: ValidatedActorAdmission<A, Input, DefinitionValue, I>;
    }
  | {
      readonly mode: "joined";
      readonly existing: ExposedActorAdmission<A, Input, DefinitionValue, I, CleanupError>;
    };

/** Preparation owns the bounded mailbox and silent initial snapshot. */
export type PreparedActorAdmission<
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
  CleanupError,
> = {
  readonly phase: "prepared";
  readonly validated: ValidatedActorAdmission<A, Input, DefinitionValue, I>;
  readonly snapshot: ActorSnapshot<DefinitionValue>;
  readonly mailbox: Queue.Queue<ActorMailboxFact<DefinitionValue>>;
  readonly rollback: readonly AdmissionRollbackStep<CleanupError>[];
};

/** Attachment installs exact context values and logical edges before activation. */
export type AttachedActorAdmission<
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
  CleanupError,
> = {
  readonly phase: "attached";
  readonly prepared: PreparedActorAdmission<A, Input, DefinitionValue, I, CleanupError>;
  readonly context: Readonly<ContextOf<DefinitionValue>>;
  readonly edges: readonly ActorDependencyEdge[];
};

/** Activation crosses the mailbox barrier before lease exposure. */
export type ActivatedActorAdmission<
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
  CleanupError,
> = {
  readonly phase: "activated";
  readonly attached: AttachedActorAdmission<A, Input, DefinitionValue, I, CleanupError>;
  readonly lease: ActorLease<A, Input, DefinitionValue, I, CleanupError>;
};

/** A lease is the only individual actor disposal authority. */
export type ActorLease<
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
  CleanupError,
> = {
  readonly actor: ActorHandle<DefinitionValue>;
  readonly admission: ValidatedActorAdmission<A, Input, DefinitionValue, I>;
  readonly dispose: () => Effect.Effect<void, ActorDisposalError<CleanupError>>;
};

/** Exposure is the final stage; all earlier failures roll back in reverse order. */
export type ExposedActorAdmission<
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
  CleanupError,
> = {
  readonly phase: "exposed";
  readonly activated: ActivatedActorAdmission<A, Input, DefinitionValue, I, CleanupError>;
  readonly actor: ActorHandle<DefinitionValue>;
  readonly lease: ActorLease<A, Input, DefinitionValue, I, CleanupError>;
};

export type ActorAdmissionStage<
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
  CleanupError,
> =
  | ValidatedActorAdmission<A, Input, DefinitionValue, I>
  | PreparedActorAdmission<A, Input, DefinitionValue, I, CleanupError>
  | AttachedActorAdmission<A, Input, DefinitionValue, I, CleanupError>
  | ActivatedActorAdmission<A, Input, DefinitionValue, I, CleanupError>
  | ExposedActorAdmission<A, Input, DefinitionValue, I, CleanupError>;

/** One owner authority owns lookup, reservation, every stage, rollback, and tombstones. */
export interface ActorAdmissionAuthority<
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
  CleanupError,
> {
  readonly owner: RuntimeOwner<A, I>;
  readonly lookup: (
    ref: ActorRef<Machine<DefinitionValue>>,
  ) => Option.Option<ActorIdentity<DefinitionValue>>;
  readonly reserveOrJoin: (
    input: ActorAdmissionInput<A, Input, DefinitionValue, I>,
  ) => Effect.Effect<
    ActorAdmissionReservation<A, Input, DefinitionValue, I, CleanupError>,
    ActorAdmissionError<CleanupError>
  >;
  readonly stage: (
    validated: ValidatedActorAdmission<A, Input, DefinitionValue, I>,
  ) => Effect.Effect<
    PreparedActorAdmission<A, Input, DefinitionValue, I, CleanupError>,
    ActorAdmissionError<CleanupError>
  >;
  readonly attach: (
    prepared: PreparedActorAdmission<A, Input, DefinitionValue, I, CleanupError>,
  ) => Effect.Effect<
    AttachedActorAdmission<A, Input, DefinitionValue, I, CleanupError>,
    ActorAdmissionError<CleanupError>
  >;
  readonly activate: (
    attached: AttachedActorAdmission<A, Input, DefinitionValue, I, CleanupError>,
  ) => Effect.Effect<
    ActivatedActorAdmission<A, Input, DefinitionValue, I, CleanupError>,
    ActorAdmissionError<CleanupError>
  >;
  readonly expose: (
    activated: ActivatedActorAdmission<A, Input, DefinitionValue, I, CleanupError>,
  ) => Result.Result<
    ExposedActorAdmission<A, Input, DefinitionValue, I, CleanupError>,
    ActorAdmissionError<CleanupError>
  >;
  readonly rollback: (
    stage: ActorAdmissionStage<A, Input, DefinitionValue, I, CleanupError>,
  ) => Effect.Effect<void, ActorAdmissionError<CleanupError>>;
  readonly tombstone: (
    identity: ActorIdentity<DefinitionValue>,
  ) => Effect.Effect<void, ActorAdmissionError<CleanupError>>;
}

/** Pure validation checks provenance, identity, tombstones, bindings, and cycles. */
export declare const validateActorAdmission: <
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
  CleanupError,
>(
  input: ActorAdmissionInput<A, Input, DefinitionValue, I>,
  authority: Pick<
    ActorAdmissionAuthority<A, Input, DefinitionValue, I, CleanupError>,
    "owner" | "lookup"
  >,
) => Result.Result<
  ValidatedActorAdmission<A, Input, DefinitionValue, I>,
  ActorAdmissionError<CleanupError>
>;

/** One transaction path stages and exposes only after every owner phase succeeds. */
export declare const admitActor: <
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
  CleanupError,
>(
  input: ActorAdmissionInput<A, Input, DefinitionValue, I>,
  authority: ActorAdmissionAuthority<A, Input, DefinitionValue, I, CleanupError>,
) => Effect.Effect<
  ExposedActorAdmission<A, Input, DefinitionValue, I, CleanupError>,
  ActorAdmissionError<CleanupError>
>;
