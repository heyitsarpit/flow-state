/** Small native collection boundaries used by immutable runtime publications. */

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- this private constraint preserves arbitrary admitted record fields while callers remain generic.
type PlainRecord = Readonly<Record<string, unknown>>;

export const immutableArray = <Value>(values: Iterable<Value>) => {
  // oxlint-disable-next-line anti-slop/no-object-freeze -- published arrays must reject container mutation.
  return Object.freeze([...values]);
};

// RETURN_TYPE: Keeps the runtime publication record readonly after its shallow copy is made.
export const immutableRecord = <Value extends PlainRecord>(value: Value): Readonly<Value> => {
  // oxlint-disable-next-line anti-slop/no-object-freeze -- published records must reject property mutation.
  return Object.freeze({ ...value });
};

// RETURN_TYPE: The wrapper exposes native Map lookup and iteration while hiding all mutators.
export const readonlyMap = <Key, Value>(
  entries: Iterable<readonly [Key, Value]>,
): ReadonlyMap<Key, Value> => {
  const source = new Map(entries);
  const result: ReadonlyMap<Key, Value> = {
    get: (key) => source.get(key),
    has: (key) => source.has(key),
    get size() {
      return source.size;
    },
    entries: () => source.entries(),
    keys: () => source.keys(),
    values: () => source.values(),
    forEach: (callback, thisArg) => {
      // oxlint-disable-next-line anti-slop/no-for-each -- Map.forEach is required by the ReadonlyMap contract.
      source.forEach((value, key) => callback.call(thisArg, value, key, result));
    },
    [Symbol.iterator]: () => source[Symbol.iterator](),
  };
  // oxlint-disable-next-line anti-slop/no-object-freeze -- the wrapper exposes no mutating Map methods.
  return Object.freeze(result);
};
