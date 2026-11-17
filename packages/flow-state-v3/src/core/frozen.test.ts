import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { makeFreezer } from "./frozen.ts";

const epoch = Schema.decodeSync(Schema.DateFromString)("1970-01-01T00:00:00.000Z");

describe("admitted values are deeply frozen (Turn R24)", () => {
  it.fails("Turn R24: a write to a Map, a Set or a Date the app froze itself throws once admitted", () => {
    const admit = makeFreezer();

    const value = admit({
      // oxlint-disable-next-line lint-bomb/no-object-freeze -- the app's own shallow freeze is what this test is about
      map: Object.freeze(new Map([[1, 1]])),
      // oxlint-disable-next-line lint-bomb/no-object-freeze -- the app's own shallow freeze is what this test is about
      set: Object.freeze(new Set([1])),
      // oxlint-disable-next-line lint-bomb/no-object-freeze -- the app's own shallow freeze is what this test is about
      date: Object.freeze(epoch),
    });

    expect(() => value.map.set(2, 2)).toThrow(TypeError);
    expect(() => value.set.add(2)).toThrow(TypeError);
    expect(() => value.date.setTime(1)).toThrow(TypeError);
  });
});
