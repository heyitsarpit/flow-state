// oxlint-disable-next-line anti-slop/no-large-production-file -- the baseline, selection ledger, wave propagation, and passive observer share graph and revision invariants, so splitting them would fragment one runtime owner.
import { Option, Predicate, Result } from "effect";

import type { ContextOf } from "../definition/domain.js";
import { isRegisteredContextSelector, isRegisteredStateToken } from "../definition/schema.js";
import { Defect, Diagnostic, Failure, type PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type { MachineDefinition } from "../machine/grammar.js";
import type { Machine } from "../machine/machine.js";
import { isConstructedOperation } from "../operation/operation.js";
import { copyArray, copyObject } from "./collection-copies.js";
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
  consumer: ActorKey;
  consumerIncarnation: ActorIncarnation;
  slot: Slot;
  provider: ProviderRef;
  providerFence: ActorFence;
  select: (
    input: ActorContextSnapshot<ProviderDefinition>,
  ) => ActorContextValue<ConsumerDefinition, Slot>;
};

/** Provider nodes are keyed by the runtime identity allocated during admission. */
export type ContextProviderNode<ProviderDefinition extends MachineDefinition> = {
  key: ActorKey;
  incarnation: ActorIncarnation;
  ref: ActorRef<Machine<ProviderDefinition>>;
};

/** The fixed forward bindings and reverse dependent index used by a wave. */
export type ContextGraph<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
> = {
  providers: Map<ActorKey, ContextProviderNode<ProviderDefinition>>;
  bindings: Map<ActorKey, ContextBinding<ConsumerDefinition, ProviderDefinition>[]>;
  dependents: Map<ActorKey, Set<ActorKey>>;
  order: ActorKey[];
};

/** Provider revisions are retained as a vector rather than collapsed to one counter. */
export type ProviderRevisionVector = Map<ActorKey, number>;

/** One selected value, including authored undefined and null as ordinary values. */
export type ContextSelection<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
  Slot extends keyof ContextOf<ConsumerDefinition> & string = keyof ContextOf<ConsumerDefinition> &
    string,
> = {
  binding: ContextBinding<ConsumerDefinition, ProviderDefinition, Slot>;
  slot: Slot;
  value: ActorContextValue<ConsumerDefinition, Slot>;
  authoredIdentity: ActorContextValue<ConsumerDefinition, Slot>;
  providerRevision: number;
};

/** A selector defect is data for one issue-only consumer publication. */
export type ContextSelectorDefect<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
  Slot extends keyof ContextOf<ConsumerDefinition> & string = keyof ContextOf<ConsumerDefinition> &
    string,
> = {
  binding: ContextBinding<ConsumerDefinition, ProviderDefinition, Slot>;
  consumer: ActorKey;
  slot: Slot;
  providerRevision: number;
  diagnostic: PublicDiagnostic;
};

/** A ledger entry retains both the last valid truth and a revision-scoped defect. */
export type ContextSelectionLedgerEntry<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
  Slot extends keyof ContextOf<ConsumerDefinition> & string = keyof ContextOf<ConsumerDefinition> &
    string,
> = {
  binding: ContextBinding<ConsumerDefinition, ProviderDefinition, Slot>;
  lastValid: Option.Option<ContextSelection<ConsumerDefinition, ProviderDefinition, Slot>>;
  pending: Option.Option<ContextSelection<ConsumerDefinition, ProviderDefinition, Slot>>;
  providerRevision: number;
  defect: Option.Option<ContextSelectorDefect<ConsumerDefinition, ProviderDefinition, Slot>>;
};

/** Immutable selected values plus the latest vector observed by the consumer. */
export type ContextSelectionLedger<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
> = {
  entries: Map<
    ContextBinding<ConsumerDefinition, ProviderDefinition>,
    ContextSelectionLedgerEntry<ConsumerDefinition, ProviderDefinition>
  >;
  providerRevisions: ProviderRevisionVector;
};

/** One complete context cut for one consumer. */
export type ContextProjection<ConsumerDefinition extends MachineDefinition> = {
  consumer: ActorKey;
  values: Map<
    keyof ContextOf<ConsumerDefinition> & string,
    ActorContextValue<ConsumerDefinition, keyof ContextOf<ConsumerDefinition> & string>
  >;
  revisions: ProviderRevisionVector;
  changedSlots: Set<keyof ContextOf<ConsumerDefinition> & string>;
};

/** One bounded, provider-first wave over the trusted dependency topology. */
export type ContextWave = {
  providerRevision: ProviderRevisionVector;
  dirty: Set<ActorKey>;
  order: ActorKey[];
  coalesced: boolean;
};

export type ContextRevision = {
  publicationRevision: number;
  machineTurnRevision: number;
};

export type ContextRevisionVector = Map<ActorKey, ContextRevision>;

/** One consumer publication; issue-only cuts do not advance machine-turn truth. */
export type ContextPublication<ConsumerDefinition extends MachineDefinition> = {
  consumer: ActorKey;
  projection: ContextProjection<ConsumerDefinition>;
  publicationRevision: number;
  machineTurnRevision: number;
  issueOnly: boolean;
  selectorDefects: PublicDiagnostic[];
};

/** The baseline is installed silently before the first active snapshot. */
export type ContextBaseline<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
> = {
  _tag: "context-baseline";
  graph: ContextGraph<ConsumerDefinition, ProviderDefinition>;
  bindings: ContextBinding<ConsumerDefinition, ProviderDefinition>[];
  providerRevision: ProviderRevisionVector;
  ledger: ContextSelectionLedger<ConsumerDefinition, ProviderDefinition>;
  projections: ContextProjection<ConsumerDefinition>[];
};

/** Activation exposes the already-installed baseline without publishing a context turn. */
export type ActiveContextBaseline<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
> = {
  _tag: "context-active";
  baseline: ContextBaseline<ConsumerDefinition, ProviderDefinition>;
  bindings: ContextBinding<ConsumerDefinition, ProviderDefinition>[];
  providerRevision: ProviderRevisionVector;
  ledger: ContextSelectionLedger<ConsumerDefinition, ProviderDefinition>;
  projections: ContextProjection<ConsumerDefinition>[];
};

/** Result of applying one wave to every affected consumer. */
export type ContextWaveResult<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
> = {
  _tag: "context-wave-published";
  wave: ContextWave;
  projections: ContextProjection<ConsumerDefinition>[];
  publications: ContextPublication<ConsumerDefinition>[];
  ledger: ContextSelectionLedger<ConsumerDefinition, ProviderDefinition>;
  selectorDefects: ContextSelectorDefect<ConsumerDefinition, ProviderDefinition>[];
};

export type PassiveRead<Dependency> = <Value>(dependency: Dependency, value: Value) => Value;

export type PassiveObserverEvaluation<Value, Dependency> =
  | {
      _tag: "passive-observation";
      value: Value;
      dependencies: Dependency[];
    }
  | {
      _tag: "passive-defect";
      diagnostic: PublicDiagnostic;
    };

export type PassiveObserver<Dependency> = {
  evaluate: <Value>(
    selector: (read: PassiveRead<Dependency>) => Value,
  ) => PassiveObserverEvaluation<Value, Dependency>;
  observe: <Value>(
    selector: (read: PassiveRead<Dependency>) => Value,
  ) => PassiveObserverEvaluation<Value, Dependency>;
  dependencies: () => Dependency[];
};

const ownedSet = <Value>(values: Iterable<Value>) => new Set(values);

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

const cycleFailure = (cycle: ActorKey[]) =>
  Failure({
    code: "ContextDependencyCycle",
    path: ["context", "cycle"],
    details: { cycle: cycle.join(">") },
    summary: "Context bindings contain a dependency cycle.",
    help: "Keep provider context dependencies acyclic.",
  });

// RETURN_TYPE: Narrows validated map values to safe revisions for their downstream arithmetic.
const isRevision = (value: unknown): value is number =>
  Predicate.isNumber(value) && Number.isSafeInteger(value) && value >= 0;

const nextRevision = (current: number, path: string[]) => {
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

const copyBinding = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  binding: ContextBinding<ConsumerDefinition, ProviderDefinition>,
) => {
  const providerFence = copyObject({ ...binding.providerFence });

  return copyObject({ ...binding, providerFence });
};

const copyRevisionVector = (vector: ProviderRevisionVector) => new Map(vector.entries());

const copyRevisionState = (state: ContextRevision) =>
  copyObject({
    publicationRevision: state.publicationRevision,
    machineTurnRevision: state.machineTurnRevision,
  });

// FLOW_STATE_ALLOW_UNKNOWN: Selected fields are compared only as property descriptors.
type PlainContextRecord = Record<PropertyKey, unknown>;

type StructuralContextValue =
  | PlainContextRecord
  | Array<PlainContextRecord[keyof PlainContextRecord]>;

// RETURN_TYPE: Keeps property inspection narrowed to plain records after prototype validation.
const isPlainRecord = (value: unknown): value is PlainContextRecord => {
  if (!Predicate.isObject(value) || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
};

const isOpaqueContextValue = <Value>(value: Value) =>
  isRegisteredStateToken(value) ||
  isConstructedOperation(value) ||
  isRegisteredContextSelector(value);

/** Complete Object.is for scalars/arrays and shallow fixed-field Object.is for records. */
export const equalContextSelection = <Value>(current: Value, previous: Value) => {
  if (!isPlainRecord(current) || !isPlainRecord(previous)) return Object.is(current, previous);

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

/** Owns ordinary structural values without changing nominal token identity. */
const ownContextValue = <Value>(value: Value) => {
  const copied = new WeakMap<StructuralContextValue, StructuralContextValue>();

  // FLOW_STATE_ALLOW_UNKNOWN: Recursive structural copies inspect authored values before restoring their generic type.
  const copy: (current: unknown) => unknown = (current) => {
    if ((!Array.isArray(current) && !isPlainRecord(current)) || isOpaqueContextValue(current))
      return current;
    const prior = copied.get(current);

    if (prior !== undefined) return prior;

    const owned: StructuralContextValue = Array.isArray(current)
      ? []
      : Object.create(Object.getPrototypeOf(current));

    copied.set(current, owned);

    for (const key of Reflect.ownKeys(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);

      if (descriptor === undefined || !("value" in descriptor))
        throw new TypeError("Context selection contains an accessor property");
      Object.defineProperty(owned, key, { ...descriptor, value: copy(descriptor.value) });
    }

    return owned;
  };

  // SAFETY: Structural arrays and plain records retain their shape and field types; nominal and scalar values are unchanged.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the recursive owner copy preserves the selected value type.
  return copy(value) as Value;
};

/** Saves authored field references only as identity tokens for shallow equality. */
// RETURN_TYPE: Preserves the selected type through Object.create's erased return.
const contextIdentity = <Value>(value: Value): Value => {
  if (!isPlainRecord(value) || isOpaqueContextValue(value)) return value;
  const comparison = Object.create(Object.getPrototypeOf(value));
  Object.defineProperties(comparison, Object.getOwnPropertyDescriptors(value));

  // SAFETY: The comparator is a shallow descriptor copy of the same named record shape.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- equality needs the authored record fields at selection time.
  return comparison as Value;
};

const contextIndegrees = (nodes: ActorKey[], edges: Map<ActorKey, Set<ActorKey>>) => {
  const indegree = new Map<ActorKey, number>(nodes.map((node) => [node, 0]));

  for (const dependents of edges.values()) {
    for (const dependent of dependents) {
      indegree.set(dependent, (indegree.get(dependent) ?? 0) + 1);
    }
  }

  return indegree;
};

const releaseContextDependents = (
  node: ActorKey,
  edges: Map<ActorKey, Set<ActorKey>>,
  indegree: Map<ActorKey, number>,
  ready: ActorKey[],
) => {
  for (const dependent of edges.get(node) ?? []) {
    const remaining = (indegree.get(dependent) ?? 0) - 1;
    indegree.set(dependent, remaining);

    if (remaining === 0) ready.push(dependent);
  }
};

const deriveOrder = (nodes: ActorKey[], edges: Map<ActorKey, Set<ActorKey>>) => {
  const indegree = contextIndegrees(nodes, edges);
  const ready = nodes.filter((node) => indegree.get(node) === 0);
  const order: ActorKey[] = [];

  for (let index = 0; index < ready.length; index += 1) {
    const node = ready[index];

    if (node === undefined) continue;
    order.push(node);
    releaseContextDependents(node, edges, indegree, ready);
  }

  if (order.length === nodes.length) return Result.succeed(copyArray(order));
  const cycle = nodes.filter((node) => (indegree.get(node) ?? 0) > 0);

  return Result.fail(cycleFailure(cycle));
};

type ContextGraphIndexes<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
> = {
  providers: Map<ActorKey, ContextProviderNode<ProviderDefinition>>;
  bindingByConsumer: Map<ActorKey, ContextBinding<ConsumerDefinition, ProviderDefinition>[]>;
  nodes: ActorKey[];
  nodeSet: Set<ActorKey>;
  edgeSets: Map<ActorKey, Set<ActorKey>>;
};

const makeContextGraphIndexes = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>() => ({
  providers: new Map<ActorKey, ContextProviderNode<ProviderDefinition>>(),
  bindingByConsumer: new Map<ActorKey, ContextBinding<ConsumerDefinition, ProviderDefinition>[]>(),
  nodes: [],
  nodeSet: new Set<ActorKey>(),
  edgeSets: new Map<ActorKey, Set<ActorKey>>(),
});

const rememberContextNode = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  indexes: ContextGraphIndexes<ConsumerDefinition, ProviderDefinition>,
  key: ActorKey,
) => {
  if (indexes.nodeSet.has(key)) return;
  indexes.nodeSet.add(key);
  indexes.nodes.push(key);
};

const indexContextBinding = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  indexes: ContextGraphIndexes<ConsumerDefinition, ProviderDefinition>,
  sourceBinding: ContextBinding<ConsumerDefinition, ProviderDefinition>,
) => {
  const binding = copyBinding(sourceBinding);
  const providerKey = binding.providerFence.key;
  const provider = indexes.providers.get(providerKey);

  if (provider !== undefined) {
    if (
      provider.ref !== binding.provider ||
      provider.incarnation !== binding.providerFence.incarnation
    )
      return Result.fail(invalidContext("provider-incarnation"));
  } else {
    indexes.providers.set(
      providerKey,
      copyObject({
        key: providerKey,
        incarnation: binding.providerFence.incarnation,
        ref: binding.provider,
      }),
    );
  }

  const consumerBindings = indexes.bindingByConsumer.get(binding.consumer);

  if (consumerBindings === undefined) indexes.bindingByConsumer.set(binding.consumer, [binding]);
  else {
    if (consumerBindings.some((candidate) => candidate.slot === binding.slot))
      return Result.fail(invalidContext("duplicate-slot"));
    consumerBindings.push(binding);
  }

  rememberContextNode(indexes, providerKey);
  rememberContextNode(indexes, binding.consumer);
  let dependents = indexes.edgeSets.get(providerKey);

  if (dependents === undefined) {
    dependents = new Set();
    indexes.edgeSets.set(providerKey, dependents);
  }

  dependents.add(binding.consumer);

  return Result.succeed(undefined);
};

/** Builds owned indexes from trusted bindings and the admitted topology. */
export const buildContextGraph = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
>(
  bindings: ContextBinding<ConsumerDefinition, ProviderDefinition>[],
  topology?: ActorDependencyGraph,
) => {
  const indexes = makeContextGraphIndexes<ConsumerDefinition, ProviderDefinition>();

  for (const sourceBinding of bindings) {
    const indexed = indexContextBinding(indexes, sourceBinding);

    if (Result.isFailure(indexed)) return Result.fail(indexed.failure);
  }

  const localDependents = new Map(
    [...indexes.edgeSets.entries()].map(([key, values]) => [key, ownedSet(values)] as const),
  );

  const orderResult =
    topology === undefined
      ? deriveOrder(indexes.nodes, localDependents)
      : Result.succeed(
          copyArray([
            ...topology.order,
            ...indexes.nodes.filter((node) => !topology.order.includes(node)),
          ]),
        );

  if (Result.isFailure(orderResult)) return Result.fail(orderResult.failure);

  const dependents =
    topology === undefined
      ? localDependents
      : new Map(
          [...topology.reverse.entries()].map(
            ([key, edges]) => [key, ownedSet(edges.map((edge) => edge.consumer))] as const,
          ),
        );

  return Result.succeed(
    copyObject({
      providers: new Map(indexes.providers),
      bindings: new Map(
        [...indexes.bindingByConsumer.entries()].map(
          ([key, value]) => [key, copyArray(value)] as const,
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
) => {
  const colors = new Map<ActorKey, "gray" | "black">();

  // RETURN_TYPE: Recursive cycle discovery uses its return value in the recursive call.
  const visit = (node: ActorKey, path: ActorKey[]): ActorKey[] | undefined => {
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

  return Result.succeed(copyArray([]));
};

/** Returns the trusted provider-first order restricted to one transitive dirty wave. */
export const topologicalContextOrder = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
>(
  graph: ContextGraph<ConsumerDefinition, ProviderDefinition>,
  dirty: Set<ActorKey>,
) => {
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

  return Result.succeed(copyArray(order));
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
) => {
  const selected = Result.try({
    try: () => {
      const authored = binding.select(providerSnapshot);

      return {
        value: ownContextValue(authored),
        authoredIdentity: contextIdentity(authored),
      };
    },
    catch: (cause) =>
      copyObject({
        binding,
        consumer: binding.consumer,
        slot: binding.slot,
        providerRevision,
        diagnostic: cause instanceof Diagnostic ? cause : Defect(cause),
      }),
  });

  if (Result.isFailure(selected)) return Result.fail(selected.failure);

  return Result.succeed(
    copyObject({
      binding,
      slot: binding.slot,
      value: selected.success.value,
      authoredIdentity: selected.success.authoredIdentity,
      providerRevision,
    }),
  );
};

const projectionFromEntries = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  consumer: ActorKey,
  bindings: ContextBinding<ConsumerDefinition, ProviderDefinition>[],
  entries: Map<
    ContextBinding<ConsumerDefinition, ProviderDefinition>,
    ContextSelectionLedgerEntry<ConsumerDefinition, ProviderDefinition>
  >,
  revisions: ProviderRevisionVector,
  changedSlots: Set<keyof ContextOf<ConsumerDefinition> & string>,
) => {
  const values = new Map<
    keyof ContextOf<ConsumerDefinition> & string,
    ActorContextValue<ConsumerDefinition, keyof ContextOf<ConsumerDefinition> & string>
  >();

  for (const binding of bindings) {
    const entry = entries.get(binding);

    if (entry === undefined || Option.isNone(entry.lastValid))
      return Result.fail(invalidContext("missing-last-valid"));
    values.set(binding.slot, ownContextValue(entry.lastValid.value.value));
  }

  return Result.succeed(
    copyObject({
      consumer,
      values: new Map(values),
      revisions: copyRevisionVector(revisions),
      changedSlots: ownedSet(changedSlots),
    }),
  );
};

const baselineProjection = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  consumer: ActorKey,
  bindings: ContextBinding<ConsumerDefinition, ProviderDefinition>[],
  entries: Map<
    ContextBinding<ConsumerDefinition, ProviderDefinition>,
    ContextSelectionLedgerEntry<ConsumerDefinition, ProviderDefinition>
  >,
  revisions: ProviderRevisionVector,
) => projectionFromEntries(consumer, bindings, entries, revisions, ownedSet([]));

const flattenBindings = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  graph: ContextGraph<ConsumerDefinition, ProviderDefinition>,
) => copyArray([...graph.bindings.values()].flat());

/** Installs provider selections and the fixed binding set before activation. */
export const installContextBaseline = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
>(
  graph: ContextGraph<ConsumerDefinition, ProviderDefinition>,
  snapshots: Map<ActorKey, ActorContextSnapshot<ProviderDefinition>>,
  providerRevision: ProviderRevisionVector,
) => {
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
      copyObject({
        binding,
        lastValid: Option.some(selected.success),
        pending: Option.none(),
        providerRevision: revision,
        defect: Option.none(),
      }),
    );
  }

  const copiedRevisions = copyRevisionVector(providerRevision);
  const projections: ContextProjection<ConsumerDefinition>[] = [];

  for (const [consumer, bindings] of graph.bindings) {
    const projection = baselineProjection(consumer, bindings, entries, copiedRevisions);

    if (Result.isFailure(projection)) return Result.fail(projection.failure);
    projections.push(projection.success);
  }

  const ledger: ContextSelectionLedger<ConsumerDefinition, ProviderDefinition> = copyObject({
    entries: new Map(entries),
    providerRevisions: copiedRevisions,
  });

  const baseline: ContextBaseline<ConsumerDefinition, ProviderDefinition> = copyObject({
    _tag: "context-baseline",
    graph,
    bindings: flattenBindings(graph),
    providerRevision: copiedRevisions,
    ledger,
    projections: copyArray(projections),
  });

  return Result.succeed(baseline);
};

/** Crosses the activation barrier while retaining the silent baseline unchanged. */
export const activateContextBaseline = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
>(
  baseline: ContextBaseline<ConsumerDefinition, ProviderDefinition>,
) =>
  copyObject({
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
  dirty: Set<ActorKey>,
  previous: Option.Option<ContextWave>,
) => {
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
    copyObject({
      providerRevision: copyRevisionVector(providerRevision),
      dirty: ownedSet(currentDirty),
      order: order.success,
      coalesced: Option.isSome(previous),
    }),
  );
};

const mergedRevisions = (previous: ProviderRevisionVector, current: ProviderRevisionVector) => {
  const merged = new Map(previous);

  for (const [key, revision] of current) merged.set(key, revision);

  return new Map(merged);
};

const revisionForConsumer = (revisions: ContextRevisionVector, consumer: ActorKey) => {
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

type ContextWaveSelections<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
> = {
  candidates: Map<
    ContextBinding<ConsumerDefinition, ProviderDefinition>,
    ContextSelectionLedgerEntry<ConsumerDefinition, ProviderDefinition>
  >;
  defects: ContextSelectorDefect<ConsumerDefinition, ProviderDefinition>[];
  freshDefects: boolean;
  changedSlots: Set<keyof ContextOf<ConsumerDefinition> & string>;
};

type ContextWaveApplication<
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
> = {
  graph: ContextGraph<ConsumerDefinition, ProviderDefinition>;
  waveSnapshots: Map<ActorKey, ActorContextSnapshot<ProviderDefinition>>;
  previous: ContextSelectionLedger<ConsumerDefinition, ProviderDefinition>;
  consumerRevisions: ContextRevisionVector;
  nextEntries: Map<
    ContextBinding<ConsumerDefinition, ProviderDefinition>,
    ContextSelectionLedgerEntry<ConsumerDefinition, ProviderDefinition>
  >;
  nextProviderRevisions: ProviderRevisionVector;
  projections: ContextProjection<ConsumerDefinition>[];
  publications: ContextPublication<ConsumerDefinition>[];
  selectorDefects: ContextSelectorDefect<ConsumerDefinition, ProviderDefinition>[];
  settledProviders: Set<ActorKey>;
};

const hasAdvancedContextProvider = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  bindings: ContextBinding<ConsumerDefinition, ProviderDefinition>[],
  wave: ContextWave,
  previous: ContextSelectionLedger<ConsumerDefinition, ProviderDefinition>,
  settledProviders: Set<ActorKey>,
) =>
  bindings.some((binding) => {
    const key = binding.providerFence.key;
    const current = wave.providerRevision.get(key);
    const prior = previous.providerRevisions.get(key) ?? -1;

    return settledProviders.has(key) || (isRevision(current) && current > prior);
  });

const selectBindingContext = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  binding: ContextBinding<ConsumerDefinition, ProviderDefinition>,
  previous: ContextSelectionLedgerEntry<ConsumerDefinition, ProviderDefinition>,
  lastValid: ContextSelection<ConsumerDefinition, ProviderDefinition>,
  snapshot: ActorContextSnapshot<ProviderDefinition>,
  revision: number,
) => {
  if (revision === previous.providerRevision) {
    const retained = Option.isSome(previous.pending) ? previous.pending.value : lastValid;

    return {
      entry: previous,
      defect: previous.defect,
      freshDefect: false,
      changed: !equalContextSelection(retained.authoredIdentity, lastValid.authoredIdentity),
    };
  }

  const selected = selectContext(binding, snapshot, revision);

  if (Result.isFailure(selected)) {
    return {
      entry: copyObject({
        binding,
        lastValid: previous.lastValid,
        pending: Option.none(),
        providerRevision: revision,
        defect: Option.some(selected.failure),
      }),
      defect: Option.some(selected.failure),
      freshDefect: true,
      changed: false,
    };
  }

  const changed = !equalContextSelection(
    selected.success.authoredIdentity,
    lastValid.authoredIdentity,
  );

  return {
    entry: copyObject({
      binding,
      lastValid: previous.lastValid,
      pending: changed ? Option.some(selected.success) : Option.none(),
      providerRevision: revision,
      defect: Option.none(),
    }),
    defect: Option.none<ContextSelectorDefect<ConsumerDefinition, ProviderDefinition>>(),
    freshDefect: false,
    changed,
  };
};

const selectConsumerContext = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  bindings: ContextBinding<ConsumerDefinition, ProviderDefinition>[],
  providerRevisions: ProviderRevisionVector,
  snapshots: Map<ActorKey, ActorContextSnapshot<ProviderDefinition>>,
  previous: ContextSelectionLedger<ConsumerDefinition, ProviderDefinition>,
) => {
  const candidates = new Map<
    ContextBinding<ConsumerDefinition, ProviderDefinition>,
    ContextSelectionLedgerEntry<ConsumerDefinition, ProviderDefinition>
  >();

  const defects: ContextSelectorDefect<ConsumerDefinition, ProviderDefinition>[] = [];
  let freshDefects = false;
  const changedSlots = new Set<keyof ContextOf<ConsumerDefinition> & string>();

  for (const binding of bindings) {
    const previousEntry = previous.entries.get(binding);

    if (previousEntry === undefined || Option.isNone(previousEntry.lastValid))
      return Result.fail(invalidContext("missing-ledger-entry"));
    const providerSnapshot = snapshots.get(binding.providerFence.key);

    if (providerSnapshot === undefined)
      return Result.fail(missingProvider(binding.providerFence.key));
    const providerRevision = providerRevisions.get(binding.providerFence.key);

    if (!isRevision(providerRevision))
      return Result.fail(invalidRevision(binding.providerFence.key));

    const selected = selectBindingContext(
      binding,
      previousEntry,
      previousEntry.lastValid.value,
      providerSnapshot,
      providerRevision,
    );

    candidates.set(binding, selected.entry);

    if (Option.isSome(selected.defect)) defects.push(selected.defect.value);

    freshDefects ||= selected.freshDefect;

    if (selected.changed) changedSlots.add(binding.slot);
  }

  return Result.succeed({ candidates, defects, freshDefects, changedSlots });
};

const storeContextCandidates = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  bindings: ContextBinding<ConsumerDefinition, ProviderDefinition>[],
  candidates: ContextWaveSelections<ConsumerDefinition, ProviderDefinition>["candidates"],
  entries: ContextWaveApplication<ConsumerDefinition, ProviderDefinition>["nextEntries"],
  committed: boolean,
) => {
  for (const binding of bindings) {
    const candidate = candidates.get(binding);

    if (candidate === undefined) return Result.fail(invalidContext("incomplete-candidate"));
    entries.set(
      binding,
      committed && Option.isSome(candidate.pending)
        ? copyObject({ ...candidate, lastValid: candidate.pending, pending: Option.none() })
        : candidate,
    );
  }

  return Result.succeed(undefined);
};

const propagateAndSettleContextProjection = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  consumer: ActorKey,
  projection: ContextProjection<ConsumerDefinition>,
  application: ContextWaveApplication<ConsumerDefinition, ProviderDefinition>,
) => {
  const propagated = propagateProjection(
    application.graph,
    application.waveSnapshots,
    consumer,
    projection,
  );

  if (Result.isFailure(propagated)) return Result.fail(propagated.failure);

  return Result.succeed(undefined);
};

const publishIssueOnlyContext = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  consumer: ActorKey,
  bindings: ContextBinding<ConsumerDefinition, ProviderDefinition>[],
  selections: ContextWaveSelections<ConsumerDefinition, ProviderDefinition>,
  application: ContextWaveApplication<ConsumerDefinition, ProviderDefinition>,
) => {
  const revisionState = revisionForConsumer(application.consumerRevisions, consumer);

  if (Result.isFailure(revisionState)) return Result.fail(revisionState.failure);
  const nextRevisionState = nextContextRevision(revisionState.success, true);

  if (Result.isFailure(nextRevisionState)) return Result.fail(nextRevisionState.failure);

  const stored = storeContextCandidates(
    bindings,
    selections.candidates,
    application.nextEntries,
    false,
  );

  if (Result.isFailure(stored)) return Result.fail(stored.failure);

  const retained = projectionFromEntries(
    consumer,
    bindings,
    application.previous.entries,
    application.nextProviderRevisions,
    ownedSet([]),
  );

  if (Result.isFailure(retained)) return Result.fail(retained.failure);
  application.projections.push(retained.success);
  const propagated = propagateAndSettleContextProjection(consumer, retained.success, application);

  if (Result.isFailure(propagated)) return Result.fail(propagated.failure);
  application.publications.push(
    copyObject({
      consumer,
      projection: retained.success,
      publicationRevision: nextRevisionState.success.publicationRevision,
      machineTurnRevision: nextRevisionState.success.machineTurnRevision,
      issueOnly: true as const,
      selectorDefects: copyArray(selections.defects.map((defect) => defect.diagnostic)),
    }),
  );
  application.selectorDefects.push(...selections.defects);

  return Result.succeed(undefined);
};

const publishUnchangedContext = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  consumer: ActorKey,
  bindings: ContextBinding<ConsumerDefinition, ProviderDefinition>[],
  selections: ContextWaveSelections<ConsumerDefinition, ProviderDefinition>,
  application: ContextWaveApplication<ConsumerDefinition, ProviderDefinition>,
) => {
  const stored = storeContextCandidates(
    bindings,
    selections.candidates,
    application.nextEntries,
    true,
  );

  if (Result.isFailure(stored)) return Result.fail(stored.failure);

  const unchanged = projectionFromEntries(
    consumer,
    bindings,
    application.nextEntries,
    application.nextProviderRevisions,
    ownedSet([]),
  );

  if (Result.isFailure(unchanged)) return Result.fail(unchanged.failure);

  return propagateAndSettleContextProjection(consumer, unchanged.success, application);
};

const publishChangedContext = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  consumer: ActorKey,
  bindings: ContextBinding<ConsumerDefinition, ProviderDefinition>[],
  selections: ContextWaveSelections<ConsumerDefinition, ProviderDefinition>,
  nextRevision: ContextRevision,
  application: ContextWaveApplication<ConsumerDefinition, ProviderDefinition>,
) => {
  const stored = storeContextCandidates(
    bindings,
    selections.candidates,
    application.nextEntries,
    true,
  );

  if (Result.isFailure(stored)) return Result.fail(stored.failure);

  const projection = projectionFromEntries(
    consumer,
    bindings,
    application.nextEntries,
    application.nextProviderRevisions,
    ownedSet(selections.changedSlots),
  );

  if (Result.isFailure(projection)) return Result.fail(projection.failure);
  const propagated = propagateAndSettleContextProjection(consumer, projection.success, application);

  if (Result.isFailure(propagated)) return Result.fail(propagated.failure);
  application.settledProviders.add(consumer);
  application.nextProviderRevisions.set(consumer, nextRevision.publicationRevision);
  application.projections.push(projection.success);
  application.publications.push(
    copyObject({
      consumer,
      projection: projection.success,
      publicationRevision: nextRevision.publicationRevision,
      machineTurnRevision: nextRevision.machineTurnRevision,
      issueOnly: false as const,
      selectorDefects: copyArray([]),
    }),
  );

  return Result.succeed(undefined);
};

const applyConsumerContextSelections = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition,
>(
  consumer: ActorKey,
  bindings: ContextBinding<ConsumerDefinition, ProviderDefinition>[],
  selections: ContextWaveSelections<ConsumerDefinition, ProviderDefinition>,
  application: ContextWaveApplication<ConsumerDefinition, ProviderDefinition>,
) => {
  if (selections.defects.length > 0) {
    if (selections.freshDefects)
      return publishIssueOnlyContext(consumer, bindings, selections, application);

    return storeContextCandidates(bindings, selections.candidates, application.nextEntries, false);
  }

  if (selections.changedSlots.size === 0)
    return publishUnchangedContext(consumer, bindings, selections, application);

  const revisionState = revisionForConsumer(application.consumerRevisions, consumer);

  if (Result.isFailure(revisionState)) return Result.fail(revisionState.failure);
  const nextRevision = nextContextRevision(revisionState.success, false);

  if (Result.isFailure(nextRevision)) return Result.fail(nextRevision.failure);

  return publishChangedContext(consumer, bindings, selections, nextRevision.success, application);
};

/** Applies a wave as one complete batch; no consumer projection escapes mid-evaluation. */
export const applyContextWave = <
  ConsumerDefinition extends MachineDefinition,
  ProviderDefinition extends MachineDefinition = ConsumerDefinition,
>(
  wave: ContextWave,
  graph: ContextGraph<ConsumerDefinition, ProviderDefinition>,
  snapshots: Map<ActorKey, ActorContextSnapshot<ProviderDefinition>>,
  previous: ContextSelectionLedger<ConsumerDefinition, ProviderDefinition>,
  revisions: ContextRevisionVector = new Map(),
) => {
  const application: ContextWaveApplication<ConsumerDefinition, ProviderDefinition> = {
    graph,
    waveSnapshots: new Map(snapshots),
    previous,
    consumerRevisions: revisions,
    nextEntries: new Map(previous.entries),
    nextProviderRevisions: mergedRevisions(previous.providerRevisions, wave.providerRevision),
    projections: [],
    publications: [],
    selectorDefects: [],
    settledProviders: new Set(wave.dirty),
  };

  const processed = new Set<ActorKey>();

  for (const consumer of wave.order) {
    const bindings = graph.bindings.get(consumer);

    if (bindings === undefined || processed.has(consumer)) continue;
    processed.add(consumer);

    if (!hasAdvancedContextProvider(bindings, wave, previous, application.settledProviders))
      continue;

    const selections = selectConsumerContext(
      bindings,
      application.nextProviderRevisions,
      application.waveSnapshots,
      previous,
    );

    if (Result.isFailure(selections)) return Result.fail(selections.failure);

    const applied = applyConsumerContextSelections(
      consumer,
      bindings,
      selections.success,
      application,
    );

    if (Result.isFailure(applied)) return Result.fail(applied.failure);
  }

  const ledger: ContextSelectionLedger<ConsumerDefinition, ProviderDefinition> = copyObject({
    entries: new Map(application.nextEntries),
    providerRevisions: application.nextProviderRevisions,
  });

  return Result.succeed(
    copyObject({
      _tag: "context-wave-published" as const,
      wave,
      projections: copyArray(application.projections),
      publications: copyArray(application.publications),
      ledger,
      selectorDefects: copyArray(application.selectorDefects),
    }),
  );
};

/** Creates a passive dependency tracker; a defect leaves the previous set untouched. */
// RETURN_TYPE: Preserves the generic passive-observer surface while closure state stays private.
export const makePassiveObserver = <Dependency>(): PassiveObserver<Dependency> => {
  let tracked: Dependency[] = copyArray([]);

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
      return copyObject({ _tag: "passive-defect" as const, diagnostic: evaluated.failure });
    const dependencies = copyArray(next);
    tracked = dependencies;

    return copyObject({
      _tag: "passive-observation" as const,
      value: evaluated.success,
      dependencies,
    });
  };

  return { evaluate, observe: evaluate, dependencies: () => tracked };
};
