import { Equal, Option, Predicate } from "effect";

// FLOW_STATE_ALLOW_UNKNOWN: a node of two values compared; neither is trusted beyond its shape.
type Node = unknown;

type Pair = readonly [Node, Node];

// What one pair is at its own level: different (none), or a container whose child pairs decide
// (none left for equal leaves).
type Level = Option.Option<ReadonlyArray<Pair>>;

const differ: Level = Option.none();
const settled: Level = Option.some([]);

const isPlain = (value: Node) => {
  if (!Predicate.isObject(value) || Array.isArray(value)) return false;

  const proto = Object.getPrototypeOf(value);

  return proto === Object.prototype || proto === null;
};

// A Map or Set key matched by itself; an object key would need structural matching.
const isPrimitiveKey = (key: Node) => !Predicate.isObjectOrArray(key) && !Predicate.isFunction(key);

const arrayPairs = (a: ReadonlyArray<Node>, b: Node) =>
  Array.isArray(b) && a.length === b.length
    ? Option.some(a.map((x, i) => [x, b[i]] as const))
    : differ;

const fieldPairs = (a: Readonly<Record<PropertyKey, Node>>, b: Node) => {
  if (!isPlain(b) || !Predicate.isObject(b)) return differ;

  const keys = Reflect.ownKeys(a);

  return keys.length === Reflect.ownKeys(b).length && keys.every((k) => Object.hasOwn(b, k))
    ? Option.some(keys.map((k) => [a[k], b[k]] as const))
    : differ;
};

const mapPairs = (a: ReadonlyMap<Node, Node>, b: ReadonlyMap<Node, Node>) =>
  a.size === b.size && [...a.keys()].every((k) => b.has(k))
    ? Option.some([...a].map(([k, v]) => [v, b.get(k)] as const))
    : differ;

const setPairs = (a: ReadonlySet<Node>, b: ReadonlySet<Node>) =>
  a.size === b.size && [...a].every((k) => b.has(k)) ? settled : differ;

// The child pairs a container pair holds, or that it differs at this level; anything but arrays,
// plain objects, and Maps and Sets keyed by primitives is compared by `Equal` whole.
// RETURN_TYPE: every branch is a pair's level.
const levelOf = (a: Node, b: Node): Level => {
  if (Array.isArray(a)) return arrayPairs(a, b);

  if (isPlain(a) && Predicate.isObject(a)) return fieldPairs(a, b);

  if (a instanceof Map && b instanceof Map && [...a.keys()].every(isPrimitiveKey))
    return mapPairs(a, b);

  if (a instanceof Set && b instanceof Set && [...a].every(isPrimitiveKey)) return setPairs(a, b);

  return Equal.equals(a, b) ? settled : differ;
};

// Two nodes equal as `Equal` holds leaves: the same value, or both NaN.
const sameLeaf = (a: Node, b: Node) =>
  a === b || (Predicate.isNumber(a) && Predicate.isNumber(b) && Number.isNaN(a) && Number.isNaN(b));

/**
 * Whether two values are equal as `Equal.equals` holds them, compared without the call stack:
 * the same object at once, then arrays, plain objects, and Maps and Sets keyed by primitives
 * structurally, NaN equal to NaN; any other object by `Equal.equals`.
 *
 * **When to use**
 *
 * To compare selections and memory, where an untouched part keeps its reference (updates are
 * immutable) and a value may nest to any depth.
 *
 * **Details**
 *
 * A pair already compared or under comparison is not walked again, so a shared subtree is walked
 * once and a cycle holds equal, as `Equal` assumes it.
 */
export const sameValue = (left: Node, right: Node) => {
  // Objects already met, by the objects each was compared with.
  const met = new Map<Node, Set<Node>>();
  const stack: Array<Pair> = [[left, right]];

  // Whether a pair's own level agrees; its child pairs are pushed to compare next.
  const agrees = ([a, b]: Pair) => {
    if (sameLeaf(a, b)) return true;

    if (!Predicate.isObjectOrArray(a) || !Predicate.isObjectOrArray(b)) return false;

    const seen = met.get(a) ?? new Set<Node>();

    if (seen.has(b)) return true;

    met.set(a, seen.add(b));
    const level = levelOf(a, b);

    if (Option.isSome(level)) for (const child of level.value) stack.push(child);

    return Option.isSome(level);
  };

  for (let pair = stack.pop(); pair !== undefined; pair = stack.pop())
    if (!agrees(pair)) return false;

  return true;
};
