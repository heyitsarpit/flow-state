import * as Diagnostic from "../diagnostic/diagnostic.js";

export type InvalidMachineConfigurationReason =
  | "InvalidTimerDelay"
  | "AmbiguousHandler"
  | "ExtraStateConfigurationKey"
  | "ExtraTransitionKey"
  | "ExtraTimerKey"
  | "ForbiddenTimerActions"
  | "ExpectedFunction"
  | "ExpectedRedirect"
  | "EmptyRedirectList"
  | "ExpectedStateConfiguration"
  | "MissingCompoundStateFields"
  | "InvalidCompoundState"
  | "InvalidDefaultTarget"
  | "InvalidStateToken"
  | "ExpectedTransition"
  | "TransitionObjectRequired"
  | "UnexpectedConfigurationField";

export const invalidMachineConfigurationDiagnostic = (
  reason: InvalidMachineConfigurationReason,
  path: Diagnostic.Path,
  details: Diagnostic.Details,
): Diagnostic.Error =>
  new Diagnostic.Error({
    code: "InvalidMachineConfiguration",
    path,
    details: { ...details, reason },
    summary: `Invalid machine configuration: ${reason}`,
    help: "Fix the machine configuration at the reported path.",
  });
