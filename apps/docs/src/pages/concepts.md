# Concepts

Flow State works best when each runtime concern has one obvious owner.

## Ownership Model

| Owner              | Owns                                                                                                     | Does not own                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| ResourceStore      | Canonical shared data, snapshots, placeholder data, freshness, invalidation, hydration, subscriptions.   | Workflow states such as editing, saving, blocked, or awaiting approval. |
| OrchestratorSystem | Actors, process state, context, transitions, state-owned work, child actors, timer and stream lifetimes. | Shared canonical records that several screens should agree on.          |
| Views              | Optional projections that combine or reshape several runtime facts.                                      | Fetching, writes, workflow ownership, simple one-resource rendering.    |
| Effect runtime     | Services, Layers, fibers, clocks, schedules, streams, schemas, typed failures, scoping.                  | Flow-specific product semantics.                                        |

If you keep those boundaries clean, most design decisions get easier.

## Resource vs Context vs View

| Put it here     | When                                                | Example                                                            |
| --------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| Resource        | It is canonical shared data.                        | Project record, permissions, readiness metrics, approval status.   |
| Machine context | It is process-owned local state.                    | Current draft, active tab, pending selection, save conflict.       |
| View            | Several runtime sources need one reusable UI shape. | Overview summary, trace panel, readiness rollup, assistant status. |

Avoid copying resource data into machine context just because a component wants
to render it.

## Modules

`flow.module` is a domain manifest with stable names and optional metadata.

```ts
export const Project = flow.module(
  "Project",
  {
    resources: { byId: projectResource, comments: commentsResource },
    transactions: { save: saveProjectTransaction },
    machines: { editor: projectEditorMachine },
    views: { summary: projectSummaryView },
  },
  {
    dependencies: ["Session"],
    screens: ["Editor"],
    tags: ["project"],
  },
);
```

Modules make app inventory, docs, tests, and dependency validation possible
without guessing from loose exports.

If a module feels like extra ceremony, the real question is whether you want a
stable domain boundary yet. For the receipt-backed payoff and the current
limits, read [Ownership And Runtime Facts](/guide/ownership-and-runtime-facts).

## Apps And Layers

`flow.app(...)` composes modules. `App.layer(...)` installs the runtime around
ResourceStore, OrchestratorSystem, and your Effect services.

```ts
export const App = flow.app({ modules: [Session, Project, Approval] });

export const AppLayer = App.layer({
  store: flow.store.memory(),
  orchestrators: flow.orchestrators.live(),
  services: [SessionLive, ProjectLive, ApprovalLive],
});
```

Flow State should not replace Effect's dependency model. It should sit on top of
it.

For the receipt-backed payoff of `flow.app(...)` and `App.layer(...)`, read
[Ownership And Runtime Facts](/guide/ownership-and-runtime-facts).

## Runtime Facts

The runtime exposes facts you can inspect directly:

- resource snapshots
- transaction snapshots
- stream snapshots
- timer snapshots
- child actor snapshots
- receipts
- issues
- inspection log entries
- actor snapshot trees

This is why Flow State pairs well with scenario tests and debugging surfaces.

## Important Limits

The runtime is real, but not unbounded:

- The machine subset is intentionally narrower than broad statechart libraries.
- Request-scoped boot and actor restore are supported, but generic RSC runtime
  ownership is not.
- Resource cache capacity, TTL policy, and richer freshness semantics are still
  partial.
- Offline transaction queue, replay, and undo are future work.
- Stream and trace diagnostics are useful today, but broader correlation is
  still evolving.

Use [Current Status](/reference/status) when you need the exact proof boundary.

## When Not To Use Flow State

Prefer simpler local state when:

- the data is not shared
- the workflow is not long-lived
- you do not need runtime facts such as receipts, issues, streams, or timers
- ordinary component state plus direct Effect usage is already enough
