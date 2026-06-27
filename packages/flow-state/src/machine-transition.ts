import type {
  FlowActionDefinition,
  FlowEvent,
  FlowEventTransitions,
  FlowReceipt,
  FlowSnapshot,
  FlowTransitionArgs,
  FlowTransitionDefinition,
} from "./public/types.js";

const MAX_INTERNAL_MICROSTEPS = 100;

type PlannedActionPhase = "exit" | "transition" | "entry";
type TransitionTrigger = "event" | "always";

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

function isReadonlyArray<T>(value: T | ReadonlyArray<T>): value is ReadonlyArray<T> {
  return Array.isArray(value);
}

function transitionArgs<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
): FlowTransitionArgs<Context, Event, State> {
  return {
    context: snapshot.context,
    event,
    value: snapshot.value,
    snapshot,
    resources: snapshot.resources,
    transactions: snapshot.transactions,
    streams: snapshot.streams,
    children: snapshot.children,
    receipts: snapshot.receipts,
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
): FlowTransitionArgs<Context, Event, State> {
  return transitionArgs(
    Object.freeze({
      ...snapshot,
      receipts,
    }),
    event,
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
): MatchedTransitionSelection<Context, Event, State> | UnmatchedTransitionSelection {
  const args = transitionArgs(snapshot, event);
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

  if (nextValue !== snapshot.value) {
    normalizeActions(snapshot.machine.config.states[snapshot.value]?.exit).forEach(
      (action, index) => {
        actions.push({ phase: "exit", index, action });
      },
    );
  }

  normalizeActions(transition.actions).forEach((action, index) => {
    actions.push({ phase: "transition", index, action });
  });

  if (nextValue !== snapshot.value) {
    normalizeActions(snapshot.machine.config.states[nextValue]?.entry).forEach((action, index) => {
      actions.push({ phase: "entry", index, action });
    });
  }

  return actions;
}

export function planMachineEvent<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
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
}): FlowSnapshot<Context, State, Event> {
  const { event, receipts, snapshot, step, transition, transitionIndex, trigger } = args;
  const updateArgs = argsForSnapshot(snapshot, event, snapshot.receipts);
  const partial = transition.update?.(updateArgs);
  const nextContext = applyContextUpdate(snapshot.context, partial);
  const nextValue = transition.target ?? snapshot.value;
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
    accumulatedReceipts.push(
      ...actionReceipts(
        plannedAction.action(argsForSnapshot(phaseSnapshot, event, accumulatedReceipts)),
      ),
    );
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
  });

  return Object.freeze({
    ...snapshot,
    value: nextValue,
    context: nextContext,
    receipts: accumulatedReceipts,
  });
}

function planAlwaysTransition<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
  step: number,
): MatchedTransitionSelection<Context, Event, State> | UnmatchedTransitionSelection {
  const transitions = alwaysTransitionsFor(snapshot);
  if (transitions.length === 0) {
    return {
      matched: false,
      receipts: [],
    };
  }

  return planTransitionSelection(snapshot, event, transitions, step, "always");
}

function resolveAlwaysMicrosteps<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
): FlowSnapshot<Context, State, Event> {
  let nextSnapshot = snapshot;
  let step = 1;
  let stepsApplied = 0;

  while (stepsApplied < MAX_INTERNAL_MICROSTEPS) {
    const selection = planAlwaysTransition(nextSnapshot, event, step);
    if (!selection.matched) {
      return selection.receipts.length === 0
        ? nextSnapshot
        : appendSnapshotReceipts(nextSnapshot, selection.receipts);
    }

    nextSnapshot = applyMatchedTransition({
      snapshot: nextSnapshot,
      event,
      transition: selection.transition,
      transitionIndex: selection.transitionIndex,
      receipts: selection.receipts,
      step,
      trigger: "always",
    });
    step += 1;
    stepsApplied += 1;
  }

  const selection = planAlwaysTransition(nextSnapshot, event, step);
  if (!selection.matched) {
    return selection.receipts.length === 0
      ? nextSnapshot
      : appendSnapshotReceipts(nextSnapshot, selection.receipts);
  }

  return appendSnapshotReceipts(nextSnapshot, [
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
  ]);
}

export function applyMachineEvent<Context, Event extends FlowEvent, State extends string>(
  plan: MachineEventPlan<Context, Event, State>,
): FlowSnapshot<Context, State, Event> {
  if (!plan.matched) {
    return appendSnapshotReceipts(plan.snapshot, plan.receipts);
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
    }),
    plan.event,
  );
}

export function canMachineTransition<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
): boolean {
  return planMachineEvent(snapshot, event).matched;
}
