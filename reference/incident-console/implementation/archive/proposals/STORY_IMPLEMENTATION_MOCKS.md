# Story Implementations and whole-function mocks

Status: archived historical proposal. Its accepted direction was transferred into the contract pack;
this file is provenance only and must not be used as an active API source.

## Smallest useful API

```ts
const todoImplementation = Layer.succeed(
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

`Implementation` is the public concept. `Layer.succeed` and `Layer.mergeAll` are construction details of
the provider graph, not a second mock system. A future ergonomic constructor may wrap them, but it must not
change the provider semantics.

## Provider and fixture rules

An Implementation provider supplies the complete service interface for its service identity. Partial method
patching is not supported. A Fixture Implementation overrides the App Implementation for the same identity;
duplicate providers within one Fixture set fail rather than depend on ordering.

Every App or machine service requirement must be closed by an Implementation. Resource seeds do not satisfy
or remove a service requirement, even when a seed causes a particular lookup to be skipped.

Each provider is constructed once per Runtime. Story runs receive fresh Runtime-scoped provider state;
cross-Story state requires explicit application-level ownership.

Mock functions return ordinary typed Effects or Streams. Typed failure, defects, interruption, cancellation,
and cleanup remain classified and owned by the production Runtime. No mock-specific outcome helper is added.

Fixtures are inert run-local descriptors with this shape:

```ts
fixture({
  id,
  implementation,
  seeds,
});
```

`seeds` remain limited to resource seeding. Fixtures do not declare controls, install a control registry,
or create a second testing runtime. Seeds are optional preloaded Runtime-owned resource state; they are not
service-function mocks, global mutable state, or arbitrary cache mutation. The first Todo slice omits them
and uses only whole-function Implementations.

## Operation-to-Implementation binding

Operation descriptors retain their authored adapter functions. Those functions resolve the service
requirements supplied by an Implementation:

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

Operation input `P` contains domain/request data only. Service dependencies belong to the inferred
requirement `R`, not inside every operation input. Runtime-owned options such as `AbortSignal` remain
separate from `P`.

A resource seed such as `initialTodos` is a fixture-local value written to the Runtime-owned canonical
resource store for one resource/key pair before actor activation. It is not a service result and does not
replace the authored lookup adapter. A fresh lookup may settle from that usable canonical value without
calling the Implementation; explicit refetch or invalidation follows ordinary lookup policy.

Resource results enter canonical state through the resource kernel. Transaction and stream results change
machine or resource state only through their explicit authored mappings. No operation-to-mock registry is
introduced; Effect/Stream requirements remain the provider-closure source.

## Complete inventory

| Operation family | Replace | Preserve |
| --- | --- | --- |
| Resource lookup | Complete service function returning `Effect<A, E>` | Keying, cache, freshness, seeding, invalidation, lookup, refetch, subscription |
| Transaction commit | Complete service function returning `Effect<A, E>` | Admission, concurrency, cancellation, completion, writes, evidence |
| Stream subscription | Complete stream-valued member or factory returning `Stream<V, E>` | Subscription, interruption, completion, cleanup, evidence |

For the Everclear consumer, this covers ten resource functions, four transaction functions, and two stream
functions across `ExplorerApi`, `BrowserBridge`, and `IntentSubmitter`. The concrete inventory is recorded in
the source evidence at `test/everclear-new-intent/flow-state/services.ts`.

## Explicit exclusions

The following are not Implementation mock points:

- `resource.lookup`, `resource.refetch`, `resource.subscribe`, `transaction.commit`, or `stream.subscribe`;
- operation keys and passive reads;
- machine actions, transitions, state, memory, and event mapping;
- Runtime ownership, cancellation, concurrency, cleanup, and evidence;
- argument/output matchers, call counters, ordinal scripts, or a control registry.

The operation kernels remain live so a Story proves the semantics of the library rather than merely replaying
preselected operation results.

## Pending external work

There is no separate Story-facing pending-work or result-injection command. A whole-function Implementation
may return an ordinary typed pending `Effect` or `Stream` when a Story needs deferred behavior; the builder
records commands and `.run()` executes them through the production kernels.
