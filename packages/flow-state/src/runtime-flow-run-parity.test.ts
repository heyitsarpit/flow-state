import { describe, expect, it } from "vite-plus/test";
import { Effect } from "effect";

import * as flow from "./index.js";
import { createRuntime } from "./runtime/contract-runtime.js";
import { flowTest } from "./testing.js";
import { createFocusedTestApp } from "./testing/focused-app.js";
import { expectNormalizedRuntimeParity } from "./testing/runtime-parity-assertions.js";

describe("runtime flow.run parity", () => {
  it("keeps synchronous state-owned flow.run success routing aligned between flowTest and a production runtime actor", async () => {
    type RunEvent =
      | Readonly<{ readonly type: "START" }>
      | Readonly<{
          readonly type: "SAVED";
          readonly project: { readonly id: "project-1"; readonly name: "Saved draft" };
        }>;

    const saveDraft = flow.transaction<
      void,
      { readonly id: "project-1"; readonly name: "Saved draft" },
      never,
      never,
      RunEvent
    >({
      id: "runtime-invokes.flow-test.run-sync-route.save",
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
      RunEvent,
      "editing" | "saving" | "done"
    >({
      id: "runtime-invokes.flow-test.run-sync-route",
      initial: "editing",
      context: () => ({
        savedProject: null,
      }),
      states: {
        editing: {
          on: {
            START: {
              target: "saving",
            },
          },
        },
        saving: {
          invoke: flow.run(saveDraft),
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
      const event = { type: "START" } as const;

      expect(flow.can(harness.getSnapshot(), event)).toBe(true);
      expect(flow.can(actor.getSnapshot(), event)).toBe(true);
      expect(harness.can(event)).toBe(true);
      expectNormalizedRuntimeParity(harness, actor);

      harness.send(event);
      actor.send(event);

      expectNormalizedRuntimeParity(harness, actor);
      expect(harness.state()).toBe("saving");
      expect(harness.context()).toEqual({ savedProject: null });
      expect(harness.getSnapshot().transactions[saveDraft.id]).toMatchObject({
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
      expect(harness.state()).toBe("done");
      expect(harness.context()).toEqual({
        savedProject: {
          id: "project-1",
          name: "Saved draft",
        },
      });
      expect(harness.getSnapshot().transactions[saveDraft.id]).toMatchObject({
        status: "success",
        value: {
          id: "project-1",
          name: "Saved draft",
        },
      });
      expect(harness.receipts()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "transaction:start",
            id: saveDraft.id,
          }),
          expect.objectContaining({
            type: "transaction:success",
            id: saveDraft.id,
          }),
        ]),
      );
      expect(harness.issues()).toEqual([]);
    } finally {
      await actor.dispose();
      await runtime.dispose();
    }
  });

  it("keeps synchronous state-owned flow.run failure routing aligned between flowTest and a production runtime actor", async () => {
    type RunEvent =
      | Readonly<{ readonly type: "START" }>
      | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>;

    const saveDraft = flow.transaction<void, never, "conflict", never, RunEvent>({
      id: "runtime-invokes.flow-test.run-sync-failure-route.save",
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
      RunEvent,
      "editing" | "saving" | "failed"
    >({
      id: "runtime-invokes.flow-test.run-sync-failure-route",
      initial: "editing",
      context: () => ({
        saveError: null,
      }),
      states: {
        editing: {
          on: {
            START: {
              target: "saving",
            },
          },
        },
        saving: {
          invoke: flow.run(saveDraft),
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
      const event = { type: "START" } as const;

      expect(flow.can(harness.getSnapshot(), event)).toBe(true);
      expect(flow.can(actor.getSnapshot(), event)).toBe(true);
      expect(harness.can(event)).toBe(true);
      expectNormalizedRuntimeParity(harness, actor);

      harness.send(event);
      actor.send(event);

      expectNormalizedRuntimeParity(harness, actor);
      expect(harness.state()).toBe("saving");
      expect(harness.context()).toEqual({ saveError: null });
      expect(harness.getSnapshot().transactions[saveDraft.id]).toMatchObject({
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
      expect(harness.getSnapshot().transactions[saveDraft.id]).toMatchObject({
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

  it("keeps synchronous state-owned flow.run interrupt routing aligned between flowTest and a production runtime actor", async () => {
    type RunEvent =
      | Readonly<{ readonly type: "START" }>
      | Readonly<{ readonly type: "SAVE_INTERRUPTED" }>;

    const saveDraft = flow.transaction<void, never, never, never, RunEvent>({
      id: "runtime-invokes.flow-test.run-sync-interrupt-route.save",
      commit: () => Effect.interrupt,
      routes: {
        interrupt: () => ({
          type: "SAVE_INTERRUPTED" as const,
        }),
      },
    });

    const machine = flow.machine<
      { readonly interrupted: boolean },
      RunEvent,
      "editing" | "saving" | "interrupted"
    >({
      id: "runtime-invokes.flow-test.run-sync-interrupt-route",
      initial: "editing",
      context: () => ({
        interrupted: false,
      }),
      states: {
        editing: {
          on: {
            START: {
              target: "saving",
            },
          },
        },
        saving: {
          invoke: flow.run(saveDraft),
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
      const event = { type: "START" } as const;

      expect(flow.can(harness.getSnapshot(), event)).toBe(true);
      expect(flow.can(actor.getSnapshot(), event)).toBe(true);
      expect(harness.can(event)).toBe(true);
      expectNormalizedRuntimeParity(harness, actor);

      harness.send(event);
      actor.send(event);

      expectNormalizedRuntimeParity(harness, actor);
      expect(harness.state()).toBe("saving");
      expect(harness.context()).toEqual({ interrupted: false });
      expect(harness.getSnapshot().transactions[saveDraft.id]).toMatchObject({
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
      expect(harness.getSnapshot().transactions[saveDraft.id]).toMatchObject({
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

  it("keeps synchronous state-owned flow.run defect routing aligned between flowTest and a production runtime actor", async () => {
    type RunEvent =
      | Readonly<{ readonly type: "START" }>
      | Readonly<{ readonly type: "SAVE_DEFECT" }>;

    const saveDraft = flow.transaction<void, never, never, never, RunEvent>({
      id: "runtime-invokes.flow-test.run-sync-defect-route.save",
      commit: () => Effect.die("save defect" as const),
      routes: {
        defect: () => ({
          type: "SAVE_DEFECT" as const,
        }),
      },
    });

    const machine = flow.machine<
      { readonly defected: boolean },
      RunEvent,
      "editing" | "saving" | "defected"
    >({
      id: "runtime-invokes.flow-test.run-sync-defect-route",
      initial: "editing",
      context: () => ({
        defected: false,
      }),
      states: {
        editing: {
          on: {
            START: {
              target: "saving",
            },
          },
        },
        saving: {
          invoke: flow.run(saveDraft),
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
      const event = { type: "START" } as const;

      expect(flow.can(harness.getSnapshot(), event)).toBe(true);
      expect(flow.can(actor.getSnapshot(), event)).toBe(true);
      expect(harness.can(event)).toBe(true);
      expectNormalizedRuntimeParity(harness, actor);

      harness.send(event);
      actor.send(event);

      expectNormalizedRuntimeParity(harness, actor);
      expect(harness.state()).toBe("saving");
      expect(harness.context()).toEqual({ defected: false });
      expect(harness.getSnapshot().transactions[saveDraft.id]).toMatchObject({
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
      expect(harness.getSnapshot().transactions[saveDraft.id]).toMatchObject({
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
});
