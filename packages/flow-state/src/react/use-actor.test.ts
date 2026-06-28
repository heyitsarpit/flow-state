// @vitest-environment happy-dom

import { Effect, Stream } from "effect";
import { act, createElement } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import { flow } from "../public/flow.js";
import type { FlowActor, FlowRuntime } from "../public/types.js";
import { FlowProvider } from "./provider.js";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

function createTestRuntime(namespace: string) {
  return flow.runtime(
    flow.app({ modules: [] }).layer({
      store: flow.store.test({ namespace }),
      orchestrators: flow.orchestrators.test({ deterministic: true }),
    }),
  );
}

function createContainer(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

describe("flow.use", () => {
  it("creates the actor after the first render and rerenders on actor snapshot updates", async () => {
    const machine = flow.machine<
      { readonly count: number },
      { readonly type: "INCREMENT" },
      "ready"
    >({
      id: "react.use.actor",
      initial: "ready",
      context: () => ({ count: 0 }),
      states: {
        ready: {
          on: {
            INCREMENT: {
              update: ({ context }) => ({
                count: context.count + 1,
              }),
            },
          },
        },
      },
    });
    const runtime = createTestRuntime("react-use-actor");
    let createActorCalls = 0;
    let observedActor: FlowActor<
      { readonly count: number },
      { readonly type: "INCREMENT" },
      "ready"
    > | null = null;
    const renderCreateActorCalls: number[] = [];
    const instrumentedRuntime = {
      ...runtime,
      createActor: (definition) => {
        createActorCalls += 1;
        return runtime.createActor(definition);
      },
    } satisfies FlowRuntime;
    const container = createContainer();
    const root = createRoot(container);

    const Reader = (): ReactElement => {
      renderCreateActorCalls.push(createActorCalls);
      const actor = flow.use(machine);
      observedActor = actor;
      return createElement("span", null, String(actor.getSnapshot().context.count));
    };

    try {
      await act(async () => {
        root.render(
          createElement(FlowProvider, {
            runtime: instrumentedRuntime,
            children: createElement(Reader),
          }),
        );
      });

      expect(renderCreateActorCalls[0]).toBe(0);
      expect(createActorCalls).toBe(1);
      expect(container.textContent).toBe("0");
      expect(observedActor).not.toBeNull();
      if (observedActor === null) {
        throw new Error("expected flow.use to expose the live actor after mount");
      }
      const actor = observedActor as FlowActor<
        { readonly count: number },
        { readonly type: "INCREMENT" },
        "ready"
      >;
      expect(actor.id).not.toContain(":shell");

      await act(async () => {
        actor.send({ type: "INCREMENT" });
        await actor.flush();
      });

      expect(container.textContent).toBe("1");
    } finally {
      await act(async () => {
        root.unmount();
      });
      document.body.innerHTML = "";
      await runtime.dispose();
    }
  });

  it("disposes the hook-owned actor on unmount without disposing the runtime", async () => {
    const machine = flow.machine<
      { readonly count: number },
      { readonly type: "INCREMENT" },
      "ready"
    >({
      id: "react.use.actor.cleanup",
      initial: "ready",
      context: () => ({ count: 0 }),
      states: {
        ready: {},
      },
    });
    const runtime = createTestRuntime("react-use-actor-cleanup");
    let actorDisposeCalls = 0;
    let runtimeDisposeCalls = 0;
    const instrumentedRuntime = {
      ...runtime,
      createActor: (definition) => {
        const actor = runtime.createActor(definition);
        return {
          ...actor,
          dispose: async () => {
            actorDisposeCalls += 1;
            return actor.dispose();
          },
        };
      },
      dispose: async () => {
        runtimeDisposeCalls += 1;
        return runtime.dispose();
      },
    } satisfies FlowRuntime;
    const container = createContainer();
    const root = createRoot(container);

    const Reader = (): ReactElement => {
      const actor = flow.use(machine);
      return createElement("span", null, String(actor.getSnapshot().context.count));
    };

    try {
      await act(async () => {
        root.render(
          createElement(FlowProvider, {
            runtime: instrumentedRuntime,
            children: createElement(Reader),
          }),
        );
      });

      await act(async () => {
        root.unmount();
      });

      expect(actorDisposeCalls).toBe(1);
      expect(runtimeDisposeCalls).toBe(0);
    } finally {
      document.body.innerHTML = "";
      await runtime.dispose();
    }
  });

  it("does not start transactions, streams, or timers during hook render", async () => {
    let transactionStarts = 0;
    let streamStarts = 0;
    const hangingTransaction = flow.transaction<
      Readonly<{ readonly run: true }>,
      never,
      never,
      never,
      { readonly type: "HANGING_TRANSACTION_IGNORED" }
    >({
      id: "react.use.actor.hanging-transaction",
      params: () => ({ run: true }),
      commit: () =>
        Effect.flatMap(
          Effect.sync(() => {
            transactionStarts += 1;
          }),
          () => Effect.never,
        ),
    });
    const hangingStream = flow.stream<{}, never, void, never>({
      id: "react.use.actor.hanging-stream",
      subscribe: () =>
        Stream.unwrap(
          Effect.sync(() => {
            streamStarts += 1;
            return Stream.never;
          }),
        ),
    });
    const machine = flow.machine<{}, never, "running" | "done">({
      id: "react.use.actor.defer-owned-work",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          invoke: [flow.run(hangingTransaction), hangingStream],
          after: flow.after({
            id: "react.use.actor.defer-owned-work.timer",
            delay: "1 second",
            target: "done",
          }),
        },
        done: {},
      },
    });
    const runtime = createTestRuntime("react-use-actor-owned-work");
    const container = createContainer();
    const root = createRoot(container);
    const renderObservations: Array<
      Readonly<{
        readonly transactionStarts: number;
        readonly streamStarts: number;
        readonly transactionCount: number;
        readonly streamCount: number;
        readonly timerCount: number;
      }>
    > = [];

    const Reader = (): ReactElement => {
      const actor = flow.use(machine);
      const snapshot = actor.getSnapshot();
      renderObservations.push({
        transactionStarts,
        streamStarts,
        transactionCount: Object.keys(snapshot.transactions).length,
        streamCount: Object.keys(snapshot.streams).length,
        timerCount: Object.keys(snapshot.timers).length,
      });
      return createElement("span", null, `${snapshot.value}`);
    };

    try {
      await act(async () => {
        root.render(createElement(FlowProvider, { runtime, children: createElement(Reader) }));
      });

      expect(renderObservations[0]).toEqual({
        transactionStarts: 0,
        streamStarts: 0,
        transactionCount: 0,
        streamCount: 0,
        timerCount: 0,
      });
      expect(transactionStarts).toBe(1);
      expect(streamStarts).toBe(1);
      expect(
        renderObservations.some(
          (observation) =>
            observation.transactionCount === 1 &&
            observation.streamCount === 1 &&
            observation.timerCount === 1,
        ),
      ).toBe(true);
    } finally {
      await act(async () => {
        root.unmount();
      });
      document.body.innerHTML = "";
      await runtime.dispose();
    }
  });
});
