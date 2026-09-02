import { Predicate, Result, Schema } from "effect";

import type {
  ContextSelector,
  DefinitionValue,
  EventPayload,
  MemoryDeclaration,
  OperationDeclaration,
  StateDeclaration,
} from "./domain.js";
import { utf8ByteLength } from "./utf8.js";

type RuntimeEventFactory = (...args: readonly DefinitionValue[]) => EventPayload;
type RecordContainer = Readonly<Record<string, unknown>>;

const contextSelectors = new WeakSet<ContextSelector>();
const stateTokens = new WeakSet<object>();

const isControlCharacter = (character: string): boolean => {
  const code = character.codePointAt(0);
  return code !== undefined && (code <= 0x1f || code === 0x7f);
};

const isAuthoredName = (value: string): value is string => {
  if (value.length === 0) return false;
  if (Result.isFailure(utf8ByteLength(value, 256))) return false;
  for (const character of value) {
    if (isControlCharacter(character)) return false;
  }
  return true;
};

const AuthoredName = Schema.String.pipe(
  Schema.refine(isAuthoredName, { message: "Expected a valid authored name" }),
);

const hasValidAuthoredKeys = <Value>(
  record: Readonly<Record<string, Value>>,
): record is Readonly<Record<string, Value>> => Object.keys(record).every(isAuthoredName);

const isRecordContainer = (value: unknown): value is RecordContainer => {
  if (!Predicate.isObject(value)) return false;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;

  return Reflect.ownKeys(value).every((key) => {
    if (!Predicate.isString(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
};

const RecordContainerSchema = Schema.declare(isRecordContainer, {
  identifier: "RecordContainer",
});

const isArrayIndex = (key: string, length: number): boolean => {
  const index = Number(key);
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < 2 ** 32 - 1 &&
    index < length &&
    String(index) === key
  );
};

const isDenseDataArray = (value: readonly unknown[]): boolean => {
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (lengthDescriptor === undefined || !("value" in lengthDescriptor)) return false;

  const length = lengthDescriptor.value;
  if (!Predicate.isNumber(length) || !Number.isInteger(length) || length < 0) return false;

  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1) return false;

  return keys.every((key) => {
    if (!Predicate.isString(key)) return false;
    if (key === "length") return true;
    if (!isArrayIndex(key, length)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
};

const isStateContainer = (value: unknown): value is object =>
  Array.isArray(value) ? isDenseDataArray(value) : isRecordContainer(value);

type PendingStateValue = {
  readonly value: unknown;
  readonly depth: number;
  readonly compoundDepth: number;
  readonly exit: boolean;
};

const hasSafeStateInput = (states: readonly unknown[]): boolean => {
  const active = new Set<object>();
  const pending: PendingStateValue[] = [{ value: states, depth: 0, compoundDepth: 0, exit: false }];

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    if (!isStateContainer(current.value)) {
      if (Array.isArray(current.value) || Predicate.isObject(current.value)) return false;
      continue;
    }

    if (current.exit) {
      active.delete(current.value);
      continue;
    }
    if (current.depth > 32 || current.compoundDepth > 10 || active.has(current.value)) return false;

    active.add(current.value);
    pending.push({ ...current, exit: true });

    const compoundDepth = Array.isArray(current.value)
      ? current.compoundDepth
      : current.compoundDepth + 1;
    for (const key of Reflect.ownKeys(current.value).reverse()) {
      if (Array.isArray(current.value) && key === "length") continue;
      const descriptor = Object.getOwnPropertyDescriptor(current.value, key);
      if (!Predicate.isString(key) || descriptor === undefined || !("value" in descriptor)) {
        return false;
      }
      pending.push({
        value: descriptor.value,
        depth: current.depth + 1,
        compoundDepth,
        exit: false,
      });
    }
  }

  return true;
};

const StateDeclarationSchema: Schema.Codec<StateDeclaration> = Schema.suspend(() =>
  Schema.Union([AuthoredName, Schema.Record(AuthoredName, Schema.Array(StateDeclarationSchema))]),
);

type StateCheck = { readonly valid: false } | { readonly valid: true; readonly name: string };

const checkState = (state: StateDeclaration, depth: number): StateCheck => {
  if (Predicate.isString(state)) return { valid: true, name: state };

  const entries = Object.entries(state);
  if (entries.length !== 1 || depth >= 10) return { valid: false };

  const entry = entries[0];
  if (entry === undefined) return { valid: false };

  const [name, children] = entry;
  return hasValidStateLevel(children, depth + 1) ? { valid: true, name } : { valid: false };
};

const hasValidStateLevel = (states: readonly StateDeclaration[], depth: number): boolean => {
  if (states.length === 0) return false;

  const names = new Set<string>();
  for (const state of states) {
    const check = checkState(state, depth);
    if (!check.valid || names.has(check.name)) return false;
    names.add(check.name);
  }
  return true;
};

const hasValidStateTree = (states: readonly StateDeclaration[]): boolean =>
  hasValidStateLevel(states, 0);

const States = Schema.Array(StateDeclarationSchema).pipe(
  Schema.refine((states): states is readonly StateDeclaration[] => hasValidStateTree(states), {
    message: "Expected non-empty, unique state declarations with at most ten compound levels",
  }),
);

export const isSafeStateInput = (value: unknown): boolean =>
  !Array.isArray(value) || hasSafeStateInput(value);

const isRuntimeEventFactory = (value: unknown): value is RuntimeEventFactory =>
  Predicate.isFunction(value);

const EventDeclaration = Schema.Union([
  Schema.Literal("bare"),
  Schema.declare(isRuntimeEventFactory, { identifier: "EventFactory" }),
]);

const Events = Schema.Record(Schema.String, EventDeclaration).pipe(
  Schema.refine(hasValidAuthoredKeys, { message: "Expected valid authored event names" }),
);

const DecodedEvents = Schema.decodeTo(Events)(RecordContainerSchema);

const isContextSelectorRecord = (value: unknown): value is ContextSelector => {
  if (!Predicate.isObject(value) || value.kind !== "context-selector") return false;
  const provider = value.provider;
  return (
    Predicate.isObject(provider) &&
    Predicate.isString(provider.id) &&
    Predicate.isFunction(value.selector)
  );
};

const isContextSelector = (value: unknown): value is ContextSelector =>
  isContextSelectorRecord(value) && contextSelectors.has(value);

const ContextSelectorSchema = Schema.declare(isContextSelector, {
  identifier: "ContextSelector",
});

const Context = Schema.Record(Schema.String, ContextSelectorSchema).pipe(
  Schema.refine(hasValidAuthoredKeys, { message: "Expected valid authored context names" }),
);

const isOperationDeclaration = (value: unknown): value is OperationDeclaration => {
  if (!Predicate.isObject(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;

  const kind = Object.getOwnPropertyDescriptor(value, "kind");
  if (
    kind === undefined ||
    !kind.enumerable ||
    !("value" in kind) ||
    !Predicate.isString(kind.value)
  )
    return false;

  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
  });
};

const OperationDeclarationSchema = Schema.declare(isOperationDeclaration, {
  identifier: "OperationDeclaration",
});

const Operations = Schema.Record(Schema.String, OperationDeclarationSchema).pipe(
  Schema.refine(hasValidAuthoredKeys, { message: "Expected valid authored operation names" }),
);

const DecodedOperations = Schema.decodeTo(Operations)(RecordContainerSchema);

const MAX_DEFINITION_VALUE_DEPTH = 32;

const isEventPayload = (
  value: unknown,
  active: Set<object>,
  depth: number,
): value is EventPayload => {
  if (
    depth > MAX_DEFINITION_VALUE_DEPTH ||
    !isRecordContainer(value) ||
    Object.hasOwn(value, "type") ||
    active.has(value)
  )
    return false;
  active.add(value);
  const valid = Reflect.ownKeys(value).every((key) => {
    if (!Predicate.isString(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      descriptor !== undefined &&
      "value" in descriptor &&
      isDefinitionValue(descriptor.value, active, depth + 1)
    );
  });
  active.delete(value);
  return valid;
};

const isDefinitionValue = (
  value: unknown,
  active = new Set<object>(),
  depth = 0,
): value is DefinitionValue => {
  if (
    value === null ||
    Predicate.isBigInt(value) ||
    Predicate.isBoolean(value) ||
    Predicate.isNumber(value) ||
    Predicate.isString(value) ||
    Predicate.isSymbol(value) ||
    value === undefined ||
    Predicate.isFunction(value)
  )
    return true;
  if (depth > MAX_DEFINITION_VALUE_DEPTH) return false;
  if (Array.isArray(value)) {
    if (active.has(value) || !isDenseDataArray(value)) return false;
    active.add(value);
    const valid = Reflect.ownKeys(value).every((key) => {
      if (key === "length") return true;
      if (!Predicate.isString(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return (
        descriptor !== undefined &&
        "value" in descriptor &&
        isDefinitionValue(descriptor.value, active, depth + 1)
      );
    });
    active.delete(value);
    return valid;
  }
  if (!Predicate.isObject(value)) return false;
  if (stateTokens.has(value) || isOperationDeclaration(value)) return true;
  return isEventPayload(value, active, depth);
};

const isMemoryDeclaration = (value: unknown): value is MemoryDeclaration =>
  Predicate.isFunction(value);

const DefinitionSchema = Schema.Struct({
  id: AuthoredName,
  states: States,
  events: DecodedEvents,
  context: Schema.optional(Schema.decodeTo(Context)(RecordContainerSchema)),
  operations: Schema.optional(DecodedOperations),
  memory: Schema.optional(Schema.declare(isMemoryDeclaration, { identifier: "MemoryInitializer" })),
});

export type DecodedDefinitionConfig = typeof DefinitionSchema.Type;

export const decodeDefinitionConfigResult = Schema.decodeUnknownResult(DefinitionSchema, {
  onExcessProperty: "error",
});

const EventPayloadSchema = Schema.declare(
  (value: unknown): value is EventPayload => isEventPayload(value, new Set(), 0),
  { identifier: "EventPayload" },
);

export const decodeEventPayloadResult = Schema.decodeUnknownResult(EventPayloadSchema);

export const registerStateToken = <Token extends object>(token: Token): Token => {
  stateTokens.add(token);
  return token;
};

export const registerContextSelector = <Selector extends ContextSelector>(
  selector: Selector,
): Selector => {
  contextSelectors.add(selector);
  return selector;
};
