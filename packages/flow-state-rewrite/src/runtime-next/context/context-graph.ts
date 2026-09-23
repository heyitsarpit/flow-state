import { Option, Result } from "effect";

import { Failure, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { ActorIdentity } from "../actor/actor-directory.js";

export type ContextGraphEdge = Readonly<{ slot: string; provider: ActorIdentity }>;

export type ContextGraphNode = Readonly<{
  identity: ActorIdentity;
  providers: readonly ContextGraphEdge[];
}>;

export type ContextGraph = Readonly<{
  nodes: ReadonlyMap<string, ContextGraphNode>;
  providersByConsumer: ReadonlyMap<string, readonly ContextGraphEdge[]>;
  consumersByProvider: ReadonlyMap<string, ReadonlySet<string>>;
}>;

export type ContextWavePlan = Readonly<{
  order: readonly ActorIdentity[];
  affected: ReadonlySet<string>;
  layers: readonly (readonly ActorIdentity[])[];
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

const indexNodes = (nodes: readonly ContextGraphNode[]) => {
  const byKey = new Map<string, ContextGraphNode>();

  for (const node of nodes) {
    const key = node.identity.key;

    if (byKey.has(key)) return Result.fail(invalid("duplicate-node", ["context", key]));
    byKey.set(key, { identity: node.identity, providers: [...node.providers] });
  }

  return Result.succeed(byKey);
};

const indexNodeEdges = (
  node: ContextGraphNode,
  byKey: Map<string, ContextGraphNode>,
  consumers: Map<string, Set<string>>,
) => {
  const edges: ContextGraphEdge[] = [];
  const slots = new Set<string>();

  for (const edge of node.providers) {
    const provider = byKey.get(edge.provider.key);

    if (slots.has(edge.slot)) return Result.fail(invalid("duplicate-slot", ["context", edge.slot]));

    if (provider === undefined || !sameIdentity(provider.identity, edge.provider))
      return Result.fail(invalid("missing-provider", ["context", edge.slot]));

    slots.add(edge.slot);
    edges.push({ slot: edge.slot, provider: edge.provider });
    consumers.get(edge.provider.key)?.add(node.identity.key);
  }

  return Result.succeed(edges);
};

type RadixNode = {
  value: Option.Option<string>;
  children: Map<number, RadixNode>;
  digits: Uint32Array;
};

type RadixFrame = { node: RadixNode; word: number; bits: number; entered: boolean };

const radixNode = () => ({
  value: Option.none<string>(),
  children: new Map<number, RadixNode>(),
  digits: new Uint32Array(8),
});

const insertRadixKey = (root: RadixNode, key: string) => {
  let node = root;

  for (let index = 0; index < key.length; index += 1) {
    const unit = key.charCodeAt(index);

    for (const digit of [unit >>> 8, unit & 255]) {
      let child = node.children.get(digit);

      if (child === undefined) {
        child = radixNode();
        node.children.set(digit, child);
        node.digits[digit >>> 5] = (node.digits[digit >>> 5] ?? 0) | (1 << (digit & 31));
      }

      node = child;
    }
  }

  node.value = Option.some(key);
};

const nextRadixChild = (frame: RadixFrame) => {
  while (frame.word < 8) {
    if (frame.bits === 0) {
      frame.word += 1;
      frame.bits = frame.node.digits[frame.word] ?? 0;

      continue;
    }

    const bit = frame.bits & -frame.bits;
    const digit = frame.word * 32 + 31 - Math.clz32(bit);
    frame.bits ^= bit;

    return frame.node.children.get(digit);
  }

  return undefined;
};

/** Order keys by UTF-16 bytes without comparison sorting or recursive traversal. */
const orderedKeys = (keys: Set<string>) => {
  if (keys.size < 2) return [...keys];
  const root = radixNode();

  for (const key of keys) insertRadixKey(root, key);

  const ordered: string[] = [];
  const stack: RadixFrame[] = [{ node: root, word: 0, bits: root.digits[0] ?? 0, entered: false }];

  while (stack.length > 0) {
    const frame = stack.at(-1)!;

    if (!frame.entered) {
      frame.entered = true;

      if (Option.isSome(frame.node.value)) ordered.push(frame.node.value.value);
    }

    const child = nextRadixChild(frame);

    if (child === undefined) stack.pop();
    else stack.push({ node: child, word: 0, bits: child.digits[0] ?? 0, entered: false });
  }

  return ordered;
};

const validateAcyclic = (
  providers: Map<string, ContextGraphEdge[]>,
  consumers: Map<string, Set<string>>,
) => {
  const remaining = new Map(
    [...providers].map(
      ([key, edges]) => [key, new Set(edges.map((edge) => edge.provider.key)).size] as const,
    ),
  );

  const ready = [...remaining].flatMap(([key, count]) => (count === 0 ? [key] : []));
  let visited = 0;

  for (let index = 0; index < ready.length; index += 1) {
    const key = ready[index];

    if (key === undefined) continue;
    visited += 1;

    for (const consumer of consumers.get(key) ?? []) {
      const next = (remaining.get(consumer) ?? 0) - 1;
      remaining.set(consumer, next);

      if (next === 0) ready.push(consumer);
    }
  }

  return visited === providers.size
    ? Result.succeed(undefined)
    : Result.fail(invalid("dependency-cycle"));
};

/** Own both graph indexes and validate the complete registered topology. */
// RETURN_TYPE: The graph builder exposes typed validation failure to registration.
export const buildContextGraph = (
  nodes: readonly ContextGraphNode[],
): Result.Result<ContextGraph, PublicDiagnostic> => {
  const indexed = indexNodes(nodes);

  if (Result.isFailure(indexed)) return Result.fail(indexed.failure);
  const providers = new Map<string, ContextGraphEdge[]>();

  const consumers = new Map<string, Set<string>>(
    [...indexed.success.keys()].map((key) => [key, new Set<string>()]),
  );

  for (const node of indexed.success.values()) {
    const edges = indexNodeEdges(node, indexed.success, consumers);

    if (Result.isFailure(edges)) return Result.fail(edges.failure);
    providers.set(node.identity.key, edges.success);
  }

  const acyclic = validateAcyclic(providers, consumers);

  if (Result.isFailure(acyclic)) return Result.fail(acyclic.failure);

  return Result.succeed({
    nodes: indexed.success,
    providersByConsumer: providers,
    consumersByProvider: new Map(
      [...consumers].map(([key, values]) => [key, new Set(orderedKeys(values))] as const),
    ),
  });
};

const collectAffected = (graph: ContextGraph, root: ActorIdentity) => {
  const affected = new Set<string>([root.key]);
  const pending = [root.key];

  for (let index = 0; index < pending.length; index += 1) {
    const key = pending[index];

    if (key === undefined) continue;

    for (const consumer of graph.consumersByProvider.get(key) ?? []) {
      if (affected.has(consumer)) continue;
      affected.add(consumer);
      pending.push(consumer);
    }
  }

  return affected;
};

const appendLayer = (layers: ActorIdentity[][], depth: number, identity: ActorIdentity) => {
  if (depth === 0) return;
  const layer = layers[depth - 1] ?? [];
  layer.push(identity);
  layers[depth - 1] = layer;
};

const releaseConsumers = (
  graph: ContextGraph,
  key: string,
  depth: number,
  affected: Set<string>,
  remaining: Map<string, number>,
  depths: Map<string, number>,
  ready: string[],
) => {
  for (const consumer of graph.consumersByProvider.get(key) ?? []) {
    if (!affected.has(consumer)) continue;
    depths.set(consumer, Math.max(depths.get(consumer) ?? 0, depth + 1));
    const next = (remaining.get(consumer) ?? 0) - 1;
    remaining.set(consumer, next);

    if (next === 0) ready.push(consumer);
  }
};

const orderAffected = (graph: ContextGraph, root: ActorIdentity, affected: Set<string>) => {
  const remaining = new Map<string, number>();

  for (const key of affected)
    remaining.set(
      key,
      new Set(
        (graph.providersByConsumer.get(key) ?? [])
          .filter((edge) => affected.has(edge.provider.key))
          .map((edge) => edge.provider.key),
      ).size,
    );

  const depths = new Map<string, number>([[root.key, 0]]);
  const ready = [root.key];
  const order: ActorIdentity[] = [];
  const layers: ActorIdentity[][] = [];

  for (let index = 0; index < ready.length; index += 1) {
    const key = ready[index];
    const node = key === undefined ? undefined : graph.nodes.get(key);

    if (key === undefined || node === undefined) return Result.fail(invalid("missing-node"));
    order.push(node.identity);
    const depth = depths.get(key) ?? 0;
    appendLayer(layers, depth, node.identity);
    releaseConsumers(graph, key, depth, affected, remaining, depths, ready);
  }

  return order.length === affected.size
    ? Result.succeed({ order, layers })
    : Result.fail(invalid("dependency-cycle"));
};

/** Plan one reachable graph cut in provider order and dependency-depth layers. */
// RETURN_TYPE: The wave planner exposes a stable graph-plan Result contract.
export const planContextWave = (
  graph: ContextGraph,
  root: ActorIdentity,
): Result.Result<ContextWavePlan, PublicDiagnostic> => {
  const registered = graph.nodes.get(root.key);

  if (registered === undefined || !sameIdentity(registered.identity, root))
    return Result.fail(invalid("unknown-root"));

  const affected = collectAffected(graph, root);
  const ordered = orderAffected(graph, root, affected);

  return Result.isFailure(ordered)
    ? Result.fail(ordered.failure)
    : Result.succeed({ ...ordered.success, affected });
};
