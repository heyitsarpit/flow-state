import type {
  FlowEvent,
  FlowReceipt,
  FlowSnapshot,
  FlowTransitionArgs,
  FlowTransitionDefinition,
} from "./public/types.js";

type PlannedTransition<Context, Event extends FlowEvent, State extends string> = Readonly<{
  readonly matched: boolean;
  readonly nextSnapshot: FlowSnapshot<Context, State, Event>;
}>;

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
  eventType: string,
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

function appendReceipts<Context, Event extends FlowEvent, State extends string>(
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

export function planMachineEvent<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
): PlannedTransition<Context, Event, State> {
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

    const partial = transition.update?.(args);
    const nextContext = applyContextUpdate(snapshot.context, partial);
    const nextValue = transition.target ?? snapshot.value;

    receipts.push({
      type: "machine:transition",
      id: snapshot.machine.id,
      source: "machine",
      eventType: event.type,
      index,
      from: snapshot.value,
      to: nextValue,
    });

    if (transition.update !== undefined) {
      receipts.push({
        type: "machine:update",
        id: snapshot.machine.id,
        source: "machine",
        eventType: event.type,
        index,
      });
    }

    return {
      matched: true,
      nextSnapshot: appendReceipts(snapshot, receipts, nextValue, nextContext),
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
    nextSnapshot: appendReceipts(snapshot, receipts),
  };
}

export function canMachineTransition<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
): boolean {
  return planMachineEvent(snapshot, event).matched;
}
