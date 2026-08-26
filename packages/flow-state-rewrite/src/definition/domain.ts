import type { Brand } from "effect";

export type DefinitionValue =
  | bigint
  | boolean
  | null
  | number
  | object
  | string
  | symbol
  | undefined;

export type EventPayload = object;

export type StateDeclaration = string | Readonly<Record<string, readonly StateDeclaration[]>>;

export type EventDeclaration = null | ((...args: readonly never[]) => EventPayload);

export type EventDeclarations = Readonly<Record<string, EventDeclaration>>;

export interface DefinitionIdentity {
  readonly id: string;
}

export type ContextSelector<
  Value extends DefinitionValue = DefinitionValue,
  Provider extends DefinitionIdentity = DefinitionIdentity,
> = Brand.Branded<
  {
    readonly kind: "context-selector";
    readonly provider: Provider;
    readonly selector: (...args: readonly never[]) => Value;
  },
  "flow-state/ContextSelector"
>;

export type ContextDeclarations = Readonly<Record<string, ContextSelector>>;

type ReadonlySelection<Value extends DefinitionValue> =
  Value extends Brand.Brand<string> ? Value : Value extends object ? Readonly<Value> : Value;

export interface OperationDeclaration {
  readonly kind: string;
}

export type OperationDeclarations = Readonly<Record<string, OperationDeclaration>>;

export type EmptyMemory = Readonly<Record<never, never>>;

export type EmptyContext = Readonly<Record<never, never>>;

export type EmptyOperations = Readonly<Record<never, never>>;

export type MemoryDeclaration<Input = never, Memory extends object = object> = (options: {
  readonly input: Input;
}) => Memory;

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
> = Brand.Branded<
  {
    readonly kind: "state";
    readonly name: Path;
    readonly id: `S|${number}:${DefinitionId}|${number}:${Path}`;
  },
  "flow-state/StateToken"
>;

export type EventEnvelope<
  Id extends string = string,
  Payload extends EventPayload = EventPayload,
> = Brand.Branded<{ readonly type: Id } & Readonly<Payload>, "flow-state/EventEnvelope">;

export type EventToken<
  DefinitionId extends string = string,
  Name extends string = string,
  Args extends EventArguments = readonly [],
  Payload extends EventPayload = EventPayload,
> = Brand.Branded<
  ((...args: Args) => EventEnvelope<`E|${number}:${DefinitionId}|${number}:${Name}`, Payload>) & {
    readonly kind: "event";
    readonly name: Name;
    readonly id: `E|${number}:${DefinitionId}|${number}:${Name}`;
  },
  "flow-state/EventToken"
>;

type StatePath<Parent extends string, Name extends string> = Parent extends ""
  ? `S.${Name}`
  : `${Parent}.S.${Name}`;

type UnionToIntersection<Value> = (Value extends Value ? (value: Value) => void : never) extends (
  value: infer Intersection,
) => void
  ? Intersection
  : never;

type StateEntry<
  DefinitionId extends string,
  Declaration,
  Parent extends string,
> = Declaration extends string
  ? {
      readonly [Name in Declaration]: StateToken<DefinitionId, StatePath<Parent, Name>>;
    }
  : Declaration extends Readonly<Record<infer Name extends string, infer Children>>
    ? Children extends readonly StateDeclaration[]
      ? {
          readonly [Key in Name]: {
            readonly S: StateTable<DefinitionId, Children, StatePath<Parent, Key>>;
          };
        }
      : never
    : never;

type StateTable<
  DefinitionId extends string,
  States extends readonly StateDeclaration[],
  Parent extends string,
> = UnionToIntersection<
  States[number] extends infer Declaration ? StateEntry<DefinitionId, Declaration, Parent> : never
>;

type EventPayloadOf<Declaration> = Declaration extends (...args: readonly never[]) => infer Payload
  ? Payload extends EventPayload
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
  "flow-state/Definition"
>;

export interface RuntimeStateBranch {
  readonly S: RuntimeStateTable;
}

export type RuntimeStateTable = Readonly<Record<string, StateToken | RuntimeStateBranch>>;

export type RuntimeEventTable = Readonly<Record<string, EventToken>>;

export type AnyDefinition = Brand.Branded<
  {
    readonly id: string;
    readonly states: readonly StateDeclaration[];
    readonly S: RuntimeStateTable;
    readonly E: RuntimeEventTable;
    readonly context: ContextDeclarations;
    readonly operations: OperationDeclarations;
    readonly memory: MemoryDeclaration | undefined;
    readonly select: <const Value extends DefinitionValue>(
      selector: (input: SelectorInput<AnyDefinition>) => Value,
    ) => ContextSelector<Value, AnyDefinition>;
  },
  "flow-state/Definition"
>;

export type StateOf<Value extends DefinitionIdentity> = Value extends {
  readonly S: infer States;
}
  ? StateLeavesFromTable<States>
  : never;

type StateLeavesFromTable<Value> = Value extends StateToken
  ? Value
  : Value extends { readonly S: infer Children }
    ? StateLeavesFromTable<Children>
    : Value extends object
      ? {
          [Name in keyof Value]: StateLeavesFromTable<Value[Name]>;
        }[keyof Value]
      : never;

export type EventOf<Value extends DefinitionIdentity> = Value extends {
  readonly E: infer Events;
}
  ? Events extends object
    ? {
        [Name in keyof Events]: Events[Name] extends (...args: readonly never[]) => infer Result
          ? Result
          : never;
      }[keyof Events]
    : never
  : never;

type InputFromMemory<Value> = Value extends undefined
  ? void
  : Value extends (...args: infer Args) => infer Output
    ? Output extends object
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
    ? Output extends object
      ? Output
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
