// STUB: Replaceable/deletable implementation guidance; this file is not shipped behavior.

import type { Option, Result } from "effect";

import type { ContextOf } from "../definition/domain.js";
import type { PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type {
  ActorContextBinding,
  ActorContextSnapshot,
  ActorContextValue,
  ActorFence,
  ActorIncarnation,
  ActorKey,
} from "./actor-admission.stub.js";
import type { ActorRef } from "./actor-ref.js";
import type { Machine } from "../machine/machine.js";
import type { MachineDefinition } from "../machine/grammar.js";

/*
 * Data
 *
 * A binding names a consumer slot, the exact provider ActorRef, its actor
 * fence, and the provider SelectorInput. Graphs use native identity maps;
 * revisions, ledgers, projections, and dirty sets are immutable cuts.
 *
 * Admission and invariants
 *
 * Build and cycle-check the graph before any consumer projection. A wave is
 * dependency ordered and coalesces adjacent provider revisions. A selector
 * defect keeps the last valid value and emits an issue-only diagnostic.
 *
 * Pure data operations
 *
 * Selection reads state, memory, and context without running an Effect. Scalar
 * and named-record values compare with Object.is; named records compare each
 * fixed authored field, not whole-record identity. Option marks absent ledger
 * metadata, while selected null and undefined are values.
 *
 * Effect execution
 *
 * The mailbox owner schedules one bounded wave and publishes one atomic
 * consumer projection. Provider publication remains committed when a selector
 * defects or a value is equal; no hidden context runner is prescribed here.
 */

/** One provider binding uses native identity maps and a fixed authored context slot. */
export type ContextBinding<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
  Slot extends keyof ContextOf<ConsumerDefinition> & string = keyof ContextOf<ConsumerDefinition> &
    string,
  ProviderRef extends ActorRef<Machine<ProviderDefinition>> = ActorRef<Machine<ProviderDefinition>>,
> = Slot extends keyof ContextOf<ConsumerDefinition> & string
  ? {
      readonly consumer: ActorKey;
      readonly consumerIncarnation: ActorIncarnation;
      readonly slot: Slot;
      readonly provider: ProviderRef;
      readonly providerFence: ActorFence;
      readonly select: ActorContextBinding<
        ConsumerDefinition,
        ProviderDefinition,
        Slot,
        ProviderRef
      >["select"];
    }
  : never;

/** Provider nodes are indexed by exact actor identity, not by a structural hash. */
export type ContextProviderNode<ProviderDefinition extends MachineDefinition> = {
  readonly key: ActorKey;
  readonly incarnation: ActorIncarnation;
  readonly ref: ActorRef<Machine<ProviderDefinition>>;
};

/** The graph keeps forward bindings and reverse adjacency for dependency-ordered waves. */
export type ContextGraph<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
> = {
  readonly providers: ReadonlyMap<ActorKey, ContextProviderNode<ProviderDefinition>>;
  readonly bindings: ReadonlyMap<
    ActorKey,
    readonly ContextBinding<ConsumerDefinition, ProviderDefinition>[]
  >;
  readonly dependents: ReadonlyMap<ActorKey, ReadonlySet<ActorKey>>;
  readonly order: readonly ActorKey[];
};

/** Provider revisions are compared as a vector so repeated waves can be coalesced safely. */
export type ProviderRevisionVector = ReadonlyMap<ActorKey, number>;

/** A selected context value preserves authored null and undefined as ordinary values. */
export type ContextSelection<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
  Slot extends keyof ContextOf<ConsumerDefinition> & string = keyof ContextOf<ConsumerDefinition> &
    string,
> = {
  readonly binding: ContextBinding<ConsumerDefinition, ProviderDefinition, Slot>;
  readonly slot: Slot;
  readonly value: ActorContextValue<ConsumerDefinition, Slot>;
  readonly providerRevision: number;
};

/** Selector defects are issue-only publications; they do not emit context events. */
export type ContextSelectorDefect<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
  Slot extends keyof ContextOf<ConsumerDefinition> & string = keyof ContextOf<ConsumerDefinition> &
    string,
> = {
  readonly binding: ContextBinding<ConsumerDefinition, ProviderDefinition, Slot>;
  readonly consumer: ActorKey;
  readonly slot: Slot;
  readonly providerRevision: number;
  readonly diagnostic: PublicDiagnostic;
};

/** One ledger entry retains the prior cut, last valid value, and memoized defect. */
export type ContextSelectionLedgerEntry<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
  Slot extends keyof ContextOf<ConsumerDefinition> & string = keyof ContextOf<ConsumerDefinition> &
    string,
> = {
  readonly binding: ContextBinding<ConsumerDefinition, ProviderDefinition, Slot>;
  readonly previous: Option.Option<ContextSelection<ConsumerDefinition, ProviderDefinition, Slot>>;
  readonly lastValid: Option.Option<ContextSelection<ConsumerDefinition, ProviderDefinition, Slot>>;
  readonly providerRevision: number;
  readonly defect: Option.Option<
    ContextSelectorDefect<ConsumerDefinition, ProviderDefinition, Slot>
  >;
};

/** Ledger keys are binding identities; the slot remains explicit for diagnostics and review. */
export type ContextSelectionLedger<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
> = {
  readonly entries: ReadonlyMap<
    ContextBinding<ConsumerDefinition, ProviderDefinition>,
    ContextSelectionLedgerEntry<ConsumerDefinition, ProviderDefinition>
  >;
  readonly providerRevisions: ProviderRevisionVector;
};

/** A consumer projection is one atomic cut of all selected slots, never an intermediate cut. */
export type ContextProjection<ConsumerDefinition extends MachineDefinition> = {
  readonly consumer: ActorKey;
  readonly values: ReadonlyMap<
    keyof ContextOf<ConsumerDefinition> & string,
    ActorContextValue<ConsumerDefinition>
  >;
  readonly revisions: ProviderRevisionVector;
  readonly changedSlots: ReadonlySet<keyof ContextOf<ConsumerDefinition> & string>;
};

/** One bounded propagation wave has one dependency order and one latest vector. */
export type ContextWave = {
  readonly providerRevision: ProviderRevisionVector;
  readonly dirty: ReadonlySet<ActorKey>;
  readonly order: readonly ActorKey[];
  readonly coalesced: boolean;
};

/** Provider publication remains committed even when selectors defect or values are unchanged. */
export type ContextWaveResult<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
> = {
  readonly _tag: "context-wave-published";
  readonly wave: ContextWave;
  readonly projections: readonly ContextProjection<ConsumerDefinition>[];
  readonly ledger: ContextSelectionLedger<ConsumerDefinition, ProviderDefinition>;
  readonly selectorDefects: readonly ContextSelectorDefect<
    ConsumerDefinition,
    ProviderDefinition
  >[];
};

/** Builds native identity graph indexes and projects refusal to PublicDiagnostic. */
export declare const buildContextGraph: <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
>(
  bindings: readonly ContextBinding<ConsumerDefinition, ProviderDefinition>[],
) => Result.Result<ContextGraph<ConsumerDefinition, ProviderDefinition>, PublicDiagnostic>;

/** Detects cycles before any consumer receives a context projection. */
export declare const detectContextCycles: <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
>(
  graph: ContextGraph<ConsumerDefinition, ProviderDefinition>,
) => Result.Result<readonly ActorKey[], PublicDiagnostic>;

/** Returns dependency-first order for one bounded propagation wave. */
export declare const topologicalContextOrder: <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
>(
  graph: ContextGraph<ConsumerDefinition, ProviderDefinition>,
  dirty: ReadonlySet<ActorKey>,
) => Result.Result<readonly ActorKey[], PublicDiagnostic>;

/** Uses scalar Object.is and fixed-key fieldwise Object.is for named records. */
export declare const equalContextSelection: <Value>(current: Value, previous: Value) => boolean;

/** Selects one provider snapshot without executing Effects or mutating the graph. */
export declare const selectContext: <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
  Slot extends keyof ContextOf<ConsumerDefinition> & string,
>(
  binding: ContextBinding<ConsumerDefinition, ProviderDefinition, Slot>,
  providerSnapshot: ActorContextSnapshot<ProviderDefinition>,
  providerRevision: number,
) => Result.Result<
  ContextSelection<ConsumerDefinition, ProviderDefinition, Slot>,
  ContextSelectorDefect<ConsumerDefinition, ProviderDefinition, Slot>
>;

/** Coalesces adjacent provider revisions and computes one latest dependency-ordered wave. */
export declare const planContextWave: <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
>(
  graph: ContextGraph<ConsumerDefinition, ProviderDefinition>,
  providerRevision: ProviderRevisionVector,
  dirty: ReadonlySet<ActorKey>,
  previous: Option.Option<ContextWave>,
) => Result.Result<ContextWave, PublicDiagnostic>;

/** Produces changed-value or last-valid projections from one ledger and one planned wave. */
export declare const applyContextWave: <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
>(
  wave: ContextWave,
  graph: ContextGraph<ConsumerDefinition, ProviderDefinition>,
  snapshots: ReadonlyMap<ActorKey, ActorContextSnapshot<ProviderDefinition>>,
  previous: ContextSelectionLedger<ConsumerDefinition, ProviderDefinition>,
) => Result.Result<ContextWaveResult<ConsumerDefinition, ProviderDefinition>, PublicDiagnostic>;
