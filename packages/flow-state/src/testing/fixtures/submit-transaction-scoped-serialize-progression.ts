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

export type ScopedSaveEvent =
  | Readonly<{ readonly type: "SAVE_A1" }>
  | Readonly<{ readonly type: "SAVE_B1" }>
  | Readonly<{ readonly type: "SAVE_A2" }>
  | Readonly<{ readonly type: "SAVE_B2" }>
  | Readonly<{ readonly type: "SAVED"; readonly project: ProjectRecord }>
  | Readonly<{ readonly type: "SAVE_FAILED"; readonly error: "conflict" }>;

export interface ScopedSerializeContext {
  readonly projectId: string;
  readonly draft: ProjectRecord;
  readonly savedNames: ReadonlyArray<string>;
  readonly error: "conflict" | null;
}

export const scopedSerializeProgressionProjectId = "project-1";
export const scopedSerializeProgressionProjectResourceId = "transactions.project";

class ScopedSerializeProgressionSaveProjectApi extends Context.Service<
  ScopedSerializeProgressionSaveProjectApi,
  {
    readonly save: (params: SaveParams) => Effect.Effect<ProjectRecord, "conflict">;
  }
>()("test/BT38/ScopedSerializeProgressionSaveProjectApi") {}

const scopedSerializeProgressionProjectResource = flow.resource<[projectId: string], ProjectRecord>(
  {
    id: scopedSerializeProgressionProjectResourceId,
    key: (projectId) => flow.createKey("transactions", projectId),
    lookup: (projectId) => Effect.succeed({ id: projectId, name: "Loaded" }),
  },
);

function createScopedSerializeProgressionTransaction<const Id extends string>(
  id: Id,
  scopeId: string,
) {
  return flow.transaction<
    SaveParams,
    ProjectRecord,
    "conflict",
    ScopedSerializeProgressionSaveProjectApi,
    ScopedSaveEvent
  >({
    id,
    params: ({ context }: { readonly context: ScopedSerializeContext }) => ({
      id: context.projectId,
      draft: context.draft,
    }),
    preview: {
      apply: ({ params }) => [
        {
          ref: scopedSerializeProgressionProjectResource.ref(params.id),
          replace: params.draft,
        },
      ],
    },
    commit: (params) =>
      Effect.flatMap(ScopedSerializeProgressionSaveProjectApi, (api) =>
        api.save({
          id: params.id,
          draft: params.draft,
        }),
      ),
    invalidates: ({ params }) => [scopedSerializeProgressionProjectResource.ref(params.id)],
    routes: flow.outcomes<ProjectRecord, "conflict", ScopedSaveEvent>({
      success: ({ value }) => ({
        type: "SAVED",
        project: value,
      }),
      failure: ["SAVE_FAILED", "error"],
    }),
    scope: {
      id: scopeId,
    },
    concurrency: "serialize",
  });
}

const scopedSerializedSaveProjectTransactionA1 = createScopedSerializeProgressionTransaction(
  "transactions.save-scope-a1",
  "scope-1",
);

const scopedSerializedSaveProjectTransactionB1 = createScopedSerializeProgressionTransaction(
  "transactions.save-scope-b1",
  "scope-1",
);

const scopedSerializedSaveProjectTransactionA2 = createScopedSerializeProgressionTransaction(
  "transactions.save-scope-a2",
  "scope-2",
);

const scopedSerializedSaveProjectTransactionB2 = createScopedSerializeProgressionTransaction(
  "transactions.save-scope-b2",
  "scope-2",
);

export function createControlledSaveLayer() {
  const calls: SaveParams[] = [];
  const completions: Array<{
    readonly succeed: (value: ProjectRecord) => void;
    readonly fail: (error: "conflict") => void;
  }> = [];

  const layer = Layer.succeed(
    ScopedSerializeProgressionSaveProjectApi,
    ScopedSerializeProgressionSaveProjectApi.of({
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
      throw new Error(
        `Expected completion controls for scoped serialize progression attempt ${index}`,
      );
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

export type ControlledSaveLayer = ReturnType<typeof createControlledSaveLayer>;

export function createScopedSerializeProgressionMachine(machineId: string) {
  return flow.machine<ScopedSerializeContext, ScopedSaveEvent, "ready", "ready">({
    id: machineId,
    initial: "ready",
    context: () => ({
      projectId: scopedSerializeProgressionProjectId,
      draft: { id: scopedSerializeProgressionProjectId, name: "Draft v1" },
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
}

export const seededScopedSerializeProgressionProject = {
  ref: scopedSerializeProgressionProjectResource.ref(scopedSerializeProgressionProjectId),
  value: { id: scopedSerializeProgressionProjectId, name: "Seeded v1" },
} as const;

export function startScopedSerializeProgressionFlowTest(
  machineId: string,
  controls: ControlledSaveLayer,
  events?: ReadonlyArray<ScopedSaveEvent>,
) {
  const machine = createScopedSerializeProgressionMachine(machineId);
  return {
    machine,
    harness: test(machine)
      .with({
        provide: controls.layer,
        resources: [seededScopedSerializeProgressionProject],
      })
      .run(events),
  };
}

export function startScopedSerializeProgressionRuntimeActor(
  machineId: string,
  actorId: string,
  controls: ControlledSaveLayer,
) {
  const machine = createScopedSerializeProgressionMachine(machineId);
  const runtime = flow.runtime(
    flow
      .app({
        modules: [
          flow.module(`BT38ScopedSerializeProgression.${machineId}`, {
            resources: {
              project: scopedSerializeProgressionProjectResource,
            },
            transactions: {
              scopedSaveA1: scopedSerializedSaveProjectTransactionA1,
              scopedSaveB1: scopedSerializedSaveProjectTransactionB1,
              scopedSaveA2: scopedSerializedSaveProjectTransactionA2,
              scopedSaveB2: scopedSerializedSaveProjectTransactionB2,
            },
            machines: {
              scopedSerialize: machine,
            },
          }),
        ],
      })
      .layer({
        store: flow.store.test(),
        orchestrators: flow.orchestrators.test(),
        services: [controls.layer],
      }),
  );

  runtime.resources.seedResources([seededScopedSerializeProgressionProject]);

  return {
    machine,
    runtime,
    actor: runtime.orchestrators.start(machine, {
      id: actorId,
      policy: "keep-alive",
    }),
  };
}

export function callNames(controls: ControlledSaveLayer) {
  return controls.calls.map((call) => call.draft.name);
}
