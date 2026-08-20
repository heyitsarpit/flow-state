# Fixture seeds are preloaded resource state

Status: archived accepted decision record; transferred into the active contracts.

## Decision

Seeds are optional Fixture data used to preload Runtime-owned resource state before a Story actor becomes
active. They are useful for hydration, SSR, cache-hit, stale-data, refetch, and invalidation proofs.

```ts
const todoFixture = fixture({
  id: "todo.story",
  implementation: todoImplementation,
  seeds: [
    {
      resource: todos,
      key: { listId: "inbox" },
      value: initialTodos,
    },
  ],
});
```

Seeds do not mock service functions. They do not provide service requirements, become global mutable state,
or authorize arbitrary cache mutation. The selected Implementation remains responsible for external lookup,
transaction, and stream functions.

The first Todo slice does not require seeds and uses only whole-function Implementations. Seeds remain
Fixture-level data adjacent to the selected Implementation rather than members of Implementation itself.
