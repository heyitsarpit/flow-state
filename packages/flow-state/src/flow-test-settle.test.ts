import { describe, expect, it } from "vite-plus/test";

import snapshots from "./diagnostics.snapshots.json";
import {
  FlowDiagnostic,
  flowDiagnosticDocumentOf,
  formatFlowDiagnosticPretty,
} from "./shared/diagnostics.js";
import { flow } from "./index.js";
import { createControlledStream, flowTest } from "./testing.js";

type TimerEvent = Readonly<{ readonly type: "CANCEL" }>;
type TimerState = "waiting" | "done" | "cancelled";

function createTimerMachine(id: string) {
  return flow.machine<{ readonly ticks: number }, TimerEvent, TimerState>({
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
        on: {
          CANCEL: "cancelled",
        },
      },
      done: {},
      cancelled: {},
    },
  });
}

describe("flowTest settle boundary", () => {
  it("advances virtual time until delayed work becomes quiescent", async () => {
    const harness = flowTest(createTimerMachine("settle.after")).start();

    await harness.settle({
      maxTicks: 4,
      maxFibers: 1,
    });

    expect(harness.state()).toBe("done");
    expect(harness.context().ticks).toBe(1);
  });

  it("fails with diagnostics when maxFibers is exceeded", async () => {
    const harness = flowTest(createTimerMachine("settle.fibers")).start();

    let failure: unknown;
    try {
      await harness.settle({
        maxTicks: 4,
        maxFibers: 0,
      });
    } catch (error) {
      failure = error;
    }

    expect(failure instanceof FlowDiagnostic).toBe(true);
    if (!(failure instanceof FlowDiagnostic)) {
      return;
    }

    expect(failure).toMatchObject({
      code: "FLOW-TEST-001",
      debug: {
        activeFibers: 1,
        bounds: {
          maxFibers: 0,
          maxTicks: 4,
        },
        timers: [
          {
            id: "settle.fibers.dismiss",
            parentState: "waiting",
          },
        ],
      },
    });
    expect(flowDiagnosticDocumentOf(failure)).toEqual(snapshots.settleMaxFibers.document);
    expect(String(failure)).toBe(snapshots.settleMaxFibers.message);
    expect(formatFlowDiagnosticPretty(failure)).toBe(snapshots.settleMaxFibers.pretty);

    await expect(
      harness.settle({
        maxTicks: 4,
        maxFibers: 0,
      }),
    ).rejects.toThrow(/maxFibers=0/);

    await expect(
      harness.settle({
        maxTicks: 4,
        maxFibers: 0,
      }),
    ).rejects.toThrow(/settle\.fibers\.dismiss/);
  });

  it("fails with diagnostics when maxTicks is exhausted by pending stream work", async () => {
    const stream = createControlledStream<string>("settle.pending-stream");
    type PendingEvent = Readonly<{ readonly type: "START" }>;
    type PendingState = "idle" | "streaming";

    const machine = flow.machine<{ readonly started: boolean }, PendingEvent, PendingState, "idle">(
      {
        id: "settle.pending-stream.machine",
        initial: "idle",
        context: () => ({ started: false }),
        states: {
          idle: {
            on: {
              START: {
                target: "streaming",
                update: () => ({ started: true }),
              },
            },
          },
          streaming: {
            invoke: flow.stream({
              id: "settle.pending-stream",
              subscribe: () => stream.stream(),
            }),
          },
        },
      },
    );

    const harness = flowTest(machine).start();
    harness.send({ type: "START" });

    await expect(
      harness.settle({
        maxTicks: 2,
        maxFibers: 1,
      }),
    ).rejects.toThrow(/maxTicks=2/);

    await expect(
      harness.settle({
        maxTicks: 2,
        maxFibers: 1,
      }),
    ).rejects.toThrow(/settle\.pending-stream/);

    expect(harness.streams().running("settle.pending-stream")).toMatchObject({
      status: "running",
    });
  });

  it("fails with child diagnostics when an active child never quiesces", async () => {
    const childMachine = flow.machine<{}, never, "running">({
      id: "settle.pending-child.worker",
      initial: "running",
      context: () => ({}),
      states: {
        running: {},
      },
    });
    const machine = flow.machine<{}, never, "running">({
      id: "settle.pending-child.parent",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          invoke: flow.child({
            id: "settle.pending-child",
            machine: childMachine,
          }),
        },
      },
    });

    const harness = flowTest(machine).start();

    await expect(
      harness.settle({
        maxTicks: 1,
        maxFibers: 0,
      }),
    ).rejects.toThrow(/settle\.pending-child/);
  });
});
