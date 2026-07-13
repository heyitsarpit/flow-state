import { Context, Effect, Layer } from "effect";

import * as flow from "../../index.js";
import { test } from "../../testing.js";

export interface ProjectRecord {
  readonly id: string;
  readonly name: string;
}

export interface ProjectSummaryRecord {
  readonly id: string;
  readonly summary: string;
}

export interface SaveParams {
  readonly id: string;
  readonly draft: ProjectRecord;
}

export type SaveEvent =
  | Readonly<{ readonly type: "SAVE" }>
  | Readonly<{ readonly type: "SAVED"; readonly project: ProjectRecord }>
  | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>;

export interface SaveContext {
  readonly projectId: string;
  readonly draft: ProjectRecord;
  readonly savedAt: number | null;
  readonly error: "conflict" | null;
  readonly savedProject: ProjectRecord | null;
}

export const multiRefLifecycleProjectId = "project-1";
export const multiRefLifecycleProjectResourceId = "transactions.project";
export const multiRefLifecycleSummaryResourceId = "transactions.project-summary";
export const multiRefLifecycleTransactionId = "transactions.save-multi-lifecycle";

class MultiRefLifecycleSaveProjectApi extends Context.Service<
  MultiRefLifecycleSaveProjectApi,
  {
    readonly save: (params: SaveParams) => Effect.Effect<ProjectRecord, "conflict">;
  }
>()("test/BT38/MultiRefLifecycleSaveProjectApi") {}

const multiRefLifecycleProjectResource = flow.resource<[projectId: string], ProjectRecord>({
  id: multiRefLifecycleProjectResourceId,
  key: (projectId) => flow.createKey("transactions", projectId),
  lookup: (projectId) => Effect.succeed({ id: projectId, name: "Loaded" }),
});

const multiRefLifecycleSummaryResource = flow.resource<[projectId: string], ProjectSummaryRecord>({
  id: multiRefLifecycleSummaryResourceId,
  key: (projectId) => flow.createKey("transactions.summary", projectId),
  lookup: (projectId) =>
    Effect.succeed({
      id: projectId,
      summary: "Loaded summary",
    }),
});

const multiRefLifecycleTransaction = flow.transaction<
  SaveParams,
  ProjectRecord,
  "conflict",
  MultiRefLifecycleSaveProjectApi,
  SaveEvent
>({
  id: multiRefLifecycleTransactionId,
  params: ({ context }: { readonly context: SaveContext }) => ({
    id: context.projectId,
    draft: context.draft,
  }),
  preview: {
    apply: ({ params }) => [
      {
        ref: multiRefLifecycleProjectResource.ref(params.id),
        replace: params.draft,
      },
      {
        ref: multiRefLifecycleSummaryResource.ref(params.id),
        replace: {
          id: params.id,
          summary: params.draft.name,
        },
      },
    ],
  },
  commit: (params) =>
    Effect.flatMap(MultiRefLifecycleSaveProjectApi, (api) =>
      api.save({
        id: params.id,
        draft: params.draft,
      }),
    ),
  invalidates: ({ params }) => [
    multiRefLifecycleProjectResource.ref(params.id),
    multiRefLifecycleSummaryResource.ref(params.id),
  ],
  routes: flow.outcomes<ProjectRecord, "conflict", SaveEvent>({
    success: ({ value }) => ({
      type: "SAVED",
      project: value,
    }),
    failure: ["SAVE_FAILED", "error"],
  }),
  concurrency: "reject-while-running",
});

export const multiRefLifecycleMachine = flow.machine<
  SaveContext,
  SaveEvent,
  "ready" | "saving" | "done" | "failed",
  "ready"
>({
  id: "transactions.multi-ref-submit-machine",
  initial: "ready",
  context: () => ({
    projectId: multiRefLifecycleProjectId,
    draft: { id: multiRefLifecycleProjectId, name: "Boundary Draft" },
    savedAt: null,
    error: null,
    savedProject: null,
  }),
  states: {
    ready: {
      on: {
        SAVE: {
          target: "saving",
          submit: multiRefLifecycleTransaction,
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

const multiRefLifecycleApp = flow.app({
  modules: [
    flow.module("MultiRefLifecycleCleanup", {
      resources: {
        project: multiRefLifecycleProjectResource,
        projectSummary: multiRefLifecycleSummaryResource,
      },
      transactions: {
        save: multiRefLifecycleTransaction,
      },
      machines: {
        submit: multiRefLifecycleMachine,
      },
    }),
  ],
});

export const seededMultiRefLifecycleProject = {
  ref: multiRefLifecycleProjectResource.ref(multiRefLifecycleProjectId),
  value: { id: multiRefLifecycleProjectId, name: "Seeded v1" },
} as const;

export const seededMultiRefLifecycleSummary = {
  ref: multiRefLifecycleSummaryResource.ref(multiRefLifecycleProjectId),
  value: { id: multiRefLifecycleProjectId, summary: "Seeded summary v1" },
} as const;

export function createAbortableSaveLayer() {
  const calls: SaveParams[] = [];
  const entries: Array<{
    readonly signal: AbortSignal;
    readonly abortCount: () => number;
    readonly succeed: (value: ProjectRecord) => void;
    readonly fail: (error: "conflict") => void;
  }> = [];

  const layer = Layer.succeed(
    MultiRefLifecycleSaveProjectApi,
    MultiRefLifecycleSaveProjectApi.of({
      save: (params) =>
        Effect.promise<ProjectRecord>((signal) => {
          let abortCount = 0;
          signal.addEventListener("abort", () => {
            abortCount += 1;
          });

          return new Promise<ProjectRecord>((resolve, reject) => {
            calls.push(params);
            entries.push({
              signal,
              abortCount: () => abortCount,
              succeed: resolve,
              fail: reject,
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
    if (entry === undefined) {
      throw new Error(`Expected multi-ref lifecycle save entry ${index}`);
    }

    return entry;
  };

  return {
    layer,
    calls,
    entryAt,
    succeedAt: (index: number, value: ProjectRecord) => entryAt(index).succeed(value),
    failAt: (index: number, error: "conflict") => entryAt(index).fail(error),
  };
}

export type AbortableSaveLayer = ReturnType<typeof createAbortableSaveLayer>;

export function startMultiRefLifecycleRehydratedHarness(
  actorId: string,
  controls: AbortableSaveLayer,
) {
  return test.app(multiRefLifecycleApp).rehydrate(multiRefLifecycleMachine, {
    id: actorId,
    snapshot: multiRefLifecycleMachine.getInitialSnapshot(),
    resources: [seededMultiRefLifecycleProject, seededMultiRefLifecycleSummary],
    provide: controls.layer,
  });
}

export function startMultiRefLifecycleRuntimeActor(actorId: string, controls: AbortableSaveLayer) {
  const runtime = flow.runtime(
    multiRefLifecycleApp.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [controls.layer],
    }),
  );

  runtime.resources.seedResources([seededMultiRefLifecycleProject, seededMultiRefLifecycleSummary]);

  return {
    runtime,
    actor: runtime.orchestrators.start(multiRefLifecycleMachine, {
      id: actorId,
      policy: "keep-alive",
    }),
  };
}

export function callNames(controls: AbortableSaveLayer) {
  return controls.calls.map((call) => call.draft.name);
}
