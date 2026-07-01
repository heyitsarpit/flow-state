import { describe, expect, it } from "vite-plus/test";

import { FlowDiagnostic } from "./shared/diagnostics.js";
import { flow } from "./index.js";
import { createControlledStream, test } from "./testing.js";

function createDismissMachine(id: string) {
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

describe("flow test developer loop helpers", () => {
  it("advances one scheduled timer boundary at a time", async () => {
    const harness = test(createDismissMachine("flow-test.next-timer")).run();

    expect(await harness.advanceToNextTimer()).toBe(true);
    expect(harness.state()).toBe("done");
    expect(harness.context().ticks).toBe(1);
    expect(await harness.advanceToNextTimer()).toBe(false);
  });

  it("advances ready work and timers until the harness becomes idle without waiting for streams to end", async () => {
    const tokens = createControlledStream<string>("flow-test.advance-until-idle.stream");
    const machine = flow.machine<
      { readonly lastToken: string | null },
      { readonly type: "START" } | { readonly type: "TOKEN"; readonly token: string },
      "idle" | "streaming"
    >({
      id: "flow-test.advance-until-idle.machine",
      initial: "idle",
      context: () => ({ lastToken: null }),
      states: {
        idle: {
          on: {
            START: "streaming",
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "FlowTest.advanceUntilIdle.stream",
            subscribe: () => tokens.stream(),
            routes: {
              value: (token) => ({ type: "TOKEN", token }),
            },
          }),
          on: {
            TOKEN: {
              update: ({ event }) => (event.type === "TOKEN" ? { lastToken: event.token } : {}),
            },
          },
        },
      },
    });

    const harness = test(machine).run();
    harness.send({ type: "START" });
    tokens.emit("hello");

    await harness.advanceUntilIdle({
      maxTicks: 3,
      maxFibers: 1,
    });

    expect(harness.context().lastToken).toBe("hello");
    expect(harness.pendingWork()).toMatchObject({
      ready: 0,
      streams: ["FlowTest.advanceUntilIdle.stream"],
    });
    expect(harness.streams().running("FlowTest.advanceUntilIdle.stream")).toMatchObject({
      emitted: 1,
      status: "running",
      value: "hello",
    });
  });

  it("waits for generic facts, state changes, receipts, and issues through one bounded loop", async () => {
    const tokens = createControlledStream<string, "offline">("flow-test.until.issue");
    const timerMachine = createDismissMachine("flow-test.until");
    const issueMachine = flow.machine<
      { readonly failed: boolean },
      { readonly type: "START" } | { readonly type: "STREAM_FAILED"; readonly error: "offline" },
      "idle" | "streaming" | "failed"
    >({
      id: "flow-test.until.issue.machine",
      initial: "idle",
      context: () => ({ failed: false }),
      states: {
        idle: {
          on: {
            START: "streaming",
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "FlowTest.untilIssue.stream",
            subscribe: () => tokens.stream(),
            routes: {
              failure: (error) => ({ type: "STREAM_FAILED", error }),
            },
          }),
          on: {
            STREAM_FAILED: {
              target: "failed",
              update: () => ({ failed: true }),
            },
          },
        },
        failed: {},
      },
    });

    const timerHarness = test(timerMachine).run();
    await timerHarness.until((current) => current.context().ticks === 1);
    expect(timerHarness.context().ticks).toBe(1);

    const stateHarness = test(createDismissMachine("flow-test.until.state")).run();
    await stateHarness.untilState("done");
    expect(stateHarness.state()).toBe("done");

    const receiptHarness = test(createDismissMachine("flow-test.until.receipt")).run();
    await receiptHarness.untilReceipt((receipt) => receipt.type === "timer:fire");
    expect(receiptHarness.receipts().map((receipt) => receipt.type)).toContain("timer:fire");

    const issueHarness = test(issueMachine).run();
    issueHarness.send({ type: "START" });
    tokens.fail("offline");
    await issueHarness.untilIssue((issue) => issue.source === "stream");

    expect(issueHarness.state()).toBe("failed");
    expect(issueHarness.issues()).toEqual([
      expect.objectContaining({
        error: "offline",
        id: "FlowTest.untilIssue.stream",
        kind: "failure",
        source: "stream",
      }),
    ]);
  });

  it("fails with a tagged diagnostic when an awaited fact never arrives within the bounds", async () => {
    const loopingMachine = flow.machine<{ readonly ticks: number }, never, "waiting">({
      id: "flow-test.until.looping",
      initial: "waiting",
      context: () => ({ ticks: 0 }),
      states: {
        waiting: {
          after: flow.after({
            id: "flow-test.until.looping.dismiss",
            delay: "1 second",
            target: "waiting",
            update: ({ context }) => ({ ticks: context.ticks + 1 }),
          }),
        },
      },
    });

    const harness = test(loopingMachine).run();

    let failure: unknown;
    try {
      await harness.untilState("done" as never, {
        maxTicks: 2,
        maxFibers: 1,
      });
    } catch (error) {
      failure = error;
    }

    expect(failure instanceof FlowDiagnostic).toBe(true);
    expect(failure).toMatchObject({
      code: "FLOW-TEST-002",
      title: "flowTest.untilState exceeded maxTicks with maxTicks=2 and maxFibers=1",
      debug: {
        awaiting: "state 'done'",
        bounds: {
          maxFibers: 1,
          maxTicks: 2,
        },
      },
    });
  });
});
