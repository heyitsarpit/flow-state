# Operations API working spec

Status: evolved working proposal, not a normative contract.

This document records the current operations API reached during design review. It replaces earlier
working syntax in this file, but it does not replace any rule in `contracts/` until the accepted
decisions are promoted through `DESIGN_REVISIONS.md` and the affected contracts are revised.

The sections describe the coherent current proposal. The final section distinguishes decisions
already accepted during review from details that remain open.

## Common operation model

The machine receives one closed, flat `O` catalogue containing the resource, transaction, and
stream families admitted by its definition. Merely referring to `O.name`, calculating a key, or
constructing an activity plan is inert. External work starts only after the owning actor publishes
the activity as part of an admitted turn.

The common type names are:

- `P` is the complete executable input retained by a lookup, transaction attempt, or stream
  subscription.
- `K` is the canonical identity projected from `P`.
- `A` is a successful resource or transaction value.
- `E` is the operation's typed failure.

Every key projector returns an ordered readonly tuple:

```ts
key: ({ orderId }: OrderInput) => [orderId] as const;
```

Keys use exact canonical equality. Descriptor identity supplies the namespace, so the internal
resource address is:

```ts
type ResourceAddress<K extends readonly unknown[]> = readonly [descriptorId: string, ...key: K];
```

Two `P` values producing the same `K` assert that they produce equivalent canonical results.
Flow cannot detect a result-changing value omitted from `K`; that is a descriptor-author error.

There is no public `ref` object, `byKey` wrapper, bound entry object, or generic
`snapshot.resources.get(...)` registry in the evolved API. A family method accepts `K` when the
family already supplies the descriptor namespace. Cross-family cache actions use an explicit,
transparent target pair:

```ts
type ResourceTarget<K extends readonly unknown[]> = readonly [resource: ResourceFamily, key: K];
```

## Cache hierarchy and actor ownership

Resource data is shared within one Flow application runtime:

```text
Flow application runtime
└── Resource store
    ├── descriptor ID
    │   └── canonical K
    │       └── base, freshness, failure, generation, overlays
    └── descriptor ID
        └── canonical K
            └── another entry

Machine actors
└── activity ownership and immutable projections into store entries
```

Two actors in the same runtime using the same descriptor and `K` share one canonical entry and
one admitted lookup generation. Machine definitions and actors do not own duplicate resource
caches. Separate application runtimes, SSR requests, tests, and browser roots have separate stores.

An actor owns its activity declarations and projections, not the canonical resource value. Leaving
a state releases only that actor's ownership. Another actor may keep the entry active, and the base
may remain cached until `gcTime` after the final owner releases it. Invalidation and authoritative
writes affect the shared runtime entry and publish new projections to every affected actor.

Account, network, tenant, permission, or session facts that can change a result must be represented
in `K` or separated by runtime. Flow never creates an implicit actor-local version of a shared
resource entry.

## Machine composition and selectors

The current callback shape removes the general resource/transaction/stream `activity` kit because
those operations are expressed on `O`. Memory reconciliation and cross-resource cache actions are
passed beside `S`, `E`, and `O`:

```ts
flow.machine(NewIntent, ({ S, E, O, onMemory, invalidate, clear }) => ({
  // machine configuration
}));
```

`onMemory` is a current-value memory subscription. It emits the actor's current immutable memory
once when the owning state activates or re-enters, then emits after each committed memory change.
It may appear any number of times in one `activities` array, and each declaration independently
owns and reconciles its returned activities:

```ts
activities: [
  onMemory.select(
    ({ memory }) => ({
      orderId: memory.orderId,
      client: memory.client,
    }),
    ({ orderId, client }) => (orderId === null ? null : O.orderById.subscribe({ orderId, client })),
  ),

  onMemory.select(
    ({ memory }) => ({
      account: memory.account,
      assetId: memory.assetId,
    }),
    ({ account, assetId }) =>
      account === null ? null : O.assetBalance.subscribe({ account, assetId }),
  ),
];
```

The direct form provides the current memory without requiring a separate getter:

```ts
onMemory(({ memory }) =>
  memory.orderId === null
    ? null
    : O.orderById.subscribe({
        orderId: memory.orderId,
        client: memory.client,
      }),
);
```

The `.select` form evaluates its selector on the same revisions but only rebuilds its returned
activities when the selected value changes. The current proposal shallowly compares selected
records and tuples with `Object.is` per member. Returning `null` releases only the activities
owned by that declaration.

Resource dependencies do not create a second implicit snapshot subscription graph. A resource
whose revisions matter to machine behavior maps those revisions to outcomes; the resulting event
updates memory or changes state. The memory revision then reconciles dependent `onMemory`
declarations against the latest actor-projected resource values:

```ts
states: {
  ACTIVE: {
    activities: [
      O.routeConfig.subscribe({
        outcomes: {
          value: () => E.RoutesChanged(),
        },
      }),

      onMemory(({ memory }) => {
        const routes = O.routeConfig.getData([]);
        if (routes === undefined) return null;

        return O.routeQuote.subscribe(
          buildQuoteInput(memory.quoteInput, routes),
          {
            outcomes: {
              value: quote => E.QuoteChanged(quote),
            },
          },
        );
      }),
    ],

    on: {
      RoutesChanged: {
        updateMemory: ({ memory }) => ({
          routeRevision: memory.routeRevision + 1,
        }),
      },
    },
  },
}
```

The state machine already owns event admission, so there is no separate `onEvent` combinator.
Accepted event handlers admit finite operation plans through transition `actions`:

```ts
on: {
  SubmitRequested: {
    target: S.SUBMITTING,
    actions: ({ event, memory }) => [
      O.submitIntent.commit(
        buildSubmissionInput(event, memory),
        { outcomes },
      ),
    ],
  },
}
```

`actions` is optional. It is evaluated once only for the winning transition and returns one inert
operation plan, a readonly list of plans, `null`, or an empty list. Omitting `actions`, returning
`null`, or returning `[]` means that the transition performs no finite operation. Calling a plan
builder without returning its plan does nothing, and direct side effects inside the callback are
outside the contract.

The current ordering proposal evaluates `actions` after `updateMemory` has produced candidate
memory, then admits the returned plans under the resulting state activation. A rejected event
evaluates no `actions` callback, and later memory or resource revisions never readmit its plans.
The exact ordering relative to redirects and ownership release remains an open contract detail.

Transition `actions` may return finite resource lookup or refetch plans, transaction commit or
cancel plans, cache-write, invalidation, and clearing plans. Continuing resource and stream
subscriptions remain state `activities`. The two names describe different lifetimes: an action is
finite work admitted by one accepted transition, while an activity is continuing work owned by a
state activation.

This deliberately revises the current API-004 transition grammar, which rejects transition
`actions`; the normative contracts must move with this proposal when it is promoted.

There is no `onSnapshot` dependency mechanism, `onEvent` combinator, or `onEnter` callback in the
current API. `onMemory.once` also remains excluded until an activation-time finite operation that
cannot be expressed by an accepted event or static state activity proves the need.

`onMemory` callbacks return one continuing resource or stream declaration, a readonly list of
continuing declarations, or `null`. They do not execute arbitrary side effects or admit transaction
commits and store commands. Reconciliation and hydration may evaluate selectors again, while exact
declaration identity prevents unnecessary subscription replacement.

No machine activity calls `unsubscribe()` manually. Flow releases a continuing declaration when
its state exits, its selected identity changes, its selector returns `null`, or its actor stops.
Equal identity retains the existing generation and materialized `P`.

## Resources

### Descriptor

```ts
const orderById = flow.resource({
  id: "everclear.order-by-id",

  key: ({ orderId }: OrderInput) => [orderId] as const,

  lookup: ({ orderId, client }: OrderInput, { signal }) => client.getOrder(orderId, { signal }),

  staleTime: "30 seconds",
  gcTime: "5 minutes",
});
```

The descriptor owns lookup policy, key projection, tags, placeholder policy, freshness, and
collection policy. The descriptor is reusable and inert; it owns no runtime cache itself.

### Family API

```ts
interface ResourceFamily<P, K extends readonly unknown[], A, E> {
  key(params: P): K;

  getData(key: K): A | undefined;
  getState(key: K): ResourceState<A, E>;

  lookup(params: P, options?: FiniteResourceOptions<A, E>): FiniteActivity;

  subscribe(params: P, options?: ResourceSubscriptionOptions<A, E>): ContinuingActivity;

  refetch(params: P, options?: FiniteResourceOptions<A, E>): FiniteActivity;

  setData(key: K, value: A | ((current: A | undefined) => A | undefined)): CacheWriteActivity;

  cancel(key: K): CancellationActivity;
}
```

The current name for finite acquisition is `lookup(P)`. It matches the resource descriptor and
distinguishes resource work from transaction `commit(P)` and stream `subscribe(P)`. The exact
name remains open because a fresh hit may settle without executing the descriptor's lookup
function.

### Passive cache access

`getData(K)` returns the current effective canonical value or `undefined`. It never starts work,
acquires ownership, changes freshness, or prevents collection. Stale and retained values remain
readable, and optimistic overlays are applied to the returned effective value. A placeholder by
itself is projection data rather than canonical cache data and is exposed through `getState`.

```ts
const order = O.orderById.getData([orderId]);
```

`getState(K)` returns the complete actor projection for the exact resource identity. It returns an
idle state rather than `undefined`, allowing guards and views to discriminate missing, loading,
placeholder, value, stale, invalidated, retained-value failure, defect, interruption, and active
replacement states without copying resource lifecycle into machine memory.

```ts
const order = O.orderById.getState([orderId]);

if (order.availability !== "value" || order.freshness !== "fresh") {
  return false;
}
```

Actor-bound `O` reads the immutable projection admitted to that actor snapshot. Runtime-global
inspection uses `runtime.operations` or `runtime.cache` explicitly; a machine read never reaches
through mutable process-global state.

### Finite lookup

`lookup(P)` is a finite activity:

- A fresh canonical value settles without starting external work.
- A missing, stale, or invalidated entry starts or joins the exact lookup generation.
- Success writes one canonical base into the runtime resource store.
- Typed failure, defect, and interruption remain distinct outcome lanes.
- The activity releases its ownership after one terminal result.

```ts
activities: [
  O.orderById.lookup(
    { orderId, client },
    {
      outcomes: {
        success: (order) => E.OrderLoaded(order),
        failure: (error) => E.OrderFailed(error),
      },
    },
  ),
];
```

Constructing this expression is inert. Work begins only after the owning state and actor projection
publish. A consumed finite activity does not restart on ordinary reconciliation; state re-entry,
changed selected identity, or a newly admitted activity creates a new acquisition.

### Continuing subscription

`subscribe(P)` owns continuing interest in one resource. It publishes an existing canonical value
once, starts or joins lookup work when the entry is missing or stale, receives later canonical
revisions, and retains the entry until the declaration releases.

```ts
activities: [O.walletAccounts.subscribe({ provider })];
```

Multiple actors subscribing to the same descriptor and `K` share the canonical base and lookup
generation while retaining independent activity ownership and outcome mappings.

### Forced replacement

`refetch(P)` is a finite forced replacement. It starts a new admitted generation even when the
current value is fresh, while existing canonical data remains readable during the replacement.
It accepts `P`, not only `K`, because `K` need not reconstruct executable input.

### Authoritative writes

`setData(K, valueOrUpdater)` performs an authoritative write to the shared canonical base:

- It creates a missing entry when a concrete value is produced.
- Its updater receives the canonical base, excluding placeholders and optimistic overlays.
- An updater returning `undefined` declines the write.
- A successful write marks the value fresh, clears invalidation and current failure metadata,
  advances the entry revision, and publishes one atomic StoreState revision.
- The current proposal fences older lookup generations so a late lookup cannot overwrite the
  authoritative write.

```ts
O.orderById.setData([order.id], (current) => reconcileOrder(current, order));
```

`setData` is not the optimistic-update mechanism. Transactions use identified overlays for
speculative values and remove only their own overlay on every terminal outcome. Resource lookup
success, trusted host input, transaction success mappings, and authoritative stream values are the
intended canonical writers.

### Cancellation

Each resource lookup receives a Flow-managed `AbortSignal`. Actor-level `cancel(K)` releases that
actor's active finite lookup ownership for the exact resource identity and consumes the matching
finite activity for its current activation.

If another actor or continuing subscription still owns the shared lookup generation, external work
continues. If the cancelling actor was the final owner, Flow interrupts the underlying controller
and suppresses late completion by generation. Cancelling does not remove, invalidate, or replace
existing canonical data.

`cancel(K)` is not how a continuing resource subscription stops. Its presence in
`activities` still declares continuing interest, so state exit or a selector returning `null`
must release it.

## Cross-resource cache actions

### Invalidate

`invalidate` is an actor-bound, edge-triggered cache action that accepts exact
`[resource, K]` targets and nominal tags:

```ts
on: {
  ProviderChanged: {
    actions: () => [
      invalidate([
        [O.walletAccounts, []],
        walletResourcesTag,
      ]),
    ],
  },
}
```

All targets are materialized, canonically deduplicated in first-seen order, and committed in one
store revision. Invalidation retains canonical data and marks it stale. It does not delete the
entry or directly execute a lookup. Every active resource subscription affected by the invalidation
starts or joins one replacement generation.

There is no resource-family `.invalidate(K)` method because transactions and machine events
commonly need to invalidate several exact keys and tags atomically.

### Clear

`clear` removes matched cache entries, metadata, overlays, and active generations rather than
marking them stale:

```ts
on: {
  LoggedOut: {
    target: S.SIGNED_OUT,
    actions: () => [
      clear([
        walletResourcesTag,
        O.assetBalance,
      ]),
    ],
  },
}
```

The actor form may target exact entries, tags, or admitted resource families. Whole-runtime
`runtime.cache.clear()` exists for runtime disposal and test cleanup.

Clearing fences matched generations and interrupts their underlying work. An active subscription
then observes a missing entry and may start another lookup, so logout must release account-scoped
subscriptions and clear account-scoped entries in the same stabilized turn. Clearing one actor's
projection alone is not supported because the canonical cache is shared by the runtime.

The cache actions have distinct semantics:

| Action       | Canonical data            | Active generation                               | Active subscription          |
| ------------ | ------------------------- | ----------------------------------------------- | ---------------------------- |
| `invalidate` | Retained and marked stale | Retained or replaced by policy                  | Authorizes replacement       |
| `clear`      | Removed                   | Fenced and interrupted                          | Sees missing and may look up |
| `cancel`     | Unchanged                 | Releases actor ownership; aborts if final owner | Not a subscription stop      |
| `setData`    | Replaced authoritatively  | Older generation fenced                         | Receives new revision        |

## Transactions

### Descriptor and family API

Transactions use `key`, not `lane`, for consistent operation identification:

```ts
const submitIntent = flow.transaction({
  id: "everclear.submit-intent",

  key: ({ submissionId }: SubmitIntent) => [submissionId] as const,

  commit: (params: SubmitIntent, { signal }) => IntentSubmitter.submit(params, { signal }),

  concurrency: "reject",
});
```

An omitted key projector means `K = []`, giving the transaction one actor-local identity.

```ts
interface TransactionFamily<P, K extends readonly unknown[], A, E> {
  key(params: P): K;
  getState(key: K): TransactionState<A, E>;

  commit(params: P, options?: CommitOptions<P, A, E>): TransactionActivity;

  cancel(key: K): CancellationActivity;
}
```

`commit(P)` replaces the generic `run(P)` verb and matches the descriptor's external operation.
It still returns an inert plan. A transaction commit is admitted only by the `actions` clause of
an accepted event handler; the external commit begins after that transition and its candidate
memory publish.

```ts
states: {
  READY: {
    on: {
      SubmitRequested: {
        target: S.SUBMITTING,
        actions: ({ event, memory }) => [
          O.submitIntent.commit(
            buildSubmissionInput(event, memory),
            {
              outcomes: {
                success: receipt => E.SubmitSucceeded(receipt),
                failure: error => E.SubmitFailed(error),
                defect: () => E.SubmitDefected(),
                interrupt: () => E.SubmitInterrupted(),
              },
            },
          ),
        ],
      },
    },
  },

  SUBMITTING: {},
}
```

State activation by itself, memory changes, store fanout, passive reads, operation completion, and
ordinary reconciliation cannot admit another transaction attempt.

### Attempt identity and status

Attempt identity is actor ID plus transaction descriptor ID plus canonical `K` plus generation.
The actor ID makes execution and concurrency actor-local; inspection history may retain every
generation after the current actor projection moves on.

`getState(K)` passively returns idle, queued, committing, success, typed failure, defect,
interruption, or superseded status for the current actor identity. It never admits work.

```ts
const submit = O.submitIntent.getState([submissionId]);
```

There is no `transactions.get`, `byLane`, `byKey`, `status()`, or transaction `ref`.

### Concurrency

Concurrency policy is evaluated per actor and exact transaction `K`:

| Policy      | Admission and completion                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `reject`    | Declines a second active attempt without evaluating commit-side callbacks.                                         |
| `cancel`    | Cancels the previous attempt, then admits its replacement.                                                         |
| `allow`     | Admits independent generations; only the current generation may update the current projection or route an outcome. |
| `serialize` | Materializes each admitted `P` and runs the queue FIFO for the exact key.                                          |

Retry is a new `commit(P)` admitted by a new accepted domain event. There is no transaction `retry()`
method because a failed attempt's captured `P` may already be stale.

### Transaction cancellation

`commit(P)` receives a Flow-managed `AbortSignal`. Explicit `cancel(K)` and the
`"cancel"` concurrency policy use the same interruption mechanism.

Before the operation's point of no return, cancellation may interrupt the adapter and settle the
attempt as interrupted or superseded. After an irreversible signing, broadcast, or external commit,
the adapter must report a truthful domain result such as submitted, unknown, or requiring
reconciliation. Flow cannot claim that aborting local work reversed an external side effect.

### Resource previews, writes, invalidation, and clearing

An admitted transaction may materialize optimistic resource overlays before its external commit.
It removes only its own overlays on every terminal outcome.

A successful transaction may explicitly apply authoritative resource writes, invalidations, and
clears:

```ts
O.submitIntent.commit(params, {
  writes: ({ value }) => [O.orderById.setData([value.order.id], value.order)],

  invalidates: ({ params }) => [[O.assetBalance, [params.signer, params.inputAssetId]], intentsTag],

  outcomes: {
    success: (receipt) => E.SubmitSucceeded(receipt),
    failure: (error) => E.SubmitFailed(error),
  },
});
```

The success path is ordered:

1. Confirm that the attempt generation is still current.
2. Remove that attempt's optimistic overlays.
3. Apply its authoritative `setData` writes, fencing older resource generations.
4. Apply its invalidations and clears.
5. Publish one atomic resource and transaction revision.
6. Materialize and enqueue the mapped outcome event.

The current proposal rejects writing and invalidating the same exact resource target in one success
commit unless a future explicit policy explains why the newly written value should immediately
become stale.

## Streams

### Descriptor and family API

A stream descriptor owns reusable input-to-key projection and subscription construction:

```ts
const submissionProgress = flow.stream({
  id: "everclear.submission-progress",

  key: ({ submissionId }: ProgressInput) => [submissionId] as const,

  subscribe: ({ submissionId, client }: ProgressInput, { signal }) =>
    client.progress(submissionId, { signal }),
});
```

```ts
interface StreamFamily<P, K extends readonly unknown[], V, E> {
  key(params: P): K;
  getState(key: K): StreamState<V, E>;

  subscribe(params: P, options?: StreamSubscriptionOptions<P, K, V, E>): ContinuingActivity;
}
```

Streams are actor-owned continuing generations, not entries in the runtime resource cache. Equal
keys in one declaration retain the existing generation and original materialized `P`; changed keys
release the old subscription once and start another. Different actors subscribe independently.
An application service may explicitly share an external source, but Flow does not silently
deduplicate actor stream subscriptions through the resource store.

`getState(K)` passively exposes idle, connecting, running, complete, typed failure, defect, and
interruption for the actor's current stream generation. Whether it retains the latest emitted value
as part of that projection remains open; accumulated domain progress belongs in machine memory or
a resource.

### Stream release and outcomes

Streams do not expose actor `cancel(K)`. A stream declaration represents continuing desired
ownership, so state exit, selector replacement, actor disposal, or a selector returning `null`
unsubscribes and runs its finalizer exactly once. External runtime use receives an explicit
`unsubscribe()` handle.

```ts
activities: [
  onMemory.select(
    ({ memory }) => ({
      submissionId: memory.submissionId,
      client: memory.client,
    }),
    ({ submissionId, client }) =>
      submissionId === null
        ? null
        : O.submissionProgress.subscribe(
            { submissionId, client },
            {
              outcomes: {
                value: (step) => E.ProgressChanged(step),
                complete: () => E.ProgressComplete(),
                failure: (error) => E.ProgressFailed(error),
                defect: () => E.ProgressDefected(),
                interrupt: () => E.ProgressInterrupted(),
              },
            },
          ),
  ),
];
```

Planned release does not route completion or interruption as a domain outcome. Late values are
suppressed by declaration slot, exact key, and generation.

### Streams publishing resources

A stream value does not become shared resource data implicitly. An authoritative stream may
declare exact resource writes:

```ts
O.walletChanges.subscribe(
  { provider },
  {
    writes: ({ value }) => [O.walletAccounts.setData([], value.accounts)],

    outcomes: {
      value: (change) => E.WalletChanged(change),
      failure: (error) => E.WalletStreamFailed(error),
    },
  },
);
```

For each accepted stream value, Flow verifies the current stream key and generation, applies all
resource writes atomically, publishes the resource and stream projection, and then enqueues the
mapped value event. A late value from a replaced generation cannot write resource data. Completion
or failure does not remove resource values previously published by the stream.

This explicit bridge keeps transactions and streams from becoming hidden resource caches while
allowing authoritative external results to update the shared resource store without another
lookup.

## Runtime and host use

Operation meanings do not change outside a machine. The receiver and executor make ownership
explicit:

```ts
const O = runtime.operations;

const current = O.orderById.getData([orderId]);

const order = await runtime.execute(O.orderById.lookup({ orderId, client }));

const subscription = runtime.subscribe(O.orderById.subscribe({ orderId, client }));

subscription.unsubscribe();
```

Runtime cache administration is a separate capability:

```ts
runtime.cache.seed(entries);
runtime.cache.write(entries);
runtime.cache.inspect(filters);
runtime.cache.cancel(targets, { force: true });
runtime.cache.clear();
```

`seed` supports fixtures, boot, and hydration. `write` is an authoritative host operation with
the same base-write semantics as `setData`. Forced runtime cancellation may interrupt shared work
owned by several actors and is therefore unavailable through ordinary actor `O`. Whole-runtime
`clear()` is intended for disposal and test cleanup; actor-level `clear(targets)` remains the
scoped application action.

## Hydration and persistence

- Persist descriptor ID, ordered `K`, canonical bases, revisions, freshness, overlays, and actor
  projections; never serialize executable `P`.
- A hydrated key-only resource remains readable. New lookup work waits until a live activity
  provides executable `P`.
- Reconcile continuing resource and stream declarations after initial publication. Never replay an
  already admitted outcome.
- Do not resume captured transaction commits or serialized queues. Normalize them to an interrupted
  status, remove their overlays, and wait for a new domain command.
- Restore streams as fresh subscriptions after their owning actor and state are restored.
- If a durable identity cannot be reconstructed or validated, preserve inspection evidence and
  publish an issue rather than manufacturing executable input.

## Deliberately excluded API

The machine resource surface does not include:

- `onEvent`, because accepted events already select transitions and therefore the states that own
  one-shot work.
- `onSnapshot`, because resource-dependent behavior is driven by explicit operation outcomes,
  state transitions, memory updates, and state re-entry rather than a second dependency graph.
- `onEnter`, because the current design uses `onMemory`'s immediate current-value emission when a
  newly active state needs a continuing activity from its current memory.
- `onMemory.once`, because finite transaction and store-command work is admitted by accepted event
  handlers; it may be added later only if an activation-time finite operation proves the need.
- `prefetch`, because `lookup(P)` with ignored outcomes already warms the cache and Flow machines
  do not mount query hooks.
- `ensure`, because finite `lookup`, passive reads, and continuing `subscribe` cover its useful
  acquisition semantics.
- `read`, because `getData` and `getState` separate value access from lifecycle inspection.
- `has`, because `getState(K)` distinguishes idle from a materialized entry.
- `require`, because throwing from guards and selectors hides normal missing, stale, and loading
  states.
- `retry`, because resource retry is `refetch(P)` and transaction retry is a new
  `commit(P)`.
- `update`, because `setData(K, updater)` already provides atomic update semantics.
- `delete` or `remove`, because actor `clear(targets)`, runtime clearing, and automatic
  `gcTime` collection cover the actual ownership scopes.
- public cache enumeration, because machine dependencies must stay closed and explicit; runtime
  inspection may enumerate entries.
- mutable query defaults, because freshness, retry, tags, placeholders, and collection policy are
  descriptor configuration.

## Open decisions and proof obligations

- Confirm `lookup` as the finite resource verb despite fresh hits that do not execute external
  lookup work.
- Finalize transition `actions` ordering relative to memory publication and redirects, plus the
  release rule when the resulting state activation exits.
- Finalize canonical key element bounds, size limits, normalization, and rejection of mutable or
  secret key data.
- Define the exact selector equality contract and whether callers may provide a custom comparator.
- Decide the API for a runtime-sized set of independently keyed resource subscriptions.
- Specify deterministic executable-`P` retention and handoff when several live owners have equal
  resource keys.
- Confirm whether authoritative `setData` always fences older generations or may opt into
  coexistence.
- Finalize actor cancellation outcomes when shared work continues for another owner.
- Finalize exact-entry, tag, family, and whole-runtime clearing syntax and authorization.
- Decide whether stream `getState(K)` retains the latest emitted value.
- Prove selector replay, snapshot consistency, lookup deduplication, stale completion suppression,
  exact finalization, atomic transaction writes, and hydration behavior.

## Locked evolution decisions

These decisions were accepted during the operations API design review. They remain proposed until
they are promoted into `DESIGN_REVISIONS.md` and the normative contracts.

### Resource input and ordered cache identity are separate

A resource descriptor receives complete executable `P` and projects an ordered readonly tuple
`K`. Runtime identity is descriptor ID plus canonical `K`. Cache-facing actions accept `K`;
actions that may execute a lookup accept `P`. Equal `K` asserts equivalent canonical results.

### The resource cache is runtime-scoped and shared

One Flow application runtime owns one shared resource store and lookup-generation registry. Machine
actors own subscriptions and immutable projections into that store, not private copies of resource
data. Separate runtimes, SSR requests, and tests remain isolated.

### Public refs and generic registries are removed

The evolved machine API does not require a public `ref`, `byKey`, bound cache-entry object, or
generic `resources.get`. Exact family methods use `K`, while cross-family actions use explicit
`[resource, K]` targets.

### Memory-derived activities are independently reconciled

`onMemory` is a current-value memory subscription that emits immediately when its owning state
activates or re-enters and after every committed memory change. It may be declared multiple times;
each declaration owns its returned activities independently, may use a selector to isolate relevant
changes, and releases its activities when selection returns `null`, identity changes, the state
exits, or the actor stops. It returns only continuing resource and stream declarations; transaction
commits and store commands are admitted by accepted event handlers. Machine activities never call
`unsubscribe()` manually.

### The state graph owns event and resource dependency propagation

The evolved machine API has no `onEvent`, `onSnapshot`, or `onEnter` combinator. Accepted event
handlers admit finite plans through optional transition `actions` and drive the resulting state
transition. Resource revisions that matter to machine behavior are mapped to operation outcomes,
then processed through state transitions or memory updates before dependent continuing activities
are reconciled.

### Managed children are excluded

Flow does not expose managed-child activities or a child operation catalogue in this model.
Workflows that need independent state-machine ownership are modeled as separately owned actors and
communicate through explicit resources, streams, and domain events rather than an implicit parent
child operation boundary.

### Resource caches expose explicit write, cancellation, and clearing capabilities

The evolved cache model includes authoritative `setData`, actor-aware cancellation, scoped
clearing, and whole-runtime clearing. These capabilities remain distinct from invalidation,
automatic release, and garbage collection.

### Machine prefetch is excluded

The machine API has no separate `prefetch` method. Finite resource acquisition with ignored
outcomes already provides cache warming, while host-specific speculative loading may be added at
the runtime boundary only if a concrete use case requires it.

### Transactions use keys and commit attempts

Transactions use ordered tuple `K` for actor-local concurrency and status identity. They do not
introduce a separate lane vocabulary. The transaction execution verb is `commit(P)`, not
`run(P)`; an omitted key uses `[]`.

### Transactions and streams write resources explicitly

Transaction success and authoritative stream values may declare exact resource `setData` writes.
Those writes are applied only after current-generation checks and before mapped domain outcomes.
No transaction result or stream value becomes canonical resource data implicitly.
