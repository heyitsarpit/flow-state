import { Brand, Cause, Predicate, Record, Result } from "effect";

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
import {
  decodeDefinitionConfigResult,
  decodeEventPayloadResult,
  isSafeStateInput,
  registerContextSelector,
  registerStateToken,
} from "./schema.js";
import type { DecodedDefinitionConfig } from "./schema.js";
import { utf8EncodedByteLength } from "./utf8.js";
import type { DefinitionMetadata, StateMetadata } from "./metadata.js";
import { registerDefinitionMetadata } from "./metadata.js";
import * as Diagnostic from "../diagnostic/diagnostic.js";
import { isConstructedOperation, markConstructedOperation } from "../operation/operation.js";

type RuntimeEventId = `E|${number}:${string}|${number}:${string}`;

type RuntimeEventEnvelope = EventEnvelope<RuntimeEventId>;

type RuntimeEventToken = EventToken<string, string, readonly DefinitionValue[]>;

type RuntimeStateToken = StateToken<string, string, string>;

type RuntimeStateEntry = readonly [string, RuntimeStateToken | RuntimeStateBranch];

type StatePath = readonly string[];

const makeDefinition = Brand.nominal<AnyDefinition>();

const makeStateToken = Brand.nominal<StateToken>();

const makeEventToken = Brand.nominal<RuntimeEventToken>();

const makeEventEnvelope = Brand.nominal<RuntimeEventEnvelope>();

const catchDefinitionDefect = (defect: unknown): Diagnostic.Error => {
  const cause =
    defect instanceof globalThis.Error && Cause.isCause(defect.cause)
      ? Cause.squash(defect.cause)
      : defect;
  return cause instanceof Diagnostic.Error ? cause : Diagnostic.panic(cause);
};

const tryDefinition = <Value>(make: () => Diagnostic.Result<Value>): Diagnostic.Result<Value> =>
  Result.gen(function* () {
    const result = yield* Result.try({ try: make, catch: catchDefinitionDefect });
    return yield* result;
  });

const segment = (value: string): `${number}:${string}` =>
  `${utf8EncodedByteLength(value)}:${value}`;

const invalidStateInput = (): Diagnostic.Error =>
  new Diagnostic.Error({
    code: "SchemaValidation",
    path: ["states"],
    details: { issue: "Composite" },
    summary: "Schema validation failed",
    help: "Fix the value at the reported path.",
  });

const decodeDefinitionConfig = (input: unknown): Diagnostic.Result<DecodedDefinitionConfig> => {
  if (Predicate.isObject(input) && Object.hasOwn(input, "states")) {
    const states = Reflect.get(input, "states");
    if (!isSafeStateInput(states)) return Result.fail(invalidStateInput());
  }

  return decodeDefinitionConfigResult(input).pipe(Result.mapError(Diagnostic.fromSchemaError));
};

const stateName = (path: StatePath): string => `S.${path.join(".S.")}`;

const stateIdentity = (path: StatePath): string =>
  path.every((part) => !/[.[\]]/u.test(part) && part !== "S")
    ? stateName(path)
    : path.map(segment).join("|");

type BuiltStateTable = {
  readonly table: RuntimeStateTable;
  readonly metadata: readonly StateMetadata[];
};

const buildStateTable = (
  declarations: readonly StateDeclaration[],
  definitionId: string,
  parentPath: StatePath,
): BuiltStateTable => {
  const entries: RuntimeStateEntry[] = [];
  const metadata: StateMetadata[] = [];

  for (const declaration of declarations) {
    if (Predicate.isString(declaration)) {
      const path = [...parentPath, declaration];
      const id = `S|${segment(definitionId)}|${segment(stateIdentity(path))}` as const;
      const token = registerStateToken(
        makeStateToken({ kind: "state", name: stateName(path), id }),
      );
      entries.push([declaration, token]);
      metadata.push({ name: declaration, path, token, children: [] });
      continue;
    }

    for (const [name, children] of Object.entries(declaration)) {
      const nested = buildStateTable(children, definitionId, [...parentPath, name]);
      entries.push([name, { S: nested.table }]);
      metadata.push({
        name,
        path: [...parentPath, name],
        children: nested.metadata,
      });
    }
  }

  return { table: Object.fromEntries(entries), metadata };
};

const createEventToken = (
  name: string,
  declaration: (...args: readonly DefinitionValue[]) => EventPayload,
  definitionId: string,
): RuntimeEventToken => {
  const id: RuntimeEventId = `E|${segment(definitionId)}|${segment(name)}`;
  const event = (...args: readonly DefinitionValue[]): Diagnostic.Result<RuntimeEventEnvelope> =>
    tryDefinition(() =>
      decodeEventPayloadResult(declaration(...args)).pipe(
        Result.mapError(Diagnostic.fromSchemaError),
        Result.map((payload) => makeEventEnvelope({ ...payload, type: id })),
      ),
    );
  Object.defineProperty(event, "name", { value: name });
  return makeEventToken(Object.assign(event, { kind: "event" as const, id }));
};

const buildEventTable = (
  events: DecodedDefinitionConfig["events"],
  definitionId: string,
): RuntimeEventTable<EventToken> =>
  Record.map(events, (declaration, name) =>
    createEventToken(name, declaration === "bare" ? () => ({}) : declaration, definitionId),
  );

const copyOperations = (operations: DecodedDefinitionConfig["operations"]): OperationDeclarations =>
  Record.map(operations ?? {}, (declaration) => {
    const copied = { ...declaration };
    if (isConstructedOperation(declaration)) markConstructedOperation(copied);
    return copied;
  });

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

export const constructDefinitionResult = (input: unknown): Diagnostic.Result<AnyDefinition> =>
  tryDefinition(() =>
    decodeDefinitionConfig(input).pipe(
      Result.map((config) => {
        const builtStates = buildStateTable(config.states, config.id, []);
        const states = builtStates.table;
        const events = buildEventTable(config.events, config.id);

        const select = <const Value extends DefinitionValue>(
          selector: (selectorInput: SelectorInput<AnyDefinition>) => Value,
        ): ContextSelector<Value, AnyDefinition> => createContextSelector(result, selector);

        const result = makeDefinition({
          id: config.id,
          states: config.states,
          S: states,
          E: events,
          context: config.context ?? {},
          operations: copyOperations(config.operations),
          memory: config.memory,
          select,
        });

        const definitionMetadata: DefinitionMetadata = {
          states: { name: "", path: [], children: builtStates.metadata },
        };
        registerDefinitionMetadata(result, definitionMetadata);

        return result;
      }),
    ),
  );
