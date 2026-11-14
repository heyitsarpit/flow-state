import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { jsonKey } from "./json-key.ts";

describe("json keys", () => {
  it("equal values give one key whatever their field order; different values differ", () => {
    assert.equal(jsonKey({ a: 1, b: { c: [1, { d: 2, e: 3 }] } }), jsonKey({ b: { c: [1, { e: 3, d: 2 }] }, a: 1 }));
    assert.notEqual(jsonKey({ a: 1 }), jsonKey({ a: 2 }));
    assert.notEqual(jsonKey([1, 2]), jsonKey([2, 1]));
    assert.notEqual(jsonKey(null), jsonKey("null"));
  });
});
