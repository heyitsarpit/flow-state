import { Context, Effect, Layer } from "effect";

import * as flow from "../../index.js";
import { test } from "../../testing.js";

export interface ProjectRecord {
  readonly id: string;
  readonly name: string;
}

export interface SaveParams {
  readonly id: string;
  readonly draft: ProjectRecord;
}

export type SerialSaveEvent =
  | Readonly<{ readonly type: "SAVE"; readonly name: string }>
  | Readonly<{ readonly type: "SAVED"; readonly project: ProjectRecord }>
  | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>;

export interface SerialSaveContext {
  readonly projectId: string;
  readonly draft: ProjectRecord;
  readonly savedNames: ReadonlyArray<string>;
  readonly error: "conflict" | null;
}

export const activeSerializeLifecycleProjectId = "project-1";
export const activeSerializeLifecycleProjectResourceId = "transactions.project";
export const activeSerializeLifecycleTransactionId = "transactions.save-serial";

class ActiveSerializeLifecycleSaveProjectApi extends Context.Service<
  ActiveSerializeLifecycleSaveProjectApi,
  {
    readonly save: (params: SaveParams) => Effect.Effect<ProjectRecord, "conflict">;
  }
>()("test/BT38/ActiveSerializeLifecycleSaveProjectApi") {}

const activeSerializeLifecycleProjectResource = flow.resource<[projectId: string], ProjectRecord>({
  id: activeSerializeLifecycleProjectResourceId,
  key: (projectId) => flow.createKey("transactions", projectId),
  lookup: (projectId) => Effect.succeed({ id: projectId, name: "Loaded" }),
});

const activeSerializeLifecycleTransaction = flow.transaction<
  SaveParams,
  ProjectRecord,
  "conflict",
  ActiveSerializeLifecycleSaveProjectApi,
  SerialSaveEvent
>({
  id: activeSerializeLifecycleTransactionId,
  params: ({ context }: { readonly context: SerialSaveContext }) => ({
    id: context.projectId,
    draft: context.draft,
  }),
  preview: {
    apply: ({ params }) => [
      {
        ref: activeSerializeLifecycleProjectResource.ref(params.id),
        replace: params.draft,
      },
    ],
  },
  commit: (params) =>
    Effect.flatMap(ActiveSerializeLifecycleSaveProjectApi, (api) =>
      api.save({
        id: params.id,
        draft: params.draft,
      }),
    ),
  invalidates: ({ params }) => [activeSerializeLifecycleProjectResource.ref(params.id)],
  routes: flow.outcomes<ProjectRecord, "conflict", SerialSaveEvent>({
    success: ({ value }) => ({
      type: "SAVED",
      project: value,
    }),
    failure: ["SAVE_FAILED", "error"],
  }),
  concurrency: "serialize",
});

export const activeSerializeLifecycleMachine = flow.machine<
  SerialSaveContext,
  SerialSaveEvent,
  "ready",
  "ready"
>({
  id: "transactions.serialize-machine",
  initial: "ready",
  context: () => ({
    projectId: activeSerializeLifecycleProjectId,
    draft: { id: activeSerializeLifecycleProjectId, name: "Draft v1" },
    savedNames: [],
    error: null,
  }),
  states: {
    ready: {
      on: {
        SAVE: {
          submit: activeSerializeLifecycleTransaction,
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

const activeSerializeLifecycleApp = flow.app({
  modules: [
    flow.module("ActiveSerializeLifecycle", {
      resources: {
        project: activeSerializeLifecycleProjectResource,
      },
      transactions: {
        serialSave: activeSerializeLifecycleTransaction,
      },
      machines: {
        serialize: activeSerializeLifecycleMachine,
      },
    }),
  ],
});

export const seededActiveSerializeLifecycleProject = {
  ref: activeSerializeLifecycleProjectResource.ref(activeSerializeLifecycleProjectId),
  value: { id: activeSerializeLifecycleProjectId, name: "Seeded v1" },
} as const;

export function createAbortableSaveLayer() {
  const calls: SaveParams[] = [];
  const entries: Array<{
    readonly signal: AbortSignal;
    readonly abortCount: () => number;
    readonly succeed: (value: ProjectRecord) => void;
    readonly fail: (error: "conflict") => void;
    readonly defect: (cause: Error) => void;
  }> = [];

  const layer = Layer.succeed(
    ActiveSerializeLifecycleSaveProjectApi,
    ActiveSerializeLifecycleSaveProjectApi.of({
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
    if (entry === undefined) {
      throw new Error(`Expected abortable active serialize lifecycle entry ${index}`);
    }

    return entry;
  };

  return {
    layer,
    calls,
    entryAt,
    succeedAt: (index: number, value: ProjectRecord) => entryAt(index).succeed(value),
    failAt: (index: number, error: "conflict") => entryAt(index).fail(error),
    defectAt: (index: number, cause: Error) => entryAt(index).defect(cause),
  };
}

export type AbortableSaveLayer = ReturnType<typeof createAbortableSaveLayer>;

export function startActiveSerializeLifecycleRehydratedHarness(
  actorId: string,
  controls: AbortableSaveLayer,
) {
  return test.app(activeSerializeLifecycleApp).rehydrate(activeSerializeLifecycleMachine, {
    id: actorId,
    snapshot: activeSerializeLifecycleMachine.getInitialSnapshot(),
    resources: [seededActiveSerializeLifecycleProject],
    provide: controls.layer,
  });
}

export function startActiveSerializeLifecycleRuntimeActor(
  actorId: string,
  controls: AbortableSaveLayer,
) {
  const runtime = flow.runtime(
    activeSerializeLifecycleApp.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [controls.layer],
    }),
  );

  runtime.resources.seedResources([seededActiveSerializeLifecycleProject]);

  return {
    runtime,
    actor: runtime.orchestrators.start(activeSerializeLifecycleMachine, {
      id: actorId,
      policy: "keep-alive",
    }),
  };
}

export function callNames(controls: AbortableSaveLayer) {
  return controls.calls.map((call) => call.draft.name);
}
