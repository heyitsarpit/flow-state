import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { createControlledStream, flow, flowTest } from "./index.js";

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

describe("flowTest inspection surface", () => {
  it("reports pending timer work through a public pending-work inspector", () => {
    const harness = flowTest.start(createTimerMachine("inspect.pending.timer")).start();

    expect(harness.pendingWork()).toMatchObject({
      ready: 0,
      activeFibers: 1,
      mailboxes: [],
      streams: [],
      transactions: [],
      children: [],
      timers: [
        expect.objectContaining({
          id: "inspect.pending.timer.dismiss",
          parentState: "waiting",
          dueAt: 2000,
        }),
      ],
      nextAfterMillis: 2000,
    });
  });

  it("reports live stream work and queued mailbox callbacks", async () => {
    const tokens = createControlledStream<string>("inspect.pending.stream.tokens");
    type PendingEvent = Readonly<{ readonly type: "START" }>;
    type PendingState = "idle" | "streaming";

    const machine = flow.machine<{ readonly started: boolean }, PendingEvent, PendingState, "idle">(
      {
        id: "inspect.pending.stream.machine",
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
              id: "inspect.pending.stream",
              subscribe: () => tokens.stream(),
            }),
          },
        },
      },
    );

    const harness = flowTest.start(machine).start();
    harness.send({ type: "START" });

    expect(harness.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "stream:start",
          id: "inspect.pending.stream",
        }),
      ]),
    );
    expect(harness.pendingWork()).toMatchObject({
      ready: 0,
      activeFibers: 1,
      mailboxes: [],
      streams: ["inspect.pending.stream"],
    });

    tokens.emit("hello");

    expect(harness.pendingWork()).toMatchObject({
      ready: 1,
      activeFibers: 1,
      mailboxes: [
        expect.objectContaining({
          id: "inspect.pending.stream.machine",
          pending: 1,
        }),
      ],
      streams: ["inspect.pending.stream"],
    });

    await harness.flush();

    expect(harness.streams().running("inspect.pending.stream")).toMatchObject({
      emitted: 1,
      value: "hello",
    });
  });

  it("reports pending transactions in the inspector and settle diagnostics", async () => {
    const transaction = flow.transaction({
      id: "inspect.pending.transaction",
      params: () => ({ id: "project-1" as const }),
      commit: () => Effect.never,
    });
    const machine = flow.machine<{}, { readonly type: "NOOP" }, "running">({
      id: "inspect.pending.transaction.machine",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          invoke: flow.run(transaction),
        },
      },
    });

    const harness = flowTest.start(machine).start();

    expect(harness.pendingWork()).toMatchObject({
      ready: 0,
      activeFibers: 1,
      transactions: ["inspect.pending.transaction"],
      streams: [],
      timers: [],
    });

    await expect(
      harness.settle({
        maxTicks: 1,
        maxFibers: 1,
      }),
    ).rejects.toThrow(/transactions=\[inspect\.pending\.transaction\]/);
  });
});
