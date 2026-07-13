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
        Effect.promise<ProjectRecord>(
          () =>
            new Promise((resolve, reject) => {
              calls.push(params);
              completions.push({
                succeed: resolve,
                fail: reject,
                defect: reject,
              });
            }),
        ).pipe(
          Effect.mapError((error) => {
            if (error === "conflict") {
              return "conflict" as const;
            }

            throw error;
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

  it("serializes repeated submit transactions in flowTest by transaction id", async () => {
    const controlled = createControlledSaveLayer();

    const harness = runSeededAppScenario(serializeMachine, {
      provide: controlled.layer,
      events: [
        { type: "SAVE", name: "Draft A" },
        { type: "SAVE", name: "Draft B" },
      ],
    });

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

  it("serializes repeated submit transactions in runtime actors by transaction id", async () => {
    const controlled = createControlledSaveLayer();
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
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
    expect(actor.snapshot().transactions["transactions.save"]).toMatchObject({
      status: "pending",
    });
    expect(
      actor
        .receipts()
        .filter((receipt) => receipt.id === "transactions.save")
        .map((receipt) => receipt.type),
    ).toEqual(expect.arrayContaining(["transaction:start", "transaction:reject"]));
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

  it("aborts an active runtime transaction signal exactly once when the actor stops and ignores late success", async () => {
    const abortable = createAbortableSaveLayer();
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [abortable.layer],
      }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.orchestrators.start(serializeMachine, {
      id: "transactions-stop-abort-actor",
      policy: "keep-alive",
    });

    actor.send({ type: "SAVE", name: "Draft Stop" });
    await actor.flush();

    expect(abortable.calls.map((params) => params.draft.name)).toEqual(["Draft Stop"]);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "pending",
    });
    expect(actor.snapshot().resources["transactions.project"]).toMatchObject({
      value: { id: "project-1", name: "Draft Stop" },
    });

    const receiptsBeforeStop = actor.receipts().length;

    await runtime.orchestrators.stop("transactions-stop-abort-actor");
    await actor.flush();

    expect(abortable.entryAt(0).signal.aborted).toBe(true);
    expect(abortable.entryAt(0).abortCount()).toBe(1);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "interrupt",
    });
    expect(actor.snapshot().resources["transactions.project"]).toMatchObject({
      value: { id: "project-1", name: "Seeded v1" },
    });

    const receiptsAfterStop = actor.receipts().length;
    expect(receiptsAfterStop).toBeGreaterThan(receiptsBeforeStop);

    abortable.succeedAt(0, { id: "project-1", name: "Late Stop Success" });
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context.savedNames).toEqual([]);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "interrupt",
    });
    expect(actor.snapshot().resources["transactions.project"]).toMatchObject({
      value: { id: "project-1", name: "Seeded v1" },
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-serial" && receipt.type === "transaction:success",
        ),
    ).toHaveLength(0);
    expect(actor.receipts()).toHaveLength(receiptsAfterStop);

    await runtime.dispose();
  });

  it("aborts an active runtime transaction signal exactly once when the actor stops and ignores late typed failure", async () => {
    const abortable = createAbortableSaveLayer();
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [abortable.layer],
      }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.orchestrators.start(serializeMachine, {
      id: "transactions-stop-failure-actor",
      policy: "keep-alive",
    });

    actor.send({ type: "SAVE", name: "Draft Stop Failure" });
    await actor.flush();

    expect(abortable.calls.map((params) => params.draft.name)).toEqual(["Draft Stop Failure"]);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "pending",
    });

    const receiptsBeforeStop = actor.receipts().length;

    await runtime.orchestrators.stop("transactions-stop-failure-actor");
    await actor.flush();

    expect(abortable.entryAt(0).signal.aborted).toBe(true);
    expect(abortable.entryAt(0).abortCount()).toBe(1);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "interrupt",
    });

    const receiptsAfterStop = actor.receipts().length;
    const issuesAfterStop = actor.issues();
    expect(receiptsAfterStop).toBeGreaterThan(receiptsBeforeStop);

    abortable.failAt(0, "conflict");
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context.savedNames).toEqual([]);
    expect(actor.issues()).toEqual(issuesAfterStop);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "interrupt",
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-serial" && receipt.type === "transaction:failure",
        ),
    ).toHaveLength(0);
    expect(actor.receipts()).toHaveLength(receiptsAfterStop);

    await runtime.dispose();
  });

  it("aborts an active runtime transaction signal exactly once when the actor stops and ignores late defect", async () => {
    const abortable = createAbortableSaveExitLayer();
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [abortable.layer],
      }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.orchestrators.start(serializeMachine, {
      id: "transactions-stop-defect-actor",
      policy: "keep-alive",
    });

    actor.send({ type: "SAVE", name: "Draft Stop Defect" });
    await actor.flush();

    expect(abortable.calls.map((params) => params.draft.name)).toEqual(["Draft Stop Defect"]);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "pending",
    });

    const receiptsBeforeStop = actor.receipts().length;

    await runtime.orchestrators.stop("transactions-stop-defect-actor");
    await actor.flush();

    expect(abortable.entryAt(0).signal.aborted).toBe(true);
    expect(abortable.entryAt(0).abortCount()).toBe(1);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "interrupt",
    });

    const receiptsAfterStop = actor.receipts().length;
    const issuesAfterStop = actor.issues();
    expect(receiptsAfterStop).toBeGreaterThan(receiptsBeforeStop);

    abortable.defectAt(0, new Error("late stop defect"));
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context.savedNames).toEqual([]);
    expect(actor.issues()).toEqual(issuesAfterStop);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "interrupt",
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-serial" && receipt.type === "transaction:defect",
        ),
    ).toHaveLength(0);
    expect(actor.receipts()).toHaveLength(receiptsAfterStop);

    await runtime.dispose();
  });

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

  it("aborts an active runtime transaction signal exactly once when the runtime disposes and ignores late success", async () => {
    const abortable = createAbortableSaveLayer();
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [abortable.layer],
      }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.orchestrators.start(serializeMachine, {
      id: "transactions-runtime-dispose-actor",
      policy: "keep-alive",
    });

    actor.send({ type: "SAVE", name: "Draft Dispose" });
    await actor.flush();

    expect(abortable.calls.map((params) => params.draft.name)).toEqual(["Draft Dispose"]);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "pending",
    });

    const receiptsBeforeDispose = actor.receipts().length;

    await runtime.dispose();
    await actor.flush();

    expect(abortable.entryAt(0).signal.aborted).toBe(true);
    expect(abortable.entryAt(0).abortCount()).toBe(1);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "interrupt",
    });

    const receiptsAfterDispose = actor.receipts().length;
    expect(receiptsAfterDispose).toBeGreaterThan(receiptsBeforeDispose);

    abortable.succeedAt(0, { id: "project-1", name: "Late Dispose Success" });
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context.savedNames).toEqual([]);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "interrupt",
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-serial" && receipt.type === "transaction:success",
        ),
    ).toHaveLength(0);
    expect(actor.receipts()).toHaveLength(receiptsAfterDispose);
  });

  it("aborts an active runtime transaction signal exactly once when the runtime disposes and ignores late typed failure", async () => {
    const abortable = createAbortableSaveLayer();
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [abortable.layer],
      }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.orchestrators.start(serializeMachine, {
      id: "transactions-runtime-dispose-failure-actor",
      policy: "keep-alive",
    });

    actor.send({ type: "SAVE", name: "Draft Dispose Failure" });
    await actor.flush();

    expect(abortable.calls.map((params) => params.draft.name)).toEqual(["Draft Dispose Failure"]);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "pending",
    });

    const receiptsBeforeDispose = actor.receipts().length;

    await runtime.dispose();
    await actor.flush();

    expect(abortable.entryAt(0).signal.aborted).toBe(true);
    expect(abortable.entryAt(0).abortCount()).toBe(1);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "interrupt",
    });

    const receiptsAfterDispose = actor.receipts().length;
    const issuesAfterDispose = actor.issues();
    expect(receiptsAfterDispose).toBeGreaterThan(receiptsBeforeDispose);

    abortable.failAt(0, "conflict");
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context.savedNames).toEqual([]);
    expect(actor.issues()).toEqual(issuesAfterDispose);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "interrupt",
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-serial" && receipt.type === "transaction:failure",
        ),
    ).toHaveLength(0);
    expect(actor.receipts()).toHaveLength(receiptsAfterDispose);
  });

  it("aborts an active runtime transaction signal exactly once when the runtime disposes and ignores late defect", async () => {
    const abortable = createAbortableSaveExitLayer();
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [abortable.layer],
      }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.orchestrators.start(serializeMachine, {
      id: "transactions-runtime-dispose-defect-actor",
      policy: "keep-alive",
    });

    actor.send({ type: "SAVE", name: "Draft Dispose Defect" });
    await actor.flush();

    expect(abortable.calls.map((params) => params.draft.name)).toEqual(["Draft Dispose Defect"]);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "pending",
    });

    const receiptsBeforeDispose = actor.receipts().length;

    await runtime.dispose();
    await actor.flush();

    expect(abortable.entryAt(0).signal.aborted).toBe(true);
    expect(abortable.entryAt(0).abortCount()).toBe(1);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "interrupt",
    });

    const receiptsAfterDispose = actor.receipts().length;
    const issuesAfterDispose = actor.issues();
    expect(receiptsAfterDispose).toBeGreaterThan(receiptsBeforeDispose);

    abortable.defectAt(0, new Error("late dispose defect"));
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context.savedNames).toEqual([]);
    expect(actor.issues()).toEqual(issuesAfterDispose);
    expect(actor.snapshot().transactions["transactions.save-serial"]).toMatchObject({
      status: "interrupt",
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-serial" && receipt.type === "transaction:defect",
        ),
    ).toHaveLength(0);
    expect(actor.receipts()).toHaveLength(receiptsAfterDispose);
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

  it("serializes transactions within a shared scope while different scopes run in parallel in flowTest", async () => {
    const controlled = createControlledSaveLayer();

    const harness = runSeededAppScenario(scopedSerializeMachine, {
      provide: controlled.layer,
      events: [{ type: "SAVE_A1" }, { type: "SAVE_B1" }, { type: "SAVE_A2" }, { type: "SAVE_B2" }],
    });

    expect(controlled.calls.map((params) => params.draft.name)).toEqual(["Draft A1", "Draft A2"]);
    expect(harness.transactions().queued("transactions.save-scope-b1")).toHaveLength(1);
    expect(harness.transactions().queued("transactions.save-scope-b2")).toHaveLength(1);

    controlled.succeedAt(0, { id: "project-1", name: "Draft A1" });
    controlled.succeedAt(1, { id: "project-1", name: "Draft A2" });
    await harness.flush();
    await harness.flush();

    expect(controlled.calls.map((params) => params.draft.name)).toEqual([
      "Draft A1",
      "Draft A2",
      "Draft B1",
      "Draft B2",
    ]);
    expect(harness.context()).toMatchObject({
      savedNames: ["Draft A1", "Draft A2"],
      error: null,
    });

    controlled.succeedAt(2, { id: "project-1", name: "Draft B1" });
    controlled.succeedAt(3, { id: "project-1", name: "Draft B2" });
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedNames: ["Draft A1", "Draft A2", "Draft B1", "Draft B2"],
      error: null,
    });
  });

  it("serializes transactions within a shared scope while different scopes run in parallel in runtime actors", async () => {
    const controlled = createControlledSaveLayer();
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [controlled.layer],
      }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.createActor(scopedSerializeMachine);
    actor.send({ type: "SAVE_A1" });
    actor.send({ type: "SAVE_B1" });
    actor.send({ type: "SAVE_A2" });
    actor.send({ type: "SAVE_B2" });

    expect(controlled.calls.map((params) => params.draft.name)).toEqual(["Draft A1", "Draft A2"]);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.type === "transaction:queue" && receipt.id === "transactions.save-scope-b1",
        ),
    ).toHaveLength(1);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.type === "transaction:queue" && receipt.id === "transactions.save-scope-b2",
        ),
    ).toHaveLength(1);

    controlled.succeedAt(0, { id: "project-1", name: "Draft A1" });
    controlled.succeedAt(1, { id: "project-1", name: "Draft A2" });
    await actor.flush();
    await actor.flush();

    expect(controlled.calls.map((params) => params.draft.name)).toEqual([
      "Draft A1",
      "Draft A2",
      "Draft B1",
      "Draft B2",
    ]);
    expect(actor.snapshot().context.savedNames).toEqual(["Draft A1", "Draft A2"]);

    controlled.succeedAt(2, { id: "project-1", name: "Draft B1" });
    controlled.succeedAt(3, { id: "project-1", name: "Draft B2" });
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context.savedNames).toEqual([
      "Draft A1",
      "Draft A2",
      "Draft B1",
      "Draft B2",
    ]);

    await actor.dispose();
    await runtime.dispose();
  });

  it("allows repeated submit transactions in flowTest by transaction id", async () => {
    const controlled = createControlledSaveLayer();

    const harness = runSeededAppScenario(allowMachine, {
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
    expect(
      harness
        .transactions()
        .events("transactions.save-allow")
        .filter((receipt) => receipt.type === "transaction:start"),
    ).toHaveLength(2);
    expect(
      harness
        .transactions()
        .events("transactions.save-allow")
        .filter((receipt) => receipt.type === "transaction:reject"),
    ).toHaveLength(0);

    controlled.failAt(0, "conflict");
    await harness.flush();
    await harness.flush();

    expect(harness.cache().query("transactions.project")).toMatchObject({
      value: { id: "project-1", name: "Draft B" },
    });
    expect(harness.transactions().get("transactions.save-allow")).toMatchObject({
      status: "pending",
    });
    expect(
      harness
        .transactions()
        .events("transactions.save-allow")
        .filter((receipt) => receipt.type === "transaction:failure"),
    ).toHaveLength(0);
    expect(harness.issues()).toEqual([]);

    controlled.succeedAt(1, { id: "project-1", name: "Draft B" });
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedNames: ["Draft B"],
      error: null,
    });
    expect(harness.transactions().get("transactions.save-allow")).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });
  });

  it("allows repeated runtime transactions by transaction id", async () => {
    const controlled = createControlledSaveLayer();
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [controlled.layer],
      }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.createActor(allowMachine);
    actor.send({ type: "SAVE", name: "Draft A" });
    actor.send({ type: "SAVE", name: "Draft B" });

    expect(controlled.calls.map((params) => params.draft.name)).toEqual(["Draft A", "Draft B"]);
    expect(actor.snapshot().resources["transactions.project"]).toMatchObject({
      value: { id: "project-1", name: "Draft B" },
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-allow" && receipt.type === "transaction:start",
        ),
    ).toHaveLength(2);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-allow" && receipt.type === "transaction:reject",
        ),
    ).toHaveLength(0);

    controlled.failAt(0, "conflict");
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().resources["transactions.project"]).toMatchObject({
      value: { id: "project-1", name: "Draft B" },
    });
    expect(actor.snapshot().transactions["transactions.save-allow"]).toMatchObject({
      status: "pending",
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-allow" && receipt.type === "transaction:failure",
        ),
    ).toHaveLength(0);
    expect(actor.issues()).toEqual([]);

    controlled.succeedAt(1, { id: "project-1", name: "Draft B" });
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context.savedNames).toEqual(["Draft B"]);
    expect(actor.snapshot().transactions["transactions.save-allow"]).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });

    await actor.dispose();
    await runtime.dispose();
  });

  it("ignores stale same-id success routes after a newer allow transaction wins in flowTest", async () => {
    const controlled = createControlledSaveLayer();

    const harness = runSeededAppScenario(allowMachine, {
      provide: controlled.layer,
      events: [
        { type: "SAVE", name: "Draft A" },
        { type: "SAVE", name: "Draft B" },
      ],
    });

    controlled.succeedAt(1, { id: "project-1", name: "Draft B" });
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedNames: ["Draft B"],
      error: null,
    });
    expect(harness.transactions().get("transactions.save-allow")).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });
    expect(
      harness
        .transactions()
        .events("transactions.save-allow")
        .filter((receipt) => receipt.type === "transaction:success"),
    ).toHaveLength(1);
    expect(
      harness
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.project" && receipt.type === "resource:invalidate",
        ),
    ).toHaveLength(1);

    controlled.succeedAt(0, { id: "project-1", name: "Draft A" });
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedNames: ["Draft B"],
      error: null,
    });
    expect(harness.transactions().get("transactions.save-allow")).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });
    expect(
      harness
        .transactions()
        .events("transactions.save-allow")
        .filter((receipt) => receipt.type === "transaction:success"),
    ).toHaveLength(1);
    expect(
      harness
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.project" && receipt.type === "resource:invalidate",
        ),
    ).toHaveLength(1);
  });

  it("ignores stale same-id success routes after a newer allow transaction wins in runtime actors", async () => {
    const controlled = createControlledSaveLayer();
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [controlled.layer],
      }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.createActor(allowMachine);
    actor.send({ type: "SAVE", name: "Draft A" });
    actor.send({ type: "SAVE", name: "Draft B" });

    controlled.succeedAt(1, { id: "project-1", name: "Draft B" });
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context.savedNames).toEqual(["Draft B"]);
    expect(actor.snapshot().transactions["transactions.save-allow"]).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-allow" && receipt.type === "transaction:success",
        ),
    ).toHaveLength(1);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.project" && receipt.type === "resource:invalidate",
        ),
    ).toHaveLength(1);

    controlled.succeedAt(0, { id: "project-1", name: "Draft A" });
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context.savedNames).toEqual(["Draft B"]);
    expect(actor.snapshot().transactions["transactions.save-allow"]).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-allow" && receipt.type === "transaction:success",
        ),
    ).toHaveLength(1);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.project" && receipt.type === "resource:invalidate",
        ),
    ).toHaveLength(1);

    await actor.dispose();
    await runtime.dispose();
  });

  it("ignores stale same-id failure publication after a newer allow transaction wins in flowTest", async () => {
    const controlled = createControlledSaveLayer();

    const harness = runSeededAppScenario(allowMachine, {
      provide: controlled.layer,
      events: [
        { type: "SAVE", name: "Draft A" },
        { type: "SAVE", name: "Draft B" },
      ],
    });

    controlled.succeedAt(1, { id: "project-1", name: "Draft B" });
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedNames: ["Draft B"],
      error: null,
    });
    expect(harness.transactions().get("transactions.save-allow")).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });

    controlled.failAt(0, "conflict");
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedNames: ["Draft B"],
      error: null,
    });
    expect(harness.issues()).toEqual([]);
    expect(harness.transactions().get("transactions.save-allow")).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });
    expect(
      harness
        .transactions()
        .events("transactions.save-allow")
        .filter((receipt) => receipt.type === "transaction:failure"),
    ).toHaveLength(0);
    expect(
      harness
        .transactions()
        .events("transactions.save-allow")
        .filter((receipt) => receipt.type === "transaction:success"),
    ).toHaveLength(1);
    expect(
      harness
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.project" && receipt.type === "resource:invalidate",
        ),
    ).toHaveLength(1);
  });

  it("ignores stale same-id failure publication after a newer allow transaction wins in runtime actors", async () => {
    const controlled = createControlledSaveLayer();
    const runtime = flow.runtime(
      testApp.layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [controlled.layer],
      }),
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.createActor(allowMachine);
    actor.send({ type: "SAVE", name: "Draft A" });
    actor.send({ type: "SAVE", name: "Draft B" });

    controlled.succeedAt(1, { id: "project-1", name: "Draft B" });
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context).toMatchObject({
      savedNames: ["Draft B"],
      error: null,
    });
    expect(actor.snapshot().transactions["transactions.save-allow"]).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });

    controlled.failAt(0, "conflict");
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context).toMatchObject({
      savedNames: ["Draft B"],
      error: null,
    });
    expect(actor.issues()).toEqual([]);
    expect(actor.snapshot().transactions["transactions.save-allow"]).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-allow" && receipt.type === "transaction:failure",
        ),
    ).toHaveLength(0);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-allow" && receipt.type === "transaction:success",
        ),
    ).toHaveLength(1);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.project" && receipt.type === "resource:invalidate",
        ),
    ).toHaveLength(1);

    await actor.dispose();
    await runtime.dispose();
  });

  it("ignores stale same-id defect publication after a newer allow transaction wins in flowTest", async () => {
    const controlled = createControlledSaveExitLayer();

    const harness = runSeededAppScenario(allowDefectMachine, {
      provide: controlled.layer,
      events: [
        { type: "SAVE", name: "Draft A" },
        { type: "SAVE", name: "Draft B" },
      ],
    });
    await harness.flush();

    expect(controlled.calls.map((params) => params.draft.name)).toEqual(["Draft A", "Draft B"]);

    controlled.succeedAt(1, { id: "project-1", name: "Draft B" });
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedNames: ["Draft B"],
      error: null,
      defected: false,
    });
    expect(harness.transactions().get("transactions.save-allow-defect")).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });

    controlled.defectAt(0, new Error("save defect"));
    await harness.flush();
    await harness.flush();

    expect(harness.context()).toMatchObject({
      savedNames: ["Draft B"],
      error: null,
      defected: false,
    });
    expect(harness.issues()).toEqual([]);
    expect(harness.transactions().get("transactions.save-allow-defect")).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });
    expect(
      harness
        .transactions()
        .events("transactions.save-allow-defect")
        .filter((receipt) => receipt.type === "transaction:defect"),
    ).toHaveLength(0);
    expect(
      harness
        .transactions()
        .events("transactions.save-allow-defect")
        .filter((receipt) => receipt.type === "transaction:success"),
    ).toHaveLength(1);
    expect(
      harness
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.project" && receipt.type === "resource:invalidate",
        ),
    ).toHaveLength(1);
  });

  it("ignores stale same-id defect publication after a newer allow transaction wins in runtime actors", async () => {
    const controlled = createControlledSaveExitLayer();
    const runtime = flow.runtime(
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
    );

    runtime.resources.seedResources([seededProject]);
    const actor = runtime.createActor(allowDefectMachine);
    actor.send({ type: "SAVE", name: "Draft A" });
    actor.send({ type: "SAVE", name: "Draft B" });
    await actor.flush();

    expect(controlled.calls.map((params) => params.draft.name)).toEqual(["Draft A", "Draft B"]);

    controlled.succeedAt(1, { id: "project-1", name: "Draft B" });
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context).toMatchObject({
      savedNames: ["Draft B"],
      error: null,
      defected: false,
    });
    expect(actor.snapshot().transactions["transactions.save-allow-defect"]).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });

    controlled.defectAt(0, new Error("save defect"));
    await actor.flush();
    await actor.flush();

    expect(actor.snapshot().context).toMatchObject({
      savedNames: ["Draft B"],
      error: null,
      defected: false,
    });
    expect(actor.issues()).toEqual([]);
    expect(actor.snapshot().transactions["transactions.save-allow-defect"]).toMatchObject({
      status: "success",
      value: { id: "project-1", name: "Draft B" },
    });
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-allow-defect" &&
            receipt.type === "transaction:defect",
        ),
    ).toHaveLength(0);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.save-allow-defect" &&
            receipt.type === "transaction:success",
        ),
    ).toHaveLength(1);
    expect(
      actor
        .receipts()
        .filter(
          (receipt) =>
            receipt.id === "transactions.project" && receipt.type === "resource:invalidate",
        ),
    ).toHaveLength(1);

    await actor.dispose();
    await runtime.dispose();
  });
});
