import { Predicate } from "effect";

// FLOW_STATE_ALLOW_UNKNOWN: an admitted value, frozen node by node; its own types are the app's.
type Node = unknown;

const isPlainContainer = (value: Node) => {
  if (Array.isArray(value)) return true;

  if (!Predicate.isObject(value)) return false;

  const proto = Object.getPrototypeOf(value);

  return proto === Object.prototype || proto === null;
};

// The nodes a container holds: an array's items, a plain object's fields, a Map's keys and
// values, a Set's items; another object is the app's own and holds none Flow walks.
// RETURN_TYPE: every branch is a list of nodes, an array's own items among them.
const heldBy = (value: Node): ReadonlyArray<Node> => {
  if (Array.isArray(value)) return value;

  if (value instanceof Map) return [...value.keys(), ...value.values()];

  if (value instanceof Set) return [...value];

  return isPlainContainer(value) && Predicate.isObject(value) ? Object.values(value) : [];
};

/**
 * Deep-freezes an admitted value (memory, a selection, a payload, a commit input) without the call
 * stack: every plain object and array in it, through Maps and Sets, whose own entries a freeze
 * cannot fix. A part already frozen is not walked again, so a step pays only for what it made.
 *
 * **When to use**
 *
 * In dev and test, where the host asks for it, so a mutation of an admitted value throws where it
 * happens; production pays nothing.
 *
 * **Gotchas**
 *
 * - A class instance is the app's own and is left as it is, and so are a Map's and a Set's own
 *   entries: only what they hold is frozen.
 */
export const freezeDeep = <A>(root: A) => {
  const stack: Array<Node> = [root];
  const seen = new Set<Node>();

  // Freezes one node not yet met and pushes what it holds.
  const freezeOne = (at: Node) => {
    seen.add(at);

    // oxlint-disable-next-line lint-bomb/no-object-freeze -- Pending D29: an admitted value is immutable by contract, and dev and test freeze it so a mutation throws
    if (isPlainContainer(at)) Object.freeze(at);

    for (const node of heldBy(at)) if (Predicate.isObjectOrArray(node)) stack.push(node);
  };

  for (let at = stack.pop(); at !== undefined; at = stack.pop())
    if (!seen.has(at) && !(isPlainContainer(at) && Object.isFrozen(at))) freezeOne(at);

  return root;
};

/**
 * An admitted value, deep-frozen when the step's environment asks for it.
 */
export const admitted = <A>(freeze: boolean, value: A) => (freeze ? freezeDeep(value) : value);
