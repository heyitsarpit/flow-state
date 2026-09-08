// STUB: Replaceable/deletable implementation guidance; this file is not shipped behavior.

import type { Cause, Effect, Option, Queue, Result } from "effect";

import type { App } from "../app/app.js";
import type { ContextOf, SelectorInput } from "../definition/domain.js";
import type { Implementation } from "../implementation/implementation.js";
import type { OperationDeclaration } from "../operation/operation.js";
import type { OperationKey, ReadonlyCanonical } from "../operation/key.js";
import type { PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type { Machine } from "../machine/machine.js";
import type { MachineDefinition } from "../machine/grammar.js";
import type { ActorHandle, ActorMailboxFact, ActorSnapshot } from "./actor-engine.stub.js";
import type { ActorRef } from "./actor-ref.js";
import type { RuntimeOwner } from "./runtime-owner.stub.js";

/*
 * Data
 *
 * Admission carries authored machine identity, one correlated consumer slot,
 * the exact provider reference, and fences for the actor incarnation and
 * operation occurrence. Prepared and attached values contain no live resource
 * escape.
 *
 * Admission and invariants
 *
 * Validate app/machine provenance, duplicate identity, tombstones, provider
 * ownership, slot bindings, and dependency cycles before registry, mailbox,
 * store, or edge mutation. Exposure happens only after activation crosses the
 * silent initial-snapshot barrier; rollback walks the acquired prefix once.
 *
 * Pure data operations
 *
 * Validation, reservation classification, fence comparison, and stage shaping
 * are plain Result operations. Expected refusal is a canonical
 * PublicDiagnostic; Option represents lookup absence and cleanup metadata.
 *
 * Effect execution
 *
 * Staging allocates bounded mailbox/scope resources, attachment evaluates
 * provider selectors, and activation starts the engine. A lease is the only
 * individual disposal authority; every Effect keeps cleanup Cause available.
 */

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

/** Provider publication identity combines actor incarnation with its revision. */
export type ProviderRevisionFence = ActorFence & {
  readonly revision: number;
};

/** Context values are the exact authored vocabulary of the active definition. */
export type ActorContextValue<
  DefinitionValue extends MachineDefinition,
  Slot extends keyof ContextOf<DefinitionValue> & string = keyof ContextOf<DefinitionValue> &
    string,
> = ContextOf<DefinitionValue>[Slot];

export type ActorContextSnapshot<ProviderDefinition extends MachineDefinition> =
  SelectorInput<ProviderDefinition>;

/** One exact context slot binds one provider identity for the consumer lifetime. */
export type ActorContextBinding<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
  Slot extends keyof ContextOf<ConsumerDefinition> & string = keyof ContextOf<ConsumerDefinition> &
    string,
  ProviderRef extends ActorRef<Machine<ProviderDefinition>> = ActorRef<Machine<ProviderDefinition>>,
> = Slot extends keyof ContextOf<ConsumerDefinition> & string
  ? {
      readonly slot: Slot;
      readonly provider: ProviderRef;
      readonly providerFence: ActorFence;
      readonly select: (
        input: ActorContextSnapshot<ProviderDefinition>,
      ) => ActorContextValue<ConsumerDefinition, Slot>;
    }
  : never;

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
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  readonly app: A;
  readonly implementation: I;
  readonly ref: ActorRef<Machine<DefinitionValue>>;
  readonly input: Input;
  readonly bindings: readonly ActorContextBinding<DefinitionValue, ProviderDefinition>[];
  readonly dependencies: readonly ActorDependencyEdge[];
};

/** Cleanup retains typed failure evidence instead of erasing it to never. */
export type AdmissionRollbackStep<CleanupError> = {
  readonly name: string;
  readonly release: Effect.Effect<void, CleanupError>;
  readonly failure: Option.Option<Cause.Cause<CleanupError>>;
};

/** Validation output contains exact values but no live resources. */
export type ValidatedActorAdmission<
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  readonly input: ActorAdmissionInput<A, Input, DefinitionValue, I, ProviderDefinition>;
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
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> =
  | {
      readonly mode: "leader";
      readonly validated: ValidatedActorAdmission<A, Input, DefinitionValue, I, ProviderDefinition>;
    }
  | {
      readonly mode: "joined";
      readonly existing: ExposedActorAdmission<
        A,
        Input,
        DefinitionValue,
        I,
        CleanupError,
        ProviderDefinition
      >;
    };

/** Preparation owns the bounded mailbox and silent initial snapshot. */
export type PreparedActorAdmission<
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  readonly phase: "prepared";
  readonly validated: ValidatedActorAdmission<A, Input, DefinitionValue, I, ProviderDefinition>;
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
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  readonly phase: "attached";
  readonly prepared: PreparedActorAdmission<
    A,
    Input,
    DefinitionValue,
    I,
    CleanupError,
    ProviderDefinition
  >;
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
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  readonly phase: "activated";
  readonly attached: AttachedActorAdmission<
    A,
    Input,
    DefinitionValue,
    I,
    CleanupError,
    ProviderDefinition
  >;
  readonly lease: ActorLease<A, Input, DefinitionValue, I, CleanupError, ProviderDefinition>;
};

/** A lease is the only individual actor disposal authority. */
export type ActorLease<
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  readonly actor: ActorHandle<DefinitionValue>;
  readonly admission: ValidatedActorAdmission<A, Input, DefinitionValue, I, ProviderDefinition>;
  readonly cleanup: Option.Option<Cause.Cause<CleanupError>>;
  readonly dispose: () => Effect.Effect<void, PublicDiagnostic>;
};

/** Exposure is the final stage; all earlier failures roll back in reverse order. */
export type ExposedActorAdmission<
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> = {
  readonly phase: "exposed";
  readonly activated: ActivatedActorAdmission<
    A,
    Input,
    DefinitionValue,
    I,
    CleanupError,
    ProviderDefinition
  >;
  readonly actor: ActorHandle<DefinitionValue>;
  readonly lease: ActorLease<A, Input, DefinitionValue, I, CleanupError, ProviderDefinition>;
};

export type ActorAdmissionStage<
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> =
  | ValidatedActorAdmission<A, Input, DefinitionValue, I, ProviderDefinition>
  | PreparedActorAdmission<A, Input, DefinitionValue, I, CleanupError, ProviderDefinition>
  | AttachedActorAdmission<A, Input, DefinitionValue, I, CleanupError, ProviderDefinition>
  | ActivatedActorAdmission<A, Input, DefinitionValue, I, CleanupError, ProviderDefinition>
  | ExposedActorAdmission<A, Input, DefinitionValue, I, CleanupError, ProviderDefinition>;

/** Rollback is valid only before the actor handle crosses the exposure barrier. */
export type PreExposureAdmissionStage<
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> =
  | ValidatedActorAdmission<A, Input, DefinitionValue, I, ProviderDefinition>
  | PreparedActorAdmission<A, Input, DefinitionValue, I, CleanupError, ProviderDefinition>
  | AttachedActorAdmission<A, Input, DefinitionValue, I, CleanupError, ProviderDefinition>
  | ActivatedActorAdmission<A, Input, DefinitionValue, I, CleanupError, ProviderDefinition>;

/** One owner authority owns lookup, reservation, every stage, rollback, and tombstones. */
export interface ActorAdmissionAuthority<
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
> {
  readonly owner: RuntimeOwner<A, I>;
  readonly lookup: (
    ref: ActorRef<Machine<DefinitionValue>>,
  ) => Option.Option<ActorIdentity<DefinitionValue>>;
  readonly reserveOrJoin: (
    input: ActorAdmissionInput<A, Input, DefinitionValue, I, ProviderDefinition>,
  ) => Effect.Effect<
    ActorAdmissionReservation<A, Input, DefinitionValue, I, CleanupError, ProviderDefinition>,
    PublicDiagnostic
  >;
  readonly stage: (
    validated: ValidatedActorAdmission<A, Input, DefinitionValue, I, ProviderDefinition>,
  ) => Effect.Effect<
    PreparedActorAdmission<A, Input, DefinitionValue, I, CleanupError, ProviderDefinition>,
    PublicDiagnostic
  >;
  readonly attach: (
    prepared: PreparedActorAdmission<
      A,
      Input,
      DefinitionValue,
      I,
      CleanupError,
      ProviderDefinition
    >,
  ) => Effect.Effect<
    AttachedActorAdmission<A, Input, DefinitionValue, I, CleanupError, ProviderDefinition>,
    PublicDiagnostic
  >;
  readonly activate: (
    attached: AttachedActorAdmission<
      A,
      Input,
      DefinitionValue,
      I,
      CleanupError,
      ProviderDefinition
    >,
  ) => Effect.Effect<
    ActivatedActorAdmission<A, Input, DefinitionValue, I, CleanupError, ProviderDefinition>,
    PublicDiagnostic
  >;
  readonly expose: (
    activated: ActivatedActorAdmission<
      A,
      Input,
      DefinitionValue,
      I,
      CleanupError,
      ProviderDefinition
    >,
  ) => Result.Result<
    ExposedActorAdmission<A, Input, DefinitionValue, I, CleanupError, ProviderDefinition>,
    PublicDiagnostic
  >;
  readonly rollback: (
    stage: PreExposureAdmissionStage<
      A,
      Input,
      DefinitionValue,
      I,
      CleanupError,
      ProviderDefinition
    >,
  ) => Effect.Effect<void, PublicDiagnostic>;
  /** Exposed failures use ordinary lease disposal rather than pre-exposure rollback. */
  readonly disposeExposed: (
    exposed: ExposedActorAdmission<A, Input, DefinitionValue, I, CleanupError, ProviderDefinition>,
  ) => Effect.Effect<void, PublicDiagnostic>;
  readonly tombstone: (
    identity: ActorIdentity<DefinitionValue>,
  ) => Effect.Effect<void, PublicDiagnostic>;
}

/** Pure validation checks provenance, identity, tombstones, bindings, and cycles. */
export declare const validateActorAdmission: <
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  input: ActorAdmissionInput<A, Input, DefinitionValue, I, ProviderDefinition>,
  authority: Pick<
    ActorAdmissionAuthority<A, Input, DefinitionValue, I, CleanupError, ProviderDefinition>,
    "owner" | "lookup"
  >,
) => Result.Result<
  ValidatedActorAdmission<A, Input, DefinitionValue, I, ProviderDefinition>,
  PublicDiagnostic
>;

/** One transaction path stages and exposes only after every owner phase succeeds. */
export declare const admitActor: <
  A extends App,
  Input,
  DefinitionValue extends MachineDefinition,
  I extends Implementation,
  CleanupError,
  ProviderDefinition extends MachineDefinition = DefinitionValue,
>(
  input: ActorAdmissionInput<A, Input, DefinitionValue, I, ProviderDefinition>,
  authority: ActorAdmissionAuthority<
    A,
    Input,
    DefinitionValue,
    I,
    CleanupError,
    ProviderDefinition
  >,
) => Effect.Effect<
  ExposedActorAdmission<A, Input, DefinitionValue, I, CleanupError, ProviderDefinition>,
  PublicDiagnostic
>;
