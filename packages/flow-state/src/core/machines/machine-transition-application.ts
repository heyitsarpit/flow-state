import type {
  FlowActionDefinition,
  FlowEvent,
  FlowReceipt,
  FlowSnapshot,
  FlowTransitionActionCounts,
  FlowTransitionArgs,
  FlowTransitionDefinition,
  FlowTransitionRuntime,
} from "../api/types.js";
import { machineCallbackThrewDiagnostic } from "../../shared/diagnostics.js";
import { recoverSnapshotStateNode } from "./machine-family.js";

type PlannedActionPhase = "exit" | "transition" | "entry";
type TransitionTrigger = "event" | "always" | "after";
type MachineTransitionCallbackName =
  | "update"
  | "actions.transition"
  | "actions.entry"
  | "actions.exit";

type PlannedAction<Context, Event extends FlowEvent, State extends string> = Readonly<{
  readonly phase: PlannedActionPhase;
  readonly index: number;
  readonly action: FlowActionDefinition<Context, Event, State>;
}>;

export type AppliedMachineEvent<Context, Event extends FlowEvent, State extends string> = Readonly<{
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly reentered: boolean;
}>;

function isReadonlyArray<T>(value: T | ReadonlyArray<T>): value is ReadonlyArray<T> {
  return Array.isArray(value);
}

function runTransitionCallback<Result>(args: {
  readonly machineId: string;
  readonly callback: MachineTransitionCallbackName;
  readonly run: () => Result;
  readonly eventType: string;
  readonly state: string;
  readonly trigger: TransitionTrigger;
  readonly step: number;
}): Result {
  try {
    return args.run();
  } catch (cause) {
    throw machineCallbackThrewDiagnostic({
      machineId: args.machineId,
      callback: args.callback,
      eventType: args.eventType,
      state: args.state,
      trigger: args.trigger,
      step: args.step,
      cause,
    });
  }
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

function argsForSnapshot<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
  receipts: ReadonlyArray<FlowReceipt>,
  runtime: FlowTransitionRuntime,
): FlowTransitionArgs<Context, Event, State> {
  return {
    context: snapshot.context,
    event,
    value: snapshot.value,
    snapshot: Object.freeze({
      ...snapshot,
      receipts,
    }),
    resources: snapshot.resources,
    transactions: snapshot.transactions,
    streams: snapshot.streams,
    timers: snapshot.timers,
    children: snapshot.children,
    receipts,
    runtime,
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
    normalizeActions(recoverSnapshotStateNode(snapshot, snapshot.value)?.exit).forEach(
      (action, index) => {
        actions.push({ phase: "exit", index, action });
      },
    );
  }

  normalizeActions(transition.actions).forEach((action, index) => {
    actions.push({ phase: "transition", index, action });
  });

  if (nextValue !== snapshot.value || reentersState) {
    normalizeActions(recoverSnapshotStateNode(snapshot, nextValue)?.entry).forEach(
      (action, index) => {
        actions.push({ phase: "entry", index, action });
      },
    );
  }

  return actions;
}

export function actionCountsForTransition<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  nextValue: State,
  transition: FlowTransitionDefinition<Context, Event, State>,
): FlowTransitionActionCounts {
  let exit = 0;
  let transitionCount = 0;
  let entry = 0;

  for (const plannedAction of stateActionsForPhase(snapshot, nextValue, transition)) {
    if (plannedAction.phase === "exit") {
      exit += 1;
      continue;
    }

    if (plannedAction.phase === "entry") {
      entry += 1;
      continue;
    }

    transitionCount += 1;
  }

  return Object.freeze({
    exit,
    transition: transitionCount,
    entry,
  });
}

export function applyMatchedTransition<
  Context,
  Event extends FlowEvent,
  State extends string,
>(args: {
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
  const update = transition.update;
  const partial =
    update === undefined
      ? undefined
      : runTransitionCallback({
          machineId: snapshot.machine.id,
          callback: "update",
          run: () => update(updateArgs),
          eventType: event.type,
          state: snapshot.value,
          trigger,
          step,
        });
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
      from: snapshot.value,
      to: nextValue,
      ...(reentersState ? { reenter: true } : {}),
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
      transitionIndex,
      from: snapshot.value,
      to: nextValue,
      ...(reentersState ? { reenter: true } : {}),
    });
    const actionResult = runTransitionCallback({
      machineId: snapshot.machine.id,
      callback,
      run: () =>
        plannedAction.action(argsForSnapshot(phaseSnapshot, event, accumulatedReceipts, runtime)),
      eventType: event.type,
      state: phaseSnapshot.value,
      trigger,
      step,
    });
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
