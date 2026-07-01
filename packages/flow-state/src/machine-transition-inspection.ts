import type {
  FlowEvent,
  FlowMachine,
  FlowMicrostepInspection,
  FlowMicrostepInspectionLimitReached,
  FlowMicrostepInspectionStep,
  FlowReceipt,
  FlowSnapshot,
  FlowTransitionDefinition,
  FlowTransitionInspection,
  FlowTransitionRuntime,
} from "./public/types.js";
import {
  MAX_INTERNAL_MICROSTEPS,
  actionCountsForTransition,
  appendSnapshotReceipts,
  applyMachineEventWithMeta,
  applyMatchedTransition,
  inspectTransitionSelection,
  machineEventPlanFromSelection,
  planAlwaysTransition,
  planTransitionSelection,
  transitionsFor,
} from "./machine-transition.js";

type AppliedMicrostepInspection<Context, Event extends FlowEvent, State extends string> = Readonly<{
  readonly applied: import("./machine-transition.js").AppliedMachineEvent<Context, Event, State>;
  readonly step: FlowMicrostepInspectionStep<Context, Event, State>;
}>;

const defaultRuntime: FlowTransitionRuntime = Object.freeze({
  now: () => 0,
});

function inspectionSnapshotFor<
  Context,
  Event extends FlowEvent,
  State extends string,
  Machine extends FlowMachine<Context, Event, State>,
>(
  machine: Machine,
  snapshot: FlowSnapshot<Context, State, Event>,
): FlowSnapshot<Context, State, Event> {
  return snapshot.machine === machine ? snapshot : Object.freeze({ ...snapshot, machine });
}

function appendedReceipts<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  nextSnapshot: FlowSnapshot<Context, State, Event>,
): ReadonlyArray<FlowReceipt> {
  return Object.freeze(nextSnapshot.receipts.slice(snapshot.receipts.length));
}

function createMicrostepInspection<
  Context,
  Event extends FlowEvent,
  State extends string,
  Machine extends FlowMachine<Context, Event, State>,
>(
  args: Readonly<{
    readonly machine: Machine;
    readonly snapshot: FlowSnapshot<Context, State, Event>;
    readonly event: Event;
    readonly matched: boolean;
    readonly steps: ReadonlyArray<FlowMicrostepInspectionStep<Context, Event, State>>;
    readonly nextSnapshot: FlowSnapshot<Context, State, Event>;
    readonly limitReached?: FlowMicrostepInspectionLimitReached;
  }>,
): FlowMicrostepInspection<Context, Event, State, Machine> {
  return Object.freeze({
    kind: "microstep-inspection" as const,
    machine: args.machine,
    snapshot: args.snapshot,
    event: args.event,
    matched: args.matched,
    steps: Object.freeze([...args.steps]),
    nextSnapshot: args.nextSnapshot,
    receipts: appendedReceipts(args.snapshot, args.nextSnapshot),
    ...(args.limitReached === undefined ? {} : { limitReached: args.limitReached }),
  });
}

function inspectAppliedMicrostep<Context, Event extends FlowEvent, State extends string>(args: {
  readonly snapshot: FlowSnapshot<Context, State, Event>;
  readonly event: Event;
  readonly transition: FlowTransitionDefinition<Context, Event, State>;
  readonly transitionIndex: number;
  readonly receipts: ReadonlyArray<FlowReceipt>;
  readonly step: number;
  readonly trigger: "event" | "always" | "after";
  readonly runtime: FlowTransitionRuntime;
}): AppliedMicrostepInspection<Context, Event, State> {
  const applied = applyMatchedTransition({
    snapshot: args.snapshot,
    event: args.event,
    transition: args.transition,
    transitionIndex: args.transitionIndex,
    receipts: args.receipts,
    step: args.step,
    trigger: args.trigger,
    runtime: args.runtime,
  });
  const nextValue = args.transition.target ?? args.snapshot.value;

  return Object.freeze({
    applied,
    step: Object.freeze({
      step: args.step,
      trigger: args.trigger,
      event: args.event,
      from: args.snapshot.value,
      to: nextValue,
      index: args.transitionIndex,
      reenter: applied.reentered,
      guard: args.transition.guard === undefined ? "not-applicable" : "pass",
      hasUpdate: args.transition.update !== undefined,
      actionCounts: actionCountsForTransition(args.snapshot, nextValue, args.transition),
      snapshot: applied.snapshot,
      receipts: appendedReceipts(args.snapshot, applied.snapshot),
    }),
  });
}

export function inspectMachineTransition<
  Context,
  Event extends FlowEvent,
  State extends string,
  Machine extends FlowMachine<Context, Event, State>,
>(
  machine: Machine,
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
  runtime: FlowTransitionRuntime = defaultRuntime,
): FlowTransitionInspection<Context, Event, State, Machine> {
  const normalizedSnapshot = inspectionSnapshotFor(machine, snapshot);
  const selection = inspectTransitionSelection(
    normalizedSnapshot,
    event,
    transitionsFor(normalizedSnapshot, event.type),
    0,
    "event",
    runtime,
  );
  const plan = machineEventPlanFromSelection(normalizedSnapshot, event, selection);
  const applied = applyMachineEventWithMeta(plan, runtime);
  const receipts = appendedReceipts(normalizedSnapshot, applied.snapshot);
  const chosen = plan.matched ? selection.candidates[plan.transitionIndex] : undefined;
  const target = plan.matched ? (plan.transition.target ?? normalizedSnapshot.value) : undefined;

  return Object.freeze({
    kind: "transition-inspection" as const,
    machine,
    snapshot: normalizedSnapshot,
    event,
    matched: plan.matched,
    candidates: selection.candidates,
    ...(chosen === undefined ? {} : { chosen }),
    ...(target === undefined ? {} : { target }),
    nextSnapshot: applied.snapshot,
    receipts,
  });
}

export function inspectMachineMicrosteps<
  Context,
  Event extends FlowEvent,
  State extends string,
  Machine extends FlowMachine<Context, Event, State>,
>(
  machine: Machine,
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
  runtime: FlowTransitionRuntime = defaultRuntime,
): FlowMicrostepInspection<Context, Event, State, Machine> {
  const normalizedSnapshot = inspectionSnapshotFor(machine, snapshot);
  const initialSelection = planTransitionSelection(
    normalizedSnapshot,
    event,
    transitionsFor(normalizedSnapshot, event.type),
    0,
    "event",
    runtime,
  );

  if (!initialSelection.matched) {
    const plan = machineEventPlanFromSelection(normalizedSnapshot, event, initialSelection);
    const applied = applyMachineEventWithMeta(plan, runtime);

    return createMicrostepInspection({
      machine,
      snapshot: normalizedSnapshot,
      event,
      matched: false,
      steps: [],
      nextSnapshot: applied.snapshot,
    });
  }

  const plan = machineEventPlanFromSelection(normalizedSnapshot, event, initialSelection);
  const initialMicrostep = inspectAppliedMicrostep({
    snapshot: normalizedSnapshot,
    event,
    transition: initialSelection.transition,
    transitionIndex: initialSelection.transitionIndex,
    receipts: plan.receipts,
    step: 0,
    trigger: "event",
    runtime,
  });
  const steps: Array<FlowMicrostepInspectionStep<Context, Event, State>> = [initialMicrostep.step];
  let nextSnapshot = initialMicrostep.applied.snapshot;
  let step = 1;
  let appliedAlwaysSteps = 0;

  while (appliedAlwaysSteps < MAX_INTERNAL_MICROSTEPS) {
    const selection = planAlwaysTransition(nextSnapshot, event, step, runtime);
    if (!selection.matched) {
      const finalSnapshot =
        selection.receipts.length === 0
          ? nextSnapshot
          : appendSnapshotReceipts(nextSnapshot, selection.receipts);

      return createMicrostepInspection({
        machine,
        snapshot: normalizedSnapshot,
        event,
        matched: true,
        steps,
        nextSnapshot: finalSnapshot,
      });
    }

    const appliedMicrostep = inspectAppliedMicrostep({
      snapshot: nextSnapshot,
      event,
      transition: selection.transition,
      transitionIndex: selection.transitionIndex,
      receipts: selection.receipts,
      step,
      trigger: "always",
      runtime,
    });
    steps.push(appliedMicrostep.step);
    nextSnapshot = appliedMicrostep.applied.snapshot;
    step += 1;
    appliedAlwaysSteps += 1;
  }

  const selection = planAlwaysTransition(nextSnapshot, event, step, runtime);
  if (!selection.matched) {
    const finalSnapshot =
      selection.receipts.length === 0
        ? nextSnapshot
        : appendSnapshotReceipts(nextSnapshot, selection.receipts);

    return createMicrostepInspection({
      machine,
      snapshot: normalizedSnapshot,
      event,
      matched: true,
      steps,
      nextSnapshot: finalSnapshot,
    });
  }

  const finalSnapshot = appendSnapshotReceipts(nextSnapshot, [
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

  return createMicrostepInspection({
    machine,
    snapshot: normalizedSnapshot,
    event,
    matched: true,
    steps,
    nextSnapshot: finalSnapshot,
    limitReached: Object.freeze({
      step,
      limit: MAX_INTERNAL_MICROSTEPS,
    }),
  });
}
