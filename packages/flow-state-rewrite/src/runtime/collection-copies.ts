/** Small shallow owned-copy helpers used by runtime publications. */

// FLOW_STATE_ALLOW_UNKNOWN: This private copy constraint carries heterogeneous admitted record fields; each caller supplies a concrete generic.
type PlainRecord = Record<string, unknown>;

export const copyArray = <Value>(values: Iterable<Value>) => {
  return [...values];
};

export const copyObject = <Value extends PlainRecord>(value: Value) => {
  return { ...value };
};
