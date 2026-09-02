import { Context, Effect, Result, Stream } from "effect";

import { definition } from "../../src/definition/definition.js";
import type { EventOf, InputOf, MemoryOf, StateOf } from "../../src/definition/domain.js";
import { machine } from "../../src/machine/machine.js";
import { app, module, type RequirementsOf } from "../../src/app/app.js";
import { resource } from "../../src/operation/resource.js";
import { stream } from "../../src/operation/stream.js";
import { transaction } from "../../src/operation/transaction.js";
import { Implementation } from "../../src/implementation/implementation.js";
import type {
  ImplementationErrorOf,
  ImplementationRequirementsOf,
  ImplementationServices,
} from "../../src/implementation/implementation.js";

// TYPE-P03 / TYPE-P04 / PROOF-001.
// Production owners: definition, machine, operation, app, and implementation feature modules.
// Rationale: this medium consumer keeps exact inference connected across every available static owner.
// Blocked lanes: packed public declarations, later root/runtime/persistence owners, API-P01/API-P02,
// AMEND-P05 quickstart, and Phase 1 validation remain outside this partial harness.

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

type Expect<Value extends true> = Value;

type ResultSuccess<Value> = Value extends Result.Result<infer Success, unknown> ? Success : never;

const definitionSuccess = <Value>(result: Result.Result<Value, unknown>): Value => {
  if (Result.isFailure(result)) throw result.failure;
  return result.success;
};

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
  subscribe: (
    { projectId }: ProjectInput,
    { signal }: { readonly signal: AbortSignal },
  ): Stream.Stream<Project, "offline", ProjectFeed> => {
    void signal;
    return Stream.make({ id: projectId, title: "update" });
  },
});

const Editor = definitionSuccess(
  definition({
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
  }),
);

const editorMachine = machine(Editor, ({ S, E, O }) => {
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
});

const EditorInput: InputOf<typeof Editor> = { projectId: "project-1" };
const EditorMemory: MemoryOf<typeof Editor> = { projectId: "project-1", dirty: false };
const EditorEvent: EventOf<typeof Editor> = definitionSuccess(Editor.E.opened("project-1"));
const EditorState: StateOf<typeof Editor> = Editor.S.ready.S.open;
void EditorInput;
void EditorMemory;
void EditorEvent;
void EditorState;

const makeLeafMachine = <const Id extends string>(id: Id) => {
  const current = definitionSuccess(
    definition({
      id,
      states: ["ready"],
      events: { refresh: "bare" },
      operations: { project: projectResource, updates: projectUpdates },
    }),
  );
  return machine(current, ({ S, E }) => ({
    default: S.ready,
    on: { refresh: S.ready },
    states: { ready: { timers: { refresh: { delay: 250, target: E.refresh } } } },
  }));
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

type DefinitionProofs = readonly [
  Expect<Equal<InputOf<typeof Editor>, ProjectInput>>,
  Expect<Equal<MemoryOf<typeof Editor>, { projectId: string; dirty: boolean }>>,
  Expect<
    Equal<
      EventOf<typeof Editor>,
      | ResultSuccess<ReturnType<typeof Editor.E.opened>>
      | ResultSuccess<ReturnType<typeof Editor.E.closed>>
    >
  >,
  Expect<
    Equal<
      StateOf<typeof Editor>,
      typeof Editor.S.idle | typeof Editor.S.ready.S.open | typeof Editor.S.ready.S.closed
    >
  >,
];

type OperationProofs = readonly [
  Expect<Equal<RequirementsOf<typeof projectResource>, ProjectRepo>>,
  Expect<Equal<RequirementsOf<typeof saveProject>, AuditSink>>,
  Expect<Equal<RequirementsOf<typeof projectUpdates>, ProjectFeed>>,
  Expect<Equal<ReturnType<typeof projectResource.key>, readonly [string]>>,
  Expect<Equal<ReturnType<typeof saveProject.key>, readonly [string]>>,
  Expect<Equal<ReturnType<typeof projectUpdates.key>, readonly [string]>>,
];

type AppProofs = readonly [
  Expect<Equal<typeof StaticApp.M.editor, typeof editorMachine>>,
  Expect<Equal<typeof StaticApp.M.viewer, typeof Viewer>>,
  Expect<Equal<typeof StaticApp.M.dashboard, typeof Dashboard>>,
  Expect<Equal<typeof StaticApp.M.reports, typeof Reports>>,
  Expect<Equal<typeof StaticApp.M.importer, typeof Importer>>,
  Expect<Equal<typeof StaticApp.M.exporter, typeof Exporter>>,
  Expect<Equal<RequirementsOf<typeof StaticApp>, ProjectRepo | AuditSink | ProjectFeed>>,
];

type ImplementationProofs = readonly [
  Expect<Equal<ImplementationServices<typeof repoImplementation>, ProjectRepo>>,
  Expect<
    Equal<
      ImplementationServices<typeof staticImplementation>,
      ProjectRepo | AuditSink | ProjectFeed
    >
  >,
  Expect<
    Equal<
      ImplementationErrorOf<typeof staticImplementation>,
      "configuration-failed" | "feed-unavailable"
    >
  >,
  Expect<Equal<ImplementationRequirementsOf<typeof staticImplementation>, ProjectRepo>>,
];

const proofCounts: readonly [
  DefinitionProofs["length"],
  OperationProofs["length"],
  AppProofs["length"],
  ImplementationProofs["length"],
] = [4, 6, 7, 4];
void proofCounts;
void StaticApp;
void staticImplementation;
