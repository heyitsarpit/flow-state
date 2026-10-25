# Entity-centric proposal (draft 6)

Status: a proposal, not decided. It is the alternative to `entity-proposal.md` (draft 3), rebuilt
from the ground up. Draft 4 grew a query grammar for filtered admin lists (`one`/`many`/`count`,
`by` modes, `sortedBy`, `groupBy`, `page`, `context`); draft 5 replaced it with two general facts
per query. Draft 6 revises draft 5 after six reviews (correctness, simplicity, agent authoring,
generality, consistency and tooling, and a TypeScript spike). Section 17 records what each review
changed and what was rejected.

It builds on `minimal-library.md` decisions 1–8a, which are agreed. It reuses the runtime of
`entity-proposal.md` draft 3 where section 6 says so. Section 13 lists every change to agreed
decisions and to the base layer.

---

## 1. The idea

> **An entity is a record type the server owns. Next to it lives everything that involves it: how
> to load one record, the questions the server answers about it, the commands that change it, and
> the feeds that push it. Machines work with entities directly. Anything that involves no entity
> stays in the base layer: plain `resource`, `transaction` and `stream`.**

Two layers share one Runtime:

| Layer      | What it is                                                     | Used for                                   |
| ---------- | -------------------------------------------------------------- | ------------------------------------------ |
| **Base**   | `resource`, `transaction`, `stream` as in decisions 1–8a       | anything that involves no entity           |
| **Entity** | an `entity` and its `members`: `load`, `read`, `write`         | every read or write of an entity's records |

**The boundary.** An operation **involves** an entity when it writes, hides or depends on that
entity's records in the store: its `result` contains the entity or a pick of it, its optimistic
operations name it, or its `depends` or `affects` name it. Such an operation lives on the entity's
members; a base operation that involves an entity is a `flow check` error.

**When to declare an entity.** A record has a stable key, and it either appears in more than one
answer or is changed by a command and shown elsewhere. The current user is always an entity
(`User`), never a special singleton or a base result, so their avatar stays coherent wherever it is
embedded.

**What the runtime promises:**

1. **Entity coherence.** Every cached copy of a record shows the same fields in the same
   publication, whoever wrote them, including optimistic changes.
2. **Result validity.** When a change settles, every answer it could affect is repaired, including
   answers that do not contain the record yet. With a stable server and **correct declarations**,
   every answer ends up as the server would return it. The declarations that can be wrong are
   `when`, `ignoreChanges`, `place`, `depends` and `affects`; section 10.2 lists what catches each.

Machines read **local** data, which can include optimistic values the server has not returned.
Local observation and remote confirmation stay distinct. There is no local query language.

### 1.1 Ownership

| Concern                                           | Owner                                           |
| ------------------------------------------------- | ----------------------------------------------- |
| Which records belong in a list, search or count   | the server, through queries                     |
| A record's fields agreeing everywhere             | the runtime (the entity store)                  |
| Which changes can affect an answer                | the query (`when`, `ignoreChanges`, `depends`)  |
| What a command changes                            | the command (`result`, `optimistic`, `affects`) |
| Drafts, transitions, timing, what a failure means | machines                                        |
| Work that involves no entity                      | base operations driven by machines              |

### 1.2 Not a version 1 target

Offline-first operation. It needs a persisted operation queue, record-level persistence and
server-key creates with re-keying (section 14). Version 1 keeps the door open but does not claim
it.

---

## 2. Identity: `entity`

```ts
// notes/note.entity.ts
export const Note = entity({
  id: "notes/Note",
  fields: {
    noteId: Schema.String,
    folderId: Schema.String,
    title: Schema.String,
    body: Schema.String,
    pinned: Schema.Boolean,
    author: User.pick("name", "avatarUrl"), // a nested entity
    createdAt: Schema.String,
    updatedAt: Schema.String,
  },
  primaryKey: ["noteId"],
  version: "updatedAt", // optional
});

export const NoteRow = Note.pick("folderId", "title", "pinned", "createdAt");
```

- **`id`** is stable for traces, persistence and tools. Duplicates are a static error.
- **`fields`** is the full record, a Schema field record (D45). It is what `load` returns.
- **`primaryKey`** lists top-level primitive fields. (Not `key`: queries and commands already use
  `key` for their cache and concurrency keys.) Keys are records (D27): `Note.Key` is the Schema
  `{ noteId: string }`. Key fields are immutable: a patch cannot return them (a type error).
- **Choose a key that never changes.** Use ids, never paths, row indexes or a start time that a
  drag can move. A calendar occurrence is keyed by `(eventId, originalStart)`.
- **`Note.keyOf(value)`** extracts a key. **`Note.keyString(key)`** is canonical: the key fields in
  `primaryKey` order, each encoded as JSON, joined by `/`. It is used for `actorRef` ids.
- **`primaryKey: []`** declares a **singleton**: one record per Runtime (a cart, the settings). Its
  key is `{}` and its `keyString` is the empty string.
- **`version`** names one field the server changes on **every** update: a `Schema.String`
  (compared as a string, so ISO timestamps) or a `Schema.Number` (compared numerically). A write
  wins on a strictly greater version; an equal version falls through to the revision rule
  (section 6.3). `createdAt` is never a version.
- **`entity` declares identity only.** Its members are declared separately (section 2.4), so two
  entities can refer to each other without an import cycle.

### 2.1 Shapes

`Note.pick(...fields)` is a Schema with the key fields plus the chosen fields, carrying `Note`'s
identity. Every result that contains notes builds them from `Note` or its picks. Two forms lose the
identity and therefore coherence: a struct with all of `Note`'s key fields that is not a pick, and
a pick rebuilt by spreading its fields or annotating it. `flow check` errors on both; a deliberate
detached copy is written `Note.detached(NoteRow)`.

### 2.2 Nested entities

A field may hold another entity's pick, or an array or nullable of one. Renaming a user updates
every note that embeds them, in the same publication. Nesting is one way: a cycle between entity
identities is a static error.

- A nested **field change** is coherence only: it refetches nothing unless the parent's query
  declares `depends` on the nested entity.
- A nested **delete** forces repair of every answer holding a parent that embeds it (section 6.4).
  Until that refetch lands, the nested position keeps the record's last base values, so the
  parent's type holds.

A field holding only a key (`assigneeId: Schema.String`) is a plain field (section 7.4).

### 2.3 Where entities are found

Definitions list the entity members they use (section 7.1), and nested picks reach the rest. The
closed universe stays "the app lists machines".

### 2.4 Members: `Note.members`

```ts
// notes/notes.ts
export const Notes = Note.members({
  load: { … },                                                   // section 3
  read: {
    inFolder: Note.query({ … }),
    pinnedCount: Note.query({ … }),
    live: Note.feed({ … }),
  },
  write: {
    rename: Note.command({ … }),
    move: Note.command({ … }),
    remove: Note.command({ … }),
  },
});
```

- **`Note`** is the identity: keys, picks, patches, passive reads. **`Notes`** is the members hub
  that machines use: `O.Notes.inFolder.subscribe`, `O.Notes.rename.commit`, `O.Notes.watch`.
- **Members import identities only, never other members.** This is what makes cross-entity
  commands and queries type-check (the spike's TS7022 cycle disappears), and it avoids TDZ errors
  at runtime.
- **`read` holds queries and feeds; `write` holds commands.** The slot says the direction to the
  reader; the builder says the kind to the type system. A builder in the wrong slot is a type
  error.
- **Member names** are unique across `read` and `write`; `watch`, `refetch` and `invalidate` are
  reserved. Member ids are derived: `notes/Note.inFolder`.

---

## 3. `load`: one record by key

```ts
load: {
  lookup: (key, { signal }) => NotesApi.use((api) => api.get(key, signal)),
  notFound: ["NoteNotFound"],
  staleTime: "30 seconds",
  gcTime: "5 minutes",
  persist: true,
},
```

- **Optional.** An entity without `load` (a chat message, an audit entry) is seen only through
  queries and feeds.
- **`lookup`** returns the full record; its key input is `Note.Key`.
- **`notFound`** lists failure tags that mean the record **no longer exists**. Such a failure
  deletes the record everywhere (section 6.6). Access failures fail only that read.
- **`staleTime`, `gcTime`** are required (D32); **`persist`** is optional, as for resources.

### 3.1 `watch`: a machine works with one record

```ts
activities: {
  note: O.Notes.watch(({ memory }) => memory.noteKey, {
    outcomes: { value: E.NoteLoaded.from((n) => ({ title: n.title })) },
  }),
  row: O.Notes.watch(({ memory }) => memory.noteKey, { shape: NoteRow }),
},
```

`O.Notes.watch(key, { shape?, outcomes? })` exists only on members with `load`. Without `load` it
is a type error whose message says the entity has no `load`, so a watch can never wait forever.

- **Store first.** The lane is `Success` at once when the store holds every field of `shape`
  (default: the full record) and each landed within `load.staleTime` on the Runtime clock.
  Otherwise `load` runs; meanwhile the lane is `Pending`, or `Refreshing` with data (the Resources
  plan's lane union) when the fields are present but stale. Restored fields count as stale.
- **One load per key.** Watches of one key, in any actor and any shape, share one load entry.
- **A narrow shape is the placeholder from the store.** Opening a note from its folder, `row`
  resolves at once from the list's copy while `note` loads the body. The activity option
  `placeholder` (decision 8) stays for a different case: keeping the previous key's data while the
  key changes.
- **`pending`** is on the lane, as in 8a (section 7.3).
- **Holding.** An active watch holds the record; after it ends, the load entry's `gcTime` applies.
- **`value`** fires on the first `Success` (including a store-first one) and whenever the record's
  **base** changes in the watched shape. It never fires for optimistic changes or their rollback,
  and its payload is the base projection (draft 3, section 9).
- **`deleted`** (optional outcome) fires once a delete is confirmed. Until then, and during an undo
  window, the lane is `Failure` with the built-in `Deleted { key, confirmed }`.
- **`O.Notes.refetch(keyFn)`** reloads one record: "I am unsure, ask the server".

---

## 4. Queries: questions the server answers about an entity

A query is a resource homed on the entity. It keeps every resource field and action, and adds the
facts the runtime needs for repair.

```ts
inFolder: Note.query({
  key: (input: { folderId: string }) => input,
  lookup: (input, { signal }) => NotesApi.use((api) => api.list(input, signal)),
  result: Schema.Struct({ notes: Schema.Array(NoteRow), total: Schema.Number }),
  staleTime: "30 seconds",
  gcTime: "5 minutes",
  when: (note, input) => note.folderId === input.folderId,
  ignoreChanges: ["title", "body", "author", "updatedAt"], // the server sorts by pinned, createdAt
}),

pinnedCount: Note.query({
  key: () => ({}),
  lookup: (_input, { signal }) => NotesApi.use((api) => api.pinnedCount(signal)),
  result: Schema.Struct({ count: Schema.Number }), // holds no notes, but counts them
  staleTime: "1 minute",
  gcTime: "5 minutes",
  when: (note) => note.pinned,
  // no ignoreChanges: any change to a pinned note refetches the count; correct, slightly chatty
}),
```

**Kept from resources:** `key` (with D25's partial-input `refetch`), `lookup`, `result`,
`staleTime`, `gcTime`, `persist`; the machine actions `subscribe` and `refetch`; the activity
option `placeholder`.

**There is one kind of query.** A list, a search, a page, a count, a grouping and a summary differ
only in their `result` Schema. `load` is the one record; everything else is a question.

### 4.1 `when`: which records can be in this answer

`when(record, input)` is true for every record that can appear in, or count toward, the answer.

- **Typed by the answer.** Its first parameter has the fields the answer holds for the home entity
  (key fields included), or the full record when the answer holds none. Reading a field the answer
  does not hold is a type error, so `NoteRow` includes `folderId`. This guarantees the store has
  every field `when` reads, for hiding and for the self-check.
- **Broader is safe, narrower is a bug.** A broader `when` costs refetches; a narrower one hides
  real records.
- **The self-check** (development, Stories, and production as a diagnostic): every home-entity
  record a lookup returns must satisfy `when`, tested on the response's own values. A violation is
  `WhenViolated`, naming the record, the query and its input. A record that arrived violating
  `when` is not hidden in that entry until a later lookup of the entry returns it satisfying
  `when`, or omits it.
- **Omitted** means every record of the entity can matter.
- **Searches, ranges and server ranking** use the broadest true scope. Do not ignore the fields the
  server searches or sorts by.

### 4.2 `ignoreChanges`: field changes that cannot move this answer

`ignoreChanges` lists the home entity's fields whose change cannot alter the answer beyond what
coherence already shows. A change to an ignored field updates the record in place and refetches
nothing.

- **Safe direction.** Omitted means no field is ignored, so every change refetches. Forgetting a
  field costs a refetch; it never leaves a stale screen. (Draft 5's `refetchOn` failed the other
  way: a forgotten field went stale.)
- **What to list:** fields that are only displayed. Never a field the server filters, sorts, groups
  or searches on, nor one that feeds a context field such as `total`.
- **`when`'s fields can never be ignored.** Its reads are observed in development (D41); an ignored
  field that `when` reads is the error `WhenFieldIgnored`.
- **`ignoreChanges: "all"`** is for answers that must not change under the user: a ranked feed, or
  search results being read. Changes, including entering records, only mark the entry stale; it
  refetches when the machine runs `refetch` (a "new posts" button) or on its next subscription.
  Coherence and leaving still apply. Such an entry is outside guarantee 2 until it refetches.
- The type restricts names to the entity's fields.

### 4.3 Leaving is immediate; entering waits

1. **Leaving.** A home-entity record whose **visible** value no longer satisfies `when` is hidden
   from the answer at once. Moving a note to another folder removes it from the old folder's list
   in the same publication as the optimistic patch.
2. **Entering.** A record that now satisfies `when` appears when the repair refetch lands, or at
   once with `place` (section 4.5).
3. **Context fields** (`total`, highlights, ranks) belong to the answer and become valid at its
   refetch. Between a change and the refetch, `total` can disagree with the visible list.
4. **Selectors may sort and group** an answer's records by coherent fields. They never filter out
   records; leaving is the runtime's job.

### 4.4 Other entity types in a query

A query may contain other entities' picks, nested (`author`) or as their own lists (a global search
returning notes and folders). Their fields stay coherent. A change to another type refetches the
query only through `depends`:

```ts
depends: [Folder.changes({ when: (folder, input) => folder.workspaceId === input.workspaceId,
                           ignoreChanges: ["color"] })],
```

`depends` on the home entity is an error: its `when` and `ignoreChanges` already say it. `flow
check` errors when a query holds another entity type in an array position without a `depends` on
it, unless the position is marked `Folder.detached(...)`.

### 4.5 `place`: entering without waiting

For lists the client can extend itself (a chat channel, comments, an activity log, notifications),
a query declares where a newly matching record goes:

```ts
place: (message, input) => "start", // the server returns newest first
```

- It returns `"start"`, `"end"` or `undefined` (wait for the refetch). It reads the same fields as
  `when`.
- It applies when a home-entity record enters: it is not in the entry, and its visible value now
  satisfies `when`. The source can be an optimistic insert, a command result or a feed upsert.
- **A placement is an overlay on the entry,** like an optimistic operation. It survives lookups
  that started before the change, and ends when a lookup that started after the change lands; the
  server's membership is then authoritative.
- **A placement never suppresses repair.** The entering refetch still runs, coalesced, so order and
  context fields become correct. A wrong `place` is therefore a flicker, not a lasting error.
- It is allowed only when the result holds exactly one array of the home entity (static check).

### 4.6 Pages

Page-numbered lists are ordinary queries with `page` in their input; a repair refetches the active
page and marks other pages stale.

Infinite lists need one entry that grows, because memory holds keys and never copies. This is a
**resource change** proposed alongside, shared by queries and plain resources, and decided
separately (section 13.2):

```ts
pages: { next: (result) => (result.hasMore ? result.cursor : undefined) },
lookup: (input, { signal, cursor }) => ChatApi.use((api) => api.messages(input, cursor, signal)),
```

- Pages extend at the end, in fetch order. The lane's `data` is `{ pages: Result[] }`.
- `O.Messages.inChannel.fetchMore(inputFn)` loads the next page; it is a no-op without a `next`.
- A repair refetches the loaded pages in order, up to the number loaded, as TanStack Query does.
- `place: "start"` inserts into the first page. `"end"` inserts into the last page only when it has
  no `next`; otherwise the record is not placed and waits for the refetch.

---

## 5. Commands: what changes an entity

A command is a `transaction` homed on the entity. Every transaction field and behaviour applies:
`commit`, `concurrency` (required, D31), outcomes, `unknown`, `attempt.id`, `cancel`, `delay` and
`progress`.

```ts
write: {
  rename: Note.command({
    input: { key: Note.Key, title: Schema.String },
    key: (input) => input.key,
    commit: ({ key, title }, { signal, attempt }) =>
      NotesApi.use((api) => api.rename(key, title, { signal, attempt })),
    result: Note,
    optimistic: (input) => [Note.patch(input.key, () => ({ title: input.title }))],
    concurrency: "serialize",
  }),

  move: Note.command({
    input: { key: Note.Key, from: Folder.Key, to: Folder.Key },
    key: (input) => input.key,
    commit: …,
    result: Note,
    optimistic: (input) => [
      Note.patch(input.key, () => ({ folderId: input.to.folderId })),
      Folder.patch(input.from, (folder) => ({ noteCount: folder.noteCount - 1 })),
      Folder.patch(input.to, (folder) => ({ noteCount: folder.noteCount + 1 })),
    ],
    concurrency: "serialize",
  }),

  togglePin: Note.command({
    input: { key: Note.Key },
    key: (input) => input.key,
    commit: …,
    result: Note,
    optimistic: (input) => [Note.patch(input.key, (note) => ({ pinned: !note.pinned }))],
    concurrency: "serialize",
  }),

  remove: Note.command({
    input: { key: Note.Key },
    key: (input) => input.key,
    commit: …,
    optimistic: (input, { get }) => [
      Note.remove(input.key),
      Folder.patch(folderOf(get(Note, input.key)), (f) => ({ noteCount: f.noteCount - 1 })),
    ],
    concurrency: "serialize",
  }),

  create: Note.command({
    input: { note: Note.pick("noteId", "folderId", "title", "createdAt") },
    key: (input) => Note.keyOf(input.note),
    commit: …,
    result: Note,
    optimistic: (input) => [Note.insert({ ...input.note, body: "", pinned: false, … })],
    concurrency: "allow",
  }),
},
```

`folderOf` is a two-line helper returning the folder key, or no keys when the note is not held.

- **`input`** is a Schema field record and required on commands: optimistic operations, `affects`
  and `key` are typed from it, and traces show it. This narrows D46 for commands only.
- **`key`** is the transaction's concurrency key, as today. A bulk command keys on its scope
  (`{ workspaceId }`), not on its first record.
- **`result`** is any Schema containing this or other entities. Every record in the response is
  written to the store. Omitted means the response carries no records.
- **A command must change something.** One with no `result`, no `optimistic` and no `affects`
  involves no entity, so it is a base `transaction` (`flow check` error).
- **Multi-entity commands** live on the members of the entity whose key the command's `key`
  returns (`move` keys on the note, so it is `Notes.move`). A scope-keyed bulk command lives on the
  entity it patches. The rule is checked.

### 5.1 Optimistic operations

`optimistic` is a function of the input and a read-only store accessor. It returns a **fixed
list** of operations:

| Operation                           | Meaning                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| `E.patch(keys, (record) => fields)` | change fields of held records; absent records are skipped (traced) |
| `E.remove(keys)`                    | hide records everywhere                                            |
| `E.insert(record)`                  | add a record with a client-generated key                           |

- **Why a function.** The spike showed that `[E.patch((input) => …, …)]` cannot be typed:
  TypeScript does not carry the command's inferred input into the nested call. `(input) => [...]`
  types fully, and rejects key fields, unknown fields and another entity's key.
- **Structure stays visible.** At construction the Runtime calls `optimistic` once with a recording
  probe and records the sequence of entity and operation kinds. An admission that returns a
  different sequence is a defect, so the list stays as static as decision 6's. `flow graph` reads
  the recorded sequence; the fields a patch writes are recorded per admission in the trace.
- **`get(Entity, key)`** reads the visible record at admission, so a patch can address records the
  input does not name (a thread's labels, a note's folder). It starts nothing.
- **Pure.** `flow check` flags `Date.now`, `new Date`, `Math.random`, `crypto` and
  `URL.createObjectURL` in optimistic functions and commit input functions; ids and timestamps come
  from the input, generated in `.from` under the seeded `Random`. Stories run each optimistic
  function twice per admission and compare, as a determinism check.
- Operations apply at **admission**, including commands queued by `serialize`. They are layered
  over the base, replayed in admission order whenever something beneath them changes, and end as
  in section 5.4.

### 5.2 Creates

- **With a client key:** `insert` adds a record whose key comes from the input. Queries with
  `place` show it at once; others after the entering refetch. On success the response replaces it.
- **Retrying** a create whose attempt is `unknown` re-sends the same key; the new `insert` replaces
  the old operation. Any other `insert` of a key already in the store is a defect.
- **With a server key:** no optimistic form in version 1 (section 14).

### 5.3 What a command affects

The keys a command affects are the union of records in its `result`, keys its optimistic
operations touch, and `affects`:

```ts
affects: [Folder.keys((input) => input.folderKey), AuditEntry.all],
```

`Folder.keys(fn)` names records; `Folder.all` names every record of the type (after a permission
change, an import, a bulk job). They differ from `Folder.changes`, which readers use in `depends`.

**Changed fields** decide `ignoreChanges` (section 4.2): the patched fields, the fields where the
result differs from the base (a field the base lacked counts), and the version field. An `affects`
target, a failure or an `unknown` ending changes every field.

### 5.4 How a command ends

| Ending                                               | Store                                                             | Repair                    |
| ---------------------------------------------------- | ----------------------------------------------------------------- | ------------------------- |
| success                                              | fields the response carries are promoted, then the result is written; deletes become permanent | per changed field |
| success, a patched field the response does not carry | the field stays as a **held** overlay until a base write to it from a read started after settlement | that record, forced |
| failure after sending                                | operations removed                                                | affected keys, all fields |
| rejected, or cancelled before sending                | operations removed                                                | none                      |
| defect, cancelled after sending, abandoned           | `unknown`: operations stay; records read `pending`                | all fields                |
| `unknown` resolved                                   | by `EntityChange.Confirm(attempt.id)` or `O.Notes.rename.settle(…)` | all fields              |

- **Only the server's fields become base.** `move` above guesses `noteCount ± 1` for two folders
  the response does not return. The guesses stay visible as held overlays (no flicker back) and
  force repair of both folders, so the real counts replace them. Draft 5 promoted the guesses to
  base, where nothing ever corrected them.
- **The same rule covers bulk commands.** A bulk resolve whose response omits a key that failed
  holds that key's patch and forces its repair, so the refetch shows the truth.
- **Every failure after sending repairs.** The server may have rejected the command because the
  client's data was stale (`VersionConflict`, `OutOfStock`), so the affected records refetch. A
  validation failure costs one extra refetch. (Draft 5's `conflicts` list is gone.)

### 5.5 Concurrency across actors

Concurrency stays actor-local and exact-key (Transactions D1, kept under D10). Two actors that
rename the same note both send. Without a `version`, the order of their results cannot be trusted,
so the store marks the field **contested** (section 6.3) and forces a repair that reads the
server's answer. When edits to one record must queue, use one shared actor per record
(`actorRef(EditorMachine, Note.keyString(key))`) in every screen.

---

## 6. The store

Reused from draft 3, sections 4, 6 and 7, with the changes marked **changed**.

### 6.1 Records

One record per key: the fields received so far, each with the version, start revision, landed
revision and landed time of the write that set it. A record has a **base** (what the server has
said) and a **visible** value (base plus active overlays: optimistic, held and placed). Answers
store their result with every entity position replaced by a reference and are assembled at
publication, with structural sharing, so an element keeps its identity while its projected fields
are unchanged.

### 6.2 One write path

Every source changes records through `upsert(key, fields, meta)` and `delete(key, meta)`: a lookup
result, a command result, a promotion, a feed change and a restore.

### 6.3 Ordering

A write replaces a stored field when both carry a version and its version is **strictly greater**.
Otherwise, including equal versions, it replaces the field when its start revision is at or after
the stored field's landed revision. Start revisions: a lookup when it started; a feed change when
it arrived; a command result and its promoted fields when the command **settled**; a restore at 0.

**Changed: contested fields.** Without versions, start revisions order requests, not server truth.
A field becomes **contested** when:

- a command result lands on a field that another write set after this command was sent; or
- a write is skipped by the rule above while carrying a different value.

A contested record gets a forced repair (section 6.4). Its refetch starts after both writes, so it
lands and ends the contest. Declaring `version` removes contests.

### 6.4 Repair

**Changed:** draft 3 refetched every dependent answer on settlement. Draft 6 skips fields an answer
ignores, and adds forced repairs.

**Ordinary repair.** For each settled change to a record of entity `E` (a command ending in section
5.4, a feed write, or a read revealing newer base fields), each active answer is refetched when:

1. it holds the record, is a query on `E`, or `depends` on `E`;
2. its `when` holds for the base value before or after the change (a command's "before" is the base
   captured at admission; an unknown field counts as a match);
3. a changed field is not in its `ignoreChanges`, or the change enters or leaves the answer;
4. its data **started before** the change (the convergence rule).

An entry with `ignoreChanges: "all"` is marked stale instead. Inactive answers that match are
marked stale. A `load` entry holding the record is refetched only if no command result or feed
write carried the changed fields.

**Forced repair** refetches a record's `load` entry and every active answer holding it, regardless
of `ignoreChanges` (rule 4 still applies). It happens when the record has a held field at
settlement or a contested field, or when it is a deleted nested record (then its parents' answers
refetch).

**Volume and timing.** Refetches are coalesced per answer over a window set in Runtime
configuration (default 50 ms) on the Runtime clock; `process()` in Stories drains it. A coalesced
refetch uses the latest change in its window for rule 4.

**The in-flight fence** (draft 3) applies: a lookup running when a matching change settled still
writes fields, but its entry is refetched once it lands, unless a later lookup is scheduled, in
flight or landed. An entry with no data is simply loaded.

**Repair reads base values**, never visible ones, so an overlay can neither trigger a refetch nor
hide a real server change.

### 6.5 Holding, lifetime and feed writes

A record exists while something holds it: an answer that references it (until the answer's
`gcTime` after its last subscriber), an active `watch`, an active overlay, or a Story seed.

**Changed: feed writes to keys nothing holds** are no longer simply dropped (draft 5 lost every new
record that way):

1. The write is tested against every active answer on the entity. If an answer's `when` matches
   and its `place` applies, the record is placed and held by that answer.
2. Otherwise, every active answer whose `when` matches gets an entering refetch, and the record
   itself is not stored.
3. A `Delete` for an unheld key leaves a tombstone while any lookup that started before it is in
   flight, so that lookup cannot resurrect the record.
4. Anything else is dropped, and the trace records why.

### 6.6 Deletes

As draft 3, section 7: `remove` hides a record everywhere at admission and success makes it
permanent; a `watch` shows `Deleted { key, confirmed }`; a tombstone stays while any read that
started before the delete is in flight. A `notFound` failure, a feed `Delete` and a successful
`remove` all delete through the one write path. A deleted singleton is reloaded by its next
`watch`, so "the cart was checked out" reads as an empty cart from the server.

### 6.7 Persistence and restore

As draft 3, section 11: persistence stores base data only, and restore writes at revision 0 with
fields counted as stale. **Changed:** an attempt restored as `unknown` (D34) keeps `pending` true
on its keys even though its overlay was not persisted, and forces repair of those keys at once.

---

## 7. Machines and definitions

### 7.1 Definitions list members

```ts
export const Editor = definition({
  id: "notes/Editor",
  entities: { Notes, Folders }, // reached as O.Notes.<member>, O.Folders.<member>
  operations: { heartbeat },    // base operations, as today
  memory: {
    noteKey: Note.Key,
    draft: Schema.String,
    dirty: Schema.Boolean,
    changedElsewhere: Schema.Boolean,
  },
  …
});
```

`O.Notes` offers:

- `watch` and `refetch`, when `load` exists;
- `invalidate()`: every active answer on the entity refetches and the rest are marked stale, as
  after a permission change;
- `<query>.subscribe`, `.refetch` and `.fetchMore`;
- `<feed>.subscribe`;
- `<command>.commit`, `.cancel` and `.settle`.

**Changed (decision 6):** for entity commands, the call site carries only outcomes and timing
(`delay`). `optimistic` moves to the command, `writes` becomes `result` plus repair, and `unknown`
stays an outcome. Base transactions keep decision 6 unchanged, including `writes` on base
resources. Section 13 has the table.

### 7.2 Memory holds keys and drafts

- `flow check` errors on memory whose Schema contains an entity shape. Keys are `Note.Key`.
- A draft records whether it is `dirty`. A `value` outcome always updates what the machine knows of
  the server; it replaces the draft only when the draft is clean.
- Events may carry records as snapshots of a moment; machines read current data through lanes.
- Refs and inputs use keys:
  `editorRef = (key) => actorRef(EditorMachine, Note.keyString(key), …)`.
- Context exposes keys and primitives, never records: `Session.select(({ memory }) =>
  memory.userKey)`, and the consumer watches `User` by that key.

### 7.3 Reading in views and guards

Decision 8 stands: components read lanes through `useView`. One passive reader reads the store at
the snapshot's revision:

```ts
Note.get(s, key, NoteRow) // { data, pending } | undefined: 8a's entry type; starts nothing
```

`pending` is true while an optimistic or held overlay on the record awaits settlement, or an
attempt on it is `unknown`. It is 8a's name, kept. Per-row saving in a list reads
`Note.get(s, row, NoteRow)?.pending`. Guards may use `get`. `flow check` warns when a machine's
selectors `get` an entity that none of its activities watch or subscribe to.

### 7.4 Records referenced by key

A list of notes with `assigneeId` needs user names. In order of preference:

1. the server embeds `assignee: User.pick("name")`, which stays coherent;
2. a query on `User` that returns the users the view needs (`Users.byIds`);
3. `User.get(s, key, UserChip)` when an activity of the same machine already holds them.

`watch` over an array of keys, with a batched `load`, is version 2 (section 14).

---

## 8. Feeds: records pushed by the server

```ts
live: Note.feed({
  key: (input: { workspaceId: string }) => input,
  subscribe: (input) => NotesApi.use((api) => api.noteChanges(input)),
  shape: Note, // or a pick: the fields each change carries
  gcTime: "1 minute",
}),
```

- A feed is a stream homed on the entity. It emits batches of `EntityChange.Upsert(fields, {
  version? })`, `EntityChange.Delete(key, { version? })` and `EntityChange.Confirm(attemptId)`;
  each batch is applied in one turn.
- Each change is a write (section 6.2): it updates every copy, and repairs only when it changes a
  **base** field. A feed write to a key nothing holds follows section 6.5.
- A feed is a machine activity (`O.Notes.live.subscribe(…)`), shared by key across actors.
- A reconnect after a gap marks every answer on the entity stale.
- The feed's lane carries status only. Machines react to records through `watch` and query `value`
  outcomes, and to the feed's failures through its outcomes.

**Device-owned or ephemeral streams** (the user's own location, typing, presence, a CRDT document
session, toasts) stay base `stream`s mapped to events. A server record's live fields, such as a
driver's position, are an entity feed.

---

## 9. The base layer

Unchanged from decisions 1–8a. Many parts of real apps have no entity.

| Need                                  | Base form                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| keep-alive heartbeat                  | a `transaction` with `concurrency: "reject"`, sent by a schedule             |
| refresh an auth token                 | a schedule and a `transaction`; the token lives in a provider actor          |
| analytics events                      | a fire-and-forget `transaction`                                              |
| feature flags, app config             | a `resource` read by one provider actor, exposed through context             |
| reports and dashboards over no entity | `resource`s                                                                  |
| poll a job until it finishes          | a schedule sends `PollDue`; the action is `O.job.refetch`; `value` moves on  |
| upload bytes to a signed URL          | a `transaction` with `progress`; the record it creates comes from a command  |
| presence, typing, own location        | a `stream` mapped to events                                                  |
| a collaborative document body         | a `stream` to the sync provider, owned by a document actor                   |

**Crossing the boundary.** A job whose completion changes records ends with an entity action: the
machine's `JobFinished` handler runs `O.Notes.invalidate()`, or the job is started by a command
with `affects: [Note.all]`. The base layer never names an entity, so no repair hides in it.

---

## 10. Stories and tools

### 10.1 Stories

- **Stateful fixtures.** A fixture Layer holding a `Ref` is a small in-memory server, so a lookup
  returns updated data after a command. Slow and failing responses are fixtures on the Runtime
  clock, as in minimal-library section 11.
- **One new step:** `.emit(feed, input, [EntityChange…])`, because a feed has no clock to advance.
  It requires a live subscription and is recorded at its exact step.
- **Assertions:** `Note.get(checkpoint.snapshot, key, Shape)` and the trace's refetch records.
- **Checkpoints** include records, tombstones and overlays, serialised once per revision.

### 10.2 What catches a wrong declaration

| Wrong declaration                                 | Caught by                                                 |
| ------------------------------------------------- | --------------------------------------------------------- |
| `when` reads a field the answer lacks             | the type system                                           |
| `when` narrower than the server                   | `WhenViolated` on every lookup, in all environments       |
| `ignoreChanges` names a field `when` reads        | `WhenFieldIgnored` (development)                          |
| `ignoreChanges` names a field the server sorts by | the repair audit                                          |
| a wrong `place`                                   | self-correcting at the entering refetch; the repair audit |
| a missing `depends` on a listed type              | `flow check` error                                        |
| a missing `affects`                               | the repair audit                                          |
| a command that changes nothing                    | `flow check` error                                        |
| an entity copied as a plain struct                | `flow check` error                                        |

### 10.3 The repair audit

At the end of every Story run with a stateful fixture, after `process()` drains, the runtime
refetches every active answer against the fixture and compares it with the assembled value. A
difference is `RepairMissed`, naming the answer and the first differing record or field. Audit
lookups are tagged in the trace and excluded from refetch counts.

- A Story without a stateful fixture reports `AuditSkipped`.
- `flow check` warns `RepairUnaudited` for a query or command that no audited Story runs.
- **Limit:** the fixture is written by the same author, so the audit checks the client against the
  author's idea of the server. It catches inconsistent declarations, not a misunderstood API.

### 10.4 `flow graph`

Entities are hubs. Edges:

- machine → member (watches, subscribes, commits);
- query → entity (contains, depends);
- command → entity (changes, from the recorded optimistic sequence and the result Schema;
  affects);
- feed → entity;
- derived actor-level edges ("Editor affects Folder view through Note").

### 10.5 `flow check`

| Rule                                                                    | Level   |
| ----------------------------------------------------------------------- | ------- |
| a base operation involves an entity                                     | error   |
| a struct with an entity's key fields that is not a pick; a rebuilt pick | error   |
| memory holds an entity shape                                            | error   |
| impurity in optimistic or commit input functions                        | error   |
| an entity command with no `result`, `optimistic` or `affects`           | error   |
| a multi-entity command not on the members of its `key`'s entity         | error   |
| `depends` on the query's home entity                                    | error   |
| an array of another entity type in a query without `depends`            | error   |
| `place` on a result with zero or several arrays of the home entity      | error   |
| `notFound` tags absent from the lookup's failure Schema                 | error   |
| an entity cycle through nested picks; duplicate entity ids              | error   |
| a `watch` without a handler for `Deleted` or a `notFound` tag           | warning |
| `get` on an entity no activity of the machine holds                     | warning |
| a query or command no audited Story runs (`RepairUnaudited`)            | warning |

### 10.6 Traces

The trace records:

- each record write: cause, fields, version, skipped fields and contests;
- each refetch with its reason ("`Notes.move` settled; `folderId` is not ignored; `when` matched
  the old value");
- each **suppressed** repair with its reason: ignored field, convergence rule, coalesced, marked
  stale;
- each hidden record, placement, held field, fenced lookup, dropped feed write and self-check
  violation.

All of it reaches `attachInspector` in production. `flow trace entity Note <key>` and `flow trace
refetch <answer>` explain them.

---

## 11. Worked examples

### 11.1 Many machines, one entity

A notes app: a folder list, an editor and a pinned-count badge, all over `Note`.

```ts
// The folder list
OPEN: {
  activities: {
    notes: O.Notes.inFolder.subscribe(({ memory }) => ({ folderId: memory.folderId })),
  },
  on: {
    PinClicked: {
      target: "self",
      actions: [O.Notes.togglePin.commit(({ event }) => ({ key: event.key }),
        { outcomes: { failure: E.PinFailed } })],
    },
  },
}

// The badge
activities: { pinned: O.Notes.pinnedCount.subscribe(() => ({})) }

// The editor. NoteLoaded is an internal event; Saved and SaveUncertain carry no payload.
OPEN: {
  activities: {
    note: O.Notes.watch(({ memory }) => memory.noteKey, {
      outcomes: { value: E.NoteLoaded.from((n) => ({ title: n.title })) },
    }),
  },
  on: {
    NoteLoaded: {
      target: "self",
      updateMemory: ({ memory, event }) =>
        memory.dirty && event.title !== memory.draft
          ? { changedElsewhere: true }
          : { draft: event.title, dirty: false, changedElsewhere: false },
    },
    TitleChanged: {
      target: "self",
      updateMemory: ({ event }) => ({ draft: event.title, dirty: true }),
    },
    SaveRequested: {
      target: S.OPEN.SAVING,
      actions: [
        O.Notes.rename.commit(({ memory }) => ({ key: memory.noteKey, title: memory.draft }), {
          outcomes: { success: E.Saved, unknown: E.SaveUncertain },
        }),
      ],
    },
  },
}
```

| Event                                    | What every screen shows, with no author code listing screens               |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| Rename admitted                          | the new title in the editor's lane and the folder's row, same publication  |
| Rename succeeds                          | the result is written; no list refetches (`title`, `updatedAt` ignored)    |
| Pin toggled                              | the row flips at once; on success `inFolder` and `pinnedCount` refetch     |
| Note moved to another folder             | it leaves the old folder at once and enters the new one at its refetch; both counts show the guess, then the server's numbers after the forced repair |
| A second editor, dirty                   | `value` fires with the new base; memory sets `changedElsewhere`; the draft is kept |
| Two editors rename at once, no `version` | the title is contested; a forced repair shows the server's winner everywhere |
| Note deleted by another user (feed)      | every list drops it; the editor's lane is `Deleted { confirmed: true }` and `deleted` fires |

### 11.2 Many entities together: a board

`Board`, `Column`, `Card` and `User`; cards embed `assignee: User.pick("name", "avatarUrl")`.

```ts
onBoard: Card.query({
  key: (input: { boardId: string }) => input,
  lookup: …,
  result: Schema.Struct({ cards: Schema.Array(CardTile) }),
  staleTime: "30 seconds",
  gcTime: "5 minutes",
  when: (card, input) => card.boardId === input.boardId,
  ignoreChanges: ["columnId", "position", "title", "assignee"], // the view groups and sorts
}),

moveCard: Card.command({
  input: { key: Card.Key, columnId: Schema.String, position: Schema.String },
  key: (input) => input.key,
  commit: …,
  result: Card,
  optimistic: (i) => [Card.patch(i.key, () => ({ columnId: i.columnId, position: i.position }))],
  concurrency: "serialize",
}),
```

- Dragging patches one record; the selector groups by `columnId` and sorts by `position`; nothing
  refetches. Fractional positions come from the input.
- Renaming a user updates the avatar on every card through nesting, with no refetch.
- Deleting a column is `Columns.remove` with `affects: [Card.all]`: cards repair by refetching
  `onBoard`.

### 11.3 Other applications

| App               | Entities                               | Notable use                                                            |
| ----------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| Chat              | `Channel`, `Message`, `User`           | `inChannel` with `pages` and `place: "start"`; `Messages.live`; sends `insert` with client ids; reactions ignored |
| Social feed       | `Post`, `User`                         | `home` with `ignoreChanges: "all"` and a "new posts" refetch; likes stay coherent everywhere |
| Storefront        | `Product`, `Cart` (singleton), `Order` | `Carts.addLine` returns the whole cart; an `OutOfStock` failure repairs the cart; payment polling is a base resource |
| Banking           | `Account`, `Txn`, `Payee`              | `Accounts.transfer` patches both balances (held until the refetch) and `affects: [Txn.all]` |
| E-mail            | `Thread`, `Label`, `Contact`           | `archive` patches labels via `get(Thread, key)`; `when` on `labelIds` hides archived threads at once |
| Calendar          | `Event`, `Occurrence`                  | range queries with an overlap `when`; occurrences keyed by original start; series edits `affects: [Occurrence.all]` |
| Settings, profile | `Settings` (singleton), `User`         | `O.Settings.watch(() => ({}))`; one command per section                |
| Admin back-office | `User`, `Role`, `AuditEntry`           | filtered queries; bulk commands keyed by scope with held per-key patches; `AuditEntry` has no `load` |
| IoT, maps         | `Device`, `Driver`, `Trip`             | feeds push positions and telemetry, ignored by lists; a driver entering the viewport is placed from the feed |
| Analytics         | none                                   | base resources only; entities cost nothing here                        |

---

## 12. Naming

- **`result`**, not `schema` or `data`: it names the role of the value. A command has two Schemas
  (`input` and `result`), so `schema` would be ambiguous. Base resources rename `data` to `result`
  so the layers read alike (section 13.2).
- **`entity` and `members`:** identity and operations are two declarations, as `definition` and
  `machine` are. `Note` names one record; `Notes` names what you can do with them.
- **`load`, `read`, `write`:** one way to load a record by key; queries and feeds; commands.
- **`query`, `command`, `feed`:** resources, transactions and streams homed on an entity. They keep
  the base layer's fields, so nothing is learnt twice.
- **`ignoreChanges`:** named for the safe direction; omitting it is never wrong.
- **`primaryKey`:** `key` already means the cache and concurrency key.

---

## 13. Changes to agreed decisions and to the base layer

### 13.1 Agreed decisions

| Agreed                                                | Draft 6                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------- |
| decision 6: `optimistic`, `writes` at the commit call | entity commands: `optimistic` on the command, `result` plus repair instead of `writes`; base transactions unchanged |
| decision 6: optimistic writes as a static list        | `(input, { get }) => [...]`, a fixed list recorded at construction (the types require it) |
| 8a lane `pending`                                     | kept; also on `Note.get` entries                                  |
| 8a "version 1 stitches pages in memory"               | `pages` proposed instead (13.2), since memory holds keys only     |
| D46 Schemas only at boundaries                        | `input` required on entity commands                               |
| minimal-library 11 Story commands                     | adds `.emit`                                                      |
| Transactions D1 actor-local concurrency               | kept; contested fields cover cross-actor races                    |

**Probably affected, unverified:** decision 6's own form, `optimistic: [O.ticketById.setData(({
input }) => …)]`, nests a lambda the same way the spike showed cannot be typed. It needs the same
spike.

### 13.2 Base layer

| Change                         | Why                                                              |
| ------------------------------ | ---------------------------------------------------------------- |
| `data` renamed `result`        | one name for the role in both layers; decided with this proposal |
| `pages`, `cursor`, `fetchMore` | infinite lists without copies in memory; decided separately      |

### 13.3 From draft 3

| Draft 3                                                  | Draft 6                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| store, base and visible values, one write path, ordering | reused; strict version comparison; contested fields            |
| command endings, `unknown`, `settle`, `Confirm`          | reused; held fields; every failure repairs                     |
| repair on settlement for every matching answer           | skips ignored fields; forced repairs added                     |
| `depends: [E.changes({ when })]` on every list           | home entity: `when`, `ignoreChanges` inline; others: `depends` |
| hiding in selectors                                      | the runtime hides records that fail `when`                     |
| `ticketById`, a resource like any other                  | `load` is canonical; `watch` reads the store first             |
| no optimistic create                                     | `insert` with client keys, and `place`                         |
| definitions imply entities                               | definitions list members                                       |
| `value` carries base data; persistence stores base only  | reused; restored `unknown` attempts keep `pending`             |

---

## 14. Version 2

| Deferred                                      | Version 1 instead                                    | Cost of waiting                              |
| --------------------------------------------- | ---------------------------------------------------- | -------------------------------------------- |
| `watch` over key arrays, batched `load`       | embed picks, or a `byIds` query                      | one extra query per view joining by key      |
| `watch` on feed-only records (a lobby)        | a single-record query                                | one awkward declaration                      |
| entities with variant shapes (file or folder) | optional fields                                      | weaker types for those entities              |
| `upsert` as an optimistic operation           | `insert` for new keys, `patch` for held ones         | an empty spreadsheet cell is not optimistic  |
| server-key creates and re-keying              | the record appears when the response lands           | no instant row for those APIs                |
| placement without the entering refetch        | placement plus a coalesced refetch                   | chat refetches the newest page per burst     |
| feed throttling and batching options          | feeds apply each batch in one turn                   | high-rate feeds publish often                |
| `forbidden` tags that evict like `notFound`    | one Runtime per principal                            | a revoked record stays until a refetch       |
| derived counts from declared relations        | optimistic count patches, corrected by forced repair | one patch per count                          |
| persisting overlays; offline queues           | a reload shows confirmed data and repairs unknowns   | no offline-first apps                        |
| sync engines with their own client store      | feeds and `Confirm` keep the door open (draft 3, section 14) | no engine adapters                   |

## 15. Rules for agents

1. Give every server record with a stable key an `entity`, including the current user. Build every
   result from it or its picks.
2. If an operation involves an entity, it lives on that entity's members; a command lives on the
   members of the entity its `key` names. Everything else is a plain `resource`, `transaction` or
   `stream`.
3. A query says which records can be in it (`when`). List in `ignoreChanges` only fields that are
   purely displayed; when unsure, leave a field out.
4. A command says what it changes: `result`, `optimistic` and `affects`. Generate ids and times in
   `.from`, never inside `optimistic`.
5. Machines hold keys and drafts, never copies. Selectors may sort and group; they never filter
   records out of a query.
6. Every query and command runs in a Story with a stateful fixture, so the repair audit checks it.

## 16. Open questions

- **The optimistic function and D7.** Decision 6 made actions static lists. The types force
  `optimistic: (input, { get }) => [...]`; draft 6 keeps it static by recording the sequence at
  construction. Is that acceptable, or is a different static form needed?
- **Convergence proof.** Extend the property test from draft 3, section 19, with `ignoreChanges`,
  contested fields, held fields, placements, hiding and unheld feed writes. Drive random
  interleavings against a stateful fake server, then check that every answer equals the server's
  once it is quiet.
- **Hiding by `when` in production.** Draft 3 deferred it because a wrong predicate hides real
  rows. Draft 6 runs the self-check everywhere and never hides a record its own entry returned
  violating `when`. Is that enough?
- **Two declarations per entity.** `Note` and `Notes` cost one more name per entity in exchange for
  cycle-free modules. A one-step form for entities without cross-references would be a second way
  to write the same thing (D1), so it is not offered.
- **Import path.** Whether the entity layer is `flow-state/entities`.

## 17. Review record

Six Sonnet reviews of draft 5. Each finding below was checked against the text, and the TypeScript
findings were re-run.

**Accepted and applied:**

| Review             | Finding                                                            | Change                                         |
| ------------------ | ------------------------------------------------------------------ | ---------------------------------------------- |
| correctness        | feed writes to unheld keys dropped every new record                | section 6.5                                    |
| correctness        | concurrent unversioned writes kept the older value, unrepaired     | contested fields, 6.3                          |
| correctness        | `place` suppressed the refetch; old lookups erased placements      | placement overlay; repair always runs, 4.5     |
| correctness        | optimistic guesses on other records were promoted to base          | held fields and forced repair, 5.4             |
| correctness        | nested deletes never repaired parents                              | forced repair, 2.2 and 6.4                     |
| correctness        | the second-editor example lost the server's value                  | `dirty` and `changedElsewhere`, 11.1           |
| correctness        | `place` with `pages` was contradictory                             | pages extend at the end; rules in 4.6          |
| agent UX           | `refetchOn` failed silently when a field was forgotten             | inverted to `ignoreChanges`, 4.2               |
| agent UX           | a command that affects nothing was accepted                        | `flow check` error, 5                          |
| agent UX           | equal versions let older writes win                                | strictly greater, 6.3                          |
| agent UX           | failures not listed in `conflicts` repaired nothing                | every failure after sending repairs; `conflicts` cut |
| types              | patch lambdas inside the `optimistic` array cannot be typed        | `optimistic: (input, { get }) => [...]`, 5.1   |
| types              | one-step `entity(spec, callback)` cannot express mutual references | `entity` plus `members`, 2.4                   |
| types, consistency | `NoteRow` lacked `folderId` but `when` read it                     | `when` typed by the answer; example fixed      |
| consistency        | decision 6 was reversed while claiming call sites were unchanged   | stated, 7.1 and 13.1                           |
| consistency        | `unconfirmed` renamed 8a's `pending`                               | `pending` kept, 7.3                            |
| consistency        | Story steps were widened without saying so                         | only `.emit` added; hold and fail are fixtures |
| consistency        | suppressed repairs were off the record                             | traced, 10.6                                   |
| consistency        | coalescing and restore freshness were unspecified                  | 6.4, 6.7                                       |
| generality         | ranked feeds must not reorder under the user                       | `ignoreChanges: "all"`, 4.2                    |
| generality         | patches could not read the store                                   | `get` in `optimistic`, 5.1                     |
| generality         | "involves" was undefined; live location contradicted the rule      | defined in 1; feeds vs device streams in 8     |
| generality         | offline was unsupported but unlabelled                             | section 1.2                                    |
| simplicity         | `key` meant three things                                           | `primaryKey`                                   |
| simplicity         | `refetchAll` duplicated agreed `invalidate`                        | `O.Notes.invalidate()`                         |
| simplicity         | `E.all()` was a call                                               | `E.all`, a value                               |

**Rejected, with reasons:**

- **Simplicity: collapse into draft 3** (delete `query`/`command`/`feed`, `load`/`watch` and the
  layer rule; entity-awareness only from Schemas). That is draft 3, which already exists; this
  document's purpose is the entity-centric alternative. The point stands as the main comparison:
  draft 6 has about 30 author-facing names against draft 3's 18.
- **Simplicity: cut `insert` and `place`.** Chat, comments and live maps are common, and a pending
  item in memory would copy records. Kept, with the correctness fixes above.
- **Simplicity: defer `ignoreChanges` to version 2.** Refetch storms on fast fields were draft 3's
  main scaling problem. Kept, in the safe direction, so it cannot cause staleness.
- **Simplicity: merge `when` into `depends` for the home entity.** The inline form for the home
  entity is the core of the entity-centric idea; `depends` stays for other types only.
- **Consistency: replace the `when` and `place` closures with data.** O1 lets callbacks compute
  values, including guard predicates, and `when` is a predicate. A data form could not express
  searches or ranges.
- **Agent UX: make missing audit coverage an error.** Kept as the warning `RepairUnaudited`; an
  error would block early prototypes.
- **Generality: a per-query repair policy enum.** `ignoreChanges: "all"` covers the ranked-feed
  case without a second option.
