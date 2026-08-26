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

const contextSelectors = new WeakSet<object>();

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

const isRuntimeEventFactory = (value: unknown): value is RuntimeEventFactory =>
  Predicate.isFunction(value);

const EventDeclaration = Schema.Union([
  Schema.Null,
  Schema.declare(isRuntimeEventFactory, { identifier: "EventFactory" }),
]);

const Events = Schema.Record(Schema.String, EventDeclaration).pipe(
  Schema.refine(hasValidAuthoredKeys, { message: "Expected valid authored event names" }),
);

const isContextSelector = (value: unknown): value is ContextSelector =>
  Predicate.isObject(value) && contextSelectors.has(value);

const ContextSelectorSchema = Schema.declare(isContextSelector, {
  identifier: "ContextSelector",
});

const Context = Schema.Record(Schema.String, ContextSelectorSchema).pipe(
  Schema.refine(hasValidAuthoredKeys, { message: "Expected valid authored context names" }),
);

const isOperationDeclaration = (value: unknown): value is OperationDeclaration =>
  Predicate.isObject(value) && "kind" in value && Predicate.isString(value.kind);

const OperationDeclarationSchema = Schema.declare(isOperationDeclaration, {
  identifier: "OperationDeclaration",
});

const Operations = Schema.Record(Schema.String, OperationDeclarationSchema).pipe(
  Schema.refine(hasValidAuthoredKeys, { message: "Expected valid authored operation names" }),
);

const isMemoryDeclaration = (value: unknown): value is MemoryDeclaration =>
  Predicate.isFunction(value);

const DefinitionSchema = Schema.Struct({
  id: AuthoredName,
  states: States,
  events: Events,
  context: Schema.optional(Context),
  operations: Schema.optional(Operations),
  memory: Schema.optional(Schema.declare(isMemoryDeclaration, { identifier: "MemoryInitializer" })),
});

export type DecodedDefinitionConfig = typeof DefinitionSchema.Type;

export const decodeDefinitionConfig = Schema.decodeUnknownSync(DefinitionSchema, {
  onExcessProperty: "error",
});

const isEventPayload = (value: unknown): value is EventPayload => {
  if (!Predicate.isObject(value)) return false;

  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null) && !Object.hasOwn(value, "type");
};

export const decodeEventPayload = Schema.decodeUnknownSync(
  Schema.declare(isEventPayload, { identifier: "EventPayload" }),
);

export const registerContextSelector = <Selector extends ContextSelector>(
  selector: Selector,
): Selector => {
  contextSelectors.add(selector);
  return selector;
};
