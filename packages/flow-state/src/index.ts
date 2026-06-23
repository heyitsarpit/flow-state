import * as React from "react";
import { Effect } from "effect";
import { createMachine, initialTransition } from "xstate";

export type FlowStatePrimitive = "atom" | "resource" | "mutation" | "machine";

export interface FlowStatePackageInfo {
  readonly name: "@flow-state/core";
  readonly status: "smoke-tested";
  readonly primitives: readonly FlowStatePrimitive[];
}

export const packageInfo: FlowStatePackageInfo = {
  name: "@flow-state/core",
  status: "smoke-tested",
  primitives: ["atom", "resource", "mutation", "machine"],
};

const smokeMachine = createMachine({
  id: "flow-state-smoke",
  initial: "idle",
  states: {
    idle: {
      on: {
        START: "running",
      },
    },
    running: {},
  },
});

export interface FlowPreview {
  readonly label: string;
  readonly initialState: string;
  readonly primitives: readonly FlowStatePrimitive[];
}

export function createFlowPreview(): FlowPreview {
  const label = Effect.runSync(Effect.succeed("Effect + XState ready"));
  const [snapshot] = initialTransition(smokeMachine);
  const initialState =
    typeof snapshot.value === "string" ? snapshot.value : JSON.stringify(snapshot.value);

  return {
    label,
    initialState,
    primitives: packageInfo.primitives,
  };
}

export type FlowEvent = { readonly type: string } & Readonly<Record<string, unknown>>;

export interface FlowSnapshot<TContext, TState extends string = string> {
  readonly value: TState;
  readonly context: TContext;
  readonly status: "active";
  readonly changed: boolean;
  readonly event: FlowEvent | null;
  matches(state: TState): boolean;
  can(event: FlowEvent): boolean;
}

export interface FlowTransitionArgs<TContext, TEvent extends FlowEvent, TState extends string> {
  readonly context: TContext;
  readonly event: TEvent;
  readonly snapshot: FlowSnapshot<TContext, TState>;
}

export type FlowGuardPredicate<TContext, TEvent extends FlowEvent, TState extends string> = (
  args: FlowTransitionArgs<TContext, TEvent, TState>,
) => boolean;

export interface FlowGuard<TContext, TEvent extends FlowEvent, TState extends string> {
  readonly kind: "guard";
  readonly predicate: FlowGuardPredicate<TContext, TEvent, TState>;
}

export type FlowActionFunction<TContext, TEvent extends FlowEvent, TState extends string> = (
  args: FlowTransitionArgs<TContext, TEvent, TState>,
) => void;

export type FlowAssignUpdater<TContext, TEvent extends FlowEvent, TState extends string> = (
  args: FlowTransitionArgs<TContext, TEvent, TState>,
) => Partial<TContext> | TContext;

export type FlowUpdateReducer<
  TContext,
  TEvent extends FlowEvent,
  TState extends string,
> = FlowAssignUpdater<TContext, TEvent, TState>;

export interface FlowAssignAction<TContext, TEvent extends FlowEvent, TState extends string> {
  readonly kind: "assign";
  readonly updater: FlowAssignUpdater<TContext, TEvent, TState>;
}

export interface FlowEffectAction<TContext, TEvent extends FlowEvent, TState extends string> {
  readonly kind: "action";
  readonly fn: FlowActionFunction<TContext, TEvent, TState>;
}

export type FlowAction<TContext, TEvent extends FlowEvent, TState extends string> =
  | FlowAssignAction<TContext, TEvent, TState>
  | FlowEffectAction<TContext, TEvent, TState>
  | FlowActionFunction<TContext, TEvent, TState>;

export interface FlowTransitionConfig<TContext, TEvent extends FlowEvent, TState extends string> {
  readonly target?: TState;
  readonly guard?:
    | FlowGuard<TContext, TEvent, TState>
    | FlowGuardPredicate<TContext, TEvent, TState>;
  readonly update?:
    | FlowUpdateReducer<TContext, TEvent, TState>
    | readonly FlowUpdateReducer<TContext, TEvent, TState>[];
  readonly actions?:
    | FlowAction<TContext, TEvent, TState>
    | readonly FlowAction<TContext, TEvent, TState>[];
}

export type FlowTransition<TContext, TEvent extends FlowEvent, TState extends string> =
  | TState
  | FlowTransitionConfig<TContext, TEvent, TState>;

export interface FlowStateNode<TContext, TEvent extends FlowEvent, TState extends string> {
  readonly on?: Partial<
    Record<
      TEvent["type"],
      FlowTransition<TContext, TEvent, TState> | readonly FlowTransition<TContext, TEvent, TState>[]
    >
  >;
}

export interface FlowMachineConfig<TContext, TEvent extends FlowEvent, TState extends string> {
  readonly id?: string;
  readonly initial: TState;
  readonly context: TContext | (() => TContext);
  readonly states: Record<TState, FlowStateNode<TContext, TEvent, TState>>;
}

export interface FlowMachine<TContext, TEvent extends FlowEvent, TState extends string> {
  readonly id: string | undefined;
  readonly initial: TState;
  readonly config: FlowMachineConfig<TContext, TEvent, TState>;
  getInitialSnapshot(): FlowSnapshot<TContext, TState>;
  transition(
    snapshot: FlowSnapshot<TContext, TState>,
    event: TEvent,
  ): FlowSnapshot<TContext, TState>;
  can(snapshot: FlowSnapshot<TContext, TState>, event: FlowEvent): boolean;
}

export interface FlowActorRef<TContext, TEvent extends FlowEvent, TState extends string> {
  getSnapshot(): FlowSnapshot<TContext, TState>;
  send(event: TEvent): FlowSnapshot<TContext, TState>;
  subscribe(listener: () => void): () => void;
  can(event: FlowEvent): boolean;
}

export interface FlowRuntimeOptions {
  readonly inspect?: (snapshot: FlowSnapshot<unknown>, event: FlowEvent | null) => void;
}

export interface FlowActorOptions<TContext> {
  readonly context?: Partial<TContext> | ((context: TContext) => TContext);
}

export interface FlowRuntime {
  createActor<TContext, TEvent extends FlowEvent, TState extends string>(
    machine: FlowMachine<TContext, TEvent, TState>,
    options?: FlowActorOptions<TContext>,
  ): FlowActorRef<TContext, TEvent, TState>;
}

export interface FlowProviderProps {
  readonly runtime?: FlowRuntime;
  readonly children?: React.ReactNode;
}

export interface FlowTestHarness<TContext, TEvent extends FlowEvent, TState extends string> {
  start(options?: FlowActorOptions<TContext>): FlowTestHarness<TContext, TEvent, TState>;
  send(event: TEvent): FlowTestHarness<TContext, TEvent, TState>;
  expectState(state: TState): FlowTestHarness<TContext, TEvent, TState>;
  expectContext(
    expectation: Partial<TContext> | ((context: TContext) => void),
  ): FlowTestHarness<TContext, TEvent, TState>;
  expectSnapshot(
    expectation:
      | Partial<FlowSnapshot<TContext, TState>>
      | ((snapshot: FlowSnapshot<TContext, TState>) => void),
  ): FlowTestHarness<TContext, TEvent, TState>;
  expectCan(event: FlowEvent, expected?: boolean): FlowTestHarness<TContext, TEvent, TState>;
  snapshot(): FlowSnapshot<TContext, TState>;
  state(): TState;
  context(): TContext;
  can(event: FlowEvent): boolean;
  flush(): FlowTestHarness<TContext, TEvent, TState>;
}

export interface FlowMatchHandlers<TSnapshot, TResult> {
  readonly [state: string]: ((snapshot: TSnapshot) => TResult) | undefined;
  readonly _: (snapshot: TSnapshot) => TResult;
}

export interface FlowApi {
  machine<TContext, TEvent extends FlowEvent, TState extends string>(
    config: FlowMachineConfig<TContext, TEvent, TState>,
  ): FlowMachine<TContext, TEvent, TState>;
  assign<TContext, TEvent extends FlowEvent, TState extends string>(
    updater: FlowAssignUpdater<TContext, TEvent, TState>,
  ): FlowAssignAction<TContext, TEvent, TState>;
  guard<TContext, TEvent extends FlowEvent, TState extends string>(
    predicate: FlowGuardPredicate<TContext, TEvent, TState>,
  ): FlowGuard<TContext, TEvent, TState>;
  action<TContext, TEvent extends FlowEvent, TState extends string>(
    fn: FlowActionFunction<TContext, TEvent, TState>,
  ): FlowEffectAction<TContext, TEvent, TState>;
  can<TContext, TState extends string>(
    actorOrSnapshot: FlowActorRef<TContext, FlowEvent, TState> | FlowSnapshot<TContext, TState>,
    event: FlowEvent,
  ): boolean;
  match<TContext, TState extends string, TResult>(
    snapshot: FlowSnapshot<TContext, TState>,
    handlers: FlowMatchHandlers<FlowSnapshot<TContext, TState>, TResult>,
  ): TResult;
}

const RuntimeContext = React.createContext<FlowRuntime | null>(null);

export const flow: FlowApi = {
  machine<TContext, TEvent extends FlowEvent, TState extends string>(
    config: FlowMachineConfig<TContext, TEvent, TState>,
  ): FlowMachine<TContext, TEvent, TState> {
    return createMachineFromConfig(config);
  },
  assign<TContext, TEvent extends FlowEvent, TState extends string>(
    updater: FlowAssignUpdater<TContext, TEvent, TState>,
  ): FlowAssignAction<TContext, TEvent, TState> {
    return { kind: "assign", updater };
  },
  guard<TContext, TEvent extends FlowEvent, TState extends string>(
    predicate: FlowGuardPredicate<TContext, TEvent, TState>,
  ): FlowGuard<TContext, TEvent, TState> {
    return { kind: "guard", predicate };
  },
  action<TContext, TEvent extends FlowEvent, TState extends string>(
    fn: FlowActionFunction<TContext, TEvent, TState>,
  ): FlowEffectAction<TContext, TEvent, TState> {
    return { kind: "action", fn };
  },
  can<TContext, TState extends string>(
    actorOrSnapshot: FlowActorRef<TContext, FlowEvent, TState> | FlowSnapshot<TContext, TState>,
    event: FlowEvent,
  ): boolean {
    return isActor(actorOrSnapshot) ? actorOrSnapshot.can(event) : actorOrSnapshot.can(event);
  },
  match<TContext, TState extends string, TResult>(
    snapshot: FlowSnapshot<TContext, TState>,
    handlers: FlowMatchHandlers<FlowSnapshot<TContext, TState>, TResult>,
  ): TResult {
    const stateHandler = handlers[snapshot.value];
    return (stateHandler ?? handlers._)(snapshot);
  },
};

export function createRuntime(options: FlowRuntimeOptions = {}): FlowRuntime {
  return {
    createActor<TContext, TEvent extends FlowEvent, TState extends string>(
      machine: FlowMachine<TContext, TEvent, TState>,
      actorOptions?: FlowActorOptions<TContext>,
    ): FlowActorRef<TContext, TEvent, TState> {
      return new LocalFlowActor(machine, options, actorOptions);
    },
  };
}

export function FlowProvider(props: FlowProviderProps): React.ReactElement {
  const runtime = React.useMemo(() => props.runtime ?? createRuntime(), [props.runtime]);

  return React.createElement(RuntimeContext.Provider, { value: runtime }, props.children);
}

export function useFlow<TContext, TEvent extends FlowEvent, TState extends string>(
  machine: FlowMachine<TContext, TEvent, TState>,
  options?: FlowActorOptions<TContext>,
): FlowActorRef<TContext, TEvent, TState> {
  const runtime = React.useContext(RuntimeContext) ?? defaultRuntime;
  const actorRef = React.useRef<FlowActorRef<TContext, TEvent, TState> | null>(null);

  if (actorRef.current === null) {
    actorRef.current = runtime.createActor(machine, options);
  }

  const actor = actorRef.current;

  React.useSyncExternalStore(
    (listener) => actor.subscribe(listener),
    () => actor.getSnapshot(),
    () => actor.getSnapshot(),
  );

  return actor;
}

export function useSelector<TContext, TEvent extends FlowEvent, TState extends string, TSelected>(
  actorOrSnapshot: FlowActorRef<TContext, TEvent, TState> | FlowSnapshot<TContext, TState>,
  selector: (snapshot: FlowSnapshot<TContext, TState>) => TSelected,
  equality: (left: TSelected, right: TSelected) => boolean = Object.is,
): TSelected {
  const selectedRef = React.useRef<TSelected | null>(null);

  const snapshot = isActor(actorOrSnapshot)
    ? React.useSyncExternalStore(
        (listener) => actorOrSnapshot.subscribe(listener),
        () => actorOrSnapshot.getSnapshot(),
        () => actorOrSnapshot.getSnapshot(),
      )
    : actorOrSnapshot;

  const selected = selector(snapshot);
  if (selectedRef.current === null || !equality(selectedRef.current, selected)) {
    selectedRef.current = selected;
  }

  return selectedRef.current;
}

export function flowTest<TContext, TEvent extends FlowEvent, TState extends string>(
  machine: FlowMachine<TContext, TEvent, TState>,
): FlowTestHarness<TContext, TEvent, TState> {
  let actor = createRuntime().createActor(machine);

  const harness: FlowTestHarness<TContext, TEvent, TState> = {
    start(options?: FlowActorOptions<TContext>): FlowTestHarness<TContext, TEvent, TState> {
      actor = createRuntime().createActor(machine, options);
      return harness;
    },
    send(event: TEvent): FlowTestHarness<TContext, TEvent, TState> {
      actor.send(event);
      return harness;
    },
    expectState(state: TState): FlowTestHarness<TContext, TEvent, TState> {
      const actual = actor.getSnapshot().value;
      if (actual !== state) {
        throw new Error(`Expected state ${formatValue(state)}, received ${formatValue(actual)}.`);
      }

      return harness;
    },
    expectContext(
      expectation: Partial<TContext> | ((context: TContext) => void),
    ): FlowTestHarness<TContext, TEvent, TState> {
      const context = actor.getSnapshot().context;
      if (typeof expectation === "function") {
        expectation(context);
      } else {
        assertPartialMatch(context, expectation, "context");
      }

      return harness;
    },
    expectSnapshot(
      expectation:
        | Partial<FlowSnapshot<TContext, TState>>
        | ((snapshot: FlowSnapshot<TContext, TState>) => void),
    ): FlowTestHarness<TContext, TEvent, TState> {
      const snapshot = actor.getSnapshot();
      if (typeof expectation === "function") {
        expectation(snapshot);
      } else {
        assertPartialMatch(snapshot, expectation, "snapshot");
      }

      return harness;
    },
    expectCan(event: FlowEvent, expected = true): FlowTestHarness<TContext, TEvent, TState> {
      const actual = actor.can(event);
      if (actual !== expected) {
        throw new Error(
          `Expected can(${event.type}) to be ${formatValue(expected)}, received ${formatValue(
            actual,
          )}.`,
        );
      }

      return harness;
    },
    snapshot(): FlowSnapshot<TContext, TState> {
      return actor.getSnapshot();
    },
    state(): TState {
      return actor.getSnapshot().value;
    },
    context(): TContext {
      return actor.getSnapshot().context;
    },
    can(event: FlowEvent): boolean {
      return actor.can(event);
    },
    flush(): FlowTestHarness<TContext, TEvent, TState> {
      return harness;
    },
  };

  return harness;
}

const defaultRuntime = createRuntime();

class LocalFlowActor<
  TContext,
  TEvent extends FlowEvent,
  TState extends string,
> implements FlowActorRef<TContext, TEvent, TState> {
  readonly #machine: FlowMachine<TContext, TEvent, TState>;
  readonly #runtimeOptions: FlowRuntimeOptions;
  readonly #listeners = new Set<() => void>();
  #snapshot: FlowSnapshot<TContext, TState>;

  constructor(
    machine: FlowMachine<TContext, TEvent, TState>,
    runtimeOptions: FlowRuntimeOptions,
    actorOptions: FlowActorOptions<TContext> | undefined,
  ) {
    this.#machine = machine;
    this.#runtimeOptions = runtimeOptions;
    this.#snapshot = applyActorOptions(machine.getInitialSnapshot(), actorOptions);
    this.#runtimeOptions.inspect?.(this.#snapshot, null);
  }

  getSnapshot = (): FlowSnapshot<TContext, TState> => this.#snapshot;

  send = (event: TEvent): FlowSnapshot<TContext, TState> => {
    const nextSnapshot = this.#machine.transition(this.#snapshot, event);

    if (nextSnapshot !== this.#snapshot) {
      this.#snapshot = nextSnapshot;
      this.#runtimeOptions.inspect?.(this.#snapshot, event);
      for (const listener of this.#listeners) {
        listener();
      }
    }

    return this.#snapshot;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  can = (event: FlowEvent): boolean => this.#machine.can(this.#snapshot, event);
}

function createMachineFromConfig<TContext, TEvent extends FlowEvent, TState extends string>(
  config: FlowMachineConfig<TContext, TEvent, TState>,
): FlowMachine<TContext, TEvent, TState> {
  const machine: FlowMachine<TContext, TEvent, TState> = {
    id: config.id,
    initial: config.initial,
    config,
    getInitialSnapshot(): FlowSnapshot<TContext, TState> {
      return createSnapshot(machine, config.initial, createInitialContext(config), false, null);
    },
    transition(
      snapshot: FlowSnapshot<TContext, TState>,
      event: TEvent,
    ): FlowSnapshot<TContext, TState> {
      const transition = selectTransition(machine, snapshot, event);
      if (transition === null) {
        return snapshot;
      }

      let context = snapshot.context;
      const target = transition.target ?? snapshot.value;
      const nextBase = createSnapshot(machine, target, context, true, event);

      for (const update of normalizeUpdates(transition.update)) {
        const patch = update({ context, event, snapshot: nextBase });
        context = mergeContext(context, patch);
      }

      for (const action of normalizeActions(transition.actions)) {
        if (isAssignAction(action)) {
          const patch = action.updater({ context, event, snapshot: nextBase });
          context = mergeContext(context, patch);
        } else if (isEffectAction(action)) {
          action.fn({
            context,
            event,
            snapshot: createSnapshot(machine, target, context, true, event),
          });
        } else {
          action({
            context,
            event,
            snapshot: createSnapshot(machine, target, context, true, event),
          });
        }
      }

      return createSnapshot(machine, target, context, true, event);
    },
    can(snapshot: FlowSnapshot<TContext, TState>, event: FlowEvent): boolean {
      return selectTransition(machine, snapshot, event as TEvent) !== null;
    },
  };

  return machine;
}

function createSnapshot<TContext, TEvent extends FlowEvent, TState extends string>(
  machine: FlowMachine<TContext, TEvent, TState>,
  value: TState,
  context: TContext,
  changed: boolean,
  event: FlowEvent | null,
): FlowSnapshot<TContext, TState> {
  return {
    value,
    context,
    status: "active",
    changed,
    event,
    matches(state: TState): boolean {
      return value === state;
    },
    can(candidate: FlowEvent): boolean {
      return machine.can(this, candidate);
    },
  };
}

function createInitialContext<TContext, TEvent extends FlowEvent, TState extends string>(
  config: FlowMachineConfig<TContext, TEvent, TState>,
): TContext {
  const context = config.context;
  return typeof context === "function" ? (context as () => TContext)() : context;
}

function applyActorOptions<TContext, TState extends string>(
  snapshot: FlowSnapshot<TContext, TState>,
  options: FlowActorOptions<TContext> | undefined,
): FlowSnapshot<TContext, TState> {
  if (options?.context === undefined) {
    return snapshot;
  }

  const context =
    typeof options.context === "function"
      ? options.context(snapshot.context)
      : mergeContext(snapshot.context, options.context);

  return {
    ...snapshot,
    context,
  };
}

function selectTransition<TContext, TEvent extends FlowEvent, TState extends string>(
  machine: FlowMachine<TContext, TEvent, TState>,
  snapshot: FlowSnapshot<TContext, TState>,
  event: TEvent,
): FlowTransitionConfig<TContext, TEvent, TState> | null {
  const stateNode = machine.config.states[snapshot.value];
  const candidate = stateNode.on?.[event.type as TEvent["type"]];
  const transitions = normalizeTransitions(candidate);

  for (const transition of transitions) {
    if (allowsTransition(transition, snapshot, event)) {
      return transition;
    }
  }

  return null;
}

function normalizeTransitions<TContext, TEvent extends FlowEvent, TState extends string>(
  transition:
    | FlowTransition<TContext, TEvent, TState>
    | readonly FlowTransition<TContext, TEvent, TState>[]
    | undefined,
): readonly FlowTransitionConfig<TContext, TEvent, TState>[] {
  if (transition === undefined) {
    return [];
  }

  const transitions = Array.isArray(transition) ? transition : [transition];
  return transitions.map((item) => (typeof item === "string" ? { target: item } : item));
}

function allowsTransition<TContext, TEvent extends FlowEvent, TState extends string>(
  transition: FlowTransitionConfig<TContext, TEvent, TState>,
  snapshot: FlowSnapshot<TContext, TState>,
  event: TEvent,
): boolean {
  if (transition.guard === undefined) {
    return true;
  }

  const predicate =
    typeof transition.guard === "function" ? transition.guard : transition.guard.predicate;

  return predicate({ context: snapshot.context, event, snapshot });
}

function normalizeUpdates<TContext, TEvent extends FlowEvent, TState extends string>(
  update:
    | FlowUpdateReducer<TContext, TEvent, TState>
    | readonly FlowUpdateReducer<TContext, TEvent, TState>[]
    | undefined,
): readonly FlowUpdateReducer<TContext, TEvent, TState>[] {
  if (update === undefined) {
    return [];
  }

  if (Array.isArray(update)) {
    return update;
  }

  return [update as FlowUpdateReducer<TContext, TEvent, TState>];
}

function normalizeActions<TContext, TEvent extends FlowEvent, TState extends string>(
  actions:
    | FlowAction<TContext, TEvent, TState>
    | readonly FlowAction<TContext, TEvent, TState>[]
    | undefined,
): readonly FlowAction<TContext, TEvent, TState>[] {
  if (actions === undefined) {
    return [];
  }

  if (Array.isArray(actions)) {
    return actions as readonly FlowAction<TContext, TEvent, TState>[];
  }

  return [actions as FlowAction<TContext, TEvent, TState>];
}

function isAssignAction<TContext, TEvent extends FlowEvent, TState extends string>(
  action: FlowAction<TContext, TEvent, TState>,
): action is FlowAssignAction<TContext, TEvent, TState> {
  return typeof action === "object" && action.kind === "assign";
}

function isEffectAction<TContext, TEvent extends FlowEvent, TState extends string>(
  action: FlowAction<TContext, TEvent, TState>,
): action is FlowEffectAction<TContext, TEvent, TState> {
  return typeof action === "object" && action.kind === "action";
}

function mergeContext<TContext>(context: TContext, patch: Partial<TContext> | TContext): TContext {
  if (isRecord(context) && isRecord(patch)) {
    return { ...context, ...patch };
  }

  return patch as TContext;
}

function assertPartialMatch(actual: unknown, expected: unknown, path: string): void {
  if (isRecord(expected)) {
    if (!isRecord(actual)) {
      throw new Error(
        `Expected ${path} to be an object matching ${formatValue(expected)}, received ${formatValue(
          actual,
        )}.`,
      );
    }

    for (const key of Reflect.ownKeys(expected)) {
      assertPartialMatch(actual[key], expected[key], `${path}.${String(key)}`);
    }

    return;
  }

  if (!valuesMatch(actual, expected)) {
    throw new Error(
      `Expected ${path} to be ${formatValue(expected)}, received ${formatValue(actual)}.`,
    );
  }
}

function valuesMatch(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) {
    return true;
  }

  return JSON.stringify(actual) === JSON.stringify(expected);
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return `"${value}"`;
  }

  return JSON.stringify(value) ?? String(value);
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isActor<TContext, TEvent extends FlowEvent, TState extends string>(
  value: FlowActorRef<TContext, TEvent, TState> | FlowSnapshot<TContext, TState>,
): value is FlowActorRef<TContext, TEvent, TState> {
  return "send" in value && "subscribe" in value;
}
