import type { Brand, Result, Types } from "effect";
import type * as Diagnostic from "../diagnostic/diagnostic.js";
import type { OperationDeclaration, OperationDeclarations } from "../operation/operation.js";

export type { OperationDeclaration, OperationDeclarations } from "../operation/operation.js";

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
  | readonly DefinitionValue[]
  | StateToken<string, string, string>
  | OperationDeclaration
  | ContextSelector
  | DefinitionFunction;

export interface EventPayload {
  readonly [key: string]: DefinitionValue;
}

type EmptyEventPayload = Readonly<Record<never, never>>;

type DefinitionFunctionResult =
  | bigint
  | boolean
  | number
  | string
  | symbol
  | EventPayload
  | readonly DefinitionFunctionResult[]
  | StateToken<string, string, string>
  | OperationDeclaration
  | ContextSelector
  | DefinitionFunction;

interface DefinitionFunction {
  (...args: readonly never[]): DefinitionFunctionResult;
}

type DefinitionRecord<Value> = Readonly<{
  [Key in keyof Value]: DefinitionValue;
}>;

/*
 * Component map — authored configuration and callback inputs:
 * StateDeclaration, EventDeclaration, EventDeclarations, ContextDeclarations,
 * MemoryDeclaration, EventArguments, and DefinitionConfig are the authored
 * Definition inputs represented here.
 */

export type StateDeclaration = string | Readonly<Record<string, readonly StateDeclaration[]>>;

export type EventDeclaration = "bare" | ((...args: readonly never[]) => EventPayload);

export type EventDeclarations = Readonly<Record<string, EventDeclaration>>;

export type ContextDeclarations = Readonly<Record<string, ContextSelector>>;

export type MemoryDeclaration<
  Input = never,
  Memory extends DefinitionRecord<Memory> = EventPayload,
> = (options: { readonly input: Input }) => Memory;

type EventArguments = readonly DefinitionValue[];

export type DefinitionConfig = {
  readonly id: string;
  readonly states: readonly StateDeclaration[];
  readonly events: EventDeclarations;
  readonly context?: ContextDeclarations;
  readonly operations?: OperationDeclarations;
  readonly memory?: MemoryDeclaration;
};

/*
 * Component map — nominal identities and token construction:
 * DefinitionIdentity, ContextSelector, StateToken, EventEnvelope, EventToken,
 * StatePath, the encoded state identity helpers, StateEntry/StateTable, and
 * EventTable keep authored names correlated with their constructed nominal values.
 */

export interface DefinitionIdentity {
  readonly id: string;
}

export type ContextSelector<
  Value = unknown,
  Provider extends DefinitionIdentity = DefinitionIdentity,
> = Brand.Branded<
  {
    readonly kind: "context-selector";
    readonly provider: Provider;
    readonly selector: (...args: readonly never[]) => Value;
  },
  "ContextSelector"
>;

export type StateToken<
  DefinitionId extends string = string,
  Path extends string = string,
  Identity extends string = Path,
> = Brand.Branded<
  {
    readonly kind: "state";
    readonly name: Path;
    readonly id: `S|${number}:${DefinitionId}|${number}:${Identity}`;
  },
  "StateToken"
>;

export type EventEnvelope<
  Id extends string = string,
  Payload extends EventPayload | EmptyEventPayload = EventPayload,
> = Brand.Branded<{ readonly type: Id } & Readonly<Payload>, "EventEnvelope">;

export type EventToken<
  DefinitionId extends string = string,
  Name extends string = string,
  Args extends EventArguments = readonly [],
  Payload extends EventPayload | EmptyEventPayload = EventPayload,
> = Brand.Branded<
  ((
    ...args: Args
  ) => Result.Result<
    EventEnvelope<`E|${number}:${DefinitionId}|${number}:${Name}`, Payload>,
    Diagnostic.PublicDiagnostic
  >) & {
    readonly kind: "event";
    readonly name: Name;
    readonly id: `E|${number}:${DefinitionId}|${number}:${Name}`;
  },
  "EventToken"
>;

type StatePath<Parent extends string, Name extends string> = Parent extends ""
  ? `S.${Name}`
  : `${Parent}.S.${Name}`;

type UnsafeStateName = "S" | `${string}.${string}` | `${string}[${string}` | `${string}]${string}`;

type EncodedStateSegment<Segment extends string> = `${number}:${Segment}`;

type EncodedStateIdentity<Segments extends readonly string[]> = Segments extends readonly [
  infer Head extends string,
  ...infer Tail extends string[],
]
  ? `${EncodedStateSegment<Head>}${Tail extends readonly [] ? "" : `|${EncodedStateIdentity<Tail>}`}`
  : never;

type StateIdentity<Segments extends readonly string[], Display extends string> =
  Extract<Segments[number], UnsafeStateName> extends never
    ? Display
    : EncodedStateIdentity<Segments>;

type StateEntry<
  DefinitionId extends string,
  Declaration,
  Parent extends string,
  ParentSegments extends readonly string[],
> = Declaration extends string
  ? {
      readonly [Name in Declaration]: StateToken<
        DefinitionId,
        StatePath<Parent, Name>,
        StateIdentity<[...ParentSegments, Name], StatePath<Parent, Name>>
      >;
    }
  : Declaration extends Readonly<Record<infer Name extends string, infer Children>>
    ? Children extends readonly StateDeclaration[]
      ? {
          readonly [Key in Name]: {
            readonly S: StateTable<
              DefinitionId,
              Children,
              StatePath<Parent, Key>,
              [...ParentSegments, Key]
            >;
          };
        }
      : never
    : never;

type StateTable<
  DefinitionId extends string,
  States extends readonly StateDeclaration[],
  Parent extends string,
  ParentSegments extends readonly string[] = [],
> = Types.UnionToIntersection<StateEntry<DefinitionId, States[number], Parent, ParentSegments>>;

type EventPayloadOf<Declaration> = Declaration extends (...args: readonly never[]) => infer Payload
  ? Payload extends DefinitionRecord<Payload>
    ? Payload
    : never
  : Readonly<Record<never, never>>;

type EventArgsOf<Declaration> = Declaration extends (
  ...args: infer Args extends EventArguments
) => EventPayload
  ? Args
  : readonly [];

type EventEntry<DefinitionId extends string, Name extends string, Declaration> = EventToken<
  DefinitionId,
  Name,
  EventArgsOf<Declaration>,
  EventPayloadOf<Declaration>
>;

type EventTable<DefinitionId extends string, Events extends EventDeclarations> = Readonly<{
  [Name in keyof Events & string]: EventEntry<DefinitionId, Name, Events[Name]>;
}>;

/*
 * Component map — constructed Definition:
 * RuntimeStateBranch/RuntimeStateTable and RuntimeEventTable describe the
 * admitted shape. DefinitionConstraint is the machine-facing boundary;
 * Definition and AnyDefinition are the constructed public values.
 */

export interface RuntimeStateBranch {
  readonly S: RuntimeStateTable;
}

export type RuntimeStateTable = Readonly<
  Record<string, StateToken<string, string, string> | RuntimeStateBranch>
>;

type RuntimeEventIdentity = Pick<EventToken, "kind" | "name" | "id">;

export type RuntimeEventTable<Event extends RuntimeEventIdentity = RuntimeEventIdentity> = Readonly<
  Record<string, Event>
>;

export type DefinitionConstraint = Brand.Brand<"Definition"> &
  DefinitionIdentity & {
    readonly S: RuntimeStateTable;
    readonly E: RuntimeEventTable;
    readonly context: ContextDeclarations;
    readonly operations: OperationDeclarations;
    readonly memory: MemoryDeclaration | undefined;
  };

export type Definition<
  DefinitionId extends string = string,
  States extends readonly StateDeclaration[] = readonly StateDeclaration[],
  Events extends EventDeclarations = EventDeclarations,
  Context extends ContextDeclarations = ContextDeclarations,
  Operations extends OperationDeclarations = OperationDeclarations,
  Memory extends MemoryDeclaration | undefined = MemoryDeclaration | undefined,
> = Brand.Branded<
  {
    readonly id: DefinitionId;
    readonly states: States;
    readonly S: StateTable<DefinitionId, States, "">;
    readonly E: EventTable<DefinitionId, Events>;
    readonly context: Context;
    readonly operations: Operations;
    readonly memory: Memory;
    readonly select: <const Value extends DefinitionValue>(
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
    readonly id: string;
    readonly states: readonly StateDeclaration[];
    readonly S: RuntimeStateTable;
    readonly E: RuntimeEventTable<EventToken>;
    readonly context: ContextDeclarations;
    readonly operations: OperationDeclarations;
    readonly memory: MemoryDeclaration | undefined;
    readonly select: <const Value extends DefinitionValue>(
      selector: (input: SelectorInput<AnyDefinition>) => Value,
    ) => ContextSelector<Value, AnyDefinition>;
  },
  "Definition"
>;

/*
 * Component map — derived Definition projections:
 * StateOf/EventOf derive token unions; InputOf/MemoryOf derive the one
 * initializer contract; ContextOf/OperationsOf/SelectorInput expose the
 * readonly callback view. EventValueOf and WidenMemory are private projection
 * helpers. EmptyMemory, EmptyContext, EmptyOperations, ReadonlySelection, and
 * their other private helpers preserve absence semantics.
 */

export type EmptyMemory = Readonly<Record<never, never>>;

export type EmptyContext = Readonly<Record<never, never>>;

export type EmptyOperations = Readonly<Record<never, never>>;

type EventValueOf<Value> =
  Value extends Result.Result<infer Success, Diagnostic.PublicDiagnostic> ? Success : never;

type WidenMemory<Value> =
  Value extends Brand.Brand<string>
    ? Value
    : Value extends DefinitionFunction
      ? Value
      : Value extends readonly DefinitionValue[]
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
                  ? { -readonly [Key in keyof Value]: WidenMemory<Value[Key]> }
                  : Value;

export type StateOf<Value extends DefinitionIdentity> = Value extends {
  readonly S: infer States;
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
  readonly E: infer Events;
}
  ? Events extends RuntimeEventTable
    ? {
        [Name in keyof Events]: Events[Name] extends (...args: readonly never[]) => infer Result
          ? EventValueOf<Result>
          : never;
      }[keyof Events]
    : never
  : never;

type InputFromMemory<Value> = Value extends undefined
  ? void
  : Value extends (...args: infer Args) => infer Output
    ? Output extends DefinitionRecord<Output>
      ? Args extends readonly []
        ? void
        : Args extends readonly [infer Options]
          ? Options extends { readonly input: infer Input }
            ? Input
            : never
          : never
      : never
    : never;

type MemoryFromMemory<Value> = Value extends undefined
  ? EmptyMemory
  : Value extends (...args: readonly never[]) => infer Output
    ? Output extends DefinitionRecord<Output>
      ? WidenMemory<Output>
      : never
    : never;

export type InputOf<Value extends DefinitionIdentity> = Value extends {
  readonly memory: infer Memory;
}
  ? InputFromMemory<Memory>
  : void;

export type MemoryOf<Value extends DefinitionIdentity> = Value extends {
  readonly memory: infer Memory;
}
  ? MemoryFromMemory<Memory>
  : EmptyMemory;

type ReadonlySelection<Value extends DefinitionValue> =
  Value extends Brand.Brand<string>
    ? Value
    : Value extends readonly DefinitionValue[]
      ? Readonly<Value>
      : Value extends DefinitionRecord<Value>
        ? Readonly<Value>
        : Value;

type ContextValueOf<Value extends ContextSelector> =
  Brand.Brand.Unbranded<Value> extends {
    readonly selector: (...args: readonly never[]) => infer Selected extends DefinitionValue;
  }
    ? ReadonlySelection<Selected>
    : never;

export type ContextOf<Value extends DefinitionIdentity> = Value extends {
  readonly context: infer Context;
}
  ? Context extends Readonly<Record<string, ContextSelector>>
    ? { readonly [Name in keyof Context]: ContextValueOf<Context[Name]> }
    : EmptyContext
  : EmptyContext;

export type OperationsOf<Value extends DefinitionIdentity> = Value extends {
  readonly operations: infer Operations;
}
  ? Operations
  : EmptyOperations;

export type SelectorInput<Value extends DefinitionIdentity> = {
  readonly state: StateOf<Value>;
  readonly memory: MemoryOf<Value>;
  readonly context: ContextOf<Value>;
};

/*
 * Component map — config-to-Definition assembly:
 * ContextOfConfig, OperationsOfConfig, and MemoryOfConfig normalize optional
 * authored fields before DefinitionFromConfig preserves their exact literals.
 */

type ContextOfConfig<Config extends DefinitionConfig> = Config extends {
  readonly context: infer Context;
}
  ? Context extends ContextDeclarations
    ? Context
    : EmptyContext
  : EmptyContext;

type OperationsOfConfig<Config extends DefinitionConfig> = Config extends {
  readonly operations: infer Operations extends OperationDeclarations;
}
  ? Operations
  : EmptyOperations;

type MemoryOfConfig<Config extends DefinitionConfig> = Config extends {
  readonly memory: infer Memory extends MemoryDeclaration;
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
