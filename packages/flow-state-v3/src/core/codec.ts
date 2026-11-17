import { Data, Option, Predicate, Result, Schema } from "effect";

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

// FLOW_STATE_ALLOW_UNKNOWN: an object's fields are checked one by one before they are trusted.
type Fields = Readonly<Record<PropertyKey, unknown>>;

// FLOW_STATE_ALLOW_UNKNOWN: an array's items are checked one by one before they are trusted.
type Items = ReadonlyArray<unknown>;

const isPlainObject = (value: Fields | Items) => {
  const proto = Object.getPrototypeOf(value);

  return proto === Object.prototype || proto === null;
};

const BYTE_ORDER_MARK = 0xfe_ff;

// A container being walked: its items, or its fields in canonical order, the next one to check,
// and the JSON built so far.
type Frame = {
  readonly source: Fields | Items;
  readonly isArray: boolean;
  readonly keys: ReadonlyArray<string>;
  readonly items: Array<Schema.Json>;
  readonly entries: Array<[string, Schema.Json]>;
  next: number;
};

// Why a primitive has no form.
const leafReason = (
  // FLOW_STATE_ALLOW_UNKNOWN: one node of the value being encoded.
  value: unknown,
  negativeZero: "refuse" | "zero",
) => {
  if (Predicate.isNumber(value)) {
    if (!Number.isFinite(value)) return Option.some<Malformation>("nonFinite");

    return Object.is(value, -0) && negativeZero === "refuse"
      ? Option.some<Malformation>("negativeZero")
      : Option.none<Malformation>();
  }

  return Predicate.isString(value) && !value.isWellFormed()
    ? Option.some<Malformation>("loneSurrogate")
    : Option.none<Malformation>();
};

// FLOW_STATE_ALLOW_UNKNOWN: one node of the value being encoded.
const isLeaf = (value: unknown) =>
  value === null ||
  Predicate.isBoolean(value) ||
  Predicate.isNumber(value) ||
  Predicate.isString(value);

// A leaf as canonical JSON: a -0 written as 0.
const leafJson = (value: Schema.Json) => (Object.is(value, -0) ? 0 : value);

// Where the walk stands: the path to the child each frame on the stack is checking.
const pathOf = (stack: ReadonlyArray<Frame>) =>
  stack.reduce(
    (path, f) => (f.isArray ? `${path}[${f.next - 1}]` : `${path}.${f.keys[f.next - 1] ?? ""}`),
    "$",
  );

// A frame for a container, or why it has no form: a sparse array, a non-plain object, or a key
// with a lone surrogate.
const frameOf = (value: Fields | Items) => {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1)
      if (!(i in value)) return Result.fail<Malformation>("sparse");

    const items: Array<Schema.Json> = Array.from(value, () => null);

    return Result.succeed<Frame>({
      source: value,
      isArray: true,
      keys: [],
      items,
      entries: [],
      next: 0,
    });
  }

  if (!isPlainObject(value)) return Result.fail<Malformation>("notPlain");

  const keys = Object.keys(value).toSorted(byCanonicalKey);

  if (keys.some((key) => !key.isWellFormed())) return Result.fail<Malformation>("loneSurrogate");

  const entries: Array<[string, Schema.Json]> = keys.map((key) => [key, null]);

  return Result.succeed<Frame>({
    source: value,
    isArray: false,
    keys,
    items: [],
    entries,
    next: 0,
  });
};

// A finished frame's JSON: an object is built from its entries, so a key such as `__proto__`
// stays an own field.
const builtOf = (frame: Frame) => (frame.isArray ? frame.items : Object.fromEntries(frame.entries));

// The child a frame checks at a position.
const childOf = (frame: Frame, at: number) => {
  const { source } = frame;

  if (Array.isArray(source)) return source[at];

  return Predicate.isObject(source) ? source[frame.keys[at] ?? ""] : null;
};

// Where a checked child goes in its frame: the frame's own arrays, filled in place.
const placeIn = (frame: Frame) => {
  const { items, entries, keys, isArray } = frame;
  const at = frame.next - 1;

  return (json: Schema.Json) => {
    if (isArray) items[at] = json;
    else entries[at] = [keys[at] ?? "", json];
  };
};

/**
 * Checks a value against the codec's rules and returns it as JSON data with its keys in
 * canonical order, or the first failure in depth-first key order. With `negativeZero: "zero"`, a
 * -0 is written as 0, for data compared by `Equal`, which holds them equal. The walk keeps its own
 * stack, so a value of any depth is checked without the host's call stack.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a value to encode is checked here node by node before it is trusted as JSON.
export const toCanonicalJson = (root: unknown, negativeZero: "refuse" | "zero" = "refuse") => {
  if (isLeaf(root))
    return Option.match(leafReason(root, negativeZero), {
      onNone: () => Result.succeed<Schema.Json>(leafJson(root)),
      onSome: (reason) => Result.fail(CodecFailure.Malformed({ reason, path: "$" })),
    });

  if (!Predicate.isObjectOrArray(root))
    return Result.fail(CodecFailure.Malformed({ reason: "notPlain", path: "$" }));

  return Result.flatMap(
    Result.mapError(frameOf(root), (reason) => CodecFailure.Malformed({ reason, path: "$" })),
    (first) => walk(root, first, negativeZero),
  );
};

// Walks a container from its first frame to its JSON, one child at a time.
const walk = (root: Fields | Items, first: Frame, negativeZero: "refuse" | "zero") => {
  // The containers on the current path, to find a cycle; a subtree shared twice is no cycle.
  const open = new Set<Fields | Items>([root]);
  const stack: Array<Frame> = [first];
  let result: Schema.Json = null;

  for (let frame = stack.at(-1); frame !== undefined; frame = stack.at(-1)) {
    if (frame.next === (frame.isArray ? frame.items.length : frame.keys.length)) {
      stack.pop();
      open.delete(frame.source);
      const parent = stack.at(-1);

      if (parent === undefined) result = builtOf(frame);
      else placeIn(parent)(builtOf(frame));
    } else {
      frame.next += 1;
      const failed = enter(frame, stack, open, negativeZero);

      if (Option.isSome(failed))
        return Result.fail(CodecFailure.Malformed({ reason: failed.value, path: pathOf(stack) }));
    }
  }

  return Result.succeed<Schema.Json>(result);
};

// Checks the child a frame has just moved to: puts a leaf in its place, or pushes a container's
// frame; none, or why the child has no form.
const enter = (
  frame: Frame,
  stack: Array<Frame>,
  open: Set<Fields | Items>,
  negativeZero: "refuse" | "zero",
) => {
  const child = childOf(frame, frame.next - 1);

  if (isLeaf(child)) {
    const reason = leafReason(child, negativeZero);

    if (Option.isNone(reason)) placeIn(frame)(leafJson(child));

    return reason;
  }

  if (!Predicate.isObjectOrArray(child)) return Option.some<Malformation>("notPlain");

  if (open.has(child)) return Option.some<Malformation>("cycle");

  const next = frameOf(child);

  if (Result.isFailure(next)) return Option.some(next.failure);
  open.add(child);
  stack.push(next.success);

  return Option.none<Malformation>();
};

// A JSON container being written: its items or fields and the next to write.
type Writing = {
  readonly isArray: boolean;
  readonly items: ReadonlyArray<Schema.Json>;
  readonly fields: ReadonlyArray<readonly [string, Schema.Json]>;
  readonly close: string;
  next: number;
};

// A primitive's JSON text.
const primitiveText = (json: Schema.Json) =>
  // oxlint-disable-next-line flow-state/no-json-stringify -- the codec's own writer: a string, number, boolean or null
  JSON.stringify(json);

// Canonical JSON as text, with no whitespace, written with its own stack: keys come in the order
// the canonical walk built them, which is the canonical order.
const toText = (root: Schema.Json) => {
  const out: Array<string> = [];
  const stack: Array<Writing> = [];

  const write = (json: Schema.Json) => {
    if (Array.isArray(json)) {
      out.push("[");
      stack.push({ isArray: true, items: json, fields: [], close: "]", next: 0 });
    } else if (
      json === null ||
      Predicate.isString(json) ||
      Predicate.isNumber(json) ||
      Predicate.isBoolean(json)
    )
      out.push(primitiveText(json));
    else {
      out.push("{");
      stack.push({ isArray: false, items: [], fields: Object.entries(json), close: "}", next: 0 });
    }
  };

  // Writes a container's item or field `i` after a comma, or closes it past its last.
  const next = (at: Writing, i: number) => {
    if (i === (at.isArray ? at.items.length : at.fields.length)) {
      out.push(at.close);
      stack.pop();

      return;
    }

    if (i > 0) out.push(",");

    if (at.isArray) write(at.items[i] ?? null);
    else {
      const [key, value] = at.fields[i] ?? ["", null];
      out.push(`${primitiveText(key)}:`);
      write(value);
    }
  };

  write(root);

  for (let at = stack.at(-1); at !== undefined; at = stack.at(-1)) {
    const i = at.next;
    at.next += 1;
    next(at, i);
  }

  return out.join("");
};

/**
 * Encodes a value as its canonical JSON text: keys in canonical order, no whitespace, and never a
 * -0, a non-finite number, a cycle, a lone surrogate, a sparse array or a value JSON has no form
 * for. A value of any depth encodes: nothing here uses the host's call stack per level.
 *
 * **When to use**
 *
 * For every value that crosses a storage boundary: equal values give equal text on every host.
 */
// FLOW_STATE_ALLOW_UNKNOWN: any value may be offered; only a canonical one encodes.
export const encodeCanonical = (value: unknown) => Result.map(toCanonicalJson(value), toText);

const fromText = Schema.decodeUnknownResult(Schema.fromJsonString(Schema.Json));

// The host's JSON parser, which on V8 and JavaScriptCore keeps its own stack (a million levels
// parse on Node and Bun); a host that cannot parse a text, however deep, fails here and never
// throws past the codec.
const parsed = (text: string) =>
  Result.flatMap(
    Result.try({
      try: () => fromText(text),
      catch: () => CodecFailure.Malformed({ reason: "json", path: "$" }),
    }),
    (json) => Result.mapError(json, () => CodecFailure.Malformed({ reason: "json", path: "$" })),
  );

/**
 * Decodes a canonical JSON text strictly: a byte-order mark, text that is not JSON, or JSON that
 * does not encode back to exactly the same text (unsorted or duplicate keys, other spellings of a
 * number, whitespace) fails.
 */
export const decodeCanonical = (text: string) => {
  const notJson = CodecFailure.Malformed({ reason: "json", path: "$" });

  if (text.charCodeAt(0) === BYTE_ORDER_MARK) return Result.fail(notJson);

  return Result.flatMap(parsed(text), (json) =>
    Result.flatMap(encodeCanonical(json), (again) =>
      again === text
        ? Result.succeed(json)
        : Result.fail(CodecFailure.Malformed({ reason: "nonCanonical", path: "$" })),
    ),
  );
};
