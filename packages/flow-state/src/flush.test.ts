import { TestClock } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import { flow } from "./index.js";
import { createControlledStream, flowTest } from "./testing.js";
import { createTestRuntimeWithInstallers } from "./testing/fixtures/runtime-test-fixtures.js";
import {
  dispatchReadyWork,
  enqueueReadyWork,
  flushReadyWork,
  readyWorkPendingCount,
  startReadyWork,
} from "./core/scheduling/ready-work.js";

type FlushEvent = Readonly<{ readonly type: "STEP" }>;

function createFlushMachine() {
  return flow.machine<{}, FlushEvent, "idle" | "ready" | "done">({
    id: "flush.machine",
    initial: "idle",
    context: () => ({}),
    states: {
      idle: {
        on: {
          STEP: "ready",
        },
      },
      ready: {
        on: {
          STEP: "done",
        },
      },
      done: {},
    },
  });
}

describe("flush ready-work boundary", () => {
  it("defers dispatched work until the owner mailbox starts and then keeps FIFO order", async () => {
    const owner = {};
    const steps: string[] = [];

    dispatchReadyWork(owner, () => {
      steps.push("pre-start");
    });

    expect(steps).toEqual([]);
    expect(readyWorkPendingCount(owner)).toBe(1);

    startReadyWork(owner);
    expect(steps).toEqual([]);
    expect(readyWorkPendingCount(owner)).toBe(1);

    enqueueReadyWork(owner, () => {
      steps.push("queued");
    });
    await flushReadyWork(owner);

    expect(steps).toEqual(["pre-start", "queued"]);

    dispatchReadyWork(owner, () => {
      steps.push("dispatch");
      dispatchReadyWork(owner, () => {
        steps.push("nested-dispatch");
      });
    });

    expect(steps).toEqual(["pre-start", "queued", "dispatch", "nested-dispatch"]);
  });

  it("leaves follow-on ready continuations pending after an auto-dispatch flush", async () => {
    const owner = {};
    const steps: string[] = [];

    startReadyWork(owner);

    dispatchReadyWork(owner, () => {
      steps.push("dispatch");
      enqueueReadyWork(owner, () => {
        steps.push("continuation");
      });
    });

    expect(steps).toEqual(["dispatch"]);
    expect(readyWorkPendingCount(owner)).toBe(1);

    await flushReadyWork(owner);

    expect(steps).toEqual(["dispatch", "continuation"]);
    expect(readyWorkPendingCount(owner)).toBe(0);
  });

  it("drains queued ready work for flowTest and keeps nested tasks in the same flush", async () => {
    const harness = flowTest(createFlushMachine()).start();

    enqueueReadyWork(harness, () => {
      harness.send({ type: "STEP" });
      enqueueReadyWork(harness, () => {
        harness.send({ type: "STEP" });
      });
    });

    expect(harness.state()).toBe("idle");

    await harness.flush();

    expect(harness.state()).toBe("done");
  });

  it("does not wait for future continuations that have not become ready yet", async () => {
    const harness = flowTest(createFlushMachine()).start();
    let release!: () => void;
    const futureReadyWork = new Promise<void>((resolve) => {
      release = resolve;
    }).then(() => {
      enqueueReadyWork(harness, () => {
        harness.send({ type: "STEP" });
      });
    });

    await harness.flush();

    expect(harness.state()).toBe("idle");

    release();
    await futureReadyWork;
    expect(harness.state()).toBe("idle");

    await harness.flush();

    expect(harness.state()).toBe("ready");
  });

  it("drains queued ready work for runtime actors too", async () => {
    const actor = createTestRuntimeWithInstallers().createActor(createFlushMachine());

    enqueueReadyWork(actor, () => {
      actor.send({ type: "STEP" });
    });

    expect(actor.getSnapshot().value).toBe("idle");

    await actor.flush();

    expect(actor.getSnapshot().value).toBe("ready");
    await actor.dispose();
  });

  it("keeps queued stream callbacks ahead of later external sends in flowTest", () => {
    const tokens = createControlledStream<string>("flush.mailbox.stream");
    const machine = flow.machine<
      { readonly tokens: ReadonlyArray<string> },
      | Readonly<{ readonly type: "START" }>
      | Readonly<{ readonly type: "STOP" }>
      | Readonly<{ readonly type: "TOKEN"; readonly value: string }>,
      "idle" | "streaming" | "done"
    >({
      id: "flush.mailbox.stream.machine",
      initial: "idle",
      context: () => ({ tokens: [] }),
      states: {
        idle: {
          on: {
            START: "streaming",
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "flush.mailbox.stream.tokens",
            subscribe: () => tokens.stream(),
            routes: {
              value: (value) => ({ type: "TOKEN", value }),
            },
          }),
          on: {
            TOKEN: {
              update: ({ context, event }) =>
                event.type === "TOKEN" ? { tokens: [...context.tokens, event.value] } : context,
            },
            STOP: "done",
          },
        },
        done: {},
      },
    });

    const harness = flowTest(machine).start();

    harness.send({ type: "START" });
    tokens.emit("first");
    harness.send({ type: "STOP" });

    expect(harness.state()).toBe("done");
    expect(harness.context().tokens).toEqual(["first"]);
  });

  it("keeps queued timer callbacks ahead of later external sends in runtime actors", async () => {
    const machine = flow.machine<
      { readonly ticks: number },
      Readonly<{ readonly type: "START" }> | Readonly<{ readonly type: "CANCEL" }>,
      "idle" | "waiting" | "done" | "cancelled"
    >({
      id: "flush.mailbox.timer.machine",
      initial: "idle",
      context: () => ({ ticks: 0 }),
      states: {
        idle: {
          on: {
            START: "waiting",
          },
        },
        waiting: {
          after: flow.after({
            id: "flush.mailbox.timer.after",
            delay: "1 second",
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

    const runtime = createTestRuntimeWithInstallers({
      services: [TestClock.layer()],
    });

    try {
      const actor = runtime.createActor(machine);

      actor.send({ type: "START" });
      await runtime.runPromise(TestClock.adjust("1 second"));
      actor.send({ type: "CANCEL" });

      expect(actor.snapshot().value).toBe("done");
      expect(actor.snapshot().context.ticks).toBe(1);

      await actor.dispose();
    } finally {
      await runtime.dispose();
    }
  });
});
