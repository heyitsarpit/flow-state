import { describe, expect, it } from "vite-plus/test";
import { TestClock } from "effect/testing";

import { flow, flowTest } from "./index.js";

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

describe("Phase 6 invoke time contract", () => {
  it("keeps flush distinct from virtual-time advance in flowTest", async () => {
    const machine = createTimerMachine("flow-test.after");
    const harness = flowTest.start(machine).start();

    await harness.flush();
    expect(harness.state()).toBe("waiting");
    expect(harness.context().ticks).toBe(0);

    await harness.advance("1999 millis");
    expect(harness.state()).toBe("waiting");
    expect(harness.context().ticks).toBe(0);

    await harness.advance("1 millis");
    expect(harness.state()).toBe("done");
    expect(harness.context().ticks).toBe(1);
  });

  it("fires flow.after transitions in runtime actors with TestClock", async () => {
    const machine = createTimerMachine("runtime.after");
    const TimeModule = flow.module("Time", () => ({
      machines: {
        timer: machine,
      },
    }));
    const app = flow.app({
      modules: [TimeModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test({ namespace: "runtime-after" }),
        orchestrators: flow.orchestrators.test({ deterministic: true }),
        services: [TestClock.layer()],
      }),
    );

    const actor = runtime.createActor(machine);

    await runtime.runPromise(TestClock.adjust("1999 millis"));
    await actor.flush();
    expect(actor.snapshot().value).toBe("waiting");
    expect(actor.snapshot().context.ticks).toBe(0);

    await runtime.runPromise(TestClock.adjust("1 millis"));
    await actor.flush();

    expect(actor.snapshot().value).toBe("done");
    expect(actor.snapshot().context.ticks).toBe(1);
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "machine:transition",
          id: "runtime.after",
          trigger: "after",
          from: "waiting",
          to: "done",
        }),
      ]),
    );

    await runtime.dispose();
  });

  it("cancels flow.after transitions on state exit in runtime actors", async () => {
    const machine = createTimerMachine("runtime.after.cancel");
    const TimeModule = flow.module("TimeCancel", () => ({
      machines: {
        timer: machine,
      },
    }));
    const app = flow.app({
      modules: [TimeModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test({ namespace: "runtime-after-cancel" }),
        orchestrators: flow.orchestrators.test({ deterministic: true }),
        services: [TestClock.layer()],
      }),
    );

    const actor = runtime.createActor(machine);
    actor.send({ type: "CANCEL" });
    await actor.flush();

    await runtime.runPromise(TestClock.adjust("2 seconds"));
    await actor.flush();

    expect(actor.snapshot().value).toBe("cancelled");
    expect(actor.snapshot().context.ticks).toBe(0);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.type === "machine:transition" &&
            receipt.trigger === "after" &&
            receipt.id === "runtime.after.cancel",
        ),
    ).toHaveLength(0);

    await runtime.dispose();
  });

  it("cancels flow.after transitions on actor stop in runtime actors", async () => {
    const machine = createTimerMachine("runtime.after.actor-stop");
    const TimeModule = flow.module("TimeActorStop", () => ({
      machines: {
        timer: machine,
      },
    }));
    const app = flow.app({
      modules: [TimeModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test({ namespace: "runtime-after-actor-stop" }),
        orchestrators: flow.orchestrators.test({ deterministic: true }),
        services: [TestClock.layer()],
      }),
    );

    const actor = runtime.createActor(machine);
    await actor.dispose();

    await runtime.runPromise(TestClock.adjust("2 seconds"));
    await actor.flush();

    expect(actor.snapshot().value).toBe("waiting");
    expect(actor.snapshot().context.ticks).toBe(0);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.type === "machine:transition" &&
            receipt.trigger === "after" &&
            receipt.id === "runtime.after.actor-stop",
        ),
    ).toHaveLength(0);
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.type === "actor:dispose" && receipt.id === actor.id),
    ).toHaveLength(1);

    await runtime.dispose();
  });
});
