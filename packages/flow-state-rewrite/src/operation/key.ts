// oxlint-disable-next-line anti-slop/no-large-production-file -- key admission, owned copying, and value equality form one canonical-key owner boundary.
import { Effect, Predicate, Schema } from "effect";

/*
 * Canonical keys:
 *
 * Types and limits:
 *   CanonicalKeyInput, OperationKey, CanonicalKeyValue, CanonicalContainer,
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
  [key: string]: CanonicalKeyInput;
}

interface CanonicalRecordInput<Value> {
  [key: string]: Value;
}

// oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: canonicalization must accept const-inferred key containers.
type CanonicalArrayInput<Value> = readonly Value[];

// oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: operation key authoring accepts const-inferred outer and nested tuples.
type CanonicalKeyArray = readonly CanonicalKeyInput[];

export type CanonicalKeyInput =
  | null
  | boolean
  | number
  | string
  | CanonicalKeyArray
  | CanonicalKeyRecord;

export type OperationKey = CanonicalKeyArray;

type CanonicalDepth = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17;

type CanonicalDepthSuccessor = {
  0: 1;
  1: 2;
  2: 3;
  3: 4;
  4: 5;
  5: 6;
  6: 7;
  7: 8;
  8: 9;
  9: 10;
  10: 11;
  11: 12;
  12: 13;
  13: 14;
  14: 15;
  15: 16;
  16: 17;
  17: 17;
};

// oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: strip readonly from const-inferred tuples while retaining their exact positions in the mutable canonical copy.
type CanonicalKeyTupleValue<Value extends CanonicalKeyArray, Depth extends CanonicalDepth> = {
  -readonly [Index in keyof Value]: CanonicalKeyValueAtDepth<
    Value[Index],
    CanonicalDepthSuccessor[Depth]
  >;
};

// oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: strip readonly from const-inferred records while retaining their fields in the mutable canonical copy.
type CanonicalKeyRecordValue<Value extends CanonicalKeyRecord, Depth extends CanonicalDepth> = {
  -readonly [Key in keyof Value]: CanonicalKeyValueAtDepth<
    Value[Key],
    CanonicalDepthSuccessor[Depth]
  >;
};

type CanonicalKeyValueAtDepth<Value, Depth extends CanonicalDepth> = Depth extends 17
  ? Value
  : Value extends CanonicalKeyArray
    ? CanonicalKeyTupleValue<Value, Depth>
    : Value extends CanonicalKeyRecord
      ? CanonicalKeyRecordValue<Value, Depth>
      : Value;

export type CanonicalKeyValue<Value> = CanonicalKeyValueAtDepth<Value, 0>;

type DataPropertyDescriptor<Value> = PropertyDescriptor & { value: Value };

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- canonical containers preserve unpromoted children until recursive promotion.
type CanonicalContainer<Value> =
  | { kind: "array"; value: CanonicalArrayInput<Value> }
  | { kind: "record"; value: CanonicalRecordInput<Value> };

type KeyPath = (string | number)[];

const MAX_DEPTH = 16;

const MAX_NODES = 256;

const MAX_BYTES = 8192;

const MAX_ARRAY_LENGTH = 0xffff_ffff;

type CanonicalizationContext<Value> = {
  bytes: number;
  nodes: number;
  encoder: TextEncoder;
  seen: WeakSet<CanonicalContainer<Value>["value"]>;
};

const formatKeyPath = (path: KeyPath) =>
  path.length === 0 ? "$" : `$${path.map((segment) => `[${String(segment)}]`).join("")}`;

const canonicalKeyDefect = (path: KeyPath) => {
  const location = formatKeyPath(path);
  throw new TypeError(`Invalid canonical operation key at ${location}`);
};

// RETURN_TYPE: Narrows reflected descriptors to data properties before reading their values.
const isDataProperty = <Value>(
  descriptor: PropertyDescriptor,
): descriptor is DataPropertyDescriptor<Value> => "value" in descriptor;

// RETURN_TYPE: Narrows reflected descriptors to enumerable data properties before reading their values.
const isEnumerableDataProperty = <Value>(
  descriptor: PropertyDescriptor,
): descriptor is DataPropertyDescriptor<Value> =>
  isDataProperty(descriptor) && descriptor.enumerable === true;

const readReflection = <Value>(path: KeyPath, read: () => Value) => {
  // oxlint-disable-next-line anti-slop/no-raw-try-catch -- hostile reflection must become a canonical rejection.
  try {
    return read();
  } catch {
    return canonicalKeyDefect(path);
  }
};

const addByteCount = <Value>(bytes: number, context: CanonicalizationContext<Value>) => {
  context.bytes += bytes;

  if (context.bytes > MAX_BYTES) canonicalKeyDefect([]);
};

const addBytes = <Value>(text: string, context: CanonicalizationContext<Value>) => {
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

const encodePrimitive = <Value, ContextValue>(
  value: Value,
  path: KeyPath,
  context: CanonicalizationContext<ContextValue>,
) => {
  if (Predicate.isString(value)) {
    addByteCount(measureJsonStringBytes(value, path, context.bytes), context);

    return;
  }

  if (value === true || value === false) {
    addBytes(value ? "true" : "false", context);

    return;
  }

  if (!Predicate.isNumber(value)) return canonicalKeyDefect(path);

  addBytes(JSON.stringify(Object.is(value, -0) ? 0 : value), context);
};

interface MeasuredCanonicalRecordKey {
  key: string;
  bytes: number;
}

// RETURN_TYPE: Its guard narrows unknown to the recursive record input required by canonicalizeRecord; removing it produced TS2322.
const isRecordContainer = <Value>(
  value: Value,
  path: KeyPath,
): value is Value & CanonicalRecordInput<Value> => {
  if (value === null || typeof value !== "object") return false;
  const prototype = readReflection(path, () => Object.getPrototypeOf(value));

  return prototype === Object.prototype || prototype === null;
};

// RETURN_TYPE: Its guard narrows unknown to the recursive array input required by canonicalizeArray; removing it produced TS2322.
const isArrayContainer = <Value>(
  value: Value,
  path: KeyPath,
): value is Value & CanonicalArrayInput<Value> => readReflection(path, () => Array.isArray(value));

// RETURN_TYPE: Its discriminated result narrows admitted containers for canonicalizeValue; removing it produced TS2345.
const admitCanonicalContainer = <Value>(value: Value, path: KeyPath): CanonicalContainer<Value> => {
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

const arrayLength = <Value>(value: CanonicalArrayInput<Value>, path: KeyPath) => {
  const descriptor = readReflection(path, () => Object.getOwnPropertyDescriptor(value, "length"));

  if (
    descriptor === undefined ||
    !isDataProperty<number>(descriptor) ||
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

const hasDenseArrayKeys = (ownKeys: PropertyKey[], length: number) =>
  ownKeys.length === length + 1 &&
  ownKeys.every(
    (key) => Predicate.isString(key) && (key === "length" || isArrayIndexKey(key, length)),
  );

const compareKeys = (left: string, right: string) =>
  // oxlint-disable-next-line anti-slop/no-nested-conditional-expression -- explicit three-way ordering is the comparator contract.
  left < right ? -1 : left > right ? 1 : 0;

const enforceArrayLength = <Value>(
  length: number,
  path: KeyPath,
  context: CanonicalizationContext<Value>,
) => {
  if (path.length === 0) {
    if (length > MAX_NODES) canonicalKeyDefect([...path, MAX_NODES]);

    return;
  }

  if (length > MAX_NODES - context.nodes) canonicalKeyDefect(path);
};

// RETURN_TYPE: Canonicalization promotes every admitted input into the public canonical-key union.
function canonicalizeValue<Value>(
  value: Value,
  path: KeyPath,
  depth: number,
  context: CanonicalizationContext<Value>,
): CanonicalKeyInput {
  if (depth > MAX_DEPTH) canonicalKeyDefect(path);

  context.nodes += 1;

  if (context.nodes > MAX_NODES) canonicalKeyDefect(path);

  if (value === null) {
    addBytes("null", context);

    return null;
  }

  if (value === true || value === false) {
    encodePrimitive(value, path, context);

    return value === true;
  }

  if (Predicate.isString(value)) {
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

// RETURN_TYPE: The array copy is the canonical-key array produced after bounded descriptor admission.
function canonicalizeArray<Value>(
  value: CanonicalArrayInput<Value>,
  path: KeyPath,
  depth: number,
  context: CanonicalizationContext<Value>,
): CanonicalKeyArray {
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

    if (descriptor === undefined || !isEnumerableDataProperty<Value>(descriptor))
      return canonicalKeyDefect(childPath);

    if (index > 0) addBytes(",", context);
    array.push(canonicalizeValue(descriptor.value, childPath, depth + 1, context));
  }

  addBytes("]", context);

  return array;
}

// RETURN_TYPE: The record copy is the canonical-key record produced after bounded descriptor admission.
function canonicalizeRecord<Value>(
  value: CanonicalRecordInput<Value>,
  path: KeyPath,
  depth: number,
  context: CanonicalizationContext<Value>,
): CanonicalKeyRecord {
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

    if (descriptor === undefined || !isEnumerableDataProperty<Value>(descriptor))
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

  return record;
}

const canonicalizeKeyValue = <Value>(value: Value) => {
  const container = admitCanonicalContainer(value, []);

  if (container.kind !== "array") return canonicalKeyDefect([]);

  const context: CanonicalizationContext<Value> = {
    bytes: 0,
    nodes: 0,
    encoder: new TextEncoder(),
    seen: new WeakSet<CanonicalContainer<Value>["value"]>(),
  };

  return canonicalizeArray(container.value, [], 0, context);
};

const canonicalKeySchema = Schema.declareConstructor<OperationKey, unknown>()([], () => (value) => {
  // oxlint-disable-next-line anti-slop/no-eager-stateful-effect-succeed -- key admission must finish here so invalid values keep the synchronous TypeError boundary.
  return Effect.succeed(canonicalizeKeyValue(value));
});

const decodeCanonicalKey = Schema.decodeUnknownSync(canonicalKeySchema);

export function canonicalizeKey<K extends OperationKey>(
  value: CanonicalKeyValue<K>,
): CanonicalKeyValue<K>;
export function canonicalizeKey<K extends OperationKey>(value: K): CanonicalKeyValue<K>;
export function canonicalizeKey(value: OperationKey) {
  return decodeCanonicalKey(value);
}

// RETURN_TYPE: Narrows the non-array canonical object branch for structural comparison.
const isCanonicalRecord = (value: CanonicalKeyInput): value is CanonicalKeyRecord =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const equalCanonicalArray = (left: CanonicalKeyArray, right: CanonicalKeyArray) =>
  left.length === right.length &&
  left.every((value, index) => equalCanonicalValue(value, right[index]!));

const equalCanonicalRecord = (left: CanonicalKeyRecord, right: CanonicalKeyRecord) => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) => Object.hasOwn(right, key) && equalCanonicalValue(left[key]!, right[key]!),
    )
  );
};

// RETURN_TYPE: Recursive comparison needs a fixed boolean result while delegating nested containers.
const equalCanonicalValue = (left: CanonicalKeyInput, right: CanonicalKeyInput): boolean => {
  if (Array.isArray(left)) return Array.isArray(right) && equalCanonicalArray(left, right);

  if (Array.isArray(right)) return false;

  if (isCanonicalRecord(left)) return isCanonicalRecord(right) && equalCanonicalRecord(left, right);

  if (isCanonicalRecord(right)) return false;

  return Object.is(left, right);
};

/** Compares already-admitted canonical keys without relying on container identity. */
export const equalCanonicalKey = (left: OperationKey, right: OperationKey) =>
  equalCanonicalValue(left, right);
