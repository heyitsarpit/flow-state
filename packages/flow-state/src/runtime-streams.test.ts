import { Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { flow } from "./public/flow.js";
import { RuntimeModule } from "./runtime-test-fixtures.js";
import { createControlledStream } from "./testing/controlled-stream.js";

describe("Phase 3 runtime stream ownership contract", () => {
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

    const app = flow.app({
      modules: [RuntimeModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test({ namespace: "runtime-stream-stop" }),
        orchestrators: flow.orchestrators.test({ deterministic: true }),
      }),
    );

    const actor = runtime.orchestrators.start(streamMachine, {
      id: "runtime-stream-actor",
      policy: "keep-alive",
    });

    actor.send({ type: "START" });
    tokens.emit({ index: 0, text: "Ready" });
    await actor.flush();

    expect(actor.snapshot().context.partial).toBe("Ready");
    expect(actor.snapshot().streams["Runtime.tokenStream"]).toMatchObject({
      status: "running",
      value: { index: 0, text: "Ready" },
    });

    await runtime.orchestrators.stop("runtime-stream-actor");
    await actor.flush();

    expect(tokens.cancelled()).toBe(true);
    expect(actor.snapshot().streams["Runtime.tokenStream"]).toMatchObject({
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

    expect(actor.snapshot().context.partial).toBe("Ready");
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

    const app = flow.app({
      modules: [RuntimeModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test({ namespace: "runtime-stream-generation" }),
        orchestrators: flow.orchestrators.test({ deterministic: true }),
      }),
    );

    const actor = runtime.orchestrators.start(streamMachine, {
      id: "runtime-stream-generation-actor",
      policy: "keep-alive",
    });

    actor.send({ type: "START" });
    tokens.emit({ index: 0, text: "Ready" });
    await actor.flush();
    expect(actor.snapshot().context.partial).toBe("Ready");
    expect(actor.snapshot().streams["Runtime.tokenStream"]).toMatchObject({
      generation: 1,
      emitted: 1,
      value: { index: 0, text: "Ready" },
    });

    actor.send({ type: "STOP" });
    await actor.flush();

    expect(tokens.cancelled()).toBe(true);
    expect(actor.snapshot().value).toBe("idle");
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

    expect(actor.snapshot().context.partial).toBe("Fresh");
    expect(actor.snapshot().streams["Runtime.tokenStream"]).toMatchObject({
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

    const app = flow.app({
      modules: [RuntimeModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test({ namespace: "runtime-stream-interrupt-route" }),
        orchestrators: flow.orchestrators.test({ deterministic: true }),
      }),
    );

    const actor = runtime.createActor(streamMachine);

    actor.send({ type: "START" });
    actor.send({ type: "STOP" });
    await actor.flush();

    expect(actor.snapshot().value).toBe("cancelled");
    expect(actor.snapshot().context.interrupted).toBe(true);
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
          invoke: flow.stream({
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

    const app = flow.app({
      modules: [RuntimeModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test({ namespace: "runtime-stream-done-route" }),
        orchestrators: flow.orchestrators.test({ deterministic: true }),
      }),
    );

    const actor = runtime.createActor(streamMachine);

    actor.send({ type: "START" });
    tokens.emit("Ready");
    await actor.flush();

    tokens.end();
    await actor.flush();

    expect(actor.snapshot().value).toBe("done");
    expect(actor.snapshot().context).toMatchObject({
      partial: "Ready",
      completed: true,
    });
    expect(actor.snapshot().streams["Runtime.doneRoute"]).toMatchObject({
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

    const app = flow.app({
      modules: [RuntimeModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test({ namespace: "runtime-stream-failure-route" }),
        orchestrators: flow.orchestrators.test({ deterministic: true }),
      }),
    );

    const actor = runtime.createActor(streamMachine);

    actor.send({ type: "START" });
    tokens.emit("Ready");
    await actor.flush();

    tokens.fail("offline");
    await actor.flush();

    expect(actor.snapshot().value).toBe("failed");
    expect(actor.snapshot().context).toMatchObject({
      partial: "Ready",
      failedWith: "offline",
    });
    expect(actor.snapshot().streams["Runtime.failureRoute"]).toMatchObject({
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

    const app = flow.app({
      modules: [RuntimeModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test({ namespace: "runtime-stream-defect-route" }),
        orchestrators: flow.orchestrators.test({ deterministic: true }),
      }),
    );

    const actor = runtime.createActor(streamMachine);

    actor.send({ type: "START" });
    await actor.flush();

    expect(actor.snapshot().value).toBe("defected");
    expect(actor.snapshot().context.defected).toBe(true);
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

    const app = flow.app({
      modules: [RuntimeModule],
    });

    const runtime = flow.runtime(
      app.layer({
        store: flow.store.test({ namespace: "runtime-stream-dispose" }),
        orchestrators: flow.orchestrators.test({ deterministic: true }),
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
    expect(actor.snapshot().streams["Runtime.tokenStream"]).toMatchObject({
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

    expect(actor.snapshot().context.partial).toBe("Ready");
    expect(actor.receipts()).toHaveLength(receiptsAfterDispose);
  });
});
