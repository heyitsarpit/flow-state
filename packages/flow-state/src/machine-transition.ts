import type {
  FlowActionDefinition,
  FlowEvent,
  FlowReceipt,
  FlowSnapshot,
  FlowTransitionArgs,
  FlowTransitionDefinition,
} from "./public/types.js";

type PlannedActionPhase = "exit" | "transition" | "entry";

type PlannedAction<Context, Event extends FlowEvent, State extends string> = Readonly<{
  readonly phase: PlannedActionPhase;
  readonly index: number;
  readonly action: FlowActionDefinition<Context, Event, State>;
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

function transitionsFor<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  eventType: Event["type"],
): ReadonlyArray<FlowTransitionDefinition<Context, Event, State>> {
  const configured = snapshot.machine.config.states[snapshot.value]?.on?.[eventType];
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
  const args = transitionArgs(snapshot, event);
  const receipts: Array<FlowReceipt> = [
    {
      type: "machine:event",
      id: snapshot.machine.id,
      source: "machine",
      eventType: event.type,
    },
  ];

  const transitions = transitionsFor(snapshot, event.type);

  for (const [index, transition] of transitions.entries()) {
    const passed = guardPassed(transition, args);
    if (transition.guard !== undefined) {
      receipts.push({
        type: "machine:guard",
        id: snapshot.machine.id,
        source: "machine",
        eventType: event.type,
        index,
        result: passed ? "pass" : "fail",
      });
    }

    if (!passed) {
      continue;
    }

    return {
      matched: true,
      snapshot,
      event,
      transition,
      transitionIndex: index,
      receipts,
    };
  }

  receipts.push({
    type: "machine:no-transition",
    id: snapshot.machine.id,
    source: "machine",
    eventType: event.type,
  });

  return {
    matched: false,
    snapshot,
    event,
    receipts,
  };
}

export function applyMachineEvent<Context, Event extends FlowEvent, State extends string>(
  plan: MachineEventPlan<Context, Event, State>,
): FlowSnapshot<Context, State, Event> {
  if (!plan.matched) {
    return appendSnapshotReceipts(plan.snapshot, plan.receipts);
  }

  const updateArgs = argsForSnapshot(plan.snapshot, plan.event, plan.snapshot.receipts);
  const partial = plan.transition.update?.(updateArgs);
  const nextContext = applyContextUpdate(plan.snapshot.context, partial);
  const nextValue = plan.transition.target ?? plan.snapshot.value;
  const receipts = [...plan.receipts];

  receipts.push({
    type: "machine:transition",
    id: plan.snapshot.machine.id,
    source: "machine",
    eventType: plan.event.type,
    index: plan.transitionIndex,
    from: plan.snapshot.value,
    to: nextValue,
  });

  if (plan.transition.update !== undefined) {
    receipts.push({
      type: "machine:update",
      id: plan.snapshot.machine.id,
      source: "machine",
      eventType: plan.event.type,
      index: plan.transitionIndex,
    });
  }

  const exitSnapshot = Object.freeze({
    ...plan.snapshot,
    receipts: [...plan.snapshot.receipts, ...receipts],
  });
  const nextSnapshot = Object.freeze({
    ...plan.snapshot,
    value: nextValue,
    context: nextContext,
    receipts: [...plan.snapshot.receipts, ...receipts],
  });
  const plannedActions = stateActionsForPhase(plan.snapshot, nextValue, plan.transition);
  let accumulatedReceipts = [...plan.snapshot.receipts, ...receipts];

  for (const plannedAction of plannedActions) {
    const phaseSnapshot = plannedAction.phase === "exit" ? exitSnapshot : nextSnapshot;
    accumulatedReceipts.push({
      type: "machine:action",
      id: plan.snapshot.machine.id,
      source: "machine",
      eventType: plan.event.type,
      phase: plannedAction.phase,
      index: plannedAction.index,
    });
    accumulatedReceipts.push(
      ...actionReceipts(
        plannedAction.action(argsForSnapshot(phaseSnapshot, plan.event, accumulatedReceipts)),
      ),
    );
  }

  return Object.freeze({
    ...plan.snapshot,
    value: nextValue,
    context: nextContext,
    receipts: accumulatedReceipts,
  });
}

export function canMachineTransition<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
): boolean {
  return planMachineEvent(snapshot, event).matched;
}
