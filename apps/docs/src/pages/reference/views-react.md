# React And Views

Most UI should read resources and actor snapshots directly. Use `flow.view` sparingly, when a screen needs a reusable projection that combines or significantly transforms multiple runtime sources.

## Direct Reads First

Use `flow.useResource` when UI only needs app data.

```tsx
function ProjectBreadcrumb() {
  const project = flow.useResource(Project.byId(fixtureProject.id));
  return <span>{project === null ? "Loading" : project.value.name}</span>;
}
```

Use `flow.use` for a workflow actor and `flow.can` for commands.

```tsx
function ProjectEditorCommands() {
  const editor = flow.use(Project.editor);
  const snapshot = editor.getSnapshot();

  return (
    <>
      <button disabled={!flow.can(snapshot, { type: "EDIT" })}>Edit</button>
      <button disabled={!flow.can(snapshot, { type: "SAVE" })}>Save</button>
      <span>{snapshot.value}</span>
    </>
  );
}
```

These components do not need a view.

## When To Add A View

Add `flow.view` when direct reads would duplicate meaningful projection logic across components or tests.

Good reasons:

| Use a view when                                           | Example                                                                    |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| Several resources need to be joined.                      | Readiness metrics plus project metadata plus assets.                       |
| Several runtime sources need one stable UI shape.         | Actor state, transaction status, receipts, child actor status, and issues. |
| The projection has domain meaning.                        | Readiness score, trace summary, assistant lifecycle summary.               |
| Multiple components or tests need the same derived model. | Overview header, command bar, and scenario assertion share one summary.    |

Avoid a view for a single label, a one-resource breadcrumb, a one-actor button bar, or data that is already shaped for rendering.

## Projection Example

```ts
export const launchWorkspaceView = flow.view({
  id: "launch.workspace.summary",
  sources: ["context", "resources", "transactions", "streams", "children", "receipts"],
  select: ({ context, value, resources, transactions, receipts }) => {
    const project = resourceValue(resources, "launch.project") ?? fixtureProject;
    const readiness = resourceValue(resources, "launch.readiness") ?? [];
    const assets = resourceValue(resources, "launch.assets") ?? [];

    return {
      title: project.name,
      activeTab: context.activeTab,
      readinessScore: Math.round(
        readiness.reduce((total, metric) => total + metric.score, 0) /
          Math.max(readiness.length, 1),
      ),
      assetCount: assets.length,
      saveStatus: transactions["launch.save-project"]?.status ?? "idle",
      hasSaveConflict: value === "saveConflict" || Option.isSome(context.saveError),
      receiptCount: receipts.length,
    };
  },
});
```

## View Rule

Views are pure. They can read context, value, resources, transactions, streams, children, receipts, and issues. They should not fetch, commit writes, invalidate data, start flows, or hide ownership of canonical data.

## Launch Overview Pattern

The Launch overview combines resources, flows, children, receipts, and issues. That shape is why `flow.view` exists. It is for composed screens, not for every component.

## React Status

`FlowProvider`, `flow.useResource`, and `flow.use` are the default React surface. `flow.useView` is for explicit projections. The current live React integration is contract-only; see [Current Status](/reference/status).
