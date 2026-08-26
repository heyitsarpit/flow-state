import { Brand, Predicate } from "effect";

import type {
  AnyDefinition,
  ContextSelector,
  DefinitionIdentity,
  DefinitionValue,
  EventEnvelope,
  EventPayload,
  EventToken,
  OperationDeclarations,
  RuntimeEventTable,
  RuntimeStateBranch,
  RuntimeStateTable,
  SelectorInput,
  StateDeclaration,
  StateToken,
} from "./domain.js";
import { decodeDefinitionConfig, decodeEventPayload, registerContextSelector } from "./schema.js";
import { utf8ByteLength } from "./utf8.js";

type RuntimeEventId = `E|${number}:${string}|${number}:${string}`;

type RuntimeEventEnvelope = EventEnvelope<RuntimeEventId>;

type RuntimeEventToken = EventToken<string, string, readonly DefinitionValue[]>;

type RuntimeStateEntry = readonly [string, StateToken | RuntimeStateBranch];

const makeDefinition = Brand.nominal<AnyDefinition>();

const makeStateToken = Brand.nominal<StateToken>();

const makeEventToken = Brand.nominal<RuntimeEventToken>();

const makeEventEnvelope = Brand.nominal<RuntimeEventEnvelope>();

const encodeSegment = (value: string): `${number}:${string}` => {
  const byteLength = utf8ByteLength(value, Number.POSITIVE_INFINITY);
  if (byteLength._tag === "Failure") throw new Error("Validated name became invalid");
  return `${byteLength.success}:${value}`;
};

const stateIdentifier = (definitionId: string, path: string) =>
  `S|${encodeSegment(definitionId)}|${encodeSegment(path)}` as const;

const eventIdentifier = (definitionId: string, name: string) =>
  `E|${encodeSegment(definitionId)}|${encodeSegment(name)}` as const;

const statePath = (parentPath: string, name: string): string =>
  parentPath === "" ? `S.${name}` : `${parentPath}.S.${name}`;

const compoundEntry = (
  declaration: Exclude<StateDeclaration, string>,
): readonly [string, readonly StateDeclaration[]] => {
  const entry = Object.entries(declaration)[0];
  if (entry === undefined) throw new Error("Validated compound state became empty");
  return entry;
};

const buildStateTable = (
  declarations: readonly StateDeclaration[],
  definitionId: string,
  parentPath: string,
): RuntimeStateTable => {
  const entries: RuntimeStateEntry[] = [];

  for (const declaration of declarations) {
    if (Predicate.isString(declaration)) {
      const path = statePath(parentPath, declaration);
      entries.push([
        declaration,
        makeStateToken({ kind: "state", name: path, id: stateIdentifier(definitionId, path) }),
      ]);
      continue;
    }

    const [name, children] = compoundEntry(declaration);
    entries.push([
      name,
      { S: buildStateTable(children, definitionId, statePath(parentPath, name)) },
    ]);
  }

  return Object.fromEntries(entries);
};

const createEventToken = (
  name: string,
  declaration: (...args: readonly DefinitionValue[]) => EventPayload,
  definitionId: string,
): RuntimeEventToken => {
  const id = eventIdentifier(definitionId, name);
  const constructors = {
    [name](...args: readonly DefinitionValue[]): RuntimeEventEnvelope {
      const authoredPayload = declaration(...args);
      const payload = decodeEventPayload(authoredPayload);
      return makeEventEnvelope({ ...payload, type: id });
    },
  };
  const eventConstructor = constructors[name];
  if (eventConstructor === undefined) throw new Error("Validated event became unavailable");

  return makeEventToken(Object.assign(eventConstructor, { kind: "event" as const, id }));
};

const buildEventTable = (
  events: ReturnType<typeof decodeDefinitionConfig>["events"],
  definitionId: string,
): RuntimeEventTable =>
  Object.fromEntries(
    Object.entries(events).map(([name, declaration]) => {
      const factory = declaration === null ? () => ({}) : declaration;
      return [name, createEventToken(name, factory, definitionId)];
    }),
  );

const copyOperations = (
  operations: ReturnType<typeof decodeDefinitionConfig>["operations"],
): OperationDeclarations =>
  operations === undefined
    ? {}
    : Object.fromEntries(
        Object.entries(operations).map(([name, declaration]) => [name, { ...declaration }]),
      );

const createContextSelector = <
  Provider extends DefinitionIdentity,
  const Value extends DefinitionValue,
>(
  provider: Provider,
  selector: (input: SelectorInput<Provider>) => Value,
): ContextSelector<Value, Provider> =>
  registerContextSelector(
    Brand.nominal<ContextSelector<Value, Provider>>()({
      kind: "context-selector",
      provider,
      selector,
    }),
  );

export const createDefinitionRuntime = (input: DefinitionValue): AnyDefinition => {
  const config = decodeDefinitionConfig(input);
  const select = <const Value extends DefinitionValue>(
    selector: (selectorInput: SelectorInput<AnyDefinition>) => Value,
  ): ContextSelector<Value, AnyDefinition> => createContextSelector(result, selector);

  const result = makeDefinition({
    id: config.id,
    states: config.states,
    S: buildStateTable(config.states, config.id, ""),
    E: buildEventTable(config.events, config.id),
    context: config.context ?? {},
    operations: copyOperations(config.operations),
    memory: config.memory,
    select,
  });
  return result;
};
