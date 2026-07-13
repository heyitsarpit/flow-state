import { Context, Effect, Layer } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { FlowDiagnostic } from "./shared/diagnostics.js";
import { createKey, createTag } from "./core/api/keys.js";
import type {
  FlowConcurrencyPolicy,
  FlowEvent,
  FlowMachine,
  FlowTestHarness,
} from "./core/api/types.js";
import * as flow from "./index.js";
import { createRuntime } from "./runtime/contract-runtime.js";
import { flowTest, test } from "./testing.js";

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

const scopedSerializedSaveProjectTransactionA1 = createSaveProjectTransaction(
  "transactions.save-scope-a1",
  "serialize",
  { scopeId: "scope-1" },
);

const scopedSerializedSaveProjectTransactionB1 = createSaveProjectTransaction(
  "transactions.save-scope-b1",
  "serialize",
  { scopeId: "scope-1" },
);

const scopedSerializedSaveProjectTransactionA2 = createSaveProjectTransaction(
  "transactions.save-scope-a2",
  "serialize",
  { scopeId: "scope-2" },
);

const scopedSerializedSaveProjectTransactionB2 = createSaveProjectTransaction(
  "transactions.save-scope-b2",
  "serialize",
  { scopeId: "scope-2" },
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

type AllowDefectEvent = SerialSaveEvent | Readonly<{ readonly type: "SAVE_DEFECT" }>;

interface AllowDefectContext extends SerialSaveContext {
  readonly defected: boolean;
}

const allowDefectTransaction = flow.transaction<
  SaveParams,
  ProjectRecord,
  "conflict",
  SaveProjectApi,
  AllowDefectEvent
>({
  id: "transactions.save-allow-defect",
  params: ({ context }: { readonly context: AllowDefectContext }) => ({
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
  routes: flow.outcomes<ProjectRecord, "conflict", AllowDefectEvent>({
    success: ({ value }) => ({
      type: "SAVED",
      project: value,
    }),
    failure: ["SAVE_FAILED", "error"],
    defect: () => ({ type: "SAVE_DEFECT" }),
  }),
  concurrency: "allow",
});

const allowDefectMachine = flow.machine<AllowDefectContext, AllowDefectEvent, "ready", "ready">({
  id: "transactions.allow-defect-machine",
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
          submit: allowDefectTransaction,
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

const staleSuccessRouteCause = new Error("stale success route exploded");
const staleFailureRouteCause = new Error("stale failure route exploded");
const staleDefectRouteCause = new Error("stale defect route exploded");

type StaleRouteLeakEvent = SerialSaveEvent | Readonly<{ readonly type: "SAVE_DEFECT" }>;

interface StaleRouteLeakContext extends AllowDefectContext {}

const staleRouteLeakTransaction = flow.transaction<
  SaveParams,
  ProjectRecord,
  "conflict",
  SaveProjectApi,
  StaleRouteLeakEvent
>({
  id: "transactions.save-allow-stale-route",
  params: ({ context }: { readonly context: StaleRouteLeakContext }) => ({
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
  routes: flow.outcomes<ProjectRecord, "conflict", StaleRouteLeakEvent>({
    success: ({ value }) => {
      if (value.name === "Older stale success") {
        throw staleSuccessRouteCause;
      }

      return {
        type: "SAVED",
        project: value,
      };
    },
    failure: () => {
      throw staleFailureRouteCause;
    },
    defect: () => {
      throw staleDefectRouteCause;
    },
  }),
  concurrency: "allow",
});

const staleRouteLeakMachine = flow.machine<
  StaleRouteLeakContext,
  StaleRouteLeakEvent,
  "ready",
  "ready"
>({
  id: "transactions.allow-stale-route-machine",
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
          submit: staleRouteLeakTransaction,
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

const cancelledSuccessRouteCause = new Error("cancelled success route exploded");
const cancelledFailureRouteCause = new Error("cancelled failure route exploded");
const cancelledDefectRouteCause = new Error("cancelled defect route exploded");

const cancelRouteLeakTransaction = flow.transaction<
  SaveParams,
  ProjectRecord,
  "conflict",
  SaveProjectApi,
  SerialSaveEvent
>({
  id: "transactions.save-cancel-stale-success-route",
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
  routes: flow.outcomes<ProjectRecord, "conflict", SerialSaveEvent>({
    success: ({ value }) => {
      if (value.name === "Older cancelled success") {
        throw cancelledSuccessRouteCause;
      }

      return {
        type: "SAVED",
        project: value,
      };
    },
    failure: () => {
      throw cancelledFailureRouteCause;
    },
    defect: () => {
      throw cancelledDefectRouteCause;
    },
  }),
  concurrency: "cancel-previous",
});

const cancelRouteLeakMachine = flow.machine<SerialSaveContext, SerialSaveEvent, "ready", "ready">({
  id: "transactions.cancel-stale-route-machine",
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
          submit: cancelRouteLeakTransaction,
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

type ScopedSaveEvent =
  | Readonly<{ readonly type: "SAVE_A1" }>
  | Readonly<{ readonly type: "SAVE_B1" }>
  | Readonly<{ readonly type: "SAVE_A2" }>
  | Readonly<{ readonly type: "SAVE_B2" }>
  | Readonly<{ readonly type: "SAVED"; readonly project: ProjectRecord }>
  | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>;

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

const scopedSerializeMachine = flow.machine<SerialSaveContext, ScopedSaveEvent, "ready", "ready">({
  id: "transactions.scoped-serialize-machine",
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
        SAVE_A1: {
          submit: scopedSerializedSaveProjectTransactionA1,
          update: ({ context, event }) =>
            event.type === "SAVE_A1"
              ? {
                  draft: {
                    ...context.draft,
                    name: "Draft A1",
                  },
                }
              : {},
        },
        SAVE_B1: {
          submit: scopedSerializedSaveProjectTransactionB1,
          update: ({ context, event }) =>
            event.type === "SAVE_B1"
              ? {
                  draft: {
                    ...context.draft,
                    name: "Draft B1",
                  },
                }
              : {},
        },
        SAVE_A2: {
          submit: scopedSerializedSaveProjectTransactionA2,
          update: ({ context, event }) =>
            event.type === "SAVE_A2"
              ? {
                  draft: {
                    ...context.draft,
                    name: "Draft A2",
                  },
                }
              : {},
        },
        SAVE_B2: {
          submit: scopedSerializedSaveProjectTransactionB2,
          update: ({ context, event }) =>
            event.type === "SAVE_B2"
              ? {
                  draft: {
                    ...context.draft,
                    name: "Draft B2",
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
    flow.module("Transactions", {
      resources: {
        project: projectResource,
      },
      transactions: {
        save: saveProjectTransaction,
        serialSave: serializedSaveProjectTransaction,
        cancelSave: cancelPreviousSaveProjectTransaction,
        cancelDefectSave: cancelDefectTransaction,
        allowSave: allowedSaveProjectTransaction,
        overlapSaveA: overlappingSaveProjectTransactionA,
        overlapSaveB: overlappingSaveProjectTransactionB,
        scopedSaveA1: scopedSerializedSaveProjectTransactionA1,
        scopedSaveB1: scopedSerializedSaveProjectTransactionB1,
        scopedSaveA2: scopedSerializedSaveProjectTransactionA2,
        scopedSaveB2: scopedSerializedSaveProjectTransactionB2,
      },
      machines: {
        submit: submitMachine,
        serialize: serializeMachine,
        reject: rejectMachine,
        cancel: cancelMachine,
        cancelDefect: cancelDefectMachine,
        allow: allowMachine,
        overlap: overlapMachine,
        scopedSerialize: scopedSerializeMachine,
        run: runMachine,
      },
    }),
  ],
});

const seededProject = {
  ref: projectResource.ref("project-1"),
  value: { id: "project-1", name: "Seeded v1" },
} as const;

function runSeededAppScenario<Context, Event extends FlowEvent, State extends string>(
  machine: FlowMachine<Context, Event, State>,
  options?: Readonly<{
    readonly provide?: Layer.Any | ReadonlyArray<Layer.Any>;
    readonly clock?: () => number;
    readonly events?: ReadonlyArray<Event>;
  }>,
): FlowTestHarness<Context, Event, State> {
  return test
    .app(testApp)
    .scenario(machine)
    .with({
      resources: [seededProject],
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

type ActiveRuntimeLifecycleBoundary = "stop" | "dispose";
type ActiveRuntimeLifecycleOutcome = "success" | "failure" | "defect";

type ActiveRuntimeLifecycleCase = Readonly<{
  readonly boundary: ActiveRuntimeLifecycleBoundary;
  readonly outcome: ActiveRuntimeLifecycleOutcome;
  readonly actorId: string;
  readonly activeName: string;
  readonly lateResultName: string;
}>;

type SerializeProgressionCase = Readonly<{
  readonly actorId: string;
  readonly activeName: string;
  readonly queuedName: string;
}>;

type TransactionReceiptCounts = Readonly<{
  readonly start: number;
  readonly queue: number;
  readonly dequeue: number;
  readonly success: number;
  readonly failure: number;
  readonly defect: number;
  readonly interrupt: number;
}>;

type ScopedSerializeProgressionCase = Readonly<{
  readonly actorId: string;
  readonly firstActiveId: string;
  readonly firstActiveName: string;
  readonly firstQueuedId: string;
  readonly firstQueuedName: string;
  readonly secondActiveId: string;
  readonly secondActiveName: string;
  readonly secondQueuedId: string;
  readonly secondQueuedName: string;
}>;

type AllowLatestWinsSurface = "flowTest" | "runtime-actor";

type AllowLatestWinsCase = Readonly<{
  readonly surface: AllowLatestWinsSurface;
  readonly actorId: string;
  readonly olderName: string;
  readonly newerName: string;
}>;

type AllowStalePublicationOutcome = "success" | "failure" | "defect";

type AllowStalePublicationSurface = "flowTest" | "runtime-actor";

type AllowStalePublicationCase = Readonly<{
  readonly surface: AllowStalePublicationSurface;
  readonly outcome: AllowStalePublicationOutcome;
  readonly actorId: string;
  readonly transactionId: string;
  readonly olderName: string;
  readonly newerName: string;
}>;

type StaleRouteLeakOutcome = "success" | "failure" | "defect";

type StaleRouteLeakSurface = "flowTest" | "runtime-actor";

type StaleRouteLeakCase = Readonly<{
  readonly surface: StaleRouteLeakSurface;
  readonly outcome: StaleRouteLeakOutcome;
  readonly actorId: string;
  readonly olderName: string;
  readonly newerName: string;
}>;

const activeRuntimeLifecycleCases = [
  {
    boundary: "stop",
    outcome: "success",
    actorId: "transactions-stop-abort-actor",
    activeName: "Draft Stop",
    lateResultName: "Late Stop Success",
  },
  {
    boundary: "stop",
    outcome: "failure",
    actorId: "transactions-stop-failure-actor",
    activeName: "Draft Stop Failure",
    lateResultName: "Late Stop Failure",
  },
  {
    boundary: "stop",
    outcome: "defect",
    actorId: "transactions-stop-defect-actor",
    activeName: "Draft Stop Defect",
    lateResultName: "late stop defect",
  },
  {
    boundary: "dispose",
    outcome: "success",
    actorId: "transactions-runtime-dispose-actor",
    activeName: "Draft Dispose",
    lateResultName: "Late Dispose Success",
  },
  {
    boundary: "dispose",
    outcome: "failure",
    actorId: "transactions-runtime-dispose-failure-actor",
    activeName: "Draft Dispose Failure",
    lateResultName: "Late Dispose Failure",
  },
  {
    boundary: "dispose",
    outcome: "defect",
    actorId: "transactions-runtime-dispose-defect-actor",
    activeName: "Draft Dispose Defect",
    lateResultName: "late dispose defect",
  },
] as const satisfies ReadonlyArray<ActiveRuntimeLifecycleCase>;

const serializeProgressionCases = [
  {
    actorId: "transactions-serialize-runtime-actor",
    activeName: "Draft A",
    queuedName: "Draft B",
  },
] as const satisfies ReadonlyArray<SerializeProgressionCase>;

const scopedSerializeProgressionCases = [
  {
    actorId: "transactions-scoped-serialize-runtime-actor",
    firstActiveId: "transactions.save-scope-a1",
    firstActiveName: "Draft A1",
    firstQueuedId: "transactions.save-scope-b1",
    firstQueuedName: "Draft B1",
    secondActiveId: "transactions.save-scope-a2",
    secondActiveName: "Draft A2",
    secondQueuedId: "transactions.save-scope-b2",
    secondQueuedName: "Draft B2",
  },
] as const satisfies ReadonlyArray<ScopedSerializeProgressionCase>;

const allowLatestWinsCases = [
  {
    surface: "flowTest",
    actorId: "transactions-allow-flow-test",
    olderName: "Draft A",
    newerName: "Draft B",
  },
  {
    surface: "runtime-actor",
    actorId: "transactions-allow-runtime-actor",
    olderName: "Draft A",
    newerName: "Draft B",
  },
] as const satisfies ReadonlyArray<AllowLatestWinsCase>;

const allowStalePublicationCases = [
  {
    surface: "flowTest",
    outcome: "success",
    actorId: "transactions-allow-stale-success-flow-test",
    transactionId: "transactions.save-allow",
    olderName: "Draft A",
    newerName: "Draft B",
  },
  {
    surface: "runtime-actor",
    outcome: "success",
    actorId: "transactions-allow-stale-success-runtime-actor",
    transactionId: "transactions.save-allow",
    olderName: "Draft A",
    newerName: "Draft B",
  },
  {
    surface: "flowTest",
    outcome: "failure",
    actorId: "transactions-allow-stale-failure-flow-test",
    transactionId: "transactions.save-allow",
    olderName: "Draft A",
    newerName: "Draft B",
  },
  {
    surface: "runtime-actor",
    outcome: "failure",
    actorId: "transactions-allow-stale-failure-runtime-actor",
    transactionId: "transactions.save-allow",
    olderName: "Draft A",
    newerName: "Draft B",
  },
  {
    surface: "flowTest",
    outcome: "defect",
    actorId: "transactions-allow-stale-defect-flow-test",
    transactionId: "transactions.save-allow-defect",
    olderName: "Draft A",
    newerName: "Draft B",
  },
  {
    surface: "runtime-actor",
    outcome: "defect",
    actorId: "transactions-allow-stale-defect-runtime-actor",
    transactionId: "transactions.save-allow-defect",
    olderName: "Draft A",
    newerName: "Draft B",
  },
] as const satisfies ReadonlyArray<AllowStalePublicationCase>;

const staleRouteLeakCases = [
  {
    surface: "flowTest",
    outcome: "success",
    actorId: "transactions-allow-stale-route-success-flow-test",
    olderName: "Older stale success",
    newerName: "Newer winning success",
  },
  {
    surface: "runtime-actor",
    outcome: "success",
    actorId: "transactions-allow-stale-route-success-runtime-actor",
    olderName: "Older stale success",
    newerName: "Newer winning success",
  },
  {
    surface: "flowTest",
    outcome: "failure",
    actorId: "transactions-allow-stale-route-failure-flow-test",
    olderName: "Older stale failure",
    newerName: "Newer winning failure",
  },
  {
    surface: "runtime-actor",
    outcome: "failure",
    actorId: "transactions-allow-stale-route-failure-runtime-actor",
    olderName: "Older stale failure",
    newerName: "Newer winning failure",
  },
  {
    surface: "flowTest",
    outcome: "defect",
    actorId: "transactions-allow-stale-route-defect-flow-test",
    olderName: "Older stale defect",
    newerName: "Newer winning defect",
  },
  {
    surface: "runtime-actor",
    outcome: "defect",
    actorId: "transactions-allow-stale-route-defect-runtime-actor",
    olderName: "Older stale defect",
    newerName: "Newer winning defect",
  },
] as const satisfies ReadonlyArray<StaleRouteLeakCase>;

function activeRuntimeLifecycleOracle(caseDef: ActiveRuntimeLifecycleCase) {
  const terminalReceiptType =
    caseDef.outcome === "success"
      ? "transaction:success"
      : caseDef.outcome === "failure"
        ? "transaction:failure"
        : "transaction:defect";

  return Object.freeze({
    transactionId: "transactions.save-serial",
    resourceId: "transactions.project",
    pending: Object.freeze({
      callNames: [caseDef.activeName],
      receiptTypes: ["transaction:start", "transaction:preview-patch"] as const,
      status: "pending" as const,
      resourceName: caseDef.activeName,
    }),
    terminal: Object.freeze({
      callNames: [caseDef.activeName],
      savedNames: [] as const,
      status: "interrupt" as const,
      resourceName: seededProject.value.name,
      terminalReceiptType,
      terminalReceiptCount: 0,
    }),
  });
}

function serializeProgressionOracle(caseDef: SerializeProgressionCase) {
  return Object.freeze({
    transactionId: "transactions.save-serial",
    pending: Object.freeze({
      callNames: [caseDef.activeName],
      status: "pending" as const,
      queuedReceiptCount: 1,
      receiptCounts: Object.freeze({
        start: 1,
        queue: 1,
        dequeue: 0,
        success: 0,
        failure: 0,
        defect: 0,
        interrupt: 0,
      }),
    }),
    resumed: Object.freeze({
      callNames: [caseDef.activeName, caseDef.queuedName],
      savedNames: [caseDef.activeName],
      status: "pending" as const,
      queuedReceiptCount: 1,
      receiptCounts: Object.freeze({
        start: 2,
        queue: 1,
        dequeue: 1,
        success: 1,
        failure: 0,
        defect: 0,
        interrupt: 0,
      }),
    }),
    terminal: Object.freeze({
      callNames: [caseDef.activeName, caseDef.queuedName],
      savedNames: [caseDef.activeName, caseDef.queuedName],
      status: "success" as const,
      valueName: caseDef.queuedName,
      queuedReceiptCount: 1,
      receiptCounts: Object.freeze({
        start: 2,
        queue: 1,
        dequeue: 1,
        success: 2,
        failure: 0,
        defect: 0,
        interrupt: 0,
      }),
    }),
  });
}

function allowLatestWinsOracle(caseDef: AllowLatestWinsCase) {
  return Object.freeze({
    transactionId: "transactions.save-allow",
    resourceId: "transactions.project",
    pending: Object.freeze({
      callNames: [caseDef.olderName, caseDef.newerName],
      resourceName: caseDef.newerName,
      status: "pending" as const,
      receiptCounts: Object.freeze({
        start: 2,
        queue: 0,
        dequeue: 0,
        success: 0,
        failure: 0,
        defect: 0,
        interrupt: 0,
      }),
      rejectCount: 0,
    }),
    staleFailure: Object.freeze({
      callNames: [caseDef.olderName, caseDef.newerName],
      savedNames: [] as const,
      resourceName: caseDef.newerName,
      status: "pending" as const,
      receiptCounts: Object.freeze({
        start: 2,
        queue: 0,
        dequeue: 0,
        success: 0,
        failure: 0,
        defect: 0,
        interrupt: 0,
      }),
      issueCount: 0,
    }),
    terminal: Object.freeze({
      callNames: [caseDef.olderName, caseDef.newerName],
      savedNames: [caseDef.newerName] as const,
      resourceName: caseDef.newerName,
      status: "success" as const,
      valueName: caseDef.newerName,
      receiptCounts: Object.freeze({
        start: 2,
        queue: 0,
        dequeue: 0,
        success: 1,
        failure: 0,
        defect: 0,
        interrupt: 0,
      }),
      issueCount: 0,
    }),
  });
}

function allowStalePublicationOracle(caseDef: AllowStalePublicationCase) {
  return Object.freeze({
    transactionId: caseDef.transactionId,
    resourceId: "transactions.project",
    callNames: [caseDef.olderName, caseDef.newerName],
    winning: Object.freeze({
      savedNames: [caseDef.newerName] as const,
      status: "success" as const,
      valueName: caseDef.newerName,
      receiptCounts: Object.freeze({
        start: 2,
        queue: 0,
        dequeue: 0,
        success: 1,
        failure: 0,
        defect: 0,
        interrupt: 0,
      }),
      invalidateCount: 1,
      issueCount: 0,
      defected: false,
    }),
    stale: Object.freeze({
      savedNames: [caseDef.newerName] as const,
      status: "success" as const,
      valueName: caseDef.newerName,
      receiptCounts: Object.freeze({
        start: 2,
        queue: 0,
        dequeue: 0,
        success: 1,
        failure: 0,
        defect: 0,
        interrupt: 0,
      }),
      invalidateCount: 1,
      issueCount: 0,
      defected: false,
    }),
  });
}

function scopedSerializeProgressionOracle(caseDef: ScopedSerializeProgressionCase) {
  return Object.freeze({
    pending: Object.freeze({
      callNames: [caseDef.firstActiveName, caseDef.secondActiveName] as const,
      activeTransactionIds: [caseDef.firstActiveId, caseDef.secondActiveId] as const,
      queuedTransactionIds: [caseDef.firstQueuedId, caseDef.secondQueuedId] as const,
      receiptCounts: Object.freeze({
        [caseDef.firstActiveId]: Object.freeze({
          start: 1,
          queue: 0,
          dequeue: 0,
          success: 0,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
        [caseDef.firstQueuedId]: Object.freeze({
          start: 0,
          queue: 1,
          dequeue: 0,
          success: 0,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
        [caseDef.secondActiveId]: Object.freeze({
          start: 1,
          queue: 0,
          dequeue: 0,
          success: 0,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
        [caseDef.secondQueuedId]: Object.freeze({
          start: 0,
          queue: 1,
          dequeue: 0,
          success: 0,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
      }),
    }),
    resumed: Object.freeze({
      callNames: [
        caseDef.firstActiveName,
        caseDef.secondActiveName,
        caseDef.firstQueuedName,
        caseDef.secondQueuedName,
      ] as const,
      savedNames: [caseDef.firstActiveName, caseDef.secondActiveName] as const,
      receiptCounts: Object.freeze({
        [caseDef.firstActiveId]: Object.freeze({
          start: 1,
          queue: 0,
          dequeue: 0,
          success: 1,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
        [caseDef.firstQueuedId]: Object.freeze({
          start: 1,
          queue: 1,
          dequeue: 1,
          success: 0,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
        [caseDef.secondActiveId]: Object.freeze({
          start: 1,
          queue: 0,
          dequeue: 0,
          success: 1,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
        [caseDef.secondQueuedId]: Object.freeze({
          start: 1,
          queue: 1,
          dequeue: 1,
          success: 0,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
      }),
    }),
    terminal: Object.freeze({
      callNames: [
        caseDef.firstActiveName,
        caseDef.secondActiveName,
        caseDef.firstQueuedName,
        caseDef.secondQueuedName,
      ] as const,
      savedNames: [
        caseDef.firstActiveName,
        caseDef.secondActiveName,
        caseDef.firstQueuedName,
        caseDef.secondQueuedName,
      ] as const,
      transactionValues: Object.freeze({
        [caseDef.firstActiveId]: caseDef.firstActiveName,
        [caseDef.firstQueuedId]: caseDef.firstQueuedName,
        [caseDef.secondActiveId]: caseDef.secondActiveName,
        [caseDef.secondQueuedId]: caseDef.secondQueuedName,
      }),
      receiptCounts: Object.freeze({
        [caseDef.firstActiveId]: Object.freeze({
          start: 1,
          queue: 0,
          dequeue: 0,
          success: 1,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
        [caseDef.firstQueuedId]: Object.freeze({
          start: 1,
          queue: 1,
          dequeue: 1,
          success: 1,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
        [caseDef.secondActiveId]: Object.freeze({
          start: 1,
          queue: 0,
          dequeue: 0,
          success: 1,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
        [caseDef.secondQueuedId]: Object.freeze({
          start: 1,
          queue: 1,
          dequeue: 1,
          success: 1,
          failure: 0,
          defect: 0,
          interrupt: 0,
        } satisfies TransactionReceiptCounts),
      }),
    }),
  });
}

function expectTransactionReceiptCounts(
  receiptCount: (type: string) => number,
  counts: TransactionReceiptCounts,
) {
  expect(receiptCount("transaction:start")).toBe(counts.start);
  expect(receiptCount("transaction:queue")).toBe(counts.queue);
  expect(receiptCount("transaction:dequeue")).toBe(counts.dequeue);
  expect(receiptCount("transaction:success")).toBe(counts.success);
  expect(receiptCount("transaction:failure")).toBe(counts.failure);
  expect(receiptCount("transaction:defect")).toBe(counts.defect);
  expect(receiptCount("transaction:interrupt")).toBe(counts.interrupt);
}

function expectScopedSerializeProgressionReceiptCounts(
  receiptCount: (id: string, type: string) => number,
  counts: Readonly<Record<string, TransactionReceiptCounts>>,
) {
  for (const [id, transactionCounts] of Object.entries(counts)) {
    expectTransactionReceiptCounts((type) => receiptCount(id, type), transactionCounts);
  }
}

type QueuedSerializeLifecycleBoundary = "stop" | "dispose";
type QueuedSerializeLifecycleOutcome = "success" | "failure" | "defect";
type QueuedSerializeLifecycleSurface = "rehydrated-harness" | "runtime-actor";

type QueuedSerializeLifecycleCase = Readonly<{
  readonly surface: QueuedSerializeLifecycleSurface;
  readonly boundary: QueuedSerializeLifecycleBoundary;
  readonly outcome: QueuedSerializeLifecycleOutcome;
  readonly actorId: string;
  readonly activeName: string;
  readonly queuedName: string;
  readonly lateResultName: string;
}>;

const queuedSerializeLifecycleCases = [
  {
    surface: "runtime-actor",
    boundary: "stop",
    outcome: "success",
    actorId: "transactions-stop-queued-actor",
    activeName: "Draft Active",
    queuedName: "Draft Queued",
    lateResultName: "Late Active Success",
  },
  {
    surface: "runtime-actor",
    boundary: "stop",
    outcome: "failure",
    actorId: "transactions-stop-queued-failure-actor",
    activeName: "Draft Active Failure",
    queuedName: "Draft Queued Failure",
    lateResultName: "Late Queued Failure",
  },
  {
    surface: "runtime-actor",
    boundary: "stop",
    outcome: "defect",
    actorId: "transactions-stop-queued-defect-actor",
    activeName: "Draft Active Defect",
    queuedName: "Draft Queued Defect",
    lateResultName: "late queued stop defect",
  },
  {
    surface: "runtime-actor",
    boundary: "dispose",
    outcome: "success",
    actorId: "transactions-runtime-dispose-queued-actor",
    activeName: "Draft Dispose Active",
    queuedName: "Draft Dispose Queued",
    lateResultName: "Late Dispose Success",
  },
  {
    surface: "runtime-actor",
    boundary: "dispose",
    outcome: "failure",
    actorId: "transactions-runtime-dispose-queued-failure-actor",
    activeName: "Draft Dispose Failure Active",
    queuedName: "Draft Dispose Failure Queued",
    lateResultName: "Late Dispose Failure",
  },
  {
    surface: "runtime-actor",
    boundary: "dispose",
    outcome: "defect",
    actorId: "transactions-runtime-dispose-queued-defect-actor",
    activeName: "Draft Dispose Defect Active",
    queuedName: "Draft Dispose Defect Queued",
    lateResultName: "late queued dispose defect",
  },
  {
    surface: "rehydrated-harness",
    boundary: "stop",
    outcome: "success",
    actorId: "transactions-stop-queued-harness-actor",
    activeName: "Draft Harness Active",
    queuedName: "Draft Harness Queued",
    lateResultName: "Late Harness Success",
  },
  {
    surface: "rehydrated-harness",
    boundary: "stop",
    outcome: "failure",
    actorId: "transactions-stop-queued-harness-failure-actor",
    activeName: "Draft Harness Failure Active",
    queuedName: "Draft Harness Failure Queued",
    lateResultName: "Late Harness Failure",
  },
  {
    surface: "rehydrated-harness",
    boundary: "stop",
    outcome: "defect",
    actorId: "transactions-stop-queued-harness-defect-actor",
    activeName: "Draft Harness Defect Active",
    queuedName: "Draft Harness Defect Queued",
    lateResultName: "late harness stop defect",
  },
  {
    surface: "rehydrated-harness",
    boundary: "dispose",
    outcome: "success",
    actorId: "transactions-runtime-dispose-queued-harness-actor",
    activeName: "Draft Dispose Harness Active",
    queuedName: "Draft Dispose Harness Queued",
    lateResultName: "Late Dispose Harness Success",
  },
  {
    surface: "rehydrated-harness",
    boundary: "dispose",
    outcome: "failure",
    actorId: "transactions-runtime-dispose-queued-harness-failure-actor",
    activeName: "Draft Dispose Harness Failure Active",
    queuedName: "Draft Dispose Harness Failure Queued",
    lateResultName: "Late Dispose Harness Failure",
  },
  {
    surface: "rehydrated-harness",
    boundary: "dispose",
    outcome: "defect",
    actorId: "transactions-runtime-dispose-queued-harness-defect-actor",
    activeName: "Draft Dispose Harness Defect Active",
    queuedName: "Draft Dispose Harness Defect Queued",
    lateResultName: "late dispose harness defect",
  },
] as const satisfies ReadonlyArray<QueuedSerializeLifecycleCase>;

function queuedSerializeLifecycleOracle(caseDef: QueuedSerializeLifecycleCase) {
  const terminalReceiptType =
    caseDef.outcome === "success"
      ? "transaction:success"
      : caseDef.outcome === "failure"
        ? "transaction:failure"
        : "transaction:defect";

  return Object.freeze({
    transactionId: "transactions.save-serial",
    pending: Object.freeze({
      callNames: [caseDef.activeName],
      status: "pending" as const,
      ready: 0,
      activeFibers: 1,
      mailboxes: [] as const,
      transactions: ["transactions.save-serial"] as const,
    }),
    terminal: Object.freeze({
      callNames: [caseDef.activeName],
      status: "interrupt" as const,
      savedNames: [] as const,
      dequeueCount: 0,
      terminalReceiptType,
      terminalReceiptCount: 0,
    }),
  });
}

type AbortableHarnessControls = Readonly<{
  readonly layer: Layer.Any;
  readonly calls: SaveParams[];
  readonly entryAt: (index: number) => Readonly<{
    readonly signal: AbortSignal;
    readonly abortCount: () => number;
  }>;
}>;

type ControlledSaveControls = ReturnType<typeof createControlledSaveLayer>;
type ControlledSaveExitControls = ReturnType<typeof createControlledSaveExitLayer>;

function isControlledSaveExitControls(
  controls: ControlledSaveControls | ControlledSaveExitControls,
): controls is ControlledSaveExitControls {
  return "defectAt" in controls;
}

async function expectSerializeProgressionRuntimeActorMatchesOracle(
  caseDef: SerializeProgressionCase,
  controls: ReturnType<typeof createControlledSaveLayer>,
) {
  const expected = serializeProgressionOracle(caseDef);
  const runtime = flow.runtime(
    testApp.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [controls.layer],
    }),
  );

  runtime.resources.seedResources([seededProject]);
  const actor = runtime.orchestrators.start(serializeMachine, {
    id: caseDef.actorId,
    policy: "keep-alive",
  });

  const receiptCount = (type: string) =>
    actor
      .receipts()
      .filter((receipt) => receipt.id === expected.transactionId && receipt.type === type).length;

  try {
    actor.send({ type: "SAVE", name: caseDef.activeName });
    actor.send({ type: "SAVE", name: caseDef.queuedName });
    await actor.flush();

    expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.pending.callNames);
    expect(actor.snapshot().transactions[expected.transactionId]).toMatchObject({
      status: expected.pending.status,
    });
    expectTransactionReceiptCounts(receiptCount, expected.pending.receiptCounts);

    controls.succeedAt(0, {
      id: "project-1",
      name: caseDef.activeName,
    });
    await actor.flush();
    await actor.flush();

    expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.resumed.callNames);
    expect(actor.snapshot().context.savedNames).toEqual(expected.resumed.savedNames);
    expect(actor.snapshot().transactions[expected.transactionId]).toMatchObject({
      status: expected.resumed.status,
    });
    expectTransactionReceiptCounts(receiptCount, expected.resumed.receiptCounts);

    controls.succeedAt(1, {
      id: "project-1",
      name: caseDef.queuedName,
    });
    await actor.flush();
    await actor.flush();

    expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.terminal.callNames);
    expect(actor.snapshot().context.savedNames).toEqual(expected.terminal.savedNames);
    expect(actor.snapshot().transactions[expected.transactionId]).toMatchObject({
      status: expected.terminal.status,
      value: { id: "project-1", name: expected.terminal.valueName },
    });
    expectTransactionReceiptCounts(receiptCount, expected.terminal.receiptCounts);
  } finally {
    await runtime.dispose();
  }
}

async function expectSerializeProgressionHarnessMatchesOracle(
  caseDef: SerializeProgressionCase,
  controls: ReturnType<typeof createControlledSaveLayer>,
) {
  const expected = serializeProgressionOracle(caseDef);
  const harness = runSeededAppScenario(serializeMachine, {
    provide: controls.layer,
    events: [
      { type: "SAVE", name: caseDef.activeName },
      { type: "SAVE", name: caseDef.queuedName },
    ],
  });

  const receiptCount = (type: string) =>
    harness
      .transactions()
      .events(expected.transactionId)
      .filter((receipt) => receipt.type === type).length;

  expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.pending.callNames);
  expect(harness.transactions().get(expected.transactionId)).toMatchObject({
    status: expected.pending.status,
  });
  expect(harness.transactions().queued(expected.transactionId)).toHaveLength(
    expected.pending.queuedReceiptCount,
  );
  expectTransactionReceiptCounts(receiptCount, expected.pending.receiptCounts);

  controls.succeedAt(0, {
    id: "project-1",
    name: caseDef.activeName,
  });
  await harness.flush();
  await harness.flush();

  expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.resumed.callNames);
  expect(harness.context().savedNames).toEqual(expected.resumed.savedNames);
  expect(harness.transactions().get(expected.transactionId)).toMatchObject({
    status: expected.resumed.status,
  });
  expect(harness.transactions().queued(expected.transactionId)).toHaveLength(
    expected.resumed.queuedReceiptCount,
  );
  expectTransactionReceiptCounts(receiptCount, expected.resumed.receiptCounts);

  controls.succeedAt(1, {
    id: "project-1",
    name: caseDef.queuedName,
  });
  await harness.flush();
  await harness.flush();

  expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.terminal.callNames);
  expect(harness.context()).toMatchObject({
    savedNames: expected.terminal.savedNames,
    error: null,
  });
  expect(harness.transactions().get(expected.transactionId)).toMatchObject({
    status: expected.terminal.status,
    value: { id: "project-1", name: expected.terminal.valueName },
  });
  expect(harness.transactions().queued(expected.transactionId)).toHaveLength(
    expected.terminal.queuedReceiptCount,
  );
  expectTransactionReceiptCounts(receiptCount, expected.terminal.receiptCounts);
  expectNoPendingWork(harness);
}

async function expectAllowLatestWinsHarnessMatchesOracle(
  caseDef: AllowLatestWinsCase,
  controls: ReturnType<typeof createControlledSaveLayer>,
) {
  const expected = allowLatestWinsOracle(caseDef);
  const harness = runSeededAppScenario(allowMachine, {
    provide: controls.layer,
    events: [
      { type: "SAVE", name: caseDef.olderName },
      { type: "SAVE", name: caseDef.newerName },
    ],
  });
  const receiptCount = (type: string) =>
    harness
      .transactions()
      .events(expected.transactionId)
      .filter((receipt) => receipt.type === type).length;

  expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.pending.callNames);
  expect(harness.cache().query(expected.resourceId)).toMatchObject({
    value: { id: "project-1", name: expected.pending.resourceName },
  });
  expect(harness.transactions().get(expected.transactionId)).toMatchObject({
    status: expected.pending.status,
  });
  expectTransactionReceiptCounts(receiptCount, expected.pending.receiptCounts);
  expect(
    harness
      .transactions()
      .events(expected.transactionId)
      .filter((receipt) => receipt.type === "transaction:reject"),
  ).toHaveLength(expected.pending.rejectCount);

  controls.failAt(0, "conflict");
  await harness.flush();
  await harness.flush();

  expect(controls.calls.map((params) => params.draft.name)).toEqual(
    expected.staleFailure.callNames,
  );
  expect(harness.cache().query(expected.resourceId)).toMatchObject({
    value: { id: "project-1", name: expected.staleFailure.resourceName },
  });
  expect(harness.context()).toMatchObject({
    savedNames: expected.staleFailure.savedNames,
    error: null,
  });
  expect(harness.transactions().get(expected.transactionId)).toMatchObject({
    status: expected.staleFailure.status,
  });
  expectTransactionReceiptCounts(receiptCount, expected.staleFailure.receiptCounts);
  expect(harness.issues()).toHaveLength(expected.staleFailure.issueCount);

  controls.succeedAt(1, { id: "project-1", name: caseDef.newerName });
  await harness.flush();
  await harness.flush();

  expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.terminal.callNames);
  expect(harness.cache().query(expected.resourceId)).toMatchObject({
    value: { id: "project-1", name: expected.terminal.resourceName },
  });
  expect(harness.context()).toMatchObject({
    savedNames: expected.terminal.savedNames,
    error: null,
  });
  expect(harness.transactions().get(expected.transactionId)).toMatchObject({
    status: expected.terminal.status,
    value: { id: "project-1", name: expected.terminal.valueName },
  });
  expectTransactionReceiptCounts(receiptCount, expected.terminal.receiptCounts);
  expect(harness.issues()).toHaveLength(expected.terminal.issueCount);
  expectNoPendingWork(harness);
}

async function expectScopedSerializeProgressionHarnessMatchesOracle(
  caseDef: ScopedSerializeProgressionCase,
  controls: ReturnType<typeof createControlledSaveLayer>,
) {
  const expected = scopedSerializeProgressionOracle(caseDef);
  const harness = runSeededAppScenario(scopedSerializeMachine, {
    provide: controls.layer,
    events: [{ type: "SAVE_A1" }, { type: "SAVE_B1" }, { type: "SAVE_A2" }, { type: "SAVE_B2" }],
  });
  const receiptCount = (id: string, type: string) =>
    harness
      .transactions()
      .events(id)
      .filter((receipt) => receipt.type === type).length;

  expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.pending.callNames);
  expect(harness.transactions().queued(caseDef.firstQueuedId)).toHaveLength(1);
  expect(harness.transactions().queued(caseDef.secondQueuedId)).toHaveLength(1);
  for (const id of expected.pending.activeTransactionIds) {
    expect(harness.transactions().get(id)).toMatchObject({ status: "pending" });
  }
  expectScopedSerializeProgressionReceiptCounts(receiptCount, expected.pending.receiptCounts);

  controls.succeedAt(0, { id: "project-1", name: caseDef.firstActiveName });
  controls.succeedAt(1, { id: "project-1", name: caseDef.secondActiveName });
  await harness.flush();
  await harness.flush();

  expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.resumed.callNames);
  expect(harness.context()).toMatchObject({
    savedNames: expected.resumed.savedNames,
    error: null,
  });
  expectScopedSerializeProgressionReceiptCounts(receiptCount, expected.resumed.receiptCounts);

  controls.succeedAt(2, { id: "project-1", name: caseDef.firstQueuedName });
  controls.succeedAt(3, { id: "project-1", name: caseDef.secondQueuedName });
  await harness.flush();
  await harness.flush();

  expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.terminal.callNames);
  expect(harness.context()).toMatchObject({
    savedNames: expected.terminal.savedNames,
    error: null,
  });
  for (const [id, valueName] of Object.entries(expected.terminal.transactionValues)) {
    expect(harness.transactions().get(id)).toMatchObject({
      status: "success",
      value: { id: "project-1", name: valueName },
    });
  }
  expectScopedSerializeProgressionReceiptCounts(receiptCount, expected.terminal.receiptCounts);
  expectNoPendingWork(harness);
}

async function expectScopedSerializeProgressionRuntimeActorMatchesOracle(
  caseDef: ScopedSerializeProgressionCase,
  controls: ReturnType<typeof createControlledSaveLayer>,
) {
  const expected = scopedSerializeProgressionOracle(caseDef);
  const runtime = flow.runtime(
    testApp.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [controls.layer],
    }),
  );

  runtime.resources.seedResources([seededProject]);
  const actor = runtime.orchestrators.start(scopedSerializeMachine, {
    id: caseDef.actorId,
    policy: "keep-alive",
  });
  const receiptCount = (id: string, type: string) =>
    actor.receipts().filter((receipt) => receipt.id === id && receipt.type === type).length;

  try {
    actor.send({ type: "SAVE_A1" });
    actor.send({ type: "SAVE_B1" });
    actor.send({ type: "SAVE_A2" });
    actor.send({ type: "SAVE_B2" });
    await actor.flush();

    expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.pending.callNames);
    for (const id of expected.pending.activeTransactionIds) {
      expect(actor.snapshot().transactions[id]).toMatchObject({ status: "pending" });
    }
    expectScopedSerializeProgressionReceiptCounts(receiptCount, expected.pending.receiptCounts);

    controls.succeedAt(0, { id: "project-1", name: caseDef.firstActiveName });
    controls.succeedAt(1, { id: "project-1", name: caseDef.secondActiveName });
    await actor.flush();
    await actor.flush();

    expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.resumed.callNames);
    expect(actor.snapshot().context.savedNames).toEqual(expected.resumed.savedNames);
    expectScopedSerializeProgressionReceiptCounts(receiptCount, expected.resumed.receiptCounts);

    controls.succeedAt(2, { id: "project-1", name: caseDef.firstQueuedName });
    controls.succeedAt(3, { id: "project-1", name: caseDef.secondQueuedName });
    await actor.flush();
    await actor.flush();

    expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.terminal.callNames);
    expect(actor.snapshot().context.savedNames).toEqual(expected.terminal.savedNames);
    for (const [id, valueName] of Object.entries(expected.terminal.transactionValues)) {
      expect(actor.snapshot().transactions[id]).toMatchObject({
        status: "success",
        value: { id: "project-1", name: valueName },
      });
    }
    expectScopedSerializeProgressionReceiptCounts(receiptCount, expected.terminal.receiptCounts);
  } finally {
    await runtime.dispose();
  }
}

async function expectAllowLatestWinsRuntimeActorMatchesOracle(
  caseDef: AllowLatestWinsCase,
  controls: ReturnType<typeof createControlledSaveLayer>,
) {
  const expected = allowLatestWinsOracle(caseDef);
  const runtime = flow.runtime(
    testApp.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [controls.layer],
    }),
  );

  runtime.resources.seedResources([seededProject]);
  const actor = runtime.orchestrators.start(allowMachine, {
    id: caseDef.actorId,
    policy: "keep-alive",
  });
  const receiptCount = (type: string) =>
    actor
      .receipts()
      .filter((receipt) => receipt.id === expected.transactionId && receipt.type === type).length;

  try {
    actor.send({ type: "SAVE", name: caseDef.olderName });
    actor.send({ type: "SAVE", name: caseDef.newerName });
    await actor.flush();

    expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.pending.callNames);
    expect(actor.snapshot().resources[expected.resourceId]).toMatchObject({
      value: { id: "project-1", name: expected.pending.resourceName },
    });
    expect(actor.snapshot().transactions[expected.transactionId]).toMatchObject({
      status: expected.pending.status,
    });
    expectTransactionReceiptCounts(receiptCount, expected.pending.receiptCounts);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === expected.transactionId && receipt.type === "transaction:reject",
        ),
    ).toHaveLength(expected.pending.rejectCount);

    controls.failAt(0, "conflict");
    await actor.flush();
    await actor.flush();

    expect(controls.calls.map((params) => params.draft.name)).toEqual(
      expected.staleFailure.callNames,
    );
    expect(actor.snapshot().resources[expected.resourceId]).toMatchObject({
      value: { id: "project-1", name: expected.staleFailure.resourceName },
    });
    expect(actor.snapshot().context).toMatchObject({
      savedNames: expected.staleFailure.savedNames,
      error: null,
    });
    expect(actor.snapshot().transactions[expected.transactionId]).toMatchObject({
      status: expected.staleFailure.status,
    });
    expectTransactionReceiptCounts(receiptCount, expected.staleFailure.receiptCounts);
    expect(actor.issues()).toHaveLength(expected.staleFailure.issueCount);

    controls.succeedAt(1, { id: "project-1", name: caseDef.newerName });
    await actor.flush();
    await actor.flush();

    expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.terminal.callNames);
    expect(actor.snapshot().resources[expected.resourceId]).toMatchObject({
      value: { id: "project-1", name: expected.terminal.resourceName },
    });
    expect(actor.snapshot().context).toMatchObject({
      savedNames: expected.terminal.savedNames,
      error: null,
    });
    expect(actor.snapshot().transactions[expected.transactionId]).toMatchObject({
      status: expected.terminal.status,
      value: { id: "project-1", name: expected.terminal.valueName },
    });
    expectTransactionReceiptCounts(receiptCount, expected.terminal.receiptCounts);
    expect(actor.issues()).toHaveLength(expected.terminal.issueCount);
  } finally {
    await runtime.dispose();
  }
}

async function expectAllowStalePublicationHarnessMatchesOracle(caseDef: AllowStalePublicationCase) {
  const expected = allowStalePublicationOracle(caseDef);
  const controlled =
    caseDef.outcome === "defect" ? createControlledSaveExitLayer() : createControlledSaveLayer();
  const harness = runSeededAppScenario(
    caseDef.outcome === "defect" ? allowDefectMachine : allowMachine,
    {
      provide: controlled.layer,
      events: [
        { type: "SAVE", name: caseDef.olderName },
        { type: "SAVE", name: caseDef.newerName },
      ],
    },
  );
  const receiptCount = (type: string) =>
    harness
      .transactions()
      .events(expected.transactionId)
      .filter((receipt) => receipt.type === type).length;
  const invalidateCount = () =>
    harness
      .receipts()
      .filter(
        (receipt) => receipt.id === expected.resourceId && receipt.type === "resource:invalidate",
      ).length;

  if (caseDef.outcome === "defect") {
    await harness.flush();
  }

  expect(controlled.calls.map((params) => params.draft.name)).toEqual(expected.callNames);

  controlled.succeedAt(1, { id: "project-1", name: caseDef.newerName });
  await harness.flush();
  await harness.flush();

  expect(harness.context()).toMatchObject({
    savedNames: expected.winning.savedNames,
    error: null,
    ...(caseDef.outcome === "defect" ? { defected: expected.winning.defected } : {}),
  });
  expect(harness.transactions().get(expected.transactionId)).toMatchObject({
    status: expected.winning.status,
    value: { id: "project-1", name: expected.winning.valueName },
  });
  expectTransactionReceiptCounts(receiptCount, expected.winning.receiptCounts);
  expect(invalidateCount()).toBe(expected.winning.invalidateCount);
  expect(harness.issues()).toHaveLength(expected.winning.issueCount);

  if (caseDef.outcome === "success") {
    controlled.succeedAt(0, { id: "project-1", name: caseDef.olderName });
  } else if (caseDef.outcome === "failure") {
    controlled.failAt(0, "conflict");
  } else if (isControlledSaveExitControls(controlled)) {
    controlled.defectAt(0, new Error("save defect"));
  } else {
    throw new Error("Expected defect-capable controls for stale allow defect oracle");
  }
  await harness.flush();
  await harness.flush();

  expect(harness.context()).toMatchObject({
    savedNames: expected.stale.savedNames,
    error: null,
    ...(caseDef.outcome === "defect" ? { defected: expected.stale.defected } : {}),
  });
  expect(harness.transactions().get(expected.transactionId)).toMatchObject({
    status: expected.stale.status,
    value: { id: "project-1", name: expected.stale.valueName },
  });
  expectTransactionReceiptCounts(receiptCount, expected.stale.receiptCounts);
  expect(invalidateCount()).toBe(expected.stale.invalidateCount);
  expect(harness.issues()).toHaveLength(expected.stale.issueCount);
  expectNoPendingWork(harness);
}

async function expectActiveRuntimeLifecycleMatchesOracle(
  caseDef: ActiveRuntimeLifecycleCase,
  controls: AbortableHarnessControls,
  completeLate: () => void,
) {
  const expected = activeRuntimeLifecycleOracle(caseDef);
  const runtime = flow.runtime(
    testApp.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [controls.layer],
    }),
  );

  runtime.resources.seedResources([seededProject]);
  const actor = runtime.orchestrators.start(serializeMachine, {
    id: caseDef.actorId,
    policy: "keep-alive",
  });

  try {
    actor.send({ type: "SAVE", name: caseDef.activeName });
    await actor.flush();

    expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.pending.callNames);
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.id === expected.transactionId)
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(expected.pending.receiptTypes));
    expect(actor.snapshot().transactions[expected.transactionId]).toMatchObject({
      status: expected.pending.status,
    });
    expect(actor.snapshot().resources[expected.resourceId]).toMatchObject({
      value: { id: seededProject.value.id, name: expected.pending.resourceName },
    });

    const receiptsAfterPending = actor.receipts().length;
    if (caseDef.boundary === "stop") {
      await runtime.orchestrators.stop(actor.id);
    } else {
      await runtime.dispose();
    }
    await actor.flush();

    expect(controls.entryAt(0).signal.aborted).toBe(true);
    expect(controls.entryAt(0).abortCount()).toBe(1);
    expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.pending.callNames);
    expect(actor.snapshot().transactions[expected.transactionId]).toMatchObject({
      status: expected.terminal.status,
    });
    expect(actor.snapshot().resources[expected.resourceId]).toMatchObject({
      value: { id: seededProject.value.id, name: expected.terminal.resourceName },
    });
    const issuesAfterBoundary = actor.issues();
    const receiptsAfterBoundary = actor.receipts().length;
    expect(receiptsAfterBoundary).toBeGreaterThan(receiptsAfterPending);

    completeLate();
    await actor.flush();
    await actor.flush();

    expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.terminal.callNames);
    expect(actor.snapshot().context.savedNames).toEqual(expected.terminal.savedNames);
    expect(actor.issues()).toEqual(issuesAfterBoundary);
    expect(actor.snapshot().transactions[expected.transactionId]).toMatchObject({
      status: expected.terminal.status,
    });
    expect(actor.snapshot().resources[expected.resourceId]).toMatchObject({
      value: { id: seededProject.value.id, name: expected.terminal.resourceName },
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === expected.transactionId &&
            receipt.type === expected.terminal.terminalReceiptType,
        ),
    ).toHaveLength(expected.terminal.terminalReceiptCount);
    expect(actor.receipts()).toHaveLength(receiptsAfterBoundary);
  } finally {
    if (caseDef.boundary !== "dispose") {
      await runtime.dispose();
    }
  }
}

async function expectAllowStalePublicationRuntimeActorMatchesOracle(
  caseDef: AllowStalePublicationCase,
) {
  const expected = allowStalePublicationOracle(caseDef);
  const controlled =
    caseDef.outcome === "defect" ? createControlledSaveExitLayer() : createControlledSaveLayer();
  const runtime =
    caseDef.outcome === "defect"
      ? flow.runtime(
          flow
            .app({
              modules: [
                flow.module("TransactionsAllowDefect", {
                  resources: {
                    project: projectResource,
                  },
                  transactions: {
                    save: allowDefectTransaction,
                  },
                  machines: {
                    allowDefect: allowDefectMachine,
                  },
                }),
              ],
            })
            .layer({
              store: flow.store.test(),
              orchestrators: flow.orchestrators.test(),
              services: [controlled.layer],
            }),
        )
      : flow.runtime(
          testApp.layer({
            store: flow.store.test(),
            orchestrators: flow.orchestrators.test(),
            services: [controlled.layer],
          }),
        );

  runtime.resources.seedResources([seededProject]);
  const actor = runtime.orchestrators.start(
    caseDef.outcome === "defect" ? allowDefectMachine : allowMachine,
    {
      id: caseDef.actorId,
      policy: "keep-alive",
    },
  );
  const receiptCount = (type: string) =>
    actor
      .receipts()
      .filter((receipt) => receipt.id === expected.transactionId && receipt.type === type).length;
  const invalidateCount = () =>
    actor
      .receipts()
      .filter(
        (receipt) => receipt.id === expected.resourceId && receipt.type === "resource:invalidate",
      ).length;

  try {
    actor.send({ type: "SAVE", name: caseDef.olderName });
    actor.send({ type: "SAVE", name: caseDef.newerName });

    if (caseDef.outcome === "defect") {
      await actor.flush();
    }

    expect(controlled.calls.map((params) => params.draft.name)).toEqual(expected.callNames);

    controlled.succeedAt(1, { id: "project-1", name: caseDef.newerName });
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context).toMatchObject({
      savedNames: expected.winning.savedNames,
      error: null,
      ...(caseDef.outcome === "defect" ? { defected: expected.winning.defected } : {}),
    });
    expect(actor.snapshot().transactions[expected.transactionId]).toMatchObject({
      status: expected.winning.status,
      value: { id: "project-1", name: expected.winning.valueName },
    });
    expectTransactionReceiptCounts(receiptCount, expected.winning.receiptCounts);
    expect(invalidateCount()).toBe(expected.winning.invalidateCount);
    expect(actor.issues()).toHaveLength(expected.winning.issueCount);

    if (caseDef.outcome === "success") {
      controlled.succeedAt(0, { id: "project-1", name: caseDef.olderName });
    } else if (caseDef.outcome === "failure") {
      controlled.failAt(0, "conflict");
    } else if (isControlledSaveExitControls(controlled)) {
      controlled.defectAt(0, new Error("save defect"));
    } else {
      throw new Error("Expected defect-capable controls for stale allow defect oracle");
    }
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context).toMatchObject({
      savedNames: expected.stale.savedNames,
      error: null,
      ...(caseDef.outcome === "defect" ? { defected: expected.stale.defected } : {}),
    });
    expect(actor.snapshot().transactions[expected.transactionId]).toMatchObject({
      status: expected.stale.status,
      value: { id: "project-1", name: expected.stale.valueName },
    });
    expectTransactionReceiptCounts(receiptCount, expected.stale.receiptCounts);
    expect(invalidateCount()).toBe(expected.stale.invalidateCount);
    expect(actor.issues()).toHaveLength(expected.stale.issueCount);
  } finally {
    await runtime.dispose();
  }
}

async function expectStaleRouteLeakHarnessStaysSilent(caseDef: StaleRouteLeakCase) {
  const controlled =
    caseDef.outcome === "defect" ? createControlledSaveExitLayer() : createControlledSaveLayer();
  const harness = runSeededAppScenario(staleRouteLeakMachine, {
    provide: controlled.layer,
    events: [
      { type: "SAVE", name: caseDef.olderName },
      { type: "SAVE", name: caseDef.newerName },
    ],
  });

  if (caseDef.outcome === "defect") {
    await harness.flush();
  }

  controlled.succeedAt(1, { id: "project-1", name: caseDef.newerName });
  await harness.flush();
  await harness.flush();

  if (caseDef.outcome === "success") {
    controlled.succeedAt(0, { id: "project-1", name: caseDef.olderName });
  } else if (caseDef.outcome === "failure") {
    controlled.failAt(0, "conflict");
  } else if (isControlledSaveExitControls(controlled)) {
    controlled.defectAt(0, new Error("older defect"));
  } else {
    throw new Error("Expected defect-capable controls for stale route leak harness");
  }
  await harness.flush();
  await harness.flush();

  expect(harness.context()).toMatchObject({
    savedNames: [caseDef.newerName],
    error: null,
    defected: false,
  });
  expect(harness.transactions().get("transactions.save-allow-stale-route")).toMatchObject({
    status: "success",
    value: { id: "project-1", name: caseDef.newerName },
  });
  expect(harness.issues()).toHaveLength(0);
  expectNoPendingWork(harness);
}

async function expectStaleRouteLeakRuntimeActorStaysSilent(caseDef: StaleRouteLeakCase) {
  const controlled =
    caseDef.outcome === "defect" ? createControlledSaveExitLayer() : createControlledSaveLayer();
  const runtime = flow.runtime(
    flow
      .app({
        modules: [
          flow.module("TransactionsAllowStaleRoute", {
            resources: {
              project: projectResource,
            },
            transactions: {
              save: staleRouteLeakTransaction,
            },
            machines: {
              allow: staleRouteLeakMachine,
            },
          }),
        ],
      })
      .layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [controlled.layer],
      }),
  );

  runtime.resources.seedResources([seededProject]);
  const actor = runtime.orchestrators.start(staleRouteLeakMachine, {
    id: caseDef.actorId,
    policy: "keep-alive",
  });

  try {
    actor.send({ type: "SAVE", name: caseDef.olderName });
    actor.send({ type: "SAVE", name: caseDef.newerName });

    if (caseDef.outcome === "defect") {
      await actor.flush();
    }

    controlled.succeedAt(1, { id: "project-1", name: caseDef.newerName });
    await actor.flush();
    await actor.flush();

    if (caseDef.outcome === "success") {
      controlled.succeedAt(0, { id: "project-1", name: caseDef.olderName });
    } else if (caseDef.outcome === "failure") {
      controlled.failAt(0, "conflict");
    } else if (isControlledSaveExitControls(controlled)) {
      controlled.defectAt(0, new Error("older defect"));
    } else {
      throw new Error("Expected defect-capable controls for stale route leak runtime actor");
    }
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context).toMatchObject({
      savedNames: [caseDef.newerName],
      error: null,
      defected: false,
    });
    expect(actor.snapshot().transactions["transactions.save-allow-stale-route"]).toMatchObject({
      status: "success",
      value: { id: "project-1", name: caseDef.newerName },
    });
    expect(actor.issues()).toHaveLength(0);
  } finally {
    await runtime.dispose();
  }
}

async function expectQueuedSerializeLifecycleHarnessMatchesOracle(
  caseDef: QueuedSerializeLifecycleCase,
  controls: AbortableHarnessControls,
  completeLate: () => void,
) {
  const expected = queuedSerializeLifecycleOracle(caseDef);
  const harness = test.app(testApp).rehydrate(serializeMachine, {
    id: caseDef.actorId,
    snapshot: serializeMachine.getInitialSnapshot(),
    resources: [seededProject],
    provide: controls.layer,
  });

  try {
    harness.send({ type: "SAVE", name: caseDef.activeName });
    harness.send({ type: "SAVE", name: caseDef.queuedName });
    await harness.flush();

    expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.pending.callNames);
    expect(harness.snapshot().transactions[expected.transactionId]).toMatchObject({
      status: expected.pending.status,
    });
    expect(harness.pendingWork()).toMatchObject({
      ready: expected.pending.ready,
      activeFibers: expected.pending.activeFibers,
      mailboxes: expected.pending.mailboxes,
      transactions: expected.pending.transactions,
    });

    if (caseDef.boundary === "stop") {
      await harness.runtime.orchestrators.stop(harness.actor.id);
    } else {
      await harness.dispose();
    }
    await harness.flush();

    expect(controls.entryAt(0).signal.aborted).toBe(true);
    expect(controls.entryAt(0).abortCount()).toBe(1);
    expect(harness.snapshot().transactions[expected.transactionId]).toMatchObject({
      status: expected.terminal.status,
    });
    const issuesAfterBoundary = harness.issues();
    expectNoPendingWork(harness);

    completeLate();
    await harness.flush();
    await harness.flush();

    expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.terminal.callNames);
    expect(harness.context().savedNames).toEqual(expected.terminal.savedNames);
    expect(harness.issues()).toEqual(issuesAfterBoundary);
    expect(harness.snapshot().transactions[expected.transactionId]).toMatchObject({
      status: expected.terminal.status,
    });
    expectNoPendingWork(harness);
    expect(
      harness
        .transactions()
        .events(expected.transactionId)
        .filter((receipt) => receipt.type === "transaction:dequeue"),
    ).toHaveLength(expected.terminal.dequeueCount);
    expect(
      harness
        .transactions()
        .events(expected.transactionId)
        .filter((receipt) => receipt.type === expected.terminal.terminalReceiptType),
    ).toHaveLength(expected.terminal.terminalReceiptCount);
  } finally {
    await harness.dispose();
  }
}

async function expectQueuedSerializeLifecycleRuntimeActorMatchesOracle(
  caseDef: QueuedSerializeLifecycleCase,
  controls: AbortableHarnessControls,
  completeLate: () => void,
) {
  const expected = queuedSerializeLifecycleOracle(caseDef);
  const runtime = flow.runtime(
    testApp.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [controls.layer],
    }),
  );

  runtime.resources.seedResources([seededProject]);
  const actor = runtime.orchestrators.start(serializeMachine, {
    id: caseDef.actorId,
    policy: "keep-alive",
  });

  try {
    actor.send({ type: "SAVE", name: caseDef.activeName });
    actor.send({ type: "SAVE", name: caseDef.queuedName });
    await actor.flush();

    expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.pending.callNames);
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.id === expected.transactionId)
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:start", "transaction:queue"]));
    expect(actor.snapshot().transactions[expected.transactionId]).toMatchObject({
      status: expected.pending.status,
    });

    const receiptsAfterPending = actor.receipts().length;
    if (caseDef.boundary === "stop") {
      await runtime.orchestrators.stop(actor.id);
    } else {
      await runtime.dispose();
    }
    await actor.flush();

    expect(controls.entryAt(0).signal.aborted).toBe(true);
    expect(controls.entryAt(0).abortCount()).toBe(1);
    expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.pending.callNames);
    expect(actor.snapshot().transactions[expected.transactionId]).toMatchObject({
      status: expected.terminal.status,
    });
    const issuesAfterBoundary = actor.issues();
    const receiptsAfterBoundary = actor.receipts().length;
    expect(receiptsAfterBoundary).toBeGreaterThan(receiptsAfterPending);

    completeLate();
    await actor.flush();
    await actor.flush();

    expect(controls.calls.map((params) => params.draft.name)).toEqual(expected.terminal.callNames);
    expect(actor.snapshot().context.savedNames).toEqual(expected.terminal.savedNames);
    expect(actor.issues()).toEqual(issuesAfterBoundary);
    expect(actor.snapshot().transactions[expected.transactionId]).toMatchObject({
      status: expected.terminal.status,
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === expected.transactionId && receipt.type === "transaction:dequeue",
        ),
    ).toHaveLength(expected.terminal.dequeueCount);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === expected.transactionId &&
            receipt.type === expected.terminal.terminalReceiptType,
        ),
    ).toHaveLength(expected.terminal.terminalReceiptCount);
    expect(actor.receipts()).toHaveLength(receiptsAfterBoundary);
  } finally {
    if (caseDef.boundary !== "dispose") {
      await runtime.dispose();
    }
  }
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

function createControlledSaveExitLayer() {
  const calls: SaveParams[] = [];
  const completions: Array<{
    readonly succeed: (value: ProjectRecord) => void;
    readonly fail: (error: "conflict") => void;
    readonly defect: (cause: Error) => void;
  }> = [];

  const layer = Layer.succeed(
    SaveProjectApi,
    SaveProjectApi.of({
      save: (params) =>
        Effect.promise<
          | Readonly<{ readonly tag: "success"; readonly value: ProjectRecord }>
          | Readonly<{ readonly tag: "failure"; readonly error: "conflict" }>
          | Readonly<{ readonly tag: "defect"; readonly cause: Error }>
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
                defect: (cause) => {
                  resolve({ tag: "defect", cause });
                },
              });
            }),
        ).pipe(
          Effect.flatMap((result) => {
            switch (result.tag) {
              case "success":
                return Effect.succeed(result.value);
              case "failure":
                return Effect.fail(result.error);
              case "defect":
                return Effect.die(result.cause);
            }
          }),
        ),
    }),
  );

  const completionAt = (index: number) => {
    const completion = completions[index];
    expect(completion).toBeDefined();
    return completion!;
  };

  return {
    layer,
    calls,
    succeedAt: (index: number, value: ProjectRecord) => completionAt(index).succeed(value),
    failAt: (index: number, error: "conflict") => completionAt(index).fail(error),
    defectAt: (index: number, cause: Error) => completionAt(index).defect(cause),
  };
}

function createAbortableSaveLayer() {
  const calls: SaveParams[] = [];
  const entries: Array<{
    readonly name: string;
    readonly signal: AbortSignal;
    readonly abortCount: () => number;
    readonly succeed: (value: ProjectRecord) => void;
    readonly fail: (error: "conflict") => void;
  }> = [];

  const layer = Layer.succeed(
    SaveProjectApi,
    SaveProjectApi.of({
      save: (params) =>
        Effect.promise<ProjectRecord>((signal) => {
          let abortCount = 0;
          signal.addEventListener("abort", () => {
            abortCount += 1;
          });

          return new Promise<ProjectRecord>((resolve, reject) => {
            calls.push(params);
            entries.push({
              name: params.draft.name,
              signal,
              abortCount: () => abortCount,
              succeed: resolve,
              fail: (error) => {
                reject(error);
              },
            });
          });
        }).pipe(Effect.mapError(() => "conflict" as const)),
    }),
  );

  const entryAt = (index: number) => {
    const entry = entries[index];
    expect(entry).toBeDefined();
    return entry!;
  };

  return {
    layer,
    calls,
    entries,
    entryAt,
    succeedAt: (index: number, value: ProjectRecord) => entryAt(index).succeed(value),
    failAt: (index: number, error: "conflict") => entryAt(index).fail(error),
  };
}

function createAbortableSaveExitLayer() {
  const calls: SaveParams[] = [];
  const entries: Array<{
    readonly name: string;
    readonly signal: AbortSignal;
    readonly abortCount: () => number;
    readonly succeed: (value: ProjectRecord) => void;
    readonly fail: (error: "conflict") => void;
    readonly defect: (cause: Error) => void;
  }> = [];

  const layer = Layer.succeed(
    SaveProjectApi,
    SaveProjectApi.of({
      save: (params) =>
        Effect.promise<ProjectRecord>((signal) => {
          let abortCount = 0;
          signal.addEventListener("abort", () => {
            abortCount += 1;
          });

          return new Promise<ProjectRecord>((resolve, reject) => {
            calls.push(params);
            entries.push({
              name: params.draft.name,
              signal,
              abortCount: () => abortCount,
              succeed: resolve,
              fail: reject,
              defect: reject,
            });
          });
        }).pipe(
          Effect.mapError((error) => {
            if (error === "conflict") {
              return "conflict" as const;
            }

            throw error;
          }),
        ),
    }),
  );

  const entryAt = (index: number) => {
    const entry = entries[index];
    expect(entry).toBeDefined();
    return entry!;
  };

  return {
    layer,
    calls,
    entries,
    entryAt,
    succeedAt: (index: number, value: ProjectRecord) => entryAt(index).succeed(value),
    defectAt: (index: number, cause: Error) => entryAt(index).defect(cause),
  };
}

function createRetrySaveLayer() {
  const calls: SaveParams[] = [];
  let attemptCount = 0;

  return {
    calls,
    layer: Layer.succeed(
      SaveProjectApi,
      SaveProjectApi.of({
        save: (params) => {
          calls.push(params);
          attemptCount += 1;
          return attemptCount === 1
            ? Effect.fail("conflict" as const)
            : Effect.succeed({
                id: params.id,
                name: params.draft.name,
              });
        },
      }),
    ),
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

  for (const caseDef of serializeProgressionCases) {
    it(`matches the independent serialize progression oracle for public flowTest ${caseDef.activeName} -> ${caseDef.queuedName}`, async () => {
      const controlled = createControlledSaveLayer();
      await expectSerializeProgressionHarnessMatchesOracle(caseDef, controlled);
    });
  }

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

  for (const caseDef of serializeProgressionCases) {
    it(`matches the independent serialize progression oracle for runtime actor ${caseDef.activeName} -> ${caseDef.queuedName}`, async () => {
      const controlled = createControlledSaveLayer();
      await expectSerializeProgressionRuntimeActorMatchesOracle(caseDef, controlled);
    });
  }

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

  it("retries and resets failed transactions explicitly in flowTest", async () => {
    const retryable = createRetrySaveLayer();

    const harness = runSeededAppScenario(serializeMachine, {
      provide: retryable.layer,
      events: [{ type: "SAVE", name: "Draft Retry" }],
    });

    expect(harness.resetTransaction("transactions.save-serial")).toBe(false);

    await harness.flush();

    expect(harness.context().savedNames).toEqual([]);
    expect(harness.transactions().get("transactions.save-serial")).toMatchObject({
      status: "failure",
    });
    expect(harness.issues()).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "transaction",
        id: "transactions.save-serial",
        error: "conflict",
        handled: true,
      }),
    ]);

    expect(harness.retryTransaction("transactions.save-serial")).toBe(true);
    expect(retryable.calls.map((params) => params.draft.name)).toEqual([
      "Draft Retry",
      "Draft Retry",
    ]);
    expect(harness.transactions().get("transactions.save-serial")).toMatchObject({
      status: "pending",
    });
    expect(harness.issues()).toEqual([]);

    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedNames: ["Draft Retry"],
      error: null,
    });
    expect(
      harness
        .transactions()
        .events("transactions.save-serial")
        .map((receipt) => receipt.type),
    ).toEqual(
      expect.arrayContaining(["transaction:failure", "transaction:retry", "transaction:success"]),
    );

    expect(harness.resetTransaction("transactions.save-serial")).toBe(true);
    expect(harness.transactions().get("transactions.save-serial")).toMatchObject({
      status: "idle",
    });
    expect(
      harness
        .transactions()
        .events("transactions.save-serial")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:reset"]));
  });

  it("retries and resets failed transactions explicitly in runtime actors", async () => {
    const retryable = createRetrySaveLayer();
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [retryable.layer],
      }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.createActor(serializeMachine);
    actor.send({ type: "SAVE", name: "Draft Retry" });

    expect(actor.resetTransaction("transactions.save-serial")).toBe(false);

    await actor.flush();

    expect(actor.snapshot().context.savedNames).toEqual([]);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "failure",
    });
    expect(actor.issues()).toEqual([
      expect.objectContaining({
        kind: "failure",
        source: "transaction",
        id: "transactions.save-serial",
        error: "conflict",
        handled: true,
      }),
    ]);

    expect(actor.retryTransaction("transactions.save-serial")).toBe(true);
    expect(retryable.calls.map((params) => params.draft.name)).toEqual([
      "Draft Retry",
      "Draft Retry",
    ]);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "pending",
    });
    expect(actor.issues()).toEqual([]);

    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context).toMatchObject({
      savedNames: ["Draft Retry"],
      error: null,
    });
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.id === "transactions.save-serial")
        .map((receipt) => receipt.type),
    ).toEqual(
      expect.arrayContaining(["transaction:failure", "transaction:retry", "transaction:success"]),
    );

    expect(actor.resetTransaction("transactions.save-serial")).toBe(true);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "idle",
    });
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.id === "transactions.save-serial")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:reset"]));

    await actor.dispose();
    await runtime.dispose();
  });

  it("cancels the active submit transaction before restarting in flowTest", async () => {
    const controlled = createControlledSaveLayer();

    const harness = runSeededAppScenario(cancelMachine, {
      provide: controlled.layer,
      events: [
        { type: "SAVE", name: "Draft A" },
        { type: "SAVE", name: "Draft B" },
      ],
    });

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
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
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

  it("ignores late typed failure from a cancelled generation in flowTest", async () => {
    const abortable = createAbortableSaveLayer();

    const harness = runSeededAppScenario(cancelMachine, {
      provide: abortable.layer,
      events: [
        { type: "SAVE", name: "Draft A" },
        { type: "SAVE", name: "Draft B" },
      ],
    });

    await harness.flush();

    expect(abortable.calls.map((params) => params.draft.name)).toEqual(["Draft A", "Draft B"]);
    expect(abortable.entryAt(0).signal.aborted).toBe(true);
    expect(abortable.entryAt(0).abortCount()).toBe(1);
    expect(abortable.entryAt(1).signal.aborted).toBe(false);
    expect(harness.transactions().get("transactions.save-cancel")).toMatchObject({
      status: "pending",
    });

    abortable.entryAt(0).fail("conflict");
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedNames: [],
      error: null,
    });
    expect(harness.issues()).toEqual([]);
    expect(harness.transactions().get("transactions.save-cancel")).toMatchObject({
      status: "pending",
    });
    expect(
      harness
        .transactions()
        .events("transactions.save-cancel")
        .filter((receipt) => receipt.type === "transaction:interrupt"),
    ).toHaveLength(1);
    expect(
      harness
        .transactions()
        .events("transactions.save-cancel")
        .filter((receipt) => receipt.type === "transaction:failure"),
    ).toHaveLength(0);

    abortable.succeedAt(1, { id: "project-1", name: "Draft B" });
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
  });

  it("ignores late typed failure from a cancelled generation in runtime actors", async () => {
    const abortable = createAbortableSaveLayer();
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [abortable.layer],
      }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.createActor(cancelMachine);
    actor.send({ type: "SAVE", name: "Draft A" });
    actor.send({ type: "SAVE", name: "Draft B" });
    await actor.flush();

    expect(abortable.calls.map((params) => params.draft.name)).toEqual(["Draft A", "Draft B"]);
    expect(abortable.entryAt(0).signal.aborted).toBe(true);
    expect(abortable.entryAt(0).abortCount()).toBe(1);
    expect(abortable.entryAt(1).signal.aborted).toBe(false);
    expect(actor.snapshot().transactions["transactions.save-cancel"]).toMatchObject({
      status: "pending",
    });

    abortable.entryAt(0).fail("conflict");
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context).toMatchObject({
      savedNames: [],
      error: null,
    });
    expect(actor.issues()).toEqual([]);
    expect(actor.snapshot().transactions["transactions.save-cancel"]).toMatchObject({
      status: "pending",
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-cancel" && receipt.type === "transaction:interrupt",
        ),
    ).toHaveLength(1);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-cancel" && receipt.type === "transaction:failure",
        ),
    ).toHaveLength(0);

    abortable.succeedAt(1, { id: "project-1", name: "Draft B" });
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context.savedNames).toEqual(["Draft B"]);
    expect(actor.snapshot().transactions["transactions.save-cancel"]).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });

    await actor.dispose();
    await runtime.dispose();
  });

  it("ignores late success from a cancelled generation in flowTest", async () => {
    const abortable = createAbortableSaveLayer();

    const harness = runSeededAppScenario(cancelMachine, {
      provide: abortable.layer,
      events: [
        { type: "SAVE", name: "Draft A" },
        { type: "SAVE", name: "Draft B" },
      ],
    });

    await harness.flush();

    expect(abortable.calls.map((params) => params.draft.name)).toEqual(["Draft A", "Draft B"]);
    expect(abortable.entryAt(0).signal.aborted).toBe(true);
    expect(abortable.entryAt(0).abortCount()).toBe(1);
    expect(abortable.entryAt(1).signal.aborted).toBe(false);
    expect(harness.cache().query("transactions.project")).toMatchObject({
      value: { id: "project-1", name: "Draft B" },
    });
    expect(harness.transactions().get("transactions.save-cancel")).toMatchObject({
      status: "pending",
    });

    abortable.succeedAt(0, { id: "project-1", name: "Draft A" });
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedNames: [],
      error: null,
    });
    expect(harness.issues()).toEqual([]);
    expect(harness.cache().query("transactions.project")).toMatchObject({
      value: { id: "project-1", name: "Draft B" },
    });
    expect(harness.transactions().get("transactions.save-cancel")).toMatchObject({
      status: "pending",
    });
    expect(
      harness
        .transactions()
        .events("transactions.save-cancel")
        .filter((receipt) => receipt.type === "transaction:interrupt"),
    ).toHaveLength(1);
    expect(
      harness
        .transactions()
        .events("transactions.save-cancel")
        .filter((receipt) => receipt.type === "transaction:success"),
    ).toHaveLength(0);

    abortable.succeedAt(1, { id: "project-1", name: "Draft B" });
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
  });

  it("ignores late success from a cancelled generation in runtime actors", async () => {
    const abortable = createAbortableSaveLayer();
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [abortable.layer],
      }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.createActor(cancelMachine);
    actor.send({ type: "SAVE", name: "Draft A" });
    actor.send({ type: "SAVE", name: "Draft B" });
    await actor.flush();

    expect(abortable.calls.map((params) => params.draft.name)).toEqual(["Draft A", "Draft B"]);
    expect(abortable.entryAt(0).signal.aborted).toBe(true);
    expect(abortable.entryAt(0).abortCount()).toBe(1);
    expect(abortable.entryAt(1).signal.aborted).toBe(false);
    expect(actor.snapshot().resources["transactions.project"]).toMatchObject({
      value: { id: "project-1", name: "Draft B" },
    });
    expect(actor.snapshot().transactions["transactions.save-cancel"]).toMatchObject({
      status: "pending",
    });

    abortable.succeedAt(0, { id: "project-1", name: "Draft A" });
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context).toMatchObject({
      savedNames: [],
      error: null,
    });
    expect(actor.issues()).toEqual([]);
    expect(actor.snapshot().resources["transactions.project"]).toMatchObject({
      value: { id: "project-1", name: "Draft B" },
    });
    expect(actor.snapshot().transactions["transactions.save-cancel"]).toMatchObject({
      status: "pending",
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-cancel" && receipt.type === "transaction:interrupt",
        ),
    ).toHaveLength(1);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-cancel" && receipt.type === "transaction:success",
        ),
    ).toHaveLength(0);

    abortable.succeedAt(1, { id: "project-1", name: "Draft B" });
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context.savedNames).toEqual(["Draft B"]);
    expect(actor.snapshot().transactions["transactions.save-cancel"]).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });

    await actor.dispose();
    await runtime.dispose();
  });

  it("does not execute routes.success for a cancelled generation in flowTest", async () => {
    const controlled = createControlledSaveLayer();

    const harness = runSeededAppScenario(cancelRouteLeakMachine, {
      provide: controlled.layer,
      events: [
        { type: "SAVE", name: "Older cancelled success" },
        { type: "SAVE", name: "Newer winning success" },
      ],
    });

    expect(controlled.calls.map((params) => params.draft.name)).toEqual([
      "Older cancelled success",
      "Newer winning success",
    ]);
    expect(harness.cache().query("transactions.project")).toMatchObject({
      value: { id: "project-1", name: "Newer winning success" },
    });

    controlled.succeedAt(1, { id: "project-1", name: "Newer winning success" });
    await harness.flush();
    await harness.flush();

    controlled.succeedAt(0, { id: "project-1", name: "Older cancelled success" });
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedNames: ["Newer winning success"],
      error: null,
    });
    expect(harness.cache().query("transactions.project")).toMatchObject({
      value: { id: "project-1", name: "Newer winning success" },
    });
    expect(
      harness
        .transactions()
        .events("transactions.save-cancel-stale-success-route")
        .filter((receipt) => receipt.type === "transaction:success"),
    ).toHaveLength(1);
  });

  it("does not execute routes.success for a cancelled generation in runtime actors", async () => {
    const controlled = createControlledSaveLayer();
    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            flow.module("TransactionsCancelStaleRoute", {
              resources: {
                project: projectResource,
              },
              transactions: {
                save: cancelRouteLeakTransaction,
              },
              machines: {
                cancel: cancelRouteLeakMachine,
              },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
          services: [controlled.layer],
        }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.createActor(cancelRouteLeakMachine);

    try {
      actor.send({ type: "SAVE", name: "Older cancelled success" });
      actor.send({ type: "SAVE", name: "Newer winning success" });

      expect(controlled.calls.map((params) => params.draft.name)).toEqual([
        "Older cancelled success",
        "Newer winning success",
      ]);
      expect(actor.snapshot().resources["transactions.project"]).toMatchObject({
        value: { id: "project-1", name: "Newer winning success" },
      });

      controlled.succeedAt(1, { id: "project-1", name: "Newer winning success" });
      await actor.flush();
      await actor.flush();

      controlled.succeedAt(0, { id: "project-1", name: "Older cancelled success" });
      await actor.flush();
      await actor.flush();

      expect(actor.snapshot().context.savedNames).toEqual(["Newer winning success"]);
      expect(actor.snapshot().resources["transactions.project"]).toMatchObject({
        value: { id: "project-1", name: "Newer winning success" },
      });
      expect(
        actor
          .receipts()
          .filter(
            (receipt) =>
              receipt.id === "transactions.save-cancel-stale-success-route" &&
              receipt.type === "transaction:success",
          ),
      ).toHaveLength(1);
    } finally {
      await actor.dispose();
      await runtime.dispose();
    }
  });

  async function expectCancelledTerminalRouteLeakHarnessStaysSilent(outcome: "failure" | "defect") {
    const controlled =
      outcome === "defect" ? createControlledSaveExitLayer() : createControlledSaveLayer();
    const harness = runSeededAppScenario(cancelRouteLeakMachine, {
      provide: controlled.layer,
      events: [
        { type: "SAVE", name: "Older cancelled success" },
        { type: "SAVE", name: "Newer winning success" },
      ],
    });

    await harness.flush();

    expect(controlled.calls.map((params) => params.draft.name)).toEqual([
      "Older cancelled success",
      "Newer winning success",
    ]);
    expect(harness.cache().query("transactions.project")).toMatchObject({
      value: { id: "project-1", name: "Newer winning success" },
    });
    expect(
      harness.transactions().get("transactions.save-cancel-stale-success-route"),
    ).toMatchObject({
      status: "pending",
    });

    if (outcome === "failure") {
      controlled.failAt(0, "conflict");
    } else if (isControlledSaveExitControls(controlled)) {
      controlled.defectAt(0, new Error("older defect"));
    } else {
      throw new Error("Expected defect-capable controls for cancelled terminal route harness");
    }
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedNames: [],
      error: null,
    });
    expect(harness.issues()).toEqual([]);
    expect(harness.cache().query("transactions.project")).toMatchObject({
      value: { id: "project-1", name: "Newer winning success" },
    });
    expect(
      harness.transactions().get("transactions.save-cancel-stale-success-route"),
    ).toMatchObject({
      status: "pending",
    });
    expect(
      harness
        .transactions()
        .events("transactions.save-cancel-stale-success-route")
        .filter(
          (receipt) =>
            receipt.type === (outcome === "failure" ? "transaction:failure" : "transaction:defect"),
        ),
    ).toHaveLength(0);

    controlled.succeedAt(1, { id: "project-1", name: "Newer winning success" });
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedNames: ["Newer winning success"],
      error: null,
    });
    expect(
      harness.transactions().get("transactions.save-cancel-stale-success-route"),
    ).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Newer winning success" },
    });
  }

  async function expectCancelledTerminalRouteLeakRuntimeActorStaysSilent(
    outcome: "failure" | "defect",
  ) {
    const controlled =
      outcome === "defect" ? createControlledSaveExitLayer() : createControlledSaveLayer();
    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            flow.module("TransactionsCancelStaleRoute", {
              resources: {
                project: projectResource,
              },
              transactions: {
                save: cancelRouteLeakTransaction,
              },
              machines: {
                cancel: cancelRouteLeakMachine,
              },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
          services: [controlled.layer],
        }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.createActor(cancelRouteLeakMachine);

    try {
      actor.send({ type: "SAVE", name: "Older cancelled success" });
      actor.send({ type: "SAVE", name: "Newer winning success" });
      await actor.flush();

      expect(controlled.calls.map((params) => params.draft.name)).toEqual([
        "Older cancelled success",
        "Newer winning success",
      ]);
      expect(actor.snapshot().resources["transactions.project"]).toMatchObject({
        value: { id: "project-1", name: "Newer winning success" },
      });
      expect(
        actor.snapshot().transactions["transactions.save-cancel-stale-success-route"],
      ).toMatchObject({
        status: "pending",
      });

      if (outcome === "failure") {
        controlled.failAt(0, "conflict");
      } else if (isControlledSaveExitControls(controlled)) {
        controlled.defectAt(0, new Error("older defect"));
      } else {
        throw new Error(
          "Expected defect-capable controls for cancelled terminal route runtime actor",
        );
      }
      await actor.flush();
      await actor.flush();

      expect(actor.snapshot().context).toMatchObject({
        savedNames: [],
        error: null,
      });
      expect(actor.issues()).toEqual([]);
      expect(actor.snapshot().resources["transactions.project"]).toMatchObject({
        value: { id: "project-1", name: "Newer winning success" },
      });
      expect(
        actor.snapshot().transactions["transactions.save-cancel-stale-success-route"],
      ).toMatchObject({
        status: "pending",
      });
      expect(
        actor
          .receipts()
          .filter(
            (receipt) =>
              receipt.id === "transactions.save-cancel-stale-success-route" &&
              receipt.type ===
                (outcome === "failure" ? "transaction:failure" : "transaction:defect"),
          ),
      ).toHaveLength(0);

      controlled.succeedAt(1, { id: "project-1", name: "Newer winning success" });
      await actor.flush();
      await actor.flush();

      expect(actor.snapshot().context.savedNames).toEqual(["Newer winning success"]);
      expect(
        actor.snapshot().transactions["transactions.save-cancel-stale-success-route"],
      ).toMatchObject({
        status: "success",
        value: { id: "project-1", name: "Newer winning success" },
      });
    } finally {
      await actor.dispose();
      await runtime.dispose();
    }
  }

  it("does not execute routes.failure for a cancelled generation in flowTest", async () => {
    await expectCancelledTerminalRouteLeakHarnessStaysSilent("failure");
  });

  it("does not execute routes.failure for a cancelled generation in runtime actors", async () => {
    await expectCancelledTerminalRouteLeakRuntimeActorStaysSilent("failure");
  });

  it("does not execute routes.defect for a cancelled generation in flowTest", async () => {
    await expectCancelledTerminalRouteLeakHarnessStaysSilent("defect");
  });

  it("does not execute routes.defect for a cancelled generation in runtime actors", async () => {
    await expectCancelledTerminalRouteLeakRuntimeActorStaysSilent("defect");
  });

  it("ignores late defect from a cancelled generation in flowTest", async () => {
    const abortable = createAbortableSaveExitLayer();

    const harness = runSeededAppScenario(cancelDefectMachine, {
      provide: abortable.layer,
      events: [
        { type: "SAVE", name: "Draft A" },
        { type: "SAVE", name: "Draft B" },
      ],
    });

    await harness.flush();

    expect(abortable.calls.map((params) => params.draft.name)).toEqual(["Draft A", "Draft B"]);
    expect(abortable.entryAt(0).signal.aborted).toBe(true);
    expect(abortable.entryAt(0).abortCount()).toBe(1);
    expect(abortable.entryAt(1).signal.aborted).toBe(false);
    expect(harness.transactions().get("transactions.save-cancel-defect")).toMatchObject({
      status: "pending",
    });

    abortable.entryAt(0).defect(new Error("cancelled save defect"));
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedNames: [],
      error: null,
      defected: false,
    });
    expect(harness.issues()).toEqual([]);
    expect(harness.transactions().get("transactions.save-cancel-defect")).toMatchObject({
      status: "pending",
    });
    expect(
      harness
        .transactions()
        .events("transactions.save-cancel-defect")
        .filter((receipt) => receipt.type === "transaction:interrupt"),
    ).toHaveLength(1);
    expect(
      harness
        .transactions()
        .events("transactions.save-cancel-defect")
        .filter((receipt) => receipt.type === "transaction:defect"),
    ).toHaveLength(0);

    abortable.succeedAt(1, { id: "project-1", name: "Draft B" });
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedNames: ["Draft B"],
      error: null,
      defected: false,
    });
    expect(harness.transactions().get("transactions.save-cancel-defect")).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });
  });

  it("ignores late defect from a cancelled generation in runtime actors", async () => {
    const abortable = createAbortableSaveExitLayer();
    const runtime = flow.runtime(
      flow
        .app({
          modules: [
            flow.module("TransactionsCancelDefect", {
              resources: {
                project: projectResource,
              },
              transactions: {
                save: cancelDefectTransaction,
              },
              machines: {
                cancelDefect: cancelDefectMachine,
              },
            }),
          ],
        })
        .layer({
          store: flow.store.test(),
          orchestrators: flow.orchestrators.test(),
          services: [abortable.layer],
        }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.createActor(cancelDefectMachine);
    actor.send({ type: "SAVE", name: "Draft A" });
    actor.send({ type: "SAVE", name: "Draft B" });
    await actor.flush();

    expect(abortable.calls.map((params) => params.draft.name)).toEqual(["Draft A", "Draft B"]);
    expect(abortable.entryAt(0).signal.aborted).toBe(true);
    expect(abortable.entryAt(0).abortCount()).toBe(1);
    expect(abortable.entryAt(1).signal.aborted).toBe(false);
    expect(actor.snapshot().transactions["transactions.save-cancel-defect"]).toMatchObject({
      status: "pending",
    });

    abortable.entryAt(0).defect(new Error("cancelled save defect"));
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context).toMatchObject({
      savedNames: [],
      error: null,
      defected: false,
    });
    expect(actor.issues()).toEqual([]);
    expect(actor.snapshot().transactions["transactions.save-cancel-defect"]).toMatchObject({
      status: "pending",
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-cancel-defect" &&
            receipt.type === "transaction:interrupt",
        ),
    ).toHaveLength(1);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-cancel-defect" &&
            receipt.type === "transaction:defect",
        ),
    ).toHaveLength(0);

    abortable.succeedAt(1, { id: "project-1", name: "Draft B" });
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context).toMatchObject({
      savedNames: ["Draft B"],
      error: null,
      defected: false,
    });
    expect(actor.snapshot().transactions["transactions.save-cancel-defect"]).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });

    await actor.dispose();
    await runtime.dispose();
  });

  it("aborts the prior commit AbortSignal when cancel-previous restarts in flowTest", async () => {
    const abortSignals: Array<Readonly<{ readonly name: string; readonly signal: AbortSignal }>> =
      [];
    const abortLayer = Layer.succeed(
      SaveProjectApi,
      SaveProjectApi.of({
        save: (params) =>
          Effect.promise<ProjectRecord>((signal) => {
            abortSignals.push({
              name: params.draft.name,
              signal,
            });
            return new Promise<ProjectRecord>(() => {});
          }),
      }),
    );

    const harness = runSeededAppScenario(cancelMachine, {
      provide: abortLayer,
      events: [
        { type: "SAVE", name: "Draft A" },
        { type: "SAVE", name: "Draft B" },
      ],
    });

    await harness.flush();

    expect(abortSignals).toHaveLength(2);
    expect(abortSignals[0]?.name).toBe("Draft A");
    expect(abortSignals[0]?.signal.aborted).toBe(true);
    expect(abortSignals[1]?.name).toBe("Draft B");
    expect(abortSignals[1]?.signal.aborted).toBe(false);
    expect(
      harness
        .transactions()
        .events("transactions.save-cancel")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:start", "transaction:interrupt"]));

    harness.send({ type: "SAVE", name: "Draft C" });
    await harness.flush();

    expect(abortSignals[1]?.signal.aborted).toBe(true);
    expect(abortSignals[2]?.name).toBe("Draft C");
    expect(abortSignals[2]?.signal.aborted).toBe(false);
  });

  it("aborts the prior commit AbortSignal when cancel-previous restarts in runtime actors", async () => {
    const abortSignals: Array<Readonly<{ readonly name: string; readonly signal: AbortSignal }>> =
      [];
    const abortLayer = Layer.succeed(
      SaveProjectApi,
      SaveProjectApi.of({
        save: (params) =>
          Effect.promise<ProjectRecord>((signal) => {
            abortSignals.push({
              name: params.draft.name,
              signal,
            });
            return new Promise<ProjectRecord>(() => {});
          }),
      }),
    );
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [abortLayer],
      }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.createActor(cancelMachine);
    actor.send({ type: "SAVE", name: "Draft A" });
    actor.send({ type: "SAVE", name: "Draft B" });
    await actor.flush();

    expect(abortSignals).toHaveLength(2);
    expect(abortSignals[0]?.name).toBe("Draft A");
    expect(abortSignals[0]?.signal.aborted).toBe(true);
    expect(abortSignals[1]?.name).toBe("Draft B");
    expect(abortSignals[1]?.signal.aborted).toBe(false);
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.id === "transactions.save-cancel")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:start", "transaction:interrupt"]));

    await actor.dispose();
    expect(abortSignals[1]?.signal.aborted).toBe(true);

    await runtime.dispose();
  });

  for (const caseDef of activeRuntimeLifecycleCases.filter((entry) => entry.outcome !== "defect")) {
    it(`matches the independent active runtime lifecycle oracle for ${caseDef.boundary} and late ${caseDef.outcome}`, async () => {
      const abortable = createAbortableSaveLayer();
      await expectActiveRuntimeLifecycleMatchesOracle(caseDef, abortable, () => {
        if (caseDef.outcome === "success") {
          abortable.succeedAt(0, {
            id: "project-1",
            name: caseDef.lateResultName,
          });
          return;
        }

        abortable.failAt(0, "conflict");
      });
    });
  }

  for (const caseDef of activeRuntimeLifecycleCases.filter((entry) => entry.outcome === "defect")) {
    it(`matches the independent active runtime lifecycle oracle for ${caseDef.boundary} and late ${caseDef.outcome}`, async () => {
      const abortable = createAbortableSaveExitLayer();
      await expectActiveRuntimeLifecycleMatchesOracle(caseDef, abortable, () => {
        abortable.defectAt(0, new Error(caseDef.lateResultName));
      });
    });
  }

  for (const caseDef of queuedSerializeLifecycleCases.filter(
    (entry) => entry.surface === "runtime-actor" && entry.outcome !== "defect",
  )) {
    it(`matches the independent queued serialize lifecycle oracle for runtime actor ${caseDef.boundary} and late ${caseDef.outcome}`, async () => {
      const abortable = createAbortableSaveLayer();
      await expectQueuedSerializeLifecycleRuntimeActorMatchesOracle(caseDef, abortable, () => {
        if (caseDef.outcome === "success") {
          abortable.succeedAt(0, {
            id: "project-1",
            name: caseDef.lateResultName,
          });
          return;
        }

        abortable.failAt(0, "conflict");
      });
    });
  }

  for (const caseDef of queuedSerializeLifecycleCases.filter(
    (entry) => entry.surface === "runtime-actor" && entry.outcome === "defect",
  )) {
    it(`matches the independent queued serialize lifecycle oracle for runtime actor ${caseDef.boundary} and late ${caseDef.outcome}`, async () => {
      const abortable = createAbortableSaveExitLayer();
      await expectQueuedSerializeLifecycleRuntimeActorMatchesOracle(caseDef, abortable, () => {
        abortable.defectAt(0, new Error(caseDef.lateResultName));
      });
    });
  }

  for (const caseDef of queuedSerializeLifecycleCases.filter(
    (entry) => entry.surface === "rehydrated-harness" && entry.outcome !== "defect",
  )) {
    it(`matches the independent queued serialize lifecycle oracle for public rehydrated harness ${caseDef.boundary} and late ${caseDef.outcome}`, async () => {
      const abortable = createAbortableSaveLayer();
      await expectQueuedSerializeLifecycleHarnessMatchesOracle(caseDef, abortable, () => {
        if (caseDef.outcome === "success") {
          abortable.succeedAt(0, {
            id: "project-1",
            name: caseDef.lateResultName,
          });
          return;
        }

        abortable.failAt(0, "conflict");
      });
    });
  }

  for (const caseDef of queuedSerializeLifecycleCases.filter(
    (entry) => entry.surface === "rehydrated-harness" && entry.outcome === "defect",
  )) {
    it(`matches the independent queued serialize lifecycle oracle for public rehydrated harness ${caseDef.boundary} and late ${caseDef.outcome}`, async () => {
      const abortable = createAbortableSaveExitLayer();
      await expectQueuedSerializeLifecycleHarnessMatchesOracle(caseDef, abortable, () => {
        abortable.defectAt(0, new Error(caseDef.lateResultName));
      });
    });
  }

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

  for (const caseDef of scopedSerializeProgressionCases) {
    it(`matches the independent scoped serialize progression oracle for public flowTest ${caseDef.actorId}`, async () => {
      const controlled = createControlledSaveLayer();
      await expectScopedSerializeProgressionHarnessMatchesOracle(caseDef, controlled);
    });
  }

  for (const caseDef of scopedSerializeProgressionCases) {
    it(`matches the independent scoped serialize progression oracle for runtime actor ${caseDef.actorId}`, async () => {
      const controlled = createControlledSaveLayer();
      await expectScopedSerializeProgressionRuntimeActorMatchesOracle(caseDef, controlled);
    });
  }

  for (const caseDef of allowLatestWinsCases) {
    if (caseDef.surface === "flowTest") {
      it(`matches the independent allow latest-wins oracle in ${caseDef.surface} for ${caseDef.actorId}`, async () => {
        const controlled = createControlledSaveLayer();
        await expectAllowLatestWinsHarnessMatchesOracle(caseDef, controlled);
      });
    }
  }

  for (const caseDef of allowLatestWinsCases) {
    if (caseDef.surface === "runtime-actor") {
      it(`matches the independent allow latest-wins oracle in ${caseDef.surface} for ${caseDef.actorId}`, async () => {
        const controlled = createControlledSaveLayer();
        await expectAllowLatestWinsRuntimeActorMatchesOracle(caseDef, controlled);
      });
    }
  }

  for (const caseDef of allowStalePublicationCases) {
    if (caseDef.surface === "flowTest") {
      it(`matches the independent stale allow publication oracle in ${caseDef.surface} for late ${caseDef.outcome}`, async () => {
        await expectAllowStalePublicationHarnessMatchesOracle(caseDef);
      });
    }
  }

  for (const caseDef of allowStalePublicationCases) {
    if (caseDef.surface === "runtime-actor") {
      it(`matches the independent stale allow publication oracle in ${caseDef.surface} for late ${caseDef.outcome}`, async () => {
        await expectAllowStalePublicationRuntimeActorMatchesOracle(caseDef);
      });
    }
  }

  for (const caseDef of staleRouteLeakCases) {
    if (caseDef.surface === "flowTest") {
      it(`does not execute stale allow route callbacks in ${caseDef.surface} for late ${caseDef.outcome}`, async () => {
        await expectStaleRouteLeakHarnessStaysSilent(caseDef);
      });
    }
  }

  for (const caseDef of staleRouteLeakCases) {
    if (caseDef.surface === "runtime-actor") {
      it(`does not execute stale allow route callbacks in ${caseDef.surface} for late ${caseDef.outcome}`, async () => {
        await expectStaleRouteLeakRuntimeActorStaysSilent(caseDef);
      });
    }
  }
});
