import { Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { FlowDiagnostic } from "./shared/diagnostics.js";
import * as flow from "./core/api/flow-core.js";
import type { AnyFlowMachine } from "./core/api/types.js";
import { readyWorkPendingCount } from "./core/scheduling/ready-work.js";
import { createControlledStream } from "./testing/controlled-stream.js";

function streamApp(machine: AnyFlowMachine) {
  return flow.app({
    modules: [
      flow.module("Runtime", {
        machines: {
          stream: machine,
        },
      }),
    ],
  });
}

describe("runtime stream ownership contracts", () => {
  it("preserves an emitted undefined value through terminal publication", async () => {
    const values = createControlledStream<undefined>("runtime.stream.undefined");
    const streamMachine = flow.machine<{}, never, "running", "running">({
      id: "runtime.actor.stream.undefined",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          invoke: flow.stream({
            id: "Runtime.undefinedValue",
            subscribe: () => values.stream(),
          }),
        },
      },
    });
    const runtime = flow.runtime(
      streamApp(streamMachine).layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );
    const actor = runtime.createActor(streamMachine);

    values.emit(undefined);
    values.end();
    await actor.flush();

    expect(actor.getSnapshot().streams["Runtime.undefinedValue"]).toEqual({
      id: "Runtime.undefinedValue",
      status: "success",
      generation: 1,
      emitted: 1,
      hasValue: true,
      value: undefined,
    });

    await runtime.dispose();
  });

  it("throws a tagged runtime diagnostic when stream params resolution throws", async () => {
    const paramsCause = new Error("params exploded");
    const streamMachine = flow.machine<
      {},
      Readonly<{ readonly type: "START" }>,
      "idle" | "streaming",
      "idle"
    >({
      id: "runtime.actor.stream.throwing-params",
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
            id: "Runtime.throwingParams",
            params: () => {
              throw paramsCause;
            },
            subscribe: () => Stream.empty,
          }),
        },
      },
    });

    const app = streamApp(streamMachine);

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );
    const actor = runtime.createActor(streamMachine);

    let failure: unknown;
    try {
      actor.send({ type: "START" });
    } catch (error) {
      failure = error;
    }

    expect(failure instanceof FlowDiagnostic).toBe(true);
    expect(failure).toMatchObject({
      code: "FLOW-STREAM-001",
      title: "Stream callback 'params' threw for 'Runtime.throwingParams'",
      debug: {
        callback: "params",
        cause: expect.objectContaining({
          message: "params exploded",
          name: "Error",
          stack: expect.any(String),
        }),
        streamId: "Runtime.throwingParams",
      },
    });
    expect(
      (failure as { debug?: { cause?: { stack?: string } } }).debug?.cause?.stack ?? "",
    ).toContain("params exploded");
    expect((failure as { cause?: unknown }).cause).toBe(paramsCause);

    await actor.dispose();
    await runtime.dispose();
  });

  it("bounds queued runtime stream deliveries when queue pressure has a limit", async () => {
    const tokens = createControlledStream<string, never>("runtime.queue-pressure");
    const streamMachine = flow.machine<
      { readonly tokens: ReadonlyArray<string> },
      { readonly type: "START" } | { readonly type: "TOKEN"; readonly token: string },
      "idle" | "streaming"
    >({
      id: "runtime.actor.stream.queue-pressure",
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
            id: "Runtime.queuePressure",
            subscribe: () => tokens.stream(),
            pressure: {
              strategy: "queue",
              limit: 2,
            },
            routes: {
              value: (token: string) => ({ type: "TOKEN", token }),
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

    const app = streamApp(streamMachine);

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.createActor(streamMachine);

    actor.send({ type: "START" });
    tokens.emit("A");
    tokens.emit("B");
    tokens.emit("C");

    expect(readyWorkPendingCount(actor)).toBe(2);
    expect(actor.issues()).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "stream",
        id: "Runtime.queuePressure",
        error: expect.objectContaining({
          code: "FLOW-STREAM-003",
          title: "Stream 'Runtime.queuePressure' exceeded the queued pressure capacity",
        }),
        facts: expect.objectContaining({
          correlationId: expect.any(String),
          parentState: "streaming",
          receiptTypes: expect.arrayContaining(["stream:start", "stream:pressure"]),
          relatedIds: expect.arrayContaining(["Runtime.queuePressure"]),
        }),
      }),
    ]);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) => receipt.id === "Runtime.queuePressure" && receipt.type === "stream:pressure",
        ),
    ).toEqual([
      expect.objectContaining({
        pressureStrategy: "queue",
        queueCapacity: 2,
        pendingValueCount: 2,
        parentState: "streaming",
      }),
    ]);

    await actor.flush();

    expect(actor.getSnapshot().context.tokens).toEqual(["A", "B"]);
    expect(actor.getSnapshot().streams["Runtime.queuePressure"]).toMatchObject({
      status: "running",
      emitted: 2,
      value: "B",
    });

    tokens.emit("D");
    expect(readyWorkPendingCount(actor)).toBe(1);

    await actor.flush();

    expect(actor.getSnapshot().context.tokens).toEqual(["A", "B", "D"]);
    expect(actor.getSnapshot().streams["Runtime.queuePressure"]).toMatchObject({
      status: "running",
      emitted: 3,
      value: "D",
    });

    await runtime.dispose();
  });

  it("coalesces keyed latest runtime stream values and ignores stale pending work after reentry", async () => {
    const progress = createControlledStream<
      { readonly assetId: string; readonly uploadedBytes: number },
      never
    >("runtime.coalesce-pressure");
    const streamMachine = flow.machine<
      { readonly uploadedByAsset: Readonly<Record<string, number>> },
      | { readonly type: "START" }
      | { readonly type: "STOP" }
      | {
          readonly type: "UPLOAD_PROGRESS";
          readonly progress: { readonly assetId: string; readonly uploadedBytes: number };
        },
      "idle" | "streaming"
    >({
      id: "runtime.actor.stream.coalesce-pressure",
      initial: "idle",
      context: () => ({ uploadedByAsset: {} }),
      states: {
        idle: {
          on: {
            START: {
              target: "streaming",
              update: () => ({ uploadedByAsset: {} }),
            },
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "Runtime.coalescePressure",
            subscribe: () => progress.stream(),
            pressure: {
              strategy: "coalesce-latest",
              limit: 2,
              key: (event: { readonly assetId: string }) => event.assetId,
            },
            routes: {
              value: (nextProgress) => ({ type: "UPLOAD_PROGRESS", progress: nextProgress }),
            },
          }),
          on: {
            STOP: {
              target: "idle",
              update: () => ({ uploadedByAsset: {} }),
            },
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

    const app = streamApp(streamMachine);

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.createActor(streamMachine);

    actor.send({ type: "START" });
    progress.emit({ assetId: "asset-1", uploadedBytes: 1 });
    progress.emit({ assetId: "asset-2", uploadedBytes: 5 });
    progress.emit({ assetId: "asset-1", uploadedBytes: 2 });

    expect(readyWorkPendingCount(actor)).toBe(2);
    expect(actor.issues()).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "stream",
        id: "Runtime.coalescePressure",
        error: expect.objectContaining({
          code: "FLOW-STREAM-004",
          title: "Stream 'Runtime.coalescePressure' replaced a pending coalesced value",
        }),
        facts: expect.objectContaining({
          correlationId: expect.any(String),
          parentState: "streaming",
          receiptTypes: expect.arrayContaining(["stream:start", "stream:pressure"]),
          relatedIds: expect.arrayContaining(["Runtime.coalescePressure"]),
        }),
      }),
    ]);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "Runtime.coalescePressure" && receipt.type === "stream:pressure",
        ),
    ).toEqual([
      expect.objectContaining({
        pressureStrategy: "coalesce-latest",
        pressureKey: "asset-1",
        parentState: "streaming",
      }),
    ]);

    await actor.flush();

    expect(actor.getSnapshot().context.uploadedByAsset).toEqual({
      "asset-1": 2,
      "asset-2": 5,
    });
    expect(actor.getSnapshot().streams["Runtime.coalescePressure"]).toMatchObject({
      status: "running",
      generation: 1,
      emitted: 2,
    });

    progress.emit({ assetId: "asset-1", uploadedBytes: 3 });
    progress.emit({ assetId: "asset-2", uploadedBytes: 7 });
    expect(readyWorkPendingCount(actor)).toBe(2);

    actor.send({ type: "STOP" });
    actor.send({ type: "START" });
    progress.emit({ assetId: "asset-3", uploadedBytes: 11 });

    await actor.flush();

    expect(actor.getSnapshot().context.uploadedByAsset).toEqual({
      "asset-3": 11,
    });
    expect(actor.getSnapshot().streams["Runtime.coalescePressure"]).toMatchObject({
      status: "running",
      generation: 2,
      emitted: 1,
      value: { assetId: "asset-3", uploadedBytes: 11 },
    });

    await runtime.dispose();
  });

  it("keeps runtime-owned streams live across emissions and interrupts them when the actor stops", async () => {
    const tokens = createControlledStream<{ readonly index: number; readonly text: string }, never>(
      "runtime.chat.tokens",
    );
    const streamMachine = flow.machine<
      { readonly partial: string },
      | { readonly type: "START" }
      | {
          readonly type: "TOKEN";
          readonly token: { readonly index: number; readonly text: string };
        },
      "idle" | "streaming"
    >({
      id: "runtime.actor.stream",
      initial: "idle",
      context: () => ({ partial: "" }),
      states: {
        idle: {
          on: {
            START: "streaming",
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "Runtime.tokenStream",
            subscribe: () => tokens.stream(),
            routes: {
              value: (token) => ({ type: "TOKEN", token }),
            },
          }),
          on: {
            TOKEN: {
              update: ({ context, event }) =>
                event.type === "TOKEN" ? { partial: `${context.partial}${event.token.text}` } : {},
            },
          },
        },
      },
    });

    const app = streamApp(streamMachine);

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.orchestrators.start(streamMachine, {
      id: "runtime-stream-actor",
      policy: "keep-alive",
    });

    actor.send({ type: "START" });
    tokens.emit({ index: 0, text: "Ready" });
    await actor.flush();

    expect(actor.getSnapshot().context.partial).toBe("Ready");
    expect(actor.getSnapshot().streams["Runtime.tokenStream"]).toMatchObject({
      status: "running",
      value: { index: 0, text: "Ready" },
    });

    await runtime.orchestrators.stop("runtime-stream-actor");
    await actor.flush();

    expect(tokens.cancelled()).toBe(true);
    expect(actor.getSnapshot().streams["Runtime.tokenStream"]).toMatchObject({
      status: "interrupt",
      value: { index: 0, text: "Ready" },
    });
    expect(actor.issues()).toEqual([
      expect.objectContaining({
        kind: "interrupt",
        source: "stream",
        id: "Runtime.tokenStream",
      }),
    ]);

    const receiptsAfterStop = actor.receipts().length;
    tokens.emit({ index: 1, text: " stale" });
    await actor.flush();

    expect(actor.getSnapshot().context.partial).toBe("Ready");
    expect(actor.receipts()).toHaveLength(receiptsAfterStop);
  });

  it("restarts runtime-owned stream generations without replaying stale tokens from the prior run", async () => {
    const tokens = createControlledStream<{ readonly index: number; readonly text: string }, never>(
      "runtime.chat.tokens.reused",
    );
    const streamMachine = flow.machine<
      { readonly partial: string },
      | { readonly type: "START" }
      | { readonly type: "STOP" }
      | {
          readonly type: "TOKEN";
          readonly token: { readonly index: number; readonly text: string };
        },
      "idle" | "streaming"
    >({
      id: "runtime.actor.stream.generation",
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
            id: "Runtime.tokenStream",
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

    const app = streamApp(streamMachine);

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.orchestrators.start(streamMachine, {
      id: "runtime-stream-generation-actor",
      policy: "keep-alive",
    });

    actor.send({ type: "START" });
    tokens.emit({ index: 0, text: "Ready" });
    await actor.flush();
    expect(actor.getSnapshot().context.partial).toBe("Ready");
    expect(actor.getSnapshot().streams["Runtime.tokenStream"]).toMatchObject({
      generation: 1,
      emitted: 1,
      value: { index: 0, text: "Ready" },
    });

    actor.send({ type: "STOP" });
    await actor.flush();

    expect(tokens.cancelled()).toBe(true);
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.issues()).toEqual([
      expect.objectContaining({
        kind: "interrupt",
        source: "stream",
        id: "Runtime.tokenStream",
      }),
    ]);

    tokens.emit({ index: 1, text: " stale" });
    actor.send({ type: "START" });
    tokens.emit({ index: 0, text: "Fresh" });
    await actor.flush();

    expect(actor.getSnapshot().context.partial).toBe("Fresh");
    expect(actor.getSnapshot().streams["Runtime.tokenStream"]).toMatchObject({
      status: "running",
      generation: 2,
      emitted: 1,
      value: { index: 0, text: "Fresh" },
    });
    expect(actor.issues()).toEqual([]);
  });

  it("routes interrupt events after a runtime-owned stream is cancelled by state exit", async () => {
    const tokens = createControlledStream<string, never>("runtime.route-interrupt");
    const streamMachine = flow.machine<
      { readonly interrupted: boolean },
      | { readonly type: "START" }
      | { readonly type: "STOP" }
      | { readonly type: "STREAM_INTERRUPTED" },
      "idle" | "streaming" | "cancelled"
    >({
      id: "runtime.actor.stream.interrupt-route",
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
            id: "Runtime.interruptRoute",
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

    const app = streamApp(streamMachine);

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.createActor(streamMachine);

    actor.send({ type: "START" });
    actor.send({ type: "STOP" });
    await actor.flush();

    expect(actor.getSnapshot().value).toBe("cancelled");
    expect(actor.getSnapshot().context.interrupted).toBe(true);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "Runtime.interruptRoute" && receipt.type === "stream:interrupt",
        ),
    ).toHaveLength(1);

    await runtime.dispose();
  });

  it("routes done events from runtime-owned streams", async () => {
    const tokens = createControlledStream<string, never>("runtime.route-done");
    const streamMachine = flow.machine<
      { readonly partial: string; readonly completed: boolean },
      | { readonly type: "START" }
      | { readonly type: "TOKEN"; readonly token: string }
      | { readonly type: "STREAM_DONE" },
      "idle" | "streaming" | "done"
    >({
      id: "runtime.actor.stream.done-route",
      initial: "idle",
      context: () => ({ partial: "", completed: false }),
      states: {
        idle: {
          on: {
            START: "streaming",
          },
        },
        streaming: {
          invoke: flow.stream<
            unknown,
            | { readonly type: "START" }
            | { readonly type: "TOKEN"; readonly token: string }
            | { readonly type: "STREAM_DONE" },
            void,
            string
          >({
            id: "Runtime.doneRoute",
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

    const app = streamApp(streamMachine);

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.createActor(streamMachine);

    actor.send({ type: "START" });
    tokens.emit("Ready");
    await actor.flush();

    tokens.end();
    await actor.flush();

    expect(actor.getSnapshot().value).toBe("done");
    expect(actor.getSnapshot().context).toMatchObject({
      partial: "Ready",
      completed: true,
    });
    expect(actor.getSnapshot().streams["Runtime.doneRoute"]).toMatchObject({
      status: "success",
      value: "Ready",
    });
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.id === "Runtime.doneRoute" && receipt.type === "stream:done"),
    ).toHaveLength(1);
    expect(actor.issues()).toEqual([]);

    await actor.dispose();
    await runtime.dispose();
  });

  it("routes typed failure events from runtime-owned streams without dropping the last value", async () => {
    const tokens = createControlledStream<string, "offline">("runtime.route-failure");
    const streamMachine = flow.machine<
      { readonly partial: string; readonly failedWith: "offline" | null },
      | { readonly type: "START" }
      | { readonly type: "TOKEN"; readonly token: string }
      | { readonly type: "STREAM_FAILED"; readonly error: "offline" },
      "idle" | "streaming" | "failed"
    >({
      id: "runtime.actor.stream.failure-route",
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
            id: "Runtime.failureRoute",
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

    const app = streamApp(streamMachine);

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.createActor(streamMachine);

    actor.send({ type: "START" });
    tokens.emit("Ready");
    await actor.flush();

    tokens.fail("offline");
    await actor.flush();

    expect(actor.getSnapshot().value).toBe("failed");
    expect(actor.getSnapshot().context).toMatchObject({
      partial: "Ready",
      failedWith: "offline",
    });
    expect(actor.getSnapshot().streams["Runtime.failureRoute"]).toMatchObject({
      status: "failure",
      value: "Ready",
      error: "offline",
    });
    expect(actor.issues()).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "stream",
        id: "Runtime.failureRoute",
        error: "offline",
      }),
    ]);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) => receipt.id === "Runtime.failureRoute" && receipt.type === "stream:failure",
        ),
    ).toHaveLength(1);

    await actor.dispose();
    await runtime.dispose();
  });

  it("routes defect events from runtime-owned streams", async () => {
    const streamMachine = flow.machine<
      { readonly defected: boolean },
      { readonly type: "START" } | { readonly type: "STREAM_DEFECT" },
      "idle" | "streaming" | "defected"
    >({
      id: "runtime.actor.stream.defect-route",
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
            id: "Runtime.defectRoute",
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

    const app = streamApp(streamMachine);

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.createActor(streamMachine);

    actor.send({ type: "START" });
    await actor.flush();

    expect(actor.getSnapshot().value).toBe("defected");
    expect(actor.getSnapshot().context.defected).toBe(true);
    expect(actor.getSnapshot().streams["Runtime.defectRoute"]).toMatchObject({
      status: "defect",
    });
    expect(actor.getSnapshot().streams["Runtime.defectRoute"]).not.toHaveProperty("error");
    expect(actor.issues()).toEqual([
      expect.objectContaining({
        kind: "defect",
        source: "stream",
        id: "Runtime.defectRoute",
      }),
    ]);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) => receipt.id === "Runtime.defectRoute" && receipt.type === "stream:defect",
        ),
    ).toHaveLength(1);

    await runtime.dispose();
  });

  it("interrupts runtime-owned streams when the runtime disposes", async () => {
    const tokens = createControlledStream<{ readonly index: number; readonly text: string }, never>(
      "runtime.chat.tokens.dispose",
    );
    const streamMachine = flow.machine<
      { readonly partial: string },
      | { readonly type: "START" }
      | {
          readonly type: "TOKEN";
          readonly token: { readonly index: number; readonly text: string };
        },
      "idle" | "streaming"
    >({
      id: "runtime.actor.stream.dispose",
      initial: "idle",
      context: () => ({ partial: "" }),
      states: {
        idle: {
          on: {
            START: "streaming",
          },
        },
        streaming: {
          invoke: flow.stream({
            id: "Runtime.tokenStream",
            subscribe: () => tokens.stream(),
            routes: {
              value: (token) => ({ type: "TOKEN", token }),
            },
          }),
          on: {
            TOKEN: {
              update: ({ context, event }) =>
                event.type === "TOKEN" ? { partial: `${context.partial}${event.token.text}` } : {},
            },
          },
        },
      },
    });

    const app = streamApp(streamMachine);

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.orchestrators.start(streamMachine, {
      id: "runtime-stream-dispose-actor",
      policy: "keep-alive",
    });

    actor.send({ type: "START" });
    tokens.emit({ index: 0, text: "Ready" });
    await actor.flush();

    await runtime.dispose();
    await actor.flush();

    expect(tokens.cancelled()).toBe(true);
    expect(actor.getSnapshot().streams["Runtime.tokenStream"]).toMatchObject({
      status: "interrupt",
      value: { index: 0, text: "Ready" },
    });
    expect(actor.issues()).toEqual([
      expect.objectContaining({
        kind: "interrupt",
        source: "stream",
        id: "Runtime.tokenStream",
      }),
    ]);

    const receiptsAfterDispose = actor.receipts().length;
    tokens.emit({ index: 1, text: " stale" });
    await actor.flush();

    expect(actor.getSnapshot().context.partial).toBe("Ready");
    expect(actor.receipts()).toHaveLength(receiptsAfterDispose);
  });
});
