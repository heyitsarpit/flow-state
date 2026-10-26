# Entity knowledge store (draft 2): a ground-up proposal

Status: a proposal, not decided. It restarts the entity work from a clarified mental model after a
survey of existing systems (section 2). It follows the operation-first direction of
`entity-proposal.md` and the single owner per domain of `entity-coordinator.md`, and is measured
against `entities.md` (goals G1–G9, correctness C1–C8). Draft 2 revises draft 1 after six
reviews; section 14 records what changed. Code is illustrative; names are placeholders.

**The runtime is inherited.** Ordering by version and request start, contested and held fields,
tombstones, the in-flight fence, holding and garbage collection, persistence of confirmed data and
per-record write ordering are `entity-proposal.md` section 6, unchanged. This document defines what
the knowledge store adds on top: answers with explicit knowledge, constraints as data, and how
membership and staleness follow from them. Section 9 maps each inherited rule to its place.

---

## 1. The mental model: a knowledge store

The entity system is a **self-maintaining store of what the client knows about server data**. It
is built as a separate component with its own interface (section 10). Flow State binds its
operations to it; nothing in it depends on machines or React.

It holds three kinds of knowledge:

| Kind            | Example                                                | Asserted by        | Changes by                              |
| --------------- | ------------------------------------------------------ | ------------------ | --------------------------------------- |
| **records**     | note 42 has title "Lobby"                              | any server response | per-field merge, ordered by version, then request start |
| **answers**     | for `{ folderId: f1 }` the notes are [42, 7], total 2  | the server only    | replaced by a newer server answer        |
| **predictions** | note 42 will have title "Foyer" if this save succeeds | the client         | added when a write starts, ended by its outcome |

Two rules hold it together:

1. **Growing knowledge is safe; shrinking claims belong to the server.** Learning a field, a member
   or a newer value can be merged in any order. That a record is gone, that a list is complete, that
   a total is right, or that a record is *not* in a list are claims only a server answer makes. The
   client may predict them; it never asserts them.
2. **Every value says what it is.** A record field is confirmed or predicted. An answer is complete
   or partial, and fresh or stale. Views and guards can always ask.

Against its neighbours:

- **A request cache** (TanStack Query) holds answers as opaque blobs, so copies disagree.
- **A client database** (TanStack DB, TinyBase) computes answers locally from records, so a local
  result can look authoritative when the client holds only part of the data.
- **A knowledge store** keeps records and the server's answers side by side, and says per answer
  whether it is complete and fresh.

Derived values (local counts, indexes) are not part of version 1 (section 13).

---

## 2. What existing systems teach

| System | What it does well | What it gets wrong for us | Source |
| --- | --- | --- | --- |
| **Normy** | normalises any response by id beside an existing cache; mutation results propagate automatically | list changes need magic `__append` hints in server payloads; no ordering metadata | [normy](https://github.com/klis87/normy) |
| **Data Client** | `Collection` keyed by request arguments; records routed by matching their fields, minus `nonFilterArgumentKeys`; `move` removes by old values and adds by new; `fetchedAt` ordering | a full denormalising store per endpoint; membership by client rule without completeness | [Collection](https://dataclient.io/rest/api/Collection) |
| **Relay** | declared list changes (`@appendEdge`, `@deleteEdge`); optimistic updates rebased: revert, apply server change, reapply | filtered connections must each be targeted by hand | [connections](https://relay.dev/docs/guided-tour/list-data/updating-connections/) |
| **Apollo** | `keyFields`, optimistic layers, `dataState: "partial"` | lists never update after create or delete without `cache.modify` | [cache interaction](https://www.apollographql.com/docs/react/caching/cache-interaction) |
| **urql Graphcache** | layers ordered by **request** time, not arrival; `inspectFields` finds every cached variant of a list | imperative `updates` invite dedupe and null bugs | [normalized caching](https://github.com/urql-graphql/urql/blob/main/docs/graphcache/normalized-caching.md) |
| **Zero** | every result has `type: "unknown" \| "cached" \| "complete" \| "error"`; "show 'not found' only when complete" | complete only after a server answer, by design | [reading data](https://zero.rocicorp.dev/docs/reading-data) |
| **Electric** | `up-to-date` marks a shape complete as of a server point; writes confirmed by txid | requires its own server | [HTTP API](https://electric.ax/docs/api/http) |
| **Replicache** | per-client mutation ids; confirmation by `lastMutationID`; rebase on a hidden branch | owns the whole sync protocol | [how it works](https://doc.replicache.dev/concepts/how-it-works) |
| **TanStack DB** | optimistic layer separate from synced data; query-driven loading | readiness per collection, not per result; local queries over partial data | [mutations](https://tanstack.com/db/latest/docs/guides/mutations) |
| **TinyBase** | small store with separate modules for relationships, indexes and metrics, declared as data | "not loaded" and "empty" are indistinguishable | [relationships](https://tinybase.org/guides/using-relationships/an-intro-to-relationships/) |
| **tldraw store** | incremental derivations with a full-recompute fallback; writes tagged by source | assumes the whole dataset is resident | [incremental](https://signia.tldraw.dev/docs/incremental) |

**The gap none of them fills:** among standalone stores, none can say "this list is incomplete".
Zero and Electric can, by owning the server. A knowledge store carries completeness itself, per
answer, from the server's own responses.

---

## 3. Principles

1. **Separate asserted facts from computed ones** (incremental view maintenance). Records and
   answers are asserted. Membership seen on screen is computed from them each time.
2. **Merge, never overwrite blindly** (propagators, CRDTs). A field is replaced only by a write
   shown to be newer: a higher server version, or a later-started request (Graphcache).
3. **Shrinking claims are the server's** (CALM). Deletion, completeness, totals and "not a member"
   come from server answers.
4. **Predictions are a retractable layer with a cause** (truth maintenance, Relay, Replicache).
5. **Answers are server assertions, addressed by their input** (Data Client, Relay).
6. **Predicted entry needs an exact description** (Data Client, lenses). A record may appear in an
   answer before the server says so only when the answer's membership is fully described by its
   declared constraints, and the answer is complete.
7. **Knowledge status is typed** (Zero, Apollo). Empty states and totals are final only from a
   complete, fresh answer.
8. **Fail in the safe direction** (`entities.md`, G7). A forgotten declaration costs a refetch,
   never a stale screen. Declarations narrow what *cannot* matter; they never list what can.
9. **Edit sources, never views** (lenses). Writes predict record fields; membership follows.
10. **Every change carries its source** (tldraw). Responses, pushes, predictions and restores are
    tagged, so traces and repair can tell them apart.

---

## 4. Entities

As in `entity-proposal.md` section 2: `entity({ id, fields, primaryKey, version })`; picks that
carry identity; nested picks for coherence; keys that never change; `primaryKey: []` for
singletons. A field means one thing: an excerpt of `body` is a separate `bodyPreview`.

---

## 5. Answers

An answer binds a resource to the store. Which entities it **holds**, and where, is read from the
picks in its result Schema; nothing restates it. What the answer declares is **which records its
value depends on**, per entity, as data.

```ts
export const notesInFolder = answer(notesInFolderResource, {
  where: { Note: { folderId: input("folderId") } },
  serverFilters: { Note: { archived: false } },   // what the server excludes without being asked
  inputs: { folderId: "where", cursor: "page", limit: "page", dir: "display" },
  ignoreChanges: { Note: ["title", "body", "author"] },
});

export const searchNotes = answer(searchNotesResource, {
  where: { Note: { workspaceId: input("workspaceId") } },
  inputs: { workspaceId: "where", q: "opaque" },  // the server searches; the client cannot
});

export const pinnedCount = answer(pinnedCountResource, {
  where: { Note: { pinned: true } },              // holds no notes; depends on them
});

export const weekEvents = answer(weekEventsResource, {
  where: { Event: { calendarId: input("calendarId"),
                    startsAt: range(input("from"), input("to")) } },
  inputs: { calendarId: "where", from: "where", to: "where" },
});

export const threadsWithLabel = answer(threadsResource, {
  where: { Thread: { labelIds: contains(input("labelId")) } },
  inputs: { labelId: "where", cursor: "page" },
});

export const noteById = answer(noteByIdResource, {
  where: { Note: { noteId: input("noteId") } },   // the full primary key: this is the loader
  inputs: { noteId: "where" },
});
```

### 5.1 Constraints are data

`where` maps each entity the answer depends on to constraints on that entity's fields. Each value
is one of:

| Constraint                      | Meaning                                                  |
| ------------------------------- | -------------------------------------------------------- |
| a constant (`true`, `"open"`)   | the field equals it                                      |
| `input("key")`                  | the field equals that input                              |
| `oneOf(input("key"))`           | the field is one of an array input                       |
| `contains(input("key"))`        | an array field contains the input                        |
| `range(input("from"), input("to"))` | the field lies in the range (half-open)              |
| `principal()`                   | the field equals the signed-in principal's key           |

Nested paths are written as nested objects (`{ assignee: { userId: principal() } }`). There are no
closures: `flow graph`, `flow explain` and the self-check read the constraints as data.

- **Self-check, on every response in every environment** (`WhereViolated`): every held record must
  satisfy the answer's `where` and `serverFilters`, tested on the response's own values.
- An answer with **no `where` entry for an entity it holds** depends on every change to that
  entity: the safe default. A `where` entry is a narrowing.
- `serverFilters` names what the server excludes implicitly (archived, soft-deleted, hidden). They
  are part of `where` for every purpose; listing them makes an answer exact (5.2) when it otherwise
  would not be.

### 5.2 Every input key has a role

`inputs` gives every input key one role, and a key without a role is a type error:

| Role        | Meaning                                                                  |
| ----------- | ------------------------------------------------------------------------ |
| `"where"`   | used by a `where` constraint                                             |
| `"page"`    | selects a page (cursor, offset, limit); the answer is paged              |
| `"display"` | changes presentation, never membership (sort direction)                  |
| `"opaque"`  | affects membership in a way the client cannot evaluate (search text, a server-side ranking choice) |

**An answer is exact** when it has no `"opaque"` input and every `"where"` input is used by a
constraint. This is computed from the declaration (the type spike shows it as a literal type); it
is not a flag the author sets. `searchNotes` is not exact, because of `q`. An exact answer is
still only as good as its `serverFilters`: a hidden server filter that is not declared is caught by
the generated convergence test, not by the self-check (section 11).

### 5.3 What makes an answer stale: the safe direction

A change to a record of entity `E` affects an answer that depends on `E` when:

1. the record's value just before or just after the change satisfies the answer's `where` for `E`
   (an unknown field counts as satisfying it); and
2. at least one changed field is **not** in the answer's `ignoreChanges` for `E`, or the change
   makes the record enter or leave the answer.

`ignoreChanges` lists fields whose change cannot alter the answer beyond what coherence already
shows: displayed fields the server neither filters, sorts, groups nor searches on. **Omitted means
nothing is ignored**, so a forgotten field costs a refetch. A non-exact answer can still ignore
displayed fields; it cannot ignore a field its opaque input might use, and the self-check cannot
tell, so the generated test is the net.

Context values (`total`, highlights, ranks) belong to the answer and are refreshed with it; they
need no declaration.

### 5.4 The loader

An answer whose `where` constrains the full primary key by equality to inputs is the entity's
**loader**. This is visible in the declaration, so no separate `load` exists. At most one loader
per entity (`flow check`). Loader subscriptions read the store first and accept `shape`, as in
`entity-proposal.md` section 3.1.

---

## 6. Knowledge status

Every answer's lane carries the existing status (Pending, Refreshing, Failure) plus two flags:

- **`complete`** — the server answered this input this session, and the answer is not paged or its
  last loaded page has no `next`. A paged answer with a `next` is not complete. An answer restored
  from persistence is not complete until refetched.
- **`stale`** — a change has affected it since its data was fetched (section 7.2).

```ts
type AnswerLane<T> =
  | { status: "Pending" }
  | { status: "Success" | "Refreshing"; data: T; complete: boolean; stale: boolean; pending: boolean }
  | { status: "Failure"; error: … };
```

Two view rules, enforced by types where possible:

- **"Empty" and "not found" render only from a lane that is `complete`, not `stale` and not
  `pending`.** The lane exposes `isEmpty` only in that case; reading `data.length === 0` outside a
  narrowed branch is a `flow check` warning.
- **Totals are final only under the same condition.** Otherwise a view shows them as provisional.

`pending` (8a) is true while a live prediction changes the answer's visible membership or any field
of a record it holds.

---

## 7. Membership and staleness

### 7.1 Visible membership is computed each time

An answer's visible members are computed from the server's last answer and the visible records:

1. **The server's members**, minus any whose **visible** value no longer satisfies `where` or
   `serverFilters` (they left), minus deleted records.
2. **Plus entrants**, only when the answer is exact and complete: records whose visible value now
   satisfies `where`, that the server's answer does not list, and whose change is still **live**: a
   prediction not yet settled, or a confirmed or pushed change the answer has not yet refetched
   since (7.2).

Because membership is recomputed from the visible records, a retracted prediction needs no special
undo, a late older answer cannot re-add a record whose visible fields have moved, and two layered
predictions compose. Leaving applies to every answer, exact or not: a record that fails a declared
constraint cannot belong. Entering applies only to exact, complete answers.

**Position of entrants.** An answer declares `entrants: "start" | "end" | "none"`, default
`"none"`: an entrant is not shown until the refetch lands. The client never sorts.

### 7.2 Staleness is a floor, not a flag

Each answer entry keeps a **stale floor**: the revision of the latest change that affected it. The
entry is stale while its data started before its floor, and only a response whose request started
at or after the floor clears it. A response that started earlier still writes fields, but the entry
stays stale and is refetched again (the in-flight fence).

Floors are raised by:

| Cause                                      | Raises the floor of                                         |
| ------------------------------------------ | ----------------------------------------------------------- |
| a write settling (success, failure, uncertain) | every answer affected by its changes (5.3), and by its `affects` |
| a push                                     | every answer affected by the pushed change                  |
| a response revealing a newer base value    | every **other** answer affected by that change              |
| a feed's first connect or a reconnect      | every answer depending on the fed entities                  |
| a restore from persistence                 | every restored answer                                       |
| `invalidate(Note.all)` from a machine      | every answer depending on `Note`                            |

**No cascades.** A response that changes no base value raises nothing, so a refetch triggered by a
change returns data that matches, and the process ends. Each floor raise records its cause; every
refetch has a traceable cause (C3, C8).

### 7.3 How a write ends

| Ending                  | Record fields                                           | Membership and staleness                          |
| ----------------------- | ------------------------------------------------------- | ------------------------------------------------- |
| starts                  | predictions applied as overlays (decision 6)            | visible membership recomputed (7.1)               |
| success                 | response fields promoted; predicted fields it omits stay **held** until a later read covers them | affected answers' floors raised; entrants stay live until those refetches land |
| failure or defect       | overlays removed                                        | affected answers' floors raised (the server may disagree) |
| rejected before sending | overlays removed                                        | nothing raised                                    |
| uncertain               | overlays kept, marked                                   | **forced repair**: the record's loader and every answer holding it refetch; the overlay ends when a read that started after the settle covers the record; with none possible, it stays and stays `pending` |

What a write affects is computed from the **actual** change: the difference between the record's
base before and after, plus the predicted fields, plus `affects`.

---

## 8. Changes and writes

```ts
export const renameNote = change(renameNoteTransaction, {
  optimistic: (input) => [Note.patch(input.key, () => ({ title: input.title }))],
});

export const moveNote = change(moveNoteTransaction, {
  optimistic: (input) => [Note.patch(input.key, () => ({ folderId: input.to.folderId }))],
});

export const likePost = change(likePostTransaction, {
  optimistic: (input) => [
    Post.patch(input.key, (p) => ({ liked: true, likeCount: p.likeCount + 1 })),
  ],
});

export const transfer = change(transferTransaction, {
  optimistic: (input) => [
    Account.patch(input.from, (a) => ({ balance: a.balance - input.amount })),
    Account.patch(input.to, (a) => ({ balance: a.balance + input.amount })),
  ],
  affects: () => [Txn.all], // the server creates transaction rows the response does not carry
});
```

- **`optimistic`** is `entity-proposal.md` section 5.1's form, kept: a function of the input that
  returns a fixed list of `patch`, `upsert`, `remove` and `insert` on the records the change acts
  on, recorded at construction by a probe (the declared O1 exception). A patch may compute from
  its own record (`likeCount + 1`).
- **Records in the response** are found from the picks in the transaction's result Schema; nothing
  restates them.
- **`affects`** names what the response does not carry: other entities' records or all of a type.
- **Membership is never predicted by hand.** Moving a note predicts `folderId`; section 7.1 then
  removes it from `{ folderId: f1 }` and, for an exact, complete `{ folderId: f2 }` with
  `entrants` set, shows it there.
- A bound transaction rejects decision 6's call-site `optimistic` and `writes` (D1).

**Feeds.** `feed(stream, [Note, Folder])` marks a stream of `EntityChange` upserts, deletes and
confirmations. A push is a base change: it updates fields, raises affected floors (7.2), and its
record's visible membership follows 7.1. It never creates a prediction.

---

## 9. What is inherited, and where

| Inherited rule (`entity-proposal.md` section 6) | Role here                                                |
| ----------------------------------------------- | -------------------------------------------------------- |
| per-field ordering by version, then request start | how records merge (principle 2)                        |
| contested fields                                | a contested record gets a forced repair (7.3)            |
| held fields                                     | a predicted field a success response omits (7.3)         |
| `FieldDisagrees`, `ContestLoop`                 | diagnostics for sources that keep flipping a field       |
| tombstones; `notFound` never deletes a record being created | deletes (7.1 drops deleted records)         |
| the in-flight fence                             | the stale floor (7.2)                                    |
| one stale floor per entity                      | reconnects, restores and `invalidate` raise floors (7.2) |
| holding and garbage collection                  | answers and loader subscriptions hold records; `gcTime` releases them |
| persistence of confirmed data only              | restored answers are not complete and are stale (6, 7.2) |
| per-record write ordering across actors         | the domain's `order: "perRecord"` (`entity-coordinator.md`) |

---

## 10. The component and its host

The store is built as a component with a documented interface that Flow State's Runtime uses. The
interface is **internal in version 1**: agents never write it, and publishing it for other hosts
waits until the Flow State binding is proven.

| Interface                                   | What it guarantees                                         |
| ------------------------------------------- | ---------------------------------------------------------- |
| `begin(answer, input)` → token              | fixes the request's start revision before it is sent        |
| `ingest(token, response)`                   | the only way a response enters; merges records, replaces the answer, sets `complete` from the declared pages |
| `startChange(attemptId, change, input)`     | applies predictions; the cause is the Runtime's `attempt.id` (decision 6) |
| `settle(attemptId, ending, response?)`      | ends a change by section 7.3                               |
| `push(feed, batch)`                         | ingests pushed changes                                     |
| `stale()` → entries with floors and causes  | what to refetch; the host refetches active ones and coalesces per drain |
| `transact(fn)`                              | one Runtime turn is one publication                        |
| `snapshot()`                                | an immutable, serialisable revision for lanes, `Note.get` and checkpoints |
| `export()`, `restore(data)`                 | persistence of confirmed data                               |
| `onTrace(sink)`                             | every ingest, prediction, settle, floor raise and suppressed repair, with its source |

The clock, seeded ids and the trace sink come from the host, so Stories stay deterministic.

---

## 11. Flow State binding

| Flow State part | Binding                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| operations      | `answer(resource, …)`, `change(transaction, …)`, `feed(stream, …)` registered in a **domain**, which owns its API services (`entity-coordinator.md`); unbound operations are unchanged |
| machines        | unchanged: activities subscribe, actions commit; `O.Notes.inFolder` through the domain group |
| lanes           | `complete`, `stale`, `pending`; `Note.get(s, key, shape)` for records       |
| Stories         | fixtures on the Runtime clock; checkpoints carry the store snapshot; the generated convergence test per domain |
| the CLI         | `flow explain` prints, from `where`, `ignoreChanges`, `inputs` and `affects`, which changes affect which answers and which answers are exact |
| inspection      | the store's trace reaches `attachInspector`                                 |

**Registration** is the domain only. The type system checks every operation handed to a domain or a
definition; an operation that requires a domain's API service but is never registered anywhere is
a `flow check` error, not a type error (the spike showed the compiler cannot see unregistered
values).

---

## 12. The notes app

```ts
export const NotesDomain = domain({
  id: "notes",
  entities: [Note, Folder],
  owns: [NotesApi],
  answers: {
    byId: answer(noteByIdResource, {
      where: { Note: { noteId: input("noteId") } }, inputs: { noteId: "where" },
    }),
    inFolder: answer(notesInFolderResource, {
      where: { Note: { folderId: input("folderId") } },
      serverFilters: { Note: { archived: false } },
      inputs: { folderId: "where", dir: "display" },
      ignoreChanges: { Note: ["title", "body", "author"] },
      entrants: "start",
    }),
    pinnedCount: answer(pinnedCountResource, { where: { Note: { pinned: true } } }),
    search: answer(searchNotesResource, {
      where: { Note: { workspaceId: input("workspaceId") } },
      inputs: { workspaceId: "where", q: "opaque" },
    }),
  },
  changes: { rename: renameNote, move: moveNote, archive: archiveNote },
  feeds: { changes: feed(noteChanges, [Note]) },
});
```

| Event                               | What happens                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| rename starts                       | the title overlay shows wherever note 42 is held; `pending`                   |
| rename succeeds                     | fields promoted; `inFolder` ignores `title`; `pinnedCount` is raised only if 42 is pinned; `search` is raised (it ignores nothing) and refetches |
| move starts                         | `folderId` overlay; 42 leaves `inFolder{f1}` (fails `where`); enters `inFolder{f2}` at the start (exact, complete, `entrants: "start"`); `search` keeps it (its `where` still holds) |
| move succeeds                       | `inFolder{f1}`, `inFolder{f2}` and `search` raised; 42 stays an entrant in f2 until f2's refetch lands |
| move fails                          | overlay removed; 42 is back in f1 and gone from f2, by 7.1; floors raised; the refetches confirm |
| archive succeeds                    | 42 leaves every `inFolder` (fails `serverFilters`); floors raised            |
| another user moves 42; the editor's refetch reveals `folderId: f2` | `inFolder{f1}` and `inFolder{f2}` raised by the revealed change; 42 leaves f1 at once |
| a folder list opened from scratch   | `Pending`; never "no notes" until `complete`                                  |
| page 1 of 5 loaded                  | not complete; no entrants; the total is shown as provisional                  |
| the socket reconnects after a gap   | every answer depending on `Note` raised; active ones refetch                  |
| a save is uncertain                 | overlay kept; forced repair refetches `byId` and the lists holding 42         |

---

## 13. Correctness against `entities.md`

| Property             | How it holds                                                                    |
| -------------------- | ------------------------------------------------------------------------------- |
| C1 coherence         | one record per key; answers hold references                                     |
| C2 convergence       | every change that can affect an answer raises its floor (7.2); only a response started after the floor clears it |
| C3 no cascades       | a response that changes no base value raises nothing                            |
| C4 monotonic truth   | inherited per-field ordering                                                    |
| C5 honest prediction | overlays with causes; entrants only into exact, complete answers and only while their cause is live; `pending` |
| C6 no silent loss    | a record leaves an answer only by the server's answer, a delete, or failing a declared constraint |
| C7 determinism       | revisions, the Runtime clock, seeded ids, host-supplied trace                   |
| C8 explainability    | every floor raise and prediction has one recorded cause                         |

**What catches a wrong declaration:**

| Wrong declaration                                      | Caught by                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| a `where` the server contradicts                       | `WhereViolated` on every response                            |
| an input key without a role, or a misnamed field       | the type system                                              |
| a filter input declared `"display"`                    | the generated convergence test                               |
| a hidden server filter not in `serverFilters`          | the generated convergence test                               |
| `ignoreChanges` names a field the server sorts or filters by | the generated convergence test                          |
| a missing `affects`                                    | the generated convergence test; the repair audit             |
| an operation on a domain's API service, unregistered   | `flow check`                                                 |
| an empty state from a partial or stale answer          | `isEmpty` exists only on a complete, fresh lane; `flow check` warns on `length === 0` |

Every remaining silent case fails only in the generated test. Answers that receive entrants must be
covered by it (`flow check` warns otherwise).

**Later, not version 1:** derived counts and indexes over known records (exact only over complete,
fresh, prediction-free answers); a bounding-box constraint (a map viewport is two `range`s in
version 1); predicted position from a declared sort; a public standalone API.

---

## 14. Review record

Six reviews of draft 1: correctness, simplicity, agent authoring, generality, consistency and
tooling, and a TypeScript spike. Findings were checked against the text; the spike was re-run (the
positive cases compile; 34 deliberate mistakes are rejected with local errors).

**Accepted and applied:**

| Finding                                                                        | Change                                       |
| ------------------------------------------------------------------------------ | -------------------------------------------- |
| staleness listed what *can* matter (`ordering`, `context`), so forgetting was silent; non-exact answers were never marked stale | the safe direction: `ignoreChanges`, 5.3 |
| `presentation` was author-declared, so a search could be declared exact         | every input key has a role; exactness computed, 5.2 |
| the stale flag had no clearing rule; the in-flight fence was lost               | a stale floor per answer, 7.2               |
| responses revealing newer values marked nothing stale                           | they raise other answers' floors, 7.2       |
| reconnects and restores had no staleness path                                  | they raise floors, 7.2                      |
| an uncertain overlay could never end                                           | forced repair, 7.3                           |
| membership predictions were events; a late answer could re-add a moved record; layered retraction broke | membership computed from visible records, 7.1 |
| pushes predicted membership with no cause                                      | a push is a base change, 8                   |
| paged answers were exact by default                                            | `"page"` role; paged answers are not complete, 5.2 and 6 |
| hidden server filters broke exactness                                          | `serverFilters`, 5.1; the generated test, 13 |
| who sets `complete` was unspecified                                            | derived from the declared pages, 6 and 10    |
| empty and totals ignored staleness and predictions                             | 6                                            |
| equality-only constraints failed labels, calendars and maps                    | `oneOf`, `contains`, `range`, `principal`, nested paths, 5.1 |
| one constraint set per answer could not describe several entity types          | `where` keyed by entity, 5                   |
| recordless dependencies only through `counts`                                  | a `where` entry for an entity the answer does not hold, 5 |
| `affects`, function patches, pages, held fields were dropped                   | restored, 8 and 9                            |
| `holds`, `returns` restated the Schema                                         | removed: read from picks                     |
| `scope` and `filter` were one concept in two slots                             | `where`                                      |
| `load` was undefined and separable                                             | the loader is a `where` on the full key, 5.4 |
| four knowledge statuses overlapped the lane status                             | `complete` and `stale` on the existing lane, 6 |
| derivations were wrong in several cases and added a module                      | moved to later, 13                           |
| the host API was a second surface and missed revisions, batching, persistence and trace | internal in version 1, completed, 10 |
| "kept unchanged" claimed rules the draft did not define                         | inherited explicitly, section 9             |
| `write`, `predicts`, `uncertain` renamed agreed vocabulary                     | `change`, `optimistic`, decision 6's outcomes |
| registration in three places                                                   | the domain only, 11                          |
| registration was claimed to be a type check                                    | type check for registered values; `flow check` for the rest, 11 |

**Rejected, with reasons:**

- **Simplicity: make `ordering` a required list.** Required lists still fail stale when a field is
  forgotten; the safe direction (`ignoreChanges`) fails as a refetch.
- **Agent UX: make `optimistic` pure data.** The spike showed the function form is the one that
  types; the construction probe keeps it static, as in `entity-proposal.md`.
- **Consistency: a separate `implicitPredicates` concept.** Covered by `serverFilters`, which is
  part of `where`.
