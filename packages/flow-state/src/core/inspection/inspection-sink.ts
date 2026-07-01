import {
  normalizeInspectionObserver,
  type NormalizedFlowInspectionObserver,
} from "./inspection-observer.js";
import { createInspectionSubscription } from "../../inspection-subscription.js";
import type {
  FlowInspectionBufferSink,
  FlowInspectionEvent,
  FlowInspectionFilter,
  FlowInspectionSinkConnector,
  FlowInspectionSinkOptions,
  FlowInspectionSinkTarget,
  FlowInspectionSubscription,
  FlowRuntimeInspection,
} from "../api/types.js";
import { exportInspectionEvent } from "./inspection-events.js";

function emitInspectionSinkMessage<Message>(
  sink: NormalizedFlowInspectionObserver<Message>,
  message: Message,
): void {
  try {
    sink.next(message);
  } catch (error) {
    if (sink.error !== undefined) {
      sink.error(error);
      return;
    }

    throw error;
  }
}

function deliverInspectionEvent<Redacted, Serialized>(
  deliveredSequences: Set<number>,
  sink: NormalizedFlowInspectionObserver<Serialized>,
  event: FlowInspectionEvent,
  options?: FlowInspectionSinkOptions<Redacted, Serialized>,
): void {
  if (deliveredSequences.has(event.sequence)) {
    return;
  }

  deliveredSequences.add(event.sequence);
  emitInspectionSinkMessage(sink, exportInspectionEvent(event, options));
}

function catchupFilterAfter(
  filter: FlowInspectionFilter | undefined,
  afterSequence: number | undefined,
): FlowInspectionFilter | undefined {
  if (afterSequence === undefined) {
    return filter;
  }

  return Object.freeze({
    ...filter,
    afterSequence,
  });
}

export const createInspectionBufferSink = <
  Message = FlowInspectionEvent,
>(): FlowInspectionBufferSink<Message> => {
  let messages: Array<Message> = [];

  return Object.freeze({
    next: (message: Message) => {
      messages.push(message);
    },
    messages: () => Object.freeze([...messages]),
    clear: () => {
      messages = [];
    },
  });
};

export const attachInspectionSink: FlowInspectionSinkConnector = <
  Redacted = FlowInspectionEvent,
  Serialized = Redacted,
>(
  inspection: FlowRuntimeInspection,
  sinkTarget: FlowInspectionSinkTarget<Serialized>,
  options?: FlowInspectionSinkOptions<Redacted, Serialized>,
): FlowInspectionSubscription => {
  const sink = normalizeInspectionObserver(sinkTarget);
  const filter = options?.filter;
  const includeHistory = options?.includeHistory ?? true;

  if (!includeHistory) {
    const liveSubscription = inspection.subscribe(
      {
        next: (event) => {
          emitInspectionSinkMessage(sink, exportInspectionEvent(event, options));
        },
        ...(sink.error === undefined ? {} : { error: sink.error }),
      },
      filter,
    );

    return createInspectionSubscription(() => {
      liveSubscription.unsubscribe();
      sink.complete?.();
    });
  }

  const deliveredSequences = new Set<number>();
  const snapshot = inspection.snapshot(filter);
  const bufferedLiveEvents: Array<FlowInspectionEvent> = [];
  let catchupComplete = false;

  for (const event of snapshot.entries) {
    deliverInspectionEvent(deliveredSequences, sink, event, options);
  }

  const liveSubscription = inspection.subscribe(
    {
      next: (event) => {
        if (catchupComplete) {
          deliverInspectionEvent(deliveredSequences, sink, event, options);
          return;
        }

        bufferedLiveEvents.push(event);
      },
      ...(sink.error === undefined ? {} : { error: sink.error }),
    },
    filter,
  );

  for (const event of inspection.entries(catchupFilterAfter(filter, snapshot.lastSequence))) {
    deliverInspectionEvent(deliveredSequences, sink, event, options);
  }

  catchupComplete = true;
  for (const event of bufferedLiveEvents) {
    deliverInspectionEvent(deliveredSequences, sink, event, options);
  }

  return createInspectionSubscription(() => {
    liveSubscription.unsubscribe();
    sink.complete?.();
  });
};
