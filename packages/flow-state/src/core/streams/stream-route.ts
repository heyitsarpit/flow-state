import type { FlowEvent } from "../api/types.js";

type StreamRouteArgs<Value, Error> =
  | readonly ["value", Value]
  | readonly ["done"]
  | readonly ["failure", Error]
  | readonly ["defect", unknown]
  | readonly ["interrupt"];

type StreamRoutes<Value, Error, Event extends FlowEvent> = Readonly<{
  readonly value?: (value: Value) => Event;
  readonly done?: () => Event;
  readonly failure?: (error: Error) => Event;
  readonly defect?: (cause: unknown) => Event;
  readonly interrupt?: () => Event;
}>;

export function resolveStreamRouteEvent<Value, Error, Event extends FlowEvent>(
  routes: StreamRoutes<Value, Error, Event> | undefined,
  ...args: StreamRouteArgs<Value, Error>
): Event | undefined {
  const [lane, payload] = args;

  switch (lane) {
    case "value":
      return routes?.value?.(payload);
    case "done":
      return routes?.done?.();
    case "failure":
      return routes?.failure?.(payload);
    case "defect":
      return routes?.defect?.(payload);
    case "interrupt":
      return routes?.interrupt?.();
  }
}
