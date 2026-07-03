# Transactions

Transactions model writes.

Use `transaction(...)` when a write needs typed Effect execution, preview
patches, rollback, invalidation, concurrency policy, routed outcomes, or
inspection in tests.

## Authoring Shape

```ts
import { outcomes, run, transaction } from "flow-state";

const saveProject = transaction({
  id: "launch.save-project",
  params: ({ context }) => ({
    id: context.activeProjectId,
    draft: context.draft,
    baseVersion: fixtureProject.version,
  }),
  commit: ProjectApi.saveProject,
  preview: {
    apply: ({ params }) => [
      {
        ref: projectResource.ref(params.id),
        replace: { ...fixtureProject, ...params.draft, id: params.id },
      },
    ],
  },
  invalidates: [projectTag],
  routes: outcomes({
    success: ({ value }) => ({ type: "PROJECT_SAVED", project: value }),
    failure: ["PROJECT_SAVE_FAILED", "error"],
  }),
  concurrency: "serialize",
});
```

Run a transaction from a machine state with `run(transaction)`.

## `submit` vs `run(...)`

There are two honest ways to start a transaction from machine logic:

- `submit: transaction` on a transition when the write belongs to the event
- `invoke: run(transaction)` when the write belongs to the entered state

```ts
editing: {
  on: {
    SAVE_PROJECT: {
      target: "saving",
      submit: saveProject,
    },
  },
},
saving: {
  invoke: run(saveProject),
}
```

Both are real. Pick the one that matches ownership.

## Fields

| Field         | Meaning                                                        |
| ------------- | -------------------------------------------------------------- |
| `params`      | Derive write variables from context, event, or input.          |
| `commit`      | Effect that performs the write.                                |
| `preview`     | Rollbackable local resource patch while the write is pending.  |
| `invalidates` | Refs, tags, or filters to mark stale after success.            |
| `routes`      | Success, failure, defect, or interrupt mapping back to events. |
| `scope`       | Shared serialization scope across transactions.                |
| `concurrency` | Overlap policy: reject, serialize, cancel previous, or allow.  |

## Concurrency

The current runtime proves these policies:

- `reject-while-running`
- `serialize`
- `cancel-previous`
- `allow`

Use `scope: { id }` when separate transaction definitions should share one
serialized queue.

The current semantics are stronger than "writes do not overlap":

- `reject-while-running` emits `FLOW-TXN-001`
- `serialize` queues
- `cancel-previous` interrupts the previous run and rolls back its preview
- `allow` permits overlap, and stale late completions may be ignored

## Preview And Rollback

Preview patches are Flow-owned local patches. They can be rolled back if the
transaction fails or is interrupted.

They cannot undo a server write that already committed.

## Retry And Reset

Actors and harnesses expose transaction recovery helpers:

```ts
actor.retryTransaction("launch.save-project");
actor.resetTransaction("launch.save-project");
```

Retry reuses the last resolved params. Reset clears the visible transaction
snapshot without rerunning it.

## What You Can Inspect

Transactions show up in:

- `snapshot.transactions`
- `actor.receipts()`
- `actor.issues()`
- `harness.transactions()`

This is the right place to debug preview patches, rollbacks, outcome routing, or
concurrency behavior.

## Current Limits

The current runtime does not claim broad support for:

- offline queue
- undo rollback of remote side effects
- replay semantics as a finished product surface

Keep those as future work unless your codebase adds a narrower app-specific
layer on top.
