import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { createControlledEffect, createKey, flow, flowTest } from "./index";
import type { FlowEvent, FlowQueryConfig } from "./index";

describe("resource transactions", () => {
  it("runs target flow.transaction configs with params, commit, preview, and invalidation", async () => {
    type SaveEvent =
      | ({ readonly type: "SAVE" } & FlowEvent)
      | ({ readonly type: "SAVED"; readonly project: { readonly name: string } } & FlowEvent);
    interface SaveContext {
      readonly draft: string;
    }
    const projectRef = flow.resource<[string], { readonly name: string }>({
      id: "project.byId",
      key: (id) => createKey("project", id),
      lookup: () => Effect.succeed({ name: "Atlas" }),
    });
    const projectTag = { kind: "tag" as const, name: "project" };
    const save = createControlledEffect<{ readonly name: string }, string>("transaction-save");
    const transaction = flow.transaction({
      id: "project.save",
      params: ({ context }: { readonly context: SaveContext }) => ({ name: context.draft }),
      commit: (params: { readonly name: string }) => save.effect().pipe(Effect.as(params)),
      preview: {
        apply: ({ params }: { readonly params: { readonly name: string } }) => [
          {
            ref: projectRef.ref("launch-1"),
            replace: { name: params.name },
          },
        ],
      },
      invalidates: ({ result }: { readonly result: { readonly name: string } }) =>
        result.name === "Atlas v2" ? [projectTag] : [],
      routes: flow.outcomes<{ readonly name: string }, string, SaveEvent>({
        success: ({ value }) => ({ type: "SAVED", project: value }),
      }),
      concurrency: "reject-while-running" as const,
    });
    const machine = flow.machine<SaveContext, SaveEvent, "editing" | "saving" | "saved">({
      id: "transaction-target-api",
      initial: "editing",
      context: () => ({ draft: "Atlas v2" }),
      states: {
        editing: {
          on: {
            SAVE: { target: "saving", submit: transaction },
          },
        },
        saving: {
          on: {
            SAVED: "saved",
          },
        },
        saved: {},
      },
    });

    const harness = flowTest
      .app(flow.app({ modules: [flow.module("Project", () => ({ projectRef, transaction }))] }))
      .seedResource(projectRef.ref("launch-1"), { name: "Atlas" })
      .start(machine)
      .send({ type: "SAVE" });

    expect(transaction.kind).toBe("mutation");
    expect(harness.cache().get(createKey("project", "launch-1"))).toMatchObject({
      value: { name: "Atlas v2" },
    });
    expect(harness.transactions().previewPatches("project.save")).toHaveLength(1);

    save.succeed({ name: "server value is ignored by commit wrapper" });
    await harness.flush();

    expect(harness.state()).toBe("saved");
    expect(harness.cache().invalidations(projectTag)).toEqual([
      expect.objectContaining({
        type: "cache:invalidate",
        id: "project.save",
        target: "tag:project",
      }),
    ]);
  });

  it("rolls back only resources touched by a preview mutation", async () => {
    type SaveEvent =
      | ({ readonly type: "SAVE" } & FlowEvent)
      | ({ readonly type: "SAVE_FAILED"; readonly error: string } & FlowEvent);
    interface SaveContext {
      readonly draft: string;
    }
    const projectRef = flow.resource<[string], { readonly name: string }>({
      id: "project.byId",
      key: (id) => createKey("project", id),
      lookup: () => Effect.succeed({ name: "Atlas" }),
    });
    const statsRef = flow.resource<[string], { readonly count: number }>({
      id: "stats.byId",
      key: (id) => createKey("stats", id),
      lookup: () => Effect.succeed({ count: 1 }),
    });
    const statsKey = createKey("stats", "main");
    const statsQuery = flow.query<
      FlowQueryConfig<SaveContext, SaveEvent, { readonly count: number }, never>
    >({
      id: statsKey.hash,
      key: () => statsKey,
      effect: () => Effect.succeed({ count: 2 }),
    });
    const save = createControlledEffect<{ readonly ok: true }, string>("save-project");
    const mutation = flow.mutation({
      id: "project.save",
      input: ({ context }: { readonly context: SaveContext }) => ({ name: context.draft }),
      effect: () => save.effect(),
      preview: {
        apply: ({ input }: { readonly input: { readonly name: string } }) => [
          {
            ref: projectRef.ref("launch-1"),
            replace: { name: input.name },
          },
        ],
      },
      routes: flow.outcomes<{ readonly ok: true }, string, SaveEvent>({
        failure: ["SAVE_FAILED", "error"],
      }),
    });
    const machine = flow.machine<SaveContext, SaveEvent, "editing" | "saving">({
      id: "preview-save-scoped-rollback",
      initial: "editing",
      context: () => ({ draft: "Atlas v2" }),
      states: {
        editing: {
          on: {
            SAVE: { target: "saving", submit: mutation },
          },
        },
        saving: {
          invoke: statsQuery,
          on: {
            SAVE_FAILED: "editing",
          },
        },
      },
    });

    const harness = flowTest
      .app(
        flow.app({ modules: [flow.module("Project", () => ({ projectRef, statsRef, mutation }))] }),
      )
      .seedResource(projectRef.ref("launch-1"), { name: "Atlas" })
      .seedResource(statsRef.ref("main"), { count: 1 })
      .start(machine)
      .send({ type: "SAVE" });

    await harness.flush();
    expect(harness.cache().get(createKey("stats", "main"))).toMatchObject({
      value: { count: 2 },
    });

    save.fail("conflict");
    await harness.flush();

    expect(harness.cache().get(createKey("project", "launch-1"))).toMatchObject({
      value: { name: "Atlas" },
    });
    expect(harness.cache().get(createKey("stats", "main"))).toMatchObject({
      value: { count: 2 },
    });
  });

  it("does not let overlapping preview failures resurrect stale preview values", async () => {
    type SaveEvent = ({ readonly type: "SAVE"; readonly name: string } & FlowEvent) | FlowEvent;
    interface SaveContext {
      readonly projectId: string;
    }
    const projectRef = flow.resource<[string], { readonly name: string }>({
      id: "project.byId",
      key: (id) => createKey("project", id),
      lookup: () => Effect.succeed({ name: "Atlas" }),
    });
    const save = createControlledEffect<{ readonly ok: true }, string>("save-project");
    const mutation = flow.mutation({
      id: "project.save",
      input: ({ context, event }: { readonly context: SaveContext; readonly event: SaveEvent }) =>
        event.type === "SAVE" ? { id: context.projectId, name: event.name } : null,
      effect: () => save.effect(),
      concurrency: "allow" as const,
      preview: {
        apply: ({ input }: { readonly input: { readonly id: string; readonly name: string } }) => [
          {
            ref: projectRef.ref(input.id),
            replace: { name: input.name },
          },
        ],
      },
    });
    const machine = flow.machine<SaveContext, SaveEvent, "editing">({
      id: "preview-overlap",
      initial: "editing",
      context: () => ({ projectId: "launch-1" }),
      states: {
        editing: {
          on: {
            SAVE: { target: "editing", submit: mutation },
          },
        },
      },
    });

    const harness = flowTest
      .app(flow.app({ modules: [flow.module("Project", () => ({ projectRef, mutation }))] }))
      .seedResource(projectRef.ref("launch-1"), { name: "Atlas" })
      .start(machine)
      .send({ type: "SAVE", name: "Atlas v2" })
      .send({ type: "SAVE", name: "Atlas v3" });

    expect(harness.cache().get(createKey("project", "launch-1"))).toMatchObject({
      value: { name: "Atlas v3" },
    });

    save.fail("first-conflict");
    await harness.flush();
    expect(harness.cache().get(createKey("project", "launch-1"))).toMatchObject({
      value: { name: "Atlas v3" },
    });

    save.fail("second-conflict");
    await harness.flush();
    expect(harness.cache().get(createKey("project", "launch-1"))).toMatchObject({
      value: { name: "Atlas" },
    });
  });

  it("queues transaction previews, rolls back queued work, and replays commits in order", async () => {
    type SaveEvent =
      | ({ readonly type: "SAVE"; readonly name: string } & FlowEvent)
      | ({ readonly type: "UNDO" } & FlowEvent)
      | ({ readonly type: "REPLAY" } & FlowEvent);
    interface SaveContext {
      readonly projectId: string;
      readonly offline: boolean;
    }
    const committed: string[] = [];
    const projectRef = flow.resource<[string], { readonly name: string }>({
      id: "project.byId",
      key: (id) => createKey("project", id),
      lookup: () => Effect.succeed({ name: "Atlas" }),
    });
    const transaction = flow.transaction({
      id: "project.save",
      params: ({
        context,
        event,
      }: {
        readonly context: SaveContext;
        readonly event: SaveEvent | null;
      }) =>
        event?.type === "SAVE" && typeof event.name === "string"
          ? { id: context.projectId, name: event.name }
          : null,
      commit: (params: { readonly name: string }) =>
        Effect.sync(() => {
          committed.push(params.name);
          return { ok: true as const };
        }),
      queue: {
        when: ({ context }: { readonly context: SaveContext }) => context.offline,
        undo: ({ event }: { readonly event: SaveEvent | null }) => event?.type === "UNDO",
        replay: ({ event }: { readonly event: SaveEvent | null }) => event?.type === "REPLAY",
      },
      preview: {
        apply: ({
          params,
        }: {
          readonly params: { readonly id: string; readonly name: string };
        }) => [
          {
            ref: projectRef.ref(params.id),
            replace: { name: params.name },
          },
        ],
      },
    });
    const machine = flow.machine<SaveContext, SaveEvent, "editing">({
      id: "queued-transaction",
      initial: "editing",
      context: () => ({ projectId: "launch-1", offline: true }),
      states: {
        editing: {
          on: {
            SAVE: { target: "editing", submit: transaction },
            UNDO: { target: "editing", submit: transaction },
            REPLAY: { target: "editing", submit: transaction },
          },
        },
      },
    });

    const harness = flowTest
      .app(flow.app({ modules: [flow.module("Project", () => ({ projectRef, transaction }))] }))
      .seedResource(projectRef.ref("launch-1"), { name: "Atlas" })
      .start(machine)
      .send({ type: "SAVE", name: "Offline Atlas" });

    expect(committed).toEqual([]);
    expect(harness.cache().get(createKey("project", "launch-1"))).toMatchObject({
      value: { name: "Offline Atlas" },
    });
    expect(harness.transactions().queued("project.save")).toHaveLength(1);

    harness.send({ type: "UNDO" });
    expect(harness.cache().get(createKey("project", "launch-1"))).toMatchObject({
      value: { name: "Atlas" },
    });
    expect(harness.transactions().queued("project.save")).toHaveLength(0);
    expect(harness.transactions().rollbacks("project.save")).toHaveLength(1);

    harness.send({ type: "SAVE", name: "Queued Atlas 1" }).send({
      type: "SAVE",
      name: "Queued Atlas 2",
    });
    expect(harness.transactions().queued("project.save")).toHaveLength(2);

    harness.send({ type: "REPLAY" });
    await harness.flush();

    expect(committed).toEqual(["Queued Atlas 1", "Queued Atlas 2"]);
    expect(harness.transactions().queued("project.save")).toHaveLength(0);
    expect(
      harness
        .transactions()
        .events("project.save")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["mutation:dequeue", "mutation:success"]));
  });

  it("serializes overlapping transaction commits in submission order", async () => {
    type SaveEvent = ({ readonly type: "SAVE"; readonly name: string } & FlowEvent) | FlowEvent;
    interface SaveContext {
      readonly projectId: string;
    }
    const committed: string[] = [];
    const save = createControlledEffect<{ readonly ok: true }, string>("serialize-save");
    const transaction = flow.transaction({
      id: "project.serialize-save",
      params: ({
        context,
        event,
      }: {
        readonly context: SaveContext;
        readonly event: SaveEvent | null;
      }) =>
        event?.type === "SAVE" && typeof event.name === "string"
          ? { id: context.projectId, name: event.name }
          : null,
      commit: (params: { readonly name: string }) =>
        Effect.gen(function* () {
          committed.push(params.name);
          return yield* save.effect();
        }),
      concurrency: "serialize" as const,
    });
    const machine = flow.machine<SaveContext, SaveEvent, "editing">({
      id: "serialized-transactions",
      initial: "editing",
      context: () => ({ projectId: "launch-1" }),
      states: {
        editing: {
          on: {
            SAVE: { target: "editing", submit: transaction },
          },
        },
      },
    });
    const harness = flowTest(machine)
      .send({ type: "SAVE", name: "Atlas v2" })
      .send({ type: "SAVE", name: "Atlas v3" });

    expect(save.attempts()).toBe(1);
    expect(committed).toEqual(["Atlas v2"]);
    expect(harness.transactions().queued("project.serialize-save")).toHaveLength(1);

    save.succeed({ ok: true });
    await harness.flush();

    expect(save.attempts()).toBe(2);
    expect(committed).toEqual(["Atlas v2", "Atlas v3"]);
    expect(
      harness
        .transactions()
        .events("project.serialize-save")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["mutation:queue", "mutation:dequeue"]));
  });

  it("cancels previous transaction work and keeps only the latest outcome", async () => {
    type SaveEvent = ({ readonly type: "SAVE"; readonly name: string } & FlowEvent) | FlowEvent;
    interface SaveContext {
      readonly projectId: string;
    }
    const committed: string[] = [];
    const projectRef = flow.resource<[string], { readonly name: string }>({
      id: "project.byId",
      key: (id) => createKey("project", id),
      lookup: () => Effect.succeed({ name: "Atlas" }),
    });
    const save = createControlledEffect<{ readonly name: string }, string>("cancel-previous-save");
    const transaction = flow.transaction({
      id: "project.cancel-save",
      params: ({
        context,
        event,
      }: {
        readonly context: SaveContext;
        readonly event: SaveEvent | null;
      }) =>
        event?.type === "SAVE" && typeof event.name === "string"
          ? { id: context.projectId, name: event.name }
          : null,
      commit: (params: { readonly name: string }) =>
        Effect.gen(function* () {
          committed.push(params.name);
          return yield* save.effect();
        }),
      preview: {
        apply: ({
          params,
        }: {
          readonly params: { readonly id: string; readonly name: string };
        }) => [
          {
            ref: projectRef.ref(params.id),
            replace: { name: params.name },
          },
        ],
      },
      concurrency: "cancel-previous" as const,
    });
    const machine = flow.machine<SaveContext, SaveEvent, "editing">({
      id: "cancel-previous-transaction",
      initial: "editing",
      context: () => ({ projectId: "launch-1" }),
      states: {
        editing: {
          on: {
            SAVE: { target: "editing", submit: transaction },
          },
        },
      },
    });
    const harness = flowTest
      .app(flow.app({ modules: [flow.module("Project", () => ({ projectRef, transaction }))] }))
      .seedResource(projectRef.ref("launch-1"), { name: "Atlas" })
      .start(machine)
      .send({ type: "SAVE", name: "Atlas v2" })
      .send({ type: "SAVE", name: "Atlas v3" });

    expect(save.attempts()).toBe(2);
    expect(committed).toEqual(["Atlas v2", "Atlas v3"]);
    expect(harness.cache().get(createKey("project", "launch-1"))).toMatchObject({
      value: { name: "Atlas v3" },
    });

    save.succeed({ name: "stale Atlas v2" });
    await harness.flush();

    expect(harness.transactions().events("project.cancel-save")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "mutation:interrupt", id: "project.cancel-save" }),
      ]),
    );
    expect(harness.cache().get(createKey("project", "launch-1"))).toMatchObject({
      value: { name: "Atlas v3" },
    });

    save.succeed({ name: "Atlas v3" });
    await harness.flush();

    expect(harness.transactions().events("project.cancel-save")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "mutation:success", id: "project.cancel-save" }),
      ]),
    );
    expect(harness.transactions().events("project.cancel-save")).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "mutation:success",
          value: { name: "stale Atlas v2" },
        }),
      ]),
    );
  });
});
