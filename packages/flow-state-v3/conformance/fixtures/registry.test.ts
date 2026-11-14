import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Serialize } from "./one-lane.ts";
import { doubledNames, registered } from "./registry.ts";

describe("the fixture registry (review N7)", () => {
  it("names each fixture once", () => {
    assert.deepEqual(doubledNames(registered), []);
  });

  it("refuses a doubled name", () => {
    assert.deepEqual(doubledNames([...registered, Serialize]), [Serialize.name]);
  });
});
