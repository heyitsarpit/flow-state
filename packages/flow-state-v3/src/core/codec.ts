import { Data, Predicate, Result, Schema } from "effect";

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
 * A codec failure: a malformation, with the path to the value.
 */
export type CodecFailure = Data.TaggedEnum<{
  Malformed: { reason: Malformation; path: string };
}>;

/**
 * Constructors and matchers for {@link CodecFailure}.
 */
export const CodecFailure = Data.taggedEnum<CodecFailure>();

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
 * Checks a value against the codec's rules and returns it as JSON data with its keys in
 * canonical order, or the first failure in depth-first key order. With `negativeZero: "zero"`, a
 * -0 is written as 0, for data compared by `Equal`, which holds them equal.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a value to encode is checked here node by node before it is trusted as JSON.
export const toCanonicalJson = (root: unknown, negativeZero: "refuse" | "zero" = "refuse") => {
  // FLOW_STATE_ALLOW_UNKNOWN: the containers being visited, to find a cycle.
  const open = new Set<Fields | ReadonlyArray<unknown>>();

  // FLOW_STATE_ALLOW_UNKNOWN: one node of the value being encoded.
  // RETURN_TYPE: visit, items and fields call each other, so one of them states the result.
  const visit = (value: unknown, path: string): Checked => {
    if (value === null || Predicate.isBoolean(value)) return Result.succeed(value);

    if (Predicate.isNumber(value)) return number(value, path);

    if (Predicate.isString(value)) return text(value, path);

    if (!Predicate.isObjectOrArray(value))
      return Result.fail(CodecFailure.Malformed({ reason: "notPlain", path }));

    if (open.has(value)) return Result.fail(CodecFailure.Malformed({ reason: "cycle", path }));

    open.add(value);

    const done = Array.isArray(value) ? items(value, path) : fields(value, path);

    open.delete(value);

    return done;
  };

  const number = (value: number, path: string) => {
    if (!Number.isFinite(value))
      return Result.fail(CodecFailure.Malformed({ reason: "nonFinite", path }));

    if (!Object.is(value, -0)) return Result.succeed<Schema.Json>(value);

    return negativeZero === "zero"
      ? Result.succeed<Schema.Json>(0)
      : Result.fail(CodecFailure.Malformed({ reason: "negativeZero", path }));
  };

  // RETURN_TYPE: a key's check returns a failure as a field's own result.
  const text = (value: string, path: string): Checked =>
    value.isWellFormed()
      ? Result.succeed<Schema.Json>(value)
      : Result.fail(CodecFailure.Malformed({ reason: "loneSurrogate", path }));

  // FLOW_STATE_ALLOW_UNKNOWN: an array's items are checked one by one.
  const items = (value: ReadonlyArray<unknown>, path: string) => {
    const out: Array<Schema.Json> = [];

    for (let i = 0; i < value.length; i += 1) {
      if (!(i in value)) return Result.fail(CodecFailure.Malformed({ reason: "sparse", path }));
      const item = visit(value[i], `${path}[${i}]`);

      if (Result.isFailure(item)) return item;
      out.push(item.success);
    }

    return Result.succeed<Schema.Json>(out);
  };

  const fields = (value: Fields, path: string) => {
    if (!isPlainObject(value))
      return Result.fail(CodecFailure.Malformed({ reason: "notPlain", path }));

    const out: Array<readonly [string, Schema.Json]> = [];

    for (const key of Object.keys(value).toSorted(byCanonicalKey)) {
      const named = text(key, path);

      if (Result.isFailure(named)) return named;
      const field = visit(value[key], `${path}.${key}`);

      if (Result.isFailure(field)) return field;
      out.push([key, field.success]);
    }

    // Built from entries, so a key such as `__proto__` stays an own field.
    return Result.succeed<Schema.Json>(Object.fromEntries(out));
  };

  return visit(root, "$");
};

/**
 * Encodes a value as its canonical JSON text: keys in canonical order, no whitespace, and never a
 * -0, a non-finite number, a cycle, a lone surrogate, a sparse array or a value
 * JSON has no form for.
 *
 * **When to use**
 *
 * For every value that crosses a storage boundary: equal values give equal text on every host.
 */
// FLOW_STATE_ALLOW_UNKNOWN: any value may be offered; only a canonical one encodes.
export const encodeCanonical = (value: unknown) =>
  Result.flatMap(toCanonicalJson(value), (json) =>
    Result.mapError(toText(json), () => CodecFailure.Malformed({ reason: "notPlain", path: "$" })),
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
