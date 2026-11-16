import { Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { decodeCanonical, encodeCanonical } from "./codec.ts";

// FLOW_STATE_ALLOW_UNKNOWN: any value is offered to the codec.
const failureOf = (r: Result.Result<unknown, { readonly _tag: string }>) =>
  Result.isFailure(r) ? r.failure : undefined;

const nested = (depth: number) =>
  Array.from({ length: depth - 1 }).reduce<unknown>((inner) => [inner], []);

describe("Codec bounds (Codec R1, I2)", () => {
  // Each bound accepts its exact value and rejects the next one, naming the bound, its limit and the path.
  const cases = [
    ["depth", 32, (n: number) => nested(n)],
    ["items", 4096, (n: number) => Array.from({ length: n }, () => 0)],
    ["stringBytes", 262_144, (n: number) => "a".repeat(n)],
    [
      "nodes",
      10_000,
      (n: number) =>
        Array.from({ length: 4 }, (_, i) =>
          Array.from({ length: i < 3 ? 2500 : n - 7505 }, () => 0),
        ),
    ],
  ] as const;

  for (const [bound, limit, make] of cases)
    it(`${bound}: ${limit} is accepted and ${limit + 1} rejected`, () => {
      expect(Result.isSuccess(encodeCanonical(make(limit)))).toBe(true);
      expect(failureOf(encodeCanonical(make(limit + 1)))).toMatchObject({
        _tag: "BoundExceeded",
        bound,
        limit,
      });
    });

  it("a key counts against the per-string bound, and the error names its path", () => {
    expect(failureOf(encodeCanonical({ a: { [`${"é".repeat(131_072)}x`]: 1 } }))).toMatchObject({
      bound: "stringBytes",
      path: "$.a",
    });
  });

  it("the canonical text is bounded at 2,097,152 bytes", () => {
    // Nine strings of 233,016 bytes, each 233,018 with its quotes, plus two brackets and eight commas.
    const at = (last: number) => [
      ...Array.from({ length: 8 }, () => "a".repeat(233_016)),
      "a".repeat(last),
    ];

    const text = (last: number) => Result.getOrThrow(encodeCanonical(at(last))).length;

    expect(text(232_996)).toBe(2_097_152);
    expect(failureOf(encodeCanonical(at(232_997)))).toMatchObject({
      bound: "bytes",
      limit: 2_097_152,
    });
  });
});

describe("Canonical encoding (Codec R2)", () => {
  it("sorts keys at every depth and writes no whitespace", () => {
    expect(
      Result.getOrThrow(encodeCanonical({ b: 1, a: { d: [1, { z: 0, y: 1 }], c: null } })),
    ).toBe('{"a":{"c":null,"d":[1,{"y":1,"z":0}]},"b":1}');
  });

  it("a field named __proto__ is kept as a field, both ways (Codec I1)", () => {
    const text = '{"__proto__":{"a":1},"b":2}';

    expect(Result.flatMap(decodeCanonical(text), encodeCanonical)).toEqual(Result.succeed(text));
  });

  it("equal values give equal text whatever the order they were built in", () => {
    expect(encodeCanonical({ x: 1, y: "é" })).toEqual(encodeCanonical({ y: "é", x: 1 }));
  });

  for (const [what, value, reason] of [
    ["-0", -0, "negativeZero"],
    ["NaN", Number.NaN, "nonFinite"],
    ["infinity", Number.POSITIVE_INFINITY, "nonFinite"],
    ["a lone surrogate", "\uD800", "loneSurrogate"],
    [
      "a sparse array",
      Object.assign<Array<number>, { length: number }>([], { length: 2 }),
      "sparse",
    ],
    ["a Map", new Map([["a", 1]]), "notPlain"],
    ["undefined", undefined, "notPlain"],
    ["a bigint", 1n, "notPlain"],
  ] as const)
    it(`${what} is malformed: ${reason}`, () => {
      expect(failureOf(encodeCanonical({ v: value }))).toMatchObject({ _tag: "Malformed", reason });
    });

  it("a cycle is malformed", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;

    expect(failureOf(encodeCanonical(cyclic))).toMatchObject({ reason: "cycle" });
  });
});

describe("Strict decoding (Codec R3, I1, I4)", () => {
  it("decodes canonical text and round-trips both ways", () => {
    const value = { a: [1, "x", true, null, { b: 2.5 }] };
    const text = Result.getOrThrow(encodeCanonical(value));

    expect(decodeCanonical(text)).toEqual(Result.succeed(value));
    expect(Result.flatMap(decodeCanonical(text), encodeCanonical)).toEqual(Result.succeed(text));
  });

  for (const [what, text, reason] of [
    ["a byte-order mark", '﻿{"a":1}', "json"],
    ["text that is not JSON", '{"a":', "json"],
    ["a lone surrogate", '{"a":"\\ud800"}', "loneSurrogate"],
    ["duplicate keys", '{"a":1,"a":2}', "nonCanonical"],
    ["unsorted keys", '{"b":1,"a":2}', "nonCanonical"],
    ["whitespace", '{"a": 1}', "nonCanonical"],
    ["-0", '{"a":-0}', "negativeZero"],
    ["1.0", '{"a":1.0}', "nonCanonical"],
    ["1e0", '{"a":1e0}', "nonCanonical"],
  ] as const)
    it(`${what} is rejected: ${reason}`, () => {
      expect(failureOf(decodeCanonical(text))).toMatchObject({ _tag: "Malformed", reason });
    });
});
