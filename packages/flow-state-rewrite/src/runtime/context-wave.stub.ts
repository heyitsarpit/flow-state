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

/** One provider binding uses native identity maps and a fixed authored context slot. */
export type ContextBinding<DefinitionValue extends MachineDefinition> = {
  readonly consumer: ActorKey;
  readonly consumerIncarnation: ActorIncarnation;
  readonly slot: keyof ContextOf<DefinitionValue> & string;
  readonly provider: ActorRef<Machine<DefinitionValue>>;
  readonly providerFence: ActorFence;
  readonly select: ActorContextBinding<DefinitionValue>["select"];
};

/** Provider nodes are indexed by exact actor identity, not by a structural hash. */
export type ContextProviderNode<DefinitionValue extends MachineDefinition> = {
  readonly key: ActorKey;
  readonly incarnation: ActorIncarnation;
  readonly ref: ActorRef<Machine<DefinitionValue>>;
};

/** The graph keeps forward bindings and reverse adjacency for dependency-ordered waves. */
export type ContextGraph<DefinitionValue extends MachineDefinition> = {
  readonly providers: ReadonlyMap<ActorKey, ContextProviderNode<DefinitionValue>>;
  readonly bindings: ReadonlyMap<ActorKey, readonly ContextBinding<DefinitionValue>[]>;
  readonly dependents: ReadonlyMap<ActorKey, ReadonlySet<ActorKey>>;
  readonly order: readonly ActorKey[];
};

/** Provider revisions are compared as a vector so repeated waves can be coalesced safely. */
export type ProviderRevisionVector = ReadonlyMap<ActorKey, number>;

/** Graph construction distinguishes cycles from missing or foreign providers. */
export type ContextGraphError = {
  readonly _tag: "ContextGraphError";
  readonly reason: "missing-provider" | "foreign-provider" | "cycle";
  readonly path: readonly ActorKey[];
};

/** A selected context value preserves authored null and undefined as ordinary values. */
export type ContextSelection<DefinitionValue extends MachineDefinition> = {
  readonly binding: ContextBinding<DefinitionValue>;
  readonly slot: keyof ContextOf<DefinitionValue> & string;
  readonly value: ActorContextValue<DefinitionValue>;
  readonly providerRevision: number;
};

/** Selector defects are issue-only publications; they do not emit context events. */
export type ContextSelectorDefect<DefinitionValue extends MachineDefinition> = {
  readonly binding: ContextBinding<DefinitionValue>;
  readonly consumer: ActorKey;
  readonly slot: keyof ContextOf<DefinitionValue> & string;
  readonly providerRevision: number;
  readonly diagnostic: PublicDiagnostic;
};

/** One ledger entry retains the prior cut, last valid value, and memoized defect. */
export type ContextSelectionLedgerEntry<DefinitionValue extends MachineDefinition> = {
  readonly binding: ContextBinding<DefinitionValue>;
  readonly previous: Option.Option<ContextSelection<DefinitionValue>>;
  readonly lastValid: Option.Option<ContextSelection<DefinitionValue>>;
  readonly providerRevision: number;
  readonly defect: Option.Option<ContextSelectorDefect<DefinitionValue>>;
};

/** Ledger keys are binding identities; the slot remains explicit for diagnostics and review. */
export type ContextSelectionLedger<DefinitionValue extends MachineDefinition> = {
  readonly entries: ReadonlyMap<
    ContextBinding<DefinitionValue>,
    ContextSelectionLedgerEntry<DefinitionValue>
  >;
  readonly providerRevisions: ProviderRevisionVector;
};

/** A consumer projection is one atomic cut of all selected slots, never an intermediate cut. */
export type ContextProjection<DefinitionValue extends MachineDefinition> = {
  readonly consumer: ActorKey;
  readonly values: ReadonlyMap<
    keyof ContextOf<DefinitionValue> & string,
    ActorContextValue<DefinitionValue>
  >;
  readonly revisions: ProviderRevisionVector;
  readonly changedSlots: ReadonlySet<keyof ContextOf<DefinitionValue> & string>;
};

/** One bounded propagation wave has one dependency order and one latest vector. */
export type ContextWave = {
  readonly providerRevision: ProviderRevisionVector;
  readonly dirty: ReadonlySet<ActorKey>;
  readonly order: readonly ActorKey[];
  readonly coalesced: boolean;
};

/** Provider publication remains committed even when selectors defect or values are unchanged. */
export type ContextWaveResult<DefinitionValue extends MachineDefinition> = {
  readonly _tag: "context-wave-published";
  readonly wave: ContextWave;
  readonly projections: readonly ContextProjection<DefinitionValue>[];
  readonly ledger: ContextSelectionLedger<DefinitionValue>;
  readonly selectorDefects: readonly ContextSelectorDefect<DefinitionValue>[];
};

/** Builds native identity graph indexes and rejects missing, foreign, and cyclic edges. */
export declare const buildContextGraph: <DefinitionValue extends MachineDefinition>(
  bindings: readonly ContextBinding<DefinitionValue>[],
) => Result.Result<ContextGraph<DefinitionValue>, ContextGraphError>;

/** Detects cycles before any consumer receives a context projection. */
export declare const detectContextCycles: <DefinitionValue extends MachineDefinition>(
  graph: ContextGraph<DefinitionValue>,
) => Result.Result<readonly ActorKey[], ContextGraphError>;

/** Returns dependency-first order for one bounded propagation wave. */
export declare const topologicalContextOrder: <DefinitionValue extends MachineDefinition>(
  graph: ContextGraph<DefinitionValue>,
  dirty: ReadonlySet<ActorKey>,
) => Result.Result<readonly ActorKey[], ContextGraphError>;

/** Uses complete-value Object.is semantics for scalar and authored record selections. */
export declare const equalContextSelection: <Value>(current: Value, previous: Value) => boolean;

/** Selects one provider snapshot without executing Effects or mutating the graph. */
export declare const selectContext: <DefinitionValue extends MachineDefinition>(
  binding: ContextBinding<DefinitionValue>,
  providerSnapshot: ActorContextSnapshot<DefinitionValue>,
  providerRevision: number,
) => Result.Result<ContextSelection<DefinitionValue>, ContextSelectorDefect<DefinitionValue>>;

/** Coalesces adjacent provider revisions and computes one latest dependency-ordered wave. */
export declare const planContextWave: <DefinitionValue extends MachineDefinition>(
  graph: ContextGraph<DefinitionValue>,
  providerRevision: ProviderRevisionVector,
  dirty: ReadonlySet<ActorKey>,
  previous: Option.Option<ContextWave>,
) => Result.Result<ContextWave, ContextGraphError>;

/** Produces changed-value or last-valid projections from one ledger and one planned wave. */
export declare const applyContextWave: <DefinitionValue extends MachineDefinition>(
  wave: ContextWave,
  graph: ContextGraph<DefinitionValue>,
  snapshots: ReadonlyMap<ActorKey, ActorContextSnapshot<DefinitionValue>>,
  previous: ContextSelectionLedger<DefinitionValue>,
) => Result.Result<ContextWaveResult<DefinitionValue>, ContextGraphError>;
