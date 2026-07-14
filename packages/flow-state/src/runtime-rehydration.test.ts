import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import { captureTrace } from "./inspect.js";
import * as flow from "./index.js";
import { createRuntime } from "./runtime/contract-runtime.js";
import { createControlledStream } from "./testing.js";
import { createFocusedRuntimeWithTestClock } from "./testing/fixtures/focused-test-runtime.js";

describe("runtime snapshot restoration", () => {
  it("serializes a running actor to a JSON-safe tree and restores it without replaying child entry work", async () => {
    let childEntries = 0;

    const childMachine = flow.machine<{}, never, "idle">({
      id: "rehydration.serializable.child.machine",
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

    const machine = flow.machine<
      {},
      { readonly type: "START" } | { readonly type: "STOP" },
      "idle" | "running"
    >({
      id: "rehydration.serializable.machine",
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
            id: "rehydration.serializable.child",
            machine: childMachine,
          }),
          on: {
            STOP: "idle",
          },
        },
      },
    });

    const runtime = createRuntime();
    const actor = runtime.createActor(machine, {
      id: "rehydration.serializable.actor",
    });

    actor.send({ type: "START" });
    await actor.flush();

    expect(actor.children()["rehydration.serializable.child"]).toMatchObject({
      status: "active",
      actorId: "rehydration.serializable.actor/rehydration.serializable.child",
    });
    const entryCountBeforeRestore = childEntries;
    const persisted = actor.serialize();
    expect(JSON.parse(JSON.stringify(persisted))).toEqual(persisted);
    expect(persisted.children["rehydration.serializable.child"]).toMatchObject({
      id: "rehydration.serializable.child",
      actorId: "rehydration.serializable.actor/rehydration.serializable.child",
      status: "active",
    });

    await runtime.dispose();

    const restoredRuntime = createRuntime();
    const restored = restoredRuntime.createActor(machine, {
      id: "rehydration.serializable.actor",
      snapshot: persisted,
    });

    expect(childEntries).toBe(entryCountBeforeRestore);
    expect(restored.snapshot().value).toBe("running");
    expect(restored.children()["rehydration.serializable.child"]).toMatchObject({
      status: "active",
      actorId: "rehydration.serializable.actor/rehydration.serializable.child",
    });
    expect(
      restoredRuntime.orchestrators
        .get("rehydration.serializable.actor/rehydration.serializable.child")
        ?.snapshot().value,
    ).toBe("idle");

    restored.send({ type: "STOP" });
    await restored.flush();

    expect(restored.snapshot().value).toBe("idle");
    expect(restored.children()).toEqual({});

    await restoredRuntime.dispose();
  });

  it("restores a snapshot without replaying start receipts while resumed delayed work continues on the virtual clock", async () => {
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
      resources: {
        "rehydration.project": {
          id: "rehydration.project",
          status: "success" as const,
          availability: "value" as const,
          activity: "idle" as const,
          freshness: "fresh" as const,
          updatedAt: 250,
          isPlaceholderData: false,
          value: { id: "project-1", name: "Seeded" },
        },
      },
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
          startedAt: 0,
          dueAt: 1_000,
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
          dueAt: 1_000,
        },
        {
          type: "child:start",
          id: "rehydration.child",
          actorId: "rehydration.child.actor",
          parentState: "busy",
        },
      ],
    });

    const runtime = createFocusedRuntimeWithTestClock(machine, "RehydrationRuntime");
    const actor = runtime.createActor(machine, {
      id: "rehydration.actor",
      snapshot: restoredSnapshot,
    });

    const restoreReceipt = actor.receipts().find((receipt) => receipt.type === "actor:restore");
    const restoreCorrelationId =
      typeof restoreReceipt?.correlationId === "string" ? restoreReceipt.correlationId : undefined;

    expect(actor.snapshot().value).toBe("busy");
    expect(actor.snapshot().context).toEqual({ token: "seeded" });
    expect(actor.snapshot().resources["rehydration.project"]).toMatchObject({
      id: "rehydration.project",
      status: "success",
      availability: "value",
      freshness: "fresh",
    });
    expect(actor.snapshot().transactions["rehydration.save"]).toMatchObject({
      id: "rehydration.save",
      status: "interrupt",
    });
    expect(actor.snapshot().streams["rehydration.stream"]).toMatchObject({
      id: "rehydration.stream",
      status: "running",
      generation: 3,
      emitted: 1,
      value: "seeded",
    });
    expect(actor.snapshot().timers["rehydration.timer"]).toMatchObject({
      id: "rehydration.timer",
      status: "scheduled",
      generation: 2,
      parentState: "busy",
      startedAt: 0,
      dueAt: 1_000,
    });
    expect(restoreCorrelationId).toEqual(expect.any(String));
    expect(actor.children()).toEqual(restoredSnapshot.children);
    expect(flow.can(actor.snapshot(), { type: "FINISH" })).toBe(true);
    expect(commits).toBe(0);
    expect(childEntries).toBe(0);
    expect(subscriptions).toBe(1);
    expect(actor.receipts().map((receipt) => receipt.type)).toEqual([
      "actor:start",
      "transaction:start",
      "stream:start",
      "timer:start",
      "child:start",
      "actor:restore",
      "resource:hydrate",
      "timer:resume",
      "stream:resume",
      "transaction:interrupt",
    ]);
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.correlationId === restoreCorrelationId)
        .map((receipt) => receipt.type),
    ).toEqual([
      "actor:restore",
      "resource:hydrate",
      "timer:resume",
      "stream:resume",
      "transaction:interrupt",
    ]);

    const trace = captureTrace(actor.snapshot());
    const restoreCorrelation = trace.report.correlations.find(
      (correlation) => correlation.correlationId === restoreCorrelationId,
    );
    const restoreInspection =
      restoreCorrelationId === undefined
        ? []
        : runtime.inspection
            .entries({ correlationId: restoreCorrelationId })
            .map((event) => event.type);

    expect(restoreCorrelation?.actors.map((receipt) => receipt.type)).toEqual(["actor:restore"]);
    expect(restoreCorrelation?.resources.map((receipt) => receipt.type)).toEqual([
      "resource:hydrate",
    ]);
    expect(restoreCorrelation?.transactions.map((receipt) => receipt.type)).toEqual([
      "transaction:interrupt",
    ]);
    expect(restoreCorrelation?.streams.map((receipt) => receipt.type)).toEqual(["stream:resume"]);
    expect(restoreCorrelation?.timers.map((receipt) => receipt.type)).toEqual(["timer:resume"]);
    expect(restoreCorrelation?.details.resources).toMatchObject([
      {
        id: "rehydration.project",
        receiptTypes: ["resource:hydrate"],
        statusAfter: "success",
        freshnessAfter: "fresh",
      },
    ]);
    expect(restoreCorrelation?.details.transactions).toMatchObject([
      {
        id: "rehydration.save",
        receiptTypes: ["transaction:interrupt"],
        statusAfter: "interrupt",
      },
    ]);
    expect(restoreCorrelation?.details.streams).toMatchObject([
      {
        id: "rehydration.stream",
        receiptTypes: ["stream:resume"],
        statusAfter: "running",
        generation: 3,
        emittedCount: 1,
        restored: true,
        lastValueAvailable: true,
      },
    ]);
    expect(restoreCorrelation?.details.timers).toMatchObject([
      {
        id: "rehydration.timer",
        receiptTypes: ["timer:resume"],
        statusAfter: "scheduled",
        generation: 2,
        startedAt: 0,
        dueAt: 1_000,
        scheduledMillis: 1_000,
        restored: true,
      },
    ]);
    expect(restoreInspection).toEqual([
      "actor:restore",
      "resource:hydrate",
      "timer:resume",
      "stream:resume",
      "transaction:interrupt",
      "actor:snapshot",
    ]);

    await runtime.runPromise(TestClock.adjust("999 millis"));
    await actor.flush();

    expect(actor.snapshot().value).toBe("busy");
    expect(actor.receipts().filter((receipt) => receipt.type === "timer:fire")).toHaveLength(0);

    await runtime.runPromise(TestClock.adjust("1 millis"));
    await actor.flush();

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
      status: "fired",
      generation: 2,
      parentState: "busy",
      startedAt: 0,
      dueAt: 1_000,
      endedAt: 1_000,
    });
    expect(actor.snapshot().children).toEqual({});
    expect(
      actor.receipts().filter((receipt) => receipt.type === "transaction:interrupt"),
    ).toHaveLength(1);
    expect(actor.receipts().filter((receipt) => receipt.type === "stream:interrupt")).toHaveLength(
      1,
    );
    expect(actor.receipts().filter((receipt) => receipt.type === "timer:start")).toHaveLength(1);
    expect(actor.receipts().filter((receipt) => receipt.type === "timer:fire")).toHaveLength(1);
    expect(actor.receipts().filter((receipt) => receipt.type === "timer:interrupt")).toHaveLength(
      0,
    );
    expect(actor.receipts().filter((receipt) => receipt.type === "child:stop")).toHaveLength(1);

    await runtime.dispose();
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
    await restoredActor.flush();

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

  it("rejects a restored pending transaction that does not belong to the destination state before registration or commit replay", async () => {
    let commits = 0;

    const saveTransaction = flow.transaction({
      id: "rehydration.invalid.pending.save",
      params: () => ({ id: "restore-1" }),
      commit: () =>
        Effect.sync(() => {
          commits += 1;
          return { ok: true } as const;
        }),
    });

    const machine = flow.machine<{}, never, "idle" | "busy">({
      id: "rehydration.invalid.pending.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
        busy: {
          invoke: flow.run(saveTransaction),
        },
      },
    });

    const restoredSnapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "idle" as const,
      transactions: {
        "rehydration.invalid.pending.save": {
          id: "rehydration.invalid.pending.save",
          status: "pending" as const,
        },
      },
    });

    const runtime = createRuntime();

    try {
      let restoreError: unknown;
      try {
        runtime.createActor(machine, {
          id: "rehydration.invalid.pending.actor",
          snapshot: restoredSnapshot,
        });
      } catch (error) {
        restoreError = error;
      }

      expect(restoreError).toMatchObject({
        code: "FLOW-TXN-005",
        debug: {
          machineId: "rehydration.invalid.pending.machine",
          transactionId: "rehydration.invalid.pending.save",
          parentState: "idle",
          status: "pending",
          reason: "pending-transaction-not-in-restored-state",
          allowedTransactionIds: [],
        },
      });
      expect(commits).toBe(0);
      expect(runtime.orchestrators.get("rehydration.invalid.pending.actor")).toBe(null);
    } finally {
      await runtime.dispose();
    }
  });

  it("rejects a restored queued transaction because restore cannot reconcile queue ownership metadata", async () => {
    let commits = 0;

    const saveTransaction = flow.transaction({
      id: "rehydration.invalid.queued.save",
      params: () => ({ id: "restore-1" }),
      commit: () =>
        Effect.sync(() => {
          commits += 1;
          return { ok: true } as const;
        }),
      concurrency: "serialize",
    });

    const machine = flow.machine<{}, never, "idle" | "busy">({
      id: "rehydration.invalid.queued.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
        busy: {
          invoke: flow.run(saveTransaction),
        },
      },
    });

    const restoredSnapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "busy" as const,
      transactions: {
        "rehydration.invalid.queued.save": {
          id: "rehydration.invalid.queued.save",
          status: "queued" as const,
        },
      },
    });

    const runtime = createRuntime();

    try {
      let restoreError: unknown;
      try {
        runtime.createActor(machine, {
          id: "rehydration.invalid.queued.actor",
          snapshot: restoredSnapshot,
        });
      } catch (error) {
        restoreError = error;
      }

      expect(restoreError).toMatchObject({
        code: "FLOW-TXN-005",
        debug: {
          machineId: "rehydration.invalid.queued.machine",
          transactionId: "rehydration.invalid.queued.save",
          parentState: "busy",
          status: "queued",
          reason: "queued-transaction-restore-not-supported",
          allowedTransactionIds: ["rehydration.invalid.queued.save"],
        },
      });
      expect(commits).toBe(0);
      expect(runtime.orchestrators.get("rehydration.invalid.queued.actor")).toBe(null);
    } finally {
      await runtime.dispose();
    }
  });

  it("rejects a restored terminal transaction whose id does not exist in the machine inventory", async () => {
    let commits = 0;

    const knownTransaction = flow.transaction({
      id: "rehydration.known.save",
      params: () => ({ id: "restore-1" }),
      commit: () =>
        Effect.sync(() => {
          commits += 1;
          return { ok: true } as const;
        }),
    });

    const machine = flow.machine<{}, never, "idle" | "busy">({
      id: "rehydration.invalid.terminal.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
        busy: {
          invoke: flow.run(knownTransaction),
        },
      },
    });

    const restoredSnapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "idle" as const,
      transactions: {
        "rehydration.unknown.save": {
          id: "rehydration.unknown.save",
          status: "success" as const,
          value: { ok: true } as const,
        },
      },
    });

    const runtime = createRuntime();

    try {
      let restoreError: unknown;
      try {
        runtime.createActor(machine, {
          id: "rehydration.invalid.terminal.actor",
          snapshot: restoredSnapshot,
        });
      } catch (error) {
        restoreError = error;
      }

      expect(restoreError).toMatchObject({
        code: "FLOW-TXN-005",
        debug: {
          machineId: "rehydration.invalid.terminal.machine",
          transactionId: "rehydration.unknown.save",
          parentState: "idle",
          status: "success",
          reason: "transaction-id-not-in-machine",
          allowedTransactionIds: ["rehydration.known.save"],
        },
      });
      expect(commits).toBe(0);
      expect(runtime.orchestrators.get("rehydration.invalid.terminal.actor")).toBe(null);
    } finally {
      await runtime.dispose();
    }
  });

  it("rejects a restored pending transaction that lacks its persisted transaction:start receipt", async () => {
    let commits = 0;

    const saveTransaction = flow.transaction({
      id: "rehydration.missing.start.save",
      params: () => ({ id: "restore-1" }),
      commit: () =>
        Effect.sync(() => {
          commits += 1;
          return { ok: true } as const;
        }),
    });

    const machine = flow.machine<{}, never, "idle" | "busy">({
      id: "rehydration.missing.start.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
        busy: {
          invoke: flow.run(saveTransaction),
        },
      },
    });

    const restoredSnapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "busy" as const,
      transactions: {
        "rehydration.missing.start.save": {
          id: "rehydration.missing.start.save",
          status: "pending" as const,
        },
      },
      receipts: [{ type: "actor:start", id: "rehydration.missing.start.actor" }],
    });

    const runtime = createRuntime();

    try {
      let restoreError: unknown;
      try {
        runtime.createActor(machine, {
          id: "rehydration.missing.start.actor",
          snapshot: restoredSnapshot,
        });
      } catch (error) {
        restoreError = error;
      }

      expect(restoreError).toMatchObject({
        code: "FLOW-TXN-005",
        debug: {
          machineId: "rehydration.missing.start.machine",
          transactionId: "rehydration.missing.start.save",
          parentState: "busy",
          status: "pending",
          reason: "pending-transaction-missing-start-receipt",
          allowedTransactionIds: ["rehydration.missing.start.save"],
        },
      });
      expect(commits).toBe(0);
      expect(runtime.orchestrators.get("rehydration.missing.start.actor")).toBe(null);
    } finally {
      await runtime.dispose();
    }
  });

  it("keeps timer generations monotonic when delayed work restarts after restore", async () => {
    const machine = flow.machine<
      { readonly ticks: number },
      Readonly<{ readonly type: "CANCEL" }> | Readonly<{ readonly type: "REARM" }>,
      "waiting" | "cancelled" | "done"
    >({
      id: "rehydration.timer.restart.machine",
      initial: "waiting",
      context: () => ({ ticks: 0 }),
      states: {
        waiting: {
          after: flow.after({
            id: "rehydration.timer.restart.after",
            delay: "2 seconds",
            target: "done",
            update: ({ context }) => ({ ticks: context.ticks + 1 }),
          }),
          on: {
            CANCEL: "cancelled",
          },
        },
        cancelled: {
          on: {
            REARM: "waiting",
          },
        },
        done: {},
      },
    });

    const restoredSnapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "cancelled" as const,
      timers: {
        "rehydration.timer.restart.after": {
          id: "rehydration.timer.restart.after",
          status: "interrupt" as const,
          generation: 4,
          parentState: "waiting",
          startedAt: 0,
          dueAt: 2_000,
          endedAt: 250,
        },
      },
      receipts: [
        { type: "actor:start", id: "rehydration.timer.restart.actor" },
        {
          type: "timer:start",
          id: "rehydration.timer.restart.after",
          generation: 4,
          parentState: "waiting",
          dueAt: 2_000,
        },
        {
          type: "timer:interrupt",
          id: "rehydration.timer.restart.after",
          generation: 4,
          parentState: "waiting",
          dueAt: 2_000,
          endedAt: 250,
        },
      ],
    });

    const runtime = createFocusedRuntimeWithTestClock(machine, "RehydrationTimerRuntime");

    try {
      const actor = runtime.createActor(machine, {
        id: "rehydration.timer.restart.actor",
        snapshot: restoredSnapshot,
      });

      actor.send({ type: "REARM" });
      await actor.flush();

      expect(actor.snapshot().timers["rehydration.timer.restart.after"]).toMatchObject({
        id: "rehydration.timer.restart.after",
        status: "scheduled",
        generation: 5,
        parentState: "waiting",
        startedAt: 0,
        dueAt: 2_000,
      });

      await runtime.runPromise(TestClock.adjust("2 seconds"));
      await actor.flush();

      expect(actor.snapshot().value).toBe("done");
      expect(actor.snapshot().context.ticks).toBe(1);
      expect(actor.snapshot().timers["rehydration.timer.restart.after"]).toMatchObject({
        id: "rehydration.timer.restart.after",
        status: "fired",
        generation: 5,
        parentState: "waiting",
      });
      expect(
        actor
          .receipts()
          .filter(
            (receipt) =>
              receipt.type === "timer:start" && receipt.id === "rehydration.timer.restart.after",
          )
          .map((receipt) => receipt.generation),
      ).toEqual([4, 5]);
    } finally {
      await runtime.dispose();
    }
  });

  it("rejects a restored scheduled timer whose dueAt precedes startedAt", async () => {
    const machine = flow.machine<{}, never, "waiting" | "done">({
      id: "rehydration.invalid.timer-duration.machine",
      initial: "waiting",
      context: () => ({}),
      states: {
        waiting: {
          after: flow.after({
            id: "rehydration.invalid.timer-duration.after",
            delay: "1 second",
            target: "done",
          }),
        },
        done: {},
      },
    });

    const restoredSnapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "waiting" as const,
      timers: {
        "rehydration.invalid.timer-duration.after": {
          id: "rehydration.invalid.timer-duration.after",
          status: "scheduled" as const,
          generation: 2,
          parentState: "waiting",
          startedAt: 1_000,
          dueAt: 999,
        },
      },
      receipts: [
        { type: "actor:start", id: "rehydration.invalid.timer-duration.actor" },
        {
          type: "timer:start",
          id: "rehydration.invalid.timer-duration.after",
          generation: 2,
          parentState: "waiting",
          startedAt: 1_000,
          dueAt: 999,
        },
      ],
    });

    const runtime = createFocusedRuntimeWithTestClock(machine, "RehydrationInvalidTimerRuntime");

    try {
      let restoreError: unknown;
      try {
        runtime.createActor(machine, {
          id: "rehydration.invalid.timer-duration.actor",
          snapshot: restoredSnapshot,
        });
      } catch (error) {
        restoreError = error;
      }

      expect(restoreError).toMatchObject({
        code: "FLOW-TIMER-001",
        debug: {
          machineId: "rehydration.invalid.timer-duration.machine",
          timerId: "rehydration.invalid.timer-duration.after",
          parentState: "waiting",
          status: "scheduled",
          startedAt: 1_000,
          dueAt: 999,
          reason: "scheduled-timer-negative-remaining-duration",
        },
      });
      expect(runtime.orchestrators.get("rehydration.invalid.timer-duration.actor")).toBe(null);
    } finally {
      await runtime.dispose();
    }
  });

  it("rejects a restored scheduled timer that does not belong to the destination state", async () => {
    const machine = flow.machine<{}, never, "idle" | "busy" | "done">({
      id: "rehydration.invalid.timer-state.machine",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {},
        busy: {
          after: flow.after({
            id: "rehydration.invalid.timer-state.after",
            delay: "1 second",
            target: "done",
          }),
        },
        done: {},
      },
    });

    const restoredSnapshot = Object.freeze({
      ...machine.getInitialSnapshot(),
      value: "idle" as const,
      timers: {
        "rehydration.invalid.timer-state.after": {
          id: "rehydration.invalid.timer-state.after",
          status: "scheduled" as const,
          generation: 2,
          parentState: "busy",
          startedAt: 0,
          dueAt: 1_000,
        },
      },
      receipts: [
        { type: "actor:start", id: "rehydration.invalid.timer-state.actor" },
        {
          type: "timer:start",
          id: "rehydration.invalid.timer-state.after",
          generation: 2,
          parentState: "busy",
          startedAt: 0,
          dueAt: 1_000,
        },
      ],
    });

    const runtime = createRuntime();

    try {
      let restoreError: unknown;
      try {
        runtime.createActor(machine, {
          id: "rehydration.invalid.timer-state.actor",
          snapshot: restoredSnapshot,
        });
      } catch (error) {
        restoreError = error;
      }

      expect(restoreError).toMatchObject({
        code: "FLOW-TIMER-001",
        debug: {
          machineId: "rehydration.invalid.timer-state.machine",
          timerId: "rehydration.invalid.timer-state.after",
          parentState: "busy",
          status: "scheduled",
          startedAt: 0,
          dueAt: 1_000,
          reason: "scheduled-timer-not-in-restored-state",
          allowedTimerIds: [],
        },
      });
      expect(runtime.orchestrators.get("rehydration.invalid.timer-state.actor")).toBe(null);
    } finally {
      await runtime.dispose();
    }
  });
});
