import { Option, Predicate, Result } from "effect";

import { Diagnostic, Failure, type PublicDiagnostic } from "../diagnostic/diagnostic.js";
import type { StructuralReadonly } from "./structural-copy-types.js";

export type {
  StructuralReadonly,
  StructuralReadonlyWhenNonempty,
} from "./structural-copy-types.js";

export type StructuralCopyPolicy = "actor" | "context" | "evidence";

type Reference = Exclude<WeakKey, symbol>;

/** A reusable opaque-identity lookup for values captured before one or more copies. */
export type StructuralCopyIdentityLookup<Identity extends Reference = never> = {
  // oxlint-disable-next-line anti-slop/no-readonly -- The actor captures this identity policy once and reuses it unchanged across publication cuts.
  readonly isOpaque: (value: Reference) => value is Identity;
};

export const makeStructuralCopyIdentityLookup = <Identity extends Reference>(
  isOpaque: StructuralCopyIdentityLookup<Identity>["isOpaque"],
) => {
  // oxlint-disable-next-line anti-slop/no-object-freeze -- This per-actor lookup keeps its captured identity policy immutable across publications.
  return Object.freeze({ isOpaque });
};

// FLOW_STATE_ALLOW_UNKNOWN: Reflected descriptor values stay untrusted until narrowed by their owner.
const readOwnData = (value: Reference, key: PropertyKey) => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);

  if (descriptor === undefined || !("value" in descriptor)) return Option.none();

  const reflected: unknown = descriptor.value;

  return Option.some(reflected);
};

/** Reads a diagnostic extension through data descriptors without invoking snapshot getters. */
export const readStructuralDiagnostics = (value: Reference, key: PropertyKey) => {
  const vectorValue = readOwnData(value, key);

  if (!Option.isSome(vectorValue) || !Array.isArray(vectorValue.value)) return [];

  const vector = vectorValue.value;
  const lengthValue = readOwnData(vector, "length");

  if (!Option.isSome(lengthValue) || !Predicate.isNumber(lengthValue.value)) return [];

  const length = lengthValue.value;

  if (!Number.isSafeInteger(length) || length < 0) return [];

  const diagnostics: PublicDiagnostic[] = [];

  for (let index = 0; index < length; index += 1) {
    const issue = readOwnData(vector, String(index));

    if (Option.isSome(issue) && issue.value instanceof Diagnostic) diagnostics.push(issue.value);
  }

  return diagnostics;
};

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
  dynamicIdentities: WeakSet<Reference>,
  staticIdentities: Option.Option<StructuralCopyIdentityLookup<Reference>>,
) => {
  if (
    dynamicIdentities.has(value) ||
    (Option.isSome(staticIdentities) && staticIdentities.value.isOpaque(value))
  )
    return true;

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
  mutable: boolean;
  dynamicIdentities: WeakSet<Reference>;
  staticIdentities: Option.Option<StructuralCopyIdentityLookup<Reference>>;
  rootSource: Reference;
  rootOverride: Option.Option<RootNumberOverride>;
  copied: WeakMap<Reference, Reference>;
  active: WeakSet<Reference>;
  stack: Frame[];
  owned: Reference[];
};

const enter = (state: CopyState, source: Reference, path: Path) => {
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

  if (
    isContainer(child) &&
    !preserveOpaqueReference(child, state.policy, state.dynamicIdentities, state.staticIdentities)
  ) {
    const next = enter(state, child, path);

    if (Result.isFailure(next)) return Result.fail(next.failure);

    captured = next.success;
  }

  Object.defineProperty(frame.target, key, {
    configurable: state.mutable,
    enumerable: descriptor.enumerable === true,
    writable: state.mutable,
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
const copyStructuralCoreUnchecked = <Value>(
  value: Value,
  policy: StructuralCopyPolicy,
  dynamicIdentities: WeakSet<Reference>,
  mutable: boolean,
  rootOverride?: RootNumberOverride,
  staticIdentities?: StructuralCopyIdentityLookup<Reference>,
): Result.Result<Value, PublicDiagnostic> => {
  if (!isContainer(value)) {
    if (rootOverride !== undefined)
      return Result.fail(diagnostic(policy, "root-override", rootPath));

    return Result.succeed(value);
  }

  const staticIdentityLookup = Option.fromNullishOr(staticIdentities);

  const state: CopyState = {
    policy,
    mutable,
    dynamicIdentities,
    staticIdentities: staticIdentityLookup,
    rootSource: value,
    rootOverride: Option.fromNullishOr(rootOverride),
    copied: new WeakMap<Reference, Reference>(),
    active: new WeakSet<Reference>(),
    stack: [],
    owned: [],
  };

  if (preserveOpaqueReference(value, policy, dynamicIdentities, staticIdentityLookup)) {
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

  if (!mutable)
    // The clones alone are frozen; caller originals and opaque identities are untouched.
    // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: published graph clones cannot mutate while caller originals stay writable; P055-COPY.
    for (const item of state.owned) Object.freeze(item);

  // SAFETY: Every structured branch has the same keys and values after ownership copying.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the caller's structural type is retained by the copy.
  return Result.succeed(root.success as Value);
};

const copyStructuralUnchecked = <Value>(
  value: Value,
  policy: StructuralCopyPolicy,
  opaque: Iterable<Reference>,
  mutable: boolean,
  rootOverride?: RootNumberOverride,
  staticIdentities?: StructuralCopyIdentityLookup<Reference>,
) => {
  if (!isContainer(value)) {
    if (rootOverride !== undefined)
      return Result.fail(diagnostic(policy, "root-override", rootPath));

    return Result.succeed(value);
  }

  const dynamicIdentities = new WeakSet<Reference>(opaque);

  return copyStructuralCoreUnchecked(
    value,
    policy,
    dynamicIdentities,
    mutable,
    rootOverride,
    staticIdentities,
  );
};

/** Copies plain records and arrays without invoking caller getters or recursion. */
// RETURN_TYPE: This public internal port preserves exact Value or a typed diagnostic.
export const copyStructural = <Value>(
  value: Value,
  policy: StructuralCopyPolicy,
  opaque: Iterable<Reference> = [],
  rootOverride?: RootNumberOverride,
  staticIdentities?: StructuralCopyIdentityLookup<Reference>,
): Result.Result<Value, PublicDiagnostic> =>
  Result.try({
    try: () =>
      copyStructuralUnchecked(value, policy, opaque, false, rootOverride, staticIdentities),
    catch: () => diagnostic(policy, "reflection", rootPath),
  }).pipe(Result.flatMap((result) => result));

/** Copies and freezes actor structural containers while retaining typed opaque identities. */
// RETURN_TYPE: The exported owner helper carries its frozen projection at the type boundary.
export const copyStructuralFrozen = <
  Value extends Reference,
  Opaque extends Reference,
  PreservedKey extends keyof Value = never,
  ConditionallyEmptyKey extends keyof Value = never,
  Identity extends Reference = never,
>(
  value: Value,
  opaque: Iterable<Opaque>,
  staticIdentities?: StructuralCopyIdentityLookup<Identity>,
): Result.Result<
  StructuralReadonly<Value, Opaque | Identity, PreservedKey, ConditionallyEmptyKey>,
  PublicDiagnostic
> => {
  const copied = copyStructural(value, "actor", opaque, undefined, staticIdentities);

  return Result.map(copied, (owned) => {
    // SAFETY: Actor copies clone and freeze every traversed record/array; opaque identities and functions stay unchanged and are excluded from this readonly projection.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The actor copy algorithm establishes the recursive readonly postcondition for every successful structural branch.
    return owned as StructuralReadonly<
      Value,
      Opaque | Identity,
      PreservedKey,
      ConditionallyEmptyKey
    >;
  });
};

/** Copies plain records and arrays into an independent mutable graph. */
// RETURN_TYPE: Callback owners keep the admitted mutable structural type without freezing their private view.
export function copyStructuralMutable<Value>(
  value: Value,
  policy: StructuralCopyPolicy,
  opaque?: Iterable<Reference>,
  staticIdentities?: StructuralCopyIdentityLookup<Reference>,
): Result.Result<Value, PublicDiagnostic>;
// RETURN_TYPE: Rehydrates a frozen structural view into the exact mutable owner type after cloning it.
export function copyStructuralMutable<
  Value extends Reference,
  Opaque extends Reference,
  PreservedKey extends keyof Value = never,
  ConditionallyEmptyKey extends keyof Value = never,
>(
  value: StructuralReadonly<Value, Opaque, PreservedKey, ConditionallyEmptyKey>,
  policy: StructuralCopyPolicy,
  opaque: Iterable<Opaque>,
  staticIdentities?: StructuralCopyIdentityLookup<Reference>,
): Result.Result<Value, PublicDiagnostic>;
// RETURN_TYPE: The owner returns the exact caller-selected shape after validating the input projection and cloning it mutable.
export function copyStructuralMutable<Value, OwnedInput>(
  value: Value | OwnedInput,
  policy: StructuralCopyPolicy,
  opaque: Iterable<Reference> = [],
  staticIdentities?: StructuralCopyIdentityLookup<Reference>,
): Result.Result<Value, PublicDiagnostic> {
  const copied = Result.try({
    try: () => copyStructuralUnchecked(value, policy, opaque, true, undefined, staticIdentities),
    catch: () => diagnostic(policy, "reflection", rootPath),
  }).pipe(Result.flatMap((result) => result));

  return Result.map(copied, (owned) => {
    // SAFETY: The copy preserves all keys and values while making each traversed record and array writable; explicitly opaque references retain identity.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- This owner restores the exact pre-projection value after its mutable structural copy.
    return owned as Value;
  });
}
