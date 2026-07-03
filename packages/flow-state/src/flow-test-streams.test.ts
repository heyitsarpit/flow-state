import { Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { FlowDiagnostic } from "./shared/diagnostics.js";
import * as flow from "./index.js";
import { createControlledStream, flowTest } from "./testing.js";

describe("flowTest stream generations", () => {
  it("throws a tagged diagnostic from flowTest when stream params resolution throws", () => {
    const paramsCause = new Error("params exploded");
    const machine = flow.machine<
      {},
      Readonly<{ readonly type: "START" }>,
      "idle" | "streaming",
      "idle"
    >({
      id: "flow-test.stream.throwing-params",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            START: "streaming",
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "FlowTest.throwingParams",
            params: () => {
              throw paramsCause;
            },
            subscribe: () => Stream.empty,
          }),
        },
      },
    });
    const harness = flowTest(machine);

    let failure: unknown;
    try {
      harness.send({ type: "START" });
    } catch (error) {
      failure = error;
    }

    expect(failure instanceof FlowDiagnostic).toBe(true);
    expect(failure).toMatchObject({
      code: "FLOW-STREAM-001",
      title: "Stream callback 'params' threw for 'FlowTest.throwingParams'",
      debug: {
        callback: "params",
        cause: expect.objectContaining({
          message: "params exploded",
          name: "Error",
          stack: expect.any(String),
        }),
        streamId: "FlowTest.throwingParams",
      },
    });
    expect(
      (failure as { debug?: { cause?: { stack?: string } } }).debug?.cause?.stack ?? "",
    ).toContain("params exploded");
    expect((failure as { cause?: unknown }).cause).toBe(paramsCause);
  });

  it("tracks stream generations, interrupts old generations, and ignores stale tokens", async () => {
    const tokens = createControlledStream<{ readonly index: number; readonly text: string }>(
      "flow-test.tokens.reused",
    );

    const machine = flow.machine<
      { readonly partial: string },
      | { readonly type: "START" }
      | { readonly type: "STOP" }
      | {
          readonly type: "TOKEN";
          readonly token: { readonly index: number; readonly text: string };
        },
      "idle" | "streaming"
    >({
      id: "flow-test.stream.machine",
      initial: "idle",
      context: () => ({ partial: "" }),
      states: {
        idle: {
          on: {
            START: {
              target: "streaming",
              update: () => ({ partial: "" }),
            },
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "FlowTest.tokenStream",
            subscribe: () => tokens.stream(),
            routes: {
              value: (token) => ({ type: "TOKEN", token }),
            },
          }),
          on: {
            STOP: {
              target: "idle",
              update: () => ({ partial: "" }),
            },
            TOKEN: {
              update: ({ context, event }) =>
                event.type === "TOKEN" ? { partial: `${context.partial}${event.token.text}` } : {},
            },
          },
        },
      },
    });

    const harness = flowTest(machine).start();

    harness.send({ type: "START" });
    const firstGeneration = harness.streams().running("FlowTest.tokenStream")?.generation;
    expect(firstGeneration).toBe(1);

    tokens.emit({ index: 0, text: "Ready" });
    await harness.flush();

    expect(harness.context().partial).toBe("Ready");
    expect(harness.streams().running("FlowTest.tokenStream")).toMatchObject({
      generation: firstGeneration,
      emitted: 1,
      value: { index: 0, text: "Ready" },
    });

    harness.send({ type: "STOP" });
    await harness.flush();

    expect(tokens.cancelled()).toBe(true);
    expect(harness.state()).toBe("idle");
    expect(harness.streams().cancelled("FlowTest.tokenStream")).toMatchObject({
      status: "interrupt",
      generation: firstGeneration,
      value: { index: 0, text: "Ready" },
    });
    expect(
      harness
        .streams()
        .events("FlowTest.tokenStream")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["stream:interrupt"]));
    expect(harness.issues()).toEqual([
      expect.objectContaining({
        kind: "interrupt",
        source: "stream",
        id: "FlowTest.tokenStream",
      }),
    ]);

    tokens.emit({ index: 1, text: " stale" });
    harness.send({ type: "START" });
    const secondGeneration = harness.streams().running("FlowTest.tokenStream")?.generation;
    expect(secondGeneration).toBeGreaterThan(firstGeneration ?? 0);

    tokens.emit({ index: 0, text: "Fresh" });
    await harness.flush();

    expect(harness.context().partial).toBe("Fresh");
    expect(harness.streams().running("FlowTest.tokenStream")).toMatchObject({
      generation: secondGeneration,
      emitted: 1,
      value: { index: 0, text: "Fresh" },
    });
  });

  it("routes interrupt events after a state-owned stream is cancelled by state exit", async () => {
    const tokens = createControlledStream<string>("flow-test.route-interrupt");

    const machine = flow.machine<
      { readonly interrupted: boolean },
      | { readonly type: "START" }
      | { readonly type: "STOP" }
      | { readonly type: "STREAM_INTERRUPTED" },
      "idle" | "streaming" | "cancelled"
    >({
      id: "flow-test.stream.interrupt-route",
      initial: "idle",
      context: () => ({ interrupted: false }),
      states: {
        idle: {
          on: {
            START: "streaming",
            STREAM_INTERRUPTED: {
              target: "cancelled",
              update: () => ({ interrupted: true }),
            },
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "FlowTest.interruptRoute",
            subscribe: () => tokens.stream(),
            routes: {
              interrupt: () => ({ type: "STREAM_INTERRUPTED" }),
            },
          }),
          on: {
            STOP: "idle",
          },
        },
        cancelled: {},
      },
    });

    const harness = flowTest(machine).start();

    harness.send({ type: "START" });
    harness.send({ type: "STOP" });
    await harness.flush();

    expect(harness.state()).toBe("cancelled");
    expect(harness.context().interrupted).toBe(true);
    expect(
      harness
        .streams()
        .events("FlowTest.interruptRoute")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["stream:interrupt"]));
  });

  it("routes done events from state-owned streams", async () => {
    const tokens = createControlledStream<string>("flow-test.route-done");

    const machine = flow.machine<
      { readonly partial: string; readonly completed: boolean },
      | { readonly type: "START" }
      | { readonly type: "TOKEN"; readonly token: string }
      | { readonly type: "STREAM_DONE" },
      "idle" | "streaming" | "done"
    >({
      id: "flow-test.stream.done-route",
      initial: "idle",
      context: () => ({ partial: "", completed: false }),
      states: {
        idle: {
          on: {
            START: "streaming",
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "FlowTest.doneRoute",
            subscribe: () => tokens.stream(),
            routes: {
              value: (token) => ({ type: "TOKEN", token }),
              done: () => ({ type: "STREAM_DONE" }),
            },
          }),
          on: {
            TOKEN: {
              update: ({ context, event }) =>
                event.type === "TOKEN" ? { partial: `${context.partial}${event.token}` } : {},
            },
            STREAM_DONE: {
              target: "done",
              update: () => ({ completed: true }),
            },
          },
        },
        done: {},
      },
    });

    const harness = flowTest(machine).start();

    harness.send({ type: "START" });
    tokens.emit("Ready");
    await harness.flush();

    tokens.end();
    await harness.flush();

    expect(harness.state()).toBe("done");
    expect(harness.context()).toMatchObject({
      partial: "Ready",
      completed: true,
    });
    expect(harness.streams().all()["FlowTest.doneRoute"]).toMatchObject({
      status: "success",
      value: "Ready",
    });
    expect(
      harness
        .streams()
        .events("FlowTest.doneRoute")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["stream:done"]));
    expect(harness.issues()).toEqual([]);
  });

  it("routes typed failure events from state-owned streams without dropping the last value", async () => {
    const tokens = createControlledStream<string, "offline">("flow-test.route-failure");

    const machine = flow.machine<
      { readonly partial: string; readonly failedWith: "offline" | null },
      | { readonly type: "START" }
      | { readonly type: "TOKEN"; readonly token: string }
      | { readonly type: "STREAM_FAILED"; readonly error: "offline" },
      "idle" | "streaming" | "failed"
    >({
      id: "flow-test.stream.failure-route",
      initial: "idle",
      context: () => ({ partial: "", failedWith: null }),
      states: {
        idle: {
          on: {
            START: "streaming",
          },
        },
        streaming: {
          invoke: flow.stream<
            { readonly partial: string; readonly failedWith: "offline" | null },
            | { readonly type: "START" }
            | { readonly type: "TOKEN"; readonly token: string }
            | { readonly type: "STREAM_FAILED"; readonly error: "offline" },
            void,
            string,
            "offline"
          >({
            id: "FlowTest.failureRoute",
            subscribe: () => tokens.stream(),
            routes: {
              value: (token) => ({ type: "TOKEN", token }),
              failure: (error) => ({ type: "STREAM_FAILED", error }),
            },
          }),
          on: {
            TOKEN: {
              update: ({ context, event }) =>
                event.type === "TOKEN" ? { partial: `${context.partial}${event.token}` } : {},
            },
            STREAM_FAILED: {
              target: "failed",
              update: ({ event }) =>
                event.type === "STREAM_FAILED" ? { failedWith: event.error } : {},
            },
          },
        },
        failed: {},
      },
    });

    const harness = flowTest(machine).start();

    harness.send({ type: "START" });
    tokens.emit("Ready");
    await harness.flush();

    tokens.fail("offline");
    await harness.flush();

    expect(harness.state()).toBe("failed");
    expect(harness.context()).toMatchObject({
      partial: "Ready",
      failedWith: "offline",
    });
    expect(harness.streams().all()["FlowTest.failureRoute"]).toMatchObject({
      status: "failure",
      value: "Ready",
      error: "offline",
    });
    expect(harness.issues()).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "stream",
        id: "FlowTest.failureRoute",
        error: "offline",
      }),
    ]);
    expect(
      harness
        .streams()
        .events("FlowTest.failureRoute")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["stream:failure"]));
  });

  it("routes defect events from state-owned streams", async () => {
    const machine = flow.machine<
      { readonly defected: boolean },
      { readonly type: "START" } | { readonly type: "STREAM_DEFECT" },
      "idle" | "streaming" | "defected"
    >({
      id: "flow-test.stream.defect-route",
      initial: "idle",
      context: () => ({ defected: false }),
      states: {
        idle: {
          on: {
            START: "streaming",
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "FlowTest.defectRoute",
            subscribe: () => Stream.die("boom"),
            routes: {
              defect: () => ({ type: "STREAM_DEFECT" }),
            },
          }),
          on: {
            STREAM_DEFECT: {
              target: "defected",
              update: () => ({ defected: true }),
            },
          },
        },
        defected: {},
      },
    });

    const harness = flowTest(machine).start();

    harness.send({ type: "START" });
    await harness.flush();

    expect(harness.state()).toBe("defected");
    expect(harness.context().defected).toBe(true);
    expect(harness.issues()).toEqual([
      expect.objectContaining({
        kind: "defect",
        source: "stream",
        id: "FlowTest.defectRoute",
      }),
    ]);
    expect(
      harness
        .streams()
        .events("FlowTest.defectRoute")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["stream:defect"]));
  });
});
