# Sync engine adapter (draft 1): TanStack DB first — a future path

> **Not built in version 1.** This document exists to prove that sync engines can be added later
> without changing the core. Version 1 builds tier 1 (`entities.md` section 3.3). Section 0 lists
> what the core and tier 1 must guarantee now so that this adapter, and others like it, need no
> core changes later. Those guarantees are the only part of this document that binds version 1.

## 0. What version 1 must guarantee for future adapters

An adapter is built only from public parts of Flow State. Each guarantee below is a requirement on
version 1; the right column says whether the agreed design already meets it.

| #   | Guarantee                                                                                                                                                                                                                                                                       | Status                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| A1  | **Operation descriptors can be built outside the core.** A package can construct `stream` and `transaction` descriptors from an id, a key projector, an input Schema and an Effect (`subscribe` returning a `Stream`, `commit` returning an Effect), with no private hooks      | needs stating in the Resources, Streams and Transactions plans                                            |
| A2  | **A commit can end as `unknown` by itself.** Decision 6's `unknown` covers cancellation after sending, restore and abandonment; an adapter must also be able to report "the server may have applied this" (a confirmation timeout) through a built-in cause such as `Uncertain` | **missing**: a small addition to decision 6                                                               |
| A3  | **Commits receive `attempt.id` and are interruptible**, so engines can deduplicate and Flow can cancel                                                                                                                                                                          | met by decision 6 and Effect interruption                                                                 |
| A4  | **Engines are scoped to a Runtime** through a `Layer`, disposed with it; a new principal is a new Runtime                                                                                                                                                                       | met by D47 and decision 10                                                                                |
| A5  | **Stream values may carry their own status**, and emissions are published once per Runtime turn                                                                                                                                                                                 | met by the Streams plan; coalescing per turn needs stating                                                |
| A6  | **External work can settle before a turn publishes**, so Stories stay deterministic with an engine fixture                                                                                                                                                                      | **open**: needs a public "settle external work" step in the Runtime, or a spike showing it is unnecessary |
| A7  | **Descriptors can declare static edges** to things outside Flow (an engine's collections), so `flow graph` draws them                                                                                                                                                           | needs a declared-edges field on descriptors                                                               |
| A8  | **A public trace service** lets adapters record their own events in the Runtime trace and `attachInspector`                                                                                                                                                                     | needs stating in the Inspection plan                                                                      |
| A9  | **Tier 1 never claims data it was not given.** The entity store touches only operations that bind an entity; engine rows stay outside it, and one Schema cannot be both                                                                                                         | a tier-1 rule to keep                                                                                     |
| A10 | **Views read engine data through lanes**, so engine data shares the Runtime's versioned store                                                                                                                                                                                   | met by decision 8                                                                                         |

Everything else in this document is design for a future adapter and can change when one is built.

Status: a proposal, not decided. It designs the **tier-2 plug-in point** decided in `entities.md`
section 3.3: when an app needs live results, instant list changes, local queries or offline use,
it uses a sync engine, and Flow State hosts it. This draft designs the contract against TanStack
DB with its Electric and Query collections, so the plug-in point is proven before tier 1 is
finalised. Code is illustrative; Flow-side names are placeholders.

Facts about TanStack DB were checked against its source on `main` and its docs (section 2). The
installed versions to target are `@tanstack/db` 0.15.2, `@tanstack/electric-db-collection` 0.6.3
and `@tanstack/query-db-collection` 1.4.8. TanStack DB is pre-1.0 and several APIs are marked for
removal in 1.0; section 11 lists them.

---

## 1. The idea

> **The engine owns data; Flow State owns workflow.** A sync engine keeps its own collections,
> computes its own live results, applies its own optimistic writes and confirms them its own way.
> Flow State does not mirror any of that. The adapter turns an engine's live results into
> **streams** and its writes into **transactions**, so machines use them through the operation
> families they already have, with outcomes as events.

Three consequences:

- **No new operation family.** A live result is a `stream` descriptor; a write is a `transaction`
  descriptor. Machines, Stories, traces and `flow graph` treat them as such.
- **Tier 1 stays out of engine data.** The entity store never holds, patches or repairs rows that
  an engine owns. There are no two optimistic layers and no two notions of membership.
- **One engine contract, several engines.** The contract (section 3) is engine-agnostic; TanStack
  DB is its first binding (section 4). A later Zero or PowerSync binding implements the same five
  obligations.

---

## 2. What TanStack DB provides

| Area         | Verified fact                                                                                                                                                                                                                                                                                                                                                           | Source                                                                      |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| collections  | `createCollection(options)` with `getKey`, `schema`, `sync`, `gcTime` (default 300 000 ms; `<= 0` disables collection), `startSync`, `syncMode: "eager" \| "on-demand"`                                                                                                                                                                                                 | `packages/db/src/types.ts`, `collection/index.ts`                           |
| status       | `"idle" \| "loading" \| "ready" \| "error" \| "cleaned-up"`; `error → ready` is allowed (recoverable)                                                                                                                                                                                                                                                                   | `collection/lifecycle.ts`                                                   |
| observing    | `subscribeChanges(cb, { includeInitialState })` delivers batches of `{ key, value, previousValue?, type }`; `status`, `onFirstReady`, `preload()`, `isLoadingSubset`, events `status:change`, `truncate`                                                                                                                                                                | `collection/index.ts`, `events.ts`                                          |
| custom sync  | `sync({ begin, write, commit, markReady, markError, truncate })`; the closure can be driven entirely by the host                                                                                                                                                                                                                                                        | `types.ts` (`SyncConfig`)                                                   |
| live queries | `createLiveQueryCollection((q) => q.from(…).where(…))` is an ordinary collection; ready when all sources are ready and subsets loaded; a source in `error` puts it in `error`; parameters are closure values, so a new parameter means a new live query                                                                                                                 | `query/live-query-collection.ts`, `query/live/collection-config-builder.ts` |
| transactions | `createTransaction({ id, autoCommit, mutationFn, metadata })`; `tx.mutate(() => …)` applies optimistic changes synchronously; `tx.commit()` runs `mutationFn`, on error rolls back and rethrows; `tx.when("settled")` resolves on success and rejects with the error (or `undefined` for a rollback without one); states `pending`, `persisting`, `completed`, `failed` | `transactions.ts` (read directly)                                           |
| cancellation | `mutationFn` receives no abort signal; `rollback()` while persisting drops the optimistic state but does not stop the call                                                                                                                                                                                                                                              | `transactions.ts`                                                           |
| conflicts    | rolling back a transaction also rolls back other transactions touching the same keys                                                                                                                                                                                                                                                                                    | `transactions.ts`                                                           |
| Electric     | a write is confirmed when its Postgres `txid` appears in the shape stream: `utils.awaitTxId(txid, timeout)`, or `utils.awaitMatch(fn, timeout)`; timeout rejects with `TimeoutWaitingForTxIdError`; cleanup rejects waiters with `StreamAbortedError`                                                                                                                   | `packages/electric-db-collection/src/electric.ts`                           |
| Query        | `queryFn` must return the complete scoped result; rows missing from a refetch are deleted; `utils.refetch({ throwOnError })`; direct writes (`writeUpsert`, `writeBatch`) bypass optimistic state; a refetch failure after the first snapshot keeps the last snapshot (`ready`) and sets `utils.lastError`                                                              | `packages/query-db-collection/src/query.ts`                                 |

**What TanStack DB does not expose:** whether a result is complete. `ready` means "a usable
snapshot exists". For eager collections that is the whole synced set; for on-demand and
progressive Electric collections it is not. Electric's `up-to-date` is tracked internally but not
public.

---

## 3. The contract: what any engine binding provides

An engine binding gives Flow State five things. Each maps onto something Flow State already has.

| #   | Obligation                                                                                                                                                                                            | Flow State side                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| E1  | **Lifetime.** The engine's collections are created per Runtime and disposed with it                                                                                                                   | an Effect `Layer` in `runtimeSetup` services (D47); a new principal is a new Runtime (decision 10) |
| E2  | **Live results.** For a declared query and an input, a continuing value with status (`loading`, `ready`, `error`), rows, and whether a subset is loading                                              | a `stream` descriptor; its lane's `latest` is the live result                                      |
| E3  | **Writes.** Apply the engine's own prediction synchronously, then persist through Flow's effect, then confirm the engine's way; classify the ending as success, failure, defect, interrupt or unknown | a `transaction` descriptor; decision 6 outcomes                                                    |
| E4  | **Determinism.** A fixture form whose sync is driven by the host on the Runtime clock                                                                                                                 | a fixture `Layer` in Stories                                                                       |
| E5  | **Trace.** Status changes, change batches, write lifecycle and outcome classification                                                                                                                 | the Runtime trace and `attachInspector`                                                            |

The engine is never asked for completeness or for membership rules; those are its business.

---

## 4. The TanStack DB binding

### 4.1 Collections live in a Layer (E1)

```ts
// app/todos-db.ts
export class TodosDb extends Context.Service<
  TodosDb,
  {
    todos: Collection<Todo, string>;
    projects: Collection<Project, string>;
  }
>()("app/TodosDb") {}

export const TodosDbLive = Layer.scoped(
  TodosDb,
  Effect.gen(function* () {
    const todos = createCollection(
      electricCollectionOptions({
        id: "todos",
        shapeOptions: { url: `${ELECTRIC_URL}/v1/shape`, params: { table: "todos" } },
        getKey: (todo) => todo.id,
        schema: TodoSchema,
      }),
    );
    const projects = createCollection(
      queryCollectionOptions({
        id: "projects",
        queryKey: ["projects"],
        queryFn: () => fetchProjects(),
        queryClient,
        getKey: (project) => project.id,
      }),
    );
    yield* Effect.addFinalizer(() =>
      Effect.promise(() => Promise.all([todos.cleanup(), projects.cleanup()])),
    );
    return { todos, projects };
  }),
);
```

- Collections declare **no** `onInsert`, `onUpdate` or `onDelete` handlers. Every write goes through
  the adapter (4.3), so there is one path for writes and every write has a Flow attempt. A
  collection with handlers is a startup diagnostic.
- Collections are shared by every actor of the Runtime; live queries are per subscription (4.2).

### 4.2 Live results are streams (E2)

```ts
export const openTodos = tanstack.live({
  id: "todos/open",
  db: TodosDb,
  key: (input: { projectId: string }) => input,
  sources: ["todos"],
  query:
    ({ todos }, input) =>
    (q) =>
      q
        .from({ t: todos })
        .where(({ t }) => and(eq(t.projectId, input.projectId), eq(t.done, false)))
        .orderBy(({ t }) => t.createdAt, "desc"),
});
```

`tanstack.live` returns a `stream` descriptor. Subscribing with an input:

1. builds a live query collection from `query(collections, input)`;
2. subscribes with `subscribeChanges(…, { includeInitialState: true })` and listens to
   `status:change` and `loadingSubset:change`;
3. emits a **live result** into the stream, at most once per Runtime turn, coalescing every change
   batch that arrived since the last turn;
4. on release, unsubscribes and calls the live query's `cleanup()`.

```ts
type LiveResult<Row> = {
  status: "loading" | "ready" | "error";
  rows: Array<Row>; // rows keep their object identity while unchanged
  loadingSubset: boolean; // on-demand loading in progress
  error?: unknown; // the collection's error, or a Query collection's lastError
};
```

- **Status lives in the value, not in the stream's status.** A Flow stream's failure is terminal
  (Streams plan), while a TanStack collection can go from `error` back to `ready`. So the stream
  stays `running`, and its `latest` carries the engine's status. Only a defect in the adapter
  itself ends the stream.
- **`sources`** names the collections the query reads. It is data, so `flow graph` draws the edge;
  at subscription the adapter checks the built query's `from` collections against it, and a
  mismatch is a defect.
- **Parameters** are the stream's key input, as for any stream. A new input builds a new live
  query, which is what TanStack DB does itself.
- **One live query per subscription.** Streams are actor-owned (Streams plan: no cross-actor
  deduplication). The engine's base collections are shared, so this costs only the query.

### 4.3 Writes are transactions (E3)

```ts
export const toggleTodo = tanstack.write({
  id: "todos/toggle",
  db: TodosDb,
  input: { id: Schema.String, done: Schema.Boolean },
  key: (input) => ({ id: input.id }),
  apply: ({ todos }, input) =>
    todos.update(input.id, (draft) => {
      draft.done = input.done;
    }),
  persist: (input, { attempt }) => TodoApi.use((api) => api.toggle(input, attempt.id)),
  confirm: electric.txid((result) => result.txid, { timeout: "10 seconds" }),
  concurrency: "serialize",
});

export const renameProject = tanstack.write({
  id: "projects/rename",
  db: TodosDb,
  input: { id: Schema.String, name: Schema.String },
  key: (input) => ({ id: input.id }),
  apply: ({ projects }, input) =>
    projects.update(input.id, (draft) => {
      draft.name = input.name;
    }),
  persist: (input, { attempt }) => ProjectApi.use((api) => api.rename(input, attempt.id)),
  confirm: query.refetch("projects"),
  concurrency: "serialize",
});
```

`tanstack.write` returns a `transaction` descriptor. Its commit runs:

1. `createTransaction({ id: attempt.id, autoCommit: false, mutationFn })`;
2. `tx.mutate(() => apply(collections, input))`: the engine's optimistic overlay, applied
   synchronously when the Flow commit starts (decision 6's "when the commit starts");
3. `tx.commit()`. Its `mutationFn` runs `persist` as an Effect in the Runtime, with its services,
   `signal` and `attempt`, then runs `confirm`;
4. awaits `tx.when("settled")` and classifies the ending (4.4).

**Confirmation strategies:**

| Strategy                             | What it does                                      | Collection type |
| ------------------------------------ | ------------------------------------------------- | --------------- |
| `electric.txid(select, { timeout })` | awaits `utils.awaitTxId(select(result), timeout)` | Electric        |
| `electric.match(fn, { timeout })`    | awaits `utils.awaitMatch(fn, timeout)`            | Electric        |
| `query.refetch(collection)`          | awaits `utils.refetch({ throwOnError: true })`    | Query           |
| `none`                               | resolves when `persist` succeeds                  | local or custom |

`timeout` is required: the documented defaults disagree between versions (section 11).

### 4.4 How endings map to outcomes

| What happened                                                         | TanStack DB                                         | Flow outcome                      |
| --------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------- |
| `persist` succeeded and the confirmation arrived                      | `completed`; the overlay is replaced by synced data | `success`, with `persist`'s value |
| `persist` failed with a typed error                                   | `mutationFn` rejects; rollback                      | `failure`, by tag                 |
| `persist` died                                                        | rollback                                            | `defect`                          |
| `persist` succeeded, the confirmation timed out or the refetch failed | see below                                           | `unknown`                         |
| Flow cancelled before `persist` started                               | `tx.rollback()` while `pending`                     | none: the attempt never ran       |
| Flow cancelled after `persist` started                                | `tx.rollback()`; the Effect is interrupted          | `unknown`                         |
| another transaction's rollback rolled this one back                   | `when("settled")` rejects with `undefined`          | `unknown`                         |
| the Runtime was disposed                                              | `StreamAbortedError` in the confirmation            | `interrupt`                       |

**When confirmation fails after the server accepted the write**, the adapter resolves `mutationFn`
rather than rejecting it. TanStack DB then drops the overlay and shows whatever its synced data
says; when the sync catches up, the row shows the server's value. Rejecting would roll back a
write the server may have applied, and the row would flicker back. Either way TanStack DB cannot
hold an overlay as "uncertain", so the honest signal is Flow's `unknown` outcome: the machine knows
the attempt is uncertain and decides what to show.

**Idempotency.** `attempt.id` is the TanStack transaction id and reaches `persist`. A server that
deduplicates by it makes retries after `unknown` safe.

### 4.5 Pushes

- **Electric** pushes arrive through the shape stream. They change collections, live results emit,
  and `awaitTxId` sees them. The adapter does nothing.
- **Query** collections have no push. An app either sets `refetchInterval`, or feeds a socket into
  `utils.writeUpsert` / `writeBatch` from a Flow stream activity. Direct writes bypass optimistic
  state; the adapter exposes them as a `tanstack.ingest(stream, collection)` helper so the feed is
  a declared, traced edge.

---

## 5. Machines and views

```ts
export const Board = definition({
  id: "todos/Board",
  operations: { openTodos, toggleTodo, renameProject },
  memory: { projectId: Schema.String },
  …
});

OPEN: {
  activities: {
    todos: O.openTodos.subscribe(({ memory }) => ({ projectId: memory.projectId })),
  },
  on: {
    ToggleClicked: {
      target: "self",
      actions: [O.toggleTodo.commit(({ event }) => ({ id: event.id, done: event.done }), {
        outcomes: { failure: { TodoLocked: E.ToggleRejected }, unknown: E.ToggleUncertain },
      })],
    },
  },
}

// a view
const todos = useView(board, (s) => s.activities.todos?.latest);
// { status: "ready", rows: [...], loadingSubset: false }
```

- **Views read lanes through `useView`**, not `useLiveQuery`. Every actor publishes into one
  versioned store per turn (8a), so a view sees one consistent moment across machines and engine
  data, and Story checkpoints can render it. Using `useLiveQuery` directly would bypass both.
- **Empty states.** `status: "ready"` with no rows is "empty" only for eager collections, whose
  ready snapshot is the whole synced set. For on-demand and progressive collections the adapter
  marks the result `ready` only when `loadingSubset` is false, and the app treats an empty result as
  final only if it accepts the engine's own meaning of ready. The adapter cannot do better than the
  engine exposes (section 2).
- **Machines never copy rows into memory** (the same rule as tier 1): they hold ids and drafts.

---

## 6. Stories and determinism (E4)

A Story replaces the engine Layer with a **fixture engine**: the same collections, built with a
custom `sync` whose `begin`, `write`, `commit` and `markReady` the fixture drives.

```ts
export const TodosDbFixture = tanstackFixture(TodosDb, {
  todos: { rows: [T1, T2], ready: "immediately" },
  projects: { rows: [P1], ready: { after: "200 millis" } },
  server: TodosServer, // a stateful fake: persist reads and writes it; confirmations follow it
});
```

- **The fixture drives sync on the Runtime clock**, so `advance` delivers server changes and
  confirmations at exact steps.
- **`gcTime` is disabled** in fixtures: TanStack DB's collection uses idle callbacks the host
  cannot control.
- **Turn boundaries.** TanStack DB settles changes in its own microtasks. The adapter flushes them
  before a Runtime turn publishes, so `process()` drains engine work deterministically. This needs a
  spike (section 12).
- **Confirmation in fixtures** follows the fixture server: an Electric-style txid confirms when
  the fixture commits the matching sync batch; a timeout is reachable with `advance`.

---

## 7. Inspection and the CLI (E5)

- **Traces** record collection status changes, each coalesced change batch (counts and keys),
  live-query creation and cleanup, every write's lifecycle (`mutate`, `persisting`, confirmation
  strategy, ending, classification) and every direct write from `tanstack.ingest`.
- **`flow graph`** draws stream → collections (`sources`), transaction → collection (from
  `apply`'s recorded collection set, by the same recording the entity domain uses for `.predicts`,
  `entity-domain.md` section 4), and feed → collection (`tanstack.ingest`).
- **`flow check`** reports a collection with mutation handlers, a write with no `confirm`, a missing
  `timeout`, and an Electric write whose `persist` result has no txid field.

---

## 8. Persistence and principals

- **The engine owns persistence of its data** (`entities.md` section 6). Flow State does not
  persist engine rows.
- **A restored Flow attempt** of an engine write cannot re-enter TanStack DB's transaction, which
  did not survive the reload. It restores as `unknown` (D34), and the machine reconciles.
- **A new principal is a new Runtime**, so the Layer builds new collections and the old ones are
  cleaned up with the old Runtime.

---

## 9. Coexisting with tier 1

An app may use both: tier 1 for REST data that needs coherence and repair, tier 2 for data that
needs live results or local queries.

- **A record type belongs to one tier.** A Schema used as a TanStack collection's row is not a
  tier-1 entity, and an entity is not a collection row. `flow check` errors on the overlap:
  coherence across the two would need a bridge neither side should own.
- **A machine may use both** in one definition; they are just operations.
- **Moving data from tier 1 to tier 2** is a change of operations (a resource becomes a live stream,
  a transaction becomes a `tanstack.write`), not of machines' shape.

---

## 10. Constraints from `entities.md` section 6

| Constraint                                     | Met by                                                        |
| ---------------------------------------------- | ------------------------------------------------------------- |
| one ingestion path for record changes          | the engine's own sync; `tanstack.ingest` for host-fed changes |
| an answer may be maintained by its source      | live results are maintained by the engine, not by refetching  |
| keys are records of primitive fields           | `getKey`; the adapter passes keys through                     |
| versions are opaque and supplied by the source | the engine's (Electric's log offsets, txids)                  |
| reads and pushes reach every copy              | the engine's collections are the single copy                  |
| a write can be confirmed by its source         | `electric.txid`, `electric.match`, `query.refetch`            |
| optimistic predictions are optional per write  | `apply` may be empty; `optimistic: false` on a mutation       |
| persistence can belong to the source           | section 8                                                     |

---

## 11. Sharp edges, and how the adapter handles them

| Edge                                                                                                         | Handling                                                                            |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `isPersisted` is deprecated (removed in 1.0 RC)                                                              | the adapter uses `when("settled")` only                                             |
| handler return values (`{ txid }`) and Query auto-refetch after handlers are deprecated                      | collections have no handlers; confirmation is the adapter's `confirm`               |
| Electric timeout defaults disagree (15 s in source and docs, 5 s and 3 s in the shipped skill reference)     | `timeout` is required                                                               |
| `txid` read outside the write's database transaction never arrives                                           | a documented server rule; the timeout turns it into `unknown`, traced with the txid |
| awaiting a collection's readiness inside `mutationFn` can deadlock: sync data is held while a write persists | `confirm` strategies never await readiness                                          |
| a rollback rolls back other transactions on the same keys                                                    | classified as `unknown` for those attempts (4.4)                                    |
| `mutationFn` cannot be aborted by TanStack DB                                                                | `persist` runs as an Effect Flow can interrupt; the ending is `unknown`             |
| a narrower Query result deletes rows another query loaded                                                    | one Query collection per scope, or on-demand mode with subset keys                  |
| completeness is not exposed                                                                                  | section 5's empty-state rule; nothing stronger is claimed                           |

---

## 12. Open questions

1. **Turn boundaries.** Can the adapter flush TanStack DB's pending microtask work before each
   Runtime publication without private hooks? A spike against 0.15.2 decides it; if not, Stories
   lose exact-step determinism for engine data.
2. **Lane shape.** Status inside the stream's `latest` keeps the Streams plan intact but nests a
   second status. Is that acceptable, or should engine streams get their own lane shape?
3. **Unknown and the overlay.** Resolving `mutationFn` on a confirmation timeout drops the overlay
   at once. Should the adapter instead keep the attempt `persisting` until a later sync batch or a
   bounded second wait, at the cost of a stuck "saving" state?
4. **Direct writes from feeds** (`tanstack.ingest`). Version 1, or leave Query-collection pushes to
   `refetchInterval`?
5. **A second engine.** Which engine tests the contract's generality next: Zero (completeness by
   design) or PowerSync (offline queues)?
