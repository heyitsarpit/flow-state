import type { FlowEvent, FlowSnapshot, FlowTransitionRuntime } from "../api/types.js";
import { transitionsFor } from "./machine-transition-config.js";
import {
  machineEventPlanFromSelection,
  planTransitionSelection,
} from "./machine-transition-receipts.js";
import type { MachineEventPlan } from "./machine-transition-receipts.js";
export {
  actionCountsForTransition,
  applyMatchedTransition,
} from "./machine-transition-application.js";
export type { AppliedMachineEvent } from "./machine-transition-application.js";
export { afterDefinitionsForState, transitionsFor } from "./machine-transition-config.js";
export {
  appendSnapshotReceipts,
  inspectTransitionSelection,
  machineEventPlanFromSelection,
  planTransitionSelection,
} from "./machine-transition-receipts.js";
export type { MachineEventPlan } from "./machine-transition-receipts.js";
export {
  MAX_INTERNAL_MICROSTEPS,
  applyAfterTransitionWithMeta,
  applyMachineEvent,
  applyMachineEventWithMeta,
  planAlwaysTransition,
} from "./machine-transition-runtime.js";
const defaultRuntime: FlowTransitionRuntime = Object.freeze({
  now: () => 0,
});

export function planMachineEvent<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
  runtime: FlowTransitionRuntime = defaultRuntime,
): MachineEventPlan<Context, Event, State> {
  const selection = planTransitionSelection(
    snapshot,
    event,
    transitionsFor(snapshot, event.type),
    0,
    "event",
    runtime,
  );

  return machineEventPlanFromSelection(snapshot, event, selection);
}

export function canMachineTransition<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  event: Event,
  runtime: FlowTransitionRuntime = defaultRuntime,
): boolean {
  return planMachineEvent(snapshot, event, runtime).matched;
}
