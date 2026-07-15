// @vitest-environment happy-dom

import { Effect, Stream } from "effect";
import { act, createElement } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "../index.js";
import type { FlowActor, FlowActorLease, FlowRuntime } from "../core/api/types.js";
import { createTestRuntimeWithInstallers } from "../testing/fixtures/runtime-test-fixtures.js";
import { FlowProvider } from "./provider.js";
import { useActor } from "./use-actor.js";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

function createTestRuntime() {
  return createTestRuntimeWithInstallers();
}

function createContainer(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

describe("useActor", () => {
  it("creates the actor after the first render and rerenders on actor snapshot updates", async () => {
    let contextInitializations = 0;
    const machine = flow.machine<
      { readonly count: number },
      { readonly type: "INCREMENT" },
      "ready"
    >({
      id: "react.use.actor",
      initial: "ready",
      context: () => {
        contextInitializations += 1;
        return { count: 0 };
      },
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
    const runtime = createTestRuntime();
    let createActorCalls = 0;
    let attachCalls = 0;
    const attachments: Array<Promise<unknown>> = [];
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
      orchestrators: {
        ...runtime.orchestrators,
        attach: ((definition, options, ...prepared: ReadonlyArray<unknown>) => {
          attachCalls += 1;
          const attachment = Reflect.apply(runtime.orchestrators.attach, undefined, [
            definition,
            options,
            ...prepared,
          ]) as Promise<unknown>;
          attachments.push(attachment);
          return attachment;
        }) as FlowRuntime["orchestrators"]["attach"],
      },
    } satisfies FlowRuntime;
    const container = createContainer();
    const root = createRoot(container);

    const Reader = (): ReactElement => {
      renderCreateActorCalls.push(createActorCalls);
      const actor = useActor(machine);
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
      await act(async () => {
        await Promise.all(attachments);
        await Promise.resolve();
      });

      expect(renderCreateActorCalls[0]).toBe(0);
      expect(createActorCalls).toBe(0);
      expect(attachCalls).toBe(1);
      expect(contextInitializations).toBe(1);
      expect(container.textContent).toBe("0");
      expect(observedActor).not.toBeNull();
      if (observedActor === null) {
        throw new Error("expected useActor to expose the live actor after mount");
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

  it("shares one runtime-owned actor across roots until the final hook lease releases", async () => {
    const machine = flow.machine<
      { readonly count: number },
      { readonly type: "INCREMENT" },
      "ready"
    >({
      id: "react.use.actor.shared",
      initial: "ready",
      context: () => ({ count: 0 }),
      states: {
        ready: {
          on: {
            INCREMENT: {
              update: ({ context }) => ({ count: context.count + 1 }),
            },
          },
        },
      },
    });
    const runtime = createTestRuntime();
    const attachments: Array<Promise<unknown>> = [];
    const releases: Array<Promise<void>> = [];
    const instrumentedRuntime = {
      ...runtime,
      orchestrators: {
        ...runtime.orchestrators,
        attach: ((definition, options, ...prepared: ReadonlyArray<unknown>) => {
          const attachment = (
            Reflect.apply(runtime.orchestrators.attach, undefined, [
              definition,
              options,
              ...prepared,
            ]) as ReturnType<FlowRuntime["orchestrators"]["attach"]>
          ).then((lease: FlowActorLease) => ({
            actor: lease.actor,
            release: () => {
              const released = lease.release();
              releases.push(released);
              return released;
            },
          }));
          attachments.push(attachment);
          return attachment;
        }) as FlowRuntime["orchestrators"]["attach"],
      },
    } satisfies FlowRuntime;
    const firstContainer = createContainer();
    const secondContainer = createContainer();
    const firstRoot = createRoot(firstContainer);
    const secondRoot = createRoot(secondContainer);
    const Reader = ({ label }: Readonly<{ readonly label: string }>): ReactElement => {
      const actor = useActor(machine, { id: "react-shared-actor" });
      return createElement("span", null, `${label}:${actor.getSnapshot().context.count}`);
    };

    try {
      await act(async () => {
        firstRoot.render(
          createElement(FlowProvider, {
            runtime: instrumentedRuntime,
            children: createElement(Reader, { label: "first" }),
          }),
        );
        secondRoot.render(
          createElement(FlowProvider, {
            runtime: instrumentedRuntime,
            children: createElement(Reader, { label: "second" }),
          }),
        );
      });
      await act(async () => {
        await Promise.all(attachments);
        await Promise.resolve();
      });

      const actor = runtime.orchestrators.get("react-shared-actor");
      expect(actor).not.toBeNull();
      expect(actor?.receipts().filter((receipt) => receipt.type === "actor:start")).toHaveLength(1);

      await act(async () => {
        secondRoot.unmount();
      });
      await act(async () => {
        await Promise.all(releases);
      });

      expect(runtime.orchestrators.get("react-shared-actor")).toBe(actor);

      await act(async () => {
        firstRoot.unmount();
      });
      await act(async () => {
        await Promise.all(releases);
      });

      expect(runtime.orchestrators.get("react-shared-actor")).toBeNull();
    } finally {
      document.body.innerHTML = "";
      await runtime.dispose();
    }
  });

  it("restores a provided actor snapshot without replaying machine entry work", async () => {
    let entryCalls = 0;

    const machine = flow.machine<
      { readonly count: number },
      { readonly type: "START" },
      "idle" | "running"
    >({
      id: "react.use.actor.restore",
      initial: "idle",
      context: () => ({ count: 0 }),
      states: {
        idle: {
          on: {
            START: {
              target: "running",
              update: () => ({
                count: 1,
              }),
            },
          },
        },
        running: {
          entry: () => {
            entryCalls += 1;
          },
        },
      },
    });

    const bootstrapRuntime = createTestRuntime();
    const bootActor = bootstrapRuntime.createActor(machine, {
      id: "react.use.actor.restore",
    });
    bootActor.send({ type: "START" });
    await bootActor.flush();
    const restoredSnapshot = bootActor.serialize();

    expect(entryCalls).toBe(1);

    await bootstrapRuntime.dispose();

    const runtime = createTestRuntime();
    let createActorCalls = 0;
    let attachCalls = 0;
    const attachments: Array<Promise<unknown>> = [];
    const renderCreateActorCalls: number[] = [];
    const renderCounts: number[] = [];
    const instrumentedRuntime = {
      ...runtime,
      createActor: (definition, options) => {
        createActorCalls += 1;
        return runtime.createActor(definition, options);
      },
      orchestrators: {
        ...runtime.orchestrators,
        attach: ((definition, options, ...prepared: ReadonlyArray<unknown>) => {
          attachCalls += 1;
          const attachment = Reflect.apply(runtime.orchestrators.attach, undefined, [
            definition,
            options,
            ...prepared,
          ]) as Promise<unknown>;
          attachments.push(attachment);
          return attachment;
        }) as FlowRuntime["orchestrators"]["attach"],
      },
    } satisfies FlowRuntime;
    const container = createContainer();
    const root = createRoot(container);

    const Reader = (): ReactElement => {
      renderCreateActorCalls.push(createActorCalls);
      const actor = useActor(machine, {
        id: "react.use.actor.restore",
        snapshot: restoredSnapshot,
      });
      renderCounts.push(actor.getSnapshot().context.count);
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
        await Promise.all(attachments);
        await Promise.resolve();
      });

      expect(renderCreateActorCalls[0]).toBe(0);
      expect(renderCounts[0]).toBe(1);
      expect(createActorCalls).toBe(0);
      expect(attachCalls).toBe(1);
      expect(entryCalls).toBe(1);
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
    const runtime = createTestRuntime();
    let leaseReleaseCalls = 0;
    let runtimeDisposeCalls = 0;
    const attachments: Array<Promise<unknown>> = [];
    const instrumentedRuntime = {
      ...runtime,
      orchestrators: {
        ...runtime.orchestrators,
        attach: ((definition, options, ...prepared: ReadonlyArray<unknown>) => {
          const attachment = (async () => {
            const lease = (await Reflect.apply(runtime.orchestrators.attach, undefined, [
              definition,
              options,
              ...prepared,
            ])) as Awaited<ReturnType<FlowRuntime["orchestrators"]["attach"]>>;
            return {
              actor: lease.actor,
              release: async () => {
                leaseReleaseCalls += 1;
                return lease.release();
              },
            };
          })();
          attachments.push(attachment);
          return attachment;
        }) as FlowRuntime["orchestrators"]["attach"],
      },
      dispose: async () => {
        runtimeDisposeCalls += 1;
        return runtime.dispose();
      },
    } satisfies FlowRuntime;
    const container = createContainer();
    const root = createRoot(container);

    const Reader = (): ReactElement => {
      const actor = useActor(machine);
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
        await Promise.all(attachments);
        await Promise.resolve();
      });

      await act(async () => {
        root.unmount();
      });

      expect(leaseReleaseCalls).toBe(1);
      expect(runtimeDisposeCalls).toBe(0);
    } finally {
      document.body.innerHTML = "";
      await runtime.dispose();
    }
  });

  it("serializes an incompatible same-id hook replacement after the prior lease detaches", async () => {
    const firstMachine = flow.machine<{ readonly label: "first" }, never, "ready">({
      id: "react.use.actor.hmr",
      initial: "ready",
      context: () => ({ label: "first" }),
      states: { ready: {} },
    });
    const secondMachine = flow.machine<{ readonly label: "second" }, never, "ready">({
      id: "react.use.actor.hmr",
      initial: "ready",
      context: () => ({ label: "second" }),
      states: { ready: {} },
    });
    const runtime = createTestRuntime();
    const attachments: Array<Promise<unknown>> = [];
    const releases: Array<Promise<void>> = [];
    const instrumentedRuntime = {
      ...runtime,
      orchestrators: {
        ...runtime.orchestrators,
        attach: ((definition, options, ...prepared: ReadonlyArray<unknown>) => {
          const attachment = (
            Reflect.apply(runtime.orchestrators.attach, undefined, [
              definition,
              options,
              ...prepared,
            ]) as ReturnType<FlowRuntime["orchestrators"]["attach"]>
          ).then((lease: FlowActorLease) => ({
            actor: lease.actor,
            release: () => {
              const released = lease.release();
              releases.push(released);
              return released;
            },
          }));
          attachments.push(attachment);
          return attachment;
        }) as FlowRuntime["orchestrators"]["attach"],
      },
    } satisfies FlowRuntime;
    const container = createContainer();
    const root = createRoot(container);
    const Reader = ({
      machine,
    }: Readonly<{ readonly machine: typeof firstMachine | typeof secondMachine }>) => {
      const actor = useActor(machine, { id: "react-hmr-actor" });
      return createElement("span", null, actor.getSnapshot().context.label);
    };

    try {
      await act(async () => {
        root.render(
          createElement(FlowProvider, {
            runtime: instrumentedRuntime,
            children: createElement(Reader, { machine: firstMachine }),
          }),
        );
      });
      await act(async () => {
        await Promise.all(attachments);
        await Promise.resolve();
      });
      const firstActor = runtime.orchestrators.get("react-hmr-actor");
      expect(container.textContent).toBe("first");

      await act(async () => {
        root.render(
          createElement(FlowProvider, {
            runtime: instrumentedRuntime,
            children: createElement(Reader, { machine: secondMachine }),
          }),
        );
      });
      await act(async () => {
        await Promise.all(attachments);
        await Promise.all(releases);
        await Promise.resolve();
      });

      const secondActor = runtime.orchestrators.get("react-hmr-actor");
      expect(secondActor).not.toBe(firstActor);
      expect(secondActor?.machine).toBe(secondMachine);
      expect(container.textContent).toBe("second");
      expect(
        firstActor?.receipts().filter((receipt) => receipt.type === "actor:dispose"),
      ).toHaveLength(1);
    } finally {
      await act(async () => {
        root.unmount();
      });
      await Promise.all(releases);
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
      never
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
    const runtime = createTestRuntime();
    const attachments: Array<Promise<unknown>> = [];
    const instrumentedRuntime = {
      ...runtime,
      orchestrators: {
        ...runtime.orchestrators,
        attach: ((definition, options, ...prepared: ReadonlyArray<unknown>) => {
          const attachment = Reflect.apply(runtime.orchestrators.attach, undefined, [
            definition,
            options,
            ...prepared,
          ]) as Promise<unknown>;
          attachments.push(attachment);
          return attachment;
        }) as FlowRuntime["orchestrators"]["attach"],
      },
    } satisfies FlowRuntime;
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
      const actor = useActor(machine);
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
        root.render(
          createElement(FlowProvider, {
            runtime: instrumentedRuntime,
            children: createElement(Reader),
          }),
        );
      });
      await act(async () => {
        await Promise.all(attachments);
        await Promise.resolve();
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
