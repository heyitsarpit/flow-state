import { describe, expect, it } from "vite-plus/test";

import { createRuntime, flow, flowTest } from "./index.js";
import { enqueueReadyWork } from "./ready-work.js";

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
  it("drains queued ready work for flowTest and keeps nested tasks in the same flush", async () => {
    const harness = flowTest.start(createFlushMachine()).start();

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
    const harness = flowTest.start(createFlushMachine()).start();
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
    const actor = createRuntime().createActor(createFlushMachine());

    enqueueReadyWork(actor, () => {
      actor.send({ type: "STEP" });
    });

    expect(actor.getSnapshot().value).toBe("idle");

    await actor.flush();

    expect(actor.getSnapshot().value).toBe("ready");
    await actor.dispose();
  });
});
