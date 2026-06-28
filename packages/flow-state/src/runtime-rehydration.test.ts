import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { createControlledStream, createRuntime, flow } from "./index.js";

describe("runtime snapshot restoration", () => {
  it("restores a snapshot without replaying start receipts or restarting state-owned work", () => {
    let commits = 0;
    let childEntries = 0;
    let subscriptions = 0;

    const childMachine = flow.machine<{}, never, "idle">({
      id: "rehydration.child.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          entry: () => {
            childEntries += 1;
          },
        },
      },
    });

    const child = flow.child({
      id: "rehydration.child",
      machine: childMachine,
    });

    const tokens = createControlledStream<string>("rehydration.stream");
    const tokenStream = flow.stream<
      {},
      { readonly type: "TOKEN"; readonly value: string },
      void,
      string
    >({
      id: "rehydration.stream",
      subscribe: () => {
        subscriptions += 1;
        return tokens.stream();
      },
      routes: {
        value: (value) => ({ type: "TOKEN", value }),
      },
    });

    const saveTransaction = flow.transaction({
      id: "rehydration.save",
      params: () => ({ id: "restore-1" }),
      commit: () =>
        Effect.sync(() => {
          commits += 1;
          return { ok: true } as const;
        }),
    });

    const machine = flow.machine<
      { readonly token: string },
      { readonly type: "FINISH" } | { readonly type: "TOKEN"; readonly value: string },
      "idle" | "busy" | "done"
    >({
      id: "rehydration.machine",
      initial: "idle",
      context: () => ({ token: "" }),
      states: {
        idle: {},
        busy: {
          invoke: [flow.run(saveTransaction), tokenStream, child],
          after: flow.after({
            id: "rehydration.timer",
            delay: "1 second",
            target: "done",
          }),
          on: {
            FINISH: { target: "done" },
            TOKEN: {
              update: ({ event }) => (event.type === "TOKEN" ? { token: event.value } : {}),
            },
          },
        },
        done: {},
      },
    });

    const restoredSnapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "busy" as const,
      context: { token: "seeded" },
      transactions: {
        "rehydration.save": {
          id: "rehydration.save",
          status: "pending" as const,
        },
      },
      streams: {
        "rehydration.stream": {
          id: "rehydration.stream",
          status: "running" as const,
          generation: 3,
          emitted: 1,
          value: "seeded",
        },
      },
      timers: {
        "rehydration.timer": {
          id: "rehydration.timer",
          status: "scheduled" as const,
          generation: 2,
          parentState: "busy",
          startedAt: 100,
          dueAt: 1_100,
        },
      },
      children: {
        "rehydration.child": {
          id: "rehydration.child",
          actorId: "rehydration.child.actor",
          status: "active" as const,
          state: "idle",
          parentState: "busy",
        },
      },
      receipts: [
        { type: "actor:start", id: "rehydration.actor" },
        { type: "transaction:start", id: "rehydration.save", parentState: "busy" },
        { type: "stream:start", id: "rehydration.stream", generation: 3, parentState: "busy" },
        {
          type: "timer:start",
          id: "rehydration.timer",
          generation: 2,
          parentState: "busy",
          dueAt: 1_100,
        },
        {
          type: "child:start",
          id: "rehydration.child",
          actorId: "rehydration.child.actor",
          parentState: "busy",
        },
      ],
    });

    const actor = createRuntime().createActor(machine, {
      id: "rehydration.actor",
      snapshot: restoredSnapshot,
    });

    expect(actor.snapshot()).toEqual(restoredSnapshot);
    expect(actor.receipts()).toEqual(restoredSnapshot.receipts);
    expect(actor.children()).toEqual(restoredSnapshot.children);
    expect(flow.can(actor.snapshot(), { type: "FINISH" })).toBe(true);
    expect(commits).toBe(0);
    expect(childEntries).toBe(0);
    expect(subscriptions).toBe(0);

    actor.send({ type: "FINISH" });

    expect(actor.snapshot().value).toBe("done");
    expect(actor.snapshot().transactions["rehydration.save"]).toMatchObject({
      id: "rehydration.save",
      status: "interrupt",
    });
    expect(actor.snapshot().streams["rehydration.stream"]).toMatchObject({
      id: "rehydration.stream",
      status: "interrupt",
      value: "seeded",
    });
    expect(actor.snapshot().timers["rehydration.timer"]).toMatchObject({
      id: "rehydration.timer",
      status: "interrupt",
      parentState: "busy",
    });
    expect(actor.snapshot().children).toEqual({});
    expect(
      actor.receipts().filter((receipt) => receipt.type === "transaction:interrupt"),
    ).toHaveLength(1);
    expect(actor.receipts().filter((receipt) => receipt.type === "stream:interrupt")).toHaveLength(
      1,
    );
    expect(actor.receipts().filter((receipt) => receipt.type === "timer:interrupt")).toHaveLength(
      1,
    );
    expect(actor.receipts().filter((receipt) => receipt.type === "child:stop")).toHaveLength(1);
  });

  it("restores active child trees into the runtime registry without replaying child entry work", async () => {
    let childEntries = 0;
    let grandchildEntries = 0;

    const grandchildMachine = flow.machine<{}, never, "running">({
      id: "rehydration.grandchild.machine",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          entry: () => {
            grandchildEntries += 1;
          },
        },
      },
    });

    const childMachine = flow.machine<{}, never, "running">({
      id: "rehydration.child.machine.nested",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          entry: () => {
            childEntries += 1;
          },
          invoke: flow.child({
            id: "rehydration.grandchild",
            machine: grandchildMachine,
          }),
        },
      },
    });

    const machine = flow.machine<
      {},
      { readonly type: "START" } | { readonly type: "STOP" },
      "idle" | "running" | "done"
    >({
      id: "rehydration.parent.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            START: "running",
          },
        },
        running: {
          invoke: flow.child({
            id: "rehydration.child",
            machine: childMachine,
          }),
          on: {
            STOP: "done",
          },
        },
        done: {},
      },
    });

    const runtime = createRuntime();
    const actor = runtime.createActor(machine, {
      id: "rehydration.parent.actor",
    });
    actor.send({ type: "START" });

    const persistedSnapshot = actor.snapshot();
    const childEntryCount = childEntries;
    const grandchildEntryCount = grandchildEntries;

    expect(persistedSnapshot.children["rehydration.child"]).toMatchObject({
      id: "rehydration.child",
      actorId: "rehydration.parent.actor/rehydration.child",
      status: "active",
      state: "running",
      parentState: "running",
    });

    await runtime.dispose();

    const restoredRuntime = createRuntime();
    const restoredActor = restoredRuntime.createActor(machine, {
      id: "rehydration.parent.actor",
      snapshot: persistedSnapshot,
    });

    expect(flow.can(restoredActor.snapshot(), { type: "STOP" })).toBe(true);
    expect(
      restoredRuntime.orchestrators.get("rehydration.parent.actor/rehydration.child")?.snapshot()
        .value,
    ).toBe("running");
    expect(
      restoredRuntime.orchestrators
        .get("rehydration.parent.actor/rehydration.child/rehydration.grandchild")
        ?.snapshot().value,
    ).toBe("running");
    expect(childEntries).toBe(childEntryCount);
    expect(grandchildEntries).toBe(grandchildEntryCount);

    restoredActor.send({ type: "STOP" });

    expect(restoredRuntime.orchestrators.get("rehydration.parent.actor/rehydration.child")).toBe(
      null,
    );
    expect(
      restoredRuntime.orchestrators.get(
        "rehydration.parent.actor/rehydration.child/rehydration.grandchild",
      ),
    ).toBe(null);

    await restoredRuntime.dispose();
  });

  it("lets a restored active child continue to final state and removes it from the parent snapshot", async () => {
    let childEntries = 0;

    const childMachine = flow.machine<{}, { readonly type: "COMPLETE" }, "running" | "done">({
      id: "rehydration.final.child.machine",
      initial: "running",
      context: () => ({}),
      states: {
        running: {
          entry: () => {
            childEntries += 1;
          },
          on: {
            COMPLETE: "done",
          },
        },
        done: {
          type: "final",
        },
      },
    });

    const machine = flow.machine<{}, { readonly type: "START" }, "idle" | "running">({
      id: "rehydration.final.parent.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            START: "running",
          },
        },
        running: {
          invoke: flow.child({
            id: "rehydration.final.child",
            machine: childMachine,
          }),
        },
      },
    });

    const runtime = createRuntime();
    const actor = runtime.createActor(machine, {
      id: "rehydration.final.parent.actor",
    });
    actor.send({ type: "START" });

    const persistedSnapshot = actor.snapshot();
    const entryCountBeforeRestore = childEntries;

    await runtime.dispose();

    const restoredRuntime = createRuntime();
    const restoredActor = restoredRuntime.createActor(machine, {
      id: "rehydration.final.parent.actor",
      snapshot: persistedSnapshot,
    });

    const restoredChild = restoredRuntime.orchestrators.get(
      "rehydration.final.parent.actor/rehydration.final.child",
    );
    expect(restoredChild).not.toBe(null);
    expect(childEntries).toBe(entryCountBeforeRestore);

    restoredChild?.send({ type: "COMPLETE" });
    await restoredChild?.flush();
    await restoredActor.flush();

    expect(
      restoredRuntime.orchestrators.get("rehydration.final.parent.actor/rehydration.final.child"),
    ).toBe(null);
    expect(restoredActor.snapshot().children["rehydration.final.child"]).toBeUndefined();
    expect(
      restoredActor.receipts().filter((receipt) => receipt.type === "child:success"),
    ).toHaveLength(1);

    await restoredRuntime.dispose();
  });
});
