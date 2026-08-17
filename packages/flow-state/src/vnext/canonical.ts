import { freezeArray } from "./internal.js";
import { usageError } from "./usage-error.js";

export type CanonicalKeyInput =
  | null
  | string
  | boolean
  | number
  | readonly CanonicalKeyInput[]
  | Readonly<{ [key: string]: CanonicalKeyInput }>;

const maximumDepth = 32;
const maximumNodes = 10_000;
const maximumArrayLength = 4_096;
const maximumStringBytes = 262_144;
const maximumEncodedBytes = 2_097_152;
const reservedKeys = new Set(["__proto__", "prototype", "constructor"]);

const utf8Length = (value: string): number => new TextEncoder().encode(value).byteLength;

const hasLoneSurrogate = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return true;
  }
  return false;
};

export const compareCanonicalStrings = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const validateString = (value: string, path: string): void => {
  if (hasLoneSurrogate(value))
    usageError("InvalidCanonicalValue", "canonical", { path, reason: "lone-surrogate" });
  if (utf8Length(value) > maximumStringBytes)
    usageError("InvalidCanonicalValue", "canonical", { path, reason: "string-bound" });
};

type WalkState = { nodes: number; readonly seen: WeakSet<object> };

const dataDescriptorValue = (descriptor: PropertyDescriptor | undefined, path: string): unknown => {
  if (
    descriptor === undefined ||
    descriptor.get !== undefined ||
    descriptor.set !== undefined ||
    descriptor.enumerable !== true
  )
    return usageError("InvalidCanonicalValue", "canonical", {
      path,
      reason: "property-descriptor",
    });
  return descriptor.value;
};

const walk = (value: unknown, path: string, depth: number, state: WalkState): CanonicalKeyInput => {
  state.nodes += 1;
  if (state.nodes > maximumNodes)
    usageError("InvalidCanonicalValue", "canonical", { path, reason: "node-bound" });
  if (depth > maximumDepth)
    usageError("InvalidCanonicalValue", "canonical", { path, reason: "depth-bound" });

  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    validateString(value, path);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0))
      usageError("InvalidCanonicalValue", "canonical", { path, reason: "number" });
    return value;
  }
  if (typeof value !== "object" || value === null)
    return usageError("InvalidCanonicalValue", "canonical", { path, reason: typeof value });

  const objectValue = value;
  try {
    if (state.seen.has(objectValue))
      usageError("InvalidCanonicalValue", "canonical", { path, reason: "cycle" });
    state.seen.add(objectValue);

    if (Array.isArray(objectValue)) {
      if (Object.getPrototypeOf(objectValue) !== Array.prototype)
        usageError("InvalidCanonicalValue", "canonical", { path, reason: "prototype" });
      if (objectValue.length > maximumArrayLength)
        usageError("InvalidCanonicalValue", "canonical", { path, reason: "array-bound" });
      if (Object.getOwnPropertySymbols(objectValue).length > 0)
        usageError("InvalidCanonicalValue", "canonical", { path, reason: "symbol-key" });
      const arrayDescriptors = Object.getOwnPropertyDescriptors(objectValue);
      const unexpected = Object.keys(arrayDescriptors).find(
        (key) =>
          key !== "length" &&
          (!/^(0|[1-9][0-9]*)$/u.test(key) || Number(key) >= objectValue.length),
      );
      if (unexpected !== undefined)
        usageError("InvalidCanonicalValue", "canonical", {
          path: `${path}.${unexpected}`,
          reason: "array-property",
        });
      const copied: CanonicalKeyInput[] = [];
      for (let index = 0; index < objectValue.length; index += 1) {
        if (!Object.hasOwn(objectValue, index))
          usageError("InvalidCanonicalValue", "canonical", {
            path: `${path}[${index}]`,
            reason: "sparse-array",
          });
        const itemPath = `${path}[${index}]`;
        copied.push(
          walk(
            dataDescriptorValue(arrayDescriptors[String(index)], itemPath),
            itemPath,
            depth + 1,
            state,
          ),
        );
      }
      return freezeArray(copied);
    }

    const prototype = Object.getPrototypeOf(objectValue);
    if (prototype !== Object.prototype && prototype !== null)
      usageError("InvalidCanonicalValue", "canonical", { path, reason: "prototype" });
    if (Object.getOwnPropertySymbols(objectValue).length > 0)
      usageError("InvalidCanonicalValue", "canonical", { path, reason: "symbol-key" });

    const descriptors = Object.getOwnPropertyDescriptors(objectValue);
    const keys = Object.keys(descriptors).sort(compareCanonicalStrings);
    const copied: Record<string, CanonicalKeyInput> = Object.create(null);
    for (const key of keys) {
      validateString(key, `${path}.${key}`);
      if (reservedKeys.has(key))
        usageError("InvalidCanonicalValue", "canonical", {
          path: `${path}.${key}`,
          reason: "reserved-key",
        });
      const propertyPath = `${path}.${key}`;
      copied[key] = walk(
        dataDescriptorValue(descriptors[key], propertyPath),
        propertyPath,
        depth + 1,
        state,
      );
    }
    return Object.freeze(copied);
  } catch (cause) {
    if (cause instanceof Error && "_tag" in cause && cause._tag === "FlowUsageError") throw cause;
    return usageError("InvalidCanonicalValue", "canonical", { path, reason: "reflection" }, cause);
  } finally {
    if (typeof value === "object" && value !== null) state.seen.delete(value);
  }
};

export const copyCanonical = (value: unknown): CanonicalKeyInput => {
  const copied = walk(value, "$", 0, { nodes: 0, seen: new WeakSet() });
  const encoded = JSON.stringify(copied);
  if (utf8Length(encoded) > maximumEncodedBytes)
    usageError("InvalidCanonicalValue", "canonical", { path: "$", reason: "encoded-bound" });
  return copied;
};

export const encodeCanonical = (value: unknown): string => JSON.stringify(copyCanonical(value));

export const validateAuthoredId = (value: unknown, operation: string): string => {
  if (typeof value !== "string" || value.length === 0)
    return usageError("InvalidDefinition", operation, { reason: "empty-id" });
  if (hasLoneSurrogate(value) || utf8Length(value) > 256)
    usageError("InvalidDefinition", operation, { reason: "invalid-id", value });
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit <= 0x1f || unit === 0x7f)
      usageError("InvalidDefinition", operation, { reason: "control-id", value });
  }
  return value;
};

export const encodeSegment = (value: string): string => `${utf8Length(value)}:${value}`;
