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

export const cancelRestartProjectId = "project-1";
export const cancelRestartProjectResourceId = "transactions.project";
export const cancelRestartTransactionId = "transactions.save-cancel";

class CancelRestartSaveProjectApi extends Context.Service<
  CancelRestartSaveProjectApi,
  {
    readonly save: (params: SaveParams) => Effect.Effect<ProjectRecord, "conflict">;
  }
>()("test/BT38/CancelRestartSaveProjectApi") {}

const cancelRestartProjectResource = flow.resource<[projectId: string], ProjectRecord>({
  id: cancelRestartProjectResourceId,
  key: (projectId) => flow.createKey("transactions", projectId),
  lookup: (projectId) => Effect.succeed({ id: projectId, name: "Loaded" }),
});

const cancelRestartTransaction = flow.transaction<
  SaveParams,
  ProjectRecord,
  "conflict",
  CancelRestartSaveProjectApi,
  SerialSaveEvent
>({
  id: cancelRestartTransactionId,
  params: ({ context }: { readonly context: SerialSaveContext }) => ({
    id: context.projectId,
    draft: context.draft,
  }),
  preview: {
    apply: ({ params }) => [
      {
        ref: cancelRestartProjectResource.ref(params.id),
        replace: params.draft,
      },
    ],
  },
  commit: (params) =>
    Effect.flatMap(CancelRestartSaveProjectApi, (api) =>
      api.save({
        id: params.id,
        draft: params.draft,
      }),
    ),
  invalidates: ({ params }) => [cancelRestartProjectResource.ref(params.id)],
  routes: flow.outcomes<ProjectRecord, "conflict", SerialSaveEvent>({
    success: ({ value }) => ({
      type: "SAVED",
      project: value,
    }),
    failure: ["SAVE_FAILED", "error"],
  }),
  concurrency: "cancel-previous",
});

export const cancelRestartMachine = flow.machine<
  SerialSaveContext,
  SerialSaveEvent,
  "ready",
  "ready"
>({
  id: "transactions.cancel-machine",
  initial: "ready",
  context: () => ({
    projectId: cancelRestartProjectId,
    draft: { id: cancelRestartProjectId, name: "Draft v1" },
    savedNames: [],
    error: null,
  }),
  states: {
    ready: {
      on: {
        SAVE: {
          submit: cancelRestartTransaction,
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

const cancelRestartApp = flow.app({
  modules: [
    flow.module("CancelRestart", {
      resources: {
        project: cancelRestartProjectResource,
      },
      transactions: {
        cancelSave: cancelRestartTransaction,
      },
      machines: {
        cancel: cancelRestartMachine,
      },
    }),
  ],
});

export const seededCancelRestartProject = {
  ref: cancelRestartProjectResource.ref(cancelRestartProjectId),
  value: { id: cancelRestartProjectId, name: "Seeded v1" },
} as const;

export function createControlledSaveLayer() {
  const calls: SaveParams[] = [];
  const completions: Array<{
    readonly succeed: (value: ProjectRecord) => void;
    readonly fail: (error: "conflict") => void;
  }> = [];

  const layer = Layer.succeed(
    CancelRestartSaveProjectApi,
    CancelRestartSaveProjectApi.of({
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

  const completionAt = (index: number) => {
    const completion = completions[index];
    if (completion === undefined) {
      throw new Error(`Expected cancel restart completion ${index}`);
    }

    return completion;
  };

  return {
    layer,
    calls,
    succeedAt: (index: number, value: ProjectRecord) => completionAt(index).succeed(value),
    failAt: (index: number, error: "conflict") => completionAt(index).fail(error),
  };
}

export function createAbortSignalLayer() {
  const abortSignals: Array<
    Readonly<{
      readonly name: string;
      readonly signal: AbortSignal;
    }>
  > = [];

  return {
    abortSignals,
    layer: Layer.succeed(
      CancelRestartSaveProjectApi,
      CancelRestartSaveProjectApi.of({
        save: (params) =>
          Effect.promise<ProjectRecord>((signal) => {
            abortSignals.push({
              name: params.draft.name,
              signal,
            });
            return new Promise<ProjectRecord>(() => {});
          }),
      }),
    ),
  };
}

export type ControlledSaveLayer = ReturnType<typeof createControlledSaveLayer>;
export type AbortSignalLayer = ReturnType<typeof createAbortSignalLayer>;

export function startCancelRestartFlowTest(
  controls: ControlledSaveLayer | AbortSignalLayer,
  events: ReadonlyArray<SerialSaveEvent>,
) {
  return test
    .app(cancelRestartApp)
    .scenario(cancelRestartMachine)
    .with({
      provide: controls.layer,
      resources: [seededCancelRestartProject],
    })
    .run(events);
}

export function startCancelRestartRuntimeActor(controls: ControlledSaveLayer | AbortSignalLayer) {
  const runtime = flow.runtime(
    cancelRestartApp.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [controls.layer],
    }),
  );

  runtime.resources.seedResources([seededCancelRestartProject]);

  return {
    runtime,
    actor: runtime.createActor(cancelRestartMachine),
  };
}

export function callNames(controls: ControlledSaveLayer) {
  return controls.calls.map((call) => call.draft.name);
}
