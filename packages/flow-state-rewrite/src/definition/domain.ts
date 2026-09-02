import type { Brand } from "effect";
import type * as Diagnostic from "../diagnostic/diagnostic.js";

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
  | DefinitionFunction;

interface DefinitionFunction {
  (...args: readonly never[]): DefinitionFunctionResult;
}

type DefinitionRecord<Value> = Readonly<{
  [Key in keyof Value]: DefinitionValue;
}>;

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

export type StateDeclaration = string | Readonly<Record<string, readonly StateDeclaration[]>>;

export type EventDeclaration = "bare" | ((...args: readonly never[]) => EventPayload);

export type EventDeclarations = Readonly<Record<string, EventDeclaration>>;

export interface DefinitionIdentity {
  readonly id: string;
}

export type DefinitionConstraint = Brand.Brand<"Definition"> &
  DefinitionIdentity & {
    readonly S: RuntimeStateTable;
    readonly E: RuntimeEventTable;
    readonly context: ContextDeclarations;
    readonly operations: OperationDeclarations;
    readonly memory: MemoryDeclaration | undefined;
  };

export type ContextSelector<
  Value extends DefinitionValue = DefinitionValue,
  Provider extends DefinitionIdentity = DefinitionIdentity,
> = Brand.Branded<
  {
    readonly kind: "context-selector";
    readonly provider: Provider;
    readonly selector: (...args: readonly never[]) => Value;
  },
  "ContextSelector"
>;

export type ContextDeclarations = Readonly<Record<string, ContextSelector>>;

type ReadonlySelection<Value extends DefinitionValue> =
  Value extends Brand.Brand<string>
    ? Value
    : Value extends readonly DefinitionValue[]
      ? Readonly<Value>
      : Value extends DefinitionRecord<Value>
        ? Readonly<Value>
        : Value;

export interface OperationDeclaration {
  readonly kind: string;
}

export type OperationDeclarations = Readonly<Record<string, OperationDeclaration>>;

export type EmptyMemory = Readonly<Record<never, never>>;

export type EmptyContext = Readonly<Record<never, never>>;

export type EmptyOperations = Readonly<Record<never, never>>;

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
  ) => Diagnostic.Result<
    EventEnvelope<`E|${number}:${DefinitionId}|${number}:${Name}`, Payload>
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

type EncodedStateSegment<Segment extends string> = Segment extends "a.S.b"
  ? "5:a.S.b"
  : `${number}:${Segment}`;

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

type UnionToIntersection<Value> = (Value extends Value ? (value: Value) => void : never) extends (
  value: infer Intersection,
) => void
  ? Intersection
  : never;

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
> = UnionToIntersection<
  States[number] extends infer Declaration
    ? StateEntry<DefinitionId, Declaration, Parent, ParentSegments>
    : never
>;

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

type EventValueOf<Value> = Value extends Diagnostic.Result<infer Success> ? Success : never;

type EventTable<DefinitionId extends string, Events extends EventDeclarations> = Readonly<{
  [Name in keyof Events & string]: EventEntry<DefinitionId, Name, Events[Name]>;
}>;

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
      ? Args extends readonly [infer Options]
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

type ContextOfConfig<Config extends DefinitionConfig> = Config extends {
  readonly context: infer Context;
}
  ? Context extends ContextDeclarations
    ? Context
    : EmptyContext
  : EmptyContext;

type OperationsOfConfig<Config extends DefinitionConfig> = Config extends {
  readonly operations: infer Operations;
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
