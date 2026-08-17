import { encodeSegment, validateAuthoredId } from "./canonical.js";
import {
  EventTypeId,
  freezeArray,
  freezeRecord,
  InputTypeId,
  MemoryTypeId,
  StateTypeId,
  type TupleOnly,
  TypeId,
} from "./internal.js";
import { usageError } from "./usage-error.js";

type EventPayload = Readonly<Record<string, unknown>>;
type EventDeclaration = ((...args: readonly never[]) => EventPayload) | null;
type EventDeclarations = Readonly<Record<string, EventDeclaration>>;

export type StateToken<
  DefinitionId extends string = string,
  Name extends string = string,
> = Readonly<{
  kind: "state";
  name: Name;
  id: `S|${number}:${DefinitionId}|${number}:${Name}`;
  readonly [TypeId]: "StateToken";
}>;

export type EventEnvelope<Id extends string, Payload extends EventPayload> = Readonly<
  { type: Id } & Payload
>;

export type EventToken<
  DefinitionId extends string = string,
  Name extends string = string,
  Args extends readonly unknown[] = readonly unknown[],
  Payload extends EventPayload = EventPayload,
> = ((...args: Args) => EventEnvelope<`E|${number}:${DefinitionId}|${number}:${Name}`, Payload>) &
  Readonly<{
    kind: "event";
    name: Name;
    id: `E|${number}:${DefinitionId}|${number}:${Name}`;
    readonly [TypeId]: "EventToken";
  }>;

type PayloadOf<Declaration> = Declaration extends (...args: readonly never[]) => infer Payload
  ? Payload extends EventPayload
    ? Payload
    : never
  : {};

type ArgsOf<Declaration> = Declaration extends (...args: infer Args) => EventPayload
  ? Readonly<Args>
  : readonly [];

type StateMap<Id extends string, States extends readonly string[]> = Readonly<{
  [Name in States[number]]: StateToken<Id, Name>;
}>;

type EventMap<Id extends string, Events extends EventDeclarations> = Readonly<{
  [Name in keyof Events & string]: EventToken<
    Id,
    Name,
    ArgsOf<Events[Name]>,
    PayloadOf<Events[Name]>
  >;
}>;

export interface Definition<
  Id extends string = string,
  States extends readonly string[] = readonly string[],
  Events extends EventDeclarations = EventDeclarations,
  Input = void,
  Memory extends object = Readonly<Record<never, never>>,
> {
  readonly id: Id;
  readonly states: States;
  readonly S: StateMap<Id, States>;
  readonly E: EventMap<Id, Events>;
  readonly memory: ((options: { readonly input: Input }) => Memory) | undefined;
  readonly [TypeId]: "Definition";
  readonly [InputTypeId]: (_: never) => Input;
  readonly [MemoryTypeId]: (_: never) => Memory;
  readonly [StateTypeId]: (_: never) => StateMap<Id, States>[States[number]];
  readonly [EventTypeId]: (_: never) => ReturnType<EventMap<Id, Events>[keyof Events & string]>;
}

export interface AnyDefinition {
  readonly id: string;
  readonly states: readonly string[];
  readonly S: Readonly<Record<string, StateToken<string, string>>>;
  readonly E: Readonly<Record<string, EventToken<string, string, readonly never[], EventPayload>>>;
  readonly memory: ((options: never) => object) | undefined;
  readonly [TypeId]: "Definition";
  readonly [InputTypeId]: (_: never) => unknown;
  readonly [MemoryTypeId]: (_: never) => object;
  readonly [StateTypeId]: (_: never) => StateToken;
  readonly [EventTypeId]: (_: never) => EventEnvelope<string, EventPayload>;
}

type DefinitionBase<
  Id extends string,
  States extends readonly string[],
  Events extends EventDeclarations,
> = Readonly<{ id: Id; states: States & TupleOnly<States>; events: Events }>;

export function definition<
  const Id extends string,
  const States extends readonly string[],
  const Events extends EventDeclarations,
>(
  config: DefinitionBase<Id, States, Events> & { readonly memory?: never },
): Definition<Id, States, Events>;

export function definition<
  const Id extends string,
  const States extends readonly string[],
  const Events extends EventDeclarations,
  const Memory extends object,
>(
  config: DefinitionBase<Id, States, Events> & { readonly memory: () => Memory },
): Definition<Id, States, Events, void, Readonly<Memory>>;

export function definition<
  const Id extends string,
  const States extends readonly string[],
  const Events extends EventDeclarations,
  Input,
  const Memory extends object,
>(
  config: DefinitionBase<Id, States, Events> & {
    readonly memory: (options: { readonly input: Input }) => Memory;
  },
): Definition<Id, States, Events, Input, Readonly<Memory>>;

export function definition(
  config: Readonly<{
    id: string;
    states: readonly string[];
    events: Readonly<Record<string, ((...args: readonly unknown[]) => EventPayload) | null>>;
    memory?: (options: { readonly input: unknown }) => object;
  }>,
): Definition<string, readonly string[], EventDeclarations, unknown, object> {
  const id = validateAuthoredId(config.id, "definition");
  for (const key of Object.keys(config))
    if (!new Set(["id", "states", "events", "memory"]).has(key))
      usageError("InvalidDefinition", "definition", { id, key });
  if (!Array.isArray(config.states) || config.states.length === 0)
    usageError("InvalidDefinition", "definition", { id, reason: "states" });
  const stateEntries: Array<readonly [string, StateToken]> = [];
  const seenStates = new Set<string>();
  for (const nameValue of config.states) {
    const name = validateAuthoredId(nameValue, "definition.state");
    if (seenStates.has(name))
      usageError("InvalidDefinition", "definition", { id, name, reason: "duplicate-state" });
    seenStates.add(name);
    const stateToken = {
      kind: "state" as const,
      name,
      id: `S|${encodeSegment(id)}|${encodeSegment(name)}`,
    };
    Object.defineProperty(stateToken, TypeId, { value: "StateToken" });
    const token = freezeRecord(stateToken) as StateToken;
    stateEntries.push([name, token]);
  }

  const eventEntries: Array<readonly [string, EventToken]> = [];
  for (const [nameValue, declaration] of Object.entries(config.events)) {
    const name = validateAuthoredId(nameValue, "definition.event");
    if (declaration !== null && typeof declaration !== "function")
      usageError("InvalidDefinition", "definition", { id, name, reason: "event-constructor" });
    const eventId = `E|${encodeSegment(id)}|${encodeSegment(name)}`;
    const token = (...args: readonly unknown[]): EventEnvelope<string, EventPayload> => {
      const payload = declaration === null ? {} : declaration(...args);
      if (payload === null || typeof payload !== "object" || Array.isArray(payload))
        usageError("InvalidDefinition", "definition.event", {
          id,
          name,
          reason: "event-payload",
        });
      const prototype = Object.getPrototypeOf(payload);
      if (prototype !== Object.prototype && prototype !== null)
        usageError("InvalidDefinition", "definition.event", {
          id,
          name,
          reason: "event-payload-prototype",
        });
      if (Object.hasOwn(payload, "type"))
        usageError("InvalidDefinition", "definition.event", {
          id,
          name,
          reason: "event-payload-type",
        });
      return Object.freeze({ type: eventId, ...payload });
    };
    Object.defineProperties(token, {
      kind: { value: "event", enumerable: true },
      name: { value: name, enumerable: true },
      id: { value: eventId, enumerable: true },
      [TypeId]: { value: "EventToken", enumerable: false },
    });
    eventEntries.push([name, Object.freeze(token) as EventToken]);
  }

  const typeBrand = (_: never): never => {
    throw new Error("Flow type brands are not executable");
  };
  const result = {
    id,
    states: freezeArray(config.states),
    S: freezeRecord(Object.fromEntries(stateEntries)),
    E: freezeRecord(Object.fromEntries(eventEntries)),
    memory: config.memory,
    [TypeId]: "Definition" as const,
    [InputTypeId]: typeBrand,
    [MemoryTypeId]: typeBrand,
    [StateTypeId]: typeBrand,
    [EventTypeId]: typeBrand,
  };
  return Object.freeze(result) as Definition<
    string,
    readonly string[],
    EventDeclarations,
    unknown,
    object
  >;
}
