// oxlint-disable-next-line anti-slop/no-large-production-file -- this module is the single B07 context-wave owner; splitting it would scatter the baseline, wave, selection, and passive-observation invariants.
import { Option, Predicate, Result } from "effect";

import type { ContextOf } from "../definition/domain.js";
import { Defect, Diagnostic, Failure, type PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type { MachineDefinition } from "../machine/grammar.js";
import type { Machine } from "../machine/machine.js";
import { immutableArray, immutableRecord, readonlyMap } from "./readonly-collections.js";
import type {
  ActorContextSnapshot,
  ActorContextValue,
  ActorDependencyGraph,
  ActorFence,
  ActorIncarnation,
  ActorKey,
} from "./actor-admission.js";
import type { ActorRef } from "./actor-ref.js";

/** One fixed consumer slot and its exact, already-admitted provider. */
export type ContextBinding<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
  Slot extends keyof ContextOf<ConsumerDefinition> & string = keyof ContextOf<ConsumerDefinition> &
    string,
  ProviderRef extends ActorRef<Machine<ProviderDefinition>> = ActorRef<Machine<ProviderDefinition>>,
> = {
  readonly consumer: ActorKey;
  readonly consumerIncarnation: ActorIncarnation;
  readonly slot: Slot;
  readonly provider: ProviderRef;
  readonly providerFence: ActorFence;
  readonly select: (
    input: ActorContextSnapshot<ProviderDefinition>,
  ) => ActorContextValue<ConsumerDefinition, Slot>;
};

/** Provider nodes are keyed by the runtime identity allocated during admission. */
export type ContextProviderNode<ProviderDefinition extends MachineDefinition> = {
  readonly key: ActorKey;
  readonly incarnation: ActorIncarnation;
  readonly ref: ActorRef<Machine<ProviderDefinition>>;
};

/** The fixed forward bindings and reverse dependent index used by a wave. */
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

/** Provider revisions are retained as a vector rather than collapsed to one counter. */
export type ProviderRevisionVector = ReadonlyMap<ActorKey, number>;

/** One selected value, including authored undefined and null as ordinary values. */
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

/** A selector defect is data for one issue-only consumer publication. */
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

/** A ledger entry retains both the last valid truth and a revision-scoped defect. */
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

/** Immutable selected values plus the latest vector observed by the consumer. */
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

/** One complete context cut for one consumer. */
export type ContextProjection<ConsumerDefinition extends MachineDefinition> = {
  readonly consumer: ActorKey;
  readonly values: ReadonlyMap<
    keyof ContextOf<ConsumerDefinition> & string,
    ActorContextValue<ConsumerDefinition, keyof ContextOf<ConsumerDefinition> & string>
  >;
  readonly revisions: ProviderRevisionVector;
  readonly changedSlots: ReadonlySet<keyof ContextOf<ConsumerDefinition> & string>;
};

/** One bounded, provider-first wave over the trusted dependency topology. */
export type ContextWave = {
  readonly providerRevision: ProviderRevisionVector;
  readonly dirty: ReadonlySet<ActorKey>;
  readonly order: readonly ActorKey[];
  readonly coalesced: boolean;
};

export type ContextRevision = {
  readonly publicationRevision: number;
  readonly machineTurnRevision: number;
};

export type ContextRevisionVector = ReadonlyMap<ActorKey, ContextRevision>;

/** One consumer publication; issue-only cuts do not advance machine-turn truth. */
export type ContextPublication<ConsumerDefinition extends MachineDefinition> = {
  readonly consumer: ActorKey;
  readonly projection: ContextProjection<ConsumerDefinition>;
  readonly publicationRevision: number;
  readonly machineTurnRevision: number;
  readonly issueOnly: boolean;
  readonly selectorDefects: readonly PublicDiagnostic[];
};

/** The baseline is installed silently before the first active snapshot. */
export type ContextBaseline<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
> = {
  readonly _tag: "context-baseline";
  readonly graph: ContextGraph<ConsumerDefinition, ProviderDefinition>;
  readonly bindings: readonly ContextBinding<ConsumerDefinition, ProviderDefinition>[];
  readonly providerRevision: ProviderRevisionVector;
  readonly ledger: ContextSelectionLedger<ConsumerDefinition, ProviderDefinition>;
  readonly projections: readonly ContextProjection<ConsumerDefinition>[];
};

/** Activation exposes the already-installed baseline without publishing a context turn. */
export type ActiveContextBaseline<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
> = {
  readonly _tag: "context-active";
  readonly baseline: ContextBaseline<ConsumerDefinition, ProviderDefinition>;
  readonly bindings: readonly ContextBinding<ConsumerDefinition, ProviderDefinition>[];
  readonly providerRevision: ProviderRevisionVector;
  readonly ledger: ContextSelectionLedger<ConsumerDefinition, ProviderDefinition>;
  readonly projections: readonly ContextProjection<ConsumerDefinition>[];
};

/** Result of applying one wave to every affected consumer. */
export type ContextWaveResult<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
> = {
  readonly _tag: "context-wave-published";
  readonly wave: ContextWave;
  readonly projections: readonly ContextProjection<ConsumerDefinition>[];
  readonly publications: readonly ContextPublication<ConsumerDefinition>[];
  readonly ledger: ContextSelectionLedger<ConsumerDefinition, ProviderDefinition>;
  readonly selectorDefects: readonly ContextSelectorDefect<
    ConsumerDefinition,
    ProviderDefinition
  >[];
};

export type PassiveRead<Dependency> = <Value>(dependency: Dependency, value: Value) => Value;

export type PassiveObserverEvaluation<Value, Dependency> =
  | {
      readonly _tag: "passive-observation";
      readonly value: Value;
      readonly dependencies: readonly Dependency[];
    }
  | {
      readonly _tag: "passive-defect";
      readonly diagnostic: PublicDiagnostic;
    };

export type PassiveObserver<Dependency> = {
  readonly evaluate: <Value>(
    selector: (read: PassiveRead<Dependency>) => Value,
  ) => PassiveObserverEvaluation<Value, Dependency>;
  readonly observe: <Value>(
    selector: (read: PassiveRead<Dependency>) => Value,
  ) => PassiveObserverEvaluation<Value, Dependency>;
  readonly dependencies: () => readonly Dependency[];
};

const immutableSet = <Value>(values: Iterable<Value>): ReadonlySet<Value> => {
  const source = new Set(values);

  const result: ReadonlySet<Value> = {
    has: (value) => source.has(value),
    get size() {
      return source.size;
    },
    entries: () => source.entries(),
    keys: () => source.keys(),
    values: () => source.values(),
    forEach: (callback, thisArg) => {
      source.forEach((value) => callback.call(thisArg, value, value, result));
    },
    [Symbol.iterator]: () => source[Symbol.iterator](),
  };

  // oxlint-disable-next-line anti-slop/no-object-freeze -- the wrapper exposes no mutating Set methods.
  return Object.freeze(result);
};

const invalidContext = (reason: string) =>
  Failure({
    code: "InvariantViolation",
    path: ["context"],
    details: { reason },
    summary: "The context wave contains invalid trusted data.",
    help: "Use the admitted actor topology and fixed context bindings.",
  });

const missingProvider = (key: ActorKey) =>
  Failure({
    code: "MissingContextProvider",
    path: ["context", "provider"],
    details: { provider: key },
    summary: "The context provider snapshot is unavailable.",
    help: "Publish the provider baseline before applying its consumer wave.",
  });

const invalidRevision = (key: ActorKey) =>
  Failure({
    code: "InvariantViolation",
    path: ["context", "revision"],
    details: { provider: key },
    summary: "A context provider revision is invalid or missing.",
    help: "Use a safe non-negative revision for every admitted provider.",
  });

const cycleFailure = (cycle: readonly ActorKey[]) =>
  Failure({
    code: "ContextDependencyCycle",
    path: ["context", "cycle"],
    details: { cycle: cycle.join(">") },
    summary: "Context bindings contain a dependency cycle.",
    help: "Keep provider context dependencies acyclic.",
  });

const isRevision = (value: unknown): value is number =>
  Predicate.isNumber(value) && Number.isSafeInteger(value) && value >= 0;

const nextRevision = (current: number, path: readonly string[]) => {
  if (!isRevision(current) || current >= Number.MAX_SAFE_INTEGER)
    return Result.fail(
      Failure({
        code: "InvariantViolation",
        path,
        details: { current },
        summary: "Revision counter cannot advance",
        help: "Use a non-negative safe revision below the counter limit.",
      }),
    );

  return Result.succeed(current + 1);
};

const nextContextRevision = (state: ContextRevision, issueOnly: boolean) => {
  const publicationRevision = nextRevision(state.publicationRevision, ["publicationRevision"]);

  if (Result.isFailure(publicationRevision)) return Result.fail(publicationRevision.failure);

  if (issueOnly)
    return Result.succeed({
      publicationRevision: publicationRevision.success,
      machineTurnRevision: state.machineTurnRevision,
    });

  const machineTurnRevision = nextRevision(state.machineTurnRevision, ["machineTurnRevision"]);

  if (Result.isFailure(machineTurnRevision)) return Result.fail(machineTurnRevision.failure);

  return Result.succeed({
    publicationRevision: publicationRevision.success,
    machineTurnRevision: machineTurnRevision.success,
  });
};

const freezeBinding = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  binding: ContextBinding<ConsumerDefinition, ProviderDefinition>,
) => {
  const providerFence = immutableRecord({ ...binding.providerFence });

  return immutableRecord({ ...binding, providerFence });
};

const copyRevisionVector = (vector: ProviderRevisionVector) => readonlyMap(vector.entries());

const copyRevisionState = (state: ContextRevision) =>
  immutableRecord({
    publicationRevision: state.publicationRevision,
    machineTurnRevision: state.machineTurnRevision,
  });

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- record fields remain unknown until equality inspects each stable descriptor.
type PlainContextRecord = Readonly<Record<PropertyKey, unknown>>;

const isPlainRecord = (value: unknown): value is PlainContextRecord => {
  if (!Predicate.isObject(value) || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
};

/** Complete Object.is for scalars/arrays and shallow fixed-field Object.is for records. */
export const equalContextSelection = <Value>(current: Value, previous: Value): boolean => {
  if (Object.is(current, previous)) return true;

  if (!isPlainRecord(current) || !isPlainRecord(previous)) return false;

  const currentKeys = Reflect.ownKeys(current);
  const previousKeys = Reflect.ownKeys(previous);

  if (currentKeys.length !== previousKeys.length) return false;

  if (currentKeys.some((key) => !previousKeys.includes(key))) return false;

  return currentKeys.every((key) => {
    const currentDescriptor = Object.getOwnPropertyDescriptor(current, key);
    const previousDescriptor = Object.getOwnPropertyDescriptor(previous, key);

    if (currentDescriptor === undefined || previousDescriptor === undefined) return false;

    if (!("value" in currentDescriptor) || !("value" in previousDescriptor)) return false;

    return Object.is(currentDescriptor.value, previousDescriptor.value);
  });
};

const deriveOrder = (
  nodes: readonly ActorKey[],
  edges: ReadonlyMap<ActorKey, ReadonlySet<ActorKey>>,
): Result.Result<readonly ActorKey[], PublicDiagnostic> => {
  const indegree = new Map<ActorKey, number>(nodes.map((node) => [node, 0]));

  for (const dependents of edges.values()) {
    for (const dependent of dependents) {
      indegree.set(dependent, (indegree.get(dependent) ?? 0) + 1);
    }
  }

  const ready = nodes.filter((node) => indegree.get(node) === 0);
  const order: ActorKey[] = [];

  for (let index = 0; index < ready.length; index += 1) {
    const node = ready[index];

    if (node === undefined) continue;
    order.push(node);

    for (const dependent of edges.get(node) ?? []) {
      const remaining = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, remaining);

      if (remaining === 0) ready.push(dependent);
    }
  }

  return order.length === nodes.length
    ? Result.succeed(immutableArray(order))
    : Result.fail(cycleFailure(nodes.filter((node) => (indegree.get(node) ?? 0) > 0)));
};

/** Builds immutable indexes from B02's already-trusted bindings and topology. */
export const buildContextGraph = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
>(
  bindings: readonly ContextBinding<ConsumerDefinition, ProviderDefinition>[],
  topology?: ActorDependencyGraph,
): Result.Result<ContextGraph<ConsumerDefinition, ProviderDefinition>, PublicDiagnostic> => {
  const providers = new Map<ActorKey, ContextProviderNode<ProviderDefinition>>();

  const bindingByConsumer = new Map<
    ActorKey,
    ContextBinding<ConsumerDefinition, ProviderDefinition>[]
  >();

  const nodes: ActorKey[] = [];
  const nodeSet = new Set<ActorKey>();
  const edgeSets = new Map<ActorKey, Set<ActorKey>>();

  const rememberNode = (key: ActorKey) => {
    if (nodeSet.has(key)) return;
    nodeSet.add(key);
    nodes.push(key);
  };

  for (const sourceBinding of bindings) {
    const binding = freezeBinding(sourceBinding);
    const providerKey = binding.providerFence.key;
    const provider = providers.get(providerKey);

    if (provider !== undefined) {
      if (
        provider.ref !== binding.provider ||
        provider.incarnation !== binding.providerFence.incarnation
      )
        return Result.fail(invalidContext("provider-incarnation"));
    } else {
      providers.set(
        providerKey,
        immutableRecord({
          key: providerKey,
          incarnation: binding.providerFence.incarnation,
          ref: binding.provider,
        }),
      );
    }

    const consumerBindings = bindingByConsumer.get(binding.consumer);

    if (consumerBindings === undefined) bindingByConsumer.set(binding.consumer, [binding]);
    else {
      if (consumerBindings.some((candidate) => candidate.slot === binding.slot))
        return Result.fail(invalidContext("duplicate-slot"));
      consumerBindings.push(binding);
    }

    rememberNode(providerKey);
    rememberNode(binding.consumer);
    let dependents = edgeSets.get(providerKey);

    if (dependents === undefined) {
      dependents = new Set();
      edgeSets.set(providerKey, dependents);
    }

    dependents.add(binding.consumer);
  }

  const localDependents = readonlyMap(
    [...edgeSets.entries()].map(([key, values]) => [key, immutableSet(values)] as const),
  );

  const orderResult =
    topology === undefined
      ? deriveOrder(nodes, localDependents)
      : Result.succeed(
          immutableArray([
            ...topology.order,
            ...nodes.filter((node) => !topology.order.includes(node)),
          ]),
        );

  if (Result.isFailure(orderResult)) return Result.fail(orderResult.failure);

  const dependents =
    topology === undefined
      ? localDependents
      : readonlyMap(
          [...topology.reverse.entries()].map(
            ([key, edges]) => [key, immutableSet(edges.map((edge) => edge.consumer))] as const,
          ),
        );

  return Result.succeed(
    immutableRecord({
      providers: readonlyMap(providers),
      bindings: readonlyMap(
        [...bindingByConsumer.entries()].map(
          ([key, value]) => [key, immutableArray(value)] as const,
        ),
      ),
      dependents,
      order: orderResult.success,
    }),
  );
};

/** Detects a cycle in a graph supplied without changing its indexes. */
export const detectContextCycles = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
>(
  graph: ContextGraph<ConsumerDefinition, ProviderDefinition>,
): Result.Result<readonly ActorKey[], PublicDiagnostic> => {
  const colors = new Map<ActorKey, "gray" | "black">();

  const visit = (node: ActorKey, path: readonly ActorKey[]): readonly ActorKey[] | undefined => {
    const color = colors.get(node);

    if (color === "gray") {
      const start = path.indexOf(node);

      return path.slice(start < 0 ? 0 : start);
    }

    if (color === "black") return undefined;
    colors.set(node, "gray");

    for (const dependent of graph.dependents.get(node) ?? []) {
      const cycle = visit(dependent, [...path, dependent]);

      if (cycle !== undefined) return cycle;
    }

    colors.set(node, "black");

    return undefined;
  };

  for (const node of graph.order) {
    const cycle = visit(node, [node]);

    if (cycle !== undefined) return Result.fail(cycleFailure(cycle));
  }

  return Result.succeed(immutableArray([]));
};

/** Returns the trusted provider-first order restricted to one transitive dirty wave. */
export const topologicalContextOrder = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
>(
  graph: ContextGraph<ConsumerDefinition, ProviderDefinition>,
  dirty: ReadonlySet<ActorKey>,
): Result.Result<readonly ActorKey[], PublicDiagnostic> => {
  const reachable = new Set<ActorKey>();
  const pending = [...dirty];

  for (let index = 0; index < pending.length; index += 1) {
    const node = pending[index];

    if (node === undefined || reachable.has(node)) continue;
    reachable.add(node);

    for (const dependent of graph.dependents.get(node) ?? []) pending.push(dependent);
  }

  const order = graph.order.filter((node) => reachable.has(node));

  if (order.length !== reachable.size) {
    return Result.fail(invalidContext("topology-order"));
  }

  return Result.succeed(immutableArray(order));
};

/** Selects against one captured provider snapshot and converts thrown defects to data. */
export const selectContext = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
  Slot extends keyof ContextOf<ConsumerDefinition> & string,
>(
  binding: ContextBinding<ConsumerDefinition, ProviderDefinition, Slot>,
  providerSnapshot: ActorContextSnapshot<ProviderDefinition>,
  providerRevision: number,
): Result.Result<
  ContextSelection<ConsumerDefinition, ProviderDefinition, Slot>,
  ContextSelectorDefect<ConsumerDefinition, ProviderDefinition, Slot>
> => {
  const selected = Result.try({
    try: () => binding.select(providerSnapshot),
    catch: (cause) =>
      immutableRecord({
        binding,
        consumer: binding.consumer,
        slot: binding.slot,
        providerRevision,
        diagnostic: cause instanceof Diagnostic ? cause : Defect(cause),
      }),
  });

  if (Result.isFailure(selected)) return Result.fail(selected.failure);

  return Result.succeed(
    immutableRecord({
      binding,
      slot: binding.slot,
      value: selected.success,
      providerRevision,
    }),
  );
};

const projectionFromEntries = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  consumer: ActorKey,
  bindings: readonly ContextBinding<ConsumerDefinition, ProviderDefinition>[],
  entries: ReadonlyMap<
    ContextBinding<ConsumerDefinition, ProviderDefinition>,
    ContextSelectionLedgerEntry<ConsumerDefinition, ProviderDefinition>
  >,
  revisions: ProviderRevisionVector,
  changedSlots: ReadonlySet<keyof ContextOf<ConsumerDefinition> & string>,
): Result.Result<ContextProjection<ConsumerDefinition>, PublicDiagnostic> => {
  const values = new Map<
    keyof ContextOf<ConsumerDefinition> & string,
    ActorContextValue<ConsumerDefinition, keyof ContextOf<ConsumerDefinition> & string>
  >();

  for (const binding of bindings) {
    const entry = entries.get(binding);

    if (entry === undefined || Option.isNone(entry.lastValid))
      return Result.fail(invalidContext("missing-last-valid"));
    values.set(binding.slot, entry.lastValid.value.value);
  }

  return Result.succeed(
    immutableRecord({
      consumer,
      values: readonlyMap(values),
      revisions,
      changedSlots: immutableSet(changedSlots),
    }),
  );
};

const baselineProjection = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  consumer: ActorKey,
  bindings: readonly ContextBinding<ConsumerDefinition, ProviderDefinition>[],
  entries: ReadonlyMap<
    ContextBinding<ConsumerDefinition, ProviderDefinition>,
    ContextSelectionLedgerEntry<ConsumerDefinition, ProviderDefinition>
  >,
  revisions: ProviderRevisionVector,
) => projectionFromEntries(consumer, bindings, entries, revisions, immutableSet([]));

const flattenBindings = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  graph: ContextGraph<ConsumerDefinition, ProviderDefinition>,
) => immutableArray([...graph.bindings.values()].flat());

/** Installs provider selections and the fixed binding set before activation. */
export const installContextBaseline = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
>(
  graph: ContextGraph<ConsumerDefinition, ProviderDefinition>,
  snapshots: ReadonlyMap<ActorKey, ActorContextSnapshot<ProviderDefinition>>,
  providerRevision: ProviderRevisionVector,
): Result.Result<ContextBaseline<ConsumerDefinition, ProviderDefinition>, PublicDiagnostic> => {
  const entries = new Map<
    ContextBinding<ConsumerDefinition, ProviderDefinition>,
    ContextSelectionLedgerEntry<ConsumerDefinition, ProviderDefinition>
  >();

  for (const binding of flattenBindings(graph)) {
    const providerSnapshot = snapshots.get(binding.providerFence.key);

    if (providerSnapshot === undefined)
      return Result.fail(missingProvider(binding.providerFence.key));
    const revision = providerRevision.get(binding.providerFence.key);

    if (!isRevision(revision)) return Result.fail(invalidRevision(binding.providerFence.key));
    const selected = selectContext(binding, providerSnapshot, revision);

    if (Result.isFailure(selected)) return Result.fail(selected.failure.diagnostic);
    entries.set(
      binding,
      immutableRecord({
        binding,
        previous: Option.none(),
        lastValid: Option.some(selected.success),
        providerRevision: revision,
        defect: Option.none(),
      }),
    );
  }

  const frozenRevisions = copyRevisionVector(providerRevision);
  const projections: ContextProjection<ConsumerDefinition>[] = [];

  for (const [consumer, bindings] of graph.bindings) {
    const projection = baselineProjection(consumer, bindings, entries, frozenRevisions);

    if (Result.isFailure(projection)) return Result.fail(projection.failure);
    projections.push(projection.success);
  }

  const ledger: ContextSelectionLedger<ConsumerDefinition, ProviderDefinition> = immutableRecord({
    entries: readonlyMap(entries),
    providerRevisions: frozenRevisions,
  });

  const baseline: ContextBaseline<ConsumerDefinition, ProviderDefinition> = immutableRecord({
    _tag: "context-baseline",
    graph,
    bindings: flattenBindings(graph),
    providerRevision: frozenRevisions,
    ledger,
    projections: immutableArray(projections),
  });

  return Result.succeed(baseline);
};

/** Crosses the activation barrier while retaining the silent baseline unchanged. */
export const activateContextBaseline = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
>(
  baseline: ContextBaseline<ConsumerDefinition, ProviderDefinition>,
): ActiveContextBaseline<ConsumerDefinition, ProviderDefinition> =>
  immutableRecord({
    _tag: "context-active" as const,
    baseline,
    bindings: baseline.bindings,
    providerRevision: baseline.providerRevision,
    ledger: baseline.ledger,
    projections: baseline.projections,
  });

/** Coalesces only revisions newer than the previously planned vector. */
export const planContextWave = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
>(
  graph: ContextGraph<ConsumerDefinition, ProviderDefinition>,
  providerRevision: ProviderRevisionVector,
  dirty: ReadonlySet<ActorKey>,
  previous: Option.Option<ContextWave>,
): Result.Result<ContextWave, PublicDiagnostic> => {
  const previousRevision = Option.isSome(previous) ? previous.value.providerRevision : undefined;
  const currentDirty = new Set<ActorKey>();

  for (const key of dirty) {
    if (!graph.providers.has(key)) continue;
    const current = providerRevision.get(key);

    if (!isRevision(current)) return Result.fail(invalidRevision(key));
    const prior = previousRevision?.get(key) ?? -1;

    if (current > prior) currentDirty.add(key);
  }

  const order = topologicalContextOrder(graph, currentDirty);

  if (Result.isFailure(order)) return Result.fail(order.failure);

  return Result.succeed(
    immutableRecord({
      providerRevision: copyRevisionVector(providerRevision),
      dirty: immutableSet(currentDirty),
      order: order.success,
      coalesced: Option.isSome(previous),
    }),
  );
};

const mergedRevisions = (previous: ProviderRevisionVector, current: ProviderRevisionVector) => {
  const merged = new Map(previous);

  for (const [key, revision] of current) merged.set(key, revision);

  return readonlyMap(merged);
};

const revisionForConsumer = (
  revisions: ContextRevisionVector,
  consumer: ActorKey,
): Result.Result<ContextRevision, PublicDiagnostic> => {
  const state = revisions.get(consumer) ?? { publicationRevision: 0, machineTurnRevision: 0 };

  if (
    !isRevision(state.publicationRevision) ||
    !isRevision(state.machineTurnRevision) ||
    state.machineTurnRevision > state.publicationRevision
  )
    return Result.fail(invalidContext("consumer-revision"));

  return Result.succeed(copyRevisionState(state));
};

const propagateProjection = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  graph: ContextGraph<ConsumerDefinition, ProviderDefinition>,
  snapshots: Map<ActorKey, ActorContextSnapshot<ProviderDefinition>>,
  consumer: ActorKey,
  projection: ContextProjection<ConsumerDefinition>,
) => {
  if (!graph.providers.has(consumer)) return Result.succeed(undefined);
  const previous = snapshots.get(consumer);

  if (previous === undefined) return Result.fail(missingProvider(consumer));
  const context = Object.fromEntries(projection.values);
  // SAFETY: B02's trusted topology admits a consumer as a provider only when this context cut is the provider snapshot shape.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the trusted topology preserves the provider context record shape across this projection.
  const providerContext = context as ActorContextSnapshot<ProviderDefinition>["context"];

  const next = {
    state: previous.state,
    memory: previous.memory,
    context: providerContext,
  };

  snapshots.set(consumer, next);

  return Result.succeed(undefined);
};

/** Applies a wave as one complete batch; no consumer projection escapes mid-evaluation. */
// oxlint-disable-next-line complexity -- this owner keeps selection, defect, and publication sequencing atomic.
export const applyContextWave = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
>(
  wave: ContextWave,
  graph: ContextGraph<ConsumerDefinition, ProviderDefinition>,
  snapshots: ReadonlyMap<ActorKey, ActorContextSnapshot<ProviderDefinition>>,
  previous: ContextSelectionLedger<ConsumerDefinition, ProviderDefinition>,
  revisions: ContextRevisionVector = readonlyMap([]),
): Result.Result<ContextWaveResult<ConsumerDefinition, ProviderDefinition>, PublicDiagnostic> => {
  const nextRevisions = mergedRevisions(previous.providerRevisions, wave.providerRevision);
  const nextEntries = new Map(previous.entries);
  const projections: ContextProjection<ConsumerDefinition>[] = [];
  const publications: ContextPublication<ConsumerDefinition>[] = [];
  const selectorDefects: ContextSelectorDefect<ConsumerDefinition, ProviderDefinition>[] = [];
  const processed = new Set<ActorKey>();
  const waveSnapshots = new Map(snapshots);
  const settledProviders = new Set(wave.dirty);

  for (const consumer of wave.order) {
    const bindings = graph.bindings.get(consumer);

    if (bindings === undefined || processed.has(consumer)) continue;
    processed.add(consumer);

    const hasNewProviderRevision = bindings.some((binding) => {
      const current = wave.providerRevision.get(binding.providerFence.key);
      const prior = previous.providerRevisions.get(binding.providerFence.key) ?? -1;

      return (
        settledProviders.has(binding.providerFence.key) || (isRevision(current) && current > prior)
      );
    });

    if (!hasNewProviderRevision) continue;

    const candidateEntries = new Map<
      ContextBinding<ConsumerDefinition, ProviderDefinition>,
      ContextSelectionLedgerEntry<ConsumerDefinition, ProviderDefinition>
    >();

    const consumerDefects: ContextSelectorDefect<ConsumerDefinition, ProviderDefinition>[] = [];
    const changedSlots = new Set<keyof ContextOf<ConsumerDefinition> & string>();

    for (const binding of bindings) {
      const previousEntry = previous.entries.get(binding);

      if (previousEntry === undefined || Option.isNone(previousEntry.lastValid))
        return Result.fail(invalidContext("missing-ledger-entry"));
      const providerSnapshot = waveSnapshots.get(binding.providerFence.key);

      if (providerSnapshot === undefined)
        return Result.fail(missingProvider(binding.providerFence.key));
      const providerRevision = wave.providerRevision.get(binding.providerFence.key);

      if (!isRevision(providerRevision))
        return Result.fail(invalidRevision(binding.providerFence.key));

      const selected = selectContext(binding, providerSnapshot, providerRevision);

      if (Result.isFailure(selected)) {
        consumerDefects.push(selected.failure);
        candidateEntries.set(
          binding,
          immutableRecord({
            binding,
            previous: previousEntry.previous,
            lastValid: previousEntry.lastValid,
            providerRevision,
            defect: Option.some(selected.failure),
          }),
        );
        continue;
      }

      candidateEntries.set(
        binding,
        immutableRecord({
          binding,
          previous: previousEntry.lastValid,
          lastValid: Option.some(selected.success),
          providerRevision,
          defect: Option.none(),
        }),
      );

      if (!equalContextSelection(selected.success.value, previousEntry.lastValid.value.value))
        changedSlots.add(binding.slot);
    }

    if (consumerDefects.length > 0) {
      const revisionState = revisionForConsumer(revisions, consumer);

      if (Result.isFailure(revisionState)) return Result.fail(revisionState.failure);
      const nextRevisionState = nextContextRevision(revisionState.success, true);

      if (Result.isFailure(nextRevisionState)) return Result.fail(nextRevisionState.failure);

      for (const binding of bindings) {
        const candidate = candidateEntries.get(binding);

        if (candidate === undefined) return Result.fail(invalidContext("incomplete-candidate"));
        nextEntries.set(binding, candidate);
      }

      const retained = projectionFromEntries(
        consumer,
        bindings,
        previous.entries,
        nextRevisions,
        immutableSet([]),
      );

      if (Result.isFailure(retained)) return Result.fail(retained.failure);
      projections.push(retained.success);
      const propagated = propagateProjection(graph, waveSnapshots, consumer, retained.success);

      if (Result.isFailure(propagated)) return Result.fail(propagated.failure);
      settledProviders.add(consumer);

      const publication = immutableRecord({
        consumer,
        projection: retained.success,
        publicationRevision: nextRevisionState.success.publicationRevision,
        machineTurnRevision: nextRevisionState.success.machineTurnRevision,
        issueOnly: true as const,
        selectorDefects: immutableArray(consumerDefects.map((defect) => defect.diagnostic)),
      });

      publications.push(publication);
      selectorDefects.push(...consumerDefects);
      continue;
    }

    let nextRevisionState: Result.Result<ContextRevision, PublicDiagnostic> | undefined;

    if (changedSlots.size > 0) {
      const revisionState = revisionForConsumer(revisions, consumer);

      if (Result.isFailure(revisionState)) return Result.fail(revisionState.failure);
      nextRevisionState = nextContextRevision(revisionState.success, false);

      if (Result.isFailure(nextRevisionState)) return Result.fail(nextRevisionState.failure);
    }

    for (const binding of bindings) {
      const candidate = candidateEntries.get(binding);

      if (candidate === undefined) return Result.fail(invalidContext("incomplete-candidate"));
      nextEntries.set(binding, candidate);
    }

    if (changedSlots.size === 0) {
      const unchanged = projectionFromEntries(
        consumer,
        bindings,
        nextEntries,
        nextRevisions,
        immutableSet([]),
      );

      if (Result.isFailure(unchanged)) return Result.fail(unchanged.failure);
      const propagated = propagateProjection(graph, waveSnapshots, consumer, unchanged.success);

      if (Result.isFailure(propagated)) return Result.fail(propagated.failure);
      settledProviders.add(consumer);
      continue;
    }

    const projection = projectionFromEntries(
      consumer,
      bindings,
      nextEntries,
      nextRevisions,
      immutableSet(changedSlots),
    );

    if (Result.isFailure(projection)) return Result.fail(projection.failure);
    projections.push(projection.success);
    const propagated = propagateProjection(graph, waveSnapshots, consumer, projection.success);

    if (Result.isFailure(propagated)) return Result.fail(propagated.failure);
    settledProviders.add(consumer);

    if (nextRevisionState === undefined || Result.isFailure(nextRevisionState))
      return Result.fail(invalidContext("missing-next-revision"));
    publications.push(
      immutableRecord({
        consumer,
        projection: projection.success,
        publicationRevision: nextRevisionState.success.publicationRevision,
        machineTurnRevision: nextRevisionState.success.machineTurnRevision,
        issueOnly: false as const,
        selectorDefects: immutableArray([]),
      }),
    );
  }

  const ledger: ContextSelectionLedger<ConsumerDefinition, ProviderDefinition> = immutableRecord({
    entries: readonlyMap(nextEntries),
    providerRevisions: nextRevisions,
  });

  return Result.succeed(
    immutableRecord({
      _tag: "context-wave-published" as const,
      wave,
      projections: immutableArray(projections),
      publications: immutableArray(publications),
      ledger,
      selectorDefects: immutableArray(selectorDefects),
    }),
  );
};

/** Creates a passive dependency tracker; a defect leaves the previous set untouched. */
// RETURN_TYPE: Preserves the generic passive-observer surface while closure state stays private.
export const makePassiveObserver = <Dependency>(): PassiveObserver<Dependency> => {
  let tracked: readonly Dependency[] = immutableArray([]);

  const evaluate = <Value>(selector: (read: PassiveRead<Dependency>) => Value) => {
    const next: Dependency[] = [];
    const seen = new Set<Dependency>();

    const read: PassiveRead<Dependency> = (dependency, value) => {
      if (!seen.has(dependency)) {
        seen.add(dependency);
        next.push(dependency);
      }

      return value;
    };

    const evaluated = Result.try({
      try: () => selector(read),
      catch: (cause) => (cause instanceof Diagnostic ? cause : Defect(cause)),
    });

    if (Result.isFailure(evaluated))
      return immutableRecord({ _tag: "passive-defect" as const, diagnostic: evaluated.failure });
    const dependencies = immutableArray(next);
    tracked = dependencies;

    return immutableRecord({
      _tag: "passive-observation" as const,
      value: evaluated.success,
      dependencies,
    });
  };

  return { evaluate, observe: evaluate, dependencies: () => tracked };
};
