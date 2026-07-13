import { describe, expect, it } from "vite-plus/test";

import type { FlowTestPendingWork } from "./core/api/types.js";
import * as flow from "./index.js";
import { createRuntimeBackedTestHarness } from "./testing/runtime-backed-test-harness.js";
import { createControlledStream } from "./testing.js";

function expectPendingStreamWork(
  pending: FlowTestPendingWork,
  machineId: string,
  streamId: string,
  ready: number,
) {
  expect(pending).toMatchObject({
    ready,
    activeFibers: 1,
    mailboxes: ready === 0 ? [] : [{ id: machineId, pending: ready }],
    timers: [],
    streams: [streamId],
    transactions: [],
    children: [],
  });
}

describe("stream pressure pending-work oracle", () => {
  it("keeps queue pressure bounded and refuses to settle while the stream stays active", async () => {
    const tokens = createControlledStream<string, never>("runtime.queue-pressure.oracle");
    const machine = flow.machine<
      { readonly tokens: ReadonlyArray<string> },
      | Readonly<{ readonly type: "START" }>
      | Readonly<{ readonly type: "TOKEN"; readonly token: string }>,
      "idle" | "streaming"
    >({
      id: "runtime.actor.stream.queue-pressure.oracle",
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
            id: "Runtime.queuePressureOracle",
            subscribe: () => tokens.stream(),
            pressure: {
              strategy: "queue",
              limit: 2,
            },
            routes: {
              value: (token) => ({ type: "TOKEN" as const, token }),
            },
          }),
          on: {
            TOKEN: {
              update: ({ context, event }) =>
                event.type === "TOKEN" ? { tokens: [...context.tokens, event.token] } : {},
            },
          },
        },
      },
    });

    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            flow.module("StreamPressureQueueOracle", {
              machines: {
                actor: machine,
              },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );
    const actor = runtime.createActor(machine, { id: machine.id });
    const harness = createRuntimeBackedTestHarness(runtime, actor);

    try {
      harness.send({ type: "START" });
      await harness.flush();

      tokens.emit("A");
      tokens.emit("B");
      tokens.emit("C");

      expectPendingStreamWork(harness.pendingWork(), machine.id, "Runtime.queuePressureOracle", 2);

      await expect(
        harness.settle({
          maxTicks: 1,
          maxFibers: 1,
        }),
      ).rejects.toThrow(/Runtime\.queuePressureOracle/);
      await expect(
        harness.settle({
          maxTicks: 1,
          maxFibers: 1,
        }),
      ).rejects.toThrow(/maxTicks=1/);

      expect(harness.context().tokens).toEqual(["A", "B"]);
      expect(harness.snapshot().streams["Runtime.queuePressureOracle"]).toMatchObject({
        status: "running",
        emitted: 2,
        value: "B",
      });
      expectPendingStreamWork(harness.pendingWork(), machine.id, "Runtime.queuePressureOracle", 0);

      tokens.emit("D");
      expectPendingStreamWork(harness.pendingWork(), machine.id, "Runtime.queuePressureOracle", 1);

      await harness.flush();

      expect(harness.context().tokens).toEqual(["A", "B", "D"]);
      expect(harness.snapshot().streams["Runtime.queuePressureOracle"]).toMatchObject({
        status: "running",
        emitted: 3,
        value: "D",
      });
    } finally {
      await runtime.dispose();
    }
  });

  it("keeps coalesced latest pending work bounded and refuses to settle while the stream stays active", async () => {
    const progress = createControlledStream<
      { readonly assetId: string; readonly uploadedBytes: number },
      never
    >("runtime.coalesce-pressure.oracle");
    const machine = flow.machine<
      { readonly uploadedByAsset: Readonly<Record<string, number>> },
      | Readonly<{ readonly type: "START" }>
      | Readonly<{
          readonly type: "UPLOAD_PROGRESS";
          readonly progress: { readonly assetId: string; readonly uploadedBytes: number };
        }>,
      "idle" | "streaming"
    >({
      id: "runtime.actor.stream.coalesce-pressure.oracle",
      initial: "idle",
      context: () => ({ uploadedByAsset: {} }),
      states: {
        idle: {
          on: {
            START: "streaming",
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "Runtime.coalescePressureOracle",
            subscribe: () => progress.stream(),
            pressure: {
              strategy: "coalesce-latest",
              key: (value: { readonly assetId: string }) => value.assetId,
            },
            routes: {
              value: (nextProgress) =>
                ({
                  type: "UPLOAD_PROGRESS" as const,
                  progress: nextProgress,
                }) as const,
            },
          }),
          on: {
            UPLOAD_PROGRESS: {
              update: ({ context, event }) =>
                event.type === "UPLOAD_PROGRESS"
                  ? {
                      uploadedByAsset: {
                        ...context.uploadedByAsset,
                        [event.progress.assetId]: event.progress.uploadedBytes,
                      },
                    }
                  : {},
            },
          },
        },
      },
    });

    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            flow.module("StreamPressureCoalesceOracle", {
              machines: {
                actor: machine,
              },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
        }),
    );
    const actor = runtime.createActor(machine, { id: machine.id });
    const harness = createRuntimeBackedTestHarness(runtime, actor);

    try {
      harness.send({ type: "START" });
      await harness.flush();

      progress.emit({ assetId: "asset-1", uploadedBytes: 1 });
      progress.emit({ assetId: "asset-2", uploadedBytes: 5 });
      progress.emit({ assetId: "asset-1", uploadedBytes: 2 });

      expectPendingStreamWork(
        harness.pendingWork(),
        machine.id,
        "Runtime.coalescePressureOracle",
        2,
      );

      await expect(
        harness.settle({
          maxTicks: 1,
          maxFibers: 1,
        }),
      ).rejects.toThrow(/Runtime\.coalescePressureOracle/);
      await expect(
        harness.settle({
          maxTicks: 1,
          maxFibers: 1,
        }),
      ).rejects.toThrow(/maxTicks=1/);

      expect(harness.context().uploadedByAsset).toEqual({
        "asset-1": 2,
        "asset-2": 5,
      });
      expect(harness.snapshot().streams["Runtime.coalescePressureOracle"]).toMatchObject({
        status: "running",
        emitted: 2,
        value: { assetId: "asset-2", uploadedBytes: 5 },
      });
      expectPendingStreamWork(
        harness.pendingWork(),
        machine.id,
        "Runtime.coalescePressureOracle",
        0,
      );

      progress.emit({ assetId: "asset-1", uploadedBytes: 3 });
      progress.emit({ assetId: "asset-2", uploadedBytes: 7 });

      expectPendingStreamWork(
        harness.pendingWork(),
        machine.id,
        "Runtime.coalescePressureOracle",
        2,
      );

      await harness.flush();

      expect(harness.context().uploadedByAsset).toEqual({
        "asset-1": 3,
        "asset-2": 7,
      });
      expect(harness.snapshot().streams["Runtime.coalescePressureOracle"]).toMatchObject({
        status: "running",
        emitted: 4,
        value: { assetId: "asset-2", uploadedBytes: 7 },
      });
    } finally {
      await runtime.dispose();
    }
  });
});
