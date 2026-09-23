import { Option, Predicate, Result } from "effect";

import { Failure, type PublicDiagnostic } from "../diagnostic/diagnostic.js";

export type StructuralCopyPolicy = "actor" | "context" | "evidence";

type Reference = Exclude<WeakKey, symbol>;

type RootNumberOverride = { key: string; value: number };

type Path = { kind: "root" } | { kind: "segment"; key: string | number; parent: Path };

const rootPath: Path = { kind: "root" };

type Frame = {
  source: Reference;
  target: Reference;
  array: boolean;
  arrayLength: number;
  keys: PropertyKey[];
  index: number;
  path: Path;
};

// FLOW_STATE_ALLOW_UNKNOWN: Copy admission distinguishes reflected arrays and records from opaque primitives.
// RETURN_TYPE: Reflection needs this reference guard before WeakMap and descriptor access.
const isContainer = (value: unknown): value is Reference =>
  Array.isArray(value) || Predicate.isObject(value);

const preserveOpaqueReference = (
  value: Reference,
  policy: StructuralCopyPolicy,
  identities: WeakSet<Reference>,
) => {
  if (identities.has(value)) return true;

  if (policy === "actor" || Array.isArray(value)) return false;

  const prototype = Object.getPrototypeOf(value);

  return prototype !== Object.prototype && prototype !== null;
};

const diagnostic = (policy: StructuralCopyPolicy, reason: string, path: Path) => {
  const segments: (string | number)[] = [];

  for (let cursor = path; cursor.kind === "segment"; cursor = cursor.parent)
    segments.push(cursor.key);

  segments.reverse();

  return Failure({
    code: "SchemaValidation",
    path: segments,
    details: { policy, reason },
    summary: "Structural value cannot be owned at this boundary.",
    help: "Supply plain data properties accepted by this boundary.",
  });
};

const isArrayIndex = (key: PropertyKey, length: number) =>
  Predicate.isString(key) &&
  /^(0|[1-9]\d*)$/u.test(key) &&
  Number(key) < length &&
  String(Number(key)) === key;

const hasDenseArrayKeys = (keys: PropertyKey[], length: number) => {
  const indices = keys.filter((key) => key !== "length");

  return indices.length === length && indices.every((key, index) => key === String(index));
};

// RETURN_TYPE: The array length guard narrows a reflected value before allocation.
const isValidArrayLength = (value: unknown): value is number =>
  Predicate.isNumber(value) && Number.isSafeInteger(value) && value >= 0;

const inspectArray = (source: Reference, policy: StructuralCopyPolicy, path: Path) => {
  if (Object.getPrototypeOf(source) !== Array.prototype)
    return Result.fail(diagnostic(policy, "prototype", path));

  const keys = Reflect.ownKeys(source);
  const lengthDescriptor = Object.getOwnPropertyDescriptor(source, "length");

  // FLOW_STATE_ALLOW_UNKNOWN: Reflection validates the array's own length descriptor.
  const rawLength: unknown =
    lengthDescriptor !== undefined && "value" in lengthDescriptor ? lengthDescriptor.value : 0;

  if (!isValidArrayLength(rawLength)) return Result.fail(diagnostic(policy, "array-length", path));

  if (policy !== "context" && !hasDenseArrayKeys(keys, rawLength))
    return Result.fail(diagnostic(policy, "sparse-array", path));

  if (policy === "actor" && keys.some((key) => !Predicate.isString(key)))
    return Result.fail(diagnostic(policy, "symbol-key", path));

  const target: Reference = [];

  if (Array.isArray(target)) target.length = rawLength;

  return Result.succeed({ array: true, length: rawLength, keys, target });
};

const inspectRecord = (source: Reference, policy: StructuralCopyPolicy, path: Path) => {
  const prototype = Object.getPrototypeOf(source);

  if (prototype !== Object.prototype && prototype !== null)
    return Result.fail(diagnostic(policy, "prototype", path));

  const keys = Reflect.ownKeys(source);

  if (policy === "actor" && keys.some((key) => !Predicate.isString(key)))
    return Result.fail(diagnostic(policy, "symbol-key", path));

  const target: Reference = Object.create(prototype);

  return Result.succeed({ array: false, length: 0, keys, target });
};

const inspectContainer = (source: Reference, policy: StructuralCopyPolicy, path: Path) =>
  Array.isArray(source) ? inspectArray(source, policy, path) : inspectRecord(source, policy, path);

type CopyState = {
  policy: StructuralCopyPolicy;
  identities: WeakSet<Reference>;
  rootSource: Reference;
  rootOverride: Option.Option<RootNumberOverride>;
  copied: WeakMap<Reference, Reference>;
  active: WeakSet<Reference>;
  stack: Frame[];
  owned: Reference[];
};

// RETURN_TYPE: The worklist records one owned clone for each entered reference.
const enter = (
  state: CopyState,
  source: Reference,
  path: Path,
): Result.Result<Reference, PublicDiagnostic> => {
  const previous = state.copied.get(source);

  if (previous !== undefined) {
    if (state.policy === "actor" && state.active.has(source))
      return Result.fail(diagnostic(state.policy, "cycle", path));

    return Result.succeed(previous);
  }

  const inspected = inspectContainer(source, state.policy, path);

  if (Result.isFailure(inspected)) return Result.fail(inspected.failure);

  state.copied.set(source, inspected.success.target);
  state.active.add(source);
  state.owned.push(inspected.success.target);
  state.stack.push({
    source,
    target: inspected.success.target,
    array: inspected.success.array,
    arrayLength: inspected.success.length,
    keys: inspected.success.keys,
    index: 0,
    path,
  });

  return Result.succeed(inspected.success.target);
};

const selectedRootOverride = (state: CopyState, frame: Frame, key: PropertyKey) =>
  Option.filter(
    state.rootOverride,
    (override) => frame.source === state.rootSource && key === override.key,
  );

const copyProperty = (state: CopyState, frame: Frame, key: PropertyKey) => {
  const segment = isArrayIndex(key, frame.arrayLength) ? Number(key) : String(key);
  const path: Path = { kind: "segment", key: segment, parent: frame.path };
  const descriptor = Object.getOwnPropertyDescriptor(frame.source, key);

  if (descriptor === undefined || !("value" in descriptor))
    return Result.fail(diagnostic(state.policy, "accessor", path));

  if (state.policy === "actor" && !descriptor.enumerable)
    return Result.fail(diagnostic(state.policy, "non-enumerable", path));

  const override = selectedRootOverride(state, frame, key);
  // FLOW_STATE_ALLOW_UNKNOWN: This reflected value is validated by the one worklist.
  const child: unknown = Option.isSome(override) ? override.value.value : descriptor.value;

  let captured = child;

  if (isContainer(child) && !preserveOpaqueReference(child, state.policy, state.identities)) {
    const next = enter(state, child, path);

    if (Result.isFailure(next)) return Result.fail(next.failure);

    captured = next.success;
  }

  Object.defineProperty(frame.target, key, {
    configurable: true,
    enumerable: descriptor.enumerable === true,
    writable: false,
    value: captured,
  });

  return Result.succeed(undefined);
};

const advance = (state: CopyState) => {
  const frame = state.stack.at(-1);

  if (frame === undefined) return Result.succeed(undefined);

  if (frame.index === frame.keys.length) {
    state.active.delete(frame.source);
    state.stack.pop();

    return Result.succeed(undefined);
  }

  const key = frame.keys[frame.index];
  frame.index += 1;

  if (key === undefined || (frame.array && key === "length")) return Result.succeed(undefined);

  return copyProperty(state, frame, key);
};

// RETURN_TYPE: The generic return retains the caller's admitted structural family.
const copyStructuralUnchecked = <Value>(
  value: Value,
  policy: StructuralCopyPolicy,
  opaque: Iterable<Reference>,
  rootOverride?: RootNumberOverride,
): Result.Result<Value, PublicDiagnostic> => {
  if (!isContainer(value)) {
    if (rootOverride !== undefined)
      return Result.fail(diagnostic(policy, "root-override", rootPath));

    return Result.succeed(value);
  }

  const state: CopyState = {
    policy,
    identities: new WeakSet<Reference>(opaque),
    rootSource: value,
    rootOverride: Option.fromNullishOr(rootOverride),
    copied: new WeakMap<Reference, Reference>(),
    active: new WeakSet<Reference>(),
    stack: [],
    owned: [],
  };

  if (preserveOpaqueReference(value, policy, state.identities)) {
    if (rootOverride !== undefined)
      return Result.fail(diagnostic(policy, "root-override", rootPath));

    return Result.succeed(value);
  }

  const root = enter(state, value, rootPath);

  if (Result.isFailure(root)) return Result.fail(root.failure);

  while (state.stack.length > 0) {
    const advanced = advance(state);

    if (Result.isFailure(advanced)) return Result.fail(advanced.failure);
  }

  // The clones alone are frozen; caller originals and opaque identities are untouched.
  // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11 requires immutable owned publication.
  for (const item of state.owned) Object.freeze(item);

  // SAFETY: Every structured branch has the same keys and values after ownership copying.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the caller's structural type is retained by the copy.
  return Result.succeed(root.success as Value);
};

/** Copies plain records and arrays without invoking caller getters or recursion. */
// RETURN_TYPE: This public internal port preserves exact Value or a typed diagnostic.
export const copyStructural = <Value>(
  value: Value,
  policy: StructuralCopyPolicy,
  opaque: Iterable<Reference> = [],
  rootOverride?: RootNumberOverride,
): Result.Result<Value, PublicDiagnostic> =>
  Result.try({
    try: () => copyStructuralUnchecked(value, policy, opaque, rootOverride),
    catch: () => diagnostic(policy, "reflection", rootPath),
  }).pipe(Result.flatMap((result) => result));
