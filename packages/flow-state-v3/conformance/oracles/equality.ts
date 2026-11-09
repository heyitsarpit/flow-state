import { Predicate } from "effect";

/**
 * Whether two plain data values are the same value: primitives by `Object.is`, arrays item by
 * item, plain objects key by key in any order.
 *
 * **When to use**
 *
 * Comparing values a fixture or a runtime published: inputs, memory, rows.
 *
 * **Gotchas**
 *
 * - A key whose value is `undefined` is not the same as an absent key.
 * - Class instances, maps and sets compare by identity.
 */
export const sameData = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;

  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((item, i) => sameData(item, b[i]));

  if (!Predicate.isObject(a) || !Predicate.isObject(b) || Array.isArray(a) || Array.isArray(b))
    return false;

  if (
    Object.getPrototypeOf(a) !== Object.prototype ||
    Object.getPrototypeOf(b) !== Object.prototype
  )
    return false;
  const left = Object.entries(a);
  const right = new Map(Object.entries(b));

  return (
    left.length === right.size && left.every(([k, v]) => right.has(k) && sameData(v, right.get(k)))
  );
};
