// STUB: Replaceable/deletable implementation guidance; this file is not shipped behavior.

import type { Deferred, Effect, Exit, Queue, Scope, Stream } from "effect";

import type { EventOf } from "../definition/domain.js";
import type { MachineDefinition, MachineSnapshot } from "../machine/grammar.js";
import type { OperationDeclaration } from "../operation/operation.js";
import type { OperationKey, ReadonlyCanonical } from "../operation/key.js";
import type { PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type {
  ActorFence,
  ActorIdentity,
  OperationDescriptorOf,
  OperationOccurrenceFence,
  OperationKeyOfDescriptor,
  ProviderRevisionFence,
} from "./actor-admission.stub.js";
import type { ActorRef } from "./actor-ref.js";
import type { ActorLifecycle } from "./lifecycle.stub.js";
import type { Machine } from "../machine/machine.js";

/*
 * Data
 *
 * The engine owns one typed mailbox fact union and one complete actor snapshot.
 * Commands are already admitted EventOf envelopes produced by event tokens;
 * operation completions retain their descriptor, canonical key, occurrence,
 * actor fence, and full Exit/Cause classification.
 *
 * Admission and invariants
 *
 * Public send is synchronous and cannot expose an acknowledgement handle.
 * Every fact enters one FIFO lane, stale fences are discarded before mutation,
 * and a snapshot is published only after the complete turn/store cut is valid.
 *
 * Pure data operations
 *
 * Fact classification, fence comparison, projection construction, and snapshot
 * shaping are plain data operations. Store projections use MachineStoreAction;
 * operation projections keep an OperationDeclaration and canonical OperationKey.
 *
 * Effect execution
 *
 * The Queue consumer, snapshot stream, completion cells, and shutdown run under
 * the supplied Scope. Cancellation interrupts owned work before queue close;
 * the public handle exposes only synchronous send and passive snapshots.
 */

/** A public command is an EventOf envelope created by an admitted event token. */
export type ActorCommand<DefinitionValue extends MachineDefinition> = EventOf<DefinitionValue>;

/** Finite outcomes retain success, expected failure, defect, and interruption distinctions. */
export type FiniteOperationOutcome<Value, Failure> =
  | { readonly _tag: "success"; readonly value: Value }
  | { readonly _tag: "failure"; readonly error: Failure }
  | { readonly _tag: "defect"; readonly exit: Exit.Exit<never, Failure> }
  | { readonly _tag: "interrupt"; readonly exit: Exit.Exit<never, Failure> };

/** Completion facts use one package-local occurrence fence, including descriptor and canonical key. */
export type OperationCompletionFact<
  DefinitionValue extends MachineDefinition,
  Descriptor extends OperationDeclaration = OperationDescriptorOf<DefinitionValue>,
  Key extends OperationKey = OperationKeyOfDescriptor<Descriptor>,
  Value = never,
> = {
  readonly fence: OperationOccurrenceFence<DefinitionValue, Descriptor, Key>;
  readonly outcome: FiniteOperationOutcome<Value, PublicDiagnostic>;
};

/** Stream values retain the full continuing occurrence correlation through handoff. */
export type StreamProjectionFact<
  DefinitionValue extends MachineDefinition,
  StreamValue = never,
  Descriptor extends OperationDeclaration = OperationDescriptorOf<DefinitionValue>,
  Key extends OperationKey = OperationKeyOfDescriptor<Descriptor>,
> = {
  readonly fence: OperationOccurrenceFence<DefinitionValue, Descriptor, Key>;
  readonly value: StreamValue;
};

/** Store revisions retain deduplicated exact changed descriptor/key references and the actor fence. */
export type StoreChangeReference<
  DefinitionValue extends MachineDefinition,
  Descriptor extends OperationDeclaration = OperationDescriptorOf<DefinitionValue>,
  Key extends OperationKey = OperationKeyOfDescriptor<Descriptor>,
> = {
  readonly fence: ActorFence;
  readonly descriptor: Descriptor;
  readonly key: ReadonlyCanonical<Key>;
};

export type StoreRevisionFact<
  DefinitionValue extends MachineDefinition,
  Descriptor extends OperationDeclaration = OperationDescriptorOf<DefinitionValue>,
  Key extends OperationKey = OperationKeyOfDescriptor<Descriptor>,
> = {
  readonly fence: ActorFence;
  readonly revision: number;
  /** One descriptor/key pair appears at most once in a revision fact. */
  readonly changed: readonly StoreChangeReference<DefinitionValue, Descriptor, Key>[];
};

/** One mailbox carries commands, completions, projections, lifecycle, and shutdown facts. */
export type ActorMailboxFact<DefinitionValue extends MachineDefinition, StreamValue = never> =
  | {
      readonly _tag: "command";
      readonly fence: ActorFence;
      readonly command: ActorCommand<DefinitionValue>;
    }
  | {
      readonly _tag: "completion";
      readonly completion: OperationCompletionFact<DefinitionValue>;
    }
  | {
      readonly _tag: "timer";
      readonly fence: ActorFence;
      readonly name: string;
      readonly dueAt: number;
    }
  | {
      readonly _tag: "stream";
      readonly fact: StreamProjectionFact<DefinitionValue, StreamValue>;
    }
  | {
      readonly _tag: "context-wave";
      readonly provider: ProviderRevisionFence;
    }
  | {
      readonly _tag: "store-revision";
      readonly fact: StoreRevisionFact<DefinitionValue>;
    }
  | {
      readonly _tag: "lifecycle";
      readonly fence: ActorFence;
      readonly lifecycle: ActorLifecycle;
    }
  | {
      readonly _tag: "shutdown";
      readonly fence: ActorFence;
      readonly mode: "graceful" | "hard";
    };

/** Operation projections are passive snapshot data, never pending handles. */
export type OperationProjection<Descriptor extends OperationDeclaration = OperationDeclaration> = {
  readonly descriptor: Descriptor;
  readonly key: ReadonlyCanonical<OperationKeyOfDescriptor<Descriptor>>;
  readonly status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
};

/** Timer projections carry absolute timing data and no scheduler authority. */
export type TimerProjection = {
  readonly name: string;
  readonly startedAt: number;
  readonly dueAt: number;
};

/** Complete immutable actor truth at one publication boundary. */
export type ActorSnapshot<DefinitionValue extends MachineDefinition> = Readonly<
  MachineSnapshot<DefinitionValue> & {
    readonly lifecycle: ActorLifecycle;
    readonly operations: readonly OperationProjection[];
    readonly timers: readonly TimerProjection[];
    readonly issues: readonly PublicDiagnostic[];
    readonly revision: number;
    readonly observedStoreRevision: number;
  }
>;

/** Acknowledgement resolves after publication and evidence acceptance, before user work settles. */
export type DispatchReceipt = {
  readonly publicationRevision: number;
  readonly evidenceSequence: number;
};

/** Internal callers receive one synchronously-created completion cell. */
export type AcknowledgedDispatch = {
  readonly admitted: boolean;
  readonly completion: Deferred.Deferred<DispatchReceipt, PublicDiagnostic>;
};

/** Engine construction receives an exact machine snapshot and identity fence under one scope. */
export type ActorEngineInput<DefinitionValue extends MachineDefinition> = {
  readonly identity: ActorIdentity<DefinitionValue>;
  readonly fence: ActorFence;
  readonly initial: ActorSnapshot<DefinitionValue>;
  readonly scope: Scope.Scope;
};

/** One actor has one FIFO Queue and one logical consumer. */
export interface ActorEngine<DefinitionValue extends MachineDefinition> {
  readonly mailbox: Queue.Queue<ActorMailboxFact<DefinitionValue>, PublicDiagnostic>;
  readonly consumer: Effect.Effect<void, PublicDiagnostic>;
  readonly snapshot: () => ActorSnapshot<DefinitionValue>;
  readonly send: (command: ActorCommand<DefinitionValue>) => void;
  readonly dispatch: (command: ActorCommand<DefinitionValue>) => AcknowledgedDispatch;
  readonly snapshots: Stream.Stream<ActorSnapshot<DefinitionValue>>;
  readonly drain: () => Effect.Effect<void, PublicDiagnostic>;
  readonly shutdown: (mode: "graceful" | "hard") => Effect.Effect<void, PublicDiagnostic>;
}

/** A handle exposes identity, synchronous send, and passive evidence only. */
export interface ActorHandle<DefinitionValue extends MachineDefinition> {
  readonly ref: ActorRef<Machine<DefinitionValue>>;
  readonly send: (command: ActorCommand<DefinitionValue>) => void;
  readonly getSnapshot: () => ActorSnapshot<DefinitionValue>;
  readonly snapshots: Stream.Stream<ActorSnapshot<DefinitionValue>>;
}

/** Creates the engine under an existing scope; it does not start user work during planning. */
export declare const createActorEngine: <DefinitionValue extends MachineDefinition>(
  input: ActorEngineInput<DefinitionValue>,
) => Effect.Effect<ActorEngine<DefinitionValue>, PublicDiagnostic>;

/** Creates the public projection without exposing engine ownership or acknowledgement. */
export declare const actorHandle: <DefinitionValue extends MachineDefinition>(
  engine: ActorEngine<DefinitionValue>,
) => ActorHandle<DefinitionValue>;
