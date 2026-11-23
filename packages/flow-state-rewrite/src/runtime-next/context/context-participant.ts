import { Deferred, Effect, Option, Result } from "effect";

import type { MachineDefinition } from "../../machine/grammar.js";
import type { Machine } from "../../machine/machine.js";
import { Defect, Failure, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { ActorRef } from "../../public/types.js";
import type { ActorSnapshot } from "../runtime.js";
import type { ActorIdentity } from "../actor/actor-directory.js";
import { copyStructural } from "../structural-copy.js";
import {
  applyContextWave,
  installContextBaseline,
  type ContextGraphEdge,
  type ContextSelectionBatch,
} from "./context-wave.js";
import {
  makeContextOffer,
  makeContextTicket,
  type ContextOffer,
  type ContextTicket,
  type IssuedContextTicket,
} from "./context-ticket.js";
import {
  mergeOwnedContextLineage,
  makeContextDebtOps,
  type ContextCut,
  type ContextEdgeDebt,
  type ContextLineage,
  type ContextLineageProvider,
} from "./lineage.js";
import { reconcileOwnedContextDebtBatch, type ContextDebtUpdate } from "./context-debt.js";

type OpaqueIdentity = Exclude<WeakKey, symbol>;

// oxlint-disable-next-line anti-slop/no-readonly -- The participant publishes one immutable outcome paired with its resulting actor snapshot.
export type ContextTicketOutcome<D extends MachineDefinition> = Readonly<{
  status: "published" | "no-op" | "stale";
  snapshot: ActorSnapshot<D>;
}>;

// oxlint-disable-next-line anti-slop/no-readonly -- The projection ticket keeps its wait and cancel capabilities fixed for its lifetime.
export type ContextProjectionTicket<D extends MachineDefinition> = Readonly<{
  wait: Effect.Effect<ContextTicketOutcome<D>, PublicDiagnostic>;
  cancel(): void;
}>;

export interface ContextParticipant<D extends MachineDefinition> {
  // oxlint-disable-next-line anti-slop/no-readonly -- The admitted participant keeps the same actor identity for the coordinator lifetime.
  readonly ref: ActorRef<Machine<D>>;
  snapshot(): ActorSnapshot<D>;
  offerContext(
    ticket: ContextTicket<D>,
  ): Result.Result<ContextProjectionTicket<D>, PublicDiagnostic>;
}

// oxlint-disable-next-line anti-slop/no-readonly -- Captured provider identity and snapshot form one immutable observation cut.
export type ContextCapturedProvider = Readonly<{
  identity: ActorIdentity;
  snapshot: ActorSnapshot<MachineDefinition>;
}>;

export type ContextCaptureNode = {
  identity: ActorIdentity;
  opaqueIdentities: OpaqueIdentity[];
  snapshot(): ActorSnapshot<MachineDefinition>;
};

export type ContextProviderCutNode = {
  identity: ActorIdentity;
  registered: boolean;
  snapshot(): ActorSnapshot<MachineDefinition>;
};

/** Verify the captured cut still names the live provider incarnation and revision. */
export const validateContextProviderCut = (
  cut: ContextCut,
  captured: Map<string, ContextCapturedProvider>,
  lookup: (key: string) => ContextProviderCutNode | undefined,
) => {
  const observed = captured.get(cut.identity.key);
  const live = lookup(cut.identity.key);

  if (
    observed === undefined ||
    live === undefined ||
    !live.registered ||
    !Object.is(live.identity, cut.identity) ||
    observed.snapshot.revision !== cut.revision
  )
    return Result.fail(contextDiagnostic("stale-provider-cut", cut.identity.key));

  const current = Result.try({ try: () => live.snapshot().revision, catch: Defect });

  return Result.isFailure(current) || current.success !== cut.revision
    ? Result.fail(contextDiagnostic("stale-provider-cut", cut.identity.key))
    : Result.succeed(undefined);
};

/** Recheck every provider cut captured for a dormant initial offer. */
export const validateCapturedContextCuts = (
  captured: Map<string, ContextCapturedProvider>,
  lookup: (key: string) => ContextProviderCutNode | undefined,
) => {
  for (const provider of captured.values()) {
    const valid = validateContextProviderCut(
      { identity: provider.identity, revision: provider.snapshot.revision },
      captured,
      lookup,
    );

    if (Result.isFailure(valid)) return Result.fail(valid.failure);
  }

  return Result.succeed(undefined);
};

/** Own the observed snapshot before a wave passes it to selectors. */
// RETURN_TYPE: Captured provider ownership exposes typed copy failure.
export const captureContextParticipant = (
  state: ContextCaptureNode,
): Result.Result<ContextCapturedProvider, PublicDiagnostic> => {
  const observed = Result.try({ try: () => state.snapshot(), catch: Defect });

  if (Result.isFailure(observed)) return Result.fail(observed.failure);
  const owned = copyStructural(observed.success, "context", state.opaqueIdentities);

  return Result.isFailure(owned)
    ? Result.fail(owned.failure)
    : Result.succeed({ identity: state.identity, snapshot: owned.success });
};

/** Assembly supplies the admitted participant and its current context bindings. */
// oxlint-disable-next-line anti-slop/no-readonly -- The registered context node keeps its captured provider and opacity policy immutable.
export type ContextNode<D extends MachineDefinition> = Readonly<{
  identity: ActorIdentity;
  participant: ContextParticipant<D>;
  // oxlint-disable-next-line anti-slop/no-readonly -- The registered context node keeps its captured provider and opacity policy immutable.
  providers: readonly ContextGraphEdge[];
  // oxlint-disable-next-line anti-slop/no-readonly -- The registered context node keeps its captured provider and opacity policy immutable.
  opaqueIdentities: readonly OpaqueIdentity[];
  selectionBatch(
    // oxlint-disable-next-line anti-slop/no-readonly -- Selection receives a read-only captured-provider index and cannot mutate coordinator snapshots.
    captured: ReadonlyMap<string, ContextCapturedProvider>,
  ): Result.Result<ContextSelectionBatch<D>, PublicDiagnostic>;
}>;

// oxlint-disable-next-line anti-slop/no-readonly -- Planned context work is an immutable result until the coordinator commits or cancels it.
export type PlannedContextNode = Readonly<{
  publication: "unchanged" | "changed" | "issue-only";
  offer: Option.Option<Result.Result<ContextProjectionTicket<MachineDefinition>, PublicDiagnostic>>;
  issueOnly: boolean;
  cancelTicket(): void;
  commit(): void;
}>;

export type InitialContextWork = {
  projection: ContextProjectionTicket<MachineDefinition>;
  cancelTicket(): void;
  done: Deferred.Deferred<void, PublicDiagnostic>;
};

export type PreparedContextParticipant = {
  snapshot(): ActorSnapshot<MachineDefinition>;
  plan(
    // oxlint-disable-next-line anti-slop/no-readonly -- Selection receives a read-only captured-provider index and cannot mutate coordinator snapshots.
    captured: ReadonlyMap<string, ContextCapturedProvider>,
    issueTicket: (
      offer: ContextOffer<MachineDefinition>,
      expectedRevision: number,
    ) => IssuedContextTicket<MachineDefinition>,
  ): Result.Result<PlannedContextNode, PublicDiagnostic>;
  initial: Option.Option<InitialContextWork>;
};

/** Coordinator-owned state for one registered participant. */
export type RegisteredContextNode = {
  identity: ActorIdentity;
  providers: ContextGraphEdge[];
  enabled: boolean;
  registered: boolean;
  opaqueIdentities: OpaqueIdentity[];
  snapshot(): ActorSnapshot<MachineDefinition>;
  plan: PreparedContextParticipant["plan"];
  lineage: ContextLineage;
  debt: ContextEdgeDebt;
};

export type ContextLineageNode = {
  identity: ActorIdentity;
  providers: ContextGraphEdge[];
  lineage: ContextLineage;
  debt: ContextEdgeDebt;
};

type ContextWaveNode = ContextLineageNode & { registered: boolean; enabled: boolean };

type ContextWaveNodeFailure = {
  outcome: "stale" | "blocked";
  diagnostic: PublicDiagnostic;
  debt: Option.Option<ContextEdgeDebt>;
};

/** A descendant waits when any required parent failed to publish its cut. */
// RETURN_TYPE: The readiness predicate is always a boolean for each participant.
export const contextBlockedByAncestor = (
  state: ContextLineageNode,
  outcomes: Map<string, string>,
): boolean =>
  state.providers.some(({ provider }) => {
    const outcome = outcomes.get(provider.key);

    return (
      outcome === "rejected" || outcome === "blocked" || outcome === "stale" || outcome === "defect"
    );
  });

/** Resolve one node's readiness, retained debt, and lineage before an offer. */
export const prepareContextWaveNode = (
  identity: ActorIdentity,
  state: ContextWaveNode | undefined,
  current: () => boolean,
  outcomes: Map<string, string>,
  // oxlint-disable-next-line anti-slop/no-readonly -- Debt reconciliation reads planned lineage updates without mutating the caller-owned map.
  changes: ReadonlyMap<string, ContextLineage>,
  captured: Map<string, ContextCapturedProvider>,
  lookup: (key: string) => ContextLineageNode | undefined,
  debt = makeContextDebtOps(),
) => {
  if (
    !current() ||
    state === undefined ||
    !state.registered ||
    !state.enabled ||
    !Object.is(state.identity, identity)
  )
    return Result.fail<ContextWaveNodeFailure>({
      outcome: "stale",
      diagnostic: contextDiagnostic("stale-participant", identity.key),
      debt: Option.none(),
    });

  if (contextBlockedByAncestor(state, outcomes)) {
    const retained = retainBlockedContextDebt(state, changes, lookup, debt);

    return Result.fail<ContextWaveNodeFailure>({
      outcome: "blocked",
      diagnostic: Result.isFailure(retained)
        ? retained.failure
        : contextDiagnostic("blocked-ancestor", identity.key),
      debt: Result.isSuccess(retained) ? Option.some(retained.success) : Option.none(),
    });
  }

  const planned = planContextLineage(state, captured, lookup, debt);

  return Result.isFailure(planned)
    ? Result.fail<ContextWaveNodeFailure>({
        outcome: "stale",
        diagnostic: planned.failure,
        debt: Option.none(),
      })
    : Result.succeed(planned.success);
};

export const contextDiagnostic = (reason: string, key?: string) =>
  Failure({
    code: "MissingContextProvider",
    path: key === undefined ? ["context"] : ["context", key],
    details: key === undefined ? { reason } : { reason, actor: key },
    summary: "Context coordination could not complete this cut.",
    help: "Reconcile a current registered provider and retry the context update.",
  });

/** Retain required ancestor cuts when a preceding edge cannot publish. */
// RETURN_TYPE: Debt reconciliation exposes a typed edge-debt Result.
export const retainBlockedContextDebt = (
  state: ContextLineageNode,
  // oxlint-disable-next-line anti-slop/no-readonly -- Debt reconciliation reads planned lineage updates without mutating the caller-owned map.
  changes: ReadonlyMap<string, ContextLineage>,
  lookup: (key: string) => ContextLineageNode | undefined,
  debt = makeContextDebtOps(),
): Result.Result<ContextEdgeDebt, PublicDiagnostic> => {
  const updates: ContextDebtUpdate[] = [];

  for (const edge of state.providers) {
    const parent = lookup(edge.provider.key);

    if (parent === undefined)
      return Result.fail(contextDiagnostic("missing-debt-provider", state.identity.key));
    updates.push({
      edge: edge.provider.key,
      changed: changes.get(edge.provider.key) ?? new Map(),
      covered: parent.lineage,
      inherited: true,
    });
  }

  return reconcileOwnedContextDebtBatch(state.debt, updates, debt);
};

const collectContextLineageProviders = (
  state: ContextLineageNode,
  captured: Map<string, ContextCapturedProvider>,
  lookup: (key: string) => ContextLineageNode | undefined,
) => {
  const providers: ContextLineageProvider[] = [];

  for (const edge of state.providers) {
    const capturedProvider = captured.get(edge.provider.key);
    const parent = lookup(edge.provider.key);

    if (
      capturedProvider === undefined ||
      parent === undefined ||
      !Object.is(parent.identity, edge.provider)
    )
      return Result.fail(contextDiagnostic("stale-provider", state.identity.key));

    providers.push({
      slot: edge.slot,
      cut: { identity: capturedProvider.identity, revision: capturedProvider.snapshot.revision },
      lineage: parent.lineage,
    });
  }

  return Result.succeed(providers);
};

/** Plan one participant's lineage and clear only covered edge debt. */
// RETURN_TYPE: Lineage planning returns the complete providers, lineage, and debt contract.
export const planContextLineage = (
  state: ContextLineageNode,
  captured: Map<string, ContextCapturedProvider>,
  lookup: (key: string) => ContextLineageNode | undefined,
  debtOps = makeContextDebtOps(),
): Result.Result<
  {
    providers: ContextLineageProvider[];
    lineage: ContextLineage;
    debt: ContextEdgeDebt;
  },
  PublicDiagnostic
> => {
  const collected = collectContextLineageProviders(state, captured, lookup);

  if (Result.isFailure(collected)) return Result.fail(collected.failure);
  const providers = collected.success;

  const lineage = mergeOwnedContextLineage(state.identity, state.lineage, providers);

  if (Result.isFailure(lineage)) return Result.fail(lineage.failure);

  const debt = reconcileOwnedContextDebtBatch(
    state.debt,
    providers
      .filter((provider) => state.debt.has(provider.cut.identity.key))
      .map((provider) => ({
        edge: provider.cut.identity.key,
        changed: new Map(),
        covered: provider.lineage,
        inherited: false,
      })),
    debtOps,
  );

  if (Result.isFailure(debt)) return Result.fail(debt.failure);

  return Result.succeed({ providers, lineage: lineage.success, debt: debt.success });
};

/** Select and admit one complete initial baseline without mutating registration. */
// RETURN_TYPE: Admission returns the complete prepared participant or one diagnostic.
export const prepareContextParticipant = <D extends MachineDefinition>(
  node: ContextNode<D>,
  // oxlint-disable-next-line anti-slop/no-readonly -- Selection receives a read-only captured-provider index and cannot mutate coordinator snapshots.
  captured: ReadonlyMap<string, ContextCapturedProvider>,
  validateInitial: () => Result.Result<void, PublicDiagnostic>,
): Result.Result<PreparedContextParticipant, PublicDiagnostic> => {
  const batch = node.selectionBatch(captured);

  if (Result.isFailure(batch)) return Result.fail(batch.failure);
  const baseline = installContextBaseline<D>(batch.success);

  if (Result.isFailure(baseline)) return Result.fail(baseline.failure);
  let currentBaseline = baseline.success;
  let initial = Option.none<InitialContextWork>();

  if (batch.success.slots.length > 0) {
    const offer = makeContextOffer<D>({
      ...baseline.success,
      changedSlots: new Set(batch.success.slots),
      selectorDefects: [],
      publication: "changed",
    });

    if (Result.isFailure(offer)) return Result.fail(offer.failure);
    const observed = Result.try({ try: () => node.participant.snapshot(), catch: Defect });

    if (Result.isFailure(observed)) return Result.fail(observed.failure);

    const issued = makeContextTicket<D>({
      offer: offer.success,
      identity: node.identity,
      expectedRevision: observed.success.revision,
      validateCurrent: validateInitial,
    });

    const admitted = Result.try({
      try: () => node.participant.offerContext(issued.ticket),
      catch: Defect,
    }).pipe(Result.flatMap((value) => value));

    if (Result.isFailure(admitted)) {
      issued.cancel();

      return Result.fail(admitted.failure);
    }

    initial = Option.some({
      projection: admitted.success,
      cancelTicket: issued.cancel,
      done: Deferred.makeUnsafe(),
    });
  }

  return Result.succeed({
    snapshot: () => node.participant.snapshot(),
    initial,
    plan(captured, issueTicket) {
      const nextBatch = node.selectionBatch(captured);

      if (Result.isFailure(nextBatch)) return Result.fail(nextBatch.failure);
      const selected = applyContextWave<D>(currentBaseline, nextBatch.success);

      if (Result.isFailure(selected)) return Result.fail(selected.failure);
      const result = selected.success;

      if (result.publication === "unchanged")
        return Result.succeed({
          publication: "unchanged" as const,
          offer: Option.none(),
          issueOnly: false,
          cancelTicket() {},
          commit() {
            currentBaseline = result;
          },
        });

      const current = node.participant.snapshot();
      const offer = makeContextOffer<D>(result);

      if (Result.isFailure(offer)) return Result.fail(offer.failure);
      const issued = issueTicket(offer.success, current.revision);

      const offered = Result.try({
        try: () => node.participant.offerContext(issued.ticket),
        catch: Defect,
      }).pipe(Result.flatMap((value) => value));

      return Result.succeed({
        publication: result.publication,
        offer: Option.some(offered),
        issueOnly: result.publication === "issue-only",
        cancelTicket: issued.cancel,
        commit() {
          currentBaseline = result;
        },
      });
    },
  });
};
