# Resources

Resources model what the app knows.

Use `resource(...)` for canonical shared data that several components, flows, or
tests should agree on.

## Authoring Shape

```ts
import { createKey, createTag, ensure, invalidate, observe, refresh, resource } from "flow-state";

const projectTag = createTag("launch:project");

const projectResource = resource({
  id: "launch.project",
  key: (id: LaunchProjectId) => createKey("launch", "project", id),
  lookup: (id) => ProjectApi.getProject(id),
  tags: () => [projectTag],
  placeholder: () => Option.some(fixtureProject),
  freshness: { staleAfter: "30 seconds", onInvalidate: "active" },
});
```

Every resource definition gives you a typed `ref(...)` for concrete entries.

```ts
const ref = projectResource.ref(fixtureProjectId);
```

## What A Resource Owns

| Field         | Purpose                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| `id`          | Stable human-readable id for snapshots, receipts, inventory, and tools. |
| `key`         | Stable identity for one resource entry.                                 |
| `lookup`      | Effect-backed read for canonical data.                                  |
| `tags`        | Invalidation groups.                                                    |
| `placeholder` | Renderable fallback while canonical data is unavailable.                |
| `freshness`   | UI-facing stale and invalidate behavior.                                |
| `schema`      | Optional contract boundary for validation or tooling.                   |

## Use The Runtime Through Refs

Resources are accessed through refs:

- `runtime.resources.get(ref)`
- `runtime.resources.subscribe(ref, listener)`
- `runtime.resources.patch(ref, updater)`
- `ensure(ref)`
- `observe(ref)`
- `refresh(ref)`
- `invalidate(ref | tag | filter)`

That keeps resource identity consistent across runtime, React, and tests.

## Snapshot Mindset

Think of a resource snapshot as several axes, not just one string status:

- availability: empty, data, failure, optional previous data
- activity: idle, fetching, paused
- freshness: fresh, stale, invalidated, expired
- metadata: timestamps, placeholder state, request identity

The exact cache and freshness model is still evolving, so document the app's
meaning carefully instead of assuming every possible cache policy exists today.

## Current Executable Slice

The current proved surface includes:

- seed, get, patch, subscribe
- actor-owned `ensure`, `observe`, `refresh`, and `invalidate`
- public dehydrate and hydrate
- host-signal pause and resume in the proved slices

On the server, those four actor-owned operations are only preload behavior when
they run through a request-scoped runtime and an explicitly started actor:
`ensure` fills missing/stale refs, `observe` fills the ref and keeps a temporary
request-time subscription, `refresh` refetches even fresh seeded data, and
`invalidate` marks currently-known matching refs stale. Only the resulting
resource snapshots, actor snapshots, and receipts are serialized.

`freshness.onInvalidate` has three important behaviors today:

- `"active"`: auto-refresh only while an active subscription exists
- `"lazy"`: wait until the next `ensure(...)`
- `"never"`: stay invalidated until an explicit `refresh(...)`

Offline `ensure` and `refresh` pause and preserve placeholder or last-good data
until reconnect in the proved slices.

Current partial areas:

- cache capacity and TTL policy
- richer freshness semantics
- broader invalidation policy beyond the proved slices

## Good Fits

Use resources for:

- project records
- permissions
- readiness or dashboard payloads
- current user or session facts
- approval data
- asset lists

Do not use resources for transient UI choices such as the open tab or a local
draft selection.
