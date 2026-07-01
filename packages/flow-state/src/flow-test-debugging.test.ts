import { describe, expect, it } from "vite-plus/test";

import { flow } from "./index.js";
import {
  createControlledStream,
  formatHarnessTracePretty,
  formatPendingWorkPretty,
  formatScenarioTranscript,
  formatTransactionEventsPretty,
  test,
} from "./testing.js";

function createTimerMachine(id: string) {
  return flow.machine<{ readonly ticks: number }, never, "waiting" | "done">({
    id,
    initial: "waiting",
    context: () => ({ ticks: 0 }),
    states: {
      waiting: {
        after: flow.after({
          id: `${id}.dismiss`,
          delay: "2 seconds",
          target: "done",
          update: ({ context }) => ({ ticks: context.ticks + 1 }),
        }),
      },
      done: {},
    },
  });
}

describe("flow test debugging helpers", () => {
  it("captures harness traces directly and can focus on one correlation", async () => {
    const tokens = createControlledStream<string>("flow-test.trace.stream");
    const machine = flow.machine<
      { readonly latest: string },
      { readonly type: "START" } | { readonly type: "TOKEN"; readonly value: string },
      "idle" | "streaming"
    >({
      id: "flow-test.trace.machine",
      initial: "idle",
      context: () => ({ latest: "" }),
      states: {
        idle: {
          on: {
            START: "streaming",
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "FlowTest.traceStream",
            subscribe: () => tokens.stream(),
            routes: {
              value: (value) => ({ type: "TOKEN", value }),
            },
          }),
          on: {
            TOKEN: {
              update: ({ event }) => (event.type === "TOKEN" ? { latest: event.value } : {}),
            },
          },
        },
      },
    });

    const harness = test(machine).run();
    harness.send({ type: "START" });
    tokens.emit("hello");
    await harness.flush();

    const trace = harness.trace({
      includeSnapshots: true,
    });
    const correlationId = trace.report.correlations[0]?.correlationId;

    expect(trace.kind).toBe("trace");
    expect(trace.report.correlations).toHaveLength(2);
    expect(trace.report.summary.receiptTypes).toEqual(
      expect.arrayContaining(["machine:event", "machine:transition", "stream:start"]),
    );
    expect(correlationId).toEqual(expect.any(String));

    const focused = correlationId === undefined ? undefined : harness.traceFor(correlationId);
    expect(focused?.options).toEqual({
      correlationId,
    });
    expect(focused?.receipts.every((receipt) => receipt.correlationId === correlationId)).toBe(
      true,
    );
    expect(harness.traceFor("missing-correlation")).toBeUndefined();
  });

  it("renders pending work, traces, transaction facts, and transcripts for the inner loop", () => {
    const harness = test(createTimerMachine("flow-test.pretty")).run();
    const trace = harness.captureTrace();

    expect(formatPendingWorkPretty(harness.pendingWork())).toContain(
      "timers: flow-test.pretty.dismiss@2000",
    );
    expect(formatPendingWorkPretty(harness.pendingWork())).toContain("nextAfterMillis=2000");

    expect(formatHarnessTracePretty(trace)).toContain("receipts=");
    expect(formatHarnessTracePretty(trace)).toContain("timers:");

    const transactionPretty = formatTransactionEventsPretty([
      {
        type: "transaction:start",
        id: "launch.save",
        parentState: "editing",
      },
      {
        type: "transaction:success",
        id: "launch.save",
        parentState: "editing",
      },
    ]);
    expect(transactionPretty).toContain("1. transaction:start [launch.save] state=editing");
    expect(transactionPretty).toContain("2. transaction:success [launch.save] state=editing");

    const transcript = formatScenarioTranscript(trace.receipts);
    expect(transcript).toContain("1. timer:start [flow-test.pretty.dismiss] state=waiting");
  });
});
