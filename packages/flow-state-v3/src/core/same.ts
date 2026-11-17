import { Option, Predicate } from "effect";

// FLOW_STATE_ALLOW_UNKNOWN: a node of two values compared; neither is trusted beyond its shape.
type Node = unknown;

type Pair = readonly [Node, Node];

// An object met in a value, its fields read by key.
type Fields = Readonly<Record<PropertyKey, Node>>;

// An object or array met in a value.
type Container = Fields | ReadonlyArray<Node>;

// What one pair is at its own level: different (none), or the child pairs that decide (none left
// for a pair settled at this level).
type Level = Option.Option<ReadonlyArray<Pair>>;

const differ: Level = Option.none();
const settled: Level = Option.some([]);

// RETURN_TYPE: a type guard states the type it narrows to.
const isList = (value: Container): value is ReadonlyArray<Node> => Array.isArray(value);

// Two leaves equal as `Equal` holds them: the same value, or both NaN.
const sameLeaf = (a: Node, b: Node) =>
  a === b || (Predicate.isNumber(a) && Predicate.isNumber(b) && Number.isNaN(a) && Number.isNaN(b));

// An array's items as pairs, a hole read as undefined, as `Equal` reads it.
const arrayPairs = (a: ReadonlyArray<Node>, b: ReadonlyArray<Node>) => {
  if (a.length !== b.length) return differ;

  const pairs: Array<Pair> = [];

  for (let i = 0; i < a.length; i += 1) pairs.push([a[i], b[i]]);

  return Option.some(pairs);
};

// Two objects' own fields as pairs, when they have the same prototype and the same own keys.
const fieldPairs = (a: Fields, b: Fields) => {
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return differ;

  const keys = Reflect.ownKeys(a);

  return keys.length === Reflect.ownKeys(b).length && keys.every((k) => Object.hasOwn(b, k))
    ? Option.some(keys.map((k) => [a[k], b[k]] as const))
    : differ;
};

// What one comparison's structural keys share: an id for each object or symbol met by identity,
// an id for each container's written form (so a key stays short however deep), and each
// object's key.
type Keys = {
  readonly ids: Map<Node, number>;
  readonly forms: Map<string, number>;
  readonly known: Map<Node, string>;
};

// RETURN_TYPE: a comparison's shared key tables.
const keysOf = (): Keys => ({ ids: new Map(), forms: new Map(), known: new Map() });

const idIn = (ids: Map<Node, number>, value: Node) => {
  const known = ids.get(value);

  if (known !== undefined) return known;

  ids.set(value, ids.size);

  return ids.size - 1;
};

// A leaf's key: its kind and value, a string by its length and text so no two collide.
const leafKey = (value: Node, ids: Map<Node, number>) => {
  if (Predicate.isNumber(value)) {
    if (Number.isNaN(value)) return "n:NaN";

    return `n:${value === 0 ? 0 : value}`;
  }

  if (Predicate.isString(value)) return `s${value.length}:${value}`;

  if (Predicate.isBigInt(value)) return `b:${value}`;

  if (Predicate.isBoolean(value) || value === null || value === undefined)
    return `l:${String(value)}`;

  return `r:${idIn(ids, value)}`;
};

// A container being keyed: its children, how their keys join, and their keys so far.
type Frame = {
  readonly value: Container;
  readonly head: string;
  readonly nodes: ReadonlyArray<Node>;
  readonly sorted: boolean;
  readonly keys: Array<string>;
};

// A container's frame: a Map's entries and a Set's items keyed in sorted order, a Date by its time,
// another object by its prototype and its own fields in key order.
// RETURN_TYPE: every branch is a container's frame.
const frameOf = (value: Container, ids: Map<Node, number>): Frame => {
  if (isList(value)) return { value, head: "[", nodes: Array.from(value), sorted: false, keys: [] };

  if (value instanceof Map)
    return { value, head: "M", nodes: [...value].map(([k, v]) => [k, v]), sorted: true, keys: [] };

  if (value instanceof Set) return { value, head: "S", nodes: [...value], sorted: true, keys: [] };

  if (Predicate.isDate(value))
    return { value, head: `D${value.getTime()}`, nodes: [], sorted: false, keys: [] };

  const keys = Reflect.ownKeys(value).toSorted((x, y) => {
    const kx = leafKey(x, ids);
    const ky = leafKey(y, ids);

    return Number(kx > ky) - Number(kx < ky);
  });

  return {
    value,
    head: `O${idIn(ids, Object.getPrototypeOf(value))}`,
    nodes: keys.map((k) => [k, value[k]]),
    sorted: false,
    keys: [],
  };
};

// A value's structural key: equal values, as this module holds them, give equal keys. Written
// with its own stack, children first; a container's key is the id of its written form, its
// children's keys in order (Maps' entries and Sets' items sorted, so their order is not part of
// it). An object on its own path (a cycle) is written as a back reference.
const keyOf = (root: Node, { ids, forms, known }: Keys) => {
  const open = new Set<Node>();
  const stack: Array<Frame> = [];
  let result = "";

  const place = (key: string) => {
    const parent = stack.at(-1);

    if (parent === undefined) result = key;
    else parent.keys.push(key);
  };

  const formId = (text: string) => {
    const id = forms.get(text) ?? forms.size;

    forms.set(text, id);

    return `#${id}`;
  };

  const enter = (value: Node) => {
    if (!Predicate.isObjectOrArray(value)) place(leafKey(value, ids));
    else if (known.has(value)) place(known.get(value) ?? "");
    else if (open.has(value)) place("cycle");
    else {
      open.add(value);
      stack.push(frameOf(value, ids));
    }
  };

  const leave = (frame: Frame) => {
    stack.pop();
    open.delete(frame.value);
    const keys = frame.sorted ? frame.keys.toSorted() : frame.keys;
    const key = formId(`${frame.head}(${keys.join(",")})`);

    known.set(frame.value, key);
    place(key);
  };

  enter(root);

  for (let frame = stack.at(-1); frame !== undefined; frame = stack.at(-1))
    if (frame.keys.length < frame.nodes.length) enter(frame.nodes[frame.keys.length]);
    else leave(frame);

  return result;
};

// Two collections the same as multisets of their items' keys.
const sameKeys = (a: Iterable<Node>, b: Iterable<Node>, keys: Keys) => {
  const left = [...a].map((x) => keyOf(x, keys)).toSorted();
  const right = [...b].map((x) => keyOf(x, keys)).toSorted();

  return left.length === right.length && left.every((k, i) => k === right[i]);
};

const allPrimitive = (items: Iterable<Node>) =>
  [...items].every((k) => !Predicate.isObjectOrArray(k) && !Predicate.isFunction(k));

const mapLevel = (a: ReadonlyMap<Node, Node>, b: ReadonlyMap<Node, Node>, keys: Keys) => {
  if (a.size !== b.size) return differ;

  if (allPrimitive(a.keys()))
    return [...a.keys()].every((k) => b.has(k))
      ? Option.some([...a].map(([k, v]) => [v, b.get(k)] as const))
      : differ;

  return sameKeys(a, b, keys) ? settled : differ;
};

const setLevel = (a: ReadonlySet<Node>, b: ReadonlySet<Node>, keys: Keys) => {
  if (a.size !== b.size) return differ;

  if (allPrimitive(a)) return [...a].every((k) => b.has(k)) ? settled : differ;

  return sameKeys(a, b, keys) ? settled : differ;
};

// A built-in kind's level: a Date by its time, a regular expression by its text, a typed array
// by its bytes.
const builtInLevel = (a: Container, b: Container, keys: Keys) => {
  if (Predicate.isDate(a))
    return Predicate.isDate(b) && sameLeaf(a.getTime(), b.getTime()) ? settled : differ;

  if (a instanceof RegExp) return b instanceof RegExp && String(a) === String(b) ? settled : differ;

  return ArrayBuffer.isView(b) && keyOf(a, keys) === keyOf(b, keys) ? settled : differ;
};

// The child pairs two objects hold, or that they differ at this level.
// RETURN_TYPE: every branch is a pair's level.
const levelOf = (a: Container, b: Container, keys: Keys): Level => {
  if (isList(a)) return isList(b) ? arrayPairs(a, b) : differ;

  if (isList(b)) return differ;

  if (a instanceof Map) return b instanceof Map ? mapLevel(a, b, keys) : differ;

  if (a instanceof Set) return b instanceof Set ? setLevel(a, b, keys) : differ;

  if (Predicate.isDate(a) || a instanceof RegExp || ArrayBuffer.isView(a))
    return builtInLevel(a, b, keys);

  return fieldPairs(a, b);
};

/**
 * Whether two values are equal as `Equal.equals` holds them, compared without the call stack:
 * the same value at once, NaN equal to NaN, then every kind a Schema produces structurally:
 * arrays (a hole read as undefined), plain objects, class instances (an `Option`, a `Data` value
 * or a `Schema.Class` instance) by their prototype and own fields, Maps and Sets (by their items'
 * structural keys when those are objects), Dates and regular expressions.
 *
 * **When to use**
 *
 * To compare selections and memory, where an untouched part keeps its reference (admitted values
 * are immutable) and a value may nest to any depth.
 *
 * **Details**
 *
 * A pair already compared or under comparison is not walked again, so a shared subtree is walked
 * once and a cycle holds equal, as `Equal` assumes it.
 *
 * **Gotchas**
 *
 * - A class's own `Equal` is not called: its instances compare by their own fields, as a Schema's
 *   values do.
 */
export const sameValue = (left: Node, right: Node) => {
  // Objects already met, by the objects each was compared with.
  const met = new Map<Node, Set<Node>>();
  const keys = keysOf();
  const stack: Array<Pair> = [[left, right]];

  // Whether a pair's own level agrees; its child pairs are pushed to compare next.
  const agrees = (a: Node, b: Node) => {
    if (sameLeaf(a, b)) return true;

    if (!Predicate.isObjectOrArray(a) || !Predicate.isObjectOrArray(b)) return false;

    const seen = met.get(a) ?? new Set<Node>();

    if (seen.has(b)) return true;

    met.set(a, seen.add(b));
    const level = levelOf(a, b, keys);

    if (Option.isSome(level)) for (const child of level.value) stack.push(child);

    return Option.isSome(level);
  };

  while (stack.length > 0) {
    const [a, b] = stack.pop() ?? [undefined, undefined];

    if (!agrees(a, b)) return false;
  }

  return true;
};
