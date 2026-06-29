import type {
  FlowActionDefinition,
  FlowAfterDefinition,
  FlowEvent,
  FlowEventTransitions,
  FlowReceipt,
  FlowSnapshot,
  FlowTransitionArgs,
  FlowTransitionDefinition,
  FlowTransitionRuntime,
} from "./public/types.js";
import { runMachineCallback } from "./machine-callbacks.js";

const MAX_INTERNAL_MICROSTEPS = 100;
const defaultRuntime: FlowTransitionRuntime = Object.freeze({
  now: () => 0,
});

type PlannedActionPhase = "exit" | "transition" | "entry";
type TransitionTrigger = "event" | "always" | "after";

type PlannedAction<Context, Event extends FlowEvent, State extends string> = Readonly<{
  readonly phase: PlannedActionPhase;
  readonly index: number;
  readonly action: FlowActionDefinition<Context, Event, State>;
}>;

type MatchedTransitionSelection<Context, Event extends FlowEvent, State extends string> = Readonly<{
  readonly matched: true;
  readonly transition: FlowTransitionDefinition<Context, Event, State>;
  readonly transitionIndex: number;
  readonly receipts: ReadonlyArray<FlowReceipt>;
}>;

type UnmatchedTransitionSelection = Readonly<{
  readonly matched: false;
  readonly receipts: ReadonlyArray<FlowReceipt>;
}>;

type MatchedTransitionPlan<Context, Event extends FlowEvent, State extends string> = Readonly<{
  readonly matched: true;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly event: Event;
  readonly transition: FlowTransitionDefinition<Context, Event, State>;
  readonly transitionIndex: number;
  readonly receipts: ReadonlyArray<FlowReceipt>;
}>;

type UnmatchedTransitionPlan<Context, Event extends FlowEvent, State extends string> = Readonly<{
  readonly matched: false;
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly event: Event;
  readonly receipts: ReadonlyArray<FlowReceipt>;
}>;

export type MachineEventPlan<Context, Event extends FlowEvent, State extends string> =
  | MatchedTransitionPlan<Context, Event, State>
  | UnmatchedTransitionPlan<Context, Event, State>;

export type AppliedMachineEvent<Context, Event extends FlowEvent, State extends string> = Readonly<{
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly reentered: boolean;
}>;

function isReadonlyArray<T>(value: T | ReadonlyArray<T>): value is ReadonlyArray<T> {
  return Array.isArray(value);
}

function transitionArgs<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
  runtime: FlowTransitionRuntime = defaultRuntime,
): FlowTransitionArgs<Context, Event, State> {
  return {
    context: snapshot.context,
    event,
    value: snapshot.value,
    snapshot,
    resources: snapshot.resources,
    transactions: snapshot.transactions,
    streams: snapshot.streams,
    timers: snapshot.timers,
    children: snapshot.children,
    receipts: snapshot.receipts,
    runtime,
  };
}

function normalizeTransitionDefinitions<Context, Event extends FlowEvent, State extends string>(
  configured: FlowEventTransitions<Context, Event, State> | undefined,
): ReadonlyArray<FlowTransitionDefinition<Context, Event, State>> {
  if (configured === undefined) {
    return [];
  }

  if (typeof configured === "string") {
    return [{ target: configured as State }];
  }

  if (Array.isArray(configured)) {
    return configured as ReadonlyArray<FlowTransitionDefinition<Context, Event, State>>;
  }

  return [configured as FlowTransitionDefinition<Context, Event, State>];
}

function transitionsFor<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  eventType: Event["type"],
): ReadonlyArray<FlowTransitionDefinition<Context, Event, State>> {
  return normalizeTransitionDefinitions(
    snapshot.machine.config.states[snapshot.value]?.on?.[eventType] as
      | FlowEventTransitions<Context, Event, State>
      | undefined,
  );
}

function alwaysTransitionsFor<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
): ReadonlyArray<FlowTransitionDefinition<Context, Event, State>> {
  return normalizeTransitionDefinitions(
    snapshot.machine.config.states[snapshot.value]?.always as
      | FlowEventTransitions<Context, Event, State>
      | undefined,
  );
}

function normalizeAfterDefinitions<Context, Event extends FlowEvent, State extends string>(
  configured:
    | FlowAfterDefinition<State, Context, Event>
    | ReadonlyArray<FlowAfterDefinition<State, Context, Event>>
    | undefined,
): ReadonlyArray<FlowAfterDefinition<State, Context, Event>> {
  if (configured === undefined) {
    return [];
  }

  if (isReadonlyArray(configured)) {
    return configured;
  }

  return [configured];
}

export function afterDefinitionsForState<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
): ReadonlyArray<FlowAfterDefinition<State, Context, Event>> {
  return normalizeAfterDefinitions(
    snapshot.machine.config.states[snapshot.value]?.after as
      | FlowAfterDefinition<State, Context, Event>
      | ReadonlyArray<FlowAfterDefinition<State, Context, Event>>
      | undefined,
  );
}

function normalizeActions<Context, Event extends FlowEvent, State extends string>(
  configured:
    | FlowActionDefinition<Context, Event, State>
    | ReadonlyArray<FlowActionDefinition<Context, Event, State>>
    | undefined,
): ReadonlyArray<FlowActionDefinition<Context, Event, State>> {
  if (configured === undefined) {
    return [];
  }

  if (isReadonlyArray(configured)) {
    return configured;
  }

  return [configured];
}

function applyContextUpdate<Context>(
  current: Context,
  partial: Partial<Context> | undefined,
): Context {
  if (partial === undefined || Object.keys(partial).length === 0) {
    return current;
  }

  return {
    ...current,
    ...partial,
  };
}

function actionReceipts(
  result: void | FlowReceipt | ReadonlyArray<FlowReceipt>,
): Array<FlowReceipt> {
  if (result === undefined) {
    return [];
  }

  if (isReadonlyArray(result)) {
    return [...result];
  }

  return [result];
}

function appendSnapshotReceipts<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  receipts: ReadonlyArray<FlowReceipt>,
  value: State = snapshot.value,
  context: Context = snapshot.context,
): FlowSnapshot<Context, State, Event> {
  return Object.freeze({
    ...snapshot,
    value,
    context,
    receipts: [...snapshot.receipts, ...receipts],
  });
}

function argsForSnapshot<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
  receipts: ReadonlyArray<FlowReceipt>,
  runtime: FlowTransitionRuntime = defaultRuntime,
): FlowTransitionArgs<Context, Event, State> {
  return transitionArgs(
    Object.freeze({
      ...snapshot,
      receipts,
    }),
    event,
    runtime,
  );
}

function guardPassed<Context, Event extends FlowEvent, State extends string>(
  transition: FlowTransitionDefinition<Context, Event, State>,
  args: FlowTransitionArgs<Context, Event, State>,
): boolean {
  if (transition.guard === undefined) {
    return true;
  }

  try {
    return transition.guard(args);
  } catch {
    return false;
  }
}

function planTransitionSelection<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
  transitions: ReadonlyArray<FlowTransitionDefinition<Context, Event, State>>,
  step: number,
  trigger: TransitionTrigger,
  runtime: FlowTransitionRuntime = defaultRuntime,
): MatchedTransitionSelection<Context, Event, State> | UnmatchedTransitionSelection {
  const args = transitionArgs(snapshot, event, runtime);
  const receipts: Array<FlowReceipt> = [];

  for (const [index, transition] of transitions.entries()) {
    const passed = guardPassed(transition, args);
    if (transition.guard !== undefined) {
      receipts.push({
        type: "machine:guard",
        id: snapshot.machine.id,
        source: "machine",
        eventType: event.type,
        trigger,
        step,
        index,
        result: passed ? "pass" : "fail",
      });
    }

    if (!passed) {
      continue;
    }

    return {
      matched: true,
      transition,
      transitionIndex: index,
      receipts,
    };
  }

  return {
    matched: false,
    receipts,
  };
}

function stateActionsForPhase<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  nextValue: State,
  transition: FlowTransitionDefinition<Context, Event, State>,
): ReadonlyArray<PlannedAction<Context, Event, State>> {
  const actions: Array<PlannedAction<Context, Event, State>> = [];
  const reentersState = transition.reenter === true && nextValue === snapshot.value;

  if (nextValue !== snapshot.value || reentersState) {
    normalizeActions(snapshot.machine.config.states[snapshot.value]?.exit).forEach(
      (action, index) => {
        actions.push({ phase: "exit", index, action });
      },
    );
  }

  normalizeActions(transition.actions).forEach((action, index) => {
    actions.push({ phase: "transition", index, action });
  });

  if (nextValue !== snapshot.value || reentersState) {
    normalizeActions(snapshot.machine.config.states[nextValue]?.entry).forEach((action, index) => {
      actions.push({ phase: "entry", index, action });
    });
  }

  return actions;
}

export function planMachineEvent<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
  runtime: FlowTransitionRuntime = defaultRuntime,
): MachineEventPlan<Context, Event, State> {
  const receipts: Array<FlowReceipt> = [
    {
      type: "machine:event",
      id: snapshot.machine.id,
      source: "machine",
      eventType: event.type,
      trigger: "event",
      step: 0,
    },
  ];

  const selection = planTransitionSelection(
    snapshot,
    event,
    transitionsFor(snapshot, event.type),
    0,
    "event",
    runtime,
  );
  receipts.push(...selection.receipts);

  if (selection.matched) {
    return {
      matched: true,
      snapshot,
      event,
      transition: selection.transition,
      transitionIndex: selection.transitionIndex,
      receipts,
    };
  }

  receipts.push({
    type: "machine:no-transition",
    id: snapshot.machine.id,
    source: "machine",
    eventType: event.type,
    trigger: "event",
    step: 0,
  });

  return {
    matched: false,
    snapshot,
    event,
    receipts,
  };
}

function applyMatchedTransition<Context, Event extends FlowEvent, State extends string>(args: {
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly event: Event;
  readonly transition: FlowTransitionDefinition<Context, Event, State>;
  readonly transitionIndex: number;
  readonly receipts: ReadonlyArray<FlowReceipt>;
  readonly step: number;
  readonly trigger: TransitionTrigger;
  readonly runtime: FlowTransitionRuntime;
}): AppliedMachineEvent<Context, Event, State> {
  const { event, receipts, runtime, snapshot, step, transition, transitionIndex, trigger } = args;
  const updateArgs = argsForSnapshot(snapshot, event, snapshot.receipts, runtime);
  const partial =
    transition.update === undefined
      ? undefined
      : runMachineCallback(
          snapshot.machine.id,
          "update",
          () => transition.update?.(updateArgs),
          event.type,
          snapshot.value,
          trigger,
          step,
        );
  const nextContext = applyContextUpdate(snapshot.context, partial);
  const nextValue = transition.target ?? snapshot.value;
  const reentersState = transition.reenter === true && nextValue === snapshot.value;
  const stepReceipts = [...receipts];

  stepReceipts.push({
    type: "machine:transition",
    id: snapshot.machine.id,
    source: "machine",
    eventType: event.type,
    trigger,
    step,
    index: transitionIndex,
    from: snapshot.value,
    to: nextValue,
    ...(reentersState ? { reenter: true } : {}),
  });

  if (transition.update !== undefined) {
    stepReceipts.push({
      type: "machine:update",
      id: snapshot.machine.id,
      source: "machine",
      eventType: event.type,
      trigger,
      step,
      index: transitionIndex,
    });
  }

  const exitSnapshot = Object.freeze({
    ...snapshot,
    receipts: [...snapshot.receipts, ...stepReceipts],
  });
  const nextSnapshot = Object.freeze({
    ...snapshot,
    value: nextValue,
    context: nextContext,
    receipts: [...snapshot.receipts, ...stepReceipts],
  });
  const plannedActions = stateActionsForPhase(snapshot, nextValue, transition);
  let accumulatedReceipts = [...snapshot.receipts, ...stepReceipts];

  for (const plannedAction of plannedActions) {
    const phaseSnapshot = plannedAction.phase === "exit" ? exitSnapshot : nextSnapshot;
    const callback =
      plannedAction.phase === "transition"
        ? "actions.transition"
        : plannedAction.phase === "entry"
          ? "actions.entry"
          : "actions.exit";
    accumulatedReceipts.push({
      type: "machine:action",
      id: snapshot.machine.id,
      source: "machine",
      eventType: event.type,
      trigger,
      step,
      phase: plannedAction.phase,
      index: plannedAction.index,
    });
    const actionResult = runMachineCallback(
      snapshot.machine.id,
      callback,
      () =>
        plannedAction.action(argsForSnapshot(phaseSnapshot, event, accumulatedReceipts, runtime)),
      event.type,
      phaseSnapshot.value,
      trigger,
      step,
    );
    accumulatedReceipts.push(...actionReceipts(actionResult));
  }

  accumulatedReceipts.push({
    type: "machine:microstep",
    id: snapshot.machine.id,
    source: "machine",
    eventType: event.type,
    trigger,
    step,
    index: transitionIndex,
    from: snapshot.value,
    to: nextValue,
    ...(reentersState ? { reenter: true } : {}),
  });

  return Object.freeze({
    snapshot: Object.freeze({
      ...snapshot,
      value: nextValue,
      context: nextContext,
      receipts: accumulatedReceipts,
    }),
    reentered: reentersState,
  });
}

function planAlwaysTransition<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
  step: number,
  runtime: FlowTransitionRuntime = defaultRuntime,
): MatchedTransitionSelection<Context, Event, State> | UnmatchedTransitionSelection {
  const transitions = alwaysTransitionsFor(snapshot);
  if (transitions.length === 0) {
    return {
      matched: false,
      receipts: [],
    };
  }

  return planTransitionSelection(snapshot, event, transitions, step, "always", runtime);
}

function resolveAlwaysMicrosteps<Context, Event extends FlowEvent, State extends string>(
  initial: AppliedMachineEvent<Context, Event, State>,
  event: Event,
  runtime: FlowTransitionRuntime = defaultRuntime,
): AppliedMachineEvent<Context, Event, State> {
  let nextSnapshot = initial.snapshot;
  let reentered = initial.reentered;
  let step = 1;
  let stepsApplied = 0;

  while (stepsApplied < MAX_INTERNAL_MICROSTEPS) {
    const selection = planAlwaysTransition(nextSnapshot, event, step, runtime);
    if (!selection.matched) {
      return Object.freeze({
        snapshot:
          selection.receipts.length === 0
            ? nextSnapshot
            : appendSnapshotReceipts(nextSnapshot, selection.receipts),
        reentered,
      });
    }

    const applied = applyMatchedTransition({
      snapshot: nextSnapshot,
      event,
      transition: selection.transition,
      transitionIndex: selection.transitionIndex,
      receipts: selection.receipts,
      step,
      trigger: "always",
      runtime,
    });
    nextSnapshot = applied.snapshot;
    reentered = reentered || applied.reentered;
    step += 1;
    stepsApplied += 1;
  }

  const selection = planAlwaysTransition(nextSnapshot, event, step, runtime);
  if (!selection.matched) {
    return Object.freeze({
      snapshot:
        selection.receipts.length === 0
          ? nextSnapshot
          : appendSnapshotReceipts(nextSnapshot, selection.receipts),
      reentered,
    });
  }

  return Object.freeze({
    snapshot: appendSnapshotReceipts(nextSnapshot, [
      ...selection.receipts,
      {
        type: "machine:microstep-limit",
        id: nextSnapshot.machine.id,
        source: "machine",
        eventType: event.type,
        trigger: "always",
        step,
        limit: MAX_INTERNAL_MICROSTEPS,
      },
    ]),
    reentered,
  });
}

export function applyMachineEventWithMeta<Context, Event extends FlowEvent, State extends string>(
  plan: MachineEventPlan<Context, Event, State>,
  runtime: FlowTransitionRuntime = defaultRuntime,
): AppliedMachineEvent<Context, Event, State> {
  if (!plan.matched) {
    return Object.freeze({
      snapshot: appendSnapshotReceipts(plan.snapshot, plan.receipts),
      reentered: false,
    });
  }

  return resolveAlwaysMicrosteps(
    applyMatchedTransition({
      snapshot: plan.snapshot,
      event: plan.event,
      transition: plan.transition,
      transitionIndex: plan.transitionIndex,
      receipts: plan.receipts,
      step: 0,
      trigger: "event",
      runtime,
    }),
    plan.event,
    runtime,
  );
}

export function applyMachineEvent<Context, Event extends FlowEvent, State extends string>(
  plan: MachineEventPlan<Context, Event, State>,
  runtime: FlowTransitionRuntime = defaultRuntime,
): FlowSnapshot<Context, State, Event> {
  return applyMachineEventWithMeta(plan, runtime).snapshot;
}

export function applyAfterTransitionWithMeta<
  Context,
  Event extends FlowEvent,
  State extends string,
>(
  snapshot: FlowSnapshot<Context, State, Event>,
  definition: FlowAfterDefinition<State, Context, Event>,
  runtime: FlowTransitionRuntime = defaultRuntime,
): AppliedMachineEvent<Context, Event, State> {
  const event = {
    type: `flow.after.${definition.id}`,
  } as Event;
  const receipts: Array<FlowReceipt> = [
    {
      type: "machine:event",
      id: snapshot.machine.id,
      source: "machine",
      eventType: event.type,
      trigger: "after",
      step: 0,
    },
  ];
  const transition: FlowTransitionDefinition<Context, Event, State> = {
    ...(definition.config.target === undefined ? {} : { target: definition.config.target }),
    ...(definition.config.guard === undefined ? {} : { guard: definition.config.guard }),
    ...(definition.config.update === undefined ? {} : { update: definition.config.update }),
  };

  const selection = planTransitionSelection(snapshot, event, [transition], 0, "after", runtime);
  receipts.push(...selection.receipts);

  if (!selection.matched) {
    receipts.push({
      type: "machine:no-transition",
      id: snapshot.machine.id,
      source: "machine",
      eventType: event.type,
      trigger: "after",
      step: 0,
    });
    return Object.freeze({
      snapshot: appendSnapshotReceipts(snapshot, receipts),
      reentered: false,
    });
  }

  return resolveAlwaysMicrosteps(
    applyMatchedTransition({
      snapshot,
      event,
      transition: selection.transition,
      transitionIndex: selection.transitionIndex,
      receipts,
      step: 0,
      trigger: "after",
      runtime,
    }),
    event,
    runtime,
  );
}

export function canMachineTransition<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
  runtime: FlowTransitionRuntime = defaultRuntime,
): boolean {
  return planMachineEvent(snapshot, event, runtime).matched;
}
