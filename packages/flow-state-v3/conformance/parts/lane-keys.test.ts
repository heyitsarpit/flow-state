import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Equal, HashSet } from "effect";

describe("lane keys by value (Effect's Equal and Hash)", () => {
  it("equal values are one key whatever their field order; different values differ", () => {
    const key = { a: 1, b: { c: [1, { d: 2, e: 3 }] } };
    const reordered = { b: { c: [1, { e: 3, d: 2 }] }, a: 1 };

    assert.ok(Equal.equals(key, reordered));
    assert.ok(HashSet.has(HashSet.make(key), reordered));
    assert.ok(!HashSet.has(HashSet.make({ a: 1 }), { a: 2 }));
    assert.ok(!HashSet.has(HashSet.make([1, 2]), [2, 1]));
    assert.ok(!HashSet.has(HashSet.make(null), "null"));
  });
});
