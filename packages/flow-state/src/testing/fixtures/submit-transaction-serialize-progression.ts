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

export type TransactionReceiptCounts = Readonly<{
  readonly start: number;
  readonly queue: number;
  readonly dequeue: number;
  readonly success: number;
  readonly failure: number;
  readonly defect: number;
  readonly interrupt: number;
}>;

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

export const serializeProgressionProjectId = "project-1";
export const serializeProgressionProjectResourceId = "transactions.project";
export const serializeProgressionTransactionId = "transactions.save-serial";

class SerializeProgressionSaveProjectApi extends Context.Service<
  SerializeProgressionSaveProjectApi,
  {
    readonly save: (params: SaveParams) => Effect.Effect<ProjectRecord, "conflict">;
  }
>()("test/BT38/SerializeProgressionSaveProjectApi") {}

const serializeProgressionProjectResource = flow.resource<[projectId: string], ProjectRecord>({
  id: serializeProgressionProjectResourceId,
  key: (projectId) => flow.createKey("transactions", projectId),
  lookup: (projectId) => Effect.succeed({ id: projectId, name: "Loaded" }),
});

const serializeProgressionTransaction = flow.transaction<
  SaveParams,
  ProjectRecord,
  "conflict",
  SerializeProgressionSaveProjectApi,
  SerialSaveEvent
>({
  id: serializeProgressionTransactionId,
  params: ({ context }: { readonly context: SerialSaveContext }) => ({
    id: context.projectId,
    draft: context.draft,
  }),
  preview: {
    apply: ({ params }) => [
      {
        ref: serializeProgressionProjectResource.ref(params.id),
        replace: params.draft,
      },
    ],
  },
  commit: (params) =>
    Effect.flatMap(SerializeProgressionSaveProjectApi, (api) =>
      api.save({
        id: params.id,
        draft: params.draft,
      }),
    ),
  invalidates: ({ params }) => [serializeProgressionProjectResource.ref(params.id)],
  routes: flow.outcomes<ProjectRecord, "conflict", SerialSaveEvent>({
    success: ({ value }) => ({
      type: "SAVED",
      project: value,
    }),
    failure: ["SAVE_FAILED", "error"],
  }),
  concurrency: "serialize",
});

export const serializeProgressionMachine = flow.machine<
  SerialSaveContext,
  SerialSaveEvent,
  "ready",
  "ready"
>({
  id: "transactions.serialize-machine",
  initial: "ready",
  context: () => ({
    projectId: serializeProgressionProjectId,
    draft: { id: serializeProgressionProjectId, name: "Draft v1" },
    savedNames: [],
    error: null,
  }),
  states: {
    ready: {
      on: {
        SAVE: {
          submit: serializeProgressionTransaction,
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

const serializeProgressionApp = flow.app({
  modules: [
    flow.module("SerializeProgression", {
      resources: {
        project: serializeProgressionProjectResource,
      },
      transactions: {
        serialSave: serializeProgressionTransaction,
      },
      machines: {
        serialize: serializeProgressionMachine,
      },
    }),
  ],
});

export const seededSerializeProgressionProject = {
  ref: serializeProgressionProjectResource.ref(serializeProgressionProjectId),
  value: { id: serializeProgressionProjectId, name: "Seeded v1" },
} as const;

export function createControlledSaveLayer() {
  const calls: SaveParams[] = [];
  const completions: Array<{
    readonly succeed: (value: ProjectRecord) => void;
    readonly fail: (error: "conflict") => void;
  }> = [];

  const layer = Layer.succeed(
    SerializeProgressionSaveProjectApi,
    SerializeProgressionSaveProjectApi.of({
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
      throw new Error(`Expected serialize progression completion ${index}`);
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

export function createControlledSaveExitLayer() {
  const calls: SaveParams[] = [];
  const completions: Array<{
    readonly succeed: (value: ProjectRecord) => void;
    readonly fail: (error: "conflict") => void;
    readonly defect: (cause: Error) => void;
  }> = [];

  const layer = Layer.succeed(
    SerializeProgressionSaveProjectApi,
    SerializeProgressionSaveProjectApi.of({
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
    if (completion === undefined) {
      throw new Error(`Expected defect-capable serialize progression completion ${index}`);
    }

    return completion;
  };

  return {
    layer,
    calls,
    succeedAt: (index: number, value: ProjectRecord) => completionAt(index).succeed(value),
    failAt: (index: number, error: "conflict") => completionAt(index).fail(error),
    defectAt: (index: number, cause: Error) => completionAt(index).defect(cause),
  };
}

export type ControlledSaveLayer = ReturnType<typeof createControlledSaveLayer>;
export type ControlledSaveExitLayer = ReturnType<typeof createControlledSaveExitLayer>;

export function startSerializeProgressionFlowTest(
  controls: ControlledSaveLayer | ControlledSaveExitLayer,
  events: ReadonlyArray<SerialSaveEvent>,
) {
  return test
    .app(serializeProgressionApp)
    .scenario(serializeProgressionMachine)
    .with({
      provide: controls.layer,
      resources: [seededSerializeProgressionProject],
    })
    .run(events);
}

export function startSerializeProgressionRuntimeActor(
  actorId: string,
  controls: ControlledSaveLayer | ControlledSaveExitLayer,
) {
  const runtime = flow.runtime(
    serializeProgressionApp.layer({
      store: flow.store.test(),
      orchestrators: flow.orchestrators.test(),
      services: [controls.layer],
    }),
  );

  runtime.resources.seedResources([seededSerializeProgressionProject]);

  return {
    runtime,
    actor: runtime.orchestrators.start(serializeProgressionMachine, {
      id: actorId,
      policy: "keep-alive",
    }),
  };
}

export function callNames(controls: ControlledSaveLayer | ControlledSaveExitLayer) {
  return controls.calls.map((call) => call.draft.name);
}
