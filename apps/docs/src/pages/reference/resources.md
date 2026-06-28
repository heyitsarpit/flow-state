# Resources

Resources model what the app knows. Use `flow.resource` for canonical shared data that multiple components, flows, tests, or devtools may need.

## Quick Example

```ts
export const projectResource = flow.resource({
  id: "launch.project",
  key: (id: LaunchProjectId) => createKey("launch", "project", id),
  lookup: (id) => Effect.succeed({ ...fixtureProject, id }),
  tags: () => [projectTag],
  placeholder: () => Option.some(fixtureProject),
  freshness: { staleAfter: "30 seconds", onInvalidate: "active" },
});

const ref = projectResource.ref(fixtureProjectId);
```

## Resource Identity

Resource refs combine a resource definition with key arguments. The key must be stable and domain-shaped.

| Field         | Meaning                                                                          |
| ------------- | -------------------------------------------------------------------------------- |
| `id`          | Human-readable resource id used in snapshots, receipts, inventory, and devtools. |
| `key`         | Stable identity for one resource entry.                                          |
| `lookup`      | Effect program that loads the value or typed failure.                            |
| `tags`        | Group labels for invalidation.                                                   |
| `cache`       | Capacity and time-to-live policy where cache semantics apply.                    |
| `freshness`   | UI-facing staleness and invalidation behavior.                                   |
| `placeholder` | Renderable non-canonical value while data is unavailable.                        |
| `schema`      | Optional decode/docs/persistence boundary.                                       |

## Snapshots

Resource snapshots should be read as multiple axes, not one status string.

| Axis         | Examples                                                                        |
| ------------ | ------------------------------------------------------------------------------- |
| Availability | Empty, data, failure with optional previous data.                               |
| Activity     | Idle, fetching, paused.                                                         |
| Freshness    | Fresh, stale, invalidated, expired.                                             |
| Metadata     | Updated time, expiration time, invalidation time, request id, placeholder flag. |

Launch Workspace tests currently inspect seeded ResourceStore snapshots through `harness.cache().query("launch.project")`. Components can read resources directly; view projections should only read seeded resources when they are joining multiple runtime sources.

## ResourceStore

The runtime ResourceStore is the app's shared memory.

| Operation    | Use for                                                                |
| ------------ | ---------------------------------------------------------------------- |
| `get`        | Read the current snapshot for a resource ref.                          |
| `seed`       | Load known snapshots for tests and fixtures.                           |
| `patch`      | Apply a local update to available data.                                |
| `subscribe`  | Notify components, actors, tests, or devtools when a snapshot changes. |
| `invalidate` | Mark refs, tags, or filters stale.                                     |
| `ensure`     | Join or run lookup until data or typed failure is available.           |
| `refresh`    | Start a new lookup without implying a product state transition.        |

## Use This When

Use a resource for project records, comments, permissions, readiness metrics, assets, approval requests, current users, dashboard payloads, and any canonical app data shared across screens.

Prefer `flow.observe(resource.ref(...))` when a flow needs latest data while active. Prefer `flow.ensure(resource.ref(...))` when a process cannot continue without the data.

## Current Status

Seed/get/patch/subscribe are executable through the app runtime and test harness. The proved runtime slice now includes paused offline `ensure` / `refresh` plus reconnect resume through host signals. Cache capacity/TTL policy and broader invalidation semantics remain partial; see [Current Status](/reference/status).
