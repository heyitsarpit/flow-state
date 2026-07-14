import { Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "./index.js";
import { createRuntime } from "./runtime/contract-runtime.js";
import { flowTest } from "./testing.js";
import { createFocusedTestApp } from "./testing/focused-app.js";
import { expectNormalizedRuntimeParity } from "./testing/runtime-parity-assertions.js";

describe("runtime stream parity", () => {
  it("preserves a present undefined value in runtime and Flow Test receipt facts", async () => {
    const streamId = "runtime-invokes.flow-test.stream-undefined-receipt";
    const machine = flow.machine<{}, never, "running", "running">({
      id: "runtime-invokes.flow-test.stream-undefined-receipt-machine",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          invoke: flow.stream({
            id: streamId,
            subscribe: () => Stream.make(undefined),
          }),
        },
      },
    });
    const harness = flowTest(machine).start();
    const runtime = createRuntime(
      createFocusedTestApp(machine).layer({
        store: {
          kind: "store",
          mode: "test",
        },
        orchestrators: {
          kind: "orchestrators",
          mode: "test",
        },
      }),
    );
    const actor = runtime.createActor(machine, { id: machine.id });

    try {
      for (const receipts of [harness.receipts(), actor.receipts()]) {
        expect(receipts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: "stream:start",
              id: streamId,
              emitted: 0,
              lastValueAvailable: false,
            }),
          ]),
        );
      }

      await harness.flush();
      await actor.flush();

      expectNormalizedRuntimeParity(harness, actor);
      expect(harness.snapshot().streams[streamId]).toEqual({
        id: streamId,
        status: "success",
        generation: 1,
        emitted: 1,
        hasValue: true,
        value: undefined,
      });
      for (const receipts of [harness.receipts(), actor.receipts()]) {
        expect(receipts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: "stream:done",
              id: streamId,
              emitted: 1,
              lastValueAvailable: true,
            }),
          ]),
        );
      }
    } finally {
      await actor.dispose();
      await runtime.dispose();
    }
  });

  it("keeps synchronous state-owned stream value and done routing aligned between flowTest and a production runtime actor", async () => {
    type StreamEvent =
      | Readonly<{ readonly type: "START" }>
      | Readonly<{ readonly type: "TOKEN"; readonly token: "Ready" }>
      | Readonly<{ readonly type: "STREAM_DONE" }>;

    const machine = flow.machine<
      { readonly partial: string; readonly completed: boolean },
      StreamEvent,
      "idle" | "streaming" | "done"
    >({
      id: "runtime-invokes.flow-test.stream-sync-value-done-route",
      initial: "idle",
      context: () => ({
        partial: "",
        completed: false,
      }),
      states: {
        idle: {
          on: {
            START: {
              target: "streaming",
            },
          },
        },
        streaming: {
          invoke: flow.stream<
            { readonly partial: string; readonly completed: boolean },
            StreamEvent,
            void,
            "Ready"
          >({
            id: "runtime-invokes.flow-test.stream-sync-value-done-route.tokens",
            subscribe: () => Stream.make("Ready" as const),
            routes: {
              value: (token) => ({ type: "TOKEN" as const, token }),
              done: () => ({ type: "STREAM_DONE" as const }),
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

    const streamId = "runtime-invokes.flow-test.stream-sync-value-done-route.tokens";
    const harness = flowTest(machine).start();
    const runtime = createRuntime(
      createFocusedTestApp(machine).layer({
        store: {
          kind: "store",
          mode: "test",
        },
        orchestrators: {
          kind: "orchestrators",
          mode: "test",
        },
      }),
    );
    const actor = runtime.createActor(machine, { id: machine.id });

    try {
      const event = { type: "START" } as const;

      expect(flow.can(harness.snapshot(), event)).toBe(true);
      expect(flow.can(actor.getSnapshot(), event)).toBe(true);
      expect(harness.can(event)).toBe(true);
      expectNormalizedRuntimeParity(harness, actor);

      harness.send(event);
      actor.send(event);

      expectNormalizedRuntimeParity(harness, actor);
      expect(harness.state()).toBe("streaming");
      expect(harness.context()).toEqual({
        partial: "",
        completed: false,
      });
      expect(harness.snapshot().streams[streamId]).toMatchObject({
        status: "running",
        generation: 1,
        emitted: 0,
      });
      expect(
        harness
          .receipts()
          .some(
            (receipt) =>
              receipt.id === streamId &&
              (receipt.type === "stream:done" ||
                receipt.type === "stream:failure" ||
                receipt.type === "stream:defect" ||
                receipt.type === "stream:interrupt"),
          ),
      ).toBe(false);
      expect(harness.issues()).toEqual([]);

      await harness.flush();
      await actor.flush();

      expectNormalizedRuntimeParity(harness, actor);
      expect(harness.state()).toBe("done");
      expect(harness.context()).toEqual({
        partial: "Ready",
        completed: true,
      });
      expect(harness.snapshot().streams[streamId]).toMatchObject({
        status: "success",
        generation: 1,
        emitted: 1,
        value: "Ready",
      });
      const streamReceiptTypes = harness
        .receipts()
        .filter((receipt) => receipt.id === streamId)
        .map((receipt) => receipt.type);
      expect(streamReceiptTypes).toEqual(expect.arrayContaining(["stream:start", "stream:done"]));
      expect(
        streamReceiptTypes.indexOf("stream:start") < streamReceiptTypes.indexOf("stream:done"),
      ).toBe(true);
      expect(harness.issues()).toEqual([]);
    } finally {
      await actor.dispose();
      await runtime.dispose();
    }
  });
});
