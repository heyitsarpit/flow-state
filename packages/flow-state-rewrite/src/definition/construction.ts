import { Brand, Predicate, Record, Result } from "effect";

import type {
  AnyDefinition,
  ContextSelector,
  DefinitionIdentity,
  DefinitionValue,
  EventEnvelope,
  EventPayload,
  EventToken,
  RuntimeStateBranch,
  SelectorInput,
  StateDeclaration,
  StateToken,
} from "./domain.js";
import {
  decodeDefinitionConfigResult,
  decodeEventPayloadResult,
  registerContextSelector,
  registerStateToken,
} from "./schema.js";
import type { DecodedDefinitionConfig } from "./schema.js";
import { utf8EncodedByteLength } from "../internal/utf8.js";
import * as Diagnostic from "../diagnostic/diagnostic.js";

/*
 * Definition construction:
 *
 * Identity encoding:
 *   segment, stateName, stateIdentity
 *
 * Token construction:
 *   buildStateTable, createEventToken, buildEventTable
 *
 * Selector construction:
 *   createContextSelector
 *
 * Publication:
 *   constructDefinition
 *
 * Assembly:
 *   constructDefinitionResult
 */
type RuntimeEventId = `E|${number}:${string}|${number}:${string}`;

type RuntimeEventEnvelope = EventEnvelope<RuntimeEventId>;

type RuntimeEventToken = EventToken;

type RuntimeStateToken = StateToken;

type RuntimeStateEntry = readonly [string, RuntimeStateToken | RuntimeStateBranch];

type StatePath = readonly string[];

const makeDefinition = Brand.nominal<AnyDefinition>();

const makeStateToken = Brand.nominal<StateToken>();

const makeEventToken = Brand.nominal<RuntimeEventToken>();

const makeEventEnvelope = Brand.nominal<RuntimeEventEnvelope>();

const admissionDefect = (defect: unknown) =>
  defect instanceof Diagnostic.Diagnostic ? defect : Diagnostic.Defect(defect);

const tryDefinition = <Value>(make: () => Result.Result<Value, Diagnostic.PublicDiagnostic>) =>
  Result.try({ try: make, catch: admissionDefect }).pipe(Result.flatMap((result) => result));

// RETURN_TYPE: Preserves the `${number}:${string}` identity segment required by state and event IDs.
const segment = (value: string): `${number}:${string}` =>
  `${utf8EncodedByteLength(value)}:${value}`;

const stateName = (path: StatePath) => `S.${path.join(".S.")}`;

const stateIdentity = (path: StatePath) =>
  path.every((part) => !/[.[\]]/u.test(part) && part !== "S")
    ? stateName(path)
    : path.map(segment).join("|");

const buildStateTable = (
  declarations: readonly StateDeclaration[],
  definitionId: string,
  parentPath: StatePath,
) => {
  const entries: RuntimeStateEntry[] = [];

  for (const declaration of declarations) {
    if (Predicate.isString(declaration)) {
      const path = [...parentPath, declaration];
      const id = `S|${segment(definitionId)}|${segment(stateIdentity(path))}` as const;
      const token = registerStateToken(
        makeStateToken({ kind: "state", name: stateName(path), id }),
      );
      entries.push([declaration, token]);
      continue;
    }

    for (const [name, children] of Object.entries(declaration)) {
      const nested = buildStateTable(children, definitionId, [...parentPath, name]);
      entries.push([name, { S: nested }]);
    }
  }

  return Object.fromEntries(entries);
};

const createEventToken = (
  name: string,
  declaration: (...args: readonly DefinitionValue[]) => EventPayload,
  definitionId: string,
) => {
  const id: RuntimeEventId = `E|${segment(definitionId)}|${segment(name)}`;
  const event = (...args: readonly DefinitionValue[]) => {
    const payload = declaration(...args);

    return tryDefinition(() =>
      decodeEventPayloadResult(payload).pipe(
        Result.mapError(Diagnostic.fromSchemaError),
        Result.map((payload) => makeEventEnvelope({ ...payload, type: id })),
      ),
    );
  };

  Object.defineProperty(event, "name", { value: name });
  return makeEventToken(Object.assign(event, { kind: "event" as const, id }));
};

const buildEventTable = (events: DecodedDefinitionConfig["events"], definitionId: string) =>
  Record.map(events, (declaration, name) =>
    createEventToken(name, declaration === "bare" ? () => ({}) : declaration, definitionId),
  );

const createContextSelector = <
  Provider extends DefinitionIdentity,
  const Value extends DefinitionValue,
>(
  provider: Provider,
  selector: (input: SelectorInput<Provider>) => Value,
) =>
  registerContextSelector(
    Brand.nominal<ContextSelector<Value, Provider>>()({
      kind: "context-selector",
      provider,
      selector,
    }),
  );

// RETURN_TYPE: Preserves the exact nominal Definition boundary published to the Result assembly.
const constructDefinition = (config: DecodedDefinitionConfig): AnyDefinition => {
  // State and event table construction.
  const stateTable = buildStateTable(config.states, config.id, []);
  const events = buildEventTable(config.events, config.id);

  // Provider-bound select closure.
  const select = <const Value extends DefinitionValue>(
    selector: (selectorInput: SelectorInput<AnyDefinition>) => Value,
  ) => createContextSelector(result, selector);

  // Publication.
  const result = makeDefinition({
    id: config.id,
    states: config.states,
    S: stateTable,
    E: events,
    context: config.context ?? {},
    operations: config.operations ?? {},
    memory: config.memory,
    select,
  });

  return result;
};

export const constructDefinitionResult = (input: unknown) =>
  tryDefinition(() =>
    decodeDefinitionConfigResult(input).pipe(
      Result.mapError(Diagnostic.fromSchemaError),
      Result.map(constructDefinition),
    ),
  );
