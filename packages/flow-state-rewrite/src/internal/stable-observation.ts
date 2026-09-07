export const isStableKeyList = (left: readonly PropertyKey[], right: readonly PropertyKey[]) =>
  left.length === right.length && left.every((key, index) => key === right[index]);

// RETURN_TYPE: Preserves the data-descriptor narrowing required before reading a stable value.
export const isStableDataDescriptor = (
  left: PropertyDescriptor,
  right: PropertyDescriptor,
): right is PropertyDescriptor & { readonly value: unknown } =>
  "value" in left &&
  "value" in right &&
  left.configurable === right.configurable &&
  left.enumerable === right.enumerable &&
  left.writable === right.writable &&
  Object.is(left.value, right.value);
