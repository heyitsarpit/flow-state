# Core API vNext

Status: contract draft.

This page defines the target authoring API. It is intentionally fresh. Older
runtime slices may expose `flow.query`, actor-local resource slots, or
submission helpers, but the target model is app-level resources plus explicit
flows.

## Mental Model

```txt
Resource Graph
  currentUser
  project:p1
  comments:p1
  permissions:p1

Flow Graph
  Project.editor
    loading -> viewing -> editing -> saving -> conflict

View Projection
  resource snapshots + one or more flow snapshots -> UI read model
```

Resources and flows are not unrelated libraries. They are sibling services in
one Effect runtime:

```txt
FlowRuntime
  ResourceStore service
  OrchestratorSystem service
  Trace service
  Clock/Scheduler service
  user app services
```

## Design Rules

| Rule                        | Contract                                                                                                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain first                | Users author `Project.byId`, `Project.save`, and `Project.editor`, not global buckets of unrelated queries and machines.                                                                                 |
| Canonical data in resources | API data that multiple components or flows can read belongs in ResourceStore.                                                                                                                            |
| Process data in flows       | Drafts, selected step, retry intent, conflict choice, wizard progress, and child actor state belong in machine/actor context.                                                                            |
| Views are read models       | Views combine and simplify resource snapshots plus one or more flow snapshots. They do not fetch, mutate, or start workflow work.                                                                        |
| Effect owns the substrate   | Use `Effect<A, E, R>`, `Context.Service`, `Layer`, `Stream`, `Schedule`, `Duration.Input`, `Exit`, `Cause`, `Schema`, `Redacted`, `Option`, and `Result` directly.                                       |
| Flow owns integration       | Flow names only the pieces that coordinate app resources and process state: `module`, `resource`, `transaction`, `machine`, `ensure`, `observe`, `patch`, `invalidate`, snapshots, receipts, and traces. |

## Module API

`flow.module` is a domain manifest. It is useful when the runtime, docs,
devtools, tests, route adapters, and AI handoffs need to discover the pieces of
a domain without guessing from arbitrary exports.

Target module shape:

```ts
interface FlowModule {
  readonly name: string;
  readonly resources?: Record<string, ResourceDefinition<any, any, any>>;
  readonly transactions?: Record<string, TransactionDefinition<any, any, any, any>>;
  readonly machines?: Record<string, MachineDefinition<any, any>>;
  readonly streams?: Record<string, StreamDefinition<any, any, any, any>>;
  readonly views?: Record<string, ViewDefinition<any>>;
  readonly schemas?: Record<string, Schema.Schema<any>>;
  readonly policies?: Record<string, unknown>;
  readonly modules?: Record<string, FlowModule>;
}
```

The current implementation still accepts a looser object so examples can
pressure-test the API. New vNext examples should return this named manifest
shape even before the runtime consumes every field.

```ts
const Project = flow.module("Project", ({ resource, transaction, machine }) => {
  const byId = resource({
    key: (id: ProjectId) => ["project", id] as const,
    lookup: Effect.fn("Project.byId.lookup")(function* (id) {
      const api = yield* ProjectApi;
      return yield* api.getProject(id);
    }),
    cache: {
      capacity: 500,
      timeToLive: "10 minutes",
    },
    freshness: {
      staleAfter: "30 seconds",
      refresh: Schedule.spaced("30 seconds"),
    },
    tags: (id) => [ProjectTag, ProjectDetailTag(id)],
  });

  const comments = resource({
    key: (projectId: ProjectId) => ["comments", projectId] as const,
    lookup: Effect.fn("Project.comments.lookup")(function* (projectId) {
      const api = yield* CommentApi;
      return yield* api.listForProject(projectId);
    }),
  });

  const save = transaction({
    params: SaveProjectInput,
    commit: Effect.fn("Project.save.commit")(function* (params) {
      const api = yield* ProjectApi;
      return yield* api.saveProject(params);
    }),
    preview: ({ params, store }) =>
      store.patch(byId(params.id), (project) => ({ ...project, ...params })),
    invalidates: ({ result }) => [byId(result.id), ProjectListTag],
  });

  const editor = machine({
    input: {
      projectId: flow.input<ProjectId>(),
    },
    context: {
      draft: flow.option<ProjectDraft>(),
      error: flow.option<ProjectError>(),
    },
    initial: "loading",
    states: {
      loading: {
        invoke: flow.ensure(({ input }) => byId(input.projectId), {
          onReady: "viewing",
          onFailure: "failed",
        }),
      },
      viewing: {
        resources: {
          project: flow.observe(({ input }) => byId(input.projectId)),
          comments: flow.observe(({ input }) => comments(input.projectId)),
        },
        on: {
          EDIT: flow.to("editing", {
            update: ({ resources }) => ({
              draft: Option.some(ProjectDraft.from(resources.project.data)),
            }),
          }),
          REFRESH: flow.refresh(({ input }) => byId(input.projectId)),
        },
      },
      editing: {
        resources: {
          project: flow.observe(({ input }) => byId(input.projectId)),
        },
        on: {
          CHANGE_NAME: {
            update: ({ ctx, event }) => ({
              draft: Option.map(ctx.draft, (draft) => ({
                ...draft,
                name: event.name,
              })),
            }),
          },
          SAVE: "saving",
          CANCEL: "viewing",
        },
      },
      saving: {
        invoke: flow.run(save, {
          params: ({ ctx }) => Option.getOrThrow(ctx.draft),
          onSuccess: flow.to("viewing", {
            update: () => ({
              draft: Option.none(),
              error: Option.none(),
            }),
          }),
          onFailure: [
            flow.when(
              (error) => error._tag === "ProjectConflict",
              flow.to("conflict", {
                update: (_args, error) => ({
                  error: Option.some(error),
                }),
              }),
            ),
            flow.to("editing", {
              update: (_args, error) => ({
                error: Option.some(error),
              }),
            }),
          ],
        }),
      },
      conflict: {
        on: {
          KEEP_EDITING: "editing",
          ACCEPT_SERVER: "viewing",
        },
      },
      failed: {
        on: {
          RETRY: "loading",
        },
      },
    },
  });

  return {
    resources: { byId, comments },
    transactions: { save },
    machines: { editor },
  };
});
```

## Resources

Use `flow.resource` for canonical shared app data.

```ts
interface ResourceConfig<Key, A, E, R> {
  readonly key: (...args: any[]) => Key;
  readonly lookup: (...args: any[]) => Effect.Effect<A, E, R>;
  readonly tags?: (...args: any[]) => readonly ResourceTag[];
  readonly cache?: {
    readonly capacity?: number;
    readonly timeToLive?: Duration.Input | ((exit: Exit.Exit<A, E>, key: Key) => Duration.Input);
  };
  readonly freshness?: {
    readonly staleAfter?: Duration.Input;
    readonly refresh?: Schedule.Schedule<unknown, unknown, unknown>;
    readonly onInvalidate?: "active" | "never";
  };
  readonly placeholder?: (...args: any[]) => Option.Option<A>;
  readonly schema?: Schema.Schema<A>;
}
```

Effect `Cache` language is used for lookup cache behavior:

- `lookup` is the Effect run on a miss or refresh.
- `capacity` bounds cache entries.
- `timeToLive` expires cached exits.

Flow language is used for UI/resource semantics:

- `staleAfter` means data may still be shown but should refresh.
- `invalidated` means a write marked the resource stale.
- `placeholder` means a renderable value exists but is not canonical data.

Do not collapse resource state into `loading | success | error`.

```ts
type ResourceSnapshot<A, E> = {
  readonly availability:
    | { readonly tag: "empty" }
    | { readonly tag: "data"; readonly data: A }
    | { readonly tag: "error"; readonly error: E; readonly previous?: A };

  readonly activity:
    | { readonly tag: "idle" }
    | { readonly tag: "fetching" }
    | { readonly tag: "paused" };

  readonly freshness:
    | { readonly tag: "fresh" }
    | { readonly tag: "stale" }
    | { readonly tag: "invalidated" }
    | { readonly tag: "expired" };

  readonly updatedAt?: number;
  readonly expiresAt?: number;
  readonly invalidatedAt?: number;
  readonly isPlaceholder: boolean;
  readonly requestId: number | null;
  readonly cause?: SerializableCause;
};
```

Helpers can provide familiar rendering ergonomics:

```tsx
project.match({
  pending: () => <Spinner />,
  failure: ({ error }) => <ErrorView error={error} />,
  success: ({ data, isRefreshing }) => <ProjectView project={data} refreshing={isRefreshing} />,
});
```

## Transactions

Use `flow.transaction` for writes. A transaction is not just an Effect call. It
is a traceable ResourceStore write descriptor. The current implementation still
spells this `flow.mutation`; `flow.transaction` is the intended vNext name.

```ts
interface TransactionConfig<P, A, E, R> {
  readonly params?: Schema.Schema<P>;
  readonly commit: (params: P) => Effect.Effect<A, E, R>;
  readonly preview?: (args: {
    readonly params: P;
    readonly store: ResourceStore;
  }) => Effect.Effect<void>;
  readonly invalidates?:
    | readonly InvalidationTarget[]
    | ((args: { readonly params: P; readonly result: A }) => readonly InvalidationTarget[]);
  readonly concurrency?: "reject-while-running" | "serialize" | "cancel-previous" | "allow";
}
```

Internal transaction shape:

```txt
machine event
  -> flow transition
  -> transaction:start receipt
  -> preview patch
  -> commit Effect
  -> success/failure/defect/interrupt
  -> rollback or commit
  -> invalidation
  -> machine route
  -> trace timeline
```

This is the strongest integration point between resources and flows.

The transaction guarantee is intentionally scoped:

- Flow can apply local preview ResourceStore patches and roll them back if
  the Effect fails, defects, or is interrupted before commit.
- Flow can record a correlated receipt timeline for the machine event, preview
  patch, Effect exit, invalidation, rollback, and final route.
- Flow can enforce local concurrency policies for the descriptor.
- Flow cannot undo a remote server write that already committed.
- Flow cannot make an HTTP call, SQL write, or server query atomic with the
  browser ResourceStore unless the app service itself provides that guarantee.
- Flow rollback covers the Flow-owned preview patch set, not arbitrary
  side effects inside the Effect.

`flow.run(Project.save, handlers)` is the current flow-side primitive for
running that transaction from a state. The name of this field is still open.
Older `flow.submit(...)` style helpers may remain as migration sugar, but final
examples should teach the transaction definition plus state invocation pair.

## Machines

Machines model process state. Their context should not duplicate canonical
resources unless the process owns a true local draft or fork.

Good context:

```ts
{
  draft: Option.Option<ProjectDraft>;
  error: Option.Option<ProjectError>;
  selectedTab: "details" | "comments";
}
```

Bad context:

```ts
{
  project: Project
  comments: readonly Comment[]
  projectIsFetching: boolean
  projectIsStale: boolean
}
```

The project and comments belong in ResourceStore. The draft and tab belong in
the editor flow.

## Integration Primitives

```ts
flow.ensure(resourceRef, handlers);
```

Blocking dependency. The flow cannot proceed until the resource has data or a
typed failure.

```ts
flow.observe(resourceRef);
```

Non-blocking dependency. The active state exposes the latest resource snapshot.

```ts
flow.refresh(resourceRef);
```

Start a refresh without changing semantic flow state unless the product chooses
to route that event.

```ts
flow.run(transactionRef, handlers);
```

Run a transaction as part of a state.

```ts
flow.invalidate(target);
flow.patch(resourceRef, patch);
```

ResourceStore operations that produce receipts and update observers.

The essential distinction:

```txt
ensure = process dependency
observe = data dependency
```

## Views

Views are UI read models. They combine runtime facts from resources and one or
more flows, then collapse them into a smaller shape for components.

They are not only summaries of a single machine. A view may combine several
flows when a screen needs one coherent render model.

```ts
const overviewView = flow.view({
  id: "Launch.overview",
  input: {
    launchId: flow.input<LaunchId>(),
  },
  sources: ({ input, actors }) => ({
    resources: {
      project: Project.byId(input.launchId),
      readiness: Readiness.metrics(input.launchId),
      assets: Assets.list(input.launchId),
      approval: Approval.current(input.launchId),
      chat: Chat.thread(input.launchId),
    },
    flows: {
      editor: actors.optional(Project.editor, { input }),
      upload: actors.optional(Assets.uploadFlow, { input }),
      approval: actors.optional(Approval.flow, { input }),
      assistant: actors.optional(Assistant.workspace, { input }),
      chat: actors.optional(Chat.flow, { input }),
    },
  }),
  select: ({ resources, flows }) => ({
    title: resources.project.data?.name ?? "Untitled launch",
    readiness: ReadinessViewModel.from(resources.readiness),
    assetStatus: AssetsViewModel.from(resources.assets, flows.upload),
    approvalStatus: ApprovalViewModel.from(resources.approval, flows.approval),
    assistantBusy: flows.assistant?.state === "running",
    chatStreaming: flows.chat?.state === "streaming",
  }),
});
```

A narrower workflow screen can still define a focused view:

```ts
const editorView = flow.view({
  id: "Project.editor.view",
  sources: ({ actor }) => ({
    resources: {
      project: actor.resources.project,
      comments: actor.resources.comments,
    },
    flows: {
      editor: actor,
    },
  }),
  select: ({ resources, flows }) => ({
    mode: flows.editor.state,
    draft: flows.editor.ctx.draft,
    project: ProjectViewModel.from(resources.project),
    comments: CommentsViewModel.from(resources.comments),
    canSave: flow.can(flows.editor, { type: "SAVE" }),
  }),
});
```

Components can use either side:

```tsx
function ProjectBreadcrumb({ projectId }: { projectId: ProjectId }) {
  const project = flow.useResource(Project.byId(projectId));
  return project.match({
    pending: () => <Skeleton />,
    failure: () => <span>Unknown project</span>,
    success: ({ data }) => <span>{data.name}</span>,
  });
}

function ProjectEditorPage({ projectId }: { projectId: ProjectId }) {
  const editor = flow.use(Project.editor, { input: { projectId } });
  return editor.match({
    loading: () => <ProjectSkeleton />,
    viewing: ({ resources, send }) => (
      <ProjectView
        project={resources.project.data}
        comments={resources.comments}
        onEdit={() => send({ type: "EDIT" })}
      />
    ),
    editing: ({ ctx, send }) => (
      <ProjectForm draft={Option.getOrThrow(ctx.draft)} onSave={() => send({ type: "SAVE" })} />
    ),
  });
}
```

The breadcrumb does not need the editor flow. The editor flow does not own
canonical project data. Both read the same resource.

Views are part of the final model, not a convenience afterthought. Use them for
stable UI read models that combine app data, several process snapshots, command
availability, freshness, activity, and trace-friendly status into a simpler
shape. Keep selectors pure; views should not fetch, mutate, invalidate, start
workflow work, or hide canonical data ownership.

## Schemas, Options, Results, Errors

Use Effect's domain tools directly:

- `Schema.Class` for domain values crossing I/O, persistence, or docs.
- `Schema.TaggedErrorClass` for schema-backed typed failures.
- `Data.TaggedError`, `Data.TaggedClass`, or `Data.taggedEnum` for internal data.
- `Option` for absence inside Flow/Effect code.
- `Result` for pure synchronous validation.
- `Effect` for service work and async dependencies.

Do not use `try/catch` inside `Effect.gen` to catch Effect failures. Use
`Effect.catchTag`, `Effect.catchTags`, `Effect.result`, or `Effect.exit`.

## Compatibility Note

Older examples may use `flow.query`, actor-local resource snapshots, and
context-copied data because they proved the first runtime slice. In vNext,
`query` becomes a compatibility alias or migration surface for `resource`. New
docs and rewritten examples should teach the ResourceStore model.
