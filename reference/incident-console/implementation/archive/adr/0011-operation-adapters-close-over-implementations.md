# Operation adapters close over Implementations

Status: archived accepted decision record; transferred into the active contracts.

## Decision

Resource, transaction, and stream descriptors retain authored adapter functions. Their `Effect<A, E, R>`
or `Stream<V, E, R>` requirements identify the services an Implementation must provide.

```ts
const todos = resource({
  id: "todos",
  key: ({ listId }) => [listId] as const,
  lookup: (input, { signal }) =>
    Effect.gen(function* () {
      const gateway = yield* TodoGateway;
      return yield* gateway.list(input.listId, { signal });
    }),
});
```

Operation input `P` contains domain/request data only. Service dependencies belong to `R`; they are not
embedded in every input value. Runtime-owned cancellation and options remain outside `P`.

There is no operation-to-mock registry. Provider closure is inferred from the authored Effect/Stream
requirements and resolved by RuntimeSetup.

## Seed use

`initialTodos` in a Story is an ordinary fixture-local constant. A seed writes it to the Runtime-owned
canonical store for the named resource and canonical key before actor activation:

```ts
const initialTodos = [
  { id: "todo-1", title: "Read the contract", completed: false },
];

const todoFixture = fixture({
  id: "todo.story",
  implementation: todoImplementation,
  seeds: [{ resource: todos, key: ["inbox"], value: initialTodos }],
});
```

The value can satisfy a usable cache read without invoking the external service function. An explicit
refetch or invalidation follows normal lookup policy and may invoke the Implementation. Seeds are not
service results, global mutable state, or arbitrary cache mutation.

Resource results enter canonical state through the resource kernel. Transaction and stream results require
explicit authored mappings before changing machine or resource state.
