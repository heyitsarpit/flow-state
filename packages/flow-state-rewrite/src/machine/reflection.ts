import { Option, Predicate, Result } from "effect";

import type * as Diagnostic from "../diagnostic/diagnostic.js";
import { invalidMachineConfigurationDiagnostic } from "./diagnostic.js";

/*
 * Reflection:
 *
 * Observation vocabulary and classification:
 *   DataProperty, ReflectionSnapshot, ConfigurationSnapshot, classifyPlainRecord
 *
 * Protected reads:
 *   readReflection, readDataProperty, captureProperties
 *
 * Stability:
 *   sameSnapshotProperty, sameSnapshot, snapshotProperties
 *
 * Array projection:
 *   arrayOrdinal, arrayLength, validateArrayKeys
 *
 * Public readers:
 *   snapshotRecord, readSnapshotProperty, readArrayValues, readTokenText
 */

// Reflection keeps caller values generic until each machine grammar validator promotes them.
type PlainRecord<Value> = Record<string, Value>;

type ReflectionSource<Value> = Value[] | PlainRecord<Value>;

// FLOW_STATE_ALLOW_UNKNOWN: array projection is intentionally opaque until the owning grammar schema admits each element.
type ReflectionValue = unknown;

type PropertyFlags = { enumerable: boolean; configurable: boolean };

type DataProperty<Value> =
  | (PropertyFlags & {
      kind: "data";
      value: Value;
      writable: boolean;
    })
  | (PropertyFlags & {
      kind: "accessor";
      get: PropertyDescriptor["get"];
      set: PropertyDescriptor["set"];
    })
  | { kind: "missing" };

type DataDescriptor<Value> = Extract<DataProperty<Value>, { kind: "data" }>;

type PresentProperty<Value> = Exclude<DataProperty<Value>, { kind: "missing" }>;

type ReflectionReason = Parameters<typeof invalidMachineConfigurationDiagnostic>[0];

type ReflectionPrototype = ReturnType<typeof Object.getPrototypeOf>;

type SnapshotProperty<Value> = [PropertyKey, PresentProperty<Value>];

type ReflectionSnapshot<Value, Prototype> = {
  prototype: Prototype;
  properties: SnapshotProperty<Value>[];
};

type RecordClassification<Value> =
  | {
      _tag: "record";
      record: Value & PlainRecord<Value>;
      prototype: ReflectionPrototype;
    }
  | { _tag: "other" };

export type ConfigurationSnapshot<Value> = { properties: SnapshotProperty<Value>[] };

// RETURN_TYPE: Preserves the PlainRecord predicate required before classified record access; removal caused TS2322 and TS2345.
const isNonArrayObject = <Value>(value: Value): value is Value & PlainRecord<Value> =>
  Predicate.isObject(value) && !Array.isArray(value);

// RETURN_TYPE: Preserves _tag discriminants and coupled record/prototype narrowing after classification.
const classifyPlainRecord = <Value>(value: Value): RecordClassification<Value> => {
  if (!isNonArrayObject(value)) return { _tag: "other" };
  const prototype = Object.getPrototypeOf(value);

  return prototype !== null && prototype !== Object.prototype
    ? { _tag: "other" }
    : { _tag: "record", record: value, prototype };
};

// RETURN_TYPE: Fixes proxy-safe reflection failures to the public diagnostic channel.
const readReflection = <Value>(
  read: () => Value,
  path: Diagnostic.Path,
  reason: ReflectionReason,
): Result.Result<Value, Diagnostic.PublicDiagnostic> =>
  Result.try({
    try: read,
    catch: () => invalidMachineConfigurationDiagnostic(reason, path, {}),
  });

// RETURN_TYPE: Keeps reflection failures on the shared never-success Diagnostic channel.
const invalidReflection = (
  reason: ReflectionReason,
  path: Diagnostic.Path,
  details: Diagnostic.Details = {},
): Result.Result<never, Diagnostic.PublicDiagnostic> =>
  Result.fail(invalidMachineConfigurationDiagnostic(reason, path, details));

// RETURN_TYPE: Keeps key failures on the reflection never-success path.
const invalidReflectionKey = (
  reason: "NonStringConfigurationKey" | "UnexpectedConfigurationField",
  path: Diagnostic.Path,
  key: PropertyKey,
): Result.Result<never, Diagnostic.PublicDiagnostic> =>
  invalidReflection(reason, [...path, String(key)], { key: String(key) });

// RETURN_TYPE: Preserves the DataProperty discriminant required by callers; removal caused TS2322.
const readDataProperty = <Value>(
  value: ReflectionSource<Value>,
  key: PropertyKey,
): DataProperty<Value> => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);

  if (descriptor === undefined) return { kind: "missing" };
  const { configurable = false, enumerable = false } = descriptor;

  return "value" in descriptor
    ? {
        kind: "data",
        value: descriptor.value,
        enumerable,
        configurable,
        writable: descriptor.writable === true,
      }
    : {
        kind: "accessor",
        enumerable,
        configurable,
        get: descriptor["get"],
        set: descriptor["set"],
      };
};

// RETURN_TYPE: Keeps the descriptor snapshot as a copied mutable projection for grammar admission.
const captureProperties = <Value>(
  record: ReflectionSource<Value>,
  keys: PropertyKey[],
  path: Diagnostic.Path,
  reason: ReflectionReason,
): Result.Result<SnapshotProperty<Value>[], Diagnostic.PublicDiagnostic> =>
  Result.gen(function* () {
    const properties: SnapshotProperty<Value>[] = [];

    for (const key of keys) {
      const property = yield* readReflection(() => readDataProperty(record, key), path, reason);

      if (property.kind === "missing") return yield* invalidReflection(reason, path);
      properties.push([key, property]);
    }

    return properties;
  });

// Stability

const sameSnapshotProperty = <Value>(
  left: PresentProperty<Value>,
  right: PresentProperty<Value>,
) => {
  if (left.enumerable !== right.enumerable || left.configurable !== right.configurable)
    return false;

  if (left.kind === "data") {
    return (
      right.kind === "data" &&
      left.writable === right.writable &&
      Object.is(left.value, right.value)
    );
  }

  return right.kind === "accessor" && left.get === right.get && left.set === right.set;
};

const sameSnapshot = <Value, Prototype>(
  left: ReflectionSnapshot<Value, Prototype>,
  right: ReflectionSnapshot<Value, Prototype>,
) => {
  if (left.properties.length !== right.properties.length) return false;

  for (const [index, [key]] of left.properties.entries()) {
    if (key !== right.properties[index]?.[0]) return false;
  }

  if (!Object.is(left.prototype, right.prototype)) return false;

  for (const [index, [, property]] of left.properties.entries()) {
    const repeatedProperty = right.properties[index]?.[1];

    if (repeatedProperty === undefined || !sameSnapshotProperty(property, repeatedProperty))
      return false;
  }

  return true;
};

// RETURN_TYPE: Publishes the copied descriptor snapshot after confirming the source remained stable.
const snapshotProperties = <Value, Prototype>(
  record: ReflectionSource<Value>,
  prototype: Prototype,
  path: Diagnostic.Path,
  reason: ReflectionReason,
): Result.Result<ConfigurationSnapshot<Value>, Diagnostic.PublicDiagnostic> =>
  Result.gen(function* () {
    const keys = yield* readReflection(() => Reflect.ownKeys(record), path, reason);
    const properties = yield* captureProperties(record, keys, path, reason);

    const repeatedKeys = yield* readReflection(() => Reflect.ownKeys(record), path, reason);
    const repeatedProperties = yield* captureProperties(record, repeatedKeys, path, reason);

    const repeatedPrototype = yield* readReflection(
      () => {
        const prototype = Object.getPrototypeOf(record);

        return prototype;
      },
      path,
      reason,
    );

    const first: ReflectionSnapshot<Value, Prototype> = { prototype, properties };

    const repeated: ReflectionSnapshot<Value, Prototype> = {
      prototype: repeatedPrototype,
      properties: repeatedProperties,
    };

    if (!sameSnapshot(first, repeated)) return yield* invalidReflection(reason, path);

    return { properties: first.properties };
  });

// Array projection

const arrayOrdinal = (key: string) => {
  if (!/^(?:0|[1-9]\d*)$/u.test(key)) return undefined;
  const ordinal = Number(key);

  return Number.isSafeInteger(ordinal) && ordinal >= 0 && ordinal < 2 ** 32 - 1
    ? ordinal
    : undefined;
};

// RETURN_TYPE: Preserves the mutable array narrowing needed by the descriptor snapshot.
const isArrayValue = <Value>(value: Value): value is Value & ReflectionValue[] =>
  Array.isArray(value);

const arrayLength = <Value>(property: DataProperty<Value>) => {
  if (property.kind !== "data") return undefined;

  if (property.enumerable || property.configurable) return undefined;

  if (!Predicate.isNumber(property.value)) return undefined;

  if (!Number.isSafeInteger(property.value)) return undefined;

  if (property.value < 0 || property.value >= 2 ** 32) return undefined;

  return property.value;
};

const validateArrayKeys = <Value>(
  properties: SnapshotProperty<Value>[],
  length: number,
  path: Diagnostic.Path,
  reason: "ExpectedTransition" | "ExpectedRedirect",
) => {
  const entries = new Map<number, DataDescriptor<Value>>();

  for (const [key, property] of properties) {
    if (key === "length") continue;

    if (!Predicate.isString(key))
      return invalidReflectionKey("NonStringConfigurationKey", path, key);
    const ordinal = arrayOrdinal(key);

    if (ordinal === undefined)
      return invalidReflectionKey("UnexpectedConfigurationField", path, key);

    if (ordinal >= length || property.kind !== "data" || !property.enumerable)
      return invalidReflection(reason, [...path, ordinal]);
    entries.set(ordinal, property);
  }

  return Result.succeed(entries);
};

// Public readers

// RETURN_TYPE: Fixes admitted reflection to the trusted snapshot channel before machine owners consume it.
export const snapshotRecord = <Value>(
  value: Value,
  path: Diagnostic.Path,
  reason: ReflectionReason,
): Result.Result<ConfigurationSnapshot<Value>, Diagnostic.PublicDiagnostic> =>
  Result.gen(function* () {
    const classified = yield* readReflection(() => classifyPlainRecord(value), path, reason);

    if (classified._tag === "other") return yield* invalidReflection(reason, path);

    return yield* snapshotProperties<Value, ReflectionPrototype>(
      classified.record,
      classified.prototype,
      path,
      reason,
    );
  });

// RETURN_TYPE: Preserves the explicit missing-property branch for array validation.
export const readSnapshotProperty = <Value>(
  snapshot: ConfigurationSnapshot<Value>,
  key: string,
): DataProperty<Value> =>
  snapshot.properties.find(([candidate]) => candidate === key)?.[1] ?? { kind: "missing" };

// RETURN_TYPE: Preserves the mutable copied array projection used by grammar admission.
export const readArrayValues = <Value>(
  value: Value,
  path: Diagnostic.Path,
  reason: "ExpectedTransition" | "ExpectedRedirect",
): Result.Result<ReflectionValue[] | undefined, Diagnostic.PublicDiagnostic> =>
  Result.gen(function* () {
    const array = yield* readReflection<ReflectionValue[] | undefined>(
      () => (isArrayValue(value) ? value : undefined),
      path,
      reason,
    );

    if (array === undefined) return undefined;

    const prototype = yield* readReflection(
      () => {
        const prototype = Object.getPrototypeOf(array);

        return prototype;
      },
      path,
      reason,
    );

    if (prototype !== Array.prototype) return yield* invalidReflection(reason, path);

    const snapshot = yield* snapshotProperties<ReflectionValue, typeof prototype>(
      array,
      prototype,
      path,
      reason,
    );

    const length = arrayLength(readSnapshotProperty(snapshot, "length"));

    if (length === undefined) return yield* invalidReflection(reason, path);
    const entries = yield* validateArrayKeys(snapshot.properties, length, path, reason);

    const values: ReflectionValue[] = [];

    for (let index = 0; index < length; index += 1) {
      const property = entries.get(index);

      if (property === undefined) return yield* invalidReflection(reason, [...path, index]);
      values.push(property.value);
    }

    return values;
  });

export const readTokenText = <Value>(value: Value, key: "kind" | "id" | "name") =>
  Result.try({
    try: () => {
      if (!Predicate.isObject(value)) return Option.none<string>();
      const descriptor = Object.getOwnPropertyDescriptor(value, key);

      return descriptor !== undefined &&
        "value" in descriptor &&
        Predicate.isString(descriptor.value)
        ? Option.some(descriptor.value)
        : Option.none<string>();
    },
    catch: () => undefined,
  });
