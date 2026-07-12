import type { FlowEvent, FlowSnapshot } from "../core/api/types.js";

export function applyInputToSnapshot<Context, Event extends FlowEvent, State extends string>(
  snapshot: FlowSnapshot<Context, State, Event>,
  input?: Partial<Context>,
): FlowSnapshot<Context, State, Event> {
  if (input === undefined) {
    return snapshot;
  }

  return Object.freeze({
    ...snapshot,
    context: Object.freeze({
      ...(snapshot.context as Record<string, unknown>),
      ...(input as Record<string, unknown>),
    }) as Context,
  });
}
