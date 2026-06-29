import type { FlowEvent, FlowTransactionDefinition } from "./public/types.js";

import { transactionOutcomeCallbackThrewDiagnostic } from "./diagnostics.js";
import { resolveTransactionOutcomeEvent } from "./transaction-outcome.js";

type TransactionOutcomeCallbackName =
  | "routes.success"
  | "routes.failure"
  | "routes.defect"
  | "routes.interrupt";

type TransactionOutcomeArgs<Value, Error> =
  | readonly ["success", Readonly<{ readonly value: Value }>]
  | readonly ["failure", Readonly<{ readonly error: Error }>]
  | readonly ["defect", Readonly<{ readonly cause: unknown }>]
  | readonly ["interrupt", Readonly<{ readonly reason?: unknown }>];

function runTransactionOutcomeCallback<
  Id extends string,
  Params,
  Value,
  Error,
  Requirements,
  Event extends FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown>,
  Result,
>(
  definition: FlowTransactionDefinition<
    Id,
    Params,
    Value,
    Error,
    Requirements,
    Event,
    PreviewPatches
  >,
  callback: TransactionOutcomeCallbackName,
  run: () => Result,
): Result {
  try {
    return run();
  } catch (cause) {
    throw transactionOutcomeCallbackThrewDiagnostic({
      transactionId: definition.id,
      callback,
      cause,
    });
  }
}

function callbackNameForTransactionOutcomeLane(
  lane: TransactionOutcomeArgs<unknown, unknown>[0],
): TransactionOutcomeCallbackName {
  switch (lane) {
    case "success":
      return "routes.success";
    case "failure":
      return "routes.failure";
    case "defect":
      return "routes.defect";
    case "interrupt":
      return "routes.interrupt";
  }
}

export function resolveTransactionOutcomeEventWithDiagnostics<
  Id extends string,
  Params,
  Value,
  Error,
  Requirements,
  Event extends FlowEvent,
  PreviewPatches extends ReadonlyArray<unknown>,
>(
  definition: FlowTransactionDefinition<
    Id,
    Params,
    Value,
    Error,
    Requirements,
    Event,
    PreviewPatches
  >,
  ...args: TransactionOutcomeArgs<Value, Error>
): Event | undefined {
  return runTransactionOutcomeCallback(
    definition,
    callbackNameForTransactionOutcomeLane(args[0]),
    () => resolveTransactionOutcomeEvent(definition.config.routes, ...args),
  );
}
