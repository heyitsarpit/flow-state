import type {
  FlowAfterDefinition,
  FlowEvent,
  FlowReceipt,
  FlowSnapshot,
  FlowTransitionDefinition,
  FlowTransitionRuntime,
} from "../api/types.js";
import {
  applyMatchedTransition,
  type AppliedMachineEvent,
} from "./machine-transition-application.js";
import { alwaysTransitionsFor } from "./machine-transition-config.js";
import {
  appendSnapshotReceipts,
  planTransitionSelection,
  type MachineEventPlan,
  type MatchedTransitionSelection,
  type UnmatchedTransitionSelection,
} from "./machine-transition-receipts.js";

const defaultRuntime: FlowTransitionRuntime = Object.freeze({
  now: () => 0,
});

export const MAX_INTERNAL_MICROSTEPS = 100;

export function planAlwaysTransition<Context, Event extends FlowEvent, State extends string>(
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
