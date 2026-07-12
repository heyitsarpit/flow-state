import { describe, expect, it } from "vite-plus/test";

import {
  attachInspectionSink,
  createInspectionBufferSink,
  type FlowInspectionEvent,
  type FlowInspectionSnapshot,
  type FlowRuntimeInspection,
} from "./inspect.js";
import { createInspectionSubscription } from "./core/inspection/inspection-subscription.js";
import * as flow from "./index.js";
import { createRuntime } from "./runtime/contract-runtime.js";

function createInspectionEvent(
  sequence: number,
  overrides: Partial<FlowInspectionEvent> = {},
): FlowInspectionEvent {
  return Object.freeze({
    type: "actor:start" as const,
    id: `inspection.sink.actor.${sequence}`,
    actorId: "inspection.sink.actor",
    rootActorId: "inspection.sink.actor",
    timestamp: sequence,
    sequence,
    ...overrides,
  }) as FlowInspectionEvent;
}

describe("inspection sinks", () => {
  it("replays buffered history into a sink and continues streaming live runtime events", async () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "ADVANCE" }>,
      "idle" | "ready"
    >({
      id: "inspection.sink.runtime.machine",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            ADVANCE: {
              target: "ready",
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
        ready: {},
      },
    });

    const runtime = createRuntime();
    const actor = runtime.orchestrators.start(machine);
    await actor.flush();

    const sink = createInspectionBufferSink<string>();
    const subscription = attachInspectionSink(runtime.inspection, sink, {
      includeHistory: true,
      redact: (event) => ({
        type: event.type,
        sequence: event.sequence,
      }),
      serialize: ({ type, sequence }) => `${sequence}:${type}`,
    });

    actor.send({ type: "ADVANCE" });
    await actor.flush();
    subscription.unsubscribe();

    expect(sink.messages()).toEqual([
      "1:actor:start",
      "2:actor:snapshot",
      "3:machine:event",
      "4:machine:transition",
      "5:machine:update",
      "6:machine:microstep",
      "7:actor:snapshot",
    ]);

    const beforeSecondAdvance = sink.messages().length;
    actor.send({ type: "ADVANCE" });
    await actor.flush();
    expect(sink.messages()).toHaveLength(beforeSecondAdvance);

    await actor.dispose();
    await runtime.dispose();
  });

  it("bridges snapshot history, catchup reads, and buffered live events without duplicate deliveries", () => {
    const first = createInspectionEvent(1);
    const second = createInspectionEvent(2, {
      type: "machine:event",
      eventType: "ADVANCE",
      targetActorId: "inspection.sink.actor",
    });
    const third = createInspectionEvent(3, {
      type: "actor:snapshot",
      snapshot: {
        value: "ready",
        context: {},
        resources: {},
        transactions: {},
        streams: {},
        timers: {},
        children: {},
        receipts: [],
      },
    });

    let listener: ((event: FlowInspectionEvent) => void) | undefined;
    const sink = createInspectionBufferSink<number>();
    const inspection: FlowRuntimeInspection = {
      entries: (filter) =>
        filter?.afterSequence === first.sequence ? [second, third] : [first, second, third],
      snapshot: (): FlowInspectionSnapshot => ({
        capturedAt: first.timestamp,
        lastSequence: first.sequence,
        entries: [first],
      }),
      export: () => [],
      retention: () => ({}),
      setRetention: () => {},
      subscribe: (target) => {
        listener = typeof target === "function" ? target : target.next;
        listener(third);
        return createInspectionSubscription(() => {
          listener = undefined;
        });
      },
    };

    const subscription = attachInspectionSink(inspection, sink, {
      includeHistory: true,
      serialize: (event) => event.sequence,
    });

    expect(sink.messages()).toEqual([1, 2, 3]);
    expect(subscription.closed).toBe(false);

    subscription.unsubscribe();
    expect(subscription.closed).toBe(true);

    listener?.(createInspectionEvent(4));
    expect(sink.messages()).toEqual([1, 2, 3]);
  });
});
