# Launch Workspace

Launch Workspace is the product-shaped API proof for Flow State. It coordinates one launch project across editing, readiness, assets, approval, assistant work, chat, and trace inspection.

It is not a production app. It is a reviewable usage proof that keeps API shape, ownership rules, and runtime status visible.

The browser shell now runs the workspace actor directly through `flow.use(...)`, keeps the editor surface close to raw resource plus flow data, and renders the Overview, Trace, and Debug side panels through `flow.useView(...)` so the read models stay owned by their modules instead of leaking into one root component.

The current browser boot path is Next.js App Router on stable `next@16.2.9`:
`app/layout.tsx`, `app/page.tsx`, and one `"use client"` runtime boundary in
`app/LaunchWorkspaceClient.tsx`. That boundary is intentionally client-only for
now; request-scoped SSR, serialization, and rehydration stay future-marked
until the later server phases land.

## Product Map

| Screen    | Module                                   | What it proves                                                                                                                             |
| --------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Overview  | `LaunchWorkspace`, `Launch`, `Readiness` | Multi-source projection is possible when an overview truly needs it.                                                                       |
| Editor    | `Project`                                | Project data lives in resources; draft and conflict choices live in flow context, and the shell reads them directly without an extra view. |
| Checklist | `Checklist`                              | Pure local flow state with focused `update` reducers.                                                                                      |
| Readiness | `Readiness`                              | Dashboard resource snapshots and invalidation facts.                                                                                       |
| Assets    | `Assets`                                 | Upload stream descriptors, pressure policy, and delayed completion.                                                                        |
| Approval  | `Approval`                               | Permission gates, redaction, and persisted descriptor shape.                                                                               |
| Assistant | `Assistant`                              | Parent flow, child task actor, progress stream, and retry/failure visibility.                                                              |
| Chat      | `Chat`                                   | Stream generation, stop interrupt, route detach/reattach, explicit disposal.                                                               |
| Trace     | `Trace`                                  | Receipts, issues, stream snapshots, and child snapshots.                                                                                   |

## Modules

The app is composed from named modules rather than loose exports.

```ts
export const LaunchWorkspaceApp = flow.app({
  modules: [
    LaunchWorkspaceModule,
    Session,
    Launch,
    Project,
    Checklist,
    Readiness,
    Assets,
    Approval,
    Assistant,
    Chat,
    Trace,
  ],
});
```

The module inventory test verifies module names, dependencies, resources, transactions, actors, optional projections, screen ownership, and fixtures.

## Resources

Launch Workspace uses app-level resources for canonical data:

```ts
export const projectResource = flow.resource({
  id: "launch.project",
  key: (id) => createKey("launch", "project", id),
  lookup: (id) => Effect.succeed({ ...fixtureProject, id }),
  tags: () => [projectTag],
  placeholder: () => Option.some(fixtureProject),
  freshness: { staleAfter: "30 seconds", onInvalidate: "active" },
});
```

The app seed includes project, permissions, readiness, assets, and approval snapshots so tests can start from known app data without copying canonical values into flow context.

## Transactions

Project save is the central write proof. It uses final authoring names and currently runs through compatibility receipt labels internally.

```ts
export const saveLaunchProjectTransaction = flow.transaction({
  id: "launch.save-project",
  params: saveLaunchProjectParams,
  commit: saveProject,
  preview: {
    apply: ({ params }) => [
      {
        ref: projectResource.ref(params.id),
        replace: { ...fixtureProject, ...params.draft, id: params.id },
      },
    ],
  },
  invalidates: [projectTag],
  concurrency: "reject-while-running",
});
```

Tests prove preview patch, rollback on typed conflict, route handling, and conflict preservation.

## Workflows

The workspace machine keeps process state small:

```ts
export interface LaunchWorkspaceContext {
  readonly activeTab: LaunchWorkspaceTab;
  readonly activeProjectId: LaunchProjectId;
  readonly draft: ProjectDraft;
  readonly checklist: readonly LaunchChecklistItem[];
  readonly assistantTasks: readonly string[];
  readonly connection: "online" | "offline";
  readonly saveError: Option.Option<ProjectSaveError>;
  readonly lastSavedAt: Option.Option<number>;
  readonly lastTraceEvent: Option.Option<string>;
}
```

Project, readiness, assets, approval, and permissions stay in ResourceStore. The flow owns active tab, drafts, network mode, save conflicts, and trace labels.

## Streams And Child Actors

Asset upload, assistant progress, and chat tokens use `flow.stream` descriptors with `subscribe`.

```ts
export const tokenStream = flow.stream({
  id: "Chat.tokenStream",
  params: ({ context }) => ({ threadId: "chat-1", prompt: context.prompt }),
  subscribe: () => Stream.fromIterable([{ index: 0, text: "Ready" }]),
  pressure: { strategy: "queue", limit: 32 },
  routes: {
    value: (token) => ({ type: "CHAT_TOKEN", token }),
  },
});
```

The chat lifecycle tests prove route unsubscribe, offscreen actor retention, stop interrupts, stale token protection through stream generation snapshots, and explicit disposal.

## Tests As Product Proof

Launch Workspace tests read like product transcripts:

```ts
const harness = flowTest
  .app(LaunchWorkspaceApp)
  .seedResources(launchWorkspaceSeed)
  .start(launchWorkspaceMachine)
  .provide(LaunchWorkspaceTestServices)
  .start();

harness.send({ type: "EDIT_PROJECT", draft: conflictDraft }).send({ type: "SAVE_PROJECT" });

await harness.flush();

expect(harness.transactions().rollbacks("launch.save-project")).toHaveLength(1);
expect(harness.state()).toBe("saveConflict");
```

Use Launch Workspace as the first place to look for real patterns. Use [Current Status](/reference/status) when deciding whether a surface is executable, compatibility-backed, descriptor-only, contract-only, or migration-only.
