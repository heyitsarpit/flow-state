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

export const serializeQueueBehaviorProjectId = "project-1";
export const serializeQueueBehaviorProjectResourceId = "transactions.project";
export const serializeQueueBehaviorTransactionId = "transactions.save-serial";

class SerializeQueueBehaviorSaveProjectApi extends Context.Service<
  SerializeQueueBehaviorSaveProjectApi,
  {
    readonly save: (params: SaveParams) => Effect.Effect<ProjectRecord, "conflict">;
  }
>()("test/BT38/SerializeQueueBehaviorSaveProjectApi") {}

const serializeQueueBehaviorProjectResource = flow.resource<[projectId: string], ProjectRecord>({
  id: serializeQueueBehaviorProjectResourceId,
  key: (projectId) => flow.createKey("transactions", projectId),
  lookup: (projectId) => Effect.succeed({ id: projectId, name: "Loaded" }),
});

const serializeQueueBehaviorTransaction = flow.transaction<
  SaveParams,
  ProjectRecord,
  "conflict",
  SerializeQueueBehaviorSaveProjectApi,
  SerialSaveEvent
>({
  id: serializeQueueBehaviorTransactionId,
  params: ({ context }: { readonly context: SerialSaveContext }) => ({
    id: context.projectId,
    draft: context.draft,
  }),
  preview: {
    apply: ({ params }) => [
      {
        ref: serializeQueueBehaviorProjectResource.ref(params.id),
        replace: params.draft,
      },
    ],
  },
  commit: (params) =>
    Effect.flatMap(SerializeQueueBehaviorSaveProjectApi, (api) =>
      api.save({
        id: params.id,
        draft: params.draft,
      }),
    ),
  invalidates: ({ params }) => [serializeQueueBehaviorProjectResource.ref(params.id)],
  routes: flow.outcomes<ProjectRecord, "conflict", SerialSaveEvent>({
    success: ({ value }) => ({
      type: "SAVED",
      project: value,
    }),
    failure: ["SAVE_FAILED", "error"],
  }),
  concurrency: "serialize",
});

export const serializeQueueBehaviorMachine = flow.machine<
  SerialSaveContext,
  SerialSaveEvent,
  "ready",
  "ready"
>({
  id: "transactions.serialize-machine",
  initial: "ready",
  context: () => ({
    projectId: serializeQueueBehaviorProjectId,
    draft: { id: serializeQueueBehaviorProjectId, name: "Draft v1" },
    savedNames: [],
    error: null,
  }),
  states: {
    ready: {
      on: {
        SAVE: {
          submit: serializeQueueBehaviorTransaction,
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

const serializeQueueBehaviorApp = flow.app({
  modules: [
    flow.module("SerializeQueueBehavior", {
      resources: {
        project: serializeQueueBehaviorProjectResource,
      },
      transactions: {
        serialSave: serializeQueueBehaviorTransaction,
      },
      machines: {
        serialize: serializeQueueBehaviorMachine,
      },
    }),
  ],
});

export const seededSerializeQueueBehaviorProject = {
  ref: serializeQueueBehaviorProjectResource.ref(serializeQueueBehaviorProjectId),
  value: { id: serializeQueueBehaviorProjectId, name: "Seeded v1" },
} as const;

export function createControlledSaveLayer() {
  const calls: SaveParams[] = [];
  const completions: Array<{
    readonly succeed: (value: ProjectRecord) => void;
    readonly fail: (error: "conflict") => void;
  }> = [];

  const layer = Layer.succeed(
    SerializeQueueBehaviorSaveProjectApi,
    SerializeQueueBehaviorSaveProjectApi.of({
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
    if (completion === undefined) {
      throw new Error("Expected queued serialize completion controls");
    }

    return completion;
  };

  return {
    layer,
    calls,
    succeedNext: (value: ProjectRecord) => shiftCompletion().succeed(value),
    failNext: (error: "conflict") => shiftCompletion().fail(error),
  };
}

export function createAbortableSaveLayer() {
  const calls: SaveParams[] = [];
  const entries: Array<{
    readonly signal: AbortSignal;
    readonly abortCount: () => number;
    readonly succeed: (value: ProjectRecord) => void;
    readonly fail: (error: "conflict") => void;
  }> = [];

  const layer = Layer.succeed(
    SerializeQueueBehaviorSaveProjectApi,
    SerializeQueueBehaviorSaveProjectApi.of({
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
      throw new Error(`Expected abortable queued serialize entry ${index}`);
    }

    return entry;
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

export type ControlledSaveLayer = ReturnType<typeof createControlledSaveLayer>;
export type AbortableSaveLayer = ReturnType<typeof createAbortableSaveLayer>;

export function startSerializeQueueBehaviorFlowTest(
  controls: ControlledSaveLayer | AbortableSaveLayer,
  events: ReadonlyArray<SerialSaveEvent>,
) {
  return test
    .app(serializeQueueBehaviorApp)
    .scenario(serializeQueueBehaviorMachine)
    .with({
      provide: controls.layer,
      resources: [seededSerializeQueueBehaviorProject],
    })
    .run(events);
}

export function startSerializeQueueBehaviorRuntimeActor(
  controls: ControlledSaveLayer | AbortableSaveLayer,
) {
  const runtime = flow.runtime(
    serializeQueueBehaviorApp.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [controls.layer],
    }),
  );

  runtime.resources.seedResources([seededSerializeQueueBehaviorProject]);

  return {
    runtime,
    actor: runtime.createActor(serializeQueueBehaviorMachine),
  };
}

export function callNames(controls: ControlledSaveLayer | AbortableSaveLayer) {
  return controls.calls.map((call) => call.draft.name);
}
