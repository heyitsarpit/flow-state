# App Structure

This is the recommended way to build a real Flow State app with the package as
it exists today.

## Recommended Layout

Flow State does not require one folder shape, but this layout works well with
the current package surface:

```txt
src/app/
  assembly.ts
  runtime.ts
  behavior.ts
  modules.ts
  resources.ts
  transactions.ts
  machines.ts
  streams.ts
  views.ts
  stories.ts
  screens/
    ProjectScreen.tsx
    SessionScreen.tsx
```

The identity is the app, not a pile of feature folders. Start with one file per
concern at the app level, then keep module boundaries explicit in
`modules.ts`.

This keeps imports, docs, and examples simple:

```txt
src/app/resources.ts
src/app/transactions.ts
src/app/machines.ts
src/app/views.ts
```

Split a concern only when it earns it, not on day one. When a concern grows too
large, keep the stable app-level file and make it forward to a folder index:

```txt
src/app/
  resources.ts
  resources/
    index.ts
    session.ts
    project.ts
```

```ts
// src/app/resources.ts
export * from "./resources/index.js";
```

This forwarding file is a recommendation, not a hard rule, but it is the shape
the docs and examples should prefer because it keeps import sites and generator
entrypoints stable while letting the implementation grow.

## Module Pattern

Use `flow.module` as the semantic manifest, not as the thing that dictates your
filesystem shape.

```ts
export const SessionModule = flow.module("Session", {
  resources: { current: sessionResource },
  transactions: { signIn: signInTransaction },
});

export const ProjectModule = flow.module(
  "Project",
  {
    resources: { byId: projectResource, comments: commentsResource },
    transactions: { save: saveProjectTransaction },
    machines: { editor: projectEditorMachine },
    views: { summary: projectSummaryView },
  },
  {
    dependencies: ["Session"],
    screens: ["ProjectScreen"],
    tags: ["project"],
    fixtures: ["projectSeed"],
  },
);
```

Good module inventories help with docs, tests, app inventory, dependency
summaries, fixture seeding, and future tooling. They also make it obvious which
runtime facts belong to which product domain.
When app code really needs direct module lookup, `App.moduleMap.<id>` stays
typed, but inventory and fixture paths are the more concrete payoff.

You can inspect them directly:

```ts
Project.inventory();
App.inventory();
```

## App Assembly

Use one app assembly file to compose modules and one layer file to describe how
the runtime is installed.

```ts
export const App = flow.app({ modules: [SessionModule, ProjectModule] });

export const AppLayer = App.layer({
  store: flow.store.memory(),
  orchestrators: flow.orchestrators.live(),
  services: [SessionLive, ProjectLive],
});

export const AppTestLayer = App.layer({
  store: flow.store.test(),
  orchestrators: flow.orchestrators.test(),
  services: [SessionTest, ProjectTest],
});

export const runtime = flow.runtime(AppLayer);
```

Keep app assembly explicit with `flow.app({ modules: [...] })`; the module list
is the durable app boundary.

If you add a behavior-generation gateway, keep that explicit too:

```ts
export const BehaviorGateway = {
  app: App,
  stories: [projectStories],
};
```

Do not restate `modules` in that gateway. `app.modules` is already the compiled
app boundary.

For the receipt-backed rationale behind `flow.app(...)` and `App.layer(...)`,
read
[Ownership And Runtime Facts](/guide/ownership-and-runtime-facts).

## What To Avoid

- Do not copy canonical resource data into machine context just to render it.
- Do not hide network or storage calls inside React components or view
  projections.
- Do not use receipts as product state. They are diagnostics.
- Do not reach for `flow.view` as the default way to render a screen.
- Do not model repeated time work with `flow.after`; use Effect `Schedule`.
- Do not assume broad XState semantics. The supported machine subset is still
  intentionally narrower.

## Read This Next

- [Concepts](/concepts) for the ownership model behind this file layout.
- [Ownership And Runtime Facts](/guide/ownership-and-runtime-facts) for the
  justification and receipts behind module/app/layer assembly.
- [Runtime](/reference/runtime) for the handles and request-boot boundary that
  this assembly feeds.
