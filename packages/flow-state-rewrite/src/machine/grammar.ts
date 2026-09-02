import type {
  ContextOf,
  DefinitionConstraint,
  DefinitionValue as DomainValue,
  EventOf,
  MemoryOf,
  RuntimeStateTable,
  SelectorInput,
  StateOf,
  StateToken,
} from "../definition/domain.js";
import type * as Diagnostic from "../diagnostic/diagnostic.js";

export type MachineDefinition = DefinitionConstraint;

type StateTable = RuntimeStateTable;

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
  : Node extends { readonly S: infer Children }
    ? MachineCompoundConfiguration<DefinitionValue, Children>
    : never;

type StateConfigTable<DefinitionValue extends MachineDefinition, Table extends StateTable> = {
  readonly [Name in keyof Table]: StateConfigForNode<DefinitionValue, Table[Name]>;
};

export type MachineInput<
  DefinitionValue extends MachineDefinition,
  Event = EventOf<DefinitionValue>,
> = {
  readonly state: StateOf<DefinitionValue>;
  readonly event: Event;
  readonly memory: Readonly<MemoryOf<DefinitionValue>>;
  readonly context: ContextOf<DefinitionValue>;
  readonly S: DefinitionValue["S"];
  readonly E: DefinitionValue["E"];
  readonly O: DefinitionValue["operations"];
  readonly snapshot: Readonly<MachineSnapshot<DefinitionValue>>;
};

export type MachineSelectorInput<DefinitionValue extends MachineDefinition> = Omit<
  SelectorInput<DefinitionValue>,
  "memory"
> & {
  readonly memory: Readonly<MemoryOf<DefinitionValue>>;
};

export type MachineSnapshot<DefinitionValue extends MachineDefinition> = Readonly<{
  state: StateOf<DefinitionValue>;
  memory: Readonly<MemoryOf<DefinitionValue>>;
  context: ContextOf<DefinitionValue>;
}>;

export type RedirectInput<DefinitionValue extends MachineDefinition> = Readonly<{
  state: StateOf<DefinitionValue>;
  memory: Readonly<MemoryOf<DefinitionValue>>;
  snapshot: Readonly<MachineSnapshot<DefinitionValue>>;
}>;

export type TimerMetadata = Readonly<{
  name: string;
  startedAt: number;
  dueAt: number;
}>;

export type TimerInput<DefinitionValue extends MachineDefinition> = Readonly<{
  state: StateOf<DefinitionValue>;
  memory: Readonly<MemoryOf<DefinitionValue>>;
  snapshot: Readonly<MachineSnapshot<DefinitionValue>>;
  timer: TimerMetadata;
}>;

export type MachineAction = Readonly<{ kind: string }>;

export type MachineActivity = DomainValue;

type MachineActionResult = MachineAction | readonly MachineAction[] | null;

export type EventName<DefinitionValue extends MachineDefinition> = keyof DefinitionValue["E"] &
  string;

export type EventValue<
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
> = DefinitionValue["E"][Name] extends (...args: readonly never[]) => infer Result
  ? Result extends Diagnostic.Result<infer Value>
    ? Value
    : never
  : never;

export type Transition<
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
> = Readonly<{
  target: StateOf<DefinitionValue>;
  guard?: (input: MachineInput<DefinitionValue, EventValue<DefinitionValue, Name>>) => boolean;
  updateMemory?: (
    input: MachineInput<DefinitionValue, EventValue<DefinitionValue, Name>>,
  ) => Partial<MemoryOf<DefinitionValue>>;
  actions?: (
    input: MachineInput<DefinitionValue, EventValue<DefinitionValue, Name>>,
  ) => MachineActionResult; // oxlint-disable-line anti-slop/no-nullish-function-contracts -- null intentionally means no action.
  reenter?: StateOf<DefinitionValue>;
}>;

type EventHandlers<DefinitionValue extends MachineDefinition> = {
  readonly [Name in EventName<DefinitionValue>]?:
    | StateOf<DefinitionValue>
    | Transition<DefinitionValue, Name>
    | readonly [Transition<DefinitionValue, Name>, ...Transition<DefinitionValue, Name>[]];
};

export type Redirect<DefinitionValue extends MachineDefinition> = Readonly<{
  when: (input: RedirectInput<DefinitionValue>) => boolean;
  target: StateOf<DefinitionValue>;
}>;

type RedirectConfiguration<DefinitionValue extends MachineDefinition> =
  | Redirect<DefinitionValue>
  | readonly [Redirect<DefinitionValue>, ...Redirect<DefinitionValue>[]];

export type Timer<DefinitionValue extends MachineDefinition> = Readonly<{
  delay: number;
  guard?: (input: TimerInput<DefinitionValue>) => boolean;
  target: DefinitionValue["E"][EventName<DefinitionValue>];
  updateMemory?: (input: TimerInput<DefinitionValue>) => Partial<MemoryOf<DefinitionValue>>;
  actions?: never;
}>;

type TimerConfiguration<DefinitionValue extends MachineDefinition> = Readonly<
  Record<string, Timer<DefinitionValue>>
>;

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- authored activity services intentionally retain their arbitrary domain values.
type ActivityConfiguration = Readonly<Record<string, MachineActivity>>;

export type MachineStateBehavior<DefinitionValue extends MachineDefinition> = Readonly<{
  on?: EventHandlers<DefinitionValue>;
  redirect?: RedirectConfiguration<DefinitionValue>;
  activities?: ActivityConfiguration;
  timers?: TimerConfiguration<DefinitionValue>;
}>;

export type MachineNodeConfiguration<DefinitionValue extends MachineDefinition> =
  MachineStateBehavior<DefinitionValue> &
    Readonly<{
      default?: StateToken;
      states?: Readonly<Record<string, MachineNodeConfiguration<DefinitionValue>>>;
    }>;

type MachineLeafConfiguration<DefinitionValue extends MachineDefinition> =
  MachineStateBehavior<DefinitionValue>;

type MachineCompoundConfiguration<
  DefinitionValue extends MachineDefinition,
  Table,
> = MachineStateBehavior<DefinitionValue> &
  Readonly<{
    default: DirectStateTokensInTable<Table>;
    states: StateConfigTable<DefinitionValue, Extract<Table, StateTable>>;
  }>;

export type MachineConfiguration<DefinitionValue extends MachineDefinition> =
  MachineCompoundConfiguration<DefinitionValue, DefinitionValue["S"]>;

type HasNoExtraKeys<Value, Shape> = Exclude<keyof Value, keyof Shape> extends never ? true : false;

type HasExactKeys<Value, Shape> =
  HasNoExtraKeys<Value, Shape> extends true ? HasNoExtraKeys<Shape, Value> : false;

type IsNever<Value> = [Value] extends [never] ? true : false;

type EveryTrue<Value> = [Value] extends [true] ? true : false;

type ExactTransition<
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
  Value,
> =
  Value extends Transition<DefinitionValue, Name>
    ? HasNoExtraKeys<Value, Transition<DefinitionValue, Name>> extends true
      ? Value
      : never
    : never;

type TransitionEntryValid<
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
  Value,
> =
  Value extends Transition<DefinitionValue, Name>
    ? IsNever<ExactTransition<DefinitionValue, Name, Value>> extends true
      ? false
      : true
    : false;

type ExactEventEntry<
  DefinitionValue extends MachineDefinition,
  Name extends EventName<DefinitionValue>,
  Value,
> =
  Value extends StateOf<DefinitionValue>
    ? Value
    : Value extends readonly [
          Transition<DefinitionValue, Name>,
          ...Transition<DefinitionValue, Name>[],
        ]
      ? EveryTrue<TransitionEntryValid<DefinitionValue, Name, Value[number]>> extends true
        ? Value
        : never
      : ExactTransition<DefinitionValue, Name, Value>;

type ValidEventHandlers<DefinitionValue extends MachineDefinition, Value> =
  HasNoExtraKeys<Value, EventHandlers<DefinitionValue>> extends true
    ? EveryTrue<
        {
          [Name in keyof Value]: Name extends EventName<DefinitionValue>
            ? IsNever<ExactEventEntry<DefinitionValue, Name, Value[Name]>> extends true
              ? false
              : true
            : false;
        }[keyof Value]
      >
    : false;

type ValidOn<DefinitionValue extends MachineDefinition, Value> = [Value] extends [undefined]
  ? true
  : ValidEventHandlers<DefinitionValue, Value>;

type ExactTimer<DefinitionValue extends MachineDefinition, Value> =
  Value extends Timer<DefinitionValue>
    ? HasNoExtraKeys<Value, Timer<DefinitionValue>> extends true
      ? Value
      : never
    : never;

type ValidTimers<DefinitionValue extends MachineDefinition, Value> = [Value] extends [undefined]
  ? true
  : EveryTrue<
      {
        [Name in keyof Value]: IsNever<ExactTimer<DefinitionValue, Value[Name]>> extends true
          ? false
          : true;
      }[keyof Value]
    >;

type ValidNodeBehavior<
  DefinitionValue extends MachineDefinition,
  Configuration extends MachineNodeConfiguration<DefinitionValue>,
> =
  ValidOn<DefinitionValue, Configuration["on"]> extends true
    ? ValidTimers<DefinitionValue, Configuration["timers"]>
    : false;

type ValidStateTable<
  DefinitionValue extends MachineDefinition,
  Table extends StateTable,
  Configuration,
> =
  Configuration extends Readonly<Record<string, MachineNodeConfiguration<DefinitionValue>>>
    ? HasExactKeys<Configuration, Table> extends true
      ? EveryTrue<
          {
            [Name in keyof Table]: Name extends keyof Configuration
              ? IsNever<
                  ValidMachineNode<DefinitionValue, Table[Name], Configuration[Name]>
                > extends true
                ? false
                : true
              : false;
          }[keyof Table]
        >
      : false
    : false;

type ValidRootConfiguration<
  DefinitionValue extends MachineDefinition,
  Configuration extends MachineConfiguration<DefinitionValue>,
> =
  HasNoExtraKeys<Configuration, MachineConfiguration<DefinitionValue>> extends true
    ? ValidNodeBehavior<DefinitionValue, Configuration> extends true
      ? ValidStateTable<
          DefinitionValue,
          Extract<DefinitionValue["S"], StateTable>,
          Configuration["states"]
        > extends true
        ? Configuration
        : never
      : never
    : never;

type ValidMachineNode<DefinitionValue extends MachineDefinition, Node, Configuration> =
  Configuration extends StateConfigForNode<DefinitionValue, Node>
    ? HasNoExtraKeys<Configuration, StateConfigForNode<DefinitionValue, Node>> extends true
      ? Configuration extends MachineNodeConfiguration<DefinitionValue>
        ? ValidNodeBehavior<DefinitionValue, Configuration> extends true
          ? Node extends StateToken
            ? Configuration
            : Node extends { readonly S: infer Children }
              ? Configuration extends { readonly states: infer ChildConfiguration }
                ? ValidStateTable<
                    DefinitionValue,
                    Extract<Children, StateTable>,
                    ChildConfiguration
                  > extends true
                  ? Configuration
                  : never
                : never
              : never
          : never
        : never
      : never
    : never;

export type ValidMachineConfiguration<
  DefinitionValue extends MachineDefinition,
  Configuration extends MachineConfiguration<DefinitionValue>,
> = ValidRootConfiguration<DefinitionValue, Configuration>;

type ContextSelectionHandler<
  DefinitionValue extends MachineDefinition,
  Value extends DomainValue,
> = (current: Value, previous: Value | undefined) => EventOf<DefinitionValue> | false | null; // oxlint-disable-line anti-slop/no-nullish-function-contracts -- false and null intentionally suppress an event.

export type ContextRegistration<DefinitionValue extends MachineDefinition> = Readonly<{
  selector: (input: MachineSelectorInput<DefinitionValue>) => DomainValue;
  handler(
    current: DomainValue,
    previous: DomainValue | undefined, // oxlint-disable-line anti-slop/no-nullish-function-contracts -- previous models selection state.
  ): EventOf<DefinitionValue> | false | null; // oxlint-disable-line anti-slop/no-nullish-function-contracts -- false and null model control signals.
}>;

type MemoryView<DefinitionValue extends MachineDefinition> = Readonly<{
  state: StateOf<DefinitionValue>;
  memory: Readonly<MemoryOf<DefinitionValue>>;
  context: ContextOf<DefinitionValue>;
  S: DefinitionValue["S"];
  E: DefinitionValue["E"];
  O: DefinitionValue["operations"];
}>;

type MemoryPlanResult = MachineAction | false | null;

export type MemoryHandler<DefinitionValue extends MachineDefinition> = (
  input: MemoryView<DefinitionValue>,
) => MemoryPlanResult; // oxlint-disable-line anti-slop/no-nullish-function-contracts -- null intentionally means no memory action.

export type MemorySelectionHandler<Value extends DomainValue> = (
  current: Value,
  previous: Value | undefined, // oxlint-disable-line anti-slop/no-nullish-function-contracts -- previous models selection state.
) => MemoryPlanResult; // oxlint-disable-line anti-slop/no-nullish-function-contracts -- null models a control signal.

type MemoryHandlerRegistration<DefinitionValue extends MachineDefinition> = {
  readonly kind: "handler";
  readonly handler: MemoryHandler<DefinitionValue>;
};

type MemorySelectionRegistration<
  DefinitionValue extends MachineDefinition,
  Value extends DomainValue,
> = {
  readonly kind: "selection";
  readonly selector: (input: MachineSelectorInput<DefinitionValue>) => Value;
  handler(current: Value, previous: Value | undefined): MemoryPlanResult; // oxlint-disable-line anti-slop/no-nullish-function-contracts -- previous models selection state.
};

export type MemoryRegistration<DefinitionValue extends MachineDefinition> =
  | MemoryHandlerRegistration<DefinitionValue>
  | MemorySelectionRegistration<DefinitionValue, DomainValue>;

type OnContext<DefinitionValue extends MachineDefinition> = Readonly<{
  select: <const Value extends DomainValue>(
    selector: (input: MachineSelectorInput<DefinitionValue>) => Value,
    handler: ContextSelectionHandler<DefinitionValue, Value>,
  ) => void;
}>;

export type OnMemory<DefinitionValue extends MachineDefinition> = {
  (handler: MemoryHandler<DefinitionValue>): void;
  select: <const Value extends DomainValue>(
    selector: (input: MachineSelectorInput<DefinitionValue>) => Value,
    handler: MemorySelectionHandler<Value>,
  ) => void;
};

export type MachineCallback<DefinitionValue extends MachineDefinition> = Readonly<{
  S: DefinitionValue["S"];
  E: DefinitionValue["E"];
  O: DefinitionValue["operations"];
  onContext: OnContext<DefinitionValue>;
  onMemory: OnMemory<DefinitionValue>;
  invalidate: (...targets: readonly DomainValue[]) => MachineAction;
  clear: (...targets: readonly DomainValue[]) => MachineAction;
}>;

export type CompiledTransition<
  DefinitionValue extends MachineDefinition = MachineDefinition,
  Name extends EventName<DefinitionValue> = EventName<DefinitionValue>,
> = Transition<DefinitionValue, Name>;

export type CompiledRedirect<DefinitionValue extends MachineDefinition = MachineDefinition> =
  Redirect<DefinitionValue>;

type CompiledHandlers<DefinitionValue extends MachineDefinition> = Partial<{
  readonly [Name in EventName<DefinitionValue>]: readonly CompiledTransition<
    DefinitionValue,
    Name
  >[];
}>;

export type CompiledTimer<DefinitionValue extends MachineDefinition = MachineDefinition> =
  Timer<DefinitionValue>;

export type CompiledState<DefinitionValue extends MachineDefinition = MachineDefinition> =
  Readonly<{
    path: string;
    kind: "leaf" | "compound";
    state?: StateToken;
    default?: StateToken;
    children: readonly string[];
    handlers: Readonly<CompiledHandlers<DefinitionValue>>;
    redirects: readonly CompiledRedirect<DefinitionValue>[];
    activities: ActivityConfiguration;
    timers: Readonly<Record<string, CompiledTimer<DefinitionValue>>>;
  }>;

export type CompiledMachine<DefinitionValue extends MachineDefinition = MachineDefinition> =
  Readonly<{
    states: Readonly<Record<string, CompiledState<DefinitionValue>>>;
    context: readonly ContextRegistration<DefinitionValue>[];
    memory: readonly MemoryRegistration<DefinitionValue>[];
  }>;

export type Machine<
  DefinitionValue extends MachineDefinition = MachineDefinition,
  Configuration extends MachineConfiguration<DefinitionValue> =
    MachineConfiguration<DefinitionValue>,
> = DefinitionValue &
  Readonly<{
    definition: DefinitionValue;
    config: Configuration;
    compiled: CompiledMachine<DefinitionValue>;
  }>;
