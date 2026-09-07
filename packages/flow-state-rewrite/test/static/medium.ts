import { Context, Effect, Result, Stream, type Types } from "effect";

import type {
  EventOf,
  Implementation as ImplementationType,
  InputOf,
  MemoryOf,
  RequirementsOf,
  StateOf,
} from "../../src/index.js";
import {
  Diagnostic,
  Implementation,
  app,
  definition,
  machine,
  module,
  resource,
  stream,
  transaction,
} from "../../src/index.js";

// This medium consumer exercises exact inference across definitions, operations, apps, and implementations.

type Expect<Value extends true> = Value;

type PublicDiagnostic = ReturnType<typeof Diagnostic.Failure>;

type ResultSuccess<Value> = Value extends Result.Result<infer Success, unknown> ? Success : never;

const resultSuccess = <Value>(result: Result.Result<Value, PublicDiagnostic>) => {
  if (Result.isFailure(result)) throw result.failure;
  return result.success;
};

type ImplementationOutput<Value> =
  Value extends ImplementationType<infer Output, infer _Error, infer _Requirements>
    ? Output
    : never;

type ImplementationError<Value> =
  Value extends ImplementationType<infer _Output, infer Error, infer _Requirements> ? Error : never;

type ImplementationRequirements<Value> =
  Value extends ImplementationType<infer _Output, infer _Error, infer Requirements>
    ? Requirements
    : never;

type Project = { readonly id: string; readonly title: string };

type ProjectInput = { readonly projectId: string };

type AuditRecord = { readonly projectId: string; readonly action: "save" };

class ProjectRepo extends Context.Service<
  ProjectRepo,
  { readonly find: (id: string) => Effect.Effect<Project> }
>()("StaticHarness/ProjectRepo") {}

class AuditSink extends Context.Service<
  AuditSink,
  { readonly write: (record: AuditRecord) => Effect.Effect<void> }
>()("StaticHarness/AuditSink") {}

class ProjectFeed extends Context.Service<
  ProjectFeed,
  { readonly watch: (id: string) => Stream.Stream<Project> }
>()("StaticHarness/ProjectFeed") {}

const projectResource = resource({
  id: "static/projects.by-id",
  key: ({ projectId }: ProjectInput) => [projectId] as const,
  // RETURN_TYPE: Preserves ProjectRepo and the missing channel in the medium provider proof.
  lookup: (
    { projectId }: ProjectInput,
    { signal }: { readonly signal: AbortSignal },
  ): Effect.Effect<Project, "missing", ProjectRepo> => {
    void signal;
    return Effect.succeed({ id: projectId, title: "example" });
  },
});

const saveProject = transaction({
  id: "static/projects.save",
  key: ({ projectId }: ProjectInput) => [projectId] as const,
  // RETURN_TYPE: Preserves AuditSink and the rejected channel in the medium provider proof.
  commit: (
    { projectId }: ProjectInput,
    { signal }: { readonly signal: AbortSignal },
  ): Effect.Effect<Project, "rejected", AuditSink> => {
    void signal;
    return Effect.succeed({ id: projectId, title: "saved" });
  },
});

const projectUpdates = stream({
  id: "static/projects.updates",
  key: ({ projectId }: ProjectInput) => [projectId] as const,
  // RETURN_TYPE: Preserves ProjectFeed and the offline channel in the medium provider proof.
  subscribe: (
    { projectId }: ProjectInput,
    { signal }: { readonly signal: AbortSignal },
  ): Stream.Stream<Project, "offline", ProjectFeed> => {
    void signal;
    return Stream.make({ id: projectId, title: "update" });
  },
});

const EditorResult = definition({
  id: "static/editor",
  states: ["idle", { ready: ["open", "closed"] }],
  events: {
    opened: (projectId: string) => ({ projectId }),
    closed: "bare",
  },
  operations: {
    project: projectResource,
    save: saveProject,
    updates: projectUpdates,
  },
  memory: ({ input }: { readonly input: ProjectInput }) => ({
    projectId: input.projectId,
    dirty: false,
  }),
});
const Editor = resultSuccess(EditorResult);

const editorMachine = resultSuccess(
  machine(EditorResult, ({ S, E, O }) => {
    void E.opened;
    void O.project;
    return {
      default: S.idle,
      states: {
        idle: {
          on: { opened: { target: S.ready.S.open } },
        },
        ready: {
          default: S.ready.S.open,
          states: {
            open: {
              on: { closed: S.ready.S.closed },
            },
            closed: {},
          },
        },
      },
    };
  }),
);

const EditorInput: InputOf<typeof Editor> = { projectId: "project-1" };
const EditorMemory: MemoryOf<typeof Editor> = { projectId: "project-1", dirty: false };
const EditorEvent: EventOf<typeof Editor> = resultSuccess(Editor.E.opened("project-1"));
const EditorState: StateOf<typeof Editor> = Editor.S.ready.S.open;
void EditorInput;
void EditorMemory;
void EditorEvent;
void EditorState;

const makeLeafMachine = <const Id extends string>(id: Id) => {
  const currentResult = definition({
    id,
    states: ["ready"],
    events: { refresh: "bare" },
    operations: { project: projectResource, updates: projectUpdates },
  });
  return resultSuccess(
    machine(currentResult, ({ S, E }) => ({
      default: S.ready,
      on: { refresh: S.ready },
      states: { ready: { timers: { refresh: { delay: 250, target: E.refresh } } } },
    })),
  );
};

const Viewer = makeLeafMachine("static/viewer");
const Dashboard = makeLeafMachine("static/dashboard");
const Reports = makeLeafMachine("static/reports");
const Importer = makeLeafMachine("static/importer");
const Exporter = makeLeafMachine("static/exporter");

const EditorModule = module({ id: "static/editor-module", machines: { editor: editorMachine } });
const ViewerModule = module({ id: "static/viewer-module", machines: { viewer: Viewer } });
const DashboardModule = module({
  id: "static/dashboard-module",
  machines: { dashboard: Dashboard },
});
const ReportsModule = module({ id: "static/reports-module", machines: { reports: Reports } });
const ImporterModule = module({ id: "static/importer-module", machines: { importer: Importer } });
const ExporterModule = module({ id: "static/exporter-module", machines: { exporter: Exporter } });

const StaticApp = app({
  id: "static-app",
  persistenceVersion: "1",
  modules: [
    EditorModule,
    ViewerModule,
    DashboardModule,
    ReportsModule,
    ImporterModule,
    ExporterModule,
  ],
});

type AppPlanDescriptor = (typeof StaticApp.plan.descriptors)[number];

type AppPlanResource = Extract<AppPlanDescriptor, { readonly kind: "resource" }>;

type AppPlanTransaction = Extract<AppPlanDescriptor, { readonly kind: "transaction" }>;

type AppPlanStream = Extract<AppPlanDescriptor, { readonly kind: "stream" }>;

const repoImplementation = Implementation.succeed(ProjectRepo, {
  find: (id: string) => Effect.succeed({ id, title: "loaded" }),
});
const auditAcquire: Effect.Effect<
  { readonly write: (record: AuditRecord) => Effect.Effect<void> },
  "configuration-failed",
  ProjectRepo
> = Effect.succeed({ write: (_record: AuditRecord) => Effect.succeed(undefined) });
const auditImplementation = Implementation.effect(AuditSink, auditAcquire);
const feedAcquire: Effect.Effect<
  { readonly watch: (id: string) => Stream.Stream<Project> },
  "feed-unavailable",
  ProjectRepo
> = Effect.succeed({ watch: (id: string) => Stream.make({ id, title: "watched" }) });
const feedImplementation = Implementation.effect(ProjectFeed, feedAcquire);
const staticImplementation = Implementation.merge(
  Implementation.merge(repoImplementation, auditImplementation),
  feedImplementation,
);

export type DefinitionProofs = readonly [
  Expect<Types.Equals<InputOf<typeof Editor>, ProjectInput>>,
  Expect<Types.Equals<MemoryOf<typeof Editor>, { projectId: string; dirty: boolean }>>,
  Expect<
    Types.Equals<
      EventOf<typeof Editor>,
      | ResultSuccess<ReturnType<typeof Editor.E.opened>>
      | ResultSuccess<ReturnType<typeof Editor.E.closed>>
    >
  >,
  Expect<
    Types.Equals<
      StateOf<typeof Editor>,
      typeof Editor.S.idle | typeof Editor.S.ready.S.open | typeof Editor.S.ready.S.closed
    >
  >,
  Expect<Types.Equals<typeof Editor.operations.project, typeof projectResource>>,
  Expect<Types.Equals<typeof Editor.operations.save, typeof saveProject>>,
  Expect<Types.Equals<typeof Editor.operations.updates, typeof projectUpdates>>,
];

export type OperationProofs = readonly [
  Expect<Types.Equals<RequirementsOf<typeof projectResource>, ProjectRepo>>,
  Expect<Types.Equals<RequirementsOf<typeof saveProject>, AuditSink>>,
  Expect<Types.Equals<RequirementsOf<typeof projectUpdates>, ProjectFeed>>,
  Expect<Types.Equals<ReturnType<typeof projectResource.key>, readonly [string]>>,
  Expect<Types.Equals<ReturnType<typeof saveProject.key>, readonly [string]>>,
  Expect<Types.Equals<ReturnType<typeof projectUpdates.key>, readonly [string]>>,
];

export type AppProofs = readonly [
  Expect<Types.Equals<typeof StaticApp.M.editor, typeof editorMachine>>,
  Expect<Types.Equals<typeof StaticApp.M.viewer, typeof Viewer>>,
  Expect<Types.Equals<typeof StaticApp.M.dashboard, typeof Dashboard>>,
  Expect<Types.Equals<typeof StaticApp.M.reports, typeof Reports>>,
  Expect<Types.Equals<typeof StaticApp.M.importer, typeof Importer>>,
  Expect<Types.Equals<typeof StaticApp.M.exporter, typeof Exporter>>,
  Expect<
    Types.Equals<typeof StaticApp.M.editor.definition.operations.project, typeof projectResource>
  >,
  Expect<Types.Equals<typeof StaticApp.M.editor.definition.operations.save, typeof saveProject>>,
  Expect<
    Types.Equals<typeof StaticApp.M.editor.definition.operations.updates, typeof projectUpdates>
  >,
  Expect<Types.Equals<RequirementsOf<typeof editorMachine>, ProjectRepo | AuditSink | ProjectFeed>>,
  Expect<Types.Equals<AppPlanResource, typeof projectResource>>,
  Expect<Types.Equals<AppPlanTransaction, typeof saveProject>>,
  Expect<Types.Equals<AppPlanStream, typeof projectUpdates>>,
  Expect<Types.Equals<RequirementsOf<typeof StaticApp>, ProjectRepo | AuditSink | ProjectFeed>>,
];

export type ImplementationProofs = readonly [
  Expect<Types.Equals<ImplementationOutput<typeof repoImplementation>, ProjectRepo>>,
  Expect<
    Types.Equals<
      ImplementationOutput<typeof staticImplementation>,
      ProjectRepo | AuditSink | ProjectFeed
    >
  >,
  Expect<
    Types.Equals<
      ImplementationError<typeof staticImplementation>,
      "configuration-failed" | "feed-unavailable"
    >
  >,
  Expect<Types.Equals<ImplementationRequirements<typeof staticImplementation>, ProjectRepo>>,
];

void StaticApp;
void staticImplementation;
