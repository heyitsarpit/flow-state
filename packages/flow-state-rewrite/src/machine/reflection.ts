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

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- reflection retains unknown children until each grammar validator promotes them.
type PlainRecord = Readonly<Record<string, unknown>>;
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- reflection retains unknown array entries until each grammar validator promotes them.
type ReflectionSource = readonly unknown[] | PlainRecord;

type PropertyFlags = { readonly enumerable: boolean; readonly configurable: boolean };

type DataProperty =
  | (PropertyFlags & {
      readonly kind: "data";
      readonly value: unknown;
      readonly writable: boolean;
    })
  | (PropertyFlags & {
      readonly kind: "accessor";
      readonly get: PropertyDescriptor["get"];
      readonly set: PropertyDescriptor["set"];
    })
  | { readonly kind: "missing" };

type DataDescriptor = Extract<DataProperty, { readonly kind: "data" }>;

type PresentProperty = Exclude<DataProperty, { readonly kind: "missing" }>;

type ReflectionReason = Parameters<typeof invalidMachineConfigurationDiagnostic>[0];

type SnapshotProperty = readonly [PropertyKey, PresentProperty];

type ReflectionSnapshot = {
  readonly prototype: unknown;
  readonly properties: readonly SnapshotProperty[];
};

export type ConfigurationSnapshot = { readonly properties: readonly SnapshotProperty[] };

// RETURN_TYPE: Preserves the PlainRecord predicate required before classified record access; removal caused TS2322 and TS2345.
const isNonArrayObject = (value: unknown): value is PlainRecord =>
  Predicate.isObject(value) && !Array.isArray(value);

type RecordClassification =
  | {
      readonly _tag: "record";
      // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- classified reflection records remain unknown until each grammar validator promotes them.
      readonly record: PlainRecord;
      readonly prototype: unknown;
    }
  | { readonly _tag: "other" };

// RETURN_TYPE: Preserves _tag discriminants and coupled record/prototype narrowing after classification.
const classifyPlainRecord = (value: unknown): RecordClassification => {
  if (!isNonArrayObject(value)) return { _tag: "other" };
  const prototype: unknown = Object.getPrototypeOf(value);
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
const readDataProperty = (value: ReflectionSource, key: PropertyKey): DataProperty => {
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

// RETURN_TYPE: Keeps the mutable assembly local while publishing snapshot entries once.
const captureProperties = (
  record: ReflectionSource,
  keys: readonly PropertyKey[],
  path: Diagnostic.Path,
  reason: ReflectionReason,
): Result.Result<SnapshotProperty[], Diagnostic.PublicDiagnostic> =>
  Result.gen(function* () {
    const properties: SnapshotProperty[] = [];
    for (const key of keys) {
      const property = yield* readReflection(() => readDataProperty(record, key), path, reason);
      if (property.kind === "missing") return yield* invalidReflection(reason, path);
      properties.push([key, property]);
    }
    return properties;
  });

// Stability

const sameSnapshotProperty = (left: PresentProperty, right: PresentProperty) => {
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

const sameSnapshot = (left: ReflectionSnapshot, right: ReflectionSnapshot) => {
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

// RETURN_TYPE: Preserves the readonly ConfigurationSnapshot publication; inferred capture arrays are mutable.
const snapshotProperties = (
  record: ReflectionSource,
  prototype: unknown,
  path: Diagnostic.Path,
  reason: ReflectionReason,
): Result.Result<ConfigurationSnapshot, Diagnostic.PublicDiagnostic> =>
  Result.gen(function* () {
    const keys = yield* readReflection(() => Reflect.ownKeys(record), path, reason);
    const properties = yield* captureProperties(record, keys, path, reason);

    const repeatedKeys = yield* readReflection(() => Reflect.ownKeys(record), path, reason);
    const repeatedProperties = yield* captureProperties(record, repeatedKeys, path, reason);

    const repeatedPrototype = yield* readReflection(
      () => {
        const prototype: ReflectionSnapshot["prototype"] = Object.getPrototypeOf(record);
        return prototype;
      },
      path,
      reason,
    );
    const first = { prototype, properties };
    const repeated = { prototype: repeatedPrototype, properties: repeatedProperties };

    if (!sameSnapshot(first, repeated)) return yield* invalidReflection(reason, path);
    for (const entry of first.properties) {
      // oxlint-disable-next-line anti-slop/no-object-freeze -- Snapshot descriptors are a shallow runtime boundary; their values remain caller-owned.
      Object.freeze(entry[1]);
      // oxlint-disable-next-line anti-slop/no-object-freeze -- Snapshot property tuples are a shallow runtime boundary.
      Object.freeze(entry);
    }
    // oxlint-disable-next-line anti-slop/no-object-freeze -- Snapshot properties are published as a runtime-immutable container.
    const frozenProperties = Object.freeze(first.properties);
    // oxlint-disable-next-line anti-slop/no-object-freeze -- Configuration snapshots are published as runtime-immutable containers.
    return Object.freeze({ properties: frozenProperties });
  });

// Array projection

const arrayOrdinal = (key: string) => {
  if (!/^(?:0|[1-9]\d*)$/u.test(key)) return undefined;
  const ordinal = Number(key);
  return Number.isSafeInteger(ordinal) && ordinal >= 0 && ordinal < 2 ** 32 - 1
    ? ordinal
    : undefined;
};

const arrayLength = (property: DataProperty) => {
  if (property.kind !== "data") return undefined;
  if (property.enumerable || property.configurable) return undefined;
  if (!Predicate.isNumber(property.value)) return undefined;
  if (!Number.isSafeInteger(property.value)) return undefined;
  if (property.value < 0 || property.value >= 2 ** 32) return undefined;
  return property.value;
};

const validateArrayKeys = (
  properties: readonly SnapshotProperty[],
  length: number,
  path: Diagnostic.Path,
  reason: "ExpectedTransition" | "ExpectedRedirect",
) => {
  const entries = new Map<number, DataDescriptor>();
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
export const snapshotRecord = (
  value: unknown,
  path: Diagnostic.Path,
  reason: ReflectionReason,
): Result.Result<ConfigurationSnapshot, Diagnostic.PublicDiagnostic> =>
  Result.gen(function* () {
    const classified = yield* readReflection(() => classifyPlainRecord(value), path, reason);
    if (classified._tag === "other") return yield* invalidReflection(reason, path);
    return yield* snapshotProperties(classified.record, classified.prototype, path, reason);
  });

// RETURN_TYPE: Preserves the explicit missing-property branch for array validation.
export const readSnapshotProperty = (snapshot: ConfigurationSnapshot, key: string): DataProperty =>
  snapshot.properties.find(([candidate]) => candidate === key)?.[1] ?? { kind: "missing" };

// RETURN_TYPE: Preserves the readonly array projection while its local collection is assembled mutably.
export const readArrayValues = (
  value: unknown,
  path: Diagnostic.Path,
  reason: "ExpectedTransition" | "ExpectedRedirect",
): Result.Result<readonly unknown[] | undefined, Diagnostic.PublicDiagnostic> =>
  Result.gen(function* () {
    const array = yield* readReflection(
      () => (Array.isArray(value) ? value : undefined),
      path,
      reason,
    );
    if (array === undefined) return undefined;

    const prototype = yield* readReflection(
      () => {
        const prototype: ReflectionSnapshot["prototype"] = Object.getPrototypeOf(array);
        return prototype;
      },
      path,
      reason,
    );
    if (prototype !== Array.prototype) return yield* invalidReflection(reason, path);
    const snapshot = yield* snapshotProperties(array, prototype, path, reason);
    const length = arrayLength(readSnapshotProperty(snapshot, "length"));
    if (length === undefined) return yield* invalidReflection(reason, path);
    const entries = yield* validateArrayKeys(snapshot.properties, length, path, reason);

    const values: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const property = entries.get(index);
      if (property === undefined) return yield* invalidReflection(reason, [...path, index]);
      values.push(property.value);
    }
    // oxlint-disable-next-line anti-slop/no-object-freeze -- Array projections are published as runtime-immutable containers; element values remain caller-owned.
    return Object.freeze(values);
  });

export const readTokenText = (value: unknown, key: "kind" | "id" | "name") =>
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
