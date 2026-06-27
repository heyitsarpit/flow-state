import { Context, Effect, Layer, Option, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { createKey, createRuntime, flow } from "./index";
import type {
  FlowAppDefinition,
  FlowAppInventory,
  FlowAppLayer,
  FlowActorRef,
  FlowEvent,
  FlowManagedRuntime,
  FlowModuleDefinition,
  FlowMutationDefinition,
  FlowOrchestratorSystem,
  FlowResourceCallable,
  FlowResourceStore,
  FlowStoreDefinition,
  FlowStreamConfig,
  FlowTransactionConfig,
} from "./index";

function assertType<T>(_value: T): void {
  return undefined;
}

type SaveEvent =
  | ({ readonly type: "SAVE"; readonly name: string } & FlowEvent)
  | ({ readonly type: "REPLAY" } & FlowEvent)
  | ({ readonly type: "UNDO" } & FlowEvent)
  | ({ readonly type: "SAVED"; readonly value: { readonly id: string } } & FlowEvent)
  | ({ readonly type: "FAILED"; readonly error: "conflict" } & FlowEvent);

interface SaveContext {
  readonly projectId: string;
  readonly offline: boolean;
}

interface SaveParams {
  readonly id: string;
  readonly name: string;
}

interface SaveResult {
  readonly id: string;
}

interface ProjectApiShape {
  readonly save: (params: SaveParams) => Effect.Effect<SaveResult, "conflict">;
}

class ProjectApi extends Context.Service<ProjectApi, ProjectApiShape>()("ProjectApi") {}

describe("public API type coverage", () => {
  it("locks flow.transaction target names and typed queue callbacks", () => {
    const project = flow.resource<[string], SaveResult>({
      id: "project.byId",
      key: (id) => createKey("project", id),
      lookup: (id) => Effect.succeed({ id }),
      placeholder: () => Option.some({ id: "placeholder" }),
    });
    const transaction = flow.transaction<
      SaveContext,
      SaveEvent,
      SaveParams,
      SaveResult,
      "conflict",
      ProjectApi
    >({
      id: "Project.save",
      params: ({ context, event }) =>
        event?.type === "SAVE" ? { id: context.projectId, name: event.name } : null,
      commit: (params) => Effect.flatMap(ProjectApi, (api) => api.save(params)),
      preview: {
        apply: ({ params }) => [{ ref: project.ref(params.id), replace: { id: params.id } }],
      },
      queue: {
        when: ({ context, params }) => context.offline && params.name.length > 0,
        replay: ({ event }) => event?.type === "REPLAY",
        undo: ({ event }) => event?.type === "UNDO",
      },
      invalidates: ({ params, result }) => [
        project.ref(params.id).key,
        createKey("saved", result.id),
      ],
      routes: {
        success: ({ value }) => ({ type: "SAVED", value }),
        failure: ({ error }) => ({ type: "FAILED", error }),
      },
      concurrency: "reject-while-running",
    });

    assertType<
      FlowMutationDefinition<
        FlowTransactionConfig<
          SaveContext,
          SaveEvent,
          SaveParams,
          SaveResult,
          "conflict",
          ProjectApi
        >
      >
    >(transaction);
    assertType<(params: SaveParams) => Effect.Effect<SaveResult, "conflict", ProjectApi>>(
      transaction.config.commit,
    );
    assertType<
      | ((args: {
          readonly context: SaveContext;
          readonly event: SaveEvent | null;
          readonly params: SaveParams;
        }) => boolean)
      | undefined
    >(transaction.config.queue?.when);
    assertType<
      readonly NonNullable<
        FlowTransactionConfig<
          SaveContext,
          SaveEvent,
          SaveParams,
          SaveResult,
          "conflict",
          ProjectApi
        >["concurrency"]
      >[]
    >(["reject-while-running", "serialize", "cancel-previous", "allow"]);

    expect(transaction.kind).toBe("mutation");
  });

  it("rejects legacy transaction field names at the target type boundary", () => {
    flow.transaction<SaveContext, SaveEvent, SaveParams>({
      id: "Project.save",
      // @ts-expect-error Transaction builder uses params, not input.
      input: () => ({ id: "launch-1" }),
      commit: (_params: SaveParams) => Effect.succeed({ id: "launch-1" } as SaveResult),
    });
    flow.transaction<SaveContext, SaveEvent, SaveParams>({
      id: "Project.save",
      params: () => ({ id: "launch-1", name: "Atlas" }),
      // @ts-expect-error Transaction builder uses commit, not effect.
      effect: (_params: SaveParams) => Effect.succeed({ id: "launch-1" } as SaveResult),
    });
    flow.transaction<SaveContext, SaveEvent, SaveParams>({
      id: "Project.save",
      params: () => ({ id: "launch-1", name: "Atlas" }),
      commit: (_params: SaveParams) => Effect.succeed({ id: "launch-1" } as SaveResult),
      // @ts-expect-error Transaction builder uses preview, not optimistic.
      optimistic: { apply: () => [] },
    });

    expect("Project.save").toBe("Project.save");
  });

  it("keeps app, module, layer, runtime, resource, and stream target shapes typed", () => {
    const commentsConfig: FlowStreamConfig<
      SaveContext,
      SaveEvent,
      void,
      string,
      "conflict",
      ProjectApi
    > = {
      id: "Project.comments",
      subscribe: () =>
        Stream.fromEffect(
          Effect.flatMap(ProjectApi, (api) => api.save({ id: "stream", name: "Atlas" })).pipe(
            Effect.map((value) => value.id),
          ),
        ),
    };
    const comments = flow.stream(commentsConfig);
    const project = flow.resource<[string], SaveResult, "conflict", ProjectApi>({
      id: "project.byId",
      key: (id) => createKey("project", id),
      lookup: (id) => Effect.flatMap(ProjectApi, (api) => api.save({ id, name: "Atlas" })),
    });
    const machine = flow.machine<SaveContext, SaveEvent, "ready">({
      id: "Project.editor",
      initial: "ready",
      context: () => ({ projectId: "launch-1", offline: false }),
      states: { ready: {} },
    });
    const Project = flow.module(
      "Project",
      () => ({
        resources: { project },
        streams: { comments },
        machines: { editor: machine },
        views: {
          summary: flow.view<SaveContext, "ready", { readonly id: string }>({
            id: "Project.summary",
            sources: ["context"],
            select: ({ context }) => ({ id: context.projectId }),
          }),
        },
      }),
      {
        dependencies: ["Session"],
        tags: ["project"],
        screens: ["Editor"],
        fixtures: ["defaultProject"],
      },
    );
    const Session = flow.module(
      "Session",
      {
        policies: {
          canEdit: "session.canEdit",
        },
      },
      { tags: ["session"] },
    );
    const App = flow.app({ modules: [Session, Project] });
    const AppLayer = App.layer({
      store: flow.store.test({ deterministic: true }),
      orchestrators: flow.orchestrators.test({ deterministic: true }),
      services: [
        Layer.succeed(
          ProjectApi,
          ProjectApi.of({ save: (params) => Effect.succeed({ id: params.id }) }),
        ),
      ],
    });
    const runtime = flow.runtime(AppLayer);
    const runtimeEnvironment = { now: () => 0 };

    assertType<FlowResourceCallable<[string], SaveResult, "conflict", ProjectApi>>(project);
    assertType<FlowModuleDefinition<"Project", typeof Project>>(Project);
    assertType<FlowAppDefinition<readonly [typeof Session, typeof Project]>>(App);
    assertType<FlowAppInventory>(App.inventory());
    assertType<FlowStoreDefinition<"store:test", { readonly deterministic: true }>>(
      flow.store.test({ deterministic: true }),
    );
    assertType<FlowAppLayer<readonly [Layer.Layer<ProjectApi>]>>(AppLayer);
    assertType<FlowManagedRuntime<ProjectApi, never>>(runtime);
    assertType<FlowResourceStore>(runtime.resources);
    assertType<FlowOrchestratorSystem>(runtime.orchestrators);
    const actor = createRuntime().createActor(machine);
    assertType<FlowActorRef<SaveContext, SaveEvent, "ready">>(actor);
    assertType<(id: string) => boolean>(actor.retryChild);

    const serviceBackedEffect = Effect.flatMap(ProjectApi, (api) =>
      api.save({ id: "launch-1", name: "Atlas" }),
    );
    const serviceBackedResource = project.config.lookup("launch-1");
    const serviceBackedStream = Stream.runCollect(
      comments.config.subscribe({
        params: undefined,
        input: undefined,
        services: undefined as never,
        runtime: runtimeEnvironment,
      }),
    );
    const missingRuntime = flow.runtime(Layer.empty);
    const assertRuntimeRequirements = () => {
      assertType<Promise<SaveResult>>(runtime.runPromise(serviceBackedEffect));
      assertType<Promise<SaveResult>>(runtime.runPromise(serviceBackedResource));
      assertType<Promise<unknown>>(runtime.runPromise(serviceBackedStream));

      // @ts-expect-error The empty Layer does not provide ProjectApi.
      void missingRuntime.runPromise(serviceBackedEffect);
      // @ts-expect-error The empty Layer does not provide ProjectApi for resource lookup.
      void missingRuntime.runPromise(serviceBackedResource);
      // @ts-expect-error The empty Layer does not provide ProjectApi for stream subscription.
      void missingRuntime.runPromise(serviceBackedStream);
    };
    void assertRuntimeRequirements;

    expect(Project.inventory()).toMatchObject({
      name: "Project",
      resources: ["project"],
      streams: ["comments"],
      machines: ["editor"],
      views: ["summary"],
      dependencies: ["Session"],
    });
    expect(App.modules).toHaveLength(2);
    expect(App.inventory()).toMatchObject({
      modules: [
        expect.objectContaining({ name: "Session", policies: ["canEdit"] }),
        expect.objectContaining({ name: "Project", resources: ["project"] }),
      ],
      resources: [{ module: "Project", name: "project" }],
      actors: [{ module: "Project", name: "editor" }],
      views: [{ module: "Project", name: "summary" }],
      viewsByScreen: [{ screen: "Editor", module: "Project", name: "summary" }],
    });
    expect(() => flow.app({ modules: [Project, Project] })).toThrow(/Duplicate module name/);
    expect(() => flow.app({ modules: [Project] })).toThrow(
      /Missing module dependency "Session" required by "Project"/,
    );
    expect(() =>
      flow.app({
        modules: [
          Session,
          flow.module("DuplicateResource", {
            resources: {
              projectAgain: project,
            },
          }),
          Project,
        ],
      }),
    ).toThrow(/Duplicate resource id "project.byId"/);
    expect(() =>
      flow.app({
        modules: [
          flow.module("Approval", {}, { dependencies: ["Project"] }),
          flow.module("Project", {}, { dependencies: ["Approval"] }),
        ],
      }),
    ).toThrow(/Module dependency cycle detected: Approval -> Project -> Approval/);
    expect(actor.retryChild("missing")).toBe(false);
  });
});
