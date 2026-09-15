import type { Brand, Result, Types } from "effect";
import type * as Diagnostic from "../diagnostic/diagnostic.js";
import type { OperationDeclaration, OperationDeclarations } from "../operation/operation.js";

export type { OperationDeclaration, OperationDeclarations } from "../operation/operation.js";

// oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: Effect Schema exposes readonly decoded arrays, and const-inferred authored tuples must retain their element positions for recursive state mapping.
export type DefinitionList<Value> = ReadonlyArray<Value>;

// oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: variadic state-path matching must accept const-inferred authored tuples without widening their order.
type DefinitionTuple<Head, Tail extends DefinitionList<unknown>> = readonly [Head, ...Tail];

/*
 * Type vocabulary:
 *
 * Authored configuration and callback inputs
 *
 * Operation actions and continuing activities
 *
 * Configuration exactness and recursive validation
 *
 * Context and memory registration
 *
 * Compiled state and machine output
 */

/*
 * Component map — type vocabulary:
 * DefinitionValue is the recursive authored value domain. EventPayload,
 * DefinitionFunction, and DefinitionRecord constrain values used by the
 * declaration boundary.
 */

export type DefinitionValue =
  | bigint
  | boolean
  | null
  | number
  | string
  | symbol
  | undefined
  | EventPayload
  // oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: recursive definition values must accept Effect Schema's readonly decoded arrays without breaking TypeScript's recursive-alias resolution.
  | ReadonlyArray<DefinitionValue>
  | StateToken<string, string, string>
  | OperationDeclaration
  | ContextSelector
  | DefinitionFunction;

export interface EventPayload {
  [key: string]: DefinitionValue;
}

type EmptyEventPayload = Record<never, never>;

type DefinitionFunctionResult =
  | bigint
  | boolean
  | number
  | string
  | symbol
  | EventPayload
  // oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: recursive definition results must accept Effect Schema's readonly decoded arrays without breaking TypeScript's recursive-alias resolution.
  | ReadonlyArray<DefinitionFunctionResult>
  | StateToken<string, string, string>
  | OperationDeclaration
  | ContextSelector
  | DefinitionFunction;

interface DefinitionFunction {
  (...args: never[]): DefinitionFunctionResult;
}

type DefinitionRecord<Value> = {
  [Key in keyof Value]: DefinitionValue;
};

/*
 * Component map — authored configuration and callback inputs:
 * StateDeclaration, EventDeclaration, EventDeclarations, ContextDeclarations,
 * MemoryDeclaration, EventArguments, and DefinitionConfig are the authored
 * Definition inputs represented here.
 */

interface StateDeclarationBranch {
  [name: string]: DefinitionList<StateDeclaration>;
}

export type StateDeclaration = string | StateDeclarationBranch;

export type EventDeclaration = "bare" | ((...args: never[]) => EventPayload);

export type EventDeclarations = Record<string, EventDeclaration>;

export type ContextDeclarations = Record<string, ContextSelector>;

export type MemoryDeclaration<
  Input = never,
  Memory extends DefinitionRecord<Memory> = EventPayload,
> = (options: { input: Input }) => Memory;

type EventArguments = DefinitionValue[];

export type DefinitionConfig = {
  id: string;
  states: DefinitionList<StateDeclaration>;
  events: EventDeclarations;
  context?: ContextDeclarations;
  operations?: OperationDeclarations;
  memory?: MemoryDeclaration;
};

/*
 * Component map — nominal identities and token construction:
 * DefinitionIdentity, ContextSelector, StateToken, EventEnvelope, EventToken,
 * StatePath, the encoded state identity helpers, StateEntry/StateTable, and
 * EventTable keep authored names correlated with their constructed nominal values.
 */

export interface DefinitionIdentity {
  id: string;
}

export type ContextSelector<
  Value = unknown,
  Provider extends DefinitionIdentity = DefinitionIdentity,
> = Brand.Branded<
  {
    kind: "context-selector";
    provider: Provider;
    selector: (...args: never[]) => Value;
  },
  "ContextSelector"
>;

export type StateToken<
  DefinitionId extends string = string,
  Path extends string = string,
  Identity extends string = Path,
> = Brand.Branded<
  {
    kind: "state";
    name: Path;
    id: `S|${number}:${DefinitionId}|${number}:${Identity}`;
  },
  "StateToken"
>;

export type EventEnvelope<
  Id extends string = string,
  Payload extends EventPayload | EmptyEventPayload = EventPayload,
> = Brand.Branded<{ type: Id } & Payload, "EventEnvelope">;

export type EventToken<
  DefinitionId extends string = string,
  Name extends string = string,
  Args extends EventArguments = [],
  Payload extends EventPayload | EmptyEventPayload = EventPayload,
> = Brand.Branded<
  ((
    ...args: Args
  ) => Result.Result<
    EventEnvelope<`E|${number}:${DefinitionId}|${number}:${Name}`, Payload>,
    Diagnostic.PublicDiagnostic
  >) & {
    kind: "event";
    name: Name;
    id: `E|${number}:${DefinitionId}|${number}:${Name}`;
  },
  "EventToken"
>;

type StatePath<Parent extends string, Name extends string> = Parent extends ""
  ? `S.${Name}`
  : `${Parent}.S.${Name}`;

type UnsafeStateName = "S" | `${string}.${string}` | `${string}[${string}` | `${string}]${string}`;

type EncodedStateSegment<Segment extends string> = `${number}:${Segment}`;

type EncodedStateIdentity<Segments extends DefinitionList<string>> =
  Segments extends DefinitionTuple<
    infer Head extends string,
    infer Tail extends DefinitionList<string>
  >
    ? `${EncodedStateSegment<Head>}${Tail["length"] extends 0 ? "" : `|${EncodedStateIdentity<Tail>}`}`
    : never;

type StateIdentity<Segments extends DefinitionList<string>, Display extends string> =
  Extract<Segments[number], UnsafeStateName> extends never
    ? Display
    : EncodedStateIdentity<Segments>;

type StateEntry<
  DefinitionId extends string,
  Declaration,
  Parent extends string,
  ParentSegments extends DefinitionList<string>,
> = Declaration extends string
  ? {
      [Name in Declaration]: StateToken<
        DefinitionId,
        StatePath<Parent, Name>,
        StateIdentity<[...ParentSegments, Name], StatePath<Parent, Name>>
      >;
    }
  : Declaration extends Record<infer Name extends string, infer Children>
    ? Children extends DefinitionList<StateDeclaration>
      ? {
          [Key in Name]: {
            S: StateTable<DefinitionId, Children, StatePath<Parent, Key>, [...ParentSegments, Key]>;
          };
        }
      : never
    : never;

type StateTable<
  DefinitionId extends string,
  States extends DefinitionList<StateDeclaration>,
  Parent extends string,
  ParentSegments extends DefinitionList<string> = [],
> = Types.UnionToIntersection<StateEntry<DefinitionId, States[number], Parent, ParentSegments>>;

type EventPayloadOf<Declaration> = Declaration extends (...args: never[]) => infer Payload
  ? Payload extends DefinitionRecord<Payload>
    ? Payload
    : never
  : Record<never, never>;

type EventArgsOf<Declaration> = Declaration extends (
  ...args: infer Args extends EventArguments
) => EventPayload
  ? Args
  : [];

type EventEntry<DefinitionId extends string, Name extends string, Declaration> = EventToken<
  DefinitionId,
  Name,
  EventArgsOf<Declaration>,
  EventPayloadOf<Declaration>
>;

type EventTable<DefinitionId extends string, Events extends EventDeclarations> = {
  [Name in keyof Events & string]: EventEntry<DefinitionId, Name, Events[Name]>;
};

/*
 * Component map — constructed Definition:
 * RuntimeStateBranch/RuntimeStateTable and RuntimeEventTable describe the
 * admitted shape. DefinitionConstraint is the machine-facing boundary;
 * Definition and AnyDefinition are the constructed public values.
 */

export interface RuntimeStateBranch {
  S: RuntimeStateTable;
}

export type RuntimeStateTable = Record<
  string,
  StateToken<string, string, string> | RuntimeStateBranch
>;

type RuntimeEventIdentity = Pick<EventToken, "kind" | "name" | "id">;

export type RuntimeEventTable<Event extends RuntimeEventIdentity = RuntimeEventIdentity> = Record<
  string,
  Event
>;

export type DefinitionConstraint = Brand.Brand<"Definition"> &
  DefinitionIdentity & {
    S: RuntimeStateTable;
    E: RuntimeEventTable;
    context: ContextDeclarations;
    operations: OperationDeclarations;
    memory: MemoryDeclaration | undefined;
  };

export type Definition<
  DefinitionId extends string = string,
  States extends DefinitionList<StateDeclaration> = DefinitionList<StateDeclaration>,
  Events extends EventDeclarations = EventDeclarations,
  Context extends ContextDeclarations = ContextDeclarations,
  Operations extends OperationDeclarations = OperationDeclarations,
  Memory extends MemoryDeclaration | undefined = MemoryDeclaration | undefined,
> = Brand.Branded<
  {
    id: DefinitionId;
    states: States;
    S: StateTable<DefinitionId, States, "">;
    E: EventTable<DefinitionId, Events>;
    context: Context;
    operations: Operations;
    memory: Memory;
    select: <const Value extends DefinitionValue>(
      selector: (
        input: SelectorInput<Definition<DefinitionId, States, Events, Context, Operations, Memory>>,
      ) => Value,
    ) => ContextSelector<
      Value,
      Definition<DefinitionId, States, Events, Context, Operations, Memory>
    >;
  },
  "Definition"
>;

export type AnyDefinition = Brand.Branded<
  {
    id: string;
    states: DefinitionList<StateDeclaration>;
    S: RuntimeStateTable;
    E: RuntimeEventTable<EventToken>;
    context: ContextDeclarations;
    operations: OperationDeclarations;
    memory: MemoryDeclaration | undefined;
    select: <const Value extends DefinitionValue>(
      selector: (input: SelectorInput<AnyDefinition>) => Value,
    ) => ContextSelector<Value, AnyDefinition>;
  },
  "Definition"
>;

/*
 * Component map — derived Definition projections:
 * StateOf/EventOf derive token unions; InputOf/MemoryOf derive the one
 * initializer contract; ContextOf/OperationsOf/SelectorInput expose the
 * callback view. EventValueOf and WidenMemory are private projection
 * helpers. EmptyMemory, EmptyContext, EmptyOperations, Selection, and
 * their other private helpers preserve absence semantics.
 */

export type EmptyMemory = Record<never, never>;

export type EmptyContext = Record<never, never>;

export type EmptyOperations = Record<never, never>;

type EventValueOf<Value> =
  Value extends Result.Result<infer Success, Diagnostic.PublicDiagnostic> ? Success : never;

type WidenMemory<Value> =
  Value extends Brand.Brand<string>
    ? Value
    : Value extends DefinitionFunction
      ? Value
      : Value extends DefinitionList<DefinitionValue>
        ? Value
        : Value extends string
          ? string
          : Value extends number
            ? number
            : Value extends boolean
              ? boolean
              : Value extends bigint
                ? bigint
                : Value extends DefinitionRecord<Value>
                  ? { [Key in keyof Value]: WidenMemory<Value[Key]> }
                  : Value;

export type StateOf<Value extends DefinitionIdentity> = Value extends {
  S: infer States;
}
  ? StateLeavesFromTable<States>
  : never;

type StateLeavesFromTable<Value> = Value extends StateToken
  ? Value
  : Value extends RuntimeStateBranch
    ? StateLeavesFromTable<Value["S"]>
    : Value extends RuntimeStateTable
      ? {
          [Name in keyof Value]: StateLeavesFromTable<Value[Name]>;
        }[keyof Value]
      : never;

export type EventOf<Value extends DefinitionIdentity> = Value extends {
  E: infer Events;
}
  ? Events extends RuntimeEventTable
    ? {
        [Name in keyof Events]: Events[Name] extends (...args: never[]) => infer Result
          ? EventValueOf<Result>
          : never;
      }[keyof Events]
    : never
  : never;

type InputFromMemory<Value> = Value extends undefined
  ? void
  : Value extends (...args: infer Args) => infer Output
    ? Output extends DefinitionRecord<Output>
      ? Args extends []
        ? void
        : Args extends [infer Options]
          ? Options extends { input: infer Input }
            ? Input
            : never
          : never
      : never
    : never;

type MemoryFromMemory<Value> = Value extends undefined
  ? EmptyMemory
  : Value extends (...args: never[]) => infer Output
    ? Output extends DefinitionRecord<Output>
      ? WidenMemory<Output>
      : never
    : never;

export type InputOf<Value extends DefinitionIdentity> = Value extends {
  memory: infer Memory;
}
  ? InputFromMemory<Memory>
  : void;

export type MemoryOf<Value extends DefinitionIdentity> = Value extends {
  memory: infer Memory;
}
  ? MemoryFromMemory<Memory>
  : EmptyMemory;

type Selection<Value extends DefinitionValue> =
  Value extends Brand.Brand<string>
    ? Value
    : Value extends DefinitionValue[]
      ? Value
      : Value extends DefinitionRecord<Value>
        ? Value
        : Value;

type ContextValueOf<Value extends ContextSelector> =
  Brand.Brand.Unbranded<Value> extends {
    selector: (...args: never[]) => infer Selected extends DefinitionValue;
  }
    ? Selection<Selected>
    : never;

export type ContextOf<Value extends DefinitionIdentity> = Value extends {
  context: infer Context;
}
  ? Context extends Record<string, ContextSelector>
    ? { [Name in keyof Context]: ContextValueOf<Context[Name]> }
    : EmptyContext
  : EmptyContext;

export type OperationsOf<Value extends DefinitionIdentity> = Value extends {
  operations: infer Operations;
}
  ? Operations
  : EmptyOperations;

export type SelectorInput<Value extends DefinitionIdentity> = {
  state: StateOf<Value>;
  memory: MemoryOf<Value>;
  context: ContextOf<Value>;
};

/*
 * Component map — config-to-Definition assembly:
 * ContextOfConfig, OperationsOfConfig, and MemoryOfConfig normalize optional
 * authored fields before DefinitionFromConfig preserves their exact literals.
 */

type ContextOfConfig<Config extends DefinitionConfig> = Config extends {
  context: infer Context;
}
  ? Context extends ContextDeclarations
    ? Context
    : EmptyContext
  : EmptyContext;

type OperationsOfConfig<Config extends DefinitionConfig> = Config extends {
  operations: infer Operations extends OperationDeclarations;
}
  ? Operations
  : EmptyOperations;

type MemoryOfConfig<Config extends DefinitionConfig> = Config extends {
  memory: infer Memory extends MemoryDeclaration;
}
  ? Memory
  : undefined;

export type DefinitionFromConfig<Config extends DefinitionConfig> = Definition<
  Config["id"],
  Config["states"],
  Config["events"],
  ContextOfConfig<Config>,
  OperationsOfConfig<Config>,
  MemoryOfConfig<Config>
>;
