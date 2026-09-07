import { Predicate, Schema } from "effect";

import type {
  ContextSelector,
  DefinitionValue,
  EventPayload,
  MemoryDeclaration,
  StateDeclaration,
  StateToken,
} from "./domain.js";
import { AuthoredName, isAuthoredName } from "../internal/authored-name.js";
import { isConstructedOperation } from "../operation/operation.js";

type RuntimeEventFactory = (...args: readonly DefinitionValue[]) => EventPayload;

type DefinitionFunction = Extract<DefinitionValue, (...args: readonly never[]) => DefinitionValue>;

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Schema admits unknown children before recursive validation promotes them.
type PlainRecord = Readonly<Record<string, unknown>>;

const contextSelectors = new WeakSet();
const stateTokens = new WeakSet();

// Common boundary predicates.

// RETURN_TYPE: Preserves generic record narrowing required by Schema.refine's authored-key validation.
const hasValidAuthoredKeys = <Value>(
  record: Readonly<Record<string, Value>>,
): record is Readonly<Record<string, Value>> => Object.keys(record).every(isAuthoredName);

// RETURN_TYPE: Preserves PlainRecord narrowing at the unknown-input Schema.declare boundary.
const isPlainRecord = (value: unknown): value is PlainRecord => {
  if (!Predicate.isObject(value) || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Reflect.ownKeys(value).every((key) => {
      if (!Predicate.isString(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && descriptor.enumerable && "value" in descriptor;
    })
  );
};

const PlainRecordSchema: Schema.ConstraintCodec<PlainRecord> = Schema.declare(isPlainRecord, {
  identifier: "PlainRecord",
});

// State grammar and level semantics.

const StateDeclarationSchema: Schema.ConstraintCodec<StateDeclaration> = Schema.suspend(() =>
  Schema.Union([AuthoredName, Schema.Record(AuthoredName, Schema.Array(StateDeclarationSchema))]),
);

type StateCheck = { readonly valid: false } | { readonly valid: true; readonly name: string };

// RETURN_TYPE: Preserves StateCheck's discriminated valid narrowing before accessing name.
const checkState = (state: StateDeclaration, depth: number): StateCheck => {
  if (Predicate.isString(state)) return { valid: true, name: state };

  const entries = Object.entries(state);
  if (entries.length !== 1 || depth >= 10) return { valid: false };

  const entry = entries[0];
  if (entry === undefined) return { valid: false };

  const [name, children] = entry;
  return hasValidStateLevel(children, depth + 1) ? { valid: true, name } : { valid: false };
};

const hasValidStateLevel = (states: readonly StateDeclaration[], depth: number) => {
  if (states.length === 0) return false;

  const names = new Set<string>();
  for (const state of states) {
    const check = checkState(state, depth);
    if (!check.valid || names.has(check.name)) return false;
    names.add(check.name);
  }
  return true;
};

const States = Schema.Array(StateDeclarationSchema).pipe(
  Schema.refine(
    // RETURN_TYPE: Preserves readonly StateDeclaration[] narrowing for the refinement.
    (states): states is readonly StateDeclaration[] => hasValidStateLevel(states, 0),
    {
      message: "Expected non-empty, unique state declarations with at most ten compound levels",
    },
  ),
);

// Event, context, and operation records.

const EventDeclaration = Schema.Union([
  Schema.Literal("bare"),
  Schema.declare(
    // RETURN_TYPE: Preserves RuntimeEventFactory narrowing for EventDeclaration's Schema.declare branch.
    (value: unknown): value is RuntimeEventFactory => Predicate.isFunction(value),
    { identifier: "EventFactory" },
  ),
]);

const Events = Schema.Record(Schema.String, EventDeclaration).pipe(
  Schema.refine(hasValidAuthoredKeys, { message: "Expected valid authored event names" }),
);

const decodePlainRecord = <Value extends Schema.Constraint>(schema: Value) =>
  Schema.decodeTo(schema)(PlainRecordSchema);

const DecodedEvents = decodePlainRecord(Events);

// RETURN_TYPE: Preserves ContextSelector narrowing for the registered-selector Schema.declare boundary.
const isContextSelector = (value: unknown): value is ContextSelector =>
  Predicate.isObject(value) && contextSelectors.has(value);

const ContextSelectorSchema = Schema.declare(isContextSelector, {
  identifier: "ContextSelector",
});

const Context = Schema.Record(Schema.String, ContextSelectorSchema).pipe(
  Schema.refine(hasValidAuthoredKeys, { message: "Expected valid authored context names" }),
);

const OperationDeclarationSchema = Schema.declare(isConstructedOperation, {
  identifier: "OperationDeclaration",
});

const Operations = Schema.Record(Schema.String, OperationDeclarationSchema).pipe(
  Schema.refine(hasValidAuthoredKeys, { message: "Expected valid authored operation names" }),
);

const DecodedOperations = decodePlainRecord(Operations);

// Recursive values and payloads.

const DefinitionFunctionSchema = Schema.declare(
  // RETURN_TYPE: Preserves DefinitionFunction narrowing in the recursive DefinitionValue schema union.
  (value: unknown): value is DefinitionFunction => Predicate.isFunction(value),
  { identifier: "DefinitionFunction" },
);

const StateTokenSchema = Schema.declare(
  // RETURN_TYPE: Preserves StateToken<string, string, string> narrowing in the recursive DefinitionValue schema union.
  (value: unknown): value is StateToken<string, string, string> =>
    Predicate.isObject(value) && stateTokens.has(value),
  { identifier: "StateToken" },
);

const DefinitionValueSchema: Schema.ConstraintCodec<DefinitionValue, unknown> = Schema.suspend(() =>
  Schema.Union([
    Schema.BigInt,
    Schema.Boolean,
    Schema.Null,
    Schema.Number,
    Schema.String,
    Schema.Symbol,
    Schema.Undefined,
    DefinitionFunctionSchema,
    StateTokenSchema,
    OperationDeclarationSchema,
    ContextSelectorSchema,
    Schema.Array(DefinitionValueSchema),
    DefinitionRecordSchema,
  ]),
);

const DefinitionRecordSchema: Schema.ConstraintCodec<
  Readonly<Record<string, DefinitionValue>>,
  PlainRecord
> = decodePlainRecord(Schema.Record(Schema.String, DefinitionValueSchema));

const EventPayloadSchema: Schema.ConstraintCodec<EventPayload, PlainRecord> = Schema.refine<
  typeof DefinitionRecordSchema,
  EventPayload
>(
  // RETURN_TYPE: Preserves EventPayload narrowing after rejecting the reserved type field.
  (value): value is EventPayload => !Object.hasOwn(value, "type"),
  {
    message: "Expected an event payload without a reserved type field",
  },
)(DefinitionRecordSchema);

// Complete configuration and exported decoders.

const DefinitionSchema = Schema.Struct({
  id: AuthoredName,
  states: States,
  events: DecodedEvents,
  context: Schema.optional(decodePlainRecord(Context)),
  operations: Schema.optional(DecodedOperations),
  memory: Schema.optional(
    Schema.declare(
      // RETURN_TYPE: Preserves MemoryDeclaration narrowing for the optional DefinitionSchema initializer.
      (value: unknown): value is MemoryDeclaration => Predicate.isFunction(value),
      { identifier: "MemoryInitializer" },
    ),
  ),
});

export type DecodedDefinitionConfig = typeof DefinitionSchema.Type;

export const decodeDefinitionConfigResult = Schema.decodeUnknownResult(DefinitionSchema, {
  onExcessProperty: "error",
});

export const decodeEventPayloadResult = Schema.decodeUnknownResult(EventPayloadSchema);

export const registerContextSelector = <Selector extends ContextSelector>(selector: Selector) => {
  contextSelectors.add(selector);
  return selector;
};

export const registerStateToken = <Token extends StateToken>(token: Token) => {
  stateTokens.add(token);
  return token;
};
