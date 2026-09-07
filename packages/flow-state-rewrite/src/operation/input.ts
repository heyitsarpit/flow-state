import { Effect, Predicate, Schema } from "effect";

import { isStableDataDescriptor, isStableKeyList } from "../internal/stable-observation.js";

/*
 * Executable input ownership:
 *
 * Traversal vocabulary:
 *   SnapshotFrame, SnapshotState, SnapshotStart, SnapshotResult
 *
 * Stable observation:
 *   readStableInputKind, readStableInputKeys, readStableInputDescriptor
 *   readArraySnapshotKeys
 *
 * Frame preparation:
 *   beginSnapshot
 *
 * Traversal and completion:
 *   advanceSnapshotFrame, completeSnapshotFrame
 *
 * Final stability:
 *   verifySnapshotFrame, verifySnapshotFrames
 *
 * Assembly:
 *   snapshotExecutableInput, ExecutableInputSchema, ownExecutableInput
 */

type SnapshotResult<Value = unknown> = Readonly<{
  value: Value;
}>;

interface ExecutableInputRecord<Value = unknown> {
  readonly [key: string]: Value;
}

const executableInputChildProof: ExecutableInputRecord["child"] = undefined;
// @ts-expect-error Recursive admission has not promoted carrier children to a domain type.
const executableInputStringProof: string = executableInputChildProof;
void executableInputStringProof;

type ExecutableInputSource = readonly unknown[] | ExecutableInputRecord;

// RETURN_TYPE: Preserves narrowing from unknown to the two source container representations at the executable-input admission boundary.
const isExecutableInputSource = (value: unknown): value is ExecutableInputSource =>
  typeof value === "object" && value !== null;

type SnapshotState = {
  readonly copies: WeakMap<ExecutableInputSource, SnapshotFrame>;
  readonly active: WeakSet<ExecutableInputSource>;
  readonly frames: SnapshotFrame[];
};

type SnapshotDataDescriptor = Omit<PropertyDescriptor, "value"> & { readonly value: unknown };
type SnapshotContainer = unknown[] | ExecutableInputRecord;
type SnapshotFrame = {
  readonly source: ExecutableInputSource;
  readonly target: SnapshotContainer;
  readonly kind: ReturnType<typeof readStableInputKind>;
  readonly reflectedKeys: readonly PropertyKey[];
  readonly keys: readonly string[];
  readonly sourceDescriptors: Map<string, SnapshotDataDescriptor>;
  readonly parent: { readonly frame: SnapshotFrame; readonly key: string } | undefined;
  index: number;
};

type SnapshotStart =
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "frame"; readonly frame: SnapshotFrame };

const snapshotPending = Symbol("snapshot pending");
const invalidExecutableInput = () => {
  throw new TypeError("Operation params must be a stable executable input");
};

const readInputReflection = <Value>(read: () => Value) => {
  // oxlint-disable-next-line anti-slop/no-raw-try-catch -- caller-controlled plan inputs must become synchronous admission failures.
  try {
    return read();
  } catch {
    return invalidExecutableInput();
  }
};

const isDenseArrayKey = (key: PropertyKey, length: number) => {
  if (key === "length") return true;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === key;
};

// RETURN_TYPE: Preserves numeric narrowing for the bounded Array.from length and array-key checks; direct inference produced TS2345, TS2769, and TS18046.
const isSafeArrayLength = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 0xffff_ffff;

const readStableInputKind = (source: ExecutableInputSource) => {
  const firstIsArray = readInputReflection(() => Array.isArray(source));
  const secondIsArray = readInputReflection(() => Array.isArray(source));
  const firstPrototype = readInputReflection(() => Object.getPrototypeOf(source));
  const secondPrototype = readInputReflection(() => Object.getPrototypeOf(source));
  if (firstIsArray !== secondIsArray || firstPrototype !== secondPrototype) {
    return invalidExecutableInput();
  }
  return { isArray: secondIsArray, prototype: secondPrototype };
};

const readStableInputKeys = (source: ExecutableInputSource) => {
  const keys = readInputReflection(() => Reflect.ownKeys(source));
  const repeatedKeys = readInputReflection(() => Reflect.ownKeys(source));
  if (!isStableKeyList(keys, repeatedKeys)) return invalidExecutableInput();
  return repeatedKeys.every(Predicate.isString) ? repeatedKeys : invalidExecutableInput();
};

const readStableInputDescriptor = (source: ExecutableInputSource, key: string) => {
  const first = readInputReflection(() => Object.getOwnPropertyDescriptor(source, key));
  if (first === undefined) return invalidExecutableInput();
  const second = readInputReflection(() => Object.getOwnPropertyDescriptor(source, key));
  if (second === undefined || !isStableDataDescriptor(first, second)) {
    return invalidExecutableInput();
  }
  return second;
};

const readArraySnapshotKeys = (
  source: ExecutableInputSource,
  reflectedKeys: readonly PropertyKey[],
  sourceDescriptors: Map<string, SnapshotDataDescriptor>,
) => {
  const lengthDescriptor = readStableInputDescriptor(source, "length");
  const length = lengthDescriptor.value;
  if (
    lengthDescriptor.enumerable ||
    lengthDescriptor.configurable ||
    !isSafeArrayLength(length) ||
    reflectedKeys.length !== length + 1 ||
    !reflectedKeys.every((key) => isDenseArrayKey(key, length))
  ) {
    return invalidExecutableInput();
  }
  const originalLength = sourceDescriptors.get("length");
  if (originalLength !== undefined && !isStableDataDescriptor(originalLength, lengthDescriptor)) {
    return invalidExecutableInput();
  }
  sourceDescriptors.set("length", lengthDescriptor);
  return Array.from({ length }, (_, index) => String(index));
};

const beginSnapshot = (value: unknown, state: SnapshotState, parent: SnapshotFrame["parent"]) => {
  if (!isExecutableInputSource(value)) return { kind: "value", value } satisfies SnapshotStart;

  const source = value;
  const kind = readStableInputKind(source);
  const isPlain = kind.isArray
    ? kind.prototype === Array.prototype
    : kind.prototype === Object.prototype || kind.prototype === null;
  if (!isPlain) return { kind: "value", value } satisfies SnapshotStart;

  if (state.active.has(source)) return invalidExecutableInput();
  const existing = state.copies.get(source);
  if (existing !== undefined) {
    return { kind: "value", value: existing.target } satisfies SnapshotStart;
  }

  const reflectedKeys = readStableInputKeys(source);
  const sourceDescriptors = new Map<string, SnapshotDataDescriptor>();
  const keys = kind.isArray
    ? readArraySnapshotKeys(source, reflectedKeys, sourceDescriptors)
    : reflectedKeys;
  // SAFETY: kind.prototype is restricted to Object.prototype/null by the plain-container admission above.
  const target: SnapshotContainer = kind.isArray ? [] : Object.create(kind.prototype);
  state.active.add(source);
  const frame: SnapshotFrame = {
    source,
    target,
    kind,
    reflectedKeys,
    keys,
    sourceDescriptors,
    parent,
    index: 0,
  };
  state.copies.set(source, frame);
  state.frames.push(frame);
  return { kind: "frame", frame } satisfies SnapshotStart;
};

const defineSnapshotProperty = (target: SnapshotContainer, key: string, value: unknown) => {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
};

const completeSnapshotFrame = (stack: SnapshotFrame[], state: SnapshotState) => {
  const frame = stack.at(-1);
  if (frame === undefined) return invalidExecutableInput();
  // SAFETY: frame.target is a newly created array or plain record whose own data properties were copied above.
  // oxlint-disable-next-line anti-slop/no-object-freeze -- executable plan params are copied into immutable containers.
  Object.freeze(frame.target);
  const result: SnapshotResult = { value: frame.target };
  state.active.delete(frame.source);
  stack.pop();
  if (frame.parent === undefined) {
    verifySnapshotFrames(state.frames);
    return result;
  }
  defineSnapshotProperty(frame.parent.frame.target, frame.parent.key, result.value);
  return snapshotPending;
};

const advanceSnapshotFrame = (stack: SnapshotFrame[], state: SnapshotState) => {
  const frame = stack.at(-1);
  if (frame === undefined) return invalidExecutableInput();
  if (frame.index === frame.keys.length) return completeSnapshotFrame(stack, state);

  const key = frame.keys[frame.index];
  if (key === undefined) return invalidExecutableInput();
  frame.index += 1;
  const descriptor = readStableInputDescriptor(frame.source, key);
  if (!descriptor.enumerable) return invalidExecutableInput();
  frame.sourceDescriptors.set(key, descriptor);
  const child = beginSnapshot(descriptor.value, state, { frame, key });
  if (child.kind === "frame") {
    stack.push(child.frame);
    return snapshotPending;
  }
  defineSnapshotProperty(frame.target, key, child.value);
  return snapshotPending;
};

const verifySnapshotFrame = (frame: SnapshotFrame) => {
  const kind = readStableInputKind(frame.source);
  const reflectedKeys = readStableInputKeys(frame.source);
  if (
    kind.isArray !== frame.kind.isArray ||
    kind.prototype !== frame.kind.prototype ||
    !isStableKeyList(frame.reflectedKeys, reflectedKeys)
  ) {
    return invalidExecutableInput();
  }
  if (kind.isArray) {
    readArraySnapshotKeys(frame.source, reflectedKeys, frame.sourceDescriptors);
  }
  for (const key of frame.keys) {
    if (
      !isStableDataDescriptor(
        frame.sourceDescriptors.get(key) ?? invalidExecutableInput(),
        readStableInputDescriptor(frame.source, key),
      )
    ) {
      return invalidExecutableInput();
    }
  }
};

const verifySnapshotFrames = (frames: readonly SnapshotFrame[]) => {
  // Recheck every captured frame twice after all copies exist: a later sibling's
  // reflection can mutate an earlier source, so completion alone is not stable.
  for (const frame of frames) verifySnapshotFrame(frame);
  for (const frame of frames) verifySnapshotFrame(frame);
};

function snapshotExecutableInput<Value>(value: Value, state: SnapshotState): SnapshotResult<Value>;
function snapshotExecutableInput(value: unknown, state: SnapshotState) {
  const root = beginSnapshot(value, state, undefined);
  if (root.kind === "value") return { value: root.value };

  const stack: SnapshotFrame[] = [root.frame];
  while (stack.length > 0) {
    const result = advanceSnapshotFrame(stack, state);
    if (result !== snapshotPending) return result;
  }
  return invalidExecutableInput();
}

const ExecutableInputSchema = Schema.declareConstructor<unknown, unknown>()([], () => (value) => {
  // Evaluate the owner walker before constructing the Effect to preserve its synchronous TypeError boundary.
  const snapshot = snapshotExecutableInput(value, {
    copies: new WeakMap(),
    active: new WeakSet(),
    frames: [],
  });
  return Effect.succeed(snapshot.value);
});

const decodeExecutableInput = Schema.decodeUnknownSync(ExecutableInputSchema);

export function ownExecutableInput<Value>(value: Value): Value;
export function ownExecutableInput(value: unknown) {
  return decodeExecutableInput(value);
}
