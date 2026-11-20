import { describe, expect, it } from "vite-plus/test";
import { makeFreezer } from "./frozen.ts";

// A Map frozen the way Immer freezes one in dev: its writing methods throw, then the Map is frozen.
const immerFrozen = () => {
  const map = new Map([[1, 1]]);

  for (const name of ["set", "delete", "clear"])
    Object.defineProperty(map, name, {
      value: () => {
        // oxlint-disable-next-line lint-bomb/no-throw-in-core -- the app's own frozen Map refuses a write, as Immer's does
        throw new TypeError("This object has been frozen and should not be mutated");
      },
    });

  // oxlint-disable-next-line lint-bomb/no-object-freeze -- the app's own freeze is what this test is about
  return Object.freeze(map);
};

describe("admitted values are deeply frozen (Turn R24)", () => {
  it("Turn R24: a Map the app froze itself is admitted as it is, trusted as immutable", () => {
    const map = immerFrozen();
    const value = makeFreezer()({ map });

    expect(value.map).toBe(map);
    expect(() => value.map.set(2, 2)).toThrow(TypeError);
  });

  it("Turn R24: a mutable Map in memory is guarded once admitted, so a write throws", () => {
    const value = makeFreezer()({ map: new Map([[1, 1]]) });

    expect(() => value.map.set(2, 2)).toThrow(TypeError);
    expect(value.map.get(2)).toBeUndefined();
  });
});
