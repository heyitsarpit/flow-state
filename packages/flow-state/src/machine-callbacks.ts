import { machineCallbackThrewDiagnostic } from "./diagnostics.js";

export type MachineCallbackName =
  | "context"
  | "update"
  | "actions.transition"
  | "actions.entry"
  | "actions.exit";

export function runMachineCallback<Result>(
  machineId: string,
  callback: MachineCallbackName,
  run: () => Result,
  eventType?: string,
  state?: string,
  trigger?: "event" | "always" | "after",
  step?: number,
): Result {
  try {
    return run();
  } catch (cause) {
    if (callback === "context") {
      throw machineCallbackThrewDiagnostic({
        machineId,
        callback,
        cause,
      });
    }
    throw machineCallbackThrewDiagnostic({
      machineId,
      callback,
      eventType,
      state,
      trigger,
      step,
      cause,
    } as Parameters<typeof machineCallbackThrewDiagnostic>[0]);
  }
}
