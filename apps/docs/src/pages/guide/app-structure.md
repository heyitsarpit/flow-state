# App Structure

This is the recommended way to build a real Flow State app with the package as
it exists today.

## Recommended Layout

Flow State does not require one folder shape, but this layout works well with
the current package surface:

```txt
src/
  domain.ts
  services.ts
  project/
    resources.ts
    transactions.ts
    machine.ts
    views.ts
    module.ts
  app/
    assembly.ts
    runtime.ts
    shell.tsx
  test/
    project.test.ts
```

Use separate files for separate ownership concerns. Avoid giant "everything for
this screen" files once a feature has more than one resource, transaction, or
machine.

For a small app, it is also fine to keep one feature in a smaller shape:

```txt
src/
  project.ts
  app.ts
  app.test.ts
```

Split by concern when the feature earns it, not on day one.

## Module Pattern

Use `flow.module` as the domain manifest, not just a bag of exports.

```ts
export const Project = flow.module(
  "Project",
  () => ({
    resources: { byId: projectResource, comments: commentsResource },
    transactions: { save: saveProjectTransaction },
    machines: { editor: projectEditorMachine },
    views: { summary: projectSummaryView },
  }),
  {
    dependencies: ["Session"],
    screens: ["Editor"],
    tags: ["project"],
    fixtures: ["projectSeed"],
  },
);
```

Good module inventories help with docs, tests, app inventory, dependency
summaries, fixture seeding, and future tooling. They also make it obvious which
runtime facts belong to which product domain.

You can inspect them directly:

```ts
Project.inventory();
App.inventory();
```

## App Assembly

Use one app assembly file to compose modules and one layer file to describe how
the runtime is installed.

```ts
export const App = flow.app(Session, Project, Approval, Chat);

export const AppLayer = App.layer({
  store: flow.store.memory(),
  orchestrators: flow.orchestrators.live(),
  services: [ProjectLive, ApprovalLive, ChatLive],
});

export const AppTestLayer = App.layer({
  store: flow.store.test(),
  orchestrators: flow.orchestrators.test(),
  services: [ProjectTest, ApprovalTest, ChatTest],
});

export const runtime = flow.runtime(AppLayer);
```

Prefer the rest-arg `flow.app(moduleA, moduleB, ...)` form when it keeps app
assembly smaller and clearer.

The main payoff of `flow.app(...)` today is not abstract architecture purity. It
is concrete app-level behavior:

- `App.layer(...)`
- typed `moduleMap`
- app inventory
- fixture-backed app harness setup

For the receipt-backed version of that claim, including live actor ids and
inspection output, read
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
