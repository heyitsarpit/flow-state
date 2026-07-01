# Migration

Use this page when translating older Flow State notes, example code, or docs to
the current package surface.

## Vocabulary Changes

| Older wording                  | Current wording                 |
| ------------------------------ | ------------------------------- |
| `flow.query`                   | `flow.resource`                 |
| `flow.mutation`                | `flow.transaction`              |
| transaction `input`            | transaction `params`            |
| transaction `effect`           | transaction `commit`            |
| `optimistic` patch             | `preview` patch                 |
| async iterable stream field    | `subscribe`                     |
| object-shaped duration helpers | Effect `Duration.Input` strings |
| Flow-owned assertion helpers   | host test runner assertions     |

Use the current authoring vocabulary in new docs and new examples.

## Import Paths

Current public imports are split by concern:

```ts
@flow-state/core
@flow-state/react
@flow-state/testing
@flow-state/server
@flow-state/inspect
```

Do not write new docs that imply React, testing, server, or inspection helpers
come from the root package.

## Ownership Cleanup

If older code keeps API data in machine context, move shared data into resources
and keep only process-owned state in the machine.

```ts
// Keep in context.
{
  draft,
  selectedTab,
  saveError,
  connection,
}

// Move to resources.
{
  project,
  comments,
  permissions,
  readiness,
}
```

## Testing Cleanup

Prefer normal test runner assertions over Flow-owned matcher helpers.

```ts
expect(harness.state()).toBe("ready");
expect(harness.context().draft.name).toBe("Atlas v2 launch");
expect(harness.transactions().rollbacks("launch.save-project")).toHaveLength(1);
```

Use `test.app(App).scenario(machine).with({ resources: ... })` when canonical
resource ownership is part of the scenario.

## Server Boundary Cleanup

If older notes imply a broad SSR runtime or automatic full restore, narrow them
to the current supported path:

- request-scoped runtime
- public resource hydration
- explicit actor snapshot restore
- fail-closed boot payload versioning

That is the current source of truth.
