import { TestClock } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "./index.js";
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
const READY_WORK_ORACLE_TURN_LIMIT = 64;

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

function queueLabels(owner: string, count: number): ReadonlyArray<string> {
  return Array.from({ length: count }, (_, index) => `${owner}-${index}`);
}

function runReadyWorkQueueModel(
  startOrder: ReadonlyArray<string>,
  queuedByOwner: Readonly<Record<string, ReadonlyArray<string>>>,
  turnLimit = READY_WORK_ORACLE_TURN_LIMIT,
): ReadonlyArray<string> {
  const pending = new Map<string, Array<string>>(
    Object.entries(queuedByOwner).map(([owner, labels]) => [owner, [...labels]]),
  );
  const activeOwners = startOrder.filter((owner) => (pending.get(owner)?.length ?? 0) > 0);
  const drained: Array<string> = [];

  while (activeOwners.length > 0) {
    const owner = activeOwners.shift();
    if (owner === undefined) {
      break;
    }

    const queued = pending.get(owner);
    if (queued === undefined || queued.length === 0) {
      continue;
    }

    drained.push(...queued.splice(0, turnLimit));
    if (queued.length > 0) {
      activeOwners.push(owner);
    }
  }

  return drained;
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

  it("bounds automatic dispatch turns and drains the remainder through explicit flush", async () => {
    const owner = {};
    const steps: string[] = [];

    for (let index = 0; index < 70; index += 1) {
      enqueueReadyWork(owner, () => {
        steps.push(`queued-${index}`);
      });
    }

    startReadyWork(owner);
    dispatchReadyWork(owner, () => {
      steps.push("dispatch");
    });

    expect(steps).toHaveLength(64);
    expect(steps.at(0)).toBe("queued-0");
    expect(steps.at(-1)).toBe("queued-63");
    expect(readyWorkPendingCount(owner)).toBe(7);

    await flushReadyWork(owner);

    expect(steps).toHaveLength(71);
    expect(steps.at(-1)).toBe("dispatch");
    expect(readyWorkPendingCount(owner)).toBe(0);
  });

  it("yields between bounded manual turns so another ready owner can progress", async () => {
    const hotOwner = {};
    const otherOwner = {};
    const steps: string[] = [];
    const queuedByOwner = {
      hot: queueLabels("hot", 70),
      other: queueLabels("other", 70),
    } as const;

    for (const label of queuedByOwner.hot) {
      enqueueReadyWork(hotOwner, () => {
        steps.push(label);
      });
    }
    for (const label of queuedByOwner.other) {
      enqueueReadyWork(otherOwner, () => {
        steps.push(label);
      });
    }

    startReadyWork(hotOwner);
    startReadyWork(otherOwner);

    const otherFlush = Promise.resolve().then(() => flushReadyWork(otherOwner));
    const hotFlush = flushReadyWork(hotOwner);

    await Promise.all([hotFlush, otherFlush]);

    expect(steps).toEqual(runReadyWorkQueueModel(["hot", "other"], queuedByOwner));
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

  it("matches the independent FIFO owner model and keeps same-owner order non-commutative", async () => {
    const firstOwner = {};
    const secondOwner = {};
    const firstSequence = ["alpha", "beta", "gamma"] as const;
    const secondSequence = ["gamma", "beta", "alpha"] as const;
    const firstSteps: string[] = [];
    const secondSteps: string[] = [];

    for (const label of firstSequence) {
      enqueueReadyWork(firstOwner, () => {
        firstSteps.push(label);
      });
    }
    for (const label of secondSequence) {
      enqueueReadyWork(secondOwner, () => {
        secondSteps.push(label);
      });
    }

    startReadyWork(firstOwner);
    startReadyWork(secondOwner);

    await flushReadyWork(firstOwner);
    await flushReadyWork(secondOwner);

    expect(firstSteps).toEqual(runReadyWorkQueueModel(["owner"], { owner: firstSequence }));
    expect(secondSteps).toEqual(runReadyWorkQueueModel(["owner"], { owner: secondSequence }));
    expect(firstSteps).not.toEqual(secondSteps);
  });

  it("yields between bounded runtime actor flush turns so another actor can progress", async () => {
    const runtime = createTestRuntimeWithInstallers();
    const hotActor = runtime.createActor(createFlushMachine(), { id: "flush.hot.actor" });
    const otherActor = runtime.createActor(createFlushMachine(), { id: "flush.other.actor" });
    const steps: string[] = [];
    const queuedByOwner = {
      hot: queueLabels("hot", 70),
      other: queueLabels("other", 70),
    } as const;

    for (const label of queuedByOwner.hot) {
      enqueueReadyWork(hotActor, () => {
        steps.push(label);
      });
    }
    for (const label of queuedByOwner.other) {
      enqueueReadyWork(otherActor, () => {
        steps.push(label);
      });
    }

    const otherFlush = Promise.resolve().then(() => otherActor.flush());
    const hotFlush = hotActor.flush();

    await Promise.all([hotFlush, otherFlush]);

    expect(steps).toEqual(runReadyWorkQueueModel(["hot", "other"], queuedByOwner));

    await hotActor.dispose();
    await otherActor.dispose();
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

    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            flow.module("FlushMailboxTimer", {
              machines: {
                timer: machine,
              },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
          services: [TestClock.layer()],
        }),
    );

    try {
      const actor = runtime.orchestrators.start(machine);

      actor.send({ type: "START" });
      await runtime.runPromise(TestClock.adjust("1 second"));
      actor.send({ type: "CANCEL" });

      expect(actor.getSnapshot().value).toBe("done");
      expect(actor.getSnapshot().context.ticks).toBe(1);

      await actor.dispose();
    } finally {
      await runtime.dispose();
    }
  });
});
