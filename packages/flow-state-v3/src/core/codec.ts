import { Data, Predicate, Result, Schema } from "effect";

/**
 * The codec's bounds: nesting depth (the root object or array is depth 1), nodes, items per array,
 * UTF-8 bytes per string or key, and canonical bytes in all.
 */
export const BOUNDS = {
  depth: 32,
  nodes: 10_000,
  items: 4096,
  stringBytes: 262_144,
  bytes: 2_097_152,
} as const;

/**
 * The name of one of the codec's bounds.
 */
export type Bound = keyof typeof BOUNDS;

/**
 * Why a value or a text has no canonical form.
 */
export type Malformation =
  | "json"
  | "nonCanonical"
  | "cycle"
  | "negativeZero"
  | "nonFinite"
  | "loneSurrogate"
  | "notPlain"
  | "sparse";

/**
 * A codec failure: a bound passed, with its limit and the path to the value, or a malformation.
 */
export type CodecFailure = Data.TaggedEnum<{
  BoundExceeded: { bound: Bound; limit: number; path: string };
  Malformed: { reason: Malformation; path: string };
}>;

/**
 * Constructors and matchers for {@link CodecFailure}.
 */
export const CodecFailure = Data.taggedEnum<CodecFailure>();

// How many UTF-8 bytes one code point takes.
const widthOf = (point: number) => {
  if (point < 0x80) return 1;

  if (point < 0x8_00) return 2;

  return point < 0x1_00_00 ? 3 : 4;
};

// The UTF-8 length of a well-formed text, counted without encoding it.
const utf8Bytes = (text: string) => {
  let bytes = 0;

  for (const char of text) bytes += widthOf(char.codePointAt(0) ?? 0);

  return bytes;
};

// Whether a well-formed text passes a UTF-8 bound. A UTF-16 unit takes at most three bytes, so a
// text short enough for that to fit is not counted.
const utf8Over = (text: string, limit: number) =>
  text.length * 3 > limit && utf8Bytes(text) > limit;

// An array index as ECMAScript orders an object's own keys: such keys come first, by value.
const indexOf = (key: string) => {
  const n = Number(key);

  return Number.isInteger(n) && n >= 0 && n < 4_294_967_295 && String(n) === key ? n : -1;
};

/**
 * The canonical key order: array-index keys first by value, then the rest by UTF-16 code units,
 * which is the order every ECMAScript host gives an object built in it.
 */
export const byCanonicalKey = (a: string, b: string) => {
  const ia = indexOf(a);
  const ib = indexOf(b);

  if (ia >= 0 && ib >= 0) return ia - ib;

  if (ia >= 0) return -1;

  if (ib >= 0) return 1;

  return Number(a > b) - Number(a < b);
};

const JsonText = Schema.fromJsonString(Schema.Json);
const toText = Schema.encodeUnknownResult(JsonText);
const fromText = Schema.decodeUnknownResult(JsonText);

// FLOW_STATE_ALLOW_UNKNOWN: an object's fields are checked one by one before they are trusted.
type Fields = Readonly<Record<PropertyKey, unknown>>;

const isPlainObject = (value: Fields) => {
  const proto = Object.getPrototypeOf(value);

  return proto === Object.prototype || proto === null;
};

type Checked = Result.Result<Schema.Json, CodecFailure>;

const BYTE_ORDER_MARK = 0xfe_ff;

/**
 * Checks a value against the codec's bounds and rules and returns it as JSON data with its keys in
 * canonical order, or the first failure in depth-first key order.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a value to encode is checked here node by node before it is trusted as JSON.
export const toCanonicalJson = (root: unknown) => {
  let nodes = 0;
  // FLOW_STATE_ALLOW_UNKNOWN: the containers being visited, to find a cycle.
  const open = new Set<Fields | ReadonlyArray<unknown>>();

  // FLOW_STATE_ALLOW_UNKNOWN: one node of the value being encoded.
  // RETURN_TYPE: visit, items and fields call each other, so one of them states the result.
  const visit = (value: unknown, path: string, depth: number): Checked => {
    nodes += 1;

    if (nodes > BOUNDS.nodes)
      return Result.fail(CodecFailure.BoundExceeded({ bound: "nodes", limit: BOUNDS.nodes, path }));

    if (value === null || Predicate.isBoolean(value)) return Result.succeed(value);

    if (Predicate.isNumber(value)) return number(value, path);

    if (Predicate.isString(value)) return text(value, path);

    if (!Predicate.isObjectOrArray(value))
      return Result.fail(CodecFailure.Malformed({ reason: "notPlain", path }));

    if (open.has(value)) return Result.fail(CodecFailure.Malformed({ reason: "cycle", path }));

    if (depth + 1 > BOUNDS.depth)
      return Result.fail(CodecFailure.BoundExceeded({ bound: "depth", limit: BOUNDS.depth, path }));

    open.add(value);

    const done = Array.isArray(value)
      ? items(value, path, depth + 1)
      : fields(value, path, depth + 1);

    open.delete(value);

    return done;
  };

  const number = (value: number, path: string) => {
    if (!Number.isFinite(value))
      return Result.fail(CodecFailure.Malformed({ reason: "nonFinite", path }));

    return Object.is(value, -0)
      ? Result.fail(CodecFailure.Malformed({ reason: "negativeZero", path }))
      : Result.succeed<Schema.Json>(value);
  };

  // RETURN_TYPE: a key's check returns a failure as a field's own result.
  const text = (value: string, path: string): Checked => {
    if (!value.isWellFormed())
      return Result.fail(CodecFailure.Malformed({ reason: "loneSurrogate", path }));

    return utf8Over(value, BOUNDS.stringBytes)
      ? Result.fail(
          CodecFailure.BoundExceeded({ bound: "stringBytes", limit: BOUNDS.stringBytes, path }),
        )
      : Result.succeed<Schema.Json>(value);
  };

  // FLOW_STATE_ALLOW_UNKNOWN: an array's items are checked one by one.
  const items = (value: ReadonlyArray<unknown>, path: string, depth: number) => {
    if (value.length > BOUNDS.items)
      return Result.fail(CodecFailure.BoundExceeded({ bound: "items", limit: BOUNDS.items, path }));

    const out: Array<Schema.Json> = [];

    for (let i = 0; i < value.length; i += 1) {
      if (!(i in value)) return Result.fail(CodecFailure.Malformed({ reason: "sparse", path }));
      const item = visit(value[i], `${path}[${i}]`, depth);

      if (Result.isFailure(item)) return item;
      out.push(item.success);
    }

    return Result.succeed<Schema.Json>(out);
  };

  const fields = (value: Fields, path: string, depth: number) => {
    if (!isPlainObject(value))
      return Result.fail(CodecFailure.Malformed({ reason: "notPlain", path }));

    const out: Array<readonly [string, Schema.Json]> = [];

    for (const key of Object.keys(value).toSorted(byCanonicalKey)) {
      const named = text(key, path);

      if (Result.isFailure(named)) return named;
      const field = visit(value[key], `${path}.${key}`, depth);

      if (Result.isFailure(field)) return field;
      out.push([key, field.success]);
    }

    // Built from entries, so a key such as `__proto__` stays an own field.
    return Result.succeed<Schema.Json>(Object.fromEntries(out));
  };

  return visit(root, "$", 0);
};

/**
 * Encodes a value as its canonical JSON text: keys in canonical order, no whitespace, within every
 * bound, and never a -0, a non-finite number, a cycle, a lone surrogate, a sparse array or a value
 * JSON has no form for.
 *
 * **When to use**
 *
 * For every value that crosses a storage boundary: equal values give equal text on every host.
 */
// FLOW_STATE_ALLOW_UNKNOWN: any value may be offered; only a canonical one encodes.
export const encodeCanonical = (value: unknown) =>
  Result.flatMap(toCanonicalJson(value), (json) =>
    Result.flatMap(
      Result.mapError(toText(json), () =>
        CodecFailure.Malformed({ reason: "notPlain", path: "$" }),
      ),
      (encoded) =>
        utf8Over(encoded, BOUNDS.bytes)
          ? Result.fail(
              CodecFailure.BoundExceeded({ bound: "bytes", limit: BOUNDS.bytes, path: "$" }),
            )
          : Result.succeed(encoded),
    ),
  );

/**
 * Decodes a canonical JSON text strictly: a byte-order mark, text that is not JSON, or JSON that
 * does not encode back to exactly the same text (unsorted or duplicate keys, other spellings of a
 * number, whitespace) fails.
 */
export const decodeCanonical = (text: string) => {
  const notJson = CodecFailure.Malformed({ reason: "json", path: "$" });

  if (text.charCodeAt(0) === BYTE_ORDER_MARK) return Result.fail(notJson);

  return Result.flatMap(
    Result.mapError(fromText(text), () => notJson),
    (json) =>
      Result.flatMap(encodeCanonical(json), (again) =>
        again === text
          ? Result.succeed(json)
          : Result.fail(CodecFailure.Malformed({ reason: "nonCanonical", path: "$" })),
      ),
  );
};
