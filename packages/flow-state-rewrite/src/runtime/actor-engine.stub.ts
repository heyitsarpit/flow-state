// STUB: Replaceable/deletable implementation guidance; this file is not shipped behavior.

import type { Deferred, Effect, Exit, Queue, Scope, Stream } from "effect";

import type {
  EventName,
  EventValue,
  MachineDefinition,
  MachineSnapshot,
} from "../machine/grammar.js";
import type { OperationDeclaration } from "../operation/operation.js";
import type { OperationKey } from "../operation/key.js";
import type { PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type {
  ActorFence,
  ActorIdentity,
  OperationDescriptorOf,
  OperationOccurrenceFence,
  OperationKeyOfDescriptor,
} from "./actor-admission.stub.js";
import type { ActorRef } from "./actor-ref.js";
import type { ActorLifecycle } from "./lifecycle.stub.js";
import type { Machine } from "../machine/machine.js";

/** A public command is admitted synchronously and has no acknowledgement handle. */
export type ActorCommand<DefinitionValue extends MachineDefinition> = {
  readonly name: EventName<DefinitionValue>;
  readonly value: EventValue<DefinitionValue, EventName<DefinitionValue>>;
};

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
> = {
  readonly fence: OperationOccurrenceFence<DefinitionValue, Descriptor, Key>;
  readonly outcome: FiniteOperationOutcome<unknown, unknown>;
};

/** One mailbox carries commands, completions, projections, lifecycle, and shutdown facts. */
export type ActorMailboxFact<DefinitionValue extends MachineDefinition> =
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
      readonly fence: ActorFence;
      readonly descriptor: string;
      readonly value: unknown;
    }
  | {
      readonly _tag: "context-wave";
      readonly fence: ActorFence;
      readonly providerRevision: number;
    }
  | {
      readonly _tag: "store-revision";
      readonly fence: ActorFence;
      readonly revision: number;
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

/** Bounded mailbox failures are separate from command admission failures. */
export type ActorMailboxError = {
  readonly _tag: "ActorMailboxError";
  readonly reason: "closed" | "overflow" | "consumer-failed";
};

/** Operation projections are passive snapshot data, never pending handles. */
export type OperationProjection = {
  readonly descriptor: OperationDeclaration;
  readonly status: string;
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

/** Private dispatch failures are not exposed by public send. */
export type DispatchError = {
  readonly _tag: "DispatchError";
  readonly reason: "rejected" | "disposed" | "planning-failed";
};

/** Internal callers receive one synchronously-created completion cell. */
export type AcknowledgedDispatch = {
  readonly admitted: boolean;
  readonly completion: Deferred.Deferred<DispatchReceipt, DispatchError>;
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
  readonly mailbox: Queue.Queue<ActorMailboxFact<DefinitionValue>, ActorMailboxError>;
  readonly consumer: Effect.Effect<void, ActorMailboxError>;
  readonly snapshot: () => ActorSnapshot<DefinitionValue>;
  readonly send: (command: ActorCommand<DefinitionValue>) => void;
  readonly dispatch: (command: ActorCommand<DefinitionValue>) => AcknowledgedDispatch;
  readonly snapshots: Stream.Stream<ActorSnapshot<DefinitionValue>>;
  readonly drain: () => Effect.Effect<void, ActorMailboxError>;
  readonly shutdown: (mode: "graceful" | "hard") => Effect.Effect<void, ActorMailboxError>;
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
) => Effect.Effect<ActorEngine<DefinitionValue>, ActorMailboxError>;

/** Creates the public projection without exposing engine ownership or acknowledgement. */
export declare const actorHandle: <DefinitionValue extends MachineDefinition>(
  engine: ActorEngine<DefinitionValue>,
) => ActorHandle<DefinitionValue>;
