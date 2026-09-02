export type CanonicalKeyInput =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalKeyInput[]
  | { readonly [key: string]: CanonicalKeyInput };

export type OperationKey = readonly CanonicalKeyInput[];

type CanonicalRecord = Readonly<Record<string, CanonicalKeyInput>>;
type DataPropertyDescriptor = PropertyDescriptor & { readonly value: unknown };

const MAX_DEPTH = 16;
const MAX_NODES = 256;
const MAX_BYTES = 8192;

type CanonicalizationContext = {
  nodes: number;
  readonly seen: WeakSet<object>;
};

const invalidKey = (path: readonly (string | number)[]): never => {
  const location =
    path.length === 0 ? "$" : `$${path.map((segment) => `[${String(segment)}]`).join("")}`;
  throw new TypeError(`Invalid canonical operation key at ${location}`);
};

const compareKeys = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;

const isDataProperty = (descriptor: PropertyDescriptor): descriptor is DataPropertyDescriptor =>
  "value" in descriptor;

const isEnumerableDataProperty = (descriptor: PropertyDescriptor): descriptor is DataPropertyDescriptor =>
  isDataProperty(descriptor) && descriptor.enumerable === true;

const arrayLength = (value: readonly unknown[], path: readonly (string | number)[]): number => {
  const descriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (descriptor === undefined || !isDataProperty(descriptor)) invalidKey(path);

  const length = descriptor.value;
  if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0) invalidKey(path);
  return length;
};

const hasDenseArrayKeys = (value: readonly unknown[], length: number): boolean => {
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== length + 1 || !ownKeys.includes("length")) return false;
  return ownKeys.every(
    (key) => typeof key === "string" && (key === "length" || /^\d+$/u.test(key)),
  );
};

function canonicalizeValue(
  value: unknown,
  path: readonly (string | number)[],
  depth: number,
  context: CanonicalizationContext,
): CanonicalKeyInput {
  if (depth > MAX_DEPTH) invalidKey(path);

  context.nodes += 1;
  if (context.nodes > MAX_NODES) invalidKey(path);

  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalidKey(path);
    return Object.is(value, -0) ? 0 : value;
  }
  if (!isObject(value)) invalidKey(path);
  if (context.seen.has(value)) invalidKey(path);
  context.seen.add(value);

  let copy: CanonicalKeyInput;
  if (Array.isArray(value)) {
    copy = canonicalizeArray(value, path, depth, context);
  } else {
    copy = canonicalizeRecord(value, path, depth, context);
  }

  context.seen.delete(value);
  return copy;
}

function canonicalizeArray(
  value: readonly unknown[],
  path: readonly (string | number)[],
  depth: number,
  context: CanonicalizationContext,
): CanonicalKeyInput {
  const length = arrayLength(value, path);
  if (!hasDenseArrayKeys(value, length)) invalidKey(path);

  const array: CanonicalKeyInput[] = [];
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !isEnumerableDataProperty(descriptor)) invalidKey([...path, index]);
    array.push(canonicalizeValue(descriptor.value, [...path, index], depth + 1, context));
  }
  return Object.freeze(array);
}

function canonicalizeRecord(
  value: object,
  path: readonly (string | number)[],
  depth: number,
  context: CanonicalizationContext,
): CanonicalKeyInput {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalidKey(path);

  const ownKeys = Reflect.ownKeys(value);
  const keys = ownKeys.filter(Predicate.isString);
  if (keys.length !== ownKeys.length) invalidKey(path);
  keys.sort(compareKeys);

  const record: Record<string, CanonicalKeyInput> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !isEnumerableDataProperty(descriptor)) invalidKey([...path, key]);
    Object.defineProperty(record, key, {
      configurable: true,
      enumerable: true,
      value: canonicalizeValue(descriptor.value, [...path, key], depth + 1, context),
      writable: true,
    });
  }
  return Object.freeze(record);
}

const canonicalText = (value: CanonicalKeyInput): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalText).join(",")}]`;
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  return `{${Object.entries(value)
    .sort(([left], [right]) => compareKeys(left, right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalText(child)}`)
    .join(",")}}`;
};

export function canonicalizeKey<K extends OperationKey>(value: K): K;
export function canonicalizeKey(value: OperationKey): OperationKey {
  if (!Array.isArray(value)) invalidKey([]);
  const context: CanonicalizationContext = {
    nodes: 0,
    seen: new WeakSet<object>(),
  };
  const copy = canonicalizeArray(value, [], 0, context);
  if (new TextEncoder().encode(canonicalText(copy)).byteLength > MAX_BYTES) invalidKey([]);
  return copy;
}
