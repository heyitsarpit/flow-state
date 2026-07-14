import type { FlowEvent, FlowTransactionCallbackDefinition } from "../api/types.js";

import { transactionOutcomeCallbackThrewDiagnostic } from "../../shared/diagnostics.js";

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

function payloadValue(
  payload:
    | Readonly<{ readonly value: unknown }>
    | Readonly<{ readonly error: unknown }>
    | Readonly<{ readonly cause: unknown }>
    | Readonly<{ readonly reason?: unknown }>,
): unknown {
  if ("value" in payload) {
    return payload.value;
  }

  if ("error" in payload) {
    return payload.error;
  }

  if ("cause" in payload) {
    return payload.cause;
  }

  return payload.reason;
}

function resolveRoute<Payload extends object, Event extends FlowEvent>(
  route: ((args: Payload) => Event) | readonly [Event["type"], string?] | undefined,
  payload: Payload,
): Event | undefined {
  if (route === undefined) {
    return undefined;
  }

  if (typeof route === "function") {
    return route(payload);
  }

  const [type, property] = route;
  return (
    property === undefined
      ? { type }
      : {
          type,
          [property]: payloadValue(payload),
        }
  ) as Event;
}

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
  definition: FlowTransactionCallbackDefinition<
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

export function resolveTransactionOutcomeEvent<Value, Error, Event extends FlowEvent>(
  routes: import("../api/types.js").FlowOutcomeRoutes<Value, Error, Event> | undefined,
  ...args: TransactionOutcomeArgs<Value, Error>
): Event | undefined {
  const [outcome, payload] = args;

  switch (outcome) {
    case "success":
      return resolveRoute(routes?.success, payload);
    case "failure":
      return resolveRoute(routes?.failure, payload);
    case "defect":
      return resolveRoute(routes?.defect, payload);
    case "interrupt":
      return resolveRoute(routes?.interrupt, payload);
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
  definition: FlowTransactionCallbackDefinition<
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
