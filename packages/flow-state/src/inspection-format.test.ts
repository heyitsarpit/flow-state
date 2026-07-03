import { describe, expect, it } from "vite-plus/test";

import {
  captureTrace,
  formatInspectionEvent,
  formatInspectionEventPretty,
  formatInspectionTimeline,
  formatInspectionTimelinePretty,
  formatTrace,
  formatTracePretty,
  type FlowInspectionEvent,
} from "./inspect.js";
import * as flow from "./index.js";
import { createRuntime } from "./runtime/contract-runtime.js";

function createInspectionEvent(
  sequence: number,
  overrides: Partial<FlowInspectionEvent> = {},
): FlowInspectionEvent {
  return Object.freeze({
    type: "actor:start" as const,
    id: `inspection.format.actor.${sequence}`,
    actorId: "inspection.format.actor",
    rootActorId: "inspection.format.actor",
    timestamp: sequence,
    sequence,
    ...overrides,
  }) as FlowInspectionEvent;
}

describe("inspection formatters", () => {
  it("formats inspection events and timelines as optional string renderers", () => {
    const start = createInspectionEvent(1);
    const snapshot = createInspectionEvent(2, {
      type: "actor:snapshot",
      snapshot: {
        value: "ready",
        context: { count: 1 },
        resources: {},
        transactions: {},
        streams: {},
        timers: {},
        children: {},
        receipts: [
          { type: "machine:event", id: "inspection.format.actor.2", eventType: "ADVANCE" },
        ],
      },
      eventType: "ADVANCE",
      correlationId: "inspection.format.actor:event:1",
    });

    expect(formatInspectionEvent(start)).toContain("1. actor:start [inspection.format.actor.1]");
    expect(formatInspectionEvent(snapshot)).toContain(
      "2. actor:snapshot [inspection.format.actor.2]",
    );
    expect(formatInspectionEvent(snapshot)).toContain("snapshot=ready");

    const prettyEvent = formatInspectionEventPretty(snapshot);
    expect(prettyEvent).toContain("snapshot.state=ready");
    expect(prettyEvent).toContain("receipts=1");
    expect(prettyEvent).toContain("correlation=inspection.format.actor:event:1");

    expect(formatInspectionTimeline([start, snapshot])).toContain(
      "1. actor:start [inspection.format.actor.1]",
    );
    const prettyTimeline = formatInspectionTimelinePretty([start, snapshot]);
    expect(prettyTimeline).toContain("actor=inspection.format.actor");
    expect(prettyTimeline).toContain("snapshot.state=ready");
  });

  it("formats captured traces with actor trees, timelines, and issue summaries", async () => {
    const machine = flow.machine<
      { readonly count: number },
      Readonly<{ readonly type: "ADVANCE" }>,
      "idle" | "ready"
    >({
      id: "inspection.format.trace.machine",
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
    const actor = runtime.createActor(machine);
    await actor.flush();
    actor.send({ type: "ADVANCE" });
    await actor.flush();

    const trace = captureTrace(actor.snapshot(), { storyId: "inspection-format-trace" as const });

    expect(formatTrace(trace)).toContain("trace[inspection.format.trace.machine]");
    expect(formatTrace(trace)).toContain("final=ready");

    const prettyTrace = formatTracePretty(trace);
    expect(prettyTrace).toContain("Trace inspection.format.trace.machine");
    expect(prettyTrace).toContain("Actor tree");
    expect(prettyTrace).toContain("- inspection.format.trace.machine state=ready");
    expect(prettyTrace).toContain("Correlation timeline");
    expect(prettyTrace).toContain("ADVANCE");
    expect(prettyTrace).toContain("Issue summary");
    expect(prettyTrace).toContain("(none)");

    await actor.dispose();
    await runtime.dispose();
  });
});
