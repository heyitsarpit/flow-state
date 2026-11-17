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

/**
 * A value's canonical text, already written: the writer copies it in place of the value, so a part
 * encoded once (a memory field whose value is unchanged) is never walked again.
 */
export class Canonical extends Data.Class<{ readonly text: string }> {}

// Whether a key is an array index: such keys come first in every ECMAScript host's own key order,
// ascending, which is also their canonical order.
const isIndex = (key: string) => {
  const n = Number(key);

  return Number.isInteger(n) && n >= 0 && n < 4_294_967_295 && String(n) === key;
};

// An object's keys in canonical order: array-index keys first by value (as the host already orders
// them), then the rest by UTF-16 code units, which is the default sort.
const canonicalKeys = (keys: ReadonlyArray<string>) => {
  let indices = 0;

  while (indices < keys.length && isIndex(keys[indices] ?? "")) indices += 1;

  return indices === 0
    ? keys.toSorted()
    : [...keys.slice(0, indices), ...keys.slice(indices).toSorted()];
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

// How a container's keys are written: in canonical order, or in the object's own order.
type Order = "canonical" | "given";

// How a value is written: its keys' order, and whether a -0 is refused or written as 0.
type Mode = { readonly order: Order; readonly negativeZero: "refuse" | "zero" };

// A container being written: its items, or its fields in canonical order, and the next to write.
type Frame = {
  readonly source: Fields | Items;
  readonly keys: Option.Option<ReadonlyArray<string>>;
  readonly size: number;
  next: number;
};

// A primitive's JSON text.
// FLOW_STATE_ALLOW_UNKNOWN: a string, finite number, boolean or null, checked before.
const primitiveText = (json: unknown) =>
  // oxlint-disable-next-line flow-state/no-json-stringify -- the codec's own writer: a string, number, boolean or null
  JSON.stringify(json);

// Why a primitive has no form, or none for a leaf that has one; a value that is no leaf is none
// too.
// FLOW_STATE_ALLOW_UNKNOWN: one node of the value being encoded.
const leafReason = (value: unknown, negativeZero: "refuse" | "zero") => {
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

// Where the walk stands: the path to the child each frame on the stack is writing.
const pathOf = (stack: ReadonlyArray<Frame>) =>
  stack.reduce(
    (path, f) =>
      Option.match(f.keys, {
        onNone: () => `${path}[${f.next - 1}]`,
        onSome: (keys) => `${path}.${keys[f.next - 1] ?? ""}`,
      }),
    "$",
  );

// A frame for a container, or why it has no form: a sparse array, a non-plain object, or a key
// with a lone surrogate.
const frameOf = (value: Fields | Items, order: Order) => {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1)
      if (!(i in value)) return Result.fail<Malformation>("sparse");

    return Result.succeed<Frame>({
      source: value,
      keys: Option.none(),
      size: value.length,
      next: 0,
    });
  }

  if (!isPlainObject(value)) return Result.fail<Malformation>("notPlain");

  const keys = order === "canonical" ? canonicalKeys(Object.keys(value)) : Object.keys(value);

  if (keys.some((key) => !key.isWellFormed())) return Result.fail<Malformation>("loneSurrogate");

  return Result.succeed<Frame>({
    source: value,
    keys: Option.some(keys),
    size: keys.length,
    next: 0,
  });
};

// The child a frame writes at a position.
const childOf = (frame: Frame, at: number) => {
  const { source } = frame;

  if (Array.isArray(source)) return source[at];

  return Option.match(frame.keys, {
    onNone: () => null,
    onSome: (keys) => (Predicate.isObject(source) ? source[keys[at] ?? ""] : null),
  });
};

// Writes one value of a container (or the root): a leaf's text, an already written part, or a
// container's opening, its frame pushed; none, or why the value has no form.
const enter = (
  // FLOW_STATE_ALLOW_UNKNOWN: one node of the value being encoded.
  value: unknown,
  out: Array<string>,
  stack: Array<Frame>,
  open: Set<Fields | Items>,
  mode: Mode,
) => {
  if (isLeaf(value)) {
    const reason = leafReason(value, mode.negativeZero);

    if (Option.isNone(reason)) out.push(Object.is(value, -0) ? "0" : primitiveText(value));

    return reason;
  }

  if (value instanceof Canonical) {
    out.push(value.text);

    return Option.none<Malformation>();
  }

  if (!Predicate.isObjectOrArray(value)) return Option.some<Malformation>("notPlain");

  if (open.has(value)) return Option.some<Malformation>("cycle");

  const frame = frameOf(value, mode.order);

  if (Result.isFailure(frame)) return Option.some(frame.failure);

  out.push(Array.isArray(value) ? "[" : "{");
  open.add(value);
  stack.push(frame.success);

  return Option.none<Malformation>();
};

// Writes a value as JSON text in one pass, with its own stack, checking it as it goes.
// FLOW_STATE_ALLOW_UNKNOWN: a value to encode is checked here node by node before it is trusted as JSON.
const write = (root: unknown, mode: Mode) => {
  const out: Array<string> = [];
  const stack: Array<Frame> = [];
  const open = new Set<Fields | Items>();

  const failed = (reason: Malformation) =>
    Result.fail(CodecFailure.Malformed({ reason, path: pathOf(stack) }));

  const first = enter(root, out, stack, open, mode);

  if (Option.isSome(first)) return failed(first.value);

  // Writes a frame's next child, or closes it past its last; none, or why the child has no form.
  const step = () => {
    const frame = stack.at(-1);

    if (frame === undefined) return Option.none<Malformation>();

    if (frame.next === frame.size) {
      stack.pop();
      open.delete(frame.source);
      out.push(Option.isSome(frame.keys) ? "}" : "]");

      return Option.none<Malformation>();
    }

    const at = frame.next;

    frame.next += 1;

    if (at > 0) out.push(",");

    if (Option.isSome(frame.keys)) out.push(`${primitiveText(frame.keys.value[at] ?? "")}:`);

    return enter(childOf(frame, at), out, stack, open, mode);
  };

  while (stack.length > 0) {
    const reason = step();

    if (Option.isSome(reason)) return failed(reason.value);
  }

  return Result.succeed(out.join(""));
};

/**
 * Writes a value as canonical JSON text in one pass, checking it as it goes: keys in canonical
 * order, no whitespace, and never a -0 (written as 0 with `negativeZero: "zero"`), a non-finite
 * number, a cycle, a lone surrogate, a sparse array or a value JSON has no form for. The first
 * failure is a container's own (a sparse array, an object that is not plain, a key with a lone
 * surrogate) before any of its children's, children in canonical order. A {@link Canonical} part
 * is copied as it is. The walk keeps its own stack, so a value of any depth is written without the
 * host's call stack.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a value to encode is checked here node by node before it is trusted as JSON.
export const writeCanonical = (root: unknown, negativeZero: "refuse" | "zero" = "refuse") =>
  write(root, { order: "canonical", negativeZero });

/**
 * Writes JSON data as text with its keys in their own order, as the host's `JSON.stringify` writes
 * JSON data, but with its own stack: a key's text (a lane's or a name's) keeps the bytes it always
 * had at any depth.
 */
// FLOW_STATE_ALLOW_UNKNOWN: JSON data a Schema encoded, checked node by node as it is written.
export const writeJson = (json: unknown) => write(json, { order: "given", negativeZero: "zero" });

// The host's JSON parser, which on V8 and JavaScriptCore keeps its own stack (a million levels
// parse on Node and Bun); a host that cannot parse a text, however deep, fails here and never
// throws past the codec. Its output is JSON data by construction.
// FLOW_STATE_ALLOW_UNKNOWN: parsed text is JSON data by construction; it is not walked again.
const fromText = Schema.decodeUnknownResult(Schema.fromJsonString(Schema.Unknown));

const parsed = (text: string) =>
  Result.mapBoth(
    Result.flatMap(Result.try({ try: () => fromText(text), catch: () => "thrown" }), (json) =>
      Result.mapError(json, () => "refused"),
    ),
    {
      onFailure: () => CodecFailure.Malformed({ reason: "json", path: "$" }),
      // SAFETY: the host's JSON parser, which `fromJsonString` runs, returns JSON data only; it is
      // not walked again.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- parsed text is JSON data by construction
      onSuccess: (json) => json as Schema.Json,
    },
  );

/**
 * Parses text the codec wrote: the host's JSON parser, failing as `json`, never thrown.
 */
export const parseCanonical = (text: string) => parsed(text);

/**
 * Checks a value against the codec's rules and returns it as JSON data with its keys in
 * canonical order, or the first failure the walk meets. With `negativeZero: "zero"`, a -0 is
 * written as 0, for data compared by its text.
 */
// FLOW_STATE_ALLOW_UNKNOWN: a value to encode is checked here node by node before it is trusted as JSON.
export const toCanonicalJson = (root: unknown, negativeZero: "refuse" | "zero" = "refuse") =>
  Result.flatMap(writeCanonical(root, negativeZero), parsed);

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
export const encodeCanonical = (value: unknown) => writeCanonical(value);

/**
 * Decodes a canonical JSON text strictly: a byte-order mark, text that is not JSON, or JSON that
 * does not encode back to exactly the same text (unsorted or duplicate keys, other spellings of a
 * number, whitespace) fails.
 */
export const decodeCanonical = (text: string) => {
  const notJson = CodecFailure.Malformed({ reason: "json", path: "$" });

  if (text.charCodeAt(0) === BYTE_ORDER_MARK) return Result.fail(notJson);

  return Result.flatMap(parsed(text), (json) =>
    Result.flatMap(writeCanonical(json), (again) =>
      again === text
        ? Result.succeed(json)
        : Result.fail(CodecFailure.Malformed({ reason: "nonCanonical", path: "$" })),
    ),
  );
};
