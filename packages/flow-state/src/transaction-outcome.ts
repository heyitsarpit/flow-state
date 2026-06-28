import type { FlowEvent, FlowOutcomeRoutes } from "./public/types.js";

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
    return route(payload as never);
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

export function resolveTransactionOutcomeEvent<Value, Error, Event extends FlowEvent>(
  routes: FlowOutcomeRoutes<Value, Error, Event> | undefined,
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
