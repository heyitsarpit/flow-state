import { Effect, Predicate, Schema } from "effect";

/*
 * Canonical keys:
 *
 * Types and limits:
 *   CanonicalKeyInput, OperationKey, ReadonlyCanonical, CanonicalContainer,
 *   CanonicalizationContext, MAX_DEPTH, MAX_NODES, MAX_BYTES, MAX_ARRAY_LENGTH
 *
 * Stable observation and failure paths:
 *   KeyPath, DataPropertyDescriptor, formatKeyPath, canonicalKeyDefect,
 *   isDataProperty, isEnumerableDataProperty, readReflection
 *
 * Canonical JSON byte accounting:
 *   isLowSurrogate, isHighSurrogate, isShortJsonEscape, utf8CodeUnitBytes,
 *   jsonStringCodeUnitBytes, measureJsonStringBytes, addByteCount, addBytes,
 *   encodePrimitive, MeasuredCanonicalRecordKey
 *
 * Array and record admission:
 *   isSafeArrayLength, isArrayContainer, isRecordContainer,
 *   admitCanonicalContainer, arrayLength, isArrayIndexKey, hasDenseArrayKeys,
 *   enforceArrayLength, compareKeys
 *
 * Bounded traversal and owned canonical output:
 *   canonicalizeValue, canonicalizeArray, canonicalizeRecord
 *
 * Assembly:
 *   canonicalizeKeyValue, canonicalKeySchema, decodeCanonicalKey, canonicalizeKey
 *
 * Admission, accounting, and copying stay on this one bounded traversal so
 * bounds are enforced at the first failing path before owned output escapes.
 */

interface CanonicalKeyRecord {
  readonly [key: string]: CanonicalKeyInput;
}

interface CanonicalRecordInput {
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- canonical containers preserve unknown children until recursive promotion.
  readonly [key: string]: unknown;
}

type CanonicalArrayInput = readonly unknown[];

export type CanonicalKeyInput =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalKeyInput[]
  | CanonicalKeyRecord;

export type OperationKey = readonly CanonicalKeyInput[];

type CanonicalDepth = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17;

type CanonicalDepthSuccessor = {
  readonly 0: 1;
  readonly 1: 2;
  readonly 2: 3;
  readonly 3: 4;
  readonly 4: 5;
  readonly 5: 6;
  readonly 6: 7;
  readonly 7: 8;
  readonly 8: 9;
  readonly 9: 10;
  readonly 10: 11;
  readonly 11: 12;
  readonly 12: 13;
  readonly 13: 14;
  readonly 14: 15;
  readonly 15: 16;
  readonly 16: 17;
  readonly 17: 17;
};

type ReadonlyCanonicalAtDepth<Value, Depth extends CanonicalDepth> = Depth extends 17
  ? Value
  : Value extends readonly unknown[]
    ? {
        readonly [Index in keyof Value]: ReadonlyCanonicalAtDepth<
          Value[Index],
          CanonicalDepthSuccessor[Depth]
        >;
      }
    : Value extends CanonicalKeyRecord
      ? {
          readonly [Key in keyof Value]: ReadonlyCanonicalAtDepth<
            Value[Key],
            CanonicalDepthSuccessor[Depth]
          >;
        }
      : Value;

export type ReadonlyCanonical<Value> = ReadonlyCanonicalAtDepth<Value, 0>;

type DataPropertyDescriptor = PropertyDescriptor & { readonly value: unknown };

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- canonical containers preserve unknown children until recursive promotion.
type CanonicalContainer =
  | { readonly kind: "array"; readonly value: CanonicalArrayInput }
  | { readonly kind: "record"; readonly value: CanonicalRecordInput };

type KeyPath = readonly (string | number)[];

const MAX_DEPTH = 16;
const MAX_NODES = 256;
const MAX_BYTES = 8192;
const MAX_ARRAY_LENGTH = 0xffff_ffff;

type CanonicalizationContext = {
  bytes: number;
  nodes: number;
  readonly encoder: TextEncoder;
  readonly seen: WeakSet<CanonicalContainer["value"]>;
};

const formatKeyPath = (path: KeyPath) =>
  path.length === 0 ? "$" : `$${path.map((segment) => `[${String(segment)}]`).join("")}`;

const canonicalKeyDefect = (path: KeyPath) => {
  const location = formatKeyPath(path);
  throw new TypeError(`Invalid canonical operation key at ${location}`);
};

// RETURN_TYPE: Narrows reflected descriptors to data properties before reading their values.
const isDataProperty = (descriptor: PropertyDescriptor): descriptor is DataPropertyDescriptor =>
  "value" in descriptor;

// RETURN_TYPE: Narrows reflected descriptors to enumerable data properties before reading their values.
const isEnumerableDataProperty = (
  descriptor: PropertyDescriptor,
): descriptor is DataPropertyDescriptor =>
  isDataProperty(descriptor) && descriptor.enumerable === true;

const readReflection = <Value>(path: KeyPath, read: () => Value) => {
  // oxlint-disable-next-line anti-slop/no-raw-try-catch -- hostile reflection must become a canonical rejection.
  try {
    return read();
  } catch {
    return canonicalKeyDefect(path);
  }
};

const addByteCount = (bytes: number, context: CanonicalizationContext) => {
  context.bytes += bytes;
  if (context.bytes > MAX_BYTES) canonicalKeyDefect([]);
};

const addBytes = (text: string, context: CanonicalizationContext) => {
  addByteCount(context.encoder.encode(text).byteLength, context);
};

const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;

const isShortJsonEscape = (code: number) =>
  code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d;

const utf8CodeUnitBytes = (code: number) => {
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  return 3;
};

const jsonStringCodeUnitBytes = (code: number) => {
  if (code === 0x22 || code === 0x5c) return 2;
  if (isShortJsonEscape(code)) return 2;
  if (code < 0x20) return 6;
  return utf8CodeUnitBytes(code);
};

const measureJsonStringBytes = (value: string, path: KeyPath, baseBytes: number) => {
  let bytes = 2;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const nextCode = index + 1 < value.length ? value.charCodeAt(index + 1) : -1;
    if (isHighSurrogate(code)) {
      if (!isLowSurrogate(nextCode)) canonicalKeyDefect(path);
      bytes += 4;
      index += 1;
    } else if (isLowSurrogate(code)) {
      canonicalKeyDefect(path);
    } else {
      bytes += jsonStringCodeUnitBytes(code);
    }
    if (baseBytes + bytes > MAX_BYTES) canonicalKeyDefect([]);
  }
  return bytes;
};

const encodePrimitive = (
  value: boolean | number | string,
  path: KeyPath,
  context: CanonicalizationContext,
) => {
  if (Predicate.isString(value)) {
    addByteCount(measureJsonStringBytes(value, path, context.bytes), context);
    return;
  }
  if (value === true || value === false) {
    addBytes(value ? "true" : "false", context);
    return;
  }
  addBytes(JSON.stringify(Object.is(value, -0) ? 0 : value), context);
};

interface MeasuredCanonicalRecordKey {
  readonly key: string;
  readonly bytes: number;
}

// RETURN_TYPE: Its guard narrows unknown to the recursive record input required by canonicalizeRecord; removing it produced TS2322.
const isRecordContainer = (value: unknown, path: KeyPath): value is CanonicalRecordInput => {
  if (value === null || typeof value !== "object") return false;
  const prototype = readReflection(path, () => Object.getPrototypeOf(value));
  return prototype === Object.prototype || prototype === null;
};

// RETURN_TYPE: Its guard narrows unknown to the recursive array input required by canonicalizeArray; removing it produced TS2322.
const isArrayContainer = (value: unknown, path: KeyPath): value is CanonicalArrayInput =>
  readReflection(path, () => Array.isArray(value));

// RETURN_TYPE: Its discriminated result narrows admitted containers for canonicalizeValue; removing it produced TS2345.
const admitCanonicalContainer = (value: unknown, path: KeyPath): CanonicalContainer => {
  if (isArrayContainer(value, path)) {
    const prototype = readReflection(path, () => Object.getPrototypeOf(value));
    if (prototype !== Array.prototype) canonicalKeyDefect(path);
    return { kind: "array", value };
  }
  if (!isRecordContainer(value, path)) return canonicalKeyDefect(path);
  return { kind: "record", value };
};

// RETURN_TYPE: Preserves number narrowing for the validated array length descriptor.
const isSafeArrayLength = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= MAX_ARRAY_LENGTH;

const arrayLength = (value: CanonicalArrayInput, path: KeyPath) => {
  const descriptor = readReflection(path, () => Object.getOwnPropertyDescriptor(value, "length"));
  if (
    descriptor === undefined ||
    !isDataProperty(descriptor) ||
    descriptor.enumerable !== false ||
    descriptor.configurable !== false ||
    !isSafeArrayLength(descriptor.value)
  ) {
    return canonicalKeyDefect(path);
  }
  return descriptor.value;
};

const isArrayIndexKey = (key: string, length: number) => {
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
};

const hasDenseArrayKeys = (ownKeys: readonly PropertyKey[], length: number) =>
  ownKeys.length === length + 1 &&
  ownKeys.every(
    (key) => Predicate.isString(key) && (key === "length" || isArrayIndexKey(key, length)),
  );

const compareKeys = (left: string, right: string) =>
  // oxlint-disable-next-line anti-slop/no-nested-conditional-expression -- explicit three-way ordering is the comparator contract.
  left < right ? -1 : left > right ? 1 : 0;

const enforceArrayLength = (length: number, path: KeyPath, context: CanonicalizationContext) => {
  if (path.length === 0) {
    if (length > MAX_NODES) canonicalKeyDefect([...path, MAX_NODES]);
    return;
  }
  if (length > MAX_NODES - context.nodes) canonicalKeyDefect(path);
};

function canonicalizeValue(
  value: unknown,
  path: KeyPath,
  depth: number,
  context: CanonicalizationContext,
) {
  if (depth > MAX_DEPTH) canonicalKeyDefect(path);

  context.nodes += 1;
  if (context.nodes > MAX_NODES) canonicalKeyDefect(path);

  if (value === null) {
    addBytes("null", context);
    return value;
  }
  if (value === true || value === false || Predicate.isString(value)) {
    encodePrimitive(value, path, context);
    return value;
  }
  if (Predicate.isNumber(value) && Number.isFinite(value)) {
    const normalized = Object.is(value, -0) ? 0 : value;
    encodePrimitive(normalized, path, context);
    return normalized;
  }

  const container = admitCanonicalContainer(value, path);
  if (context.seen.has(container.value)) canonicalKeyDefect(path);
  context.seen.add(container.value);

  const copy =
    container.kind === "array"
      ? canonicalizeArray(container.value, path, depth, context)
      : canonicalizeRecord(container.value, path, depth, context);

  context.seen.delete(container.value);
  return copy;
}

function canonicalizeArray(
  value: CanonicalArrayInput,
  path: KeyPath,
  depth: number,
  context: CanonicalizationContext,
) {
  const length = arrayLength(value, path);
  enforceArrayLength(length, path, context);
  const ownKeys = readReflection(path, () => Reflect.ownKeys(value));
  if (!hasDenseArrayKeys(ownKeys, length)) canonicalKeyDefect(path);

  addBytes("[", context);
  const array: CanonicalKeyInput[] = [];
  for (let index = 0; index < length; index += 1) {
    const childPath = [...path, index];
    const key = String(index);
    const descriptor = readReflection(childPath, () => Object.getOwnPropertyDescriptor(value, key));
    if (descriptor === undefined || !isEnumerableDataProperty(descriptor))
      return canonicalKeyDefect(childPath);
    if (index > 0) addBytes(",", context);
    array.push(canonicalizeValue(descriptor.value, childPath, depth + 1, context));
  }
  addBytes("]", context);

  // oxlint-disable-next-line anti-slop/no-object-freeze -- canonical arrays are recursively copied before this contract-required ownership freeze.
  return Object.freeze(array);
}

function canonicalizeRecord(
  value: CanonicalRecordInput,
  path: KeyPath,
  depth: number,
  context: CanonicalizationContext,
) {
  const ownKeys = readReflection(path, () => Reflect.ownKeys(value));
  if (ownKeys.length > MAX_NODES - context.nodes) canonicalKeyDefect(path);
  const keys = ownKeys.filter(Predicate.isString);
  if (keys.length !== ownKeys.length) canonicalKeyDefect(path);

  const measuredKeys: MeasuredCanonicalRecordKey[] = [];
  let recordBytes = context.bytes + 2 + keys.length + Math.max(0, keys.length - 1);
  if (recordBytes > MAX_BYTES) canonicalKeyDefect([]);
  for (const key of keys) {
    const bytes = measureJsonStringBytes(key, [...path, key], recordBytes);
    recordBytes += bytes;
    measuredKeys.push({ key, bytes });
  }
  measuredKeys.sort((left, right) => compareKeys(left.key, right.key));

  addBytes("{", context);
  const record: Record<string, CanonicalKeyInput> = {};
  for (const [index, { key, bytes }] of measuredKeys.entries()) {
    const childPath = [...path, key];
    const descriptor = readReflection(childPath, () => Object.getOwnPropertyDescriptor(value, key));
    if (descriptor === undefined || !isEnumerableDataProperty(descriptor))
      return canonicalKeyDefect(childPath);
    if (index > 0) addBytes(",", context);
    addByteCount(bytes, context);
    addBytes(":", context);
    Object.defineProperty(record, key, {
      configurable: true,
      enumerable: true,
      value: canonicalizeValue(descriptor.value, childPath, depth + 1, context),
      writable: true,
    });
  }
  addBytes("}", context);

  // oxlint-disable-next-line anti-slop/no-object-freeze -- canonical records are recursively copied before this contract-required ownership freeze.
  return Object.freeze(record);
}

const canonicalizeKeyValue = (value: unknown) => {
  const container = admitCanonicalContainer(value, []);
  if (container.kind !== "array") return canonicalKeyDefect([]);

  const context: CanonicalizationContext = {
    bytes: 0,
    nodes: 0,
    encoder: new TextEncoder(),
    seen: new WeakSet<CanonicalContainer["value"]>(),
  };
  return canonicalizeArray(container.value, [], 0, context);
};

const canonicalKeySchema = Schema.declareConstructor<OperationKey, unknown>()([], () => (value) => {
  // Evaluate the owner walker before constructing the Effect to preserve its TypeError boundary.
  return Effect.succeed(canonicalizeKeyValue(value));
});

const decodeCanonicalKey = Schema.decodeUnknownSync(canonicalKeySchema);

export function canonicalizeKey<K extends OperationKey>(
  value: ReadonlyCanonical<K>,
): ReadonlyCanonical<K>;
export function canonicalizeKey<K extends OperationKey>(value: K): ReadonlyCanonical<K>;
export function canonicalizeKey(value: OperationKey) {
  return decodeCanonicalKey(value);
}
