import type {
  FlowActorSnapshotTree,
  FlowResourceHydrationEntry,
  FlowResourceRef,
  FlowRuntimeBootActorSnapshot,
  FlowRuntimeBootPayload,
} from "../core/api/types.js";
import {
  invalidRuntimeBootPayloadDiagnostic,
  invalidRuntimeBootPayloadVersionDiagnostic,
} from "../shared/diagnostics.js";

const runtimeBootPayloadVersion = "flow-state/runtime-boot.v1" as const;
const maxDepth = 32;
const maxNodes = 10_000;
const maxArrayLength = 4_096;
const maxStringBytes = 256 * 1_024;
const maxPayloadBytes = 2 * 1_024 * 1_024;

type DecodeState = {
  readonly seen: WeakSet<object>;
  nodes: number;
  bytes: number;
};

function reject(path: string, reason: string): never {
  throw invalidRuntimeBootPayloadDiagnostic({ path, reason });
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function addBytes(state: DecodeState, value: string, path: string): void {
  const bytes = byteLength(value);
  if (bytes > maxStringBytes) {
    reject(path, "string-byte-limit");
  }
  state.bytes += bytes;
  if (state.bytes > maxPayloadBytes) {
    reject(path, "payload-byte-limit");
  }
}

function ownDescriptors(value: object, path: string): PropertyDescriptorMap {
  try {
    return Object.getOwnPropertyDescriptors(value);
  } catch {
    return reject(path, "uninspectable-object");
  }
}

function ownKeys(descriptors: PropertyDescriptorMap, path: string): ReadonlyArray<PropertyKey> {
  try {
    return Reflect.ownKeys(descriptors);
  } catch {
    return reject(path, "uninspectable-object");
  }
}

function decodeArray(
  value: ReadonlyArray<unknown>,
  state: DecodeState,
  depth: number,
  path: string,
): ReadonlyArray<unknown> {
  const descriptors = ownDescriptors(value, path);
  const keys = ownKeys(descriptors, path);
  const lengthDescriptor = descriptors.length;
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    typeof lengthDescriptor.value !== "number" ||
    lengthDescriptor.value > maxArrayLength
  ) {
    return reject(path, "array-length-limit");
  }

  for (const key of keys) {
    if (typeof key !== "string") {
      return reject(path, "symbol-key");
    }
    if (key !== "length" && !/^(0|[1-9]\d*)$/.test(key)) {
      return reject(`${path}.${key}`, "unexpected-array-field");
    }
  }

  const result: unknown[] = [];
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined) {
      return reject(`${path}[${index}]`, "sparse-array");
    }
    if (!("value" in descriptor)) {
      return reject(`${path}[${index}]`, "accessor-property");
    }
    result.push(decodeValue(descriptor.value, state, depth + 1, `${path}[${index}]`));
  }
  return Object.freeze(result);
}

function decodeRecord(
  value: object,
  state: DecodeState,
  depth: number,
  path: string,
): Readonly<Record<string, unknown>> {
  let prototype: object | null;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    return reject(path, "uninspectable-object");
  }
  if (prototype !== Object.prototype && prototype !== null) {
    return reject(path, "unsupported-prototype");
  }

  const descriptors = ownDescriptors(value, path);
  const result = Object.create(null) as Record<string, unknown>;
  for (const key of ownKeys(descriptors, path)) {
    if (typeof key !== "string") {
      return reject(path, "symbol-key");
    }
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      return reject(`${path}.${key}`, "reserved-property");
    }
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      return reject(`${path}.${key}`, "accessor-property");
    }
    addBytes(state, key, `${path}.${key}`);
    result[key] = decodeValue(descriptor.value, state, depth + 1, `${path}.${key}`);
  }
  return Object.freeze(result);
}

function decodeValue(value: unknown, state: DecodeState, depth: number, path: string): unknown {
  if (depth > maxDepth) {
    return reject(path, "depth-limit");
  }
  state.nodes += 1;
  if (state.nodes > maxNodes) {
    return reject(path, "node-limit");
  }

  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    addBytes(state, value, path);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return reject(path, "non-finite-number");
    }
    state.bytes += 8;
    return value;
  }
  if (typeof value !== "object") {
    return reject(path, `unsupported-${typeof value}`);
  }
  if (state.seen.has(value)) {
    return reject(path, "cycle");
  }

  state.seen.add(value);
  try {
    return Array.isArray(value)
      ? decodeArray(value, state, depth, path)
      : decodeRecord(value, state, depth, path);
  } finally {
    state.seen.delete(value);
  }
}

function record(value: unknown, path: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return reject(path, "expected-record");
  }
  return value as Readonly<Record<string, unknown>>;
}

function array(value: unknown, path: string): ReadonlyArray<unknown> {
  return Array.isArray(value) ? value : reject(path, "expected-array");
}

function string(value: unknown, path: string): string {
  return typeof value === "string" ? value : reject(path, "expected-string");
}

function strictFields(
  value: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
  required: ReadonlySet<string>,
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      reject(`${path}.${key}`, "unknown-field");
    }
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      reject(`${path}.${key}`, "missing-field");
    }
  }
}

function decodeResourceRef(value: unknown, path: string): FlowResourceRef {
  const decoded = record(value, path);
  strictFields(
    decoded,
    new Set(["kind", "id", "params", "key"]),
    new Set(["kind", "id", "params", "key"]),
    path,
  );
  if (decoded.kind !== "resourceRef") {
    reject(`${path}.kind`, "expected-resource-ref");
  }
  string(decoded.id, `${path}.id`);
  array(decoded.params, `${path}.params`);
  array(decoded.key, `${path}.key`);
  return decoded as FlowResourceRef;
}

function decodeResourceEntry(value: unknown, path: string): FlowResourceHydrationEntry {
  const decoded = record(value, path);
  strictFields(decoded, new Set(["ref", "snapshot"]), new Set(["ref", "snapshot"]), path);
  decodeResourceRef(decoded.ref, `${path}.ref`);
  record(decoded.snapshot, `${path}.snapshot`);
  return decoded as FlowResourceHydrationEntry;
}

function decodeActorSnapshot(value: unknown, path: string): FlowActorSnapshotTree {
  const decoded = record(value, path);
  strictFields(
    decoded,
    new Set([
      "value",
      "context",
      "resources",
      "transactions",
      "streams",
      "timers",
      "children",
      "truncatedBeforeReceiptCount",
      "receipts",
    ]),
    new Set([
      "value",
      "context",
      "resources",
      "transactions",
      "streams",
      "timers",
      "children",
      "receipts",
    ]),
    path,
  );
  string(decoded.value, `${path}.value`);
  record(decoded.resources, `${path}.resources`);
  record(decoded.transactions, `${path}.transactions`);
  record(decoded.streams, `${path}.streams`);
  record(decoded.timers, `${path}.timers`);
  record(decoded.children, `${path}.children`);
  array(decoded.receipts, `${path}.receipts`);
  if (
    decoded.truncatedBeforeReceiptCount !== undefined &&
    (!Number.isSafeInteger(decoded.truncatedBeforeReceiptCount) ||
      (decoded.truncatedBeforeReceiptCount as number) < 0)
  ) {
    reject(`${path}.truncatedBeforeReceiptCount`, "expected-non-negative-safe-integer");
  }
  return decoded as FlowActorSnapshotTree;
}

function decodeActorEntry(value: unknown, path: string): FlowRuntimeBootActorSnapshot {
  const decoded = record(value, path);
  strictFields(decoded, new Set(["id", "snapshot"]), new Set(["id", "snapshot"]), path);
  string(decoded.id, `${path}.id`);
  decodeActorSnapshot(decoded.snapshot, `${path}.snapshot`);
  return decoded as FlowRuntimeBootActorSnapshot;
}

export function decodeRuntimeBootPayload(input: unknown): FlowRuntimeBootPayload {
  const decoded = decodeValue(input, { seen: new WeakSet<object>(), nodes: 0, bytes: 0 }, 0, "$");
  const payload = record(decoded, "$");
  strictFields(
    payload,
    new Set(["version", "resources", "actors", "extensions"]),
    new Set(["version", "resources", "actors"]),
    "$",
  );
  if (payload.version !== runtimeBootPayloadVersion) {
    throw invalidRuntimeBootPayloadVersionDiagnostic({
      expectedVersion: runtimeBootPayloadVersion,
      receivedVersion:
        typeof payload.version === "string" ? payload.version : typeof payload.version,
    });
  }
  if (payload.extensions !== undefined) {
    record(payload.extensions, "$.extensions");
  }

  array(payload.resources, "$.resources").forEach((entry, index) =>
    decodeResourceEntry(entry, `$.resources[${index}]`),
  );
  array(payload.actors, "$.actors").forEach((entry, index) =>
    decodeActorEntry(entry, `$.actors[${index}]`),
  );
  return payload as FlowRuntimeBootPayload;
}
