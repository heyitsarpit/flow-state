import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { createControlledEffect, createKey, flow, flowTest } from "./index";
import type { FlowEvent, FlowQueryConfig } from "./index";

describe("resource transactions", () => {
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
});
