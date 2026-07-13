import { describe, expect, it } from "vite-plus/test";
import { Effect } from "effect";

import * as flow from "./index.js";
import { createRuntime } from "./runtime/contract-runtime.js";
import { flowTest } from "./testing.js";
import {
  callNames,
  createControlledSaveLayer,
  serializeQueueBehaviorProjectResourceId,
  serializeQueueBehaviorTransactionId,
  startSerializeQueueBehaviorFlowTest,
  startSerializeQueueBehaviorRuntimeActor,
} from "./testing/fixtures/submit-transaction-serialize-queue-behavior.js";
import { createFocusedTestApp } from "./testing/focused-app.js";
import { expectNormalizedRuntimeParity } from "./testing/runtime-parity-assertions.js";
import { createRuntimeBackedTestHarness } from "./testing/runtime-backed-test-harness.js";

const normalizeResourceTiming = (
  resources: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
) =>
  Object.fromEntries(
    Object.entries(resources).map(([id, snapshot]) => [
      id,
      {
        ...snapshot,
        ...("updatedAt" in snapshot && typeof snapshot.updatedAt === "number"
          ? { updatedAt: 0 }
          : {}),
      },
    ]),
  );

const normalizeQueuePathReceipt = (receipt: Readonly<Record<string, unknown>>) => ({
  ...receipt,
  ...("startedAt" in receipt && typeof receipt.startedAt === "number" ? { startedAt: 0 } : {}),
  ...("completedAt" in receipt && typeof receipt.completedAt === "number"
    ? { completedAt: 0 }
    : {}),
  ...("endedAt" in receipt && typeof receipt.endedAt === "number" ? { endedAt: 0 } : {}),
  ...("durationMillis" in receipt && typeof receipt.durationMillis === "number"
    ? { durationMillis: 0 }
    : {}),
  ...("correlationId" in receipt && typeof receipt.correlationId === "string"
    ? {
        correlationId: (() => {
          const eventMarker = receipt.correlationId.lastIndexOf(":event:");
          return eventMarker >= 0
            ? receipt.correlationId.slice(eventMarker + 1)
            : receipt.correlationId;
        })(),
      }
    : {}),
});

const normalizeQueuePathIssueValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeQueuePathIssueValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Readonly<Record<string, unknown>>).map(([key, entry]) => [
        key,
        key === "correlationId" && typeof entry === "string"
          ? (() => {
              const eventMarker = entry.lastIndexOf(":event:");
              return eventMarker >= 0 ? entry.slice(eventMarker + 1) : entry;
            })()
          : normalizeQueuePathIssueValue(entry),
      ]),
    );
  }
  return value;
};

describe("runtime submit parity", () => {
  it("keeps synchronous submit failure routing aligned between flowTest and a production runtime actor", async () => {
    type SubmitEvent =
      | Readonly<{ readonly type: "SAVE" }>
      | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>;

    const saveDraft = flow.transaction<void, never, "conflict", never, SubmitEvent>({
      id: "runtime-invokes.flow-test.submit-sync-failure-route.save",
      commit: () => Effect.fail("conflict" as const),
      routes: {
        failure: ({ error }) => ({
          type: "SAVE_FAILED" as const,
          error,
        }),
      },
    });

    const machine = flow.machine<
      { readonly saveError: "conflict" | null },
      SubmitEvent,
      "editing" | "saving" | "failed"
    >({
      id: "runtime-invokes.flow-test.submit-sync-failure-route",
      initial: "editing",
      context: () => ({
        saveError: null,
      }),
      states: {
        editing: {
          on: {
            SAVE: {
              target: "saving",
              submit: saveDraft,
            },
          },
        },
        saving: {
          on: {
            SAVE_FAILED: {
              target: "failed",
              update: ({ event }) =>
                event.type === "SAVE_FAILED" ? { saveError: event.error } : {},
            },
          },
        },
        failed: {},
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
      const event = { type: "SAVE" } as const;

      expect(flow.can(harness.snapshot(), event)).toBe(true);
      expect(flow.can(actor.getSnapshot(), event)).toBe(true);
      expect(harness.can(event)).toBe(true);
      expectNormalizedRuntimeParity(harness, actor);

      harness.send(event);
      actor.send(event);

      expectNormalizedRuntimeParity(harness, actor);
      expect(harness.state()).toBe("saving");
      expect(harness.context()).toEqual({ saveError: null });
      expect(harness.snapshot().transactions[saveDraft.id]).toMatchObject({
        status: "pending",
      });
      expect(
        harness
          .receipts()
          .some(
            (receipt) =>
              receipt.id === saveDraft.id &&
              (receipt.type === "transaction:success" ||
                receipt.type === "transaction:failure" ||
                receipt.type === "transaction:defect" ||
                receipt.type === "transaction:interrupt"),
          ),
      ).toBe(false);

      await harness.flush();
      await actor.flush();

      expectNormalizedRuntimeParity(harness, actor);
      expect(harness.state()).toBe("failed");
      expect(harness.context()).toEqual({
        saveError: "conflict",
      });
      expect(harness.snapshot().transactions[saveDraft.id]).toMatchObject({
        status: "failure",
        error: "conflict",
      });
      expect(harness.receipts()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "transaction:start",
            id: saveDraft.id,
          }),
          expect.objectContaining({
            type: "transaction:failure",
            id: saveDraft.id,
          }),
        ]),
      );
      expect(harness.issues()).toEqual([
        expect.objectContaining({
          kind: "failure",
          source: "transaction",
          id: saveDraft.id,
          error: "conflict",
          handled: true,
        }),
      ]);
    } finally {
      await actor.dispose();
      await runtime.dispose();
    }
  });

  it("keeps synchronous submit interrupt routing aligned between flowTest and a production runtime actor", async () => {
    type SubmitEvent =
      | Readonly<{ readonly type: "SAVE" }>
      | Readonly<{ readonly type: "SAVE_INTERRUPTED" }>;

    const saveDraft = flow.transaction<void, never, never, never, SubmitEvent>({
      id: "runtime-invokes.flow-test.submit-sync-interrupt-route.save",
      commit: () => Effect.interrupt,
      routes: {
        interrupt: () => ({
          type: "SAVE_INTERRUPTED" as const,
        }),
      },
    });

    const machine = flow.machine<
      { readonly interrupted: boolean },
      SubmitEvent,
      "editing" | "saving" | "interrupted"
    >({
      id: "runtime-invokes.flow-test.submit-sync-interrupt-route",
      initial: "editing",
      context: () => ({
        interrupted: false,
      }),
      states: {
        editing: {
          on: {
            SAVE: {
              target: "saving",
              submit: saveDraft,
            },
          },
        },
        saving: {
          on: {
            SAVE_INTERRUPTED: {
              target: "interrupted",
              update: () => ({ interrupted: true }),
            },
          },
        },
        interrupted: {},
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
      const event = { type: "SAVE" } as const;

      expect(flow.can(harness.snapshot(), event)).toBe(true);
      expect(flow.can(actor.getSnapshot(), event)).toBe(true);
      expect(harness.can(event)).toBe(true);
      expectNormalizedRuntimeParity(harness, actor);

      harness.send(event);
      actor.send(event);

      expectNormalizedRuntimeParity(harness, actor);
      expect(harness.state()).toBe("saving");
      expect(harness.context()).toEqual({ interrupted: false });
      expect(harness.snapshot().transactions[saveDraft.id]).toMatchObject({
        status: "pending",
      });
      expect(
        harness
          .receipts()
          .some(
            (receipt) =>
              receipt.id === saveDraft.id &&
              (receipt.type === "transaction:success" ||
                receipt.type === "transaction:failure" ||
                receipt.type === "transaction:defect" ||
                receipt.type === "transaction:interrupt"),
          ),
      ).toBe(false);

      await harness.flush();
      await actor.flush();

      expectNormalizedRuntimeParity(harness, actor);
      expect(harness.state()).toBe("interrupted");
      expect(harness.context()).toEqual({
        interrupted: true,
      });
      expect(harness.snapshot().transactions[saveDraft.id]).toMatchObject({
        status: "interrupt",
      });
      expect(harness.receipts()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "transaction:start",
            id: saveDraft.id,
          }),
          expect.objectContaining({
            type: "transaction:interrupt",
            id: saveDraft.id,
          }),
        ]),
      );
      expect(harness.issues()).toEqual([
        expect.objectContaining({
          kind: "interrupt",
          source: "transaction",
          id: saveDraft.id,
          handled: true,
        }),
      ]);
      const interruptCause = (harness.issues()[0] as { cause?: unknown } | undefined)?.cause as
        | Readonly<{ readonly reasons?: ReadonlyArray<unknown> }>
        | undefined;
      expect(interruptCause?.reasons).toEqual(
        expect.arrayContaining([expect.objectContaining({ _tag: "Interrupt" })]),
      );
    } finally {
      await actor.dispose();
      await runtime.dispose();
    }
  });

  it("keeps synchronous submit defect routing aligned between flowTest and a production runtime actor", async () => {
    type SubmitEvent =
      | Readonly<{ readonly type: "SAVE" }>
      | Readonly<{ readonly type: "SAVE_DEFECT" }>;

    const saveDraft = flow.transaction<void, never, never, never, SubmitEvent>({
      id: "runtime-invokes.flow-test.submit-sync-defect-route.save",
      commit: () => Effect.die("save defect" as const),
      routes: {
        defect: () => ({
          type: "SAVE_DEFECT" as const,
        }),
      },
    });

    const machine = flow.machine<
      { readonly defected: boolean },
      SubmitEvent,
      "editing" | "saving" | "defected"
    >({
      id: "runtime-invokes.flow-test.submit-sync-defect-route",
      initial: "editing",
      context: () => ({
        defected: false,
      }),
      states: {
        editing: {
          on: {
            SAVE: {
              target: "saving",
              submit: saveDraft,
            },
          },
        },
        saving: {
          on: {
            SAVE_DEFECT: {
              target: "defected",
              update: () => ({ defected: true }),
            },
          },
        },
        defected: {},
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
      const event = { type: "SAVE" } as const;

      expect(flow.can(harness.snapshot(), event)).toBe(true);
      expect(flow.can(actor.getSnapshot(), event)).toBe(true);
      expect(harness.can(event)).toBe(true);
      expectNormalizedRuntimeParity(harness, actor);

      harness.send(event);
      actor.send(event);

      expectNormalizedRuntimeParity(harness, actor);
      expect(harness.state()).toBe("saving");
      expect(harness.context()).toEqual({ defected: false });
      expect(harness.snapshot().transactions[saveDraft.id]).toMatchObject({
        status: "pending",
      });
      expect(
        harness
          .receipts()
          .some(
            (receipt) =>
              receipt.id === saveDraft.id &&
              (receipt.type === "transaction:success" ||
                receipt.type === "transaction:failure" ||
                receipt.type === "transaction:defect" ||
                receipt.type === "transaction:interrupt"),
          ),
      ).toBe(false);

      await harness.flush();
      await actor.flush();

      expectNormalizedRuntimeParity(harness, actor);
      expect(harness.state()).toBe("defected");
      expect(harness.context()).toEqual({
        defected: true,
      });
      expect(harness.snapshot().transactions[saveDraft.id]).toMatchObject({
        status: "defect",
      });
      expect(harness.receipts()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "transaction:start",
            id: saveDraft.id,
          }),
          expect.objectContaining({
            type: "transaction:defect",
            id: saveDraft.id,
          }),
        ]),
      );
      expect(harness.issues()).toEqual([
        expect.objectContaining({
          kind: "defect",
          source: "transaction",
          id: saveDraft.id,
          handled: true,
        }),
      ]);
    } finally {
      await actor.dispose();
      await runtime.dispose();
    }
  });

  it("keeps nested synchronous submit success routed-event receipts aligned between flowTest and a production runtime actor", async () => {
    type SubmitEvent =
      | Readonly<{ readonly type: "SAVE" }>
      | Readonly<{
          readonly type: "SAVED";
          readonly project: { readonly id: "project-1"; readonly name: "Saved draft" };
        }>;

    const saveDraft = flow.transaction<
      void,
      { readonly id: "project-1"; readonly name: "Saved draft" },
      never,
      never,
      SubmitEvent
    >({
      id: "runtime-invokes.flow-test.submit-sync-route.save",
      commit: () =>
        Effect.succeed({
          id: "project-1" as const,
          name: "Saved draft" as const,
        }),
      routes: {
        success: ({ value }) => ({
          type: "SAVED" as const,
          project: value,
        }),
      },
    });

    const machine = flow.machine<
      { readonly savedProject: { readonly id: "project-1"; readonly name: "Saved draft" } | null },
      SubmitEvent,
      "editing" | "saving" | "done"
    >({
      id: "runtime-invokes.flow-test.submit-sync-route",
      initial: "editing",
      context: () => ({
        savedProject: null,
      }),
      states: {
        editing: {
          on: {
            SAVE: {
              target: "saving",
              submit: saveDraft,
            },
          },
        },
        saving: {
          on: {
            SAVED: {
              target: "done",
              update: ({ event }) =>
                event.type === "SAVED"
                  ? {
                      savedProject: event.project,
                    }
                  : {},
            },
          },
        },
        done: {},
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
      const event = { type: "SAVE" } as const;

      expect(flow.can(harness.snapshot(), event)).toBe(true);
      expect(flow.can(actor.getSnapshot(), event)).toBe(true);
      expect(harness.can(event)).toBe(true);
      expectNormalizedRuntimeParity(harness, actor);

      harness.send(event);
      actor.send(event);

      expectNormalizedRuntimeParity(harness, actor);
      expect(harness.state()).toBe("saving");
      expect(harness.context()).toEqual({ savedProject: null });
      expect(harness.snapshot().transactions[saveDraft.id]).toMatchObject({
        status: "pending",
      });
      expect(
        harness
          .receipts()
          .some(
            (receipt) =>
              receipt.id === saveDraft.id &&
              (receipt.type === "transaction:success" ||
                receipt.type === "transaction:failure" ||
                receipt.type === "transaction:defect" ||
                receipt.type === "transaction:interrupt"),
          ),
      ).toBe(false);

      await harness.flush();
      await actor.flush();

      expectNormalizedRuntimeParity(harness, actor);
      const machineEvents = harness
        .receipts()
        .filter((receipt) => receipt.type === "machine:event");
      const saveCorrelationId = machineEvents[0]?.correlationId;
      const routedCorrelationId = machineEvents[1]?.correlationId;
      const successReceipt = harness
        .receipts()
        .find((receipt) => receipt.type === "transaction:success" && receipt.id === saveDraft.id);

      expect(harness.state()).toBe("done");
      expect(harness.context()).toEqual({
        savedProject: {
          id: "project-1",
          name: "Saved draft",
        },
      });
      expect(machineEvents).toHaveLength(2);
      expect(machineEvents.map((receipt) => receipt.eventType)).toEqual(["SAVE", "SAVED"]);
      expect(saveCorrelationId).toEqual(expect.any(String));
      expect(routedCorrelationId).toEqual(expect.any(String));
      expect(routedCorrelationId).not.toBe(saveCorrelationId);
      expect(successReceipt).toEqual(
        expect.objectContaining({
          type: "transaction:success",
          id: saveDraft.id,
          routedEventType: "SAVED",
          correlationId: saveCorrelationId,
        }),
      );
      expect(harness.receipts()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "machine:transition",
            eventType: "SAVED",
            from: "saving",
            to: "done",
            correlationId: routedCorrelationId,
          }),
        ]),
      );
      expect(harness.snapshot().transactions[saveDraft.id]).toMatchObject({
        status: "success",
        value: {
          id: "project-1",
          name: "Saved draft",
        },
      });
      expect(harness.issues()).toEqual([]);
    } finally {
      await actor.dispose();
      await runtime.dispose();
    }
  });

  it("keeps same-state serialized submit queueing aligned between flowTest and a production runtime actor", async () => {
    const harnessControls = createControlledSaveLayer();
    const actorControls = createControlledSaveLayer();
    const harness = startSerializeQueueBehaviorFlowTest(harnessControls, []);
    const { actor, runtime } = startSerializeQueueBehaviorRuntimeActor(actorControls);
    const runtimeHarness = createRuntimeBackedTestHarness(runtime, actor);

    try {
      const firstSave = { type: "SAVE", name: "Draft A" } as const;
      const secondSave = { type: "SAVE", name: "Draft B" } as const;

      expect(flow.can(harness.snapshot(), firstSave)).toBe(true);
      expect(flow.can(actor.getSnapshot(), firstSave)).toBe(true);
      expect(harness.can(firstSave)).toBe(true);
      expect(flow.can(harness.snapshot(), secondSave)).toBe(true);
      expect(flow.can(actor.getSnapshot(), secondSave)).toBe(true);
      expect(harness.can(secondSave)).toBe(true);
      expect(harness.pendingWork()).toEqual(runtimeHarness.pendingWork());

      harness.send(firstSave);
      harness.send(secondSave);
      actor.send(firstSave);
      actor.send(secondSave);

      expect(callNames(harnessControls)).toEqual(["Draft A"]);
      expect(callNames(actorControls)).toEqual(["Draft A"]);
      expect(harness.state()).toBe(actor.getSnapshot().value);
      expect(harness.context()).toEqual(actor.getSnapshot().context);
      expect(normalizeResourceTiming(harness.snapshot().resources)).toEqual(
        normalizeResourceTiming(actor.getSnapshot().resources),
      );
      expect(harness.snapshot().transactions).toEqual(actor.getSnapshot().transactions);
      expect(
        harness
          .receipts()
          .filter((receipt) => receipt.id === serializeQueueBehaviorTransactionId)
          .map((receipt) => normalizeQueuePathReceipt(receipt)),
      ).toEqual(
        actor
          .receipts()
          .filter((receipt) => receipt.id === serializeQueueBehaviorTransactionId)
          .map((receipt) => normalizeQueuePathReceipt(receipt)),
      );
      expect(harness.issues().map((issue) => normalizeQueuePathIssueValue(issue))).toEqual(
        actor.issues().map((issue) => normalizeQueuePathIssueValue(issue)),
      );
      expect(harness.pendingWork()).toEqual(runtimeHarness.pendingWork());
      expect(harness.context()).toEqual({
        projectId: "project-1",
        draft: { id: "project-1", name: "Draft B" },
        savedNames: [],
        error: null,
      });
      expect(harness.snapshot().resources[serializeQueueBehaviorProjectResourceId]).toMatchObject({
        value: { id: "project-1", name: "Draft A" },
      });
      expect(harness.snapshot().transactions[serializeQueueBehaviorTransactionId]).toMatchObject({
        status: "pending",
      });
      expect(harness.pendingWork()).toMatchObject({
        ready: 0,
        activeFibers: 1,
        mailboxes: [],
        transactions: [serializeQueueBehaviorTransactionId],
      });
      expect(
        harness
          .receipts()
          .filter(
            (receipt) =>
              receipt.id === serializeQueueBehaviorTransactionId &&
              receipt.type === "transaction:preview-patch",
          ),
      ).toHaveLength(1);
      expect(
        harness
          .receipts()
          .filter(
            (receipt) =>
              receipt.id === serializeQueueBehaviorTransactionId &&
              receipt.type === "transaction:queue",
          ),
      ).toHaveLength(1);
      expect(
        harness
          .receipts()
          .filter(
            (receipt) =>
              receipt.id === serializeQueueBehaviorTransactionId &&
              receipt.type === "transaction:dequeue",
          ),
      ).toHaveLength(0);
      expect(
        harness
          .receipts()
          .some(
            (receipt) =>
              receipt.id === serializeQueueBehaviorTransactionId &&
              (receipt.type === "transaction:success" ||
                receipt.type === "transaction:failure" ||
                receipt.type === "transaction:defect" ||
                receipt.type === "transaction:interrupt"),
          ),
      ).toBe(false);
      expect(harness.issues()).toEqual([]);
    } finally {
      await runtime.dispose();
    }
  });

  it("keeps same-state serialized submit overflow aligned between flowTest and a production runtime actor", async () => {
    const harnessControls = createControlledSaveLayer();
    const actorControls = createControlledSaveLayer();
    const harness = startSerializeQueueBehaviorFlowTest(harnessControls, []);
    const { actor, runtime } = startSerializeQueueBehaviorRuntimeActor(actorControls);
    const runtimeHarness = createRuntimeBackedTestHarness(runtime, actor);

    try {
      const firstSave = { type: "SAVE", name: "Draft A" } as const;
      const secondSave = { type: "SAVE", name: "Draft B" } as const;
      const thirdSave = { type: "SAVE", name: "Draft C" } as const;

      expect(flow.can(harness.snapshot(), firstSave)).toBe(true);
      expect(flow.can(actor.getSnapshot(), firstSave)).toBe(true);
      expect(harness.can(firstSave)).toBe(true);
      expect(flow.can(harness.snapshot(), secondSave)).toBe(true);
      expect(flow.can(actor.getSnapshot(), secondSave)).toBe(true);
      expect(harness.can(secondSave)).toBe(true);
      expect(flow.can(harness.snapshot(), thirdSave)).toBe(true);
      expect(flow.can(actor.getSnapshot(), thirdSave)).toBe(true);
      expect(harness.can(thirdSave)).toBe(true);
      expect(harness.pendingWork()).toEqual(runtimeHarness.pendingWork());

      harness.send(firstSave);
      harness.send(secondSave);
      harness.send(thirdSave);
      actor.send(firstSave);
      actor.send(secondSave);
      actor.send(thirdSave);

      expect(callNames(harnessControls)).toEqual(["Draft A"]);
      expect(callNames(actorControls)).toEqual(["Draft A"]);
      expect(harness.state()).toBe(actor.getSnapshot().value);
      expect(harness.context()).toEqual(actor.getSnapshot().context);
      expect(normalizeResourceTiming(harness.snapshot().resources)).toEqual(
        normalizeResourceTiming(actor.getSnapshot().resources),
      );
      expect(harness.snapshot().transactions).toEqual(actor.getSnapshot().transactions);
      expect(
        harness
          .receipts()
          .filter((receipt) => receipt.id === serializeQueueBehaviorTransactionId)
          .map((receipt) => normalizeQueuePathReceipt(receipt)),
      ).toEqual(
        actor
          .receipts()
          .filter((receipt) => receipt.id === serializeQueueBehaviorTransactionId)
          .map((receipt) => normalizeQueuePathReceipt(receipt)),
      );
      expect(harness.issues().map((issue) => normalizeQueuePathIssueValue(issue))).toEqual(
        actor.issues().map((issue) => normalizeQueuePathIssueValue(issue)),
      );
      expect(harness.pendingWork()).toEqual(runtimeHarness.pendingWork());
      expect(harness.context()).toEqual({
        projectId: "project-1",
        draft: { id: "project-1", name: "Draft C" },
        savedNames: [],
        error: null,
      });
      expect(harness.snapshot().resources[serializeQueueBehaviorProjectResourceId]).toMatchObject({
        value: { id: "project-1", name: "Draft A" },
      });
      expect(harness.snapshot().transactions[serializeQueueBehaviorTransactionId]).toMatchObject({
        status: "pending",
      });
      expect(harness.pendingWork()).toMatchObject({
        ready: 0,
        activeFibers: 1,
        mailboxes: [],
        transactions: [serializeQueueBehaviorTransactionId],
      });
      expect(
        harness
          .receipts()
          .filter(
            (receipt) =>
              receipt.id === serializeQueueBehaviorTransactionId &&
              receipt.type === "transaction:preview-patch",
          ),
      ).toHaveLength(1);
      expect(
        harness
          .receipts()
          .filter(
            (receipt) =>
              receipt.id === serializeQueueBehaviorTransactionId &&
              receipt.type === "transaction:queue",
          ),
      ).toHaveLength(1);
      expect(
        harness
          .receipts()
          .filter(
            (receipt) =>
              receipt.id === serializeQueueBehaviorTransactionId &&
              receipt.type === "transaction:reject",
          ),
      ).toEqual([
        expect.objectContaining({
          queueKey: serializeQueueBehaviorTransactionId,
          overlapCause: "active-attempt",
          activeAttemptCount: 1,
          queuedAttemptCount: 1,
          queueCapacity: 1,
          parentState: "ready",
        }),
      ]);
      expect(
        harness
          .receipts()
          .filter(
            (receipt) =>
              receipt.id === serializeQueueBehaviorTransactionId &&
              receipt.type === "transaction:dequeue",
          ),
      ).toHaveLength(0);
      expect(
        harness
          .receipts()
          .some(
            (receipt) =>
              receipt.id === serializeQueueBehaviorTransactionId &&
              (receipt.type === "transaction:success" ||
                receipt.type === "transaction:failure" ||
                receipt.type === "transaction:defect" ||
                receipt.type === "transaction:interrupt"),
          ),
      ).toBe(false);
      expect(harness.issues()).toEqual([
        expect.objectContaining({
          kind: "failure",
          source: "transaction",
          id: serializeQueueBehaviorTransactionId,
          error: expect.objectContaining({
            code: "FLOW-TXN-004",
            title: "Transaction 'transactions.save-serial' exceeded the serialized queue capacity",
          }),
          facts: expect.objectContaining({
            parentState: "ready",
            receiptTypes: ["transaction:reject"],
            relatedIds: [serializeQueueBehaviorTransactionId],
          }),
        }),
      ]);
    } finally {
      await runtime.dispose();
    }
  });
});
