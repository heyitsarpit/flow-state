import { Data, Option, Result } from "effect";

import type { ContextOf, ContextSelector, SelectorInput } from "../../definition/domain.js";
import { Defect, Failure, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { MachineDefinition } from "../../machine/grammar.js";
import type { ActorIdentity } from "../actor/actor-directory.js";
import { copyStructural } from "../structural-copy.js";
import type { ContextCut } from "./lineage.js";

export type ContextSlot<D extends MachineDefinition> = keyof ContextOf<D> & string;

type Slot<D extends MachineDefinition> = ContextSlot<D>;

type OpaqueIdentity = Exclude<WeakKey, symbol>;

type ProviderOf<D extends MachineDefinition, S extends Slot<D>> = D extends {
  context: infer Context;
}
  ? S extends keyof Context
    ? Context[S] extends ContextSelector<unknown, infer Provider>
      ? Provider extends MachineDefinition
        ? Provider
        : MachineDefinition
      : MachineDefinition
    : MachineDefinition
  : MachineDefinition;

export { buildContextGraph, planContextWave } from "./context-graph.js";

export type {
  ContextGraph,
  ContextGraphEdge,
  ContextGraphNode,
  ContextWavePlan,
} from "./context-graph.js";

export type ContextSelectionRequest<D extends MachineDefinition, S extends Slot<D> = Slot<D>> = {
  // oxlint-disable-next-line anti-slop/no-readonly -- Each selector request preserves its exact slot-specific input and callback as one immutable value.
  [K in S]: Readonly<{
    slot: K;
    provider: ActorIdentity;
    cut: ContextCut;
    input: SelectorInput<ProviderOf<D, K>>;
    select: (input: SelectorInput<ProviderOf<D, K>>) => ContextOf<D>[K];
    // oxlint-disable-next-line anti-slop/no-readonly -- The selector request fixes the opaque identity policy used when copying its value.
    opaqueIdentities: readonly OpaqueIdentity[];
  }>;
}[S];

// oxlint-disable-next-line anti-slop/no-readonly -- One admitted selection batch keeps its requested slots and callbacks fixed.
export type ContextSelectionBatch<D extends MachineDefinition> = Readonly<{
  // oxlint-disable-next-line anti-slop/no-readonly -- Preparation uses the exact admitted slot set without caller mutation.
  slots: readonly Slot<D>[];
  // oxlint-disable-next-line anti-slop/no-readonly -- The selector requests cannot change between admission and wave evaluation.
  requests: readonly ContextSelectionRequest<D>[];
}>;

// oxlint-disable-next-line anti-slop/no-readonly -- A selected value and its authored identity and cut are published as one immutable observation.
export type ContextSelected<Value = unknown> = Readonly<{
  value: Value;
  authoredIdentity: Value;
  cut: ContextCut;
}>;

export type ContextSelectionAttempt<Value = unknown> =
  // oxlint-disable-next-line anti-slop/no-readonly -- A successful selection attempt is a fixed owner result for this provider cut.
  | Readonly<{ kind: "success"; cut: ContextCut; selected: ContextSelected<Value> }>
  // oxlint-disable-next-line anti-slop/no-readonly -- A defect attempt preserves its exact provider cut and diagnostic.
  | Readonly<{ kind: "defect"; cut: ContextCut; diagnostic: PublicDiagnostic }>;

// oxlint-disable-next-line anti-slop/no-readonly -- A ledger entry preserves the last valid selection and latest attempt as a snapshot.
export type ContextSelectionEntry<Value = unknown> = Readonly<{
  slot: string;
  lastValid: Option.Option<ContextSelected<Value>>;
  pending: Option.Option<ContextSelected<Value>>;
  lastAttempt: ContextSelectionAttempt<Value>;
}>;

// oxlint-disable-next-line anti-slop/no-readonly -- Coordinator ledger is a read-only selection snapshot; updates go through the wave owner.
export type ContextSelectionLedger<D extends MachineDefinition> = ReadonlyMap<
  Slot<D>,
  ContextSelectionEntry<ContextOf<D>[Slot<D>]>
>;

// oxlint-disable-next-line anti-slop/no-readonly -- The projection exposes selected context as an immutable owner snapshot.
export type ContextProjection<D extends MachineDefinition> = Readonly<{
  // oxlint-disable-next-line anti-slop/no-readonly -- Consumers can query owned selected values but cannot rewrite the projection.
  values: ReadonlyMap<Slot<D>, ContextOf<D>[Slot<D>]>;
  // oxlint-disable-next-line anti-slop/no-readonly -- Consumers can query the provider cuts but cannot rewrite the projection.
  providers: ReadonlyMap<Slot<D>, ContextCut>;
  has(slot: Slot<D>): boolean;
}>;

// oxlint-disable-next-line anti-slop/no-readonly -- The installed baseline is a fixed projection and selection ledger snapshot.
export type ContextBaseline<D extends MachineDefinition> = Readonly<{
  projection: ContextProjection<D>;
  ledger: ContextSelectionLedger<D>;
}>;

// oxlint-disable-next-line anti-slop/no-readonly -- A selector defect is published with its immutable slot and provider identity.
export type ContextSelectorDefect<D extends MachineDefinition> = Readonly<{
  slot: Slot<D>;
  provider: ActorIdentity;
  diagnostic: PublicDiagnostic;
}>;

export type ContextWaveResult<D extends MachineDefinition> = ContextBaseline<D> &
  // oxlint-disable-next-line anti-slop/no-readonly -- The wave result remains an immutable publication decision and selection snapshot.
  Readonly<{
    // oxlint-disable-next-line anti-slop/no-readonly -- The changed-slot set is an immutable wave result used to classify publication.
    changedSlots: ReadonlySet<Slot<D>>;
    // oxlint-disable-next-line anti-slop/no-readonly -- Published selector defects cannot be changed after the wave completes.
    selectorDefects: readonly ContextSelectorDefect<D>[];
    publication: "unchanged" | "changed" | "issue-only";
  }>;

const invalid = (reason: string, path: string[] = ["context"]) =>
  Failure({
    code: "InvariantViolation",
    path,
    details: { reason },
    summary: "Context data is invalid.",
    help: "Use one current cut for every declared provider slot.",
  });

const sameIdentity = (a: ActorIdentity, b: ActorIdentity) =>
  a.key === b.key && a.incarnation === b.incarnation && a.kind === b.kind;

const validCut = (request: ContextSelectionRequest<MachineDefinition>) =>
  sameIdentity(request.provider, request.cut.identity) &&
  Number.isSafeInteger(request.cut.revision) &&
  request.cut.revision >= 0;

type PreparedRequest<D extends MachineDefinition> = {
  slot: Slot<D>;
  provider: ActorIdentity;
  cut: ContextCut;
  evaluate: () => ContextOf<D>[Slot<D>];
  opaqueIdentities: OpaqueIdentity[];
};

const prepareRequest = <D extends MachineDefinition>(
  request: ContextSelectionRequest<D>,
  previous?: ContextBaseline<D>,
) => {
  if (!validCut(request)) return Result.fail(invalid("invalid-cut", ["context", request.slot]));
  const prior = previous?.projection.providers.get(request.slot);

  if (
    prior !== undefined &&
    sameIdentity(prior.identity, request.cut.identity) &&
    prior.revision > request.cut.revision
  )
    return Result.fail(invalid("stale-cut", ["context", request.slot]));

  const input = copyStructural(request.input, "context", request.opaqueIdentities);

  if (Result.isFailure(input)) return Result.fail(input.failure);
  const selector = request.select;

  return Result.succeed({
    slot: request.slot,
    provider: request.provider,
    cut: { identity: request.cut.identity, revision: request.cut.revision },
    evaluate: () => selector(input.success),
    opaqueIdentities: [...request.opaqueIdentities],
  });
};

// RETURN_TYPE: Preflight preserves the mapped slot and diagnostic Result contract.
const preflight = <D extends MachineDefinition>(
  batch: ContextSelectionBatch<D>,
  previous?: ContextBaseline<D>,
): Result.Result<Map<Slot<D>, PreparedRequest<D>>, PublicDiagnostic> => {
  const slots = new Set<Slot<D>>();

  for (const slot of batch.slots) {
    if (slots.has(slot)) return Result.fail(invalid("duplicate-declared-slot", ["context", slot]));
    slots.add(slot);
  }

  const requests = new Map<Slot<D>, PreparedRequest<D>>();

  for (const request of batch.requests) {
    if (!slots.has(request.slot))
      return Result.fail(invalid("undeclared-slot", ["context", request.slot]));

    if (requests.has(request.slot))
      return Result.fail(invalid("duplicate-slot", ["context", request.slot]));

    const prepared = prepareRequest(request, previous);

    if (Result.isFailure(prepared)) return Result.fail(prepared.failure);
    requests.set(request.slot, prepared.success);
  }

  if (requests.size !== slots.size) return Result.fail(invalid("missing-slot"));

  return Result.succeed(requests);
};

// FLOW_STATE_ALLOW_UNKNOWN: Ownership comparison inspects an authored value without coercing it.
type PlainRecord = Record<PropertyKey, unknown>;

// RETURN_TYPE: A validated plain record can be compared by own descriptors.
const plainRecord = (value: unknown): value is PlainRecord => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
};

/** Compares owned authored values without reading the caller's mutable output again. */
// RETURN_TYPE: Equality must return a boolean for the selection boundary.
export const equalContextSelection = <Value>(current: Value, previous: Value): boolean => {
  if (!plainRecord(current) || !plainRecord(previous)) return Object.is(current, previous);
  const keys = Reflect.ownKeys(current);

  if (keys.length !== Reflect.ownKeys(previous).length) return false;

  return keys.every((key) => {
    const a = Object.getOwnPropertyDescriptor(current, key);
    const b = Object.getOwnPropertyDescriptor(previous, key);

    return (
      a !== undefined &&
      b !== undefined &&
      "value" in a &&
      "value" in b &&
      Object.is(a.value, b.value)
    );
  });
};

// RETURN_TYPE: Projection retains the declared machine slot mapping.
const projection = <D extends MachineDefinition>(
  // oxlint-disable-next-line anti-slop/no-readonly -- Projection construction reads and copies caller maps without mutating their contents.
  values: ReadonlyMap<Slot<D>, ContextOf<D>[Slot<D>]>,
  // oxlint-disable-next-line anti-slop/no-readonly -- Projection construction reads and copies caller maps without mutating their contents.
  providers: ReadonlyMap<Slot<D>, ContextCut>,
): ContextProjection<D> => {
  const ownedValues = new Map(values);
  const ownedProviders = new Map(providers);

  return {
    values: ownedValues,
    providers: ownedProviders,
    has: (slot) => ownedValues.has(slot),
  };
};

// RETURN_TYPE: Selector evaluation separates defects from validation failure.
const select = <D extends MachineDefinition>(
  request: PreparedRequest<D>,
): Result.Result<
  | { kind: "defect"; diagnostic: PublicDiagnostic }
  | { kind: "success"; selected: ContextSelected<ContextOf<D>[Slot<D>]> },
  PublicDiagnostic
> => {
  let authored: ContextOf<D>[Slot<D>];

  const evaluated = Result.try({ try: request.evaluate, catch: Defect });

  if (Result.isFailure(evaluated))
    return Result.succeed({ kind: "defect" as const, diagnostic: evaluated.failure });

  authored = evaluated.success;

  const copied = copyStructural(authored, "context", request.opaqueIdentities);

  if (Result.isFailure(copied)) return Result.fail(copied.failure);

  return Result.succeed({
    kind: "success" as const,
    selected: {
      value: copied.success,
      authoredIdentity: copied.success,
      cut: { identity: request.cut.identity, revision: request.cut.revision },
    },
  });
};

/** Installs a complete initial cut or fails before exposing any partial baseline. */
// RETURN_TYPE: Baseline installation exposes a typed complete-cut Result.
export const installContextBaseline = <D extends MachineDefinition>(
  batch: ContextSelectionBatch<D>,
): Result.Result<ContextBaseline<D>, PublicDiagnostic> => {
  const checked = preflight(batch);

  if (Result.isFailure(checked)) return Result.fail(checked.failure);

  const values = new Map<Slot<D>, ContextOf<D>[Slot<D>]>();
  const providers = new Map<Slot<D>, ContextCut>();
  const ledger = new Map<Slot<D>, ContextSelectionEntry<ContextOf<D>[Slot<D>]>>();

  for (const slot of batch.slots) {
    const request = checked.success.get(slot);

    if (request === undefined) return Result.fail(invalid("missing-slot"));
    const attempt = select(request);

    if (Result.isFailure(attempt)) return Result.fail(attempt.failure);

    if (attempt.success.kind === "defect") return Result.fail(attempt.success.diagnostic);
    const selected = attempt.success.selected;
    values.set(slot, selected.value);
    providers.set(slot, selected.cut);
    ledger.set(slot, {
      slot,
      lastValid: Option.some(selected),
      pending: Option.none(),
      lastAttempt: { kind: "success", cut: selected.cut, selected },
    });
  }

  return Result.succeed({ projection: projection(values, providers), ledger });
};

const repeatedDefect = (attempt: ContextSelectionAttempt | undefined, cut: ContextCut) =>
  attempt?.kind === "defect" &&
  sameIdentity(attempt.cut.identity, cut.identity) &&
  attempt.cut.revision === cut.revision;

const selectionChanged = <Value>(
  old: Option.Option<ContextSelected<Value>> | undefined,
  selected: ContextSelected<Value>,
) =>
  old === undefined ||
  Option.isNone(old) ||
  !equalContextSelection(selected.authoredIdentity, old.value.authoredIdentity);

// RETURN_TYPE: Wave completion preserves the declared publication Result.
const finishContextWave = <D extends MachineDefinition>(
  previous: ContextBaseline<D>,
  ledger: Map<Slot<D>, ContextSelectionEntry<ContextOf<D>[Slot<D>]>>,
  nextValues: Map<Slot<D>, ContextOf<D>[Slot<D>]>,
  nextProviders: Map<Slot<D>, ContextCut>,
  changedSlots: Set<Slot<D>>,
  selectorDefects: ContextSelectorDefect<D>[],
  unresolvedDefect: boolean,
): Result.Result<ContextWaveResult<D>, PublicDiagnostic> => {
  if (selectorDefects.length > 0 || unresolvedDefect)
    return Result.succeed({
      projection: projection(previous.projection.values, previous.projection.providers),
      ledger,
      changedSlots: new Set(),
      selectorDefects,
      publication: selectorDefects.length > 0 ? "issue-only" : "unchanged",
    });

  const committed = new Map<Slot<D>, ContextSelectionEntry<ContextOf<D>[Slot<D>]>>();

  for (const [slot, entry] of ledger) {
    const selected = entry.pending;

    if (Option.isNone(selected)) return Result.fail(invalid("missing-selection"));
    committed.set(slot, {
      slot,
      lastValid: Option.some(selected.value),
      pending: Option.none(),
      lastAttempt: entry.lastAttempt,
    });
  }

  return Result.succeed({
    projection: projection(nextValues, nextProviders),
    ledger: committed,
    changedSlots,
    selectorDefects,
    publication: changedSlots.size > 0 ? "changed" : "unchanged",
  });
};

type SlotOutcome<Value> = Data.TaggedEnum<{
  Repeated: { entry: Option.Option<ContextSelectionEntry<Value>> };
  Defect: { entry: ContextSelectionEntry<Value>; diagnostic: PublicDiagnostic };
  Success: {
    entry: ContextSelectionEntry<Value>;
    selected: ContextSelected<Value>;
    changed: boolean;
  };
}>;

interface SlotOutcomeKind extends Data.TaggedEnum.WithGenerics<1> {
  taggedEnum: SlotOutcome<this["A"]>;
}

const {
  Repeated,
  Defect: DefectOutcome,
  Success: SuccessOutcome,
} = Data.taggedEnum<SlotOutcomeKind>();

// RETURN_TYPE: The discriminated slot result keeps defect, repeated-cut, and success fields distinct.
const evaluateContextSlot = <D extends MachineDefinition>(
  request: PreparedRequest<D>,
  prior: ContextSelectionEntry<ContextOf<D>[Slot<D>]> | undefined,
): Result.Result<SlotOutcome<ContextOf<D>[Slot<D>]>, PublicDiagnostic> => {
  if (repeatedDefect(prior?.lastAttempt, request.cut))
    return Result.succeed(Repeated({ entry: Option.fromNullishOr(prior) }));

  const attempted = select(request);

  if (Result.isFailure(attempted)) return Result.fail(attempted.failure);

  if (attempted.success.kind === "defect") {
    const entry: ContextSelectionEntry<ContextOf<D>[Slot<D>]> = {
      slot: request.slot,
      lastValid: prior?.lastValid ?? Option.none(),
      pending: prior?.pending ?? Option.none(),
      lastAttempt: {
        kind: "defect",
        cut: request.cut,
        diagnostic: attempted.success.diagnostic,
      },
    };

    return Result.succeed(DefectOutcome({ entry, diagnostic: attempted.success.diagnostic }));
  }

  const selected = attempted.success.selected;

  const entry: ContextSelectionEntry<ContextOf<D>[Slot<D>]> = {
    slot: request.slot,
    lastValid: prior?.lastValid ?? Option.none(),
    pending: Option.some(selected),
    lastAttempt: { kind: "success", cut: selected.cut, selected },
  };

  return Result.succeed(
    SuccessOutcome({
      entry,
      selected,
      changed: selectionChanged(prior?.lastValid, selected),
    }),
  );
};

/** Retains the previous complete cut on defects and keeps healthy sibling selections pending. */
// RETURN_TYPE: Wave selection preserves the mapped slot and diagnostic Result.
export const applyContextWave = <D extends MachineDefinition>(
  previous: ContextBaseline<D>,
  batch: ContextSelectionBatch<D>,
): Result.Result<ContextWaveResult<D>, PublicDiagnostic> => {
  const checked = preflight(batch, previous);

  if (Result.isFailure(checked)) return Result.fail(checked.failure);

  const ledger = new Map<Slot<D>, ContextSelectionEntry<ContextOf<D>[Slot<D>]>>();
  const nextValues = new Map<Slot<D>, ContextOf<D>[Slot<D>]>(previous.projection.values);
  const nextProviders = new Map<Slot<D>, ContextCut>(previous.projection.providers);
  const changedSlots = new Set<Slot<D>>();
  const selectorDefects: ContextSelectorDefect<D>[] = [];
  let unresolvedDefect = false;

  for (const slot of batch.slots) {
    const request = checked.success.get(slot);

    if (request === undefined) return Result.fail(invalid("missing-slot"));
    const outcome = evaluateContextSlot(request, previous.ledger.get(slot));

    if (Result.isFailure(outcome)) return Result.fail(outcome.failure);
    const value = outcome.success;

    if (value._tag === "Repeated") {
      unresolvedDefect = true;

      if (Option.isSome(value.entry)) ledger.set(slot, value.entry.value);
      continue;
    }

    ledger.set(slot, value.entry);

    if (value._tag === "Defect") {
      selectorDefects.push({ slot, provider: request.provider, diagnostic: value.diagnostic });
      continue;
    }

    if (value.changed) changedSlots.add(slot);
    nextValues.set(slot, value.selected.value);
    nextProviders.set(slot, value.selected.cut);
  }

  return finishContextWave<D>(
    previous,
    ledger,
    nextValues,
    nextProviders,
    changedSlots,
    selectorDefects,
    unresolvedDefect,
  );
};
