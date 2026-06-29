import { describe, expect, it } from "vite-plus/test";

import { flow } from "./index.js";
import { flowTest } from "./testing.js";

type TimerEvent = Readonly<{ readonly type: "CANCEL" } | { readonly type: "REARM" }>;
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
      cancelled: {
        on: {
          REARM: "waiting",
        },
      },
    },
  });
}

describe("flowTest timer snapshots", () => {
  it("tracks scheduled, interrupted, and restarted timer generations", async () => {
    const harness = flowTest.start(createTimerMachine("flow-test.timer")).start();

    expect(harness.timers().active("flow-test.timer.dismiss")).toMatchObject({
      status: "scheduled",
      generation: 1,
      parentState: "waiting",
      startedAt: 0,
      dueAt: 2000,
    });
    expect(
      harness.snapshot().timers["flow-test.timer.dismiss"]!.dueAt -
        harness.snapshot().timers["flow-test.timer.dismiss"]!.startedAt,
    ).toBe(2000);

    harness.send({ type: "CANCEL" });
    await harness.flush();

    expect(harness.timers().cancelled("flow-test.timer.dismiss")).toMatchObject({
      status: "interrupt",
      generation: 1,
      parentState: "waiting",
    });

    harness.send({ type: "REARM" });
    await harness.flush();

    expect(harness.timers().active("flow-test.timer.dismiss")).toMatchObject({
      status: "scheduled",
      generation: 2,
      parentState: "waiting",
    });
    expect(
      harness
        .timers()
        .events("flow-test.timer.dismiss")
        .map((receipt) => receipt.type),
    ).toEqual(["timer:start", "timer:interrupt", "timer:start"]);
  });

  it("records timer fire snapshots after virtual time advances", async () => {
    const harness = flowTest.start(createTimerMachine("flow-test.timer.fire")).start();

    await harness.advance("2 seconds");

    expect(harness.state()).toBe("done");
    expect(harness.context().ticks).toBe(1);
    expect(harness.timers().fired("flow-test.timer.fire.dismiss")).toMatchObject({
      status: "fired",
      generation: 1,
      parentState: "waiting",
    });
    expect(
      harness
        .timers()
        .events("flow-test.timer.fire.dismiss")
        .map((receipt) => receipt.type),
    ).toEqual(["timer:start", "timer:fire"]);
  });
});
