# Whole service functions are the Story mock boundary

Status: archived accepted decision record; transferred into the active contracts.

## Decision

Stories replace complete functions on typed service Implementations. They do not register individual
operation occurrences, argument/output pairs, or operation-family-specific control objects.

```ts
const todoImplementation = Implementation.succeed(
  TodoGateway,
  TodoGateway.of({
    list: (_listId) => Effect.succeed(initialTodos),
    add: (_listId, title) =>
      Effect.succeed({ id: "todo-1", title, completed: false }),
  }),
);

const todoFixture = fixture({
  id: "todo.story.gateway",
  implementation: todoImplementation,
});

const todoStory = story.machine(todoMachine, {
  input: { listId: "inbox" },
  fixtures: [todoFixture],
});
```

The service function may use its typed input to choose a result, but that branching is ordinary
Implementation code. The Flow State testing surface does not expose call matchers, occurrence counters,
or output scripts.

## Operation-family boundary

- Resource operations replace the adapter function returning `Effect<A, E>`; resource keying, cache,
  freshness, seeding, invalidation, lookup, refetch, and subscription remain Runtime-owned.
- Transaction operations replace the adapter function returning `Effect<A, E>`; admission, concurrency,
  cancellation, completion, writes, and evidence remain Runtime-owned.
- Stream operations replace the complete stream-valued service member or factory returning `Stream<V, E>`;
  subscription, interruption, completion, cleanup, and evidence remain Runtime-owned.

Public `resource.lookup`, `resource.refetch`, `resource.subscribe`, `transaction.commit`, and
`stream.subscribe` are therefore not mock providers. Replacing them would bypass the semantics the Story
is intended to prove.

## Provider and fixture rules

An Implementation provider supplies the complete service interface for its service identity. Partial method
patching is not supported. Runtime composition resolves one final provider per service identity.

Fixtures are inert run-local descriptors with this shape:

```ts
fixture({
  id,
  implementation,
  seeds,
});
```

`seeds` remain limited to resource seeding. Fixtures do not declare controls, install a control registry,
or create a second testing runtime.

## Consequences

- `Implementation` remains the only provider boundary and no `Mock`, `Stub`, or `Control` namespace is
  added.
- Existing control-based proposal text is historical migration evidence and must not be copied into the
  implementation contract.
- No `simulate(operationPlan, observation)` command is part of the target surface. Deferred external work
  must be represented by a typed Effect or Stream returned by a whole-function Implementation, or remain
  an explicit future contract decision outside this implementation pass.
- Proofs must cover the real resource, transaction, and stream kernels while replacing only their external
  service functions.
