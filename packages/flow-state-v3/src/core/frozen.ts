import { Predicate } from "effect";

// FLOW_STATE_ALLOW_UNKNOWN: an admitted value, frozen node by node; its own types are the app's.
type Node = unknown;

// An object met in an admitted value, its fields read by key.
type Fields = Readonly<Record<PropertyKey, Node>>;

// An object or array met in an admitted value.
type Container = Fields | ReadonlyArray<Node>;

// RETURN_TYPE: a type guard states the type it narrows to.
const isList = (value: Container): value is ReadonlyArray<Node> => Array.isArray(value);

// The methods that change a Map, a Set or a Date in place.
const MAP_WRITES = ["set", "delete", "clear"];
const SET_WRITES = ["add", "delete", "clear"];

const DATE_WRITES = [
  "setDate",
  "setFullYear",
  "setHours",
  "setMilliseconds",
  "setMinutes",
  "setMonth",
  "setSeconds",
  "setTime",
  "setUTCDate",
  "setUTCFullYear",
  "setUTCHours",
  "setUTCMilliseconds",
  "setUTCMinutes",
  "setUTCMonth",
  "setUTCSeconds",
  "setYear",
];

const writesOf = (value: Container) => {
  if (value instanceof Map) return MAP_WRITES;

  if (value instanceof Set) return SET_WRITES;

  return Predicate.isDate(value) ? DATE_WRITES : [];
};

// The nodes a container holds: an array's items, a Map's keys and values, a Set's items, another
// object's own fields.
// RETURN_TYPE: every branch is a list of nodes, an array's own items among them.
const heldBy = (value: Container): ReadonlyArray<Node> => {
  if (isList(value)) return value;

  if (value instanceof Map) return [...value.keys(), ...value.values()];

  if (value instanceof Set) return [...value];

  return Reflect.ownKeys(value).map((key) => value[key]);
};

const refuseWrite = (name: string) => () => {
  // oxlint-disable-next-line lint-bomb/no-throw-in-core -- an admitted value is immutable by contract: a write throws where it happens, in dev and test
  throw new TypeError(`Cannot ${name} on an admitted value: admitted values are immutable`);
};

// Freezes one container in place: its own fields, and for a Map, a Set or a Date the methods
// that would change what it holds, each replaced by one that throws.
const freezeOne = (value: Container) => {
  if (ArrayBuffer.isView(value)) return;

  if (!Object.isFrozen(value))
    for (const name of writesOf(value))
      Object.defineProperty(value, name, { value: refuseWrite(name), enumerable: false });

  // oxlint-disable-next-line lint-bomb/no-object-freeze -- an admitted value is immutable by contract, and dev and test freeze it so a mutation throws
  Object.freeze(value);
};

/**
 * A Runtime's freezer: deep-freezes each admitted value (memory, a selection, a payload, a commit
 * input, an action's key) without the call stack: every object and array in it, Maps, Sets and
 * Dates included, whose writing methods then throw. A part it froze before is not walked again, so
 * a step pays only for what it made; a part the app froze only shallowly is walked through.
 *
 * **When to use**
 *
 * In dev and test hosts, so a mutation of an admitted value throws where it happens; production
 * admits values as they are and pays nothing.
 *
 * **Gotchas**
 *
 * - A typed array cannot be frozen and is left as it is.
 */
export const makeFreezer = () => {
  const done = new WeakSet<Container>();

  return <A>(root: A) => {
    const stack: Array<Node> = [root];

    for (let at = stack.pop(); at !== undefined || stack.length > 0; at = stack.pop())
      if (Predicate.isObjectOrArray(at) && !Predicate.isFunction(at) && !done.has(at)) {
        done.add(at);
        freezeOne(at);

        for (const node of heldBy(at)) stack.push(node);
      }

    return root;
  };
};

/**
 * Admits a value as it is: the production host's admission, which freezes nothing.
 */
export const asItIs = <A>(value: A) => value;
