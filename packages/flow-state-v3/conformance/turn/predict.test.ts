import assert from "node:assert/strict";
import { Option } from "effect";
import { describe, it } from "vite-plus/test";
import { changeOf } from "./predict.ts";

describe("a turn's change to its record (WriteAhead's Dirty)", () => {
  const fields = Option.some({ cartId: "c1" });

  it("a leaf move surely changes it", () => {
    assert.deepStrictEqual(changeOf(true, false, fields, fields), Option.some(true));
  });

  it("an update that changes a folded field surely changes it", () => {
    assert.deepStrictEqual(
      changeOf(false, true, fields, Option.some({ cartId: "c2" })),
      Option.some(true),
    );
  });

  it("an update that changes no folded field may change nothing", () => {
    assert.deepStrictEqual(changeOf(false, true, fields, fields), Option.none());
    assert.deepStrictEqual(changeOf(false, true, Option.none(), Option.none()), Option.none());
  });

  it("a turn that neither moves nor updates changes nothing", () => {
    assert.deepStrictEqual(changeOf(false, false, fields, fields), Option.some(false));
  });
});
