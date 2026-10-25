# Entities: an entity-aware request cache (model 2)

Status: open exploration, nothing decided. The user is inclined towards this model over a client
database (model 3, set aside) but wants its questions answered first. Code below is
illustrative.

## Rationale

**The goal of a data layer** is coordination: when data changes, through the user's own write, a
refetch or another user's push, every screen shows the same truth without the author (usually an AI
agent) remembering every place that data appears.

**The failures that hurt app quality:**

1. **Stale screens after a write.** The author forgot to update or invalidate one cache entry.
2. **Optimistic updates that disagree.** The author patched the detail view but not the list.
3. **Wrong empty or loading states.** "No results" shows when data simply has not loaded.

**Three models were compared:**

|                                                 | 1. Request cache (decision 6)  | 2. Entity-aware request cache                                                                           | 3. Client database                                                                           |
| ----------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| The client holds                                | answers to questions it asked  | the same; each answer knows which entities it contains                                                  | rows, plus local queries over them                                                           |
| Keeping an entity's fields consistent           | the author patches every entry | the runtime, across every answer containing it                                                          | automatic: one row                                                                           |
| Results that should gain or lose an item        | the author invalidates         | refetch of every answer that could be affected (open: section "Two guarantees"); removal can be instant | recomputed locally, correct only if local data and semantics suffice to reproduce the result |
| Empty vs not loaded                             | the request finished or not    | the same                                                                                                | needs a coverage system                                                                      |
| Paged, searched or ranked results               | natural                        | natural                                                                                                 | only when the server's semantics can be reproduced locally                                   |
| Joins, shared derivations, atomic local changes | none                           | none                                                                                                    | yes                                                                                          |
| Vocabulary added                                | none                           | `entity`                                                                                                | collection, query, source, coverage, local write, row lifetime, tombstones, engine           |

**Why model 2 is worth exploring.** It makes a narrower promise: the server decides which entities
belong in a result; the runtime keeps each entity's fields consistent wherever it appears; machines
own drafts and workflow. There is no local query whose membership quietly depends on which loaders
ran, which was version 2's central confusion. It removes the query engine and the coverage system.

**What it does not remove.** "Adds one word" describes the vocabulary, not the work. Shapes,
ordering, propagation, deletion, patch reconciliation and refetch selection still need exact
contracts (questions A–C). Several correctness problems from version 2 remain open here.

**What it gives up, for REST sources:** a new item appearing in results before a refetch, joins and
shared derivations across answers, atomic local changes, and offline-first operation. Local-first
sync engines (Electric, Zero, PowerSync) are not rejected; the section on sync engines lists the
decisions that must not close that door.

## Ownership

| Concern                                           | Owner                      |
| ------------------------------------------------- | -------------------------- |
| Which entities belong in a page, search or list   | the server                 |
| An entity's fields agreeing across cached answers | the runtime                |
| Drafts, transitions, timing of operations         | machines                   |
| Fetching and committing                           | resources and transactions |

**Local and remote still differ.** Machines read _local_ cached answers, which may include optimistic
values the server has never returned. What disappears is a local query language, not the difference
between a local observation and a remote confirmation.

## Two guarantees

The model succeeds only if it provides both:

1. **Entity coherence.** Every cached copy of an entity shows the same fields: patched at once,
   replaced by a command's result, updated by fresher reads.
2. **Result validity.** A change eventually repairs every result it can affect, **including results
   that do not yet contain the entity**.

The first is the easier one. The second is the central open problem, because knowing where an
entity appears is different from knowing which results a change can affect:

1. Ticket 42 is open and appears in the open queue.
2. A command resolves it.
3. The resolved queue does not contain ticket 42.
4. Refetching only answers that contain ticket 42 never updates the resolved queue.

The same happens with creates, empty lists, counts and any filtered result that should gain the
entity. So refetch selection cannot be "answers that contain it"; it must be "answers that **could**
contain it, or depend on it". Candidates, to be decided under C5:

- **By type:** every active answer whose result Schema can contain a `Ticket`, plus answers that
  declare a dependency on the type (a count). Always valid, sometimes chatty.
- **By a predicate on the resource:** `about: (input, ticket) => input.workspaceId ===
  ticket.workspaceId` limits refetches to answers the entity could belong to. The same predicate,
  applied to the entity's new value, can also hide it at once where it no longer belongs (the role
  `keeps` plays in the sketch below).
- **Declared by the command:** precise, but brings back author bookkeeping.

**What "the same truth" means across shapes.** A summary, a detail and a search hit carry different
fields and different context (a highlight, a rank, a total). Updating a ticket's title while keeping
an old search highlight produces an answer the server never returned. The proposed meaning, open
under B4–B5: coherence is per entity field; context fields belong to the answer and are only made
valid again by its refetch, which the change triggers under guarantee 2.

## The basic idea

> **The server owns membership and truth. The client keeps answers to questions it asked, each
> knowing which entities it contains. A command says which entities it changed. The runtime keeps
> every copy of a changed entity consistent at once, and refetches every answer the change could
> affect so results become valid again. Machines own workflow and drafts; they read local answers
> and send commands.**

```ts
// what a ticket is and how it is identified
export const TicketEntity = entity(Ticket, { key: (t) => [t.workspaceId, t.ticketId] });

// answers: resources, plus a result Schema so the runtime can find the tickets inside
export const ticketList = resource({
  id: "support/ticket-list",
  key: (input: TicketListInput) => listKey(input),
  lookup: (input, { signal }) => TicketApi.use((api) => api.list(input, signal)),
  result: TicketPage, // contains Ticket[]
  keeps: (input, ticket) => ticket.status === input.filters.status, // optional; see "Two guarantees"
  staleTime: "10 seconds",
  gcTime: "2 minutes",
});
export const ticketById = resource({ …, result: Ticket });

// commands: what they change
export const saveTitle = transaction({
  id: "support/save-title",
  key: (input: SaveTitleInput) => [input.workspaceId, input.ticketId],
  commit: (input, { signal, attempt }) => TicketApi.use((api) => api.saveTitle(input, { signal, attempt })),
  result: Ticket,
  optimistic: TicketEntity.patch((input) => [input.workspaceId, input.ticketId], (t, input) => ({ ...t, title: input.title })),
  concurrency: "serialize",
});
```

What the runtime would do on a write: patch the ticket in every answer containing it when the
commit is admitted; on success write the result into every such answer and end the patch in the
same publication; on failure remove the patch; then refetch every answer the change could affect
(guarantee 2).

Machines stay as in decisions 1–8a: activities subscribe to resources, actions commit transactions,
outcomes return as events.

## Already constrained, not open

The sync-engine constraints below already settle part of group B: every source changes entities
through one path, and fresher data from a read reaches every answer containing the entity. Answers
therefore cannot keep private copies updated only by their own refetch. B1 and B2 remain open only
on _how_ (one stored copy, or copies kept in step), not _whether_.

## Sync engines: keep the door open

Sync engines are not designed now, but they are kept in mind. They need no special features in this
proposal; they constrain about eight of its decisions. Getting those wrong now would mean redesigning
entities later; everything else about engines can wait.

**What an engine looks like from Flow's side.** It delivers entity changes (upsert, delete, often
with a version or transaction id) and keeps some result sets live without a refetch. Some engines
(Zero, PowerSync, Replicache) also keep their own client store and run their own optimistic writes.

**Constraints to respect now:**

| Constraint                                                                                                                                                                                          | Why engines need it                                                                                                 | Questions it touches |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **One ingestion path for entity changes.** Every source (a lookup result, a command result, a push) changes entities through the same operation: upsert or delete by key, with an optional version. | An engine adapter then only has to produce those changes.                                                           | B1, B2, C4, E1, E2   |
| **An answer has a source that maintains it.** A REST answer is maintained by refetching; an engine answer is maintained live by pushes. Membership is the source's job either way.                  | Engine result sets update without a refetch; treating every answer as request-and-refetch would shut them out.      | B, C5, C6, C8, E     |
| **Keys are records of primitive fields.**                                                                                                                                                           | They must match a table's primary key and the engine's key format.                                                  | A6                   |
| **Versions are opaque and comparable, supplied by the source.**                                                                                                                                     | Engines order changes with their own versions (log positions, transaction ids, row versions), not only `updatedAt`. | A5, B3               |
| **Updates from reads propagate to every answer mentioning the entity.**                                                                                                                             | Engines push entity values constantly; without propagation, answers would disagree.                                 | B1, B2               |
| **A patch can be confirmed by its source, not only by the response.** Flow's `attempt.id` reaches the server and can be echoed back.                                                                | Engines confirm writes by echoing an id through the feed.                                                           | C3, C10              |
| **Optimistic patches are optional per command.**                                                                                                                                                    | Engines with their own client store run their own optimistic layer.                                                 | C1, C2               |
| **Persistence can belong to the source.**                                                                                                                                                           | Engines persist their own data for offline use.                                                                     | F1                   |

**Deferred until an engine adapter is designed:** the adapter interface, subset or coverage
protocols, resuming after reconnect, offline queues of writes, and engines' own query languages.

## Open questions

### A. What an entity is

- **A1. Declaration.** A separate descriptor (`entity(Ticket, { key })`), a Schema annotation
  (`Ticket.pipe(Entity.key(…))`), or a field on the Schema itself? Which one lets the runtime find
  entities inside arbitrary result Schemas most reliably?
- **A2. Identity.** Is an entity identified by its Schema object, by an explicit `id` string, or
  both? What happens when two Schemas describe the same entity?
- **A3. Shapes.** A list returns `TicketSummary` (no description) and the detail returns `Ticket`.
  Are they one entity with several shapes (`TicketEntity.shape(TicketSummary)`)? Does a patch or a
  result apply only to the fields a shape has?
- **A4. Nested entities.** A ticket embeds `assignee: User`. Are nested entities found recursively,
  so renaming a user updates every ticket that embeds them?
- **A5. Version.** Should an entity declare a server version (`updatedAt`, an ETag) so newer and
  older copies can be told apart? Required, optional, or absent?
- **A6. Keys.** Tuple, record, or string? How do keys follow Resources.O1's canonical key grammar?
- **A7. Registration.** Does the app list its entities, or are they discovered from the Schemas of
  its operations? Does the closed-universe rule (the app lists machines) extend to entities?

### B. How answers and entities relate (core semantics)

- **B1. Storage.** Copies must stay in step (see "Already constrained"). Does the runtime store one
  copy that answers point at (normalized internally), or keep a copy per answer and update them
  together? Which is simpler to fence, persist and checkpoint?
- **B2. Propagation of reads.** Fresher copies reach every answer (constrained). Open: what counts as
  fresher (B3), and does a read propagate fields its shape lacks (A3)?
- **B3. Ordering.** A list refetch starts, a save completes with the new title, then the old list
  response arrives. What stops it overwriting the saved title, in that answer and in others? Fetch
  start order, entity versions, or "a transaction result wins over any read that started before it"?
- **B4. Result propagation.** A transaction result is written into every answer mentioning the
  entity. Is it projected to each answer's shape (A3)? What if an answer's shape has fields the
  result lacks?
- **B5. Partial matches.** A search hit contains `{ ticket, highlight }`. Does the fan-out update only
  `ticket` and leave `highlight`? Is this automatic from the Schema?
- **B6. Equality and identity.** Fan-out produces new answer objects. Which parts keep their identity
  so `useView` equality holds?

### C. Writes

- **C1. Where optimistic patches live.** On the transaction descriptor (the change is a property of
  the command) or at the machine's commit call (decision 6)? Can both exist?
- **C2. Patch semantics.** Is a patch replayed as a function over the current copy, or recorded as a
  resulting value? What happens to a later patch when an earlier one fails? (Replay was the answer
  in the set-aside client-database design; TanStack DB records values and keeps the failed one's effect.)
- **C3. Ending a patch.** On success (result written in the same publication), failure, defect,
  cancel before and after sending, `unknown`. Does a defect count as `unknown`? Does a refetch end an
  `unknown` patch, and only if it started after the command was sent?
- **C4. What a command affects.** Inferred from its `result` Schema, declared from its input (a delete
  returns nothing), or both? How does a bulk command declare many keys?
- **C5. Refetch selection (guarantee 2).** Which answers refetch after a change: every active answer
  whose result can contain the type, those narrowed by a resource predicate, or a list the command
  declares? Results with no entity inside (counts, totals) declare a dependency how? Inactive answers
  marked stale? Immediately, or after the result is written?
- **C6. Creates.** A new ticket is in no answer. Does it appear optimistically anywhere? Options: not
  until a refetch; a resource-level `places: (input, ticket) => "start" | "end" | undefined`; or an
  explicit optimistic insert into named answers.
- **C7. Deletes.** Removed from every answer that mentions it. What does a single-entity answer
  (`ticketById`) show: a `Failure` with a not-found error, or something else? How does a server-side
  delete reach the client (a not-found error on refetch, a push)?
- **C8. Membership predicate.** Is one predicate per resource (`keeps` / `about`) both the refetch
  filter for guarantee 2 and the tool for instant removal? Does it apply to patches, results and read
  propagation alike? What if a resource cannot state one?
- **C9. Concurrency.** Two commands on the same entity: per-entity ordering, the transaction's
  `concurrency`, or both?
- **C10. Status.** How does a view know an entity is unconfirmed (8a's `pending`)? Per entity
  (`TicketEntity.unconfirmed(s, key)`), per answer, or both?

### D. Definitions and machines

- **D1. Memory.** Should machine memory hold entity keys, never entity copies (except drafts)? Can
  `flow check` enforce it by seeing an entity Schema in memory (sharpening the mirror lint)?
- **D2. Input and refs.** Actor input and `actorRef` ids keyed by entity key (`editorRef(ticketKey)`):
  does the entity provide a key Schema for this (`TicketEntity.Key`)?
- **D3. Events.** Events that carry an entity (`Saved { ticket }`) are snapshots in time. Is that
  fine, or should events carry keys and machines read the current copy?
- **D4. Reading by key.** Besides lanes, should a machine or view read an entity by key across all
  answers (`TicketEntity.get(s, key)`), for example to seed a detail screen from the list row? Does
  that read retain anything or start loading?
- **D5. Drafts.** The draft-versus-canonical pattern (seed from a `value` outcome, guard against
  overwriting a dirty draft) stays. Does the entity add anything, such as detecting that the
  canonical copy changed under a dirty draft?
- **D6. Guards and `check`.** Guards read lanes today. Do they need entity reads (D4)?
- **D7. Definition fields.** Does a definition list entities next to `operations`, or do operations
  imply them?
- **D8. Context.** Can a provider expose entities through context, or only keys?

### E. Streams, sync and pushes

- **E1.** Is a server push "an entity changed" (fan-out plus refetch), "an entity's new value"
  (fan-out only), or both?
- **E2.** How does a stream declare that it carries entity changes, and how are deletes and resets
  expressed?
- **E3.** Hosting sync engines stays open (see "Sync engines: keep the door open"). What is the
  smallest push mechanism for version 1 that already uses the single ingestion path, so an engine
  adapter can later reuse it?

### F. Persistence, lifetime, Stories, tools

- **F1. Persistence.** Answers persist as today. Do pending patches persist with their input so
  restore can replay them?
- **F2. Lifetime.** Answers keep `gcTime`. Does the entity index need any lifetime of its own (B1)?
- **F3. Stories.** Fixtures and responses stay. What new steps are needed: a server push, asserting an
  entity across all answers, observing fan-out and refetch?
- **F4. Checkpoints.** Do checkpoints need the entity index, or only answers?
- **F5. `flow graph`.** Edges entity ↔ resources (mentions) and entity ↔ transactions (changes), from
  Schemas. Is that enough to answer "which screens can this command change"?
- **F6. `flow check`.** Candidate rules: a result Schema contains an entity but the resource or
  transaction declares no `result`; a transaction changes an entity no answer mentions; memory holds
  an entity copy; an entity Schema appears with no key.

### G. Mental model and naming

- **G1. Words.** "Answer" for a resource entry, "entity" for identity-carrying data, "command" for a
  transaction: do we rename anything (`resource`, `transaction`), or only describe them this way?
- **G2. The rules agents follow.** Can the model be taught in three rules? A first attempt: declare
  entities once; give every read and write a `result`; put optimistic changes on the command.
- **G3. Boundaries.** What stays in the request-cache world unchanged (`key`, `staleTime`, `gcTime`,
  `refetch`, `placeholder`), and what is deleted (`setData`, `invalidate`, decision 6's `writes`)?

### H. Effect on agreed decisions

- **H1.** Decision 6: call-site `optimistic` and `writes` (see C1).
- **H2.** Decision 8: transactions are not read by views; does entity status (C10) change that?
- **H3.** 8a: the lane `pending` flag (see C10).
- **H4.** D46: result Schemas become required for any resource or transaction that carries entities.
  Is that acceptable, given D46 limited Schemas to boundary data?
- **H5.** Resources.O4 and Transactions.O3 (fencing per entry and per actor) versus fan-out across
  answers (B3).

## Prior art to check

- **RTK Query tags** (`providesTags`, `invalidatesTags`): coordination by refetch, no normalization.
- **Apollo and Relay normalized caches**: automatic entity coherence; list updates after creates and
  deletes stay manual; type policies and merge functions show where normalization gets complex.
- **TanStack Query** `setQueriesData` patterns: optimistic fan-out written by hand.
