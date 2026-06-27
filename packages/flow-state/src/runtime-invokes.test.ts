import { Effect, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { createKey, flow, flowTest } from "./index";
import type { FlowEvent } from "./index";

describe("runtime invokes", () => {
  it("executes resource refs passed through ensure", async () => {
    type Event = { readonly type: "READY" } & FlowEvent;
    const project = flow.resource<[string], { readonly name: string }>({
      id: "project.byId",
      key: (id) => createKey("project", id),
      lookup: (id) => Effect.succeed({ name: `Project ${id}` }),
    });
    const machine = flow.machine<{}, Event, "loading">({
      id: "ensure-runtime",
      initial: "loading",
      context: () => ({}),
      states: {
        loading: {
          invoke: flow.ensure(project.ref("a")),
        },
      },
    });

    const harness = flowTest(machine);
    await harness.flush();

    expect(harness.cache().get(createKey("project", "a"))).toMatchObject({
      status: "success",
      value: { name: "Project a" },
    });
    expect(harness.snapshot().receipts).toContainEqual(
      expect.objectContaining({ type: "query:success", id: "project.byId" }),
    );
  });

  it("executes stream invokes and routes values and completion", async () => {
    type Event =
      | ({ readonly type: "START" } & FlowEvent)
      | ({ readonly type: "TICK"; readonly value: number } & FlowEvent)
      | ({ readonly type: "DONE" } & FlowEvent);
    const stream = flow.stream<Context, Event, void, number, never, never>({
      id: "counter.stream",
      stream: () => Stream.make(1, 2),
      routes: {
        value: (value) => ({ type: "TICK", value }),
        done: () => ({ type: "DONE" }),
      },
    });
    interface Context {
      readonly values: readonly number[];
    }
    const machine = flow.machine<Context, Event, "idle" | "running" | "done">({
      id: "stream-runtime",
      initial: "idle",
      context: () => ({ values: [] }),
      states: {
        idle: {
          on: { START: "running" },
        },
        running: {
          invoke: stream,
          on: {
            TICK: {
              update: ({ context, event }) =>
                event.type === "TICK" ? { values: [...context.values, event.value] } : {},
            },
            DONE: "done",
          },
        },
        done: {},
      },
    });

    const harness = flowTest(machine).send({ type: "START" });
    await harness.flush();

    expect(harness.state()).toBe("done");
    expect(harness.context()).toEqual({ values: [1, 2] });
    expect(harness.streams().completed("counter.stream")).toMatchObject({
      status: "done",
      emitted: 2,
    });
  });

  it("fires after timers as state-owned transitions", async () => {
    type Event = ({ readonly type: "START" } | { readonly type: "timer.dismiss" }) & FlowEvent;
    interface Context {
      readonly dismissed: boolean;
    }
    const machine = flow.machine<Context, Event, "idle" | "complete">({
      id: "after-runtime",
      initial: "idle",
      context: () => ({ dismissed: false }),
      states: {
        idle: {
          on: { START: "complete" },
        },
        complete: {
          after: flow.after({
            id: "dismiss",
            delay: 0,
            target: "idle",
            update: () => ({ dismissed: true }),
            routes: { fired: () => ({ type: "timer.dismiss" }) },
          }),
        },
      },
    });

    const harness = flowTest(machine).send({ type: "START" });
    await harness.flush();

    expect(harness.state()).toBe("idle");
    expect(harness.context()).toEqual({ dismissed: true });
    expect(harness.timers().fired("dismiss")).toMatchObject({ status: "fired" });
  });
});
