import { machineCallbackThrewDiagnostic } from "./diagnostics.js";

export type MachineCallbackName =
  | "update"
  | "actions.transition"
  | "actions.entry"
  | "actions.exit";

export function runMachineCallback<Result>(
  machineId: string,
  callback: MachineCallbackName,
  eventType: string,
  state: string,
  trigger: "event" | "always" | "after",
  step: number,
  run: () => Result,
): Result {
  try {
    return run();
  } catch (cause) {
    throw machineCallbackThrewDiagnostic({
      machineId,
      callback,
      eventType,
      state,
      trigger,
      step,
      cause,
    });
  }
}
