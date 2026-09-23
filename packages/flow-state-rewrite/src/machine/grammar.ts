// oxlint-disable-next-line anti-slop/no-large-production-file -- this module owns the Definition-indexed authoring, validation, registration, and compiled type grammar; splitting would fragment their shared recursive type relationships.
import type {
  ContextOf,
  DefinitionConstraint,
  DefinitionValue as DomainValue,
  EventOf,
  MemoryOf,
  RuntimeStateTable,
  StateOf,
  StateToken,
} from "../definition/domain.js";
import type { Option, Result as EffectResult } from "effect";
import type * as Diagnostic from "../diagnostic/diagnostic.js";
import type { OperationKey } from "../operation/key.js";
import type { OperationDeclaration, OperationMethodResult } from "../operation/operation.js";

// oxlint-disable-next-line anti-slop/no-readonly -- NO_READONLY_CODEMOD: machine authoring accepts const-inferred non-empty transition and redirect lists without requiring caller copies.
type NonEmptyList<Value> = readonly [Value, ...Value[]];

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
 * MachineDefinition and StateNode describe the Definition-facing machine
 * vocabulary. TokenLookup is the private lookup seam used by admission and
 * compilation.
 */

export type MachineDefinition = DefinitionConstraint;

export type TokenLookup<Token> = <Value>(value: Value) => Option.Option<Token>;

export type StateNode<DefinitionValue extends DefinitionConstraint = DefinitionConstraint> =
  | {
      kind: "leaf";
      name: string;
      path: string[];
      token: StateOf<DefinitionValue>;
      children: [];
    }
  | {
      kind: "compound";
      name: string;
      path: string[];
      children: StateNode<DefinitionValue>[];
    };

export type MachineInput<
  DefinitionValue extends MachineDefinition,
  Event = EventOf<DefinitionValue>,
> = {
  state: StateOf<DefinitionValue>;
  event: Event;
  memory: MemoryOf<DefinitionValue>;
  context: ContextOf<DefinitionValue>;
  S: DefinitionValue["S"];
  E: DefinitionValue["E"];
  O: DefinitionValue["operations"];
  snapshot: MachineSnapshot<DefinitionValue>;
};

export type MachineSnapshot<DefinitionValue extends MachineDefinition> = {
  // oxlint-disable-next-line anti-slop/no-readonly -- Selectors receive fixed state, memory, and context references and cannot replace snapshot fields.
  readonly state: StateOf<DefinitionValue>;
  // oxlint-disable-next-line anti-slop/no-readonly -- Selectors receive fixed state, memory, and context references and cannot replace snapshot fields.
  readonly memory: MemoryOf<DefinitionValue>;
  // oxlint-disable-next-line anti-slop/no-readonly -- Selectors receive fixed state, memory, and context references and cannot replace snapshot fields.
  readonly context: ContextOf<DefinitionValue>;
};

export type MachineSelectorInput<DefinitionValue extends MachineDefinition> =
  MachineSnapshot<DefinitionValue>;

export type RedirectInput<DefinitionValue extends MachineDefinition> = {
  state: StateOf<DefinitionValue>;
  memory: MemoryOf<DefinitionValue>;
  snapshot: MachineSnapshot<DefinitionValue>;
};

export type TimerMetadata = {
  name: string;
  startedAt: number;
  dueAt: number;
};

export type TimerInput<DefinitionValue extends MachineDefinition> = {
  state: StateOf<DefinitionValue>;
  memory: MemoryOf<DefinitionValue>;
  snapshot: MachineSnapshot<DefinitionValue>;
  timer: TimerMetadata;
};

/*
 * Component map — operation actions and continuing activities:
 * OperationOf and the three operation-family projections feed the finite
 * MachineAction union. ResourceActivityPlanOf, MachineActivityPlan, and
 * MachineActivity preserve continuing resource/stream plans; the action
 * result helper preserves one-or-many action and null control semantics.
 */

type OperationOf<DefinitionValue extends MachineDefinition> =
  DefinitionValue["operations"][keyof DefinitionValue["operations"]];

type ResourceOf<DefinitionValue extends MachineDefinition> = Extract<
  OperationOf<DefinitionValue>,
  { kind: "resource" }
>;

type TransactionOf<DefinitionValue extends MachineDefinition> = Extract<
  OperationOf<DefinitionValue>,
  { kind: "transaction" }
>;

type StreamOf<DefinitionValue extends MachineDefinition> = Extract<
  OperationOf<DefinitionValue>,
  { kind: "stream" }
>;

type ResourcePlanOf<DefinitionValue extends MachineDefinition> =
  ResourceOf<DefinitionValue> extends infer Operation
    ? Operation extends OperationDeclaration
      ?
          | OperationMethodResult<Operation, "lookup">
          | OperationMethodResult<Operation, "refetch">
          | OperationMethodResult<Operation, "setData">
          | OperationMethodResult<Operation, "cancel">
      : never
    : never;

type TransactionPlanOf<DefinitionValue extends MachineDefinition> =
  TransactionOf<DefinitionValue> extends infer Operation
    ? Operation extends OperationDeclaration
      ? OperationMethodResult<Operation, "commit"> | OperationMethodResult<Operation, "cancel">
      : never
    : never;

type StreamPlanOf<DefinitionValue extends MachineDefinition> =
  StreamOf<DefinitionValue> extends infer Operation
    ? Operation extends OperationDeclaration
      ? OperationMethodResult<Operation, "subscribe">
      : never
    : never;

type OperationKeyOf<Operation> = Operation extends {
  key: (...args: never[]) => infer Key;
}
  ? Key extends OperationKey
    ? Key
    : never
  : never;

export type MachineStoreTarget<DefinitionValue extends MachineDefinition> =
  ResourceOf<DefinitionValue> extends infer Operation
    ? Operation extends OperationDeclaration
      ? [Operation, OperationKeyOf<Operation>]
      : never
    : never;

export type MachineStoreAction<DefinitionValue extends MachineDefinition> =
  | {
      kind: "invalidate";
      targets: [MachineStoreTarget<DefinitionValue>, ...MachineStoreTarget<DefinitionValue>[]];
    }
  | {
      kind: "clear";
      targets: [MachineStoreTarget<DefinitionValue>, ...MachineStoreTarget<DefinitionValue>[]];
    };

export type MachineAction<DefinitionValue extends MachineDefinition = MachineDefinition> =
  | ResourcePlanOf<DefinitionValue>
  | TransactionPlanOf<DefinitionValue>
  | MachineStoreAction<DefinitionValue>;

type ResourceActivityPlanOf<DefinitionValue extends MachineDefinition> =
  ResourceOf<DefinitionValue> extends infer Operation
    ? Operation extends OperationDeclaration
      ? OperationMethodResult<Operation, "subscribe">
      : never
    : never;

export type MachineActivityPlan<DefinitionValue extends MachineDefinition> =
  | ResourceActivityPlanOf<DefinitionValue>
  | StreamPlanOf<DefinitionValue>;

export type MachineActivity<DefinitionValue extends MachineDefinition = MachineDefinition> =
  MachineActivityPlan<DefinitionValue>;

type MachineActionResult<DefinitionValue extends MachineDefinition> =
  | MachineAction<DefinitionValue>
  | MachineAction<DefinitionValue>[]
  | null;

/*
 * Component map — authored machine configuration:
 * EventName/EventValue anchor Transition and EventHandlers to the Definition;
 * Redirect, Timer, ActivityConfiguration, and the leaf/compound configuration
 * types preserve the recursive authoring grammar.
 */

export type EventName<DefinitionValue extends MachineDefinition> = keyof DefinitionValue["E"] &
  string;

export type EventValue<
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
> = DefinitionValue["E"][Name] extends (...args: never[]) => infer Result
  ? Result extends EffectResult.Result<infer Value, Diagnostic.PublicDiagnostic>
    ? Value
    : never
  : never;

export type Transition<
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
> = {
  target: StateOf<DefinitionValue>;
} & Partial<{
  guard: (input: MachineInput<DefinitionValue, EventValue<DefinitionValue, Name>>) => boolean;
  updateMemory: (
    input: MachineInput<DefinitionValue, EventValue<DefinitionValue, Name>>,
  ) => Partial<MemoryOf<DefinitionValue>>;
  actions: (
    input: MachineInput<DefinitionValue, EventValue<DefinitionValue, Name>>,
  ) => MachineActionResult<DefinitionValue>;
  reenter: StateOf<DefinitionValue>;
}>;

type EventHandlers<DefinitionValue extends MachineDefinition> = {
  [Name in EventName<DefinitionValue>]?:
    | StateOf<DefinitionValue>
    | Transition<DefinitionValue, Name>
    | NonEmptyList<Transition<DefinitionValue, Name>>;
};

export type Redirect<DefinitionValue extends MachineDefinition> = {
  when: (input: RedirectInput<DefinitionValue>) => boolean;
  target: StateOf<DefinitionValue>;
};

export type Timer<DefinitionValue extends MachineDefinition> = {
  delay: number;
  target: DefinitionValue["E"][EventName<DefinitionValue>];
} & Partial<{
  guard: (input: TimerInput<DefinitionValue>) => boolean;
  updateMemory: (input: TimerInput<DefinitionValue>) => Partial<MemoryOf<DefinitionValue>>;
  actions: never;
}>;

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- authored activity services are indexed by their state-local names.
type ActivityConfiguration<DefinitionValue extends MachineDefinition> = Record<
  string,
  MachineActivity<DefinitionValue>
>;

type MachineStateBehaviorFields<DefinitionValue extends MachineDefinition> = {
  on: EventHandlers<DefinitionValue>;
  redirect: Redirect<DefinitionValue> | NonEmptyList<Redirect<DefinitionValue>>;
  activities: ActivityConfiguration<DefinitionValue>;
  timers: Record<string, Timer<DefinitionValue>>;
};

export type MachineStateBehavior<DefinitionValue extends MachineDefinition> = Partial<
  MachineStateBehaviorFields<DefinitionValue>
>;

type MachineNodeFields<DefinitionValue extends MachineDefinition> = {
  default: StateToken;
  states: Record<string, MachineNodeConfiguration<DefinitionValue>>;
};

export type MachineNodeConfiguration<DefinitionValue extends MachineDefinition> =
  MachineStateBehavior<DefinitionValue> & Partial<MachineNodeFields<DefinitionValue>>;

type MachineLeafConfiguration<DefinitionValue extends MachineDefinition> =
  MachineStateBehavior<DefinitionValue>;

type MachineCompoundConfiguration<
  DefinitionValue extends MachineDefinition,
  Table,
> = MachineStateBehavior<DefinitionValue> & {
  default: DirectStateTokensInTable<Table>;
  states: StateConfigTable<DefinitionValue, Extract<Table, RuntimeStateTable>>;
};

export type MachineConfiguration<DefinitionValue extends MachineDefinition> =
  MachineCompoundConfiguration<DefinitionValue, DefinitionValue["S"]>;

/*
 * Component map — configuration exactness and recursive validation:
 * DirectStateTokensInTable, StateConfigForNode, and StateConfigTable describe
 * the definition-shaped configuration. The Valid* helpers then preserve exact
 * keys, optional-property presence, distributive unions, and bounded recursion.
 */

type DirectStateTokensInTable<Table> = {
  [Name in keyof Table]: Table[Name] extends StateToken ? Table[Name] : never;
}[keyof Table] extends never
  ? string extends keyof Table
    ? StateToken
    : never
  : {
      [Name in keyof Table]: Table[Name] extends StateToken ? Table[Name] : never;
    }[keyof Table];

type StateConfigForNode<DefinitionValue extends MachineDefinition, Node> = Node extends StateToken
  ? MachineLeafConfiguration<DefinitionValue>
  : Node extends { S: infer Children }
    ? MachineCompoundConfiguration<DefinitionValue, Children>
    : never;

type StateConfigTable<
  DefinitionValue extends MachineDefinition,
  Table extends RuntimeStateTable,
> = {
  [Name in keyof Table]: StateConfigForNode<DefinitionValue, Table[Name]>;
};

type NoExtra<Value, Shape> = keyof Value extends keyof Shape ? true : false;

type HasNoExtraKeys<Value, Shape> = EveryTrue<Value extends Value ? NoExtra<Value, Shape> : never>;

type ExactKeys<Value, Shape> = NoExtra<Value, Shape> extends true ? NoExtra<Shape, Value> : false;

type HasExactKeys<Value, Shape> = EveryTrue<Value extends Value ? ExactKeys<Value, Shape> : never>;

type EveryTrue<Value> = [Value] extends [true] ? true : false;

type ConfigurationProperty<Value, Name extends keyof Value> = PresentProperty<Value, Name>;

type ValidTransition<
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
  Value,
> =
  Value extends Transition<DefinitionValue, Name>
    ? HasNoExtraKeys<Value, Transition<DefinitionValue, Name>>
    : false;

type ValidEventEntry<
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
  Value,
> =
  Value extends StateOf<DefinitionValue>
    ? true
    : Value extends NonEmptyList<Transition<DefinitionValue, Name>>
      ? EveryTrue<ValidTransition<DefinitionValue, Name, Value[number]>>
      : ValidTransition<DefinitionValue, Name, Value>;

type PresentProperty<Value, Name extends keyof Value> =
  Pick<Value, Name> extends Required<Pick<Value, Name>>
    ? Value[Name]
    : Exclude<Value[Name], undefined>;

type ValidEventHandlers<DefinitionValue extends MachineDefinition, Value> =
  HasNoExtraKeys<Value, EventHandlers<DefinitionValue>> extends true
    ? EveryTrue<
        {
          [Name in keyof Value & EventName<DefinitionValue>]: ValidEventEntry<
            DefinitionValue,
            Name,
            PresentProperty<Value, Name>
          >;
        }[keyof Value & EventName<DefinitionValue>]
      >
    : false;

type ValidOn<DefinitionValue extends MachineDefinition, Value> = unknown extends Value
  ? false
  : [Value] extends [undefined]
    ? true
    : ValidEventHandlers<DefinitionValue, Value>;

type ValidTimer<DefinitionValue extends MachineDefinition, Value> =
  Value extends Timer<DefinitionValue> ? HasNoExtraKeys<Value, Timer<DefinitionValue>> : false;

type ValidTimers<DefinitionValue extends MachineDefinition, Value> = unknown extends Value
  ? false
  : [Value] extends [undefined]
    ? true
    : EveryTrue<
        {
          [Name in keyof Value]: ValidTimer<DefinitionValue, PresentProperty<Value, Name>>;
        }[keyof Value]
      >;

type ValidRedirect<DefinitionValue extends MachineDefinition, Value> =
  Value extends Redirect<DefinitionValue>
    ? HasNoExtraKeys<Value, Redirect<DefinitionValue>>
    : false;

type RedirectEntry<Value> = Value extends NonEmptyList<unknown> ? Value[number] : Value;

type ValidRedirects<DefinitionValue extends MachineDefinition, Value> = unknown extends Value
  ? false
  : [Value] extends [undefined]
    ? true
    : EveryTrue<ValidRedirect<DefinitionValue, RedirectEntry<Value>>>;

type RedirectValueOf<Configuration> = "redirect" extends keyof Configuration
  ? ConfigurationProperty<Configuration, "redirect">
  : undefined;

type ValidNodeBehavior<
  DefinitionValue extends MachineDefinition,
  Configuration,
> = Configuration extends Configuration
  ? ValidOn<
      DefinitionValue,
      "on" extends keyof Configuration ? ConfigurationProperty<Configuration, "on"> : undefined
    > extends true
    ? ValidRedirects<DefinitionValue, RedirectValueOf<Configuration>> extends true
      ? ValidTimers<
          DefinitionValue,
          "timers" extends keyof Configuration
            ? ConfigurationProperty<Configuration, "timers">
            : undefined
        >
      : false
    : false
  : never;

type ValidStateTable<
  DefinitionValue extends MachineDefinition,
  Table extends RuntimeStateTable,
  Configuration,
> = EveryTrue<
  Configuration extends Configuration
    ? HasExactKeys<Configuration, Table> extends true
      ? EveryTrue<
          {
            [Name in keyof Table]: Name extends keyof Configuration
              ? ValidMachineNode<DefinitionValue, Table[Name], Configuration[Name]>
              : false;
          }[keyof Table]
        >
      : false
    : never
>;

type ValidRootConfiguration<DefinitionValue extends MachineDefinition, Configuration> =
  HasNoExtraKeys<
    Configuration,
    MachineStateBehavior<DefinitionValue> & {
      default: StateToken;
      states: RuntimeStateTable;
    }
  > extends true
    ? ValidNodeBehavior<DefinitionValue, Configuration> extends true
      ? ValidStateTable<
          DefinitionValue,
          Extract<DefinitionValue["S"], RuntimeStateTable>,
          Configuration extends Configuration
            ? Configuration extends { states: infer States }
              ? States
              : never
            : never
        > extends true
        ? Configuration
        : never
      : never
    : never;

type ValidMachineNode<
  DefinitionValue extends MachineDefinition,
  Node,
  Configuration,
> = Node extends StateToken
  ? ValidMachineNodeConfiguration<
      DefinitionValue,
      Node,
      Configuration,
      MachineLeafConfiguration<DefinitionValue>
    >
  : Node extends { S: infer Children }
    ? ValidMachineNodeConfiguration<
        DefinitionValue,
        Node,
        Configuration,
        MachineStateBehavior<DefinitionValue> & {
          default: DirectStateTokensInTable<Extract<Children, RuntimeStateTable>>;
          states: RuntimeStateTable;
        }
      >
    : never;

type ValidMachineNodeConfiguration<
  DefinitionValue extends MachineDefinition,
  Node,
  Configuration,
  Shape,
> =
  HasNoExtraKeys<Configuration, Shape> extends true
    ? ValidNodeBehavior<DefinitionValue, Configuration> extends true
      ? Node extends StateToken
        ? true
        : Node extends { S: infer Children }
          ? Configuration extends { states: infer ChildConfiguration }
            ? ValidStateTable<
                DefinitionValue,
                Extract<Children, RuntimeStateTable>,
                ChildConfiguration
              > extends true
              ? true
              : false
            : false
          : false
      : false
    : false;

export type ValidMachineConfiguration<
  DefinitionValue extends MachineDefinition,
  Configuration,
> = ValidRootConfiguration<DefinitionValue, Configuration>;

/*
 * Component map — context and memory registration:
 * Selection/makeSelection construct the shared registration carrier;
 * ContextRegistration, MemoryRegistration, OnContext, OnMemory, and
 * MachineCallback expose the typed registration callbacks and their exact
 * continuation contracts.
 */

type ContextSelectionHandler<
  DefinitionValue extends MachineDefinition,
  Value extends DomainValue,
> = (current: Value, previous: Value | undefined) => EventOf<DefinitionValue> | false | null;

export type Selection<Input, Output> = {
  use: <Return>(
    consume: <Value extends DomainValue>(
      selector: (input: Input) => Value,
      handler: (current: Value, previous: Value | undefined) => Output,
    ) => Return,
  ) => Return;
};

// RETURN_TYPE: Contextually types the generic use callback; removing it leaves consume implicitly any (TS7006).
export const makeSelection = <Input, Value extends DomainValue, Output>(
  selector: (input: Input) => Value,
  handler: (current: Value, previous: Value | undefined) => Output,
): Selection<Input, Output> => ({ use: (consume) => consume(selector, handler) });

export type ContextRegistration<DefinitionValue extends MachineDefinition> = Selection<
  MachineSelectorInput<DefinitionValue>,
  EventOf<DefinitionValue> | false | null
>;

type MemoryView<DefinitionValue extends MachineDefinition> = {
  state: StateOf<DefinitionValue>;
  memory: MemoryOf<DefinitionValue>;
  context: ContextOf<DefinitionValue>;
  S: DefinitionValue["S"];
  E: DefinitionValue["E"];
  O: DefinitionValue["operations"];
};

type MemoryPlanResult<DefinitionValue extends MachineDefinition> =
  | MachineActivity<DefinitionValue>
  | false
  | null;

export type MemoryHandler<DefinitionValue extends MachineDefinition> = (
  input: MemoryView<DefinitionValue>,
) => MemoryPlanResult<DefinitionValue>;

export type MemorySelectionHandler<
  DefinitionValue extends MachineDefinition,
  Value extends DomainValue,
> = (
  current: Value,
  previous: Value | undefined,
) => MachineActivity<DefinitionValue> | false | null;

type MemoryHandlerRegistration<DefinitionValue extends MachineDefinition> = {
  kind: "handler";
  handler: MemoryHandler<DefinitionValue>;
};

type MemorySelectionRegistration<DefinitionValue extends MachineDefinition> = Selection<
  MachineSelectorInput<DefinitionValue>,
  MemoryPlanResult<DefinitionValue>
> & {
  kind: "selection";
};

export type MemoryRegistration<DefinitionValue extends MachineDefinition> =
  | MemoryHandlerRegistration<DefinitionValue>
  | MemorySelectionRegistration<DefinitionValue>;

type OnContext<DefinitionValue extends MachineDefinition> = {
  select: <const Value extends DomainValue>(
    selector: (input: MachineSelectorInput<DefinitionValue>) => Value,
    handler: ContextSelectionHandler<DefinitionValue, Value>,
  ) => void;
};

export type OnMemory<DefinitionValue extends MachineDefinition> = {
  (handler: MemoryHandler<DefinitionValue>): void;
  select: <const Value extends DomainValue>(
    selector: (input: MachineSelectorInput<DefinitionValue>) => Value,
    handler: MemorySelectionHandler<DefinitionValue, Value>,
  ) => void;
};

export type MachineCallback<DefinitionValue extends MachineDefinition> = {
  S: DefinitionValue["S"];
  E: DefinitionValue["E"];
  O: DefinitionValue["operations"];
  onContext: OnContext<DefinitionValue>;
  onMemory: OnMemory<DefinitionValue>;
  invalidate: (
    ...targets: [MachineStoreTarget<DefinitionValue>, ...MachineStoreTarget<DefinitionValue>[]]
  ) => MachineAction<DefinitionValue>;
  clear: (
    ...targets: [MachineStoreTarget<DefinitionValue>, ...MachineStoreTarget<DefinitionValue>[]]
  ) => MachineAction<DefinitionValue>;
};

/*
 * Component map — compiled state and machine output:
 * CompiledTransition, CompiledRedirect, CompiledTimer, CompiledState, and
 * CompiledMachine are the static output vocabulary produced by compilation;
 * their private base/handler types retain the authored Definition parameter.
 */

export type CompiledTransition<
  DefinitionValue extends MachineDefinition = MachineDefinition,
  Name extends EventName<DefinitionValue> = EventName<DefinitionValue>,
> = Transition<DefinitionValue, Name>;

export type CompiledRedirect<DefinitionValue extends MachineDefinition = MachineDefinition> =
  Redirect<DefinitionValue>;

type CompiledHandlers<DefinitionValue extends MachineDefinition> = Partial<{
  [Name in EventName<DefinitionValue>]: CompiledTransition<DefinitionValue, Name>[];
}>;

export type CompiledTimer<DefinitionValue extends MachineDefinition = MachineDefinition> =
  Timer<DefinitionValue>;

type CompiledStateBase<DefinitionValue extends MachineDefinition> = {
  path: string;
  handlers: CompiledHandlers<DefinitionValue>;
  redirects: CompiledRedirect<DefinitionValue>[];
  activities: ActivityConfiguration<DefinitionValue>;
  timers: Record<string, CompiledTimer<DefinitionValue>>;
};

type CompiledLeafState<DefinitionValue extends MachineDefinition> =
  CompiledStateBase<DefinitionValue> & {
    kind: "leaf";
    state: StateOf<DefinitionValue>;
    children: [];
  };

type CompiledCompoundState<DefinitionValue extends MachineDefinition> =
  CompiledStateBase<DefinitionValue> & {
    kind: "compound";
    default: StateOf<DefinitionValue>;
    children: string[];
  };

export type CompiledState<DefinitionValue extends MachineDefinition = MachineDefinition> =
  | CompiledLeafState<DefinitionValue>
  | CompiledCompoundState<DefinitionValue>;

export type CompiledMachine<DefinitionValue extends MachineDefinition = MachineDefinition> = {
  states: Record<string, CompiledState<DefinitionValue>>;
  context: ContextRegistration<DefinitionValue>[];
  memory: MemoryRegistration<DefinitionValue>[];
};
