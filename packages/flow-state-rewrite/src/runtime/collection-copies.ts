/** Small shallow owned-copy helpers used by runtime publications. */

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- this private constraint preserves arbitrary admitted record fields while callers remain generic.
type PlainRecord = Record<string, unknown>;

export const copyArray = <Value>(values: Iterable<Value>) => {
  return [...values];
};

export const copyObject = <Value extends PlainRecord>(value: Value) => {
  return { ...value };
};
