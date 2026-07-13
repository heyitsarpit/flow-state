import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "./index.js";
import { test } from "./testing.js";

type GuardedEvent =
  | Readonly<{ readonly type: "NEXT" }>
  | Readonly<{ readonly type: "ALLOW" }>
  | Readonly<{ readonly type: "PROCEED" }>;

describe("flowTest model paths", () => {
  it("generates shortest and simple paths from events allowed by flow.can", () => {
    const machine = flow.machine<
      { readonly allowed: boolean },
      GuardedEvent,
      "start" | "idle" | "done"
    >({
      id: "flow-test.model.guarded-paths",
      initial: "start",
      context: () => ({ allowed: false }),
      states: {
        start: {
          on: {
            NEXT: { target: "idle" },
          },
        },
        idle: {
          on: {
            ALLOW: {
              update: () => ({ allowed: true }),
            },
            PROCEED: {
              target: "done",
              guard: ({ context }) => context.allowed,
            },
          },
        },
        done: {},
      },
    });

    const model = test.model(machine);
    const expected = [["NEXT", "ALLOW", "PROCEED"]];

    expect(model.kind).toBe("model");
    expect(
      model.getShortestPaths().map((path) => path.steps.map((step) => step.event.type)),
    ).toEqual(expected);
    expect(model.getSimplePaths().map((path) => path.steps.map((step) => step.event.type))).toEqual(
      expected,
    );
  });

  it("replays discovered model paths through the live harness", () => {
    const machine = flow.machine<
      { readonly allowed: boolean },
      GuardedEvent,
      "start" | "idle" | "done"
    >({
      id: "flow-test.model.replay",
      initial: "start",
      context: () => ({ allowed: false }),
      states: {
        start: {
          on: {
            NEXT: { target: "idle" },
          },
        },
        idle: {
          on: {
            ALLOW: {
              update: () => ({ allowed: true }),
            },
            PROCEED: {
              target: "done",
              guard: ({ context }) => context.allowed,
            },
          },
        },
        done: {},
      },
    });

    const model = test.model(machine);
    const path = model.getShortestPaths()[0]!;
    const harness = model.replay(path);

    expect(path.steps.map((step) => step.event.type)).toEqual(["NEXT", "ALLOW", "PROCEED"]);
    expect(harness.state()).toBe(path.state.value);
    expect(harness.context()).toEqual(path.state.context);
  });

  it("accepts explicit payload candidates when commands need runtime data", () => {
    type FormEvent =
      | Readonly<{ readonly type: "TYPE_NAME"; readonly name: string }>
      | Readonly<{ readonly type: "SUBMIT" }>;

    const machine = flow.machine<{ readonly name: string }, FormEvent, "editing" | "submitted">({
      id: "flow-test.model.payload-events",
      initial: "editing",
      context: () => ({ name: "" }),
      states: {
        editing: {
          on: {
            TYPE_NAME: {
              update: ({ event }) => (event.type === "TYPE_NAME" ? { name: event.name } : {}),
            },
            SUBMIT: {
              target: "submitted",
              guard: ({ context }) => context.name.trim().length > 0,
            },
          },
        },
        submitted: {},
      },
    });

    const paths = test.model(machine).getShortestPaths({
      events: [{ type: "TYPE_NAME", name: "Atlas" }, { type: "SUBMIT" }],
    });

    expect(paths.map((path) => path.steps.map((step) => step.event.type))).toEqual([
      ["TYPE_NAME", "SUBMIT"],
    ]);
    expect(paths[0]?.description).toBe(
      'Reaches state "submitted": TYPE_NAME ({"name":"Atlas"}) -> SUBMIT',
    );
  });

  it("replays model paths with seeded input", () => {
    type FormEvent =
      | Readonly<{ readonly type: "TYPE_NAME"; readonly name: string }>
      | Readonly<{ readonly type: "SUBMIT" }>;

    const machine = flow.machine<{ readonly name: string }, FormEvent, "editing" | "submitted">({
      id: "flow-test.model.replay-input",
      initial: "editing",
      context: () => ({ name: "" }),
      states: {
        editing: {
          on: {
            TYPE_NAME: {
              update: ({ event }) => (event.type === "TYPE_NAME" ? { name: event.name } : {}),
            },
            SUBMIT: {
              target: "submitted",
              guard: ({ context }) => context.name.trim().length > 0,
            },
          },
        },
        submitted: {},
      },
    });

    const model = test.model(machine, {
      input: {
        name: "Atlas",
      },
    });
    const path = model.getShortestPaths({
      events: [{ type: "SUBMIT" }],
    })[0]!;
    const harness = model.replay(path);

    expect(path.steps.map((step) => step.event.type)).toEqual(["SUBMIT"]);
    expect(harness.state()).toBe("submitted");
    expect(harness.context()).toEqual({
      name: "Atlas",
    });
  });

  it("keeps accepted reentering self-transitions in shortest and simple path discovery", () => {
    type ReenterEvent = Readonly<{ readonly type: "RESTART" }>;

    const machine = flow.machine<{}, ReenterEvent, "idle">({
      id: "flow-test.model.reenter-self-transition",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            RESTART: {
              target: "idle",
              reenter: true,
            },
          },
        },
      },
    });

    const model = test.model(machine);
    const expected = [["RESTART"]];

    expect(
      model.getShortestPaths().map((path) => path.steps.map((step) => step.event.type)),
    ).toEqual(expected);
    expect(model.getSimplePaths().map((path) => path.steps.map((step) => step.event.type))).toEqual(
      expected,
    );

    const harness = model.replay(model.getShortestPaths()[0]!);

    expect(harness.state()).toBe("idle");
    expect(
      harness
        .receipts()
        .filter((receipt) => receipt.type === "machine:transition")
        .map((receipt) => receipt.reenter),
    ).toEqual([true]);
  });

  it("keeps accepted action-only self-transitions in shortest and simple path discovery", () => {
    type ActionOnlyEvent = Readonly<{ readonly type: "PING" }>;

    const machine = flow.machine<{}, ActionOnlyEvent, "idle">({
      id: "flow-test.model.action-only-self-transition",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            PING: {
              actions: () => ({
                type: "domain:ping",
              }),
            },
          },
        },
      },
    });

    const model = test.model(machine);
    const expected = [["PING"]];

    expect(
      model.getShortestPaths().map((path) => path.steps.map((step) => step.event.type)),
    ).toEqual(expected);
    expect(model.getSimplePaths().map((path) => path.steps.map((step) => step.event.type))).toEqual(
      expected,
    );

    const harness = model.replay(model.getShortestPaths()[0]!);

    expect(harness.state()).toBe("idle");
    expect(harness.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "machine:transition",
          from: "idle",
          to: "idle",
        }),
        expect.objectContaining({
          type: "domain:ping",
        }),
      ]),
    );
  });

  it("models state-owned flow.run activation on state entry with pending transaction state and previewed resources", () => {
    type RunEvent = Readonly<{ readonly type: "SAVE" }> | Readonly<{ readonly type: "SAVED" }>;

    const project = flow.resource<[projectId: string], { readonly name: string }>({
      id: "flow-test.model.state-run.project",
      key: (projectId) => flow.createKey("flow-test.model.state-run.project", projectId),
      lookup: (projectId) => Effect.succeed({ name: `Server ${projectId}` }),
    });

    const saveDraft = flow.transaction({
      id: "flow-test.model.state-run.save",
      params: ({
        context,
      }: {
        readonly context: { readonly draft: { readonly name: string } };
      }) => ({
        projectId: "project-1" as const,
        name: context.draft.name,
      }),
      preview: {
        apply: ({ params }) => [
          {
            ref: project.ref(params.projectId),
            patch: {
              name: params.name,
            },
          },
        ],
      },
      commit: () => Effect.never,
    });

    const machine = flow.machine<
      { readonly draft: { readonly name: string } },
      RunEvent,
      "idle" | "saving"
    >({
      id: "flow-test.model.state-run",
      initial: "idle",
      context: () => ({
        draft: { name: "Draft v1" },
      }),
      states: {
        idle: {
          on: {
            SAVE: {
              target: "saving",
            },
          },
        },
        saving: {
          invoke: flow.run(saveDraft),
        },
      },
    });

    const model = test.model(machine);
    const path = model.getShortestPaths()[0]!;
    const harness = model.replay(path);

    expect(path.steps.map((step) => step.event.type)).toEqual(["SAVE"]);
    expect(path.state.value).toBe("saving");
    expect(path.state.resources).toEqual({
      "flow-test.model.state-run.project": {
        id: "flow-test.model.state-run.project",
        status: "success",
        availability: "value",
        activity: "idle",
        freshness: "fresh",
        value: {
          name: "Draft v1",
        },
        isPlaceholderData: false,
      },
    });
    expect(path.state.transactions).toEqual({
      "flow-test.model.state-run.save": {
        id: "flow-test.model.state-run.save",
        status: "pending",
      },
    });
    expect(path.state.receipts.map((receipt) => receipt.type)).toEqual(
      expect.arrayContaining([
        "machine:transition",
        "transaction:start",
        "transaction:preview-patch",
      ]),
    );
    expect(
      path.state.receipts.filter((receipt) => receipt.type === "transaction:preview-patch"),
    ).toHaveLength(1);
    expect(harness.state()).toBe(path.state.value);
    expect(harness.context()).toEqual(path.state.context);
    expect(harness.snapshot().resources).toEqual(path.state.resources);
    expect(harness.snapshot().transactions).toEqual(path.state.transactions);
    expect(harness.receipts().map((receipt) => receipt.type)).toEqual(
      path.state.receipts.map((receipt) => receipt.type),
    );
  });

  it("models state-owned flow.after activation on state entry with a scheduled timer snapshot", () => {
    type TimerEvent = Readonly<{ readonly type: "START" }>;

    const machine = flow.machine<{}, TimerEvent, "idle" | "waiting" | "done">({
      id: "flow-test.model.state-after",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            START: {
              target: "waiting",
            },
          },
        },
        waiting: {
          after: flow.after({
            id: "flow-test.model.state-after.timer",
            delay: "2 seconds",
            target: "done",
          }),
        },
        done: {},
      },
    });

    const model = test.model(machine);
    const path = model.getShortestPaths()[0]!;
    const harness = model.replay(path);

    expect(path.steps.map((step) => step.event.type)).toEqual(["START"]);
    expect(path.state.value).toBe("waiting");
    expect(path.state.timers).toEqual({
      "flow-test.model.state-after.timer": {
        id: "flow-test.model.state-after.timer",
        status: "scheduled",
        generation: 1,
        parentState: "waiting",
        startedAt: 0,
        dueAt: 2_000,
      },
    });
    expect(path.state.receipts.map((receipt) => receipt.type)).toEqual(
      expect.arrayContaining(["machine:transition", "timer:start"]),
    );
    expect(harness.snapshot().timers).toEqual(path.state.timers);
    expect(harness.receipts().map((receipt) => receipt.type)).toEqual(
      path.state.receipts.map((receipt) => receipt.type),
    );
  });

  it("models state-owned flow.child activation on state entry with the active child snapshot", () => {
    type ParentEvent = Readonly<{ readonly type: "START" }>;

    const childMachine = flow.machine<{}, never, "running">({
      id: "flow-test.model.state-child.worker",
      initial: "running",
      context: () => ({}),
      states: {
        running: {},
      },
    });

    const machine = flow.machine<{}, ParentEvent, "idle" | "running">({
      id: "flow-test.model.state-child.parent",
      initial: "idle",
      context: () => ({}),
      states: {
        idle: {
          on: {
            START: {
              target: "running",
            },
          },
        },
        running: {
          invoke: flow.child({
            id: "child.worker",
            machine: childMachine,
            supervision: "stop-on-failure",
          }),
        },
      },
    });

    const model = test.model(machine);
    const path = model.getShortestPaths()[0]!;
    const harness = model.replay(path);

    expect(path.steps.map((step) => step.event.type)).toEqual(["START"]);
    expect(path.state.value).toBe("running");
    expect(path.state.children).toMatchObject({
      "child.worker": {
        id: "child.worker",
        actorId: "flow-test.model.state-child.parent/child.worker",
        status: "active",
        state: "running",
        parentState: "running",
        supervision: "stop-on-failure",
      },
    });
    expect(path.state.receipts.map((receipt) => receipt.type)).toEqual(
      expect.arrayContaining(["machine:transition", "child:start"]),
    );
    expect(harness.snapshot().children).toMatchObject(path.state.children);
    expect(harness.receipts().map((receipt) => receipt.type)).toEqual(
      path.state.receipts.map((receipt) => receipt.type),
    );
  });

  it("starts state-owned flow.run before event-owned submit when both activate on the same transition", () => {
    type DualStartEvent =
      | Readonly<{ readonly type: "SAVE" }>
      | Readonly<{ readonly type: "SAVED" }>;

    const project = flow.resource<[projectId: string], { readonly name: string }>({
      id: "flow-test.model.dual-start.project",
      key: (projectId) => flow.createKey("flow-test.model.dual-start.project", projectId),
      lookup: (projectId) => Effect.succeed({ name: `Server ${projectId}` }),
    });

    const stateOwnedSave = flow.transaction({
      id: "flow-test.model.dual-start.state-save",
      params: ({
        context,
      }: {
        readonly context: { readonly draft: { readonly name: string } };
      }) => ({
        projectId: "project-1" as const,
        name: context.draft.name,
      }),
      preview: {
        apply: ({ params }) => [
          {
            ref: project.ref(params.projectId),
            patch: {
              name: params.name,
            },
          },
        ],
      },
      commit: () => Effect.never,
    });

    const eventOwnedAudit = flow.transaction({
      id: "flow-test.model.dual-start.event-audit",
      params: () => ({ reason: "event-submit" as const }),
      commit: () => Effect.never,
    });

    const machine = flow.machine<
      { readonly draft: { readonly name: string } },
      DualStartEvent,
      "idle" | "saving"
    >({
      id: "flow-test.model.dual-start",
      initial: "idle",
      context: () => ({
        draft: { name: "Draft v1" },
      }),
      states: {
        idle: {
          on: {
            SAVE: {
              target: "saving",
              submit: eventOwnedAudit,
            },
          },
        },
        saving: {
          invoke: flow.run(stateOwnedSave),
        },
      },
    });

    const model = test.model(machine);
    const path = model.getShortestPaths()[0]!;
    const harness = model.replay(path);
    const transactionStarts = path.state.receipts.filter(
      (receipt) => receipt.type === "transaction:start",
    );

    expect(transactionStarts.map((receipt) => receipt.id)).toEqual([
      "flow-test.model.dual-start.state-save",
      "flow-test.model.dual-start.event-audit",
    ]);
    expect(path.state.transactions).toEqual({
      "flow-test.model.dual-start.state-save": {
        id: "flow-test.model.dual-start.state-save",
        status: "pending",
      },
      "flow-test.model.dual-start.event-audit": {
        id: "flow-test.model.dual-start.event-audit",
        status: "pending",
      },
    });
    expect(
      harness
        .receipts()
        .filter((receipt) => receipt.type === "transaction:start")
        .map((receipt) => receipt.id),
    ).toEqual(transactionStarts.map((receipt) => receipt.id));
  });

  it("models accepted submit self-transitions with the pending transaction snapshot", () => {
    type SubmitEvent = Readonly<{ readonly type: "SAVE" }>;

    const saveDraft = flow.transaction({
      id: "flow-test.model.submit-self-transition.save",
      commit: () => Effect.never,
    });

    const machine = flow.machine<{}, SubmitEvent, "editing">({
      id: "flow-test.model.submit-self-transition",
      initial: "editing",
      context: () => ({}),
      states: {
        editing: {
          on: {
            SAVE: {
              submit: saveDraft,
            },
          },
        },
      },
    });

    const model = test.model(machine);
    const path = model.getShortestPaths()[0]!;
    const harness = model.replay(path);

    expect(path.steps.map((step) => step.event.type)).toEqual(["SAVE"]);
    expect(path.state.transactions).toEqual({
      "flow-test.model.submit-self-transition.save": {
        id: "flow-test.model.submit-self-transition.save",
        status: "pending",
      },
    });
    expect(harness.snapshot().transactions).toEqual(path.state.transactions);
  });

  it("models accepted submit self-transitions with synchronous start receipts and previewed resources", () => {
    type SubmitEvent = Readonly<{ readonly type: "SAVE" }>;

    const project = flow.resource<[projectId: string], { readonly name: string }>({
      id: "flow-test.model.submit-preview.project",
      key: (projectId) => flow.createKey("flow-test.model.submit-preview.project", projectId),
      lookup: (projectId) => Effect.succeed({ name: `Server ${projectId}` }),
    });

    const saveDraft = flow.transaction({
      id: "flow-test.model.submit-preview.save",
      params: () => ({
        projectId: "project-1" as const,
      }),
      preview: {
        apply: ({ params }) => [
          {
            ref: project.ref(params.projectId),
            patch: {
              name: "Draft v2",
            },
          },
        ],
      },
      commit: () => Effect.never,
    });

    const machine = flow.machine<{}, SubmitEvent, "editing">({
      id: "flow-test.model.submit-preview",
      initial: "editing",
      context: () => ({}),
      states: {
        editing: {
          on: {
            SAVE: {
              submit: saveDraft,
            },
          },
        },
      },
    });

    const model = test.model(machine);
    const path = model.getShortestPaths()[0]!;
    const harness = model.replay(path);

    expect(path.state.receipts.map((receipt) => receipt.type)).toEqual(
      expect.arrayContaining([
        "machine:transition",
        "transaction:start",
        "transaction:preview-patch",
      ]),
    );
    expect(path.state.resources).toEqual({
      "flow-test.model.submit-preview.project": {
        id: "flow-test.model.submit-preview.project",
        status: "success",
        availability: "value",
        activity: "idle",
        freshness: "fresh",
        value: {
          name: "Draft v2",
        },
        isPlaceholderData: false,
      },
    });
    expect(harness.snapshot().resources).toEqual(path.state.resources);
    expect(harness.receipts().map((receipt) => receipt.type)).toEqual(
      path.state.receipts.map((receipt) => receipt.type),
    );
  });

  it("models serialized submit overlap by queueing the second accepted save without a second preview", () => {
    type SaveEvent = Readonly<{ readonly type: "SAVE"; readonly name: string }>;

    const project = flow.resource<[projectId: string], { readonly name: string }>({
      id: "flow-test.model.submit-serialize.project",
      key: (projectId) => flow.createKey("flow-test.model.submit-serialize.project", projectId),
      lookup: (projectId) => Effect.succeed({ name: `Server ${projectId}` }),
    });

    const saveDraft = flow.transaction({
      id: "flow-test.model.submit-serialize.save",
      concurrency: "serialize" as const,
      params: ({
        context,
      }: {
        readonly context: { readonly draft: { readonly name: string } };
      }) => ({
        projectId: "project-1" as const,
        name: context.draft.name,
      }),
      preview: {
        apply: ({ params }) => [
          {
            ref: project.ref(params.projectId),
            patch: {
              name: params.name,
            },
          },
        ],
      },
      commit: () => Effect.never,
    });

    const machine = flow.machine<{ readonly draft: { readonly name: string } }, SaveEvent, "ready">(
      {
        id: "flow-test.model.submit-serialize",
        initial: "ready",
        context: () => ({
          draft: { name: "Draft v0" },
        }),
        states: {
          ready: {
            on: {
              SAVE: {
                submit: saveDraft,
                update: ({ context, event }) =>
                  event.type === "SAVE"
                    ? {
                        draft: {
                          ...context.draft,
                          name: event.name,
                        },
                      }
                    : {},
              },
            },
          },
        },
      },
    );

    const model = test.model(machine);
    const path = model
      .getSimplePaths({
        events: [
          { type: "SAVE", name: "Draft A" },
          { type: "SAVE", name: "Draft B" },
        ],
        allowDuplicatePaths: true,
      })
      .find(
        (candidate) =>
          candidate.steps.length === 2 &&
          candidate.steps[0]?.event.name === "Draft A" &&
          candidate.steps[1]?.event.name === "Draft B",
      )!;
    const harness = model.replay(path);

    expect(path.state.context).toEqual({
      draft: { name: "Draft B" },
    });
    expect(path.state.resources).toEqual({
      "flow-test.model.submit-serialize.project": {
        id: "flow-test.model.submit-serialize.project",
        status: "success",
        availability: "value",
        activity: "idle",
        freshness: "fresh",
        value: {
          name: "Draft A",
        },
        isPlaceholderData: false,
      },
    });
    expect(path.state.transactions).toEqual({
      "flow-test.model.submit-serialize.save": {
        id: "flow-test.model.submit-serialize.save",
        status: "pending",
      },
    });
    expect(path.state.receipts.map((receipt) => receipt.type)).toEqual(
      expect.arrayContaining([
        "transaction:start",
        "transaction:preview-patch",
        "transaction:queue",
      ]),
    );
    expect(
      path.state.receipts.filter((receipt) => receipt.type === "transaction:preview-patch"),
    ).toHaveLength(1);
    expect(harness.context()).toEqual(path.state.context);
    expect(harness.snapshot().resources).toEqual(path.state.resources);
    expect(harness.snapshot().transactions).toEqual(path.state.transactions);
    expect(harness.receipts().map((receipt) => receipt.type)).toEqual(
      path.state.receipts.map((receipt) => receipt.type),
    );
  });

  it("models serialized submit overflow by rejecting the third accepted save without replacing the active preview", () => {
    type SaveEvent = Readonly<{ readonly type: "SAVE"; readonly name: string }>;

    const project = flow.resource<[projectId: string], { readonly name: string }>({
      id: "flow-test.model.submit-serialize-reject.project",
      key: (projectId) =>
        flow.createKey("flow-test.model.submit-serialize-reject.project", projectId),
      lookup: (projectId) => Effect.succeed({ name: `Server ${projectId}` }),
    });

    const saveDraft = flow.transaction({
      id: "flow-test.model.submit-serialize-reject.save",
      concurrency: "serialize" as const,
      params: ({
        context,
      }: {
        readonly context: { readonly draft: { readonly name: string } };
      }) => ({
        projectId: "project-1" as const,
        name: context.draft.name,
      }),
      preview: {
        apply: ({ params }) => [
          {
            ref: project.ref(params.projectId),
            patch: {
              name: params.name,
            },
          },
        ],
      },
      commit: () => Effect.never,
    });

    const machine = flow.machine<{ readonly draft: { readonly name: string } }, SaveEvent, "ready">(
      {
        id: "flow-test.model.submit-serialize-reject",
        initial: "ready",
        context: () => ({
          draft: { name: "Draft v0" },
        }),
        states: {
          ready: {
            on: {
              SAVE: {
                submit: saveDraft,
                update: ({ context, event }) =>
                  event.type === "SAVE"
                    ? {
                        draft: {
                          ...context.draft,
                          name: event.name,
                        },
                      }
                    : {},
              },
            },
          },
        },
      },
    );

    const model = test.model(machine);
    const path = model
      .getSimplePaths({
        events: [
          { type: "SAVE", name: "Draft A" },
          { type: "SAVE", name: "Draft B" },
          { type: "SAVE", name: "Draft C" },
        ],
        allowDuplicatePaths: true,
      })
      .find(
        (candidate) =>
          candidate.steps.length === 3 &&
          candidate.steps[0]?.event.name === "Draft A" &&
          candidate.steps[1]?.event.name === "Draft B" &&
          candidate.steps[2]?.event.name === "Draft C",
      )!;
    const harness = model.replay(path);

    expect(path.state.context).toEqual({
      draft: { name: "Draft C" },
    });
    expect(path.state.resources).toEqual({
      "flow-test.model.submit-serialize-reject.project": {
        id: "flow-test.model.submit-serialize-reject.project",
        status: "success",
        availability: "value",
        activity: "idle",
        freshness: "fresh",
        value: {
          name: "Draft A",
        },
        isPlaceholderData: false,
      },
    });
    expect(path.state.transactions).toEqual({
      "flow-test.model.submit-serialize-reject.save": {
        id: "flow-test.model.submit-serialize-reject.save",
        status: "pending",
      },
    });
    expect(path.state.receipts.map((receipt) => receipt.type)).toEqual(
      expect.arrayContaining([
        "transaction:start",
        "transaction:preview-patch",
        "transaction:queue",
        "transaction:reject",
      ]),
    );
    expect(
      path.state.receipts.filter((receipt) => receipt.type === "transaction:preview-patch"),
    ).toHaveLength(1);
    expect(
      path.state.receipts.filter((receipt) => receipt.type === "transaction:queue"),
    ).toHaveLength(1);
    expect(path.state.receipts.filter((receipt) => receipt.type === "transaction:reject")).toEqual([
      expect.objectContaining({
        queueKey: "flow-test.model.submit-serialize-reject.save",
        overlapCause: "active-attempt",
        activeAttemptCount: 1,
        queuedAttemptCount: 1,
        queueCapacity: 1,
        parentState: "ready",
      }),
    ]);
    expect(path.issues).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "transaction",
        id: "flow-test.model.submit-serialize-reject.save",
        error: expect.objectContaining({
          code: "FLOW-TXN-004",
          title:
            "Transaction 'flow-test.model.submit-serialize-reject.save' exceeded the serialized queue capacity",
        }),
        facts: expect.objectContaining({
          correlationId: "flow-test.model.submit-serialize-reject:event:3",
          parentState: "ready",
        }),
      }),
    ]);
    expect(harness.context()).toEqual(path.state.context);
    expect(harness.snapshot().resources).toEqual(path.state.resources);
    expect(harness.snapshot().transactions).toEqual(path.state.transactions);
    expect(harness.receipts().map((receipt) => receipt.type)).toEqual(
      path.state.receipts.map((receipt) => receipt.type),
    );
    expect(harness.issues()).toEqual(path.issues);
    expect(harness.issueSummary()).toEqual(path.issueSummary);
  });

  it("models reject-while-running overlap by rejecting the second accepted save without replacing the active preview", () => {
    type SaveEvent = Readonly<{ readonly type: "SAVE"; readonly name: string }>;

    const project = flow.resource<[projectId: string], { readonly name: string }>({
      id: "flow-test.model.submit-reject.project",
      key: (projectId) => flow.createKey("flow-test.model.submit-reject.project", projectId),
      lookup: (projectId) => Effect.succeed({ name: `Server ${projectId}` }),
    });

    const saveDraft = flow.transaction({
      id: "flow-test.model.submit-reject.save",
      params: ({
        context,
      }: {
        readonly context: { readonly draft: { readonly name: string } };
      }) => ({
        projectId: "project-1" as const,
        name: context.draft.name,
      }),
      preview: {
        apply: ({ params }) => [
          {
            ref: project.ref(params.projectId),
            patch: {
              name: params.name,
            },
          },
        ],
      },
      commit: () => Effect.never,
    });

    const machine = flow.machine<{ readonly draft: { readonly name: string } }, SaveEvent, "ready">(
      {
        id: "flow-test.model.submit-reject",
        initial: "ready",
        context: () => ({
          draft: { name: "Draft v0" },
        }),
        states: {
          ready: {
            on: {
              SAVE: {
                submit: saveDraft,
                update: ({ context, event }) =>
                  event.type === "SAVE"
                    ? {
                        draft: {
                          ...context.draft,
                          name: event.name,
                        },
                      }
                    : {},
              },
            },
          },
        },
      },
    );

    const model = test.model(machine);
    const path = model
      .getSimplePaths({
        events: [
          { type: "SAVE", name: "Draft A" },
          { type: "SAVE", name: "Draft B" },
        ],
        allowDuplicatePaths: true,
      })
      .find(
        (candidate) =>
          candidate.steps.length === 2 &&
          candidate.steps[0]?.event.name === "Draft A" &&
          candidate.steps[1]?.event.name === "Draft B",
      )!;
    const harness = model.replay(path);

    expect(path.state.context).toEqual({
      draft: { name: "Draft B" },
    });
    expect(path.state.resources).toEqual({
      "flow-test.model.submit-reject.project": {
        id: "flow-test.model.submit-reject.project",
        status: "success",
        availability: "value",
        activity: "idle",
        freshness: "fresh",
        value: {
          name: "Draft A",
        },
        isPlaceholderData: false,
      },
    });
    expect(path.state.transactions).toEqual({
      "flow-test.model.submit-reject.save": {
        id: "flow-test.model.submit-reject.save",
        status: "pending",
      },
    });
    expect(path.state.receipts.map((receipt) => receipt.type)).toEqual(
      expect.arrayContaining([
        "transaction:start",
        "transaction:preview-patch",
        "transaction:reject",
      ]),
    );
    expect(
      path.state.receipts.filter((receipt) => receipt.type === "transaction:preview-patch"),
    ).toHaveLength(1);
    expect(path.state.receipts.filter((receipt) => receipt.type === "transaction:reject")).toEqual([
      expect.objectContaining({
        queueKey: "flow-test.model.submit-reject.save",
        overlapCause: "reject-while-running",
        activeAttemptCount: 1,
        parentState: "ready",
      }),
    ]);
    expect(path.issues).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "transaction",
        id: "flow-test.model.submit-reject.save",
        error: expect.objectContaining({
          code: "FLOW-TXN-001",
          title:
            "Transaction 'flow-test.model.submit-reject.save' was rejected while another attempt was running",
        }),
        facts: expect.objectContaining({
          correlationId: "flow-test.model.submit-reject:event:2",
          parentState: "ready",
        }),
      }),
    ]);
    expect(harness.context()).toEqual(path.state.context);
    expect(harness.snapshot().resources).toEqual(path.state.resources);
    expect(harness.snapshot().transactions).toEqual(path.state.transactions);
    expect(harness.receipts().map((receipt) => receipt.type)).toEqual(
      path.state.receipts.map((receipt) => receipt.type),
    );
    expect(harness.issues()).toEqual(path.issues);
    expect(harness.issueSummary()).toEqual(path.issueSummary);
  });
});
