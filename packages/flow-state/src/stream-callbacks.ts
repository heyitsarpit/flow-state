import type { Stream } from "effect";

import {
  FlowDiagnostic,
  FlowDiagnosticCodes,
  streamCallbackThrewDiagnostic,
} from "./diagnostics.js";
import type { FlowEvent, FlowStreamDefinition, FlowStreamPressure } from "./core/api/types.js";
import { resolveStreamRouteEvent } from "./stream-route.js";

type StreamCallbackName =
  | "params"
  | "subscribe"
  | "pressure.key"
  | "routes.value"
  | "routes.done"
  | "routes.failure"
  | "routes.defect"
  | "routes.interrupt";

type StreamRouteArgs<Value, Error> =
  | readonly ["value", Value]
  | readonly ["done"]
  | readonly ["failure", Error]
  | readonly ["defect", unknown]
  | readonly ["interrupt"];

function runStreamCallback<
  Value,
  Error,
  Params,
  Event extends FlowEvent,
  Context,
  Id extends string,
  Requirements,
  Result,
>(
  definition: FlowStreamDefinition<Value, Error, Params, Event, Context, Id, Requirements>,
  callback: StreamCallbackName,
  run: () => Result,
): Result {
  try {
    return run();
  } catch (cause) {
    throw streamCallbackThrewDiagnostic({
      streamId: definition.id,
      callback,
      cause,
    });
  }
}

function callbackNameForStreamRouteLane(
  lane: StreamRouteArgs<unknown, unknown>[0],
): Extract<StreamCallbackName, `routes.${string}`> {
  switch (lane) {
    case "value":
      return "routes.value";
    case "done":
      return "routes.done";
    case "failure":
      return "routes.failure";
    case "defect":
      return "routes.defect";
    case "interrupt":
      return "routes.interrupt";
  }
}

function coalescedPressureDiagnostic(
  streamId: string,
  strategy: FlowStreamPressure["strategy"] | undefined,
): FlowDiagnostic {
  const strategyLabel = strategy ?? "none";

  return new FlowDiagnostic({
    code: FlowDiagnosticCodes.coalescedStreamPressure,
    title: `Coalesced pressure requires 'coalesce-latest' for '${streamId}'`,
    summary: `Flow asked '${streamId}' for a coalesced pressure key with strategy '${strategyLabel}'.`,
    why: "Only 'coalesce-latest' pressure works here.",
    help: "Check pressure?.strategy before calling this helper.",
    debug: {
      strategy: strategy ?? null,
      streamId,
    },
  });
}

export function resolveStreamParams<
  Value,
  Error,
  Params,
  Event extends FlowEvent,
  Context,
  Id extends string,
  Requirements,
>(
  definition: FlowStreamDefinition<Value, Error, Params, Event, Context, Id, Requirements>,
  args: Record<string, unknown>,
): Params | undefined {
  return runStreamCallback(definition, "params", () => definition.config.params?.(args));
}

export function resolveStreamSubscription<
  Value,
  Error,
  Params,
  Event extends FlowEvent,
  Context,
  Id extends string,
  Requirements,
>(
  definition: FlowStreamDefinition<Value, Error, Params, Event, Context, Id, Requirements>,
  params: Params,
): Stream.Stream<Value, Error, Requirements> {
  return runStreamCallback(definition, "subscribe", () => definition.config.subscribe({ params }));
}

export function resolveCoalescedStreamPressureKey<
  Value,
  Error,
  Params,
  Event extends FlowEvent,
  Context,
  Id extends string,
  Requirements,
>(
  definition: FlowStreamDefinition<Value, Error, Params, Event, Context, Id, Requirements>,
  pressure: FlowStreamPressure | undefined,
  value: Value,
): string {
  if (pressure?.strategy !== "coalesce-latest") {
    throw coalescedPressureDiagnostic(definition.id, pressure?.strategy);
  }

  return runStreamCallback(definition, "pressure.key", () => pressure.key(value));
}

export function resolveStreamRouteEventWithDiagnostics<
  Value,
  Error,
  Params,
  Event extends FlowEvent,
  Context,
  Id extends string,
  Requirements,
>(
  definition: FlowStreamDefinition<Value, Error, Params, Event, Context, Id, Requirements>,
  ...args: StreamRouteArgs<Value, Error>
): Event | undefined {
  return runStreamCallback(definition, callbackNameForStreamRouteLane(args[0]), () =>
    resolveStreamRouteEvent(definition.config.routes, ...args),
  );
}
