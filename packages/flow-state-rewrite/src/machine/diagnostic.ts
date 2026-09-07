import { Result } from "effect";

import * as Diagnostic from "../diagnostic/diagnostic.js";
export type InvalidMachineConfigurationReason =
  | "ConfigurationNotRecord"
  | "NonStringConfigurationKey"
  | "UnexpectedConfigurationField"
  | "StateConfigurationMismatch"
  | "ExpectedFunction"
  | "UnknownStateToken"
  | "UnknownEventToken"
  | "InvalidStateToken"
  | "TransitionObjectRequired"
  | "ExpectedTransition"
  | "ExpectedEventHandlers"
  | "UnknownEventHandler"
  | "EmptyEventHandlerList"
  | "EmptyRedirectList"
  | "ExpectedRedirect"
  | "ExpectedTimer"
  | "InvalidTimerDelay"
  | "ExpectedActivities"
  | "ExpectedStateConfiguration"
  | "MissingCompoundStateFields"
  | "InvalidDefaultTarget"
  | "ExpectedLeafConfiguration"
  | "InvalidCompoundState"
  | "InvalidTokenTables"
  | "AmbiguousHandler";

// RETURN_TYPE: Publishes one canonical machine failure shape to every admission owner.
export const invalidMachineConfigurationDiagnostic = (
  reason: InvalidMachineConfigurationReason,
  path: Diagnostic.Path,
  details: Diagnostic.Details,
): Diagnostic.PublicDiagnostic =>
  Diagnostic.Failure({
    code: "InvalidMachineConfiguration",
    path,
    details: { ...details, reason },
    summary: `Invalid machine configuration: ${reason}`,
    help: "Fix the machine configuration at the reported path.",
  });

// RETURN_TYPE: Keeps invalid-key projection in the never-success Diagnostic channel.
export const invalidConfigurationKey = (
  reason: "NonStringConfigurationKey" | "UnexpectedConfigurationField",
  path: Diagnostic.Path,
  key: PropertyKey,
): Result.Result<never, Diagnostic.PublicDiagnostic> =>
  Result.fail(
    invalidMachineConfigurationDiagnostic(reason, [...path, String(key)], { key: String(key) }),
  );
