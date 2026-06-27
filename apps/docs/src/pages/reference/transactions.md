# Transactions

Transactions model writes. Use `flow.transaction` when a write needs typed Effect execution, preview patches, rollback, invalidation, concurrency, routes, receipts, or tests.

## Quick Example

```ts
export const saveLaunchProjectTransaction = flow.transaction({
  id: "launch.save-project",
  params: ({ context }) => ({
    id: context.activeProjectId,
    draft: context.draft,
    baseVersion: fixtureProject.version,
  }),
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
  routes: flow.outcomes({
    success: ({ value }) => ({ type: "PROJECT_SAVED", project: value }),
    failure: ["PROJECT_SAVE_FAILED", "error"],
  }),
  concurrency: "reject-while-running",
});
```

## Fields

| Field         | Meaning                                                                      |
| ------------- | ---------------------------------------------------------------------------- |
| `params`      | Derives transaction variables from flow context, event, or input.            |
| `commit`      | Effect program that performs the write.                                      |
| `preview`     | Rollbackable ResourceStore patch while the write is pending.                 |
| `invalidates` | Resource refs, tags, or filters to mark stale after success.                 |
| `routes`      | Success, typed failure, defect, or interrupt outcomes mapped back to events. |
| `concurrency` | Local overlap policy such as reject, serialize, cancel previous, or allow.   |

## Preview And Rollback

Flow State can roll back the ResourceStore patches it owns. It cannot reverse a remote write that already committed, and it cannot make HTTP, SQL, or server state atomic with browser memory unless the app service provides that guarantee.

Launch Workspace proves rollback on typed conflict:

```ts
harness.send({ type: "SAVE_PROJECT" });
expect(harness.transactions().previewPatches("launch.save-project")).toHaveLength(1);

await harness.flush();

expect(harness.transactions().rollbacks("launch.save-project")).toHaveLength(1);
expect(harness.state()).toBe("saveConflict");
```

## Compatibility

`flow.transaction` is the final write authoring API. `flow.mutation` remains a compatibility surface for older examples and current internal snapshots. Current runtime receipts still use labels such as `mutation:start`, `mutation:rollback`, and `mutation:failure` while the user-facing vocabulary catches up.

See [Migration](/migration) and [Current Status](/reference/status).
