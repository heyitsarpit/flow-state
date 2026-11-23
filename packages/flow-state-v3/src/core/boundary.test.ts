import { Arbitrary, Effect, Predicate, Result, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { walkerOf } from "./boundary.ts";
import { sameValue } from "./same.ts";

// FLOW_STATE_ALLOW_UNKNOWN: a generated Schema's values, compared by shape.
type Value = unknown;

// FLOW_STATE_ALLOW_UNKNOWN: a generated Schema, its types erased for the comparison.
type Any = Schema.Codec<Value, Value>;

// RETURN_TYPE: the erased Schema the comparison reads.
const erase = <S extends Schema.Top>(schema: S): Any =>
  // SAFETY: the comparison reads values only through the Schema's own parsers.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a generated Schema's types are erased for the table
  schema as never;

class Point extends Schema.Class<Point>("Point")({
  x: Schema.Number,
  label: Schema.optionalKey(Schema.String),
}) {}

class Moved extends Schema.TaggedClass<Moved>()("Moved", {
  at: Schema.Date,
  note: Schema.optionalKey(Schema.NumberFromString),
}) {}

const leaves: ReadonlyArray<readonly [string, Any]> = [
  ["String", erase(Schema.String)],
  ["Number", erase(Schema.Number)],
  ["positive", erase(Schema.Number.check(Schema.isGreaterThan(0)))],
  ["Date", erase(Schema.Date)],
  ["NumberFromString", erase(Schema.NumberFromString)],
  ["Option", erase(Schema.Option(Schema.String))],
  ["Literals", erase(Schema.Literals(["a", "b"]))],
  ["Point", erase(Point)],
  ["Moved", erase(Moved)],
];

// The forms a Schema wraps a part in: each optional key, default, union, collection and
// transformation Effect's parser handles.
const wrappers: ReadonlyArray<readonly [string, (inner: Any) => Any]> = [
  ["itself", (inner) => inner],
  [
    "optionalKey",
    (inner) => erase(Schema.Struct({ id: Schema.String, v: Schema.optionalKey(inner) })),
  ],
  ["optional", (inner) => erase(Schema.Struct({ v: Schema.optional(inner) }))],
  ["NullOr", (inner) => erase(Schema.NullOr(inner))],
  ["fromJsonString", (inner) => erase(Schema.fromJsonString(Schema.toCodecJson(inner)))],
  ["Array", (inner) => erase(Schema.Array(inner))],
  ["Tuple", (inner) => erase(Schema.Tuple([Schema.String, Schema.optionalKey(inner)]))],
  ["Record", (inner) => erase(Schema.Record(Schema.String, inner))],
  ["Map", (inner) => erase(Schema.ReadonlyMap(Schema.String, inner))],
  ["Set", (inner) => erase(Schema.ReadonlySet(inner))],
  [
    "tagged union",
    (inner) =>
      erase(
        Schema.Union([
          Schema.TaggedStruct("A", { v: inner }),
          Schema.TaggedStruct("B", { w: Schema.optionalKey(inner) }),
        ]),
      ),
  ],
];

const SAMPLES = 25;

// Values drawn from a Schema by Effect's own generator, the one that knows every Schema form.
const sampled = (schema: Any, seed: number) => {
  // @effect-diagnostics-next-line unstableApiUsage:off -- Effect's generator for the Schemas under test; a test-only use
  const arbitrary = Arbitrary.schema(schema);
  // @effect-diagnostics-next-line unstableApiUsage:off -- Effect's sampler for the Schemas under test; a test-only use
  const samples = Arbitrary.sampleEffect(arbitrary, { count: SAMPLES, seed });

  // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- a test draws its samples once, at its edge
  return Effect.runSync(samples);
};

// An encoded value with each of its object keys left out in turn.
const withoutEachKey = (value: Value) =>
  Predicate.isObject(value) && !Array.isArray(value)
    ? Object.keys(value).map((k) =>
        Object.fromEntries(Object.entries(value).filter(([key]) => key !== k)),
      )
    : [];

// Whether two results agree: both fail, or both succeed with equal values.
const agree = <E1, E2>(a: Result.Result<Value, E1>, b: Result.Result<Value, E2>) =>
  Result.isSuccess(a)
    ? Result.isSuccess(b) && sameValue(a.success, b.success)
    : Result.isFailure(b);

// What a walker disagrees with Effect's parser on, over a Schema's sampled values: each value's
// encode and type check, and the decode of its encoded form, with each key left out, and of the
// value itself.
const disagreementsOf = (schema: Any, seed: number) => {
  const json = erase(Schema.toCodecJson(schema));
  const walker = walkerOf(json);
  const disagreements: Array<string> = [];

  for (const [n, value] of sampled(schema, seed).entries()) {
    const encoded = Schema.encodeUnknownResult(json)(value);

    const inputs = Result.match(encoded, {
      onSuccess: (e) => [e, ...withoutEachKey(e), value],
      onFailure: () => [value],
    });

    if (!agree(walker.encode(value), encoded)) disagreements.push(`encode of sample ${n}`);

    if (walker.is(value) !== Schema.is(schema)(value)) disagreements.push(`is of sample ${n}`);

    for (const [i, input] of inputs.entries())
      if (!agree(walker.decode(input), Schema.decodeUnknownResult(json)(input)))
        disagreements.push(`decode ${i} of sample ${n}`);
  }

  return disagreements;
};

describe("the walkers agree with Effect's parser (Codec R6, I8)", () => {
  for (const [leafName, leaf] of leaves)
    for (const [wrapName, wrap] of wrappers)
      it(`Codec I8: ${wrapName} of ${leafName}: encode, decode and the type check give what Effect gives, missing keys included`, () => {
        expect(disagreementsOf(wrap(leaf), leafName.length * 31 + wrapName.length)).toEqual([]);
      });
});

describe("a decoding default past the call stack's budget (Codec R6)", () => {
  it("Codec R6: a default with an effect runs at each level that lacks its key, however deep", () => {
    const made = { count: 0 };

    const stamp = Schema.Number.pipe(
      Schema.withDecodingDefaultKey(Effect.sync(() => (made.count += 1))),
    );

    // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the type of a Schema.optionalKey field, as the Schema reads it
    type Level = { readonly stamp: number; readonly next?: Level };

    // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the encoded side of Schema.optionalKey fields
    const Level: Schema.Codec<Level, { readonly stamp?: number; readonly next?: unknown }> =
      Schema.Struct({
        stamp,
        next: Schema.optionalKey(Schema.suspend(() => Level)),
      });

    const depth = 200;

    const input = Array.from({ length: depth - 1 }).reduce<Record<string, unknown>>(
      (inner) => ({ next: inner }),
      {},
    );

    const decoded = Result.getOrThrow(walkerOf(Level).decode(input));
    const stamps = new Set<number>();

    for (let at: Level | undefined = decoded; at !== undefined; at = at.next) stamps.add(at.stamp);

    expect(stamps.size).toBe(depth);
  });
});

describe("a value deeper than the call stack (Codec R6)", () => {
  it("Codec R6: a list 100,000 levels deep decodes, encodes and checks off the call stack, its depth kept", () => {
    // oxlint-disable-next-line lint-bomb/no-optional-domain-properties -- the type of a Schema.optionalKey field, as the Schema reads it
    type Link = { readonly next?: Link };

    const Link: Schema.Codec<Link> = Schema.Struct({
      next: Schema.optionalKey(Schema.suspend(() => Link)),
    });

    const depth = 100_000;

    const input = Array.from({ length: depth - 1 }).reduce<Link>((inner) => ({ next: inner }), {});

    const levels = (value: Link) => {
      let count = 0;

      for (let at: Link | undefined = value; at !== undefined; at = at.next) count += 1;

      return count;
    };

    const walker = walkerOf(Link);

    expect(Result.map(walker.decode(input), levels)).toEqual(Result.succeed(depth));
    expect(Result.map(walker.encode(input), levels)).toEqual(Result.succeed(depth));
    expect(walker.is(input)).toBe(true);
  });
});
