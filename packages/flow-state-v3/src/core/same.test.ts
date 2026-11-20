import { Data, Equal, Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { sameValue } from "./same.ts";

class Box extends Schema.Class<Box>("Same/Box")({ inside: Schema.Unknown }) {}

class Tagged extends Data.TaggedClass("Tagged")<{ readonly inside: unknown }> {}

// A Date read from its text, as a Schema reads one.
const dateAt = Schema.decodeUnknownSync(Schema.toCodecJson(Schema.Date));

// FLOW_STATE_ALLOW_UNKNOWN: a value kind wrapped around another value.
type Wrap = (inside: unknown) => unknown;

// Every value kind a Schema makes, each holding another value.
const kinds: ReadonlyArray<readonly [string, Wrap]> = [
  ["array", (v) => [v]],
  ["plain object", (v) => ({ v })],
  ["Option", (v) => Option.some(v)],
  ["Schema.Class", (v) => new Box({ inside: v })],
  ["Data.TaggedClass", (v) => new Tagged({ inside: v })],
  ["Set of objects", (v) => new Set([{ v }])],
  ["Map keyed by objects", (v) => new Map([[{ v }, 1]])],
  ["Map keyed by strings", (v) => new Map([["k", v]])],
];

// A value `depth` deep, alternating every kind, its innermost leaf `leaf`.
const nest = (depth: number, leaf: unknown) => {
  let value = leaf;

  for (let n = 0; n < depth; n += 1) value = (kinds[n % kinds.length]?.[1] ?? ((v) => v))(value);

  return value;
};

// A sparse array: `first`, then a hole.
const holed = (first: number) => {
  const array: Array<number> = [first];
  array.length = 2;

  return array;
};

describe("structural equality without the call stack (Codec R6)", () => {
  it("Codec R6: a Set's members compare by everything they hold: a DataView's bytes, a regular expression's text, and where a cycle points", () => {
    const view = (byte: number) => new DataView(new Uint8Array([byte]).buffer);
    const toSelf: Record<string, unknown> = {};
    toSelf["n"] = { back: toSelf };
    const child: Record<string, unknown> = {};
    child["back"] = child;
    const toChild = { n: child };

    expect(sameValue(new Set([view(1)]), new Set([view(2)]))).toBe(false);
    expect(sameValue(new Set([view(1)]), new Set([view(1)]))).toBe(true);
    expect(sameValue(view(1), view(2))).toBe(false);
    expect(sameValue(new Set([/a/]), new Set([/b/]))).toBe(false);
    expect(sameValue(new Set([/a/]), new Set([/a/]))).toBe(true);
    expect(sameValue(new Set([toSelf]), new Set([toChild]))).toBe(false);
  });

  it("Codec R6: each value kind compares as Equal does, equal and unequal, shallow", () => {
    for (const [, wrap] of kinds)
      for (const [a, b] of [
        [wrap(1), wrap(1)],
        [wrap(1), wrap(2)],
        [wrap({ x: [1, 2] }), wrap({ x: [1, 2] })],
        [wrap(dateAt("1970-01-01T00:00:00.005Z")), wrap(dateAt("1970-01-01T00:00:00.006Z"))],
      ])
        expect(sameValue(a, b)).toBe(Equal.equals(a, b));
  });

  it("Codec R6: every value kind nested 100,000 deep compares, equal when rebuilt and unequal at the leaf, with no thrown error", () => {
    expect(sameValue(nest(100_000, "leaf"), nest(100_000, "leaf"))).toBe(true);
    expect(sameValue(nest(100_000, "leaf"), nest(100_000, "other"))).toBe(false);
    expect(sameValue(nest(100_000, "leaf"), nest(99_999, "leaf"))).toBe(false);
  });

  it("Codec R6: a sparse array's hole reads as undefined and the comparison goes on past it", () => {
    expect(sameValue(holed(1), holed(2))).toBe(false);
    expect(sameValue(holed(1), holed(1))).toBe(true);
    expect(sameValue(holed(1), [1, undefined])).toBe(Equal.equals(holed(1), [1, undefined]));
  });
});
