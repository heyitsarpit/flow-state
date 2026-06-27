# Migration

Use this page when updating older examples or docs to the current Flow State vocabulary.

## API Renames

| Older wording                               | Current docs wording                                         |
| ------------------------------------------- | ------------------------------------------------------------ |
| `flow.query`                                | `flow.resource`                                              |
| Query lifecycle copied into machine context | ResourceStore snapshot observed by flows or React components |
| `flow.mutation` for new write authoring     | `flow.transaction`                                           |
| `input` transaction variables               | `params`                                                     |
| `effect` transaction body                   | `commit`                                                     |
| `optimistic` pending data                   | `preview`                                                    |
| stream source field                         | `subscribe`                                                  |
| object-shaped durations                     | Effect `Duration.Input` strings                              |
| primary async iterable stream authoring     | Effect `Stream`                                              |
| Flow-owned assertion helpers                | Host test runner assertions over harness facts               |

`flow.mutation` remains a compatibility surface, and current internal receipts still use labels such as `mutation:start`, `mutation:rollback`, and `mutation:failure`. New docs and examples should define writes with `flow.transaction`.

## Before

```ts
const save = flow.mutation({
  id: "Project.save",
  input: ({ context }) => context.draft,
  effect: (input) => ProjectApi.save(input),
  optimistic: (input) => ({ name: input.name }),
});
```

## After

```ts
const save = flow.transaction({
  id: "Project.save",
  params: ({ context }) => context.draft,
  commit: (params) => ProjectApi.save(params),
  preview: {
    apply: ({ params }) => [{ ref: Project.byId.ref(params.id), replace: params }],
  },
});
```

## Context Cleanup

If older code stores API data in machine context, move shared data to resources and keep only process-owned values in context.

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

## Tests

Replace Flow-owned assertion helpers with normal test runner assertions.

```ts
expect(harness.state()).toBe("ready");
expect(harness.context().draft.name).toBe("Atlas v2 launch");
expect(harness.transactions().rollbacks("launch.save-project")).toHaveLength(1);
```

Use `flowTest.app(App).seedResources(...)` when resource ownership matters. Use focused `flowTest(machine)` when the behavior is only process state.
