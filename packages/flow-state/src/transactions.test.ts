import { Context, Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { FlowDiagnostic } from "./shared/diagnostics.js";
import { createKey, createTag } from "./core/api/keys.js";
import type {
  FlowConcurrencyPolicy,
  FlowEvent,
  FlowMachine,
  FlowPreviewPatch,
  FlowTestHarness,
} from "./core/api/types.js";
import * as flow from "./index.js";
import { createRuntime } from "./runtime/contract-runtime.js";
import { flowTest, test } from "./testing.js";

interface ProjectRecord {
  readonly id: string;
  readonly name: string;
}

interface ProjectSummaryRecord {
  readonly id: string;
  readonly summary: string;
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

const projectSummaryResource = flow.resource<[projectId: string], ProjectSummaryRecord>({
  id: "transactions.project-summary",
  key: (projectId) => createKey("transactions.summary", projectId),
  lookup: (projectId) =>
    Effect.succeed({
      id: projectId,
      summary: "Loaded summary",
    }),
});

function createThrowingReplacePreviewPatch(
  ref: ReturnType<typeof projectSummaryResource.ref>,
  cause: Error,
): FlowPreviewPatch {
  const patch = { ref } as {
    readonly ref: ReturnType<typeof projectSummaryResource.ref>;
    readonly replace: ProjectSummaryRecord;
  };
  Object.defineProperty(patch, "replace", {
    enumerable: true,
    get() {
      throw cause;
    },
  });
  return patch as unknown as FlowPreviewPatch;
}

function createSaveProjectTransaction<const Id extends string>(
  id: Id,
  concurrency: FlowConcurrencyPolicy,
  options?: Readonly<{
    readonly scopeId?: string;
  }>,
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
    ...(options?.scopeId === undefined
      ? {}
      : {
          scope: {
            id: options.scopeId,
          },
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

const allowedSaveProjectTransaction = createSaveProjectTransaction(
  "transactions.save-allow",
  "allow",
);

const overlappingSaveProjectTransactionA = createSaveProjectTransaction(
  "transactions.save-overlap-a",
  "reject-while-running",
);

const overlappingSaveProjectTransactionB = createSaveProjectTransaction(
  "transactions.save-overlap-b",
  "reject-while-running",
);

function createMultiRefSaveProjectTransaction<const Id extends string>(
  id: Id,
  concurrency: FlowConcurrencyPolicy,
) {
  return flow.transaction<SaveParams, ProjectRecord, "conflict", SaveProjectApi, OverlapSaveEvent>({
    id,
    params: ({ context }: { readonly context: SerialSaveContext }) => ({
      id: context.projectId,
      draft: context.draft,
    }),
    preview: {
      apply: ({ params }) => [
        {
          ref: projectResource.ref(params.id),
          replace: params.draft,
        },
        {
          ref: projectSummaryResource.ref(params.id),
          replace: {
            id: params.id,
            summary: params.draft.name,
          },
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
    invalidates: ({ params }) => [
      projectResource.ref(params.id),
      projectSummaryResource.ref(params.id),
    ],
    routes: flow.outcomes<ProjectRecord, "conflict", OverlapSaveEvent>({
      success: ({ value }) => ({
        type: "SAVED",
        project: value,
      }),
      failure: ["SAVE_FAILED", "error"],
    }),
    concurrency,
  });
}

const multiRefOverlapSaveProjectTransactionA = createMultiRefSaveProjectTransaction(
  "transactions.save-multi-overlap-a",
  "reject-while-running",
);

const multiRefOverlapSaveProjectTransactionB = createMultiRefSaveProjectTransaction(
  "transactions.save-multi-overlap-b",
  "reject-while-running",
);

const multiRefCancelSaveProjectTransaction = createMultiRefSaveProjectTransaction(
  "transactions.save-multi-cancel",
  "cancel-previous",
);

const brokenMultiRefPreviewCause = new Error("preview patch exploded");

const brokenMultiRefPreviewSaveProjectTransaction = flow.transaction<
  SaveParams,
  ProjectRecord,
  "conflict",
  SaveProjectApi,
  PreviewAtomicityEvent
>({
  id: "transactions.save-preview-atomicity",
  params: ({ context }: { readonly context: PreviewAtomicityContext }) => ({
    id: context.projectId,
    draft: context.draft,
  }),
  preview: {
    apply: ({ params }) => [
      {
        ref: projectResource.ref(params.id),
        replace: params.draft,
      },
      createThrowingReplacePreviewPatch(
        projectSummaryResource.ref(params.id),
        brokenMultiRefPreviewCause,
      ),
    ],
  },
  commit: (params) =>
    Effect.flatMap(SaveProjectApi, (api) =>
      api.save({
        id: params.id,
        draft: params.draft,
      }),
    ),
  invalidates: ({ params }) => [
    projectResource.ref(params.id),
    projectSummaryResource.ref(params.id),
  ],
  concurrency: "reject-while-running",
});

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

const rejectMachine = flow.machine<SerialSaveContext, SerialSaveEvent, "ready", "ready">({
  id: "transactions.reject-machine",
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
          submit: saveProjectTransaction,
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

const allowMachine = flow.machine<SerialSaveContext, SerialSaveEvent, "ready", "ready">({
  id: "transactions.allow-machine",
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
          submit: allowedSaveProjectTransaction,
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

type CancelDefectEvent = SerialSaveEvent | Readonly<{ readonly type: "SAVE_DEFECT" }>;

interface CancelDefectContext extends SerialSaveContext {
  readonly defected: boolean;
}

const cancelDefectTransaction = flow.transaction<
  SaveParams,
  ProjectRecord,
  "conflict",
  SaveProjectApi,
  CancelDefectEvent
>({
  id: "transactions.save-cancel-defect",
  params: ({ context }: { readonly context: CancelDefectContext }) => ({
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
  routes: flow.outcomes<ProjectRecord, "conflict", CancelDefectEvent>({
    success: ({ value }) => ({
      type: "SAVED",
      project: value,
    }),
    failure: ["SAVE_FAILED", "error"],
    defect: () => ({ type: "SAVE_DEFECT" }),
  }),
  concurrency: "cancel-previous",
});

const cancelDefectMachine = flow.machine<CancelDefectContext, CancelDefectEvent, "ready", "ready">({
  id: "transactions.cancel-defect-machine",
  initial: "ready",
  context: () => ({
    projectId: "project-1",
    draft: { id: "project-1", name: "Draft v1" },
    savedNames: [],
    error: null,
    defected: false,
  }),
  states: {
    ready: {
      on: {
        SAVE: {
          submit: cancelDefectTransaction,
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
        SAVE_DEFECT: {
          update: () => ({
            defected: true,
          }),
        },
      },
    },
  },
});

type OverlapSaveEvent =
  | Readonly<{ readonly type: "SAVE_A" }>
  | Readonly<{ readonly type: "SAVE_B" }>
  | Readonly<{ readonly type: "SAVED"; readonly project: ProjectRecord }>
  | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>;

type PreviewAtomicityEvent = Readonly<{ readonly type: "SAVE" }>;

interface PreviewAtomicityContext {
  readonly projectId: string;
  readonly draft: ProjectRecord;
}

const overlapMachine = flow.machine<SerialSaveContext, OverlapSaveEvent, "ready", "ready">({
  id: "transactions.overlap-machine",
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
        SAVE_A: {
          submit: overlappingSaveProjectTransactionA,
          update: ({ context, event }) =>
            event.type === "SAVE_A"
              ? {
                  draft: {
                    ...context.draft,
                    name: "Draft A",
                  },
                }
              : {},
        },
        SAVE_B: {
          submit: overlappingSaveProjectTransactionB,
          update: ({ context, event }) =>
            event.type === "SAVE_B"
              ? {
                  draft: {
                    ...context.draft,
                    name: "Draft B",
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

const multiRefOverlapMachine = flow.machine<SerialSaveContext, OverlapSaveEvent, "ready", "ready">({
  id: "transactions.multi-ref-overlap-machine",
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
        SAVE_A: {
          submit: multiRefOverlapSaveProjectTransactionA,
          update: ({ context, event }) =>
            event.type === "SAVE_A"
              ? {
                  draft: {
                    ...context.draft,
                    name: "Draft A",
                  },
                }
              : {},
        },
        SAVE_B: {
          submit: multiRefOverlapSaveProjectTransactionB,
          update: ({ context, event }) =>
            event.type === "SAVE_B"
              ? {
                  draft: {
                    ...context.draft,
                    name: "Draft B",
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

const multiRefCancelMachine = flow.machine<SerialSaveContext, OverlapSaveEvent, "ready", "ready">({
  id: "transactions.multi-ref-cancel-machine",
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
        SAVE_A: {
          submit: multiRefCancelSaveProjectTransaction,
          update: ({ context, event }) =>
            event.type === "SAVE_A"
              ? {
                  draft: {
                    ...context.draft,
                    name: "Draft A",
                  },
                }
              : {},
        },
        SAVE_B: {
          submit: multiRefCancelSaveProjectTransaction,
          update: ({ context, event }) =>
            event.type === "SAVE_B"
              ? {
                  draft: {
                    ...context.draft,
                    name: "Draft B",
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

const previewAtomicityMachine = flow.machine<
  PreviewAtomicityContext,
  PreviewAtomicityEvent,
  "ready",
  "ready"
>({
  id: "transactions.preview-atomicity-machine",
  initial: "ready",
  context: () => ({
    projectId: "project-1",
    draft: { id: "project-1", name: "Atomic Draft" },
  }),
  states: {
    ready: {
      on: {
        SAVE: {
          submit: brokenMultiRefPreviewSaveProjectTransaction,
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
    flow.module("Transactions", {
      resources: {
        project: projectResource,
        projectSummary: projectSummaryResource,
      },
      transactions: {
        save: saveProjectTransaction,
        serialSave: serializedSaveProjectTransaction,
        cancelSave: cancelPreviousSaveProjectTransaction,
        cancelDefectSave: cancelDefectTransaction,
        allowSave: allowedSaveProjectTransaction,
        overlapSaveA: overlappingSaveProjectTransactionA,
        overlapSaveB: overlappingSaveProjectTransactionB,
        multiRefOverlapSaveA: multiRefOverlapSaveProjectTransactionA,
        multiRefOverlapSaveB: multiRefOverlapSaveProjectTransactionB,
        multiRefCancelSave: multiRefCancelSaveProjectTransaction,
        previewAtomicitySave: brokenMultiRefPreviewSaveProjectTransaction,
      },
      machines: {
        submit: submitMachine,
        serialize: serializeMachine,
        reject: rejectMachine,
        cancel: cancelMachine,
        cancelDefect: cancelDefectMachine,
        allow: allowMachine,
        overlap: overlapMachine,
        multiRefOverlap: multiRefOverlapMachine,
        multiRefCancel: multiRefCancelMachine,
        previewAtomicity: previewAtomicityMachine,
        run: runMachine,
      },
    }),
  ],
});

const seededProject = {
  ref: projectResource.ref("project-1"),
  value: { id: "project-1", name: "Seeded v1" },
} as const;

const seededProjectSummary = {
  ref: projectSummaryResource.ref("project-1"),
  value: { id: "project-1", summary: "Seeded summary v1" },
} as const;

function runSeededAppScenario<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  options?: Readonly<{
    readonly provide?: Layer.Any | ReadonlyArray<Layer.Any>;
    readonly clock?: () => number;
    readonly events?: ReadonlyArray<Event>;
    readonly resources?: ReadonlyArray<typeof seededProject | typeof seededProjectSummary>;
  }>,
): FlowTestHarness<Context, Event, State> {
  return test
    .app(testApp)
    .scenario(machine)
    .with({
      resources: [seededProject, ...(options?.resources ?? [])],
      ...(options?.provide === undefined ? {} : { provide: options.provide }),
      ...(options?.clock === undefined ? {} : { clock: options.clock }),
    })
    .run(options?.events);
}

function expectNoPendingWork<Context, Event extends FlowEvent, State extends string>(
  harness: Pick<FlowTestHarness<Context, Event, State>, "pendingWork">,
) {
  expect(harness.pendingWork()).toMatchObject({
    ready: 0,
    activeFibers: 0,
    mailboxes: [],
    timers: [],
    streams: [],
    transactions: [],
    children: [],
  });
}

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
        Effect.promise<
          | Readonly<{ readonly tag: "success"; readonly value: ProjectRecord }>
          | Readonly<{ readonly tag: "failure"; readonly error: "conflict" }>
        >(
          () =>
            new Promise((resolve) => {
              calls.push(params);
              completions.push({
                succeed: (value) => {
                  resolve({ tag: "success", value });
                },
                fail: (error) => {
                  resolve({ tag: "failure", error });
                },
              });
            }),
        ).pipe(
          Effect.flatMap((result) =>
            result.tag === "success" ? Effect.succeed(result.value) : Effect.fail(result.error),
          ),
        ),
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
    failAt: (index: number, error: "conflict") => completionAt(index).fail(error),
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

    const harness = runSeededAppScenario(submitMachine, {
      provide: successLayer,
      clock: () => 42_000,
      events: [{ type: "SAVE" }],
    });

    expect(harness.state()).toBe("saving");
    expect(harness.snapshot().transactions["transactions.save"]).toMatchObject({
      status: "pending",
    });
    expect(harness.cache().query("transactions.project")).toMatchObject({
      value: { id: "project-1", name: "Draft v2" },
    });
    expect(harness.transactions().previewPatches("transactions.save")).toHaveLength(1);
    expect(harness.pendingWork()).toMatchObject({
      ready: 1,
      activeFibers: 1,
      transactions: ["transactions.save"],
    });
    expect(
      harness
        .transactions()
        .events("transactions.save")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:start", "transaction:preview-patch"]));
    expect(
      harness
        .transactions()
        .events("transactions.save")
        .some(
          (receipt) =>
            receipt.type === "transaction:success" ||
            receipt.type === "transaction:failure" ||
            receipt.type === "transaction:defect" ||
            receipt.type === "transaction:interrupt",
        ),
    ).toBe(false);

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

    const harness = runSeededAppScenario(submitMachine, {
      provide: conflictLayer,
      events: [{ type: "SAVE" }],
    });

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
        facts: expect.objectContaining({
          parentState: "saving",
          correlationId: expect.any(String),
          receiptTypes: expect.arrayContaining([
            "machine:event",
            "transaction:start",
            "transaction:failure",
          ]),
          relatedIds: expect.arrayContaining(["transactions.submit-machine", "transactions.save"]),
        }),
      }),
    ]);
  });

  it("routes transaction defect lanes in flowTest", async () => {
    type DefectEvent =
      | Readonly<{ readonly type: "SAVE" }>
      | Readonly<{ readonly type: "SAVE_DEFECT" }>;
    type DefectParams = Readonly<{ readonly run: true }>;

    const defectTransaction = flow.transaction<DefectParams, never, never, never, DefectEvent>({
      id: "transactions.save-defect",
      params: () => ({ run: true }),
      commit: () => Effect.die(new Error("save defect")),
      routes: flow.outcomes<never, never, DefectEvent>({
        defect: () => ({ type: "SAVE_DEFECT" }),
      }),
      concurrency: "reject-while-running",
    });

    const defectMachine = flow.machine<
      { readonly defected: boolean },
      DefectEvent,
      "ready" | "saving" | "defected",
      "ready"
    >({
      id: "transactions.defect-machine",
      initial: "ready",
      context: () => ({ defected: false }),
      states: {
        ready: {
          on: {
            SAVE: "saving",
          },
        },
        saving: {
          invoke: flow.run(defectTransaction),
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

    const harness = flowTest(defectMachine).send({ type: "SAVE" });

    await harness.flush();
    await harness.flush();

    expect(harness.state()).toBe("defected");
    expect(harness.context().defected).toBe(true);
    expect(harness.transactions().get("transactions.save-defect")).toMatchObject({
      status: "defect",
    });
    expect(harness.issues()).toEqual([
      expect.objectContaining({
        kind: "defect",
        source: "transaction",
        id: "transactions.save-defect",
        handled: true,
      }),
    ]);
    expect(
      harness
        .transactions()
        .events("transactions.save-defect")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:start", "transaction:defect"]));
  });

  it("runs state-owned flow.run transactions through flowTest", async () => {
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

    const harness = runSeededAppScenario(runMachine, {
      provide: successLayer,
      events: [{ type: "SAVE" }],
    });

    expect(harness.state()).toBe("saving");
    expect(harness.snapshot().transactions["transactions.save"]).toMatchObject({
      status: "pending",
    });
    expect(harness.cache().query("transactions.project")).toMatchObject({
      value: { id: "project-1", name: "Runtime save" },
    });
    expect(harness.pendingWork()).toMatchObject({
      ready: 1,
      activeFibers: 1,
      transactions: ["transactions.save"],
    });
    expect(
      harness
        .transactions()
        .events("transactions.save")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:start", "transaction:preview-patch"]));
    expect(
      harness
        .transactions()
        .events("transactions.save")
        .some(
          (receipt) =>
            receipt.type === "transaction:success" ||
            receipt.type === "transaction:failure" ||
            receipt.type === "transaction:defect" ||
            receipt.type === "transaction:interrupt",
        ),
    ).toBe(false);

    await harness.flush();
    await harness.flush();

    expect(harness.state()).toBe("done");
    expect(harness.context()).toMatchObject({
      error: null,
      savedProject: { id: "project-1", name: "Runtime save" },
    });
    expect(harness.snapshot().transactions["transactions.save"]).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Runtime save" },
    });
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
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [successLayer],
      }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.createActor(runMachine);
    const observedSnapshots: Array<{
      readonly state: string;
      readonly transactionStatus: string | undefined;
      readonly terminalReceiptPublished: boolean;
    }> = [];
    const unsubscribe = actor.subscribe(() => {
      const snapshot = actor.snapshot();
      observedSnapshots.push({
        state: snapshot.value,
        transactionStatus: snapshot.transactions["transactions.save"]?.status,
        terminalReceiptPublished: snapshot.receipts.some(
          (receipt) =>
            receipt.id === "transactions.save" &&
            (receipt.type === "transaction:success" ||
              receipt.type === "transaction:failure" ||
              receipt.type === "transaction:defect" ||
              receipt.type === "transaction:interrupt"),
        ),
      });
    });
    actor.send({ type: "SAVE" });

    expect(actor.snapshot().value).toBe("saving");
    expect(actor.snapshot().transactions["transactions.save"]).toMatchObject({
      status: "pending",
    });
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.id === "transactions.save")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:start", "transaction:preview-patch"]));
    expect(
      actor
        .receipts()
        .some(
          (receipt) =>
            receipt.id === "transactions.save" &&
            (receipt.type === "transaction:success" ||
              receipt.type === "transaction:failure" ||
              receipt.type === "transaction:defect" ||
              receipt.type === "transaction:interrupt"),
        ),
    ).toBe(false);
    expect(observedSnapshots).toEqual([
      {
        state: "saving",
        transactionStatus: "pending",
        terminalReceiptPublished: false,
      },
    ]);
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
    const pendingIndex = observedSnapshots.findIndex(
      (snapshot) => snapshot.transactionStatus === "pending",
    );
    const successIndex = observedSnapshots.findIndex(
      (snapshot) => snapshot.transactionStatus === "success",
    );
    expect(pendingIndex >= 0).toBe(true);
    expect(successIndex > pendingIndex).toBe(true);
    expect(observedSnapshots).toEqual(
      expect.arrayContaining([
        {
          state: "saving",
          transactionStatus: "success",
          terminalReceiptPublished: true,
        },
        {
          state: "done",
          transactionStatus: "success",
          terminalReceiptPublished: true,
        },
      ]),
    );

    unsubscribe();
    await actor.dispose();
    await runtime.dispose();
  });

  it("routes transaction defect lanes in runtime actors", async () => {
    type DefectEvent =
      | Readonly<{ readonly type: "SAVE" }>
      | Readonly<{ readonly type: "SAVE_DEFECT" }>;
    type DefectParams = Readonly<{ readonly run: true }>;

    const defectTransaction = flow.transaction<DefectParams, never, never, never, DefectEvent>({
      id: "transactions.save-defect",
      params: () => ({ run: true }),
      commit: () => Effect.die(new Error("save defect")),
      routes: flow.outcomes<never, never, DefectEvent>({
        defect: () => ({ type: "SAVE_DEFECT" }),
      }),
      concurrency: "reject-while-running",
    });

    const defectMachine = flow.machine<
      { readonly defected: boolean },
      DefectEvent,
      "ready" | "saving" | "defected",
      "ready"
    >({
      id: "transactions.defect-machine.runtime",
      initial: "ready",
      context: () => ({ defected: false }),
      states: {
        ready: {
          on: {
            SAVE: "saving",
          },
        },
        saving: {
          invoke: flow.run(defectTransaction),
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

    const defectApp = flow.app({
      modules: [
        flow.module("TransactionsDefect", {
          transactions: {
            defect: defectTransaction,
          },
          machines: {
            defect: defectMachine,
          },
        }),
      ],
    });

    const runtime = flow.runtime(
      defectApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
      }),
    );

    const actor = runtime.createActor(defectMachine);
    actor.send({ type: "SAVE" });

    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().value).toBe("defected");
    expect(actor.snapshot().context.defected).toBe(true);
    expect(actor.snapshot().transactions["transactions.save-defect"]).toMatchObject({
      status: "defect",
    });
    expect(actor.issues()).toEqual([
      expect.objectContaining({
        kind: "defect",
        source: "transaction",
        id: "transactions.save-defect",
        handled: true,
        facts: expect.objectContaining({
          parentState: "saving",
          correlationId: expect.any(String),
          receiptTypes: expect.arrayContaining([
            "machine:event",
            "transaction:start",
            "transaction:defect",
          ]),
          relatedIds: expect.arrayContaining([
            "transactions.defect-machine.runtime",
            "transactions.save-defect",
          ]),
        }),
      }),
    ]);
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.id === "transactions.save-defect")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:start", "transaction:defect"]));

    await actor.dispose();
    await runtime.dispose();
  });

  it("reports a tagged diagnostic when repeated submit transactions are rejected in flowTest", async () => {
    const controlled = createControlledSaveLayer();

    const harness = runSeededAppScenario(rejectMachine, {
      provide: controlled.layer,
      events: [
        { type: "SAVE", name: "Draft A" },
        { type: "SAVE", name: "Draft B" },
      ],
    });

    expect(controlled.calls.map((params) => params.draft.name)).toEqual(["Draft A"]);
    expect(harness.cache().query("transactions.project")).toMatchObject({
      value: { id: "project-1", name: "Draft A" },
    });
    expect(harness.transactions().previewPatches("transactions.save")).toHaveLength(1);
    expect(harness.transactions().get("transactions.save")).toMatchObject({
      status: "pending",
    });
    expect(
      harness
        .transactions()
        .events("transactions.save")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:start", "transaction:reject"]));
    expect(harness.issues()).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "transaction",
        id: "transactions.save",
        error: expect.objectContaining({
          code: "FLOW-TXN-001",
          title: "Transaction 'transactions.save' was rejected while another attempt was running",
        }),
        facts: expect.objectContaining({
          correlationId: expect.any(String),
          parentState: "ready",
          receiptTypes: ["transaction:reject"],
          relatedIds: ["transactions.save"],
        }),
      }),
    ]);

    controlled.succeedNext({ id: "project-1", name: "Draft A" });
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedNames: ["Draft A"],
      error: null,
    });
    expect(harness.issues()).toEqual([]);
  });

  it("reports a tagged diagnostic when repeated runtime transactions are rejected", async () => {
    const controlled = createControlledSaveLayer();
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [controlled.layer],
      }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.createActor(rejectMachine);
    actor.send({ type: "SAVE", name: "Draft A" });
    actor.send({ type: "SAVE", name: "Draft B" });

    expect(controlled.calls.map((params) => params.draft.name)).toEqual(["Draft A"]);
    expect(actor.snapshot().resources["transactions.project"]).toMatchObject({
      value: { id: "project-1", name: "Draft A" },
    });
    expect(actor.snapshot().transactions["transactions.save"]).toMatchObject({
      status: "pending",
    });
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.id === "transactions.save")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:start", "transaction:reject"]));
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save" && receipt.type === "transaction:preview-patch",
        ),
    ).toHaveLength(1);
    expect(actor.issues()).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "transaction",
        id: "transactions.save",
        error: expect.objectContaining({
          code: "FLOW-TXN-001",
          title: "Transaction 'transactions.save' was rejected while another attempt was running",
        }),
        facts: expect.objectContaining({
          correlationId: expect.any(String),
          parentState: "ready",
          receiptTypes: ["transaction:reject"],
          relatedIds: ["transactions.save"],
        }),
      }),
    ]);

    controlled.succeedNext({ id: "project-1", name: "Draft A" });
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context.savedNames).toEqual(["Draft A"]);
    expect(actor.issues()).toEqual([]);

    await actor.dispose();
    await runtime.dispose();
  });

  it("throws a tagged diagnostic from flowTest when transaction params resolution throws", () => {
    const paramsCause = new Error("params exploded");
    const throwingParamsTransaction = flow.transaction<
      { readonly id: string },
      "ok",
      never,
      never,
      Readonly<{ readonly type: "SAVE" }>
    >({
      id: "transactions.throwing-params",
      params: () => {
        throw paramsCause;
      },
      commit: () => Effect.succeed("ok" as const),
    });
    const machine = flow.machine<{}, Readonly<{ readonly type: "SAVE" }>, "ready", "ready">({
      id: "transactions.throwing-params.flow-test",
      initial: "ready",
      context: () => ({}),
      states: {
        ready: {
          on: {
            SAVE: {
              submit: throwingParamsTransaction,
            },
          },
        },
      },
    });
    const harness = flowTest(machine);

    let failure: unknown;
    try {
      harness.send({ type: "SAVE" });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      code: "FLOW-TXN-002",
      title: "Transaction callback 'params' threw for 'transactions.throwing-params'",
      debug: {
        callback: "params",
        cause: expect.objectContaining({
          message: "params exploded",
          name: "Error",
          stack: expect.any(String),
        }),
        transactionId: "transactions.throwing-params",
      },
    });
    expect(
      (failure as { debug?: { cause?: { stack?: string } } }).debug?.cause?.stack ?? "",
    ).toContain("params exploded");
    expect((failure as { cause?: unknown }).cause).toBe(paramsCause);
  });

  it("throws a tagged runtime diagnostic when transaction params resolution throws", async () => {
    const paramsCause = new Error("params exploded");
    const throwingParamsTransaction = flow.transaction<
      { readonly id: string },
      "ok",
      never,
      never,
      Readonly<{ readonly type: "SAVE" }>
    >({
      id: "transactions.throwing-params",
      params: () => {
        throw paramsCause;
      },
      commit: () => Effect.succeed("ok" as const),
    });
    const machine = flow.machine<{}, Readonly<{ readonly type: "SAVE" }>, "ready", "ready">({
      id: "transactions.throwing-params.runtime",
      initial: "ready",
      context: () => ({}),
      states: {
        ready: {
          on: {
            SAVE: {
              submit: throwingParamsTransaction,
            },
          },
        },
      },
    });
    const runtime = createRuntime();
    const actor = runtime.createActor(machine);

    let failure: unknown;
    try {
      actor.send({ type: "SAVE" });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      code: "FLOW-TXN-002",
      title: "Transaction callback 'params' threw for 'transactions.throwing-params'",
      debug: {
        callback: "params",
        cause: expect.objectContaining({
          message: "params exploded",
          name: "Error",
          stack: expect.any(String),
        }),
        transactionId: "transactions.throwing-params",
      },
    });
    expect(
      (failure as { debug?: { cause?: { stack?: string } } }).debug?.cause?.stack ?? "",
    ).toContain("params exploded");
    expect((failure as { cause?: unknown }).cause).toBe(paramsCause);

    await actor.dispose();
    await runtime.dispose();
  });

  it("throws a tagged diagnostic from flowTest when transaction success routing throws", async () => {
    const successCause = new Error("routes.success exploded");
    const throwingSuccessRouteTransaction = flow.transaction<
      void,
      "ok",
      never,
      never,
      Readonly<{ readonly type: "SAVE" }> | Readonly<{ readonly type: "SAVED" }>
    >({
      id: "transactions.throwing-success-route",
      commit: () => Effect.succeed("ok" as const),
      routes: flow.outcomes<
        "ok",
        never,
        Readonly<{ readonly type: "SAVE" }> | Readonly<{ readonly type: "SAVED" }>
      >({
        success: () => {
          throw successCause;
        },
      }),
    });
    const machine = flow.machine<
      {},
      Readonly<{ readonly type: "SAVE" }> | Readonly<{ readonly type: "SAVED" }>,
      "ready" | "saving",
      "ready"
    >({
      id: "transactions.throwing-success-route.flow-test",
      initial: "ready",
      context: () => ({}),
      states: {
        ready: {
          on: {
            SAVE: {
              target: "saving",
              submit: throwingSuccessRouteTransaction,
            },
          },
        },
        saving: {},
      },
    });
    const harness = flowTest(machine).send({ type: "SAVE" });

    let failure: unknown;
    try {
      await harness.flush();
      await harness.flush();
    } catch (error) {
      failure = error;
    }

    expect(failure instanceof FlowDiagnostic).toBe(true);
    expect(failure).toMatchObject({
      code: "FLOW-TXN-003",
      title:
        "Transaction outcome callback 'routes.success' threw for 'transactions.throwing-success-route'",
      debug: {
        callback: "routes.success",
        cause: expect.objectContaining({
          message: "routes.success exploded",
          name: "Error",
          stack: expect.any(String),
        }),
        transactionId: "transactions.throwing-success-route",
      },
    });
    expect(
      (failure as { debug?: { cause?: { stack?: string } } }).debug?.cause?.stack ?? "",
    ).toContain("routes.success exploded");
    expect((failure as { cause?: unknown }).cause).toBe(successCause);
  });

  it("throws a tagged runtime diagnostic when transaction success routing throws", async () => {
    const successCause = new Error("routes.success exploded");
    const throwingSuccessRouteTransaction = flow.transaction<
      void,
      "ok",
      never,
      never,
      Readonly<{ readonly type: "SAVE" }> | Readonly<{ readonly type: "SAVED" }>
    >({
      id: "transactions.throwing-success-route",
      commit: () => Effect.succeed("ok" as const),
      routes: flow.outcomes<
        "ok",
        never,
        Readonly<{ readonly type: "SAVE" }> | Readonly<{ readonly type: "SAVED" }>
      >({
        success: () => {
          throw successCause;
        },
      }),
    });
    const machine = flow.machine<
      {},
      Readonly<{ readonly type: "SAVE" }> | Readonly<{ readonly type: "SAVED" }>,
      "ready" | "saving",
      "ready"
    >({
      id: "transactions.throwing-success-route.runtime",
      initial: "ready",
      context: () => ({}),
      states: {
        ready: {
          on: {
            SAVE: {
              target: "saving",
              submit: throwingSuccessRouteTransaction,
            },
          },
        },
        saving: {},
      },
    });
    const runtime = createRuntime();
    const actor = runtime.createActor(machine);

    actor.send({ type: "SAVE" });

    let failure: unknown;
    try {
      await actor.flush();
      await actor.flush();
    } catch (error) {
      failure = error;
    }

    expect(failure instanceof FlowDiagnostic).toBe(true);
    expect(failure).toMatchObject({
      code: "FLOW-TXN-003",
      title:
        "Transaction outcome callback 'routes.success' threw for 'transactions.throwing-success-route'",
      debug: {
        callback: "routes.success",
        cause: expect.objectContaining({
          message: "routes.success exploded",
          name: "Error",
          stack: expect.any(String),
        }),
        transactionId: "transactions.throwing-success-route",
      },
    });
    expect(
      (failure as { debug?: { cause?: { stack?: string } } }).debug?.cause?.stack ?? "",
    ).toContain("routes.success exploded");
    expect((failure as { cause?: unknown }).cause).toBe(successCause);

    await actor.dispose();
    await runtime.dispose();
  });

  it("keeps the newer preview when an older overlapping flowTest transaction fails", async () => {
    const controlled = createControlledSaveLayer();

    const harness = runSeededAppScenario(overlapMachine, {
      provide: controlled.layer,
      events: [{ type: "SAVE_A" }, { type: "SAVE_B" }],
    });

    expect(controlled.calls.map((params) => params.draft.name)).toEqual(["Draft A", "Draft B"]);
    expect(harness.cache().query("transactions.project")).toMatchObject({
      value: { id: "project-1", name: "Draft B" },
    });

    controlled.failAt(0, "conflict");
    await harness.flush();
    await harness.flush();

    expect(harness.cache().query("transactions.project")).toMatchObject({
      value: { id: "project-1", name: "Draft B" },
    });
    expect(harness.transactions().get("transactions.save-overlap-a")).toMatchObject({
      status: "failure",
    });
    expect(harness.transactions().get("transactions.save-overlap-b")).toMatchObject({
      status: "pending",
    });

    controlled.succeedAt(1, { id: "project-1", name: "Draft B" });
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedNames: ["Draft B"],
      error: null,
    });
    expect(harness.transactions().get("transactions.save-overlap-b")).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });
  });

  it("keeps the newer preview when an older overlapping runtime transaction fails", async () => {
    const controlled = createControlledSaveLayer();
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [controlled.layer],
      }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.createActor(overlapMachine);
    actor.send({ type: "SAVE_A" });
    actor.send({ type: "SAVE_B" });

    expect(controlled.calls.map((params) => params.draft.name)).toEqual(["Draft A", "Draft B"]);
    expect(actor.snapshot().resources["transactions.project"]).toMatchObject({
      value: { id: "project-1", name: "Draft B" },
    });

    controlled.failAt(0, "conflict");
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().resources["transactions.project"]).toMatchObject({
      value: { id: "project-1", name: "Draft B" },
    });
    expect(actor.snapshot().transactions["transactions.save-overlap-a"]).toMatchObject({
      status: "failure",
    });
    expect(actor.snapshot().transactions["transactions.save-overlap-b"]).toMatchObject({
      status: "pending",
    });

    controlled.succeedAt(1, { id: "project-1", name: "Draft B" });
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context.savedNames).toEqual(["Draft B"]);
    expect(actor.snapshot().transactions["transactions.save-overlap-b"]).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });

    await actor.dispose();
    await runtime.dispose();
  });

  it("keeps the newer multi-ref preview when an older overlapping flowTest transaction fails", async () => {
    const controlled = createControlledSaveLayer();

    const harness = runSeededAppScenario(multiRefOverlapMachine, {
      provide: controlled.layer,
      resources: [seededProjectSummary],
      events: [{ type: "SAVE_A" }, { type: "SAVE_B" }],
    });
    const invalidationCount = (resourceId: string) =>
      harness
        .receipts()
        .filter((receipt) => receipt.id === resourceId && receipt.type === "resource:invalidate")
        .length;

    expect(controlled.calls.map((params) => params.draft.name)).toEqual(["Draft A", "Draft B"]);
    expect(harness.cache().query("transactions.project")).toMatchObject({
      value: { id: "project-1", name: "Draft B" },
    });
    expect(harness.cache().query("transactions.project-summary")).toMatchObject({
      value: { id: "project-1", summary: "Draft B" },
    });

    controlled.failAt(0, "conflict");
    await harness.flush();
    await harness.flush();

    expect(harness.cache().query("transactions.project")).toMatchObject({
      value: { id: "project-1", name: "Draft B" },
    });
    expect(harness.cache().query("transactions.project-summary")).toMatchObject({
      value: { id: "project-1", summary: "Draft B" },
    });
    expect(harness.transactions().get("transactions.save-multi-overlap-a")).toMatchObject({
      status: "failure",
    });
    expect(harness.transactions().get("transactions.save-multi-overlap-b")).toMatchObject({
      status: "pending",
    });
    expect(invalidationCount("transactions.project")).toBe(0);
    expect(invalidationCount("transactions.project-summary")).toBe(0);

    controlled.succeedAt(1, { id: "project-1", name: "Draft B" });
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedNames: ["Draft B"],
      error: null,
    });
    expect(harness.transactions().get("transactions.save-multi-overlap-b")).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });
    expect(harness.cache().query("transactions.project")).toMatchObject({
      status: "stale",
      freshness: "invalidated",
    });
    expect(harness.cache().query("transactions.project-summary")).toMatchObject({
      status: "stale",
      freshness: "invalidated",
    });
    expect(invalidationCount("transactions.project")).toBe(1);
    expect(invalidationCount("transactions.project-summary")).toBe(1);
    expectNoPendingWork(harness);
  });

  it("keeps the newer multi-ref preview when an older overlapping runtime transaction fails", async () => {
    const controlled = createControlledSaveLayer();
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [controlled.layer],
      }),
    );

    runtime.resources.seedResources([seededProject, seededProjectSummary]);
    const actor = runtime.createActor(multiRefOverlapMachine);
    const invalidationCount = (resourceId: string) =>
      actor
        .snapshot()
        .receipts.filter(
          (receipt) => receipt.id === resourceId && receipt.type === "resource:invalidate",
        ).length;
    actor.send({ type: "SAVE_A" });
    actor.send({ type: "SAVE_B" });

    expect(controlled.calls.map((params) => params.draft.name)).toEqual(["Draft A", "Draft B"]);
    expect(actor.snapshot().resources["transactions.project"]).toMatchObject({
      value: { id: "project-1", name: "Draft B" },
    });
    expect(actor.snapshot().resources["transactions.project-summary"]).toMatchObject({
      value: { id: "project-1", summary: "Draft B" },
    });

    controlled.failAt(0, "conflict");
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().resources["transactions.project"]).toMatchObject({
      value: { id: "project-1", name: "Draft B" },
    });
    expect(actor.snapshot().resources["transactions.project-summary"]).toMatchObject({
      value: { id: "project-1", summary: "Draft B" },
    });
    expect(actor.snapshot().transactions["transactions.save-multi-overlap-a"]).toMatchObject({
      status: "failure",
    });
    expect(actor.snapshot().transactions["transactions.save-multi-overlap-b"]).toMatchObject({
      status: "pending",
    });
    expect(invalidationCount("transactions.project")).toBe(0);
    expect(invalidationCount("transactions.project-summary")).toBe(0);

    controlled.succeedAt(1, { id: "project-1", name: "Draft B" });
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context).toMatchObject({
      savedNames: ["Draft B"],
      error: null,
    });
    expect(actor.snapshot().transactions["transactions.save-multi-overlap-b"]).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });
    expect(actor.snapshot().resources["transactions.project"]).toMatchObject({
      status: "stale",
      freshness: "invalidated",
    });
    expect(actor.snapshot().resources["transactions.project-summary"]).toMatchObject({
      status: "stale",
      freshness: "invalidated",
    });
    expect(invalidationCount("transactions.project")).toBe(1);
    expect(invalidationCount("transactions.project-summary")).toBe(1);

    await actor.dispose();
    await runtime.dispose();
  });

  it("does not publish a partial multi-ref flowTest preview when a later patch throws", async () => {
    const controlled = createControlledSaveLayer();

    const harness = runSeededAppScenario(previewAtomicityMachine, {
      provide: controlled.layer,
      resources: [seededProjectSummary],
      events: [{ type: "SAVE" }],
    });

    await harness.flush();
    await harness.flush();

    expect(controlled.calls).toEqual([]);
    expect(harness.cache().query("transactions.project")).toMatchObject({
      value: { id: "project-1", name: "Seeded v1" },
    });
    expect(harness.cache().query("transactions.project-summary")).toMatchObject({
      value: { id: "project-1", summary: "Seeded summary v1" },
    });
    expect(harness.transactions().get("transactions.save-preview-atomicity")).toMatchObject({
      status: "defect",
    });
    expect(harness.issues()).toEqual([
      expect.objectContaining({
        kind: "defect",
        source: "transaction",
        id: "transactions.save-preview-atomicity",
      }),
    ]);
    expect(
      harness.transactions().previewPatches("transactions.save-preview-atomicity"),
    ).toHaveLength(0);
    expect(
      harness
        .transactions()
        .events("transactions.save-preview-atomicity")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:start", "transaction:defect"]));
    expect(
      harness
        .receipts()
        .filter(
          (receipt) =>
            receipt.type === "resource:invalidate" && receipt.id === "transactions.project",
        ),
    ).toHaveLength(0);
    expect(
      harness
        .receipts()
        .filter(
          (receipt) =>
            receipt.type === "resource:invalidate" && receipt.id === "transactions.project-summary",
        ),
    ).toHaveLength(0);
    expectNoPendingWork(harness);
  });

  it("does not publish a partial multi-ref runtime preview when a later patch throws", async () => {
    const controlled = createControlledSaveLayer();
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [controlled.layer],
      }),
    );

    runtime.resources.seedResources([seededProject, seededProjectSummary]);
    const actor = runtime.createActor(previewAtomicityMachine);
    actor.send({ type: "SAVE" });

    await actor.flush();
    await actor.flush();

    expect(controlled.calls).toEqual([]);
    expect(runtime.resources.get(projectResource.ref("project-1"))).toMatchObject({
      value: { id: "project-1", name: "Seeded v1" },
    });
    expect(runtime.resources.get(projectSummaryResource.ref("project-1"))).toMatchObject({
      value: { id: "project-1", summary: "Seeded summary v1" },
    });
    expect(actor.snapshot().transactions["transactions.save-preview-atomicity"]).toMatchObject({
      status: "defect",
    });
    expect(actor.issues()).toEqual([
      expect.objectContaining({
        kind: "defect",
        source: "transaction",
        id: "transactions.save-preview-atomicity",
      }),
    ]);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-preview-atomicity" &&
            receipt.type === "transaction:preview-patch",
        ),
    ).toHaveLength(0);
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.id === "transactions.save-preview-atomicity")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:start", "transaction:defect"]));
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.type === "resource:invalidate" && receipt.id === "transactions.project",
        ),
    ).toHaveLength(0);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.type === "resource:invalidate" && receipt.id === "transactions.project-summary",
        ),
    ).toHaveLength(0);

    await actor.dispose();
    await runtime.dispose();
  });
});
