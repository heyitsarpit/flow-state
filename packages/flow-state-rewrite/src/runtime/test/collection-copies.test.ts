import { assert, describe, it } from "@effect/vitest";

import { copyArray, copyObject } from "../collection-copies.js";

describe("runtime collection copies", () => {
  it("copies arrays without freezing them and preserves shallow element identity", () => {
    const item = { value: 1 };
    const source = [item];
    const copied = copyArray(source);

    assert.notStrictEqual(copied, source);
    assert.strictEqual(copied[0], item);
    copied.push({ value: 2 });
    assert.strictEqual(source.length, 1);
    assert.strictEqual(copied.length, 2);
  });

  it("copies objects without freezing them and preserves shallow value identity", () => {
    const nested = { value: 1 };
    const source = { nested, label: "before" };
    const copied = copyObject(source);

    assert.notStrictEqual(copied, source);
    assert.strictEqual(copied.nested, nested);
    copied.label = "after";
    assert.strictEqual(source.label, "before");
    assert.strictEqual(copied.label, "after");
  });

  it("uses ordinary mutable native Map and Set collections", () => {
    const map = new Map([["before", 1]]);
    const set = new Set(["before"]);

    map.set("after", 2);
    set.add("after");

    assert.deepStrictEqual(
      [...map],
      [
        ["before", 1],
        ["after", 2],
      ],
    );
    assert.deepStrictEqual([...set], ["before", "after"]);
    assert.strictEqual("set" in map, true);
    assert.strictEqual("add" in set, true);
  });
});
