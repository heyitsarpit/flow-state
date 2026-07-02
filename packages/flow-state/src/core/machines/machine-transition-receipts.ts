import type {
  FlowEvent,
  FlowReceipt,
  FlowSnapshot,
  FlowTransitionArgs,
  FlowTransitionCandidate,
  FlowTransitionDefinition,
  FlowTransitionRuntime,
} from "../api/types.js";
import { actionCountsForTransition } from "./machine-transition-application.js";

const defaultRuntime: FlowTransitionRuntime = Object.freeze({
  now: () => 0,
});

export type TransitionTrigger = "event" | "always" | "after";

export type MatchedTransitionSelection<
  Context,
  Event extends FlowEvent,
  State extends string,
> = Readonly<{
  readonly matched: true;
  readonly transition: FlowTransitionDefinition<Context, Event, State>;
  readonly transitionIndex: number;
  readonly receipts: ReadonlyArray<FlowReceipt>;
}>;

export type UnmatchedTransitionSelection = Readonly<{
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

export type InspectedTransitionSelection<Context, Event extends FlowEvent, State extends string> =
  | (MatchedTransitionSelection<Context, Event, State> & {
      readonly candidates: ReadonlyArray<FlowTransitionCandidate<State>>;
    })
  | (UnmatchedTransitionSelection & {
      readonly candidates: ReadonlyArray<FlowTransitionCandidate<State>>;
    });

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

export function appendSnapshotReceipts<Context, Event extends FlowEvent, State extends string>(
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

export function planTransitionSelection<Context, Event extends FlowEvent, State extends string>(
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
    const target = transition.target ?? snapshot.value;
    const reentersState = transition.reenter === true && target === snapshot.value;
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
        from: snapshot.value,
        target,
        ...(reentersState ? { reenter: true } : {}),
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

function transitionCandidateFor<Context, Event extends FlowEvent, State extends string>(args: {
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly transition: FlowTransitionDefinition<Context, Event, State>;
  readonly index: number;
  readonly guard: FlowTransitionCandidate<State>["guard"];
}): FlowTransitionCandidate<State> {
  const { guard, index, snapshot, transition } = args;
  const target = transition.target ?? snapshot.value;

  return Object.freeze({
    index,
    target,
    reenter: transition.reenter === true && target === snapshot.value,
    guard,
    hasUpdate: transition.update !== undefined,
    actionCounts: actionCountsForTransition(snapshot, target, transition),
  });
}

export function inspectTransitionSelection<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
  transitions: ReadonlyArray<FlowTransitionDefinition<Context, Event, State>>,
  step: number,
  trigger: TransitionTrigger,
  runtime: FlowTransitionRuntime = defaultRuntime,
): InspectedTransitionSelection<Context, Event, State> {
  const args = transitionArgs(snapshot, event, runtime);
  const receipts: Array<FlowReceipt> = [];
  const candidates: Array<FlowTransitionCandidate<State>> = [];
  let matchedTransition: FlowTransitionDefinition<Context, Event, State> | undefined;
  let matchedIndex: number | undefined;

  for (const [index, transition] of transitions.entries()) {
    if (matchedTransition !== undefined) {
      candidates.push(
        transitionCandidateFor({
          snapshot,
          transition,
          index,
          guard: "skipped",
        }),
      );
      continue;
    }

    if (transition.guard === undefined) {
      candidates.push(
        transitionCandidateFor({
          snapshot,
          transition,
          index,
          guard: "not-applicable",
        }),
      );
      matchedTransition = transition;
      matchedIndex = index;
      continue;
    }

    const passed = guardPassed(transition, args);
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
    candidates.push(
      transitionCandidateFor({
        snapshot,
        transition,
        index,
        guard: passed ? "pass" : "fail",
      }),
    );

    if (!passed) {
      continue;
    }

    matchedTransition = transition;
    matchedIndex = index;
  }

  if (matchedTransition !== undefined && matchedIndex !== undefined) {
    return {
      matched: true,
      transition: matchedTransition,
      transitionIndex: matchedIndex,
      receipts,
      candidates,
    };
  }

  return {
    matched: false,
    receipts,
    candidates,
  };
}

export function machineEventPlanFromSelection<
  Context,
  Event extends FlowEvent,
  State extends string,
>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
  selection: MatchedTransitionSelection<Context, Event, State> | UnmatchedTransitionSelection,
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
    ...selection.receipts,
  ];

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
