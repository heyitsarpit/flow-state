import { Context, Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { createKey, createTag } from "./public/keys.js";
import type { FlowConcurrencyPolicy } from "./public/types.js";
import { flow, flowTest } from "./index.js";

interface ProjectRecord {
  readonly id: string;
  readonly name: string;
}

interface SaveParams {
  readonly id: string;
  readonly draft: ProjectRecord;
}

class SaveProjectApi extends Context.Service<
  SaveProjectApi,
  {
    readonly save: (params: SaveParams) => Effect.Effect<ProjectRecord, "conflict">;
  }
>()("test/SaveProjectApi") {}

type SaveEvent =
  | Readonly<{ readonly type: "SAVE" }>
  | Readonly<{ readonly type: "SAVED"; readonly project: ProjectRecord }>
  | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>;

interface SaveContext {
  readonly projectId: string;
  readonly draft: ProjectRecord;
  readonly savedAt: number | null;
  readonly error: "conflict" | null;
  readonly savedProject: ProjectRecord | null;
}

const projectResource = flow.resource<[projectId: string], ProjectRecord>({
  id: "transactions.project",
  key: (projectId) => createKey("transactions", projectId),
  lookup: (projectId) => Effect.succeed({ id: projectId, name: "Loaded" }),
  tags: () => [projectTag],
});
const projectTag = createTag("transactions.project.tag");

function createSaveProjectTransaction<const Id extends string>(
  id: Id,
  concurrency: FlowConcurrencyPolicy,
) {
  return flow.transaction<SaveParams, ProjectRecord, "conflict", SaveProjectApi, SaveEvent>({
    id,
    params: ({ context }: { readonly context: SaveContext }) => ({
      id: context.projectId,
      draft: context.draft,
    }),
    preview: {
      apply: ({ params }) => [
        {
          ref: projectResource.ref(params.id),
          replace: params.draft,
        },
      ],
    },
    commit: (params) =>
      Effect.flatMap(SaveProjectApi, (api) =>
        api.save({
          id: params.id,
          draft: params.draft,
        }),
      ),
    invalidates: ({ params }) => [projectResource.ref(params.id)],
    routes: flow.outcomes<ProjectRecord, "conflict", SaveEvent>({
      success: ({ value }) => ({
        type: "SAVED",
        project: value,
      }),
      failure: ["SAVE_FAILED", "error"],
    }),
    concurrency,
  });
}

const saveProjectTransaction = createSaveProjectTransaction(
  "transactions.save",
  "reject-while-running",
);

const serializedSaveProjectTransaction = createSaveProjectTransaction(
  "transactions.save-serial",
  "serialize",
);

const cancelPreviousSaveProjectTransaction = createSaveProjectTransaction(
  "transactions.save-cancel",
  "cancel-previous",
);

const submitMachine = flow.machine<
  SaveContext,
  SaveEvent,
  "ready" | "saving" | "done" | "failed",
  "ready"
>({
  id: "transactions.submit-machine",
  initial: "ready",
  context: () => ({
    projectId: "project-1",
    draft: { id: "project-1", name: "Draft v2" },
    savedAt: null,
    error: null,
    savedProject: null,
  }),
  states: {
    ready: {
      on: {
        SAVE: {
          target: "saving",
          submit: saveProjectTransaction,
        },
      },
    },
    saving: {
      on: {
        SAVED: {
          target: "done",
          update: ({ event, runtime }) =>
            event.type === "SAVED"
              ? {
                  draft: event.project,
                  savedAt: runtime.now(),
                  error: null,
                  savedProject: event.project,
                }
              : {},
        },
        SAVE_FAILED: {
          target: "failed",
          update: ({ event }) =>
            event.type === "SAVE_FAILED"
              ? {
                  error: event.error,
                }
              : {},
        },
      },
    },
    done: {},
    failed: {},
  },
});

type SerialSaveEvent =
  | Readonly<{ readonly type: "SAVE"; readonly name: string }>
  | Readonly<{ readonly type: "SAVED"; readonly project: ProjectRecord }>
  | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>;

interface SerialSaveContext {
  readonly projectId: string;
  readonly draft: ProjectRecord;
  readonly savedNames: readonly string[];
  readonly error: "conflict" | null;
}

const serializeMachine = flow.machine<SerialSaveContext, SerialSaveEvent, "ready", "ready">({
  id: "transactions.serialize-machine",
  initial: "ready",
  context: () => ({
    projectId: "project-1",
    draft: { id: "project-1", name: "Draft v1" },
    savedNames: [],
    error: null,
  }),
  states: {
    ready: {
      on: {
        SAVE: {
          submit: serializedSaveProjectTransaction,
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
        SAVED: {
          update: ({ context, event }) =>
            event.type === "SAVED"
              ? {
                  savedNames: [...context.savedNames, event.project.name],
                  error: null,
                }
              : {},
        },
        SAVE_FAILED: {
          update: ({ event }) =>
            event.type === "SAVE_FAILED"
              ? {
                  error: event.error,
                }
              : {},
        },
      },
    },
  },
});

const cancelMachine = flow.machine<SerialSaveContext, SerialSaveEvent, "ready", "ready">({
  id: "transactions.cancel-machine",
  initial: "ready",
  context: () => ({
    projectId: "project-1",
    draft: { id: "project-1", name: "Draft v1" },
    savedNames: [],
    error: null,
  }),
  states: {
    ready: {
      on: {
        SAVE: {
          submit: cancelPreviousSaveProjectTransaction,
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
        SAVED: {
          update: ({ context, event }) =>
            event.type === "SAVED"
              ? {
                  savedNames: [...context.savedNames, event.project.name],
                  error: null,
                }
              : {},
        },
        SAVE_FAILED: {
          update: ({ event }) =>
            event.type === "SAVE_FAILED"
              ? {
                  error: event.error,
                }
              : {},
        },
      },
    },
  },
});

const runMachine = flow.machine<SaveContext, SaveEvent, "idle" | "saving" | "done", "idle">({
  id: "transactions.run-machine",
  initial: "idle",
  context: () => ({
    projectId: "project-1",
    draft: { id: "project-1", name: "Runtime save" },
    savedAt: null,
    error: null,
    savedProject: null,
  }),
  states: {
    idle: {
      on: {
        SAVE: "saving",
      },
    },
    saving: {
      invoke: flow.run(saveProjectTransaction),
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

const testApp = flow.app({
  modules: [
    flow.module("Transactions", () => ({
      project: projectResource,
    })),
  ],
});

const seededProject = {
  ref: projectResource.ref("project-1"),
  value: { id: "project-1", name: "Seeded v1" },
} as const;

function createControlledSaveLayer() {
  const calls: SaveParams[] = [];
  const completions: Array<{
    readonly succeed: (value: ProjectRecord) => void;
    readonly fail: (error: "conflict") => void;
  }> = [];

  const layer = Layer.succeed(
    SaveProjectApi,
    SaveProjectApi.of({
      save: (params) =>
        Effect.promise<ProjectRecord>(
          () =>
            new Promise((resolve, reject) => {
              calls.push(params);
              completions.push({
                succeed: resolve,
                fail: reject,
              });
            }),
        ).pipe(Effect.mapError(() => "conflict" as const)),
    }),
  );

  const shiftCompletion = () => {
    const completion = completions.shift();
    expect(completion).toBeDefined();
    return completion!;
  };

  const completionAt = (index: number) => {
    const completion = completions[index];
    expect(completion).toBeDefined();
    return completion!;
  };

  return {
    layer,
    calls,
    succeedNext: (value: ProjectRecord) => shiftCompletion().succeed(value),
    failNext: (error: "conflict") => shiftCompletion().fail(error),
    succeedAt: (index: number, value: ProjectRecord) => completionAt(index).succeed(value),
  };
}

describe("transactions", () => {
  it("runs submit transactions through flowTest with preview, route success, and runtime.now()", async () => {
    const successLayer = Layer.succeed(
      SaveProjectApi,
      SaveProjectApi.of({
        save: (params) =>
          Effect.succeed({
            id: params.id,
            name: params.draft.name,
          }),
      }),
    );

    const harness = flowTest
      .app(testApp)
      .seedResources([seededProject])
      .start(submitMachine)
      .provide(successLayer)
      .clock(() => 42_000)
      .send({ type: "SAVE" });

    expect(harness.state()).toBe("saving");
    expect(harness.cache().query("transactions.project")).toMatchObject({
      value: { id: "project-1", name: "Draft v2" },
    });
    expect(harness.transactions().previewPatches("transactions.save")).toHaveLength(1);

    await harness.flush();

    expect(harness.state()).toBe("done");
    expect(harness.context()).toMatchObject({
      savedAt: 42_000,
      error: null,
      savedProject: { id: "project-1", name: "Draft v2" },
    });
    expect(harness.cache().query("transactions.project")).toMatchObject({
      status: "stale",
      freshness: "invalidated",
      invalidatedAt: 42_000,
    });
    expect(harness.snapshot().receipts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "resource:invalidate",
          id: "transactions.project",
          count: 1,
        }),
      ]),
    );
    expect(harness.transactions().get("transactions.save")).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft v2" },
    });
  });

  it("rolls back preview patches on typed transaction failure in flowTest", async () => {
    const conflictLayer = Layer.succeed(
      SaveProjectApi,
      SaveProjectApi.of({
        save: () => Effect.fail("conflict" as const),
      }),
    );

    const harness = flowTest
      .app(testApp)
      .seedResources([seededProject])
      .start(submitMachine)
      .provide(conflictLayer)
      .send({ type: "SAVE" });

    expect(harness.state()).toBe("saving");
    expect(harness.cache().query("transactions.project")).toMatchObject({
      value: { id: "project-1", name: "Draft v2" },
    });
    expect(harness.transactions().previewPatches("transactions.save")).toHaveLength(1);

    await harness.flush();

    expect(harness.state()).toBe("failed");
    expect(harness.cache().query("transactions.project")).toMatchObject({
      value: { id: "project-1", name: "Seeded v1" },
    });
    expect(harness.transactions().rollbacks("transactions.save")).toHaveLength(1);
    expect(harness.issues()).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "transaction",
        id: "transactions.save",
        error: "conflict",
        handled: true,
      }),
    ]);
  });

  it("runs state-owned flow.run transactions through runtime actors", async () => {
    const successLayer = Layer.succeed(
      SaveProjectApi,
      SaveProjectApi.of({
        save: (params) =>
          Effect.succeed({
            id: params.id,
            name: params.draft.name,
          }),
      }),
    );
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test({ namespace: "transactions-runtime" }),
        orchestrators: flow.orchestrators.test({ deterministic: true }),
        services: [successLayer],
      }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.createActor(runMachine);
    actor.send({ type: "SAVE" });

    expect(actor.snapshot().value).toBe("saving");
    expect(actor.snapshot().transactions["transactions.save"]).toMatchObject({
      status: "pending",
    });
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().value).toBe("done");
    expect(actor.snapshot().transactions["transactions.save"]).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Runtime save" },
    });
    expect(actor.snapshot().context.savedProject).toEqual({
      id: "project-1",
      name: "Runtime save",
    });
    expect(actor.receipts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "transaction:start", id: "transactions.save" }),
        expect.objectContaining({ type: "transaction:success", id: "transactions.save" }),
      ]),
    );

    await actor.dispose();
    await runtime.dispose();
  });

  it("serializes repeated submit transactions in flowTest by transaction id", async () => {
    const controlled = createControlledSaveLayer();

    const harness = flowTest
      .app(testApp)
      .seedResources([seededProject])
      .start(serializeMachine)
      .provide(controlled.layer)
      .send({ type: "SAVE", name: "Draft A" })
      .send({ type: "SAVE", name: "Draft B" });

    expect(controlled.calls.map((params) => params.draft.name)).toEqual(["Draft A"]);
    expect(harness.transactions().get("transactions.save-serial")).toMatchObject({
      status: "pending",
    });
    expect(harness.transactions().queued("transactions.save-serial")).toHaveLength(1);

    controlled.succeedNext({ id: "project-1", name: "Draft A" });
    await harness.flush();
    await harness.flush();

    expect(controlled.calls.map((params) => params.draft.name)).toEqual(["Draft A", "Draft B"]);
    expect(harness.context()).toMatchObject({
      savedNames: ["Draft A"],
    });
    expect(
      harness
        .transactions()
        .events("transactions.save-serial")
        .map((receipt) => receipt.type),
    ).toEqual(
      expect.arrayContaining([
        "transaction:queue",
        "transaction:dequeue",
        "transaction:start",
        "transaction:success",
      ]),
    );
    expect(harness.transactions().get("transactions.save-serial")).toMatchObject({
      status: "pending",
    });

    controlled.succeedNext({ id: "project-1", name: "Draft B" });
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedNames: ["Draft A", "Draft B"],
      error: null,
    });
    expect(harness.transactions().get("transactions.save-serial")).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });
  });

  it("serializes repeated submit transactions in runtime actors by transaction id", async () => {
    const controlled = createControlledSaveLayer();
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test({ namespace: "transactions-serialize-runtime" }),
        orchestrators: flow.orchestrators.test({ deterministic: true }),
        services: [controlled.layer],
      }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.createActor(serializeMachine);
    actor.send({ type: "SAVE", name: "Draft A" });
    actor.send({ type: "SAVE", name: "Draft B" });

    expect(controlled.calls.map((params) => params.draft.name)).toEqual(["Draft A"]);
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.id === "transactions.save-serial")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:start", "transaction:queue"]));

    controlled.succeedNext({ id: "project-1", name: "Draft A" });
    await actor.flush();
    await actor.flush();

    expect(controlled.calls.map((params) => params.draft.name)).toEqual(["Draft A", "Draft B"]);
    expect(actor.snapshot().context.savedNames).toEqual(["Draft A"]);
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.id === "transactions.save-serial")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:dequeue", "transaction:start"]));

    controlled.succeedNext({ id: "project-1", name: "Draft B" });
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context.savedNames).toEqual(["Draft A", "Draft B"]);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });

    await actor.dispose();
    await runtime.dispose();
  });

  it("cancels the active submit transaction before restarting in flowTest", async () => {
    const controlled = createControlledSaveLayer();

    const harness = flowTest
      .app(testApp)
      .seedResources([seededProject])
      .start(cancelMachine)
      .provide(controlled.layer)
      .send({ type: "SAVE", name: "Draft A" })
      .send({ type: "SAVE", name: "Draft B" });

    expect(controlled.calls.map((params) => params.draft.name)).toEqual(["Draft A", "Draft B"]);
    expect(harness.cache().query("transactions.project")).toMatchObject({
      value: { id: "project-1", name: "Draft B" },
    });
    expect(harness.transactions().previewPatches("transactions.save-cancel")).toHaveLength(2);
    expect(harness.transactions().rollbacks("transactions.save-cancel")).toHaveLength(1);
    expect(harness.transactions().get("transactions.save-cancel")).toMatchObject({
      status: "pending",
    });

    const eventTypes = harness
      .transactions()
      .events("transactions.save-cancel")
      .map((receipt) => receipt.type);
    expect(eventTypes.filter((type) => type === "transaction:start")).toHaveLength(2);
    expect(eventTypes.filter((type) => type === "transaction:interrupt")).toHaveLength(1);

    controlled.succeedAt(1, { id: "project-1", name: "Draft B" });
    await harness.flush();
    await harness.flush();

    controlled.succeedAt(0, { id: "project-1", name: "Draft A" });
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedNames: ["Draft B"],
      error: null,
    });
    expect(harness.transactions().get("transactions.save-cancel")).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });
    expect(
      harness
        .transactions()
        .events("transactions.save-cancel")
        .filter((receipt) => receipt.type === "transaction:success"),
    ).toHaveLength(1);
    expect(harness.issues()).toEqual([]);
  });

  it("cancels the active runtime transaction before restarting with the latest params", async () => {
    const controlled = createControlledSaveLayer();
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test({ namespace: "transactions-cancel-runtime" }),
        orchestrators: flow.orchestrators.test({ deterministic: true }),
        services: [controlled.layer],
      }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.createActor(cancelMachine);
    actor.send({ type: "SAVE", name: "Draft A" });
    actor.send({ type: "SAVE", name: "Draft B" });

    expect(controlled.calls.map((params) => params.draft.name)).toEqual(["Draft A", "Draft B"]);
    expect(actor.snapshot().resources["transactions.project"]).toMatchObject({
      value: { id: "project-1", name: "Draft B" },
    });

    const initialEventTypes = actor
      .receipts()
      .filter((receipt) => receipt.id === "transactions.save-cancel")
      .map((receipt) => receipt.type);
    expect(initialEventTypes.filter((type) => type === "transaction:start")).toHaveLength(2);
    expect(initialEventTypes.filter((type) => type === "transaction:interrupt")).toHaveLength(1);
    expect(initialEventTypes.filter((type) => type === "transaction:rollback")).toHaveLength(1);
    expect(actor.snapshot().transactions["transactions.save-cancel"]).toMatchObject({
      status: "pending",
    });

    controlled.succeedAt(1, { id: "project-1", name: "Draft B" });
    await actor.flush();
    await actor.flush();

    controlled.succeedAt(0, { id: "project-1", name: "Draft A" });
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context.savedNames).toEqual(["Draft B"]);
    expect(actor.snapshot().transactions["transactions.save-cancel"]).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-cancel" && receipt.type === "transaction:success",
        ),
    ).toHaveLength(1);
    expect(actor.issues()).toEqual([]);

    await actor.dispose();
    await runtime.dispose();
  });
});
