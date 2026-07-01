import type { FlowInspectionListener, FlowInspectionObserver } from "../api/types.js";

export type NormalizedFlowInspectionObserver<Message> = Readonly<{
  readonly next: FlowInspectionListener<Message>;
  readonly error?: (error: unknown) => void;
  readonly complete?: () => void;
}>;

export function normalizeInspectionObserver<Message>(
  listenerOrObserver: FlowInspectionListener<Message> | FlowInspectionObserver<Message>,
): NormalizedFlowInspectionObserver<Message> {
  if (typeof listenerOrObserver === "function") {
    return {
      next: listenerOrObserver,
    };
  }

  return {
    next: listenerOrObserver.next,
    ...(listenerOrObserver.error === undefined ? {} : { error: listenerOrObserver.error }),
    ...(listenerOrObserver.complete === undefined ? {} : { complete: listenerOrObserver.complete }),
  };
}
