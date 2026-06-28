import { describe, expect, it } from "vite-plus/test";

import { createControlledStream, flow, flowTest } from "./index.js";

describe("flowTest stream generations", () => {
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

    const harness = flowTest.start(machine).start();

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
});
