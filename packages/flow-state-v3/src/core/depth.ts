import { Predicate } from "effect";

/**
 * How deeply a value may nest: arrays, objects, Maps, Sets and class instances inside one another.
 * The one platform limit on a value's shape. Effect's Schema walk under a recursive
 * `Schema.suspend` and its `Equal` recurse on the call stack; the shallowest measured (a Map nest
 * under a recursive Schema, decoded on Node) throws past 686 nested containers, so this keeps more
 * than half of that in hand for the stack the runtime itself uses.
 */
export const MAX_DEPTH = 256;

// FLOW_STATE_ALLOW_UNKNOWN: a node of any value, read only for what it holds.
type Node = unknown;

// The values a container holds, or none for a leaf.
// RETURN_TYPE: every branch is a list of nodes, an array's own items among them.
const childrenOf = (value: Node): ReadonlyArray<Node> => {
  if (Array.isArray(value)) return value;

  if (!Predicate.isObject(value) || Predicate.isFunction(value)) return [];

  if (value instanceof Map) return [...value.keys(), ...value.values()];

  if (value instanceof Set) return [...value];

  return Object.values(value);
};

/**
 * Whether a value nests no deeper than {@link MAX_DEPTH}, counted without the call stack: each
 * container is walked once at the deepest place it is reached, a container on its own path (a
 * cycle) adds nothing, and the walk stops at the first path past the limit.
 */
export const withinDepth = (root: Node) => {
  // The deepest each container has been reached at, so a shared one is walked again only deeper.
  const reached = new Map<Node, number>();
  const open = new Set<Node>();

  const stack: Array<{ readonly node: Node; readonly depth: number; readonly leave: boolean }> = [
    { node: root, depth: 1, leave: false },
  ];

  // Walks into a container not yet reached this deep and not on its own path; past the limit, says
  // so.
  const enter = (node: Node, depth: number) => {
    const children = childrenOf(node);

    if (children.length === 0 || open.has(node) || depth <= (reached.get(node) ?? 0)) return true;

    if (depth > MAX_DEPTH) return false;

    reached.set(node, depth);
    open.add(node);
    stack.push({ node, depth, leave: true });

    for (const child of children) stack.push({ node: child, depth: depth + 1, leave: false });

    return true;
  };

  for (let at = stack.pop(); at !== undefined; at = stack.pop()) {
    if (at.leave) open.delete(at.node);
    else if (!enter(at.node, at.depth)) return false;
  }

  return true;
};
