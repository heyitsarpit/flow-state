import type { FlowEvent, FlowOutcomeRoutes } from "./public/types.js";

type TransactionOutcomeRoute = "success" | "failure" | "defect" | "interrupt";

type TransactionOutcomePayload<Value, Error> =
  | Readonly<{ readonly value: Value }>
  | Readonly<{ readonly error: Error }>
  | Readonly<{ readonly cause: unknown }>
  | Readonly<{ readonly reason?: unknown }>;

function payloadValue(payload: TransactionOutcomePayload<unknown, unknown>): unknown {
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

export function resolveTransactionOutcomeEvent<Value, Error, Event extends FlowEvent>(
  routes: FlowOutcomeRoutes<Value, Error, Event> | undefined,
  outcome: TransactionOutcomeRoute,
  payload: TransactionOutcomePayload<Value, Error>,
): Event | undefined {
  const route = routes?.[outcome];
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
