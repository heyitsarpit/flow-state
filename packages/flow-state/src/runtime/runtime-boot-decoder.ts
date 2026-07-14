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

function optionalFiniteNumber(
  value: Readonly<Record<string, unknown>>,
  key: string,
  path: string,
): void {
  const field = value[key];
  if (field !== undefined && (typeof field !== "number" || !Number.isFinite(field))) {
    reject(`${path}.${key}`, "expected-finite-number");
  }
}

function optionalEnum(
  value: Readonly<Record<string, unknown>>,
  key: string,
  allowed: ReadonlySet<string>,
  path: string,
): void {
  const field = value[key];
  if (field !== undefined && (typeof field !== "string" || !allowed.has(field))) {
    reject(`${path}.${key}`, "unsupported-discriminant");
  }
}

function hasOwn(value: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

const resourceSnapshotFields = new Set([
  "id",
  "status",
  "availability",
  "activity",
  "freshness",
  "previousValue",
  "value",
  "placeholder",
  "error",
  "updatedAt",
  "invalidatedAt",
  "expiresAt",
  "requestId",
  "isPlaceholderData",
]);
const resourceSnapshotRequiredFields = new Set([
  "id",
  "status",
  "availability",
  "activity",
  "freshness",
  "isPlaceholderData",
]);
const transactionSnapshotFields = new Set(["id", "status", "value", "error"]);
const transactionSnapshotRequiredFields = new Set(["id", "status"]);
const streamSnapshotFields = new Set([
  "id",
  "status",
  "generation",
  "emitted",
  "hasValue",
  "value",
  "error",
]);
const streamSnapshotRequiredFields = new Set(["id", "status", "hasValue"]);
const timerSnapshotFields = new Set([
  "id",
  "status",
  "generation",
  "parentState",
  "startedAt",
  "dueAt",
  "endedAt",
]);
const timerSnapshotRequiredFields = new Set([
  "id",
  "status",
  "generation",
  "parentState",
  "startedAt",
  "dueAt",
]);
const childSnapshotFields = new Set([
  "id",
  "generation",
  "actorId",
  "status",
  "state",
  "snapshot",
  "parentState",
  "supervision",
]);
const childSnapshotRequiredFields = new Set(["id", "generation", "status"]);

function validateSafeId(value: unknown, path: string): string {
  const id = string(value, path);
  if (id.length === 0 || id.length > 512) {
    return reject(path, id.length === 0 ? "empty-id" : "oversize-id");
  }
  if (id === "__proto__" || id === "prototype" || id === "constructor") {
    return reject(path, "reserved-id");
  }
  for (let index = 0; index < id.length; index += 1) {
    const code = id.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return reject(path, "control-character-id");
    }
  }
  return id;
}

function validateResourceSnapshot(
  value: Readonly<Record<string, unknown>>,
  path: string,
  expectedId?: string,
  mismatchReason: "resource-id-mismatch" | "map-key-id-mismatch" = "resource-id-mismatch",
): void {
  strictFields(value, resourceSnapshotFields, resourceSnapshotRequiredFields, path);
  const id = validateSafeId(value.id, `${path}.id`);
  if (expectedId !== undefined && id !== expectedId) {
    reject(`${path}.id`, mismatchReason);
  }
  optionalEnum(value, "status", new Set(["idle", "loading", "success", "failure", "stale"]), path);
  optionalEnum(value, "availability", new Set(["empty", "value", "failure"]), path);
  optionalEnum(value, "activity", new Set(["idle", "fetching", "paused"]), path);
  optionalEnum(value, "freshness", new Set(["fresh", "stale", "invalidated"]), path);
  for (const key of ["updatedAt", "invalidatedAt", "expiresAt"]) {
    optionalFiniteNumber(value, key, path);
  }
  if (value.requestId !== undefined && typeof value.requestId !== "string") {
    reject(`${path}.requestId`, "expected-string");
  }
  if (value.isPlaceholderData !== undefined && typeof value.isPlaceholderData !== "boolean") {
    reject(`${path}.isPlaceholderData`, "expected-boolean");
  }

  const empty =
    (value.status === "idle" || value.status === "loading") &&
    value.availability === "empty" &&
    !hasOwn(value, "value") &&
    !hasOwn(value, "placeholder") &&
    !hasOwn(value, "error");
  const available =
    (value.status === "success" || value.status === "stale") &&
    value.availability === "value" &&
    hasOwn(value, "value");
  const failed =
    value.status === "failure" &&
    value.availability === "failure" &&
    hasOwn(value, "error") &&
    !hasOwn(value, "value") &&
    !hasOwn(value, "placeholder");
  if (!empty && !available && !failed) {
    reject(path, "contradictory-resource-snapshot");
  }
}

function validateSnapshotMap(
  value: unknown,
  path: string,
  validate: (entry: Readonly<Record<string, unknown>>, entryPath: string, key: string) => void,
): void {
  const entries = record(value, path);
  for (const [key, entry] of Object.entries(entries)) {
    validate(record(entry, `${path}.${key}`), `${path}.${key}`, key);
  }
}

function validatePositiveGeneration(value: Readonly<Record<string, unknown>>, path: string): void {
  if (!Number.isSafeInteger(value.generation) || Number(value.generation) < 1) {
    reject(`${path}.generation`, "expected-positive-safe-integer");
  }
}

function validateOptionalPositiveGeneration(
  value: Readonly<Record<string, unknown>>,
  path: string,
): void {
  if (value.generation !== undefined) {
    validatePositiveGeneration(value, path);
  }
}

function validateTransactionSnapshot(
  value: Readonly<Record<string, unknown>>,
  path: string,
  expectedId: string,
): void {
  strictFields(value, transactionSnapshotFields, transactionSnapshotRequiredFields, path);
  if (validateSafeId(value.id, `${path}.id`) !== expectedId) {
    reject(`${path}.id`, "map-key-id-mismatch");
  }
  optionalEnum(
    value,
    "status",
    new Set(["idle", "pending", "success", "failure", "defect", "queued", "interrupt"]),
    path,
  );
  const terminalSuccess =
    value.status === "success" && hasOwn(value, "value") && !hasOwn(value, "error");
  const terminalFailure =
    value.status === "failure" && hasOwn(value, "error") && !hasOwn(value, "value");
  const payloadless =
    (value.status === "idle" ||
      value.status === "pending" ||
      value.status === "queued" ||
      value.status === "interrupt" ||
      value.status === "defect") &&
    !hasOwn(value, "value") &&
    !hasOwn(value, "error");
  if (!terminalSuccess && !terminalFailure && !payloadless) {
    reject(path, "contradictory-transaction-snapshot");
  }
}

function validateStreamSnapshot(
  value: Readonly<Record<string, unknown>>,
  path: string,
  expectedId: string,
): void {
  strictFields(value, streamSnapshotFields, streamSnapshotRequiredFields, path);
  if (validateSafeId(value.id, `${path}.id`) !== expectedId) {
    reject(`${path}.id`, "map-key-id-mismatch");
  }
  optionalEnum(
    value,
    "status",
    new Set(["idle", "running", "success", "failure", "defect", "interrupt"]),
    path,
  );
  if (typeof value.hasValue !== "boolean") {
    reject(`${path}.hasValue`, "expected-boolean");
  }
  validateOptionalPositiveGeneration(value, path);
  if (
    value.emitted !== undefined &&
    (!Number.isSafeInteger(value.emitted) || Number(value.emitted) < 0)
  ) {
    reject(`${path}.emitted`, "expected-non-negative-safe-integer");
  }

  const valueShape = value.hasValue ? hasOwn(value, "value") : !hasOwn(value, "value");
  const idle =
    value.status === "idle" &&
    value.hasValue === false &&
    !hasOwn(value, "generation") &&
    !hasOwn(value, "emitted") &&
    !hasOwn(value, "error");
  const failed = value.status === "failure" && valueShape && hasOwn(value, "error");
  const activeOrTerminal =
    (value.status === "running" ||
      value.status === "success" ||
      value.status === "defect" ||
      value.status === "interrupt") &&
    valueShape &&
    !hasOwn(value, "error");
  if (!idle && !failed && !activeOrTerminal) {
    reject(path, "contradictory-stream-snapshot");
  }
}

function validateTimerSnapshot(
  value: Readonly<Record<string, unknown>>,
  path: string,
  expectedId: string,
): void {
  strictFields(value, timerSnapshotFields, timerSnapshotRequiredFields, path);
  if (validateSafeId(value.id, `${path}.id`) !== expectedId) {
    reject(`${path}.id`, "map-key-id-mismatch");
  }
  optionalEnum(value, "status", new Set(["scheduled", "fired", "interrupt"]), path);
  validatePositiveGeneration(value, path);
  string(value.parentState, `${path}.parentState`);
  for (const field of ["startedAt", "dueAt", "endedAt"]) {
    optionalFiniteNumber(value, field, path);
  }
}

function validateChildSnapshot(
  value: Readonly<Record<string, unknown>>,
  path: string,
  expectedId: string,
): void {
  strictFields(value, childSnapshotFields, childSnapshotRequiredFields, path);
  if (validateSafeId(value.id, `${path}.id`) !== expectedId) {
    reject(`${path}.id`, "map-key-id-mismatch");
  }
  optionalEnum(
    value,
    "status",
    new Set(["idle", "active", "success", "failure", "interrupt", "stopped"]),
    path,
  );
  validatePositiveGeneration(value, path);
  for (const field of ["actorId", "state", "parentState"]) {
    if (value[field] !== undefined) {
      string(value[field], `${path}.${field}`);
    }
  }
  optionalEnum(value, "supervision", new Set(["stop-on-failure", "continue-on-failure"]), path);
  if (value.snapshot !== undefined) {
    decodeActorSnapshot(value.snapshot, `${path}.snapshot`);
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
  validateSafeId(decoded.id, `${path}.id`);
  array(decoded.params, `${path}.params`);
  array(decoded.key, `${path}.key`);
  return decoded as FlowResourceRef;
}

function decodeResourceEntry(value: unknown, path: string): FlowResourceHydrationEntry {
  const decoded = record(value, path);
  strictFields(decoded, new Set(["ref", "snapshot"]), new Set(["ref", "snapshot"]), path);
  const ref = decodeResourceRef(decoded.ref, `${path}.ref`);
  validateResourceSnapshot(
    record(decoded.snapshot, `${path}.snapshot`),
    `${path}.snapshot`,
    ref.id,
  );
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
  validateSnapshotMap(decoded.resources, `${path}.resources`, (entry, entryPath, key) =>
    validateResourceSnapshot(entry, entryPath, key, "map-key-id-mismatch"),
  );
  validateSnapshotMap(decoded.transactions, `${path}.transactions`, validateTransactionSnapshot);
  validateSnapshotMap(decoded.streams, `${path}.streams`, validateStreamSnapshot);
  validateSnapshotMap(decoded.timers, `${path}.timers`, validateTimerSnapshot);
  validateSnapshotMap(decoded.children, `${path}.children`, validateChildSnapshot);
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
  validateSafeId(decoded.id, `${path}.id`);
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
