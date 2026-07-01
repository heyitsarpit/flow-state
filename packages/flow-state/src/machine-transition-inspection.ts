import type {
  FlowActionFact,
  FlowActionInspection,
  FlowActionInspectionPhase,
  FlowEvent,
  FlowMachine,
  FlowMicrostepInspection,
  FlowMicrostepInspectionLimitReached,
  FlowMicrostepInspectionStep,
  FlowNoTransitionExplanation,
  FlowNoTransitionReason,
  FlowReceipt,
  FlowSnapshot,
  FlowTransitionDefinition,
  FlowTransitionInspection,
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

const inspectionRuntime = Object.freeze({
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
}): AppliedMicrostepInspection<Context, Event, State> {
  const applied = applyMatchedTransition({
    snapshot: args.snapshot,
    event: args.event,
    transition: args.transition,
    transitionIndex: args.transitionIndex,
    receipts: args.receipts,
    step: args.step,
    trigger: args.trigger,
    runtime: inspectionRuntime,
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

function isMachineUpdateReceipt(
  receipt: FlowReceipt,
): receipt is FlowReceipt & Readonly<{ readonly type: "machine:update"; readonly index: number }> {
  return receipt.type === "machine:update" && typeof receipt.index === "number";
}

function isMachineActionReceipt(receipt: FlowReceipt): receipt is FlowReceipt &
  Readonly<{
    readonly type: "machine:action";
    readonly phase: FlowActionInspectionPhase;
    readonly index: number;
  }> {
  return (
    receipt.type === "machine:action" &&
    typeof receipt.index === "number" &&
    (receipt.phase === "exit" || receipt.phase === "transition" || receipt.phase === "entry")
  );
}

function actionFactsForMicrostep<Context, Event extends FlowEvent, State extends string>(
  step: FlowMicrostepInspectionStep<Context, Event, State>,
): ReadonlyArray<FlowActionFact<Context, Event, State>> {
  const facts: Array<FlowActionFact<Context, Event, State>> = [];

  for (const [receiptIndex, receipt] of step.receipts.entries()) {
    if (isMachineUpdateReceipt(receipt)) {
      facts.push(
        Object.freeze({
          kind: "update" as const,
          step: step.step,
          trigger: step.trigger,
          event: step.event,
          from: step.from,
          to: step.to,
          transitionIndex: step.index,
          index: receipt.index,
          snapshot: step.snapshot,
          receipt,
        }),
      );
      continue;
    }

    if (!isMachineActionReceipt(receipt)) {
      continue;
    }

    const emitted: Array<FlowReceipt> = [];
    for (const nextReceipt of step.receipts.slice(receiptIndex + 1)) {
      if (isMachineActionReceipt(nextReceipt) || nextReceipt.type === "machine:microstep") {
        break;
      }

      emitted.push(nextReceipt);
    }

    facts.push(
      Object.freeze({
        kind: "action" as const,
        step: step.step,
        trigger: step.trigger,
        event: step.event,
        from: step.from,
        to: step.to,
        transitionIndex: step.index,
        phase: receipt.phase,
        index: receipt.index,
        snapshot: step.snapshot,
        receipt,
        emitted: Object.freeze(emitted),
      }),
    );
  }

  return Object.freeze(facts);
}

function statesHandlingEvent<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  eventType: Event["type"],
): ReadonlyArray<State> {
  return Object.freeze(
    (
      Object.entries(machine.config.states) as Array<
        [State, FlowMachine<Context, Event, State>["config"]["states"][State]]
      >
    ).flatMap(([state, node]) => (node.on?.[eventType] === undefined ? [] : [state])),
  );
}

function noTransitionExplanation<
  Context,
  Event extends FlowEvent,
  State extends string,
  Machine extends FlowMachine<Context, Event, State>,
>(
  args: Readonly<{
    readonly machine: Machine;
    readonly snapshot: FlowSnapshot<Context, State, Event>;
    readonly event: Event;
    readonly reason: FlowNoTransitionReason;
    readonly state: State;
    readonly availableInStates: ReadonlyArray<State>;
    readonly guardFailures: ReadonlyArray<number>;
    readonly nextSnapshot: FlowSnapshot<Context, State, Event>;
    readonly receipts: ReadonlyArray<FlowReceipt>;
    readonly limitReached?: FlowMicrostepInspectionLimitReached;
  }>,
): FlowNoTransitionExplanation<Context, Event, State, Machine> {
  return Object.freeze({
    kind: "no-transition-explanation" as const,
    machine: args.machine,
    snapshot: args.snapshot,
    event: args.event,
    reason: args.reason,
    state: args.state,
    availableInStates: Object.freeze([...args.availableInStates]),
    guardFailures: Object.freeze([...args.guardFailures]),
    nextSnapshot: args.nextSnapshot,
    receipts: args.receipts,
    ...(args.limitReached === undefined ? {} : { limitReached: args.limitReached }),
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
): FlowTransitionInspection<Context, Event, State, Machine> {
  const normalizedSnapshot = inspectionSnapshotFor(machine, snapshot);
  const selection = inspectTransitionSelection(
    normalizedSnapshot,
    event,
    transitionsFor(normalizedSnapshot, event.type),
    0,
    "event",
    inspectionRuntime,
  );
  const plan = machineEventPlanFromSelection(normalizedSnapshot, event, selection);
  const applied = applyMachineEventWithMeta(plan, inspectionRuntime);
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
): FlowMicrostepInspection<Context, Event, State, Machine> {
  const normalizedSnapshot = inspectionSnapshotFor(machine, snapshot);
  const initialSelection = planTransitionSelection(
    normalizedSnapshot,
    event,
    transitionsFor(normalizedSnapshot, event.type),
    0,
    "event",
    inspectionRuntime,
  );

  if (!initialSelection.matched) {
    const plan = machineEventPlanFromSelection(normalizedSnapshot, event, initialSelection);
    const applied = applyMachineEventWithMeta(plan, inspectionRuntime);

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
  });
  const steps: Array<FlowMicrostepInspectionStep<Context, Event, State>> = [initialMicrostep.step];
  let nextSnapshot = initialMicrostep.applied.snapshot;
  let step = 1;
  let appliedAlwaysSteps = 0;

  while (appliedAlwaysSteps < MAX_INTERNAL_MICROSTEPS) {
    const selection = planAlwaysTransition(nextSnapshot, event, step, inspectionRuntime);
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
    });
    steps.push(appliedMicrostep.step);
    nextSnapshot = appliedMicrostep.applied.snapshot;
    step += 1;
    appliedAlwaysSteps += 1;
  }

  const selection = planAlwaysTransition(nextSnapshot, event, step, inspectionRuntime);
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

export function inspectMachineActions<
  Context,
  Event extends FlowEvent,
  State extends string,
  Machine extends FlowMachine<Context, Event, State>,
>(
  machine: Machine,
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
): FlowActionInspection<Context, Event, State, Machine> {
  const microsteps = inspectMachineMicrosteps(machine, snapshot, event);
  const facts = Object.freeze(microsteps.steps.flatMap((step) => actionFactsForMicrostep(step)));

  return Object.freeze({
    kind: "action-inspection" as const,
    machine: microsteps.machine,
    snapshot: microsteps.snapshot,
    event: microsteps.event,
    matched: microsteps.matched,
    facts,
    nextSnapshot: microsteps.nextSnapshot,
    receipts: microsteps.receipts,
  });
}

export function whyNoMachineTransition<
  Context,
  Event extends FlowEvent,
  State extends string,
  Machine extends FlowMachine<Context, Event, State>,
>(
  machine: Machine,
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
): FlowNoTransitionExplanation<Context, Event, State, Machine> | undefined {
  const normalizedSnapshot = inspectionSnapshotFor(machine, snapshot);
  const microsteps = inspectMachineMicrosteps(machine, normalizedSnapshot, event);

  if (microsteps.limitReached !== undefined) {
    return noTransitionExplanation({
      machine,
      snapshot: normalizedSnapshot,
      event,
      reason: "stopped-by-microstep-limit",
      state: microsteps.nextSnapshot.value,
      availableInStates: [],
      guardFailures: [],
      nextSnapshot: microsteps.nextSnapshot,
      receipts: microsteps.receipts,
      limitReached: microsteps.limitReached,
    });
  }

  if (microsteps.matched) {
    return undefined;
  }

  const selection = inspectTransitionSelection(
    normalizedSnapshot,
    event,
    transitionsFor(normalizedSnapshot, event.type),
    0,
    "event",
    inspectionRuntime,
  );
  const availableInStates = statesHandlingEvent(machine, event.type);
  const plan = machineEventPlanFromSelection(normalizedSnapshot, event, selection);
  const applied = applyMachineEventWithMeta(plan, inspectionRuntime);
  const receipts = appendedReceipts(normalizedSnapshot, applied.snapshot);
  const guardFailures = Object.freeze(
    selection.candidates
      .filter((candidate) => candidate.guard === "fail")
      .map((candidate) => candidate.index),
  );
  const reason: FlowNoTransitionReason =
    availableInStates.length === 0
      ? "unknown"
      : selection.candidates.length === 0
        ? "ignored-in-state"
        : "blocked-by-guard";

  return noTransitionExplanation({
    machine,
    snapshot: normalizedSnapshot,
    event,
    reason,
    state: normalizedSnapshot.value,
    availableInStates,
    guardFailures,
    nextSnapshot: applied.snapshot,
    receipts,
  });
}
