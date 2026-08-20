# Runtime-scoped Fixture Implementations

Status: archived accepted decision record; transferred into the active contracts.

## Decision

Fixtures provide complete service Implementations for one Story run:

```ts
fixture({
  id: "todo.story.gateway",
  implementation: Implementation.succeed(
    TodoGateway,
    TodoGateway.of({
      list: (_listId) => Effect.succeed(initialTodos),
      add: (_listId, title) =>
        Effect.succeed({ id: "todo-1", title, completed: false }),
    }),
  ),
  seeds: [],
});
```

A Fixture Implementation overrides the App Implementation for the same service identity. Duplicate
providers within one Fixture set are rejected rather than resolved by declaration order. Every App or
machine service requirement must still be closed by an Implementation; resource seeds do not satisfy or
remove a requirement.

Each provider is constructed once per Runtime. Story runs receive fresh Runtime-scoped provider state.
Sharing state across Stories requires explicit application-level ownership.

Implementation functions return ordinary typed Effects or Streams. The production Runtime remains responsible
for typed failures, defects, interruption, cancellation, completion, and cleanup. Mock-specific outcome
helpers are not part of the API.

The public Fixture surface is `fixture({ id, implementation, seeds? })`. No separate `mock`, `stub`,
`Implementation.of`, or control registry is introduced.
