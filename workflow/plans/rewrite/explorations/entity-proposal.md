# Entity proposal (draft 7): operation-first, organised by entity

Status: a proposal, not decided. It is measured against `entities.md` (goals and correctness).
It is the chosen direction of two designs written to the same scope; `entity-centric-proposal.md`
is kept for reference and superseded (section 17). Draft 5 revised draft 4 after seven reviews.
Draft 6 made entities an **optional extension** (section 1.2) and drew one line between machines
and the store (section 1.3). Draft 7 folds in the entity-centric design as **code organisation**
(section 2.4): the library has one vocabulary, and apps are laid out entity by entity. Section 18
records each change. Draft 3 is in git history (commit `df45fec2`).

It builds on `minimal-library.md` decisions 1–8a, which are agreed. Section 13 lists every change
to agreed decisions. Section 6 is the normative runtime.

**Extension under discussion:** `entity-coordinator.md` moves this draft's coordination policy
(`loads`, `depends`, `optimistic`, `affects`, `feeds`) from the operations to one owner per data
domain, and adds one-hop repair, per-record write ordering and a generated convergence test.

**In one line.** The library keeps one vocabulary, `resource`, `transaction` and `stream`; an
entity is a Schema with an identity, and an operation becomes entity-aware through its
declarations. The entity-first mental model comes from how apps are organised: one module per
entity, its operations grouped as `Notes`, and machines that read `O.Notes.byId` and
`O.Notes.rename`.

---

## 1. The idea

> **The server owns truth and membership. An entity is a Schema with a key. Every operation stays a
> plain `resource`, `transaction` or `stream`, and says in its declaration which entities it
> loads, holds, changes, depends on or feeds. The runtime keeps every copy coherent and repairs
> every answer a change could affect. Machines own workflow and drafts.**

There are no layers. A heartbeat and a list of notes are both operations. What makes the list
entity-aware is that it declares `depends`; what makes the heartbeat entity-free is that it
declares `affects: "none"`.

**When to declare an entity.** A record has a stable key, and it either appears in more than one
answer or is changed by a command and shown elsewhere. The current user is always an entity
(`User`), never a special singleton or a plain struct, so their avatar stays coherent wherever it is
embedded.

**What the runtime promises:**

1. **Entity coherence.** Every cached copy of a record shows the same fields in the same
   publication, whoever wrote them, including optimistic changes.
2. **Result validity.** When a change settles, every answer it could affect is repaired, including
   answers that do not contain the record yet. With a stable server and **correct declarations**,
   every answer ends up as the server would return it. The declarations that can be wrong are
   `when`, `ignoreChanges`, `place` and `affects`; section 10.2 lists what catches each.

Machines read **local** data, which can include optimistic values the server has not returned.
Local observation and remote confirmation stay distinct. There is no local query language.

### 1.1 Ownership

| Concern                                           | Owner                                                |
| ------------------------------------------------- | ---------------------------------------------------- |
| Which records belong in a list, search or count   | the server, through resources                        |
| A record's fields agreeing everywhere             | the runtime (the entity store)                       |
| Which changes can affect an answer                | the resource (`depends`)                             |
| What a command changes                            | the transaction (`result`, `optimistic`, `affects`)  |
| Drafts, transitions, timing, what a failure means | machines                                             |

### 1.2 Optional, one entity at a time

Entities are an extension of the core library, imported from `flow-state/entities`.

- **An app with no entity is `minimal-library.md` exactly:** resources, transactions, streams and
  decision 6's call-site `optimistic` and `writes`. No entity store exists and none of this
  document's names appear.
- **Adoption is per entity.** Declaring `Note` changes only the operations whose Schemas carry
  notes; `Settings` can stay a plain resource with call-site `writes`. The operations keep their
  names and their machine call sites: adopting adds fields, it renames nothing.
- **One form per piece of data.** Once `Note` is an entity, every operation whose Schemas carry
  notes uses the entity forms. A call-site `setData`, `invalidate` or `clear` on a resource that
  holds notes is a `flow check` error whose message says which `depends` or `affects` to write
  instead. Hand-written cache effects stay legal only for data that is not an entity.
- **Once an app declares any entity, every operation states its relation to entities**:
  `depends` on resources, `result`/`optimistic`/`affects` on transactions, `feeds` on streams, or
  `"none"`. A forgotten relation is then a `flow check` error rather than a stale screen. Apps
  without entities write none of this.
- **When to adopt.** `flow check` hints when two resources return records with the same key
  fields ("`ticketList` and `ticketById` both return tickets; consider an entity"). It is a
  warning, because the choice is the author's.

### 1.3 Machines coordinate; the store keeps copies true

There is one coordinator. **Machines decide what happens next**: which command to send, what a
failure means, whether a draft or the server wins, when to refresh for a business reason, what to
show while waiting. **The store answers one question: is my copy still what the server would
say?** Its answer follows from what the server did and from declarations, with no choice in it.

| Mechanism                                 | Kind                                    | Owner           |
| ----------------------------------------- | --------------------------------------- | --------------- |
| every copy of a record agrees             | bookkeeping                             | store           |
| `depends`, `when`, `ignoreChanges`        | which answers the server's rules affect | store           |
| `affects`                                 | what a command changed on the server    | store           |
| hiding a record that left a list; `place` | display of server membership            | store           |
| `value` and `deleted` outcomes            | the store reports; the machine decides  | store → machine |
| `invalidate(Note.all)`                    | the machine decides; the store executes | machine → store |
| what a change means for the user          | workflow                                | machine         |

**The store never** starts a command, sends an event other than its lane outcomes, chooses a state,
or reads one entity to change another. **Machines never** maintain copies: no records in memory,
no hand refetch of an answer that `depends` already repairs (`flow check` warns on such a
handler).

This is why an optimistic operation changes only the records its command acts on (section 5.1).
"When a note moves, both folders' counts change" is a server rule between two entities; guessing
it on the client was coordination in the store. The counts are answers that depend on `Note`, and
they refetch when the move settles.

### 1.4 Not a version 1 target

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
    workspaceId: Schema.String,
    folderId: Schema.String,
    title: Schema.String,
    body: Schema.String,
    pinned: Schema.Boolean,
    author: User.pick("name", "avatarUrl"), // a nested entity
    createdAt: Schema.String,
    revision: Schema.Number,
  },
  primaryKey: ["noteId"],
  version: "revision", // optional
});

export const NoteRow = Note.pick("folderId", "title", "pinned", "createdAt");
```

`entity(...)` returns a Schema annotated as the entity, so there is no bare struct to confuse with
it.

- **`id`** is stable for traces, persistence and tools. Duplicates are a static error.
- **`fields`** is the full record, a Schema field record (D45). A field means one thing: if the list
  endpoint returns an excerpt of `body`, the excerpt is a separate field (`bodyPreview`).
- **`primaryKey`** lists top-level primitive fields. Keys are records (D27): `Note.Key` is the
  Schema `{ noteId: string }`. Key fields are immutable: a patch cannot return them (a type error).
- **Choose a key that never changes.** Use ids, never paths, row indexes or a start time that a
  drag can move. A calendar occurrence is keyed by `(eventId, originalStart)`.
- **`Note.keyOf(value)`** extracts a key. **`Note.keyString(key)`** is canonical: the key fields in
  `primaryKey` order, each encoded as JSON, joined by `/`. It is used for `actorRef` ids.
- **`primaryKey: []`** declares a **singleton**: one record per Runtime (a cart, the settings). Its
  key is `{}`; `actorRef` ids for singleton actors use their own constant.
- **`version`** names one field the server changes on **every** update, a `Schema.Number` or a
  `Schema.String` in a fixed-width encoding (zero-padded counters, ISO timestamps with fixed
  precision). Every pick of a versioned entity includes the version field automatically, so every
  write of the record carries it. `createdAt` is never a version.
- **An entity declares no operations.** It imports only other entities (for nested picks), so
  entity modules never form an import cycle with operation modules (checked by the type spike).

### 2.1 Shapes

`Note.pick(...fields)` is a Schema with the key fields (and the version field) plus the chosen
fields, carrying `Note`'s identity. Every result that contains notes builds them from `Note` or its
picks. Two forms lose the identity and therefore coherence: a struct with all of `Note`'s key fields
that is not a pick, and a pick rebuilt by spreading its fields or annotating it. `flow check` errors
on both, and warns on a struct sharing two or more fields with an entity. A deliberate detached copy
is written `Note.detached(NoteRow)`, for example a notification that should keep the title it was
sent with.

The identity is a Schema annotation under a string key, which survives `Array`, `optional`,
`NullOr`, brands and `toType` (draft 3, checked against Effect 4.0.5).

### 2.2 Nested entities

A field may hold another entity's pick, or an array or nullable of one. Renaming a user updates
every note that embeds them, in the same publication. Nesting is one way: a cycle between entity
identities is a static error. A tree (folders in folders) uses a `parentId` field and an answer of
children, not a nested self-pick.

- A nested **field change** is coherence only: it refetches nothing unless the answer depends on
  the nested entity.
- A nested **delete** forces repair of every answer holding a parent that embeds it (section 6.4).
  Until that refetch lands, the nested position keeps the record's last base values, so the
  parent's type holds.

A field holding only a key (`assigneeId: Schema.String`) is a plain field (section 7.4).

### 2.3 Where entities are found

In the declarations of the app's operations: `loads`, `result`, `depends`, `optimistic`,
`affects` and `feeds`, and through nested picks. All entity names are exported from
`flow-state/entities`. There is no registry, and definitions do not list
entities. The closed universe stays "the app lists machines".

### 2.4 Organising by entity

The entity-first mental model is a layout, not a second vocabulary. Each entity gets two modules:
its identity, and its operations grouped under one name.

```ts
// notes/note.entity.ts: the identity, importing only other entities
export const Note = entity({
  id: "notes/Note", fields: { … }, primaryKey: ["noteId"], version: "revision",
});
export const NoteRow = Note.pick("folderId", "title", "pinned", "createdAt");

// notes/notes.ts: everything you can do with notes, in this order
export const Notes = {
  byId: noteById,              // the loader (section 3)
  inFolder: notesInFolder,     // questions (section 4)
  pinnedCount: pinnedNoteCount,
  rename: renameNote,          // commands (section 5)
  move: moveNote,
  togglePin: toggleNotePin,
  remove: removeNote,
  create: createNote,
  changes: noteChanges,        // feeds (section 8)
};

// a definition lists the group like any operation
definition({ id: "notes/Editor", operations: { Notes, heartbeat }, … });

// the machine reads entity first
activities: { note: O.Notes.byId.subscribe(({ memory }) => memory.noteKey) }
actions: [O.Notes.rename.commit(({ memory }) => ({ key: memory.noteKey, title: memory.draft }))]
```

- **One core addition: operation groups.** A value in a definition's `operations` may be a plain
  object of operations; its members are reached as `O.Notes.<name>`. Groups do not nest further.
  An operation keeps its own `id`; the group only names it for machines and tools.
- **The order teaches the model.** An entity's operations module lists its loader, its questions,
  its commands and its feed, so an agent learns "start from the record, then what you ask about it,
  then how it changes".
- **It costs nothing to adopt.** Grouping is a convention over operations that already exist, so an
  app can introduce `Notes` whenever a second screen needs notes, without changing a declaration.
- **Where an operation goes** follows from its declarations: a transaction whose optimistic
  operations or result name `Note` goes in `Notes`; an answer goes in the group of the entity it
  lists or counts; a mixed answer (a global search) goes in a feature's own group. `flow check`
  warns, as a style rule, when an operation that involves only `Note` is grouped elsewhere.
- **The library ships the layout.** The docs, the examples, the reference app and the scaffolding
  all use it, so agents copy one canonical shape.
- **Users do not write their own builders.** A wrapper such as `noteQuery({ when, … })` that
  fills in `depends` would recover the entity-centric draft's inline `when`, but every codebase
  would invent its own, the generic typing is hard, and errors would point into the wrapper. Groups
  of plain operations keep every declaration visible to types, `flow graph` and agents.

**What the entity-centric design gave, and where it lives now:**

| Entity-centric gave                            | Here                                                    |
| ---------------------------------------------- | ------------------------------------------------------- |
| one module per entity, in a fixed order        | the documented layout                                   |
| `O.Notes.` lists everything about notes        | operation groups                                        |
| identity separate from operations, no cycles   | entity modules import only entities                     |
| a query cannot forget its own entity           | `depends` is required (section 4.1)                     |
| `watch` only when `load` exists                | `shape` type-checks only on `loads` resources           |
| the layer rule                                 | not needed: every operation states its relation         |
| `when` written inline, typed directly          | not kept: `depends: (on) => [on(Note, { when })]`       |

---

## 3. Loading one record: `loads`

A **loader** is a resource that declares `loads: Note` in place of `result`. Its key input is the
entity key.

```ts
export const noteById = resource({
  id: "notes/note-by-id",
  key: (input: typeof Note.Key.Type) => input,
  lookup: (key, { signal }) => NotesApi.use((api) => api.get(key, signal)),
  loads: Note,
  notFound: ["NoteNotFound"],
  staleTime: "30 seconds",
  gcTime: "5 minutes",
  persist: true,
});
```

- **Explicit, not inferred.** The key's type is erased at runtime, so a loader cannot be recognised
  by shape. `loads` is data that `flow graph` and `flow check` read. A key input that is not
  `Note.Key` is a type error.
- **At most one loader per entity** (a `flow check` error otherwise). An entity without a loader (a
  chat message, an audit entry) is seen only through answers and feeds.
- **`notFound`** is allowed only with `loads`. It lists failure tags that mean the record **no
  longer exists**: such a failure deletes the record everywhere (section 6.6). Access failures fail
  only that read. Other resources map their failures through ordinary outcomes.
- **`staleTime`, `gcTime`** are required (D32); **`persist`** is optional, as for resources.
- A loader needs no `depends`: it depends on its own record.
- A detail endpoint that returns the record plus extras (`{ note, permissions }`) is an answer
  (section 4), not a loader.
- **The current user** (`GET /me`, no key input) is an answer whose result is `User`. The session
  machine keeps `userKey` in memory from it, and views subscribe to `userById` by that key.

### 3.1 Subscribing to a loader: store first

```ts
activities: {
  note: O.Notes.byId.subscribe(({ memory }) => memory.noteKey, {
    outcomes: { value: E.NoteLoaded.from((n) => ({ title: n.title })) },
  }),
  row: O.Notes.byId.subscribe(({ memory }) => memory.noteKey, { shape: NoteRow }),
},
```

A subscription to a loader is an ordinary `subscribe` with two extra behaviours:

- **Store first.** The lane is `Success` at once when the store holds every field of `shape`
  (default: the full record), none of them is held or stale (section 6.5), and each landed within
  the loader's `staleTime` on the Runtime clock. Otherwise the lookup runs; meanwhile the lane is
  `Pending`, or `Refreshing` with data (the Resources plan's lane union).
- **`shape`** is an activity option that type-checks only on loader subscriptions. A narrow shape
  is the placeholder from the store: opening a note from its folder, `row` resolves at once from
  the list's copy while `note` loads the body. The option `placeholder` (decision 8) stays for a
  different case: keeping the previous key's data while the key changes.

The rest is ordinary resource behaviour, with these entity rules:

- **One entry per key.** Subscriptions of one key, in any actor and any shape, share one entry.
- **`pending`** is on the lane, as in 8a (section 7.3).
- **Holding.** An active subscription holds the record; after it ends, the entry's `gcTime`
  applies.
- **`value`** fires on the first `Success` (including a store-first one) and whenever the record's
  **base** changes in the subscribed shape. It never fires for optimistic changes or their
  rollback, and its payload is the base projection.
- **`deleted`** (an outcome member added to the D30 container for loader subscriptions) fires once
  a delete is confirmed. Until then, and during an undo window, the lane is `Failure` with the
  built-in `Deleted { key, confirmed }`.
- **`O.Notes.byId.refetch(keyFn)`** reloads one record: "I am unsure, ask the server".

---

## 4. Answers: resources that hold or count entities

Every resource that is not a loader declares `depends`: either the entities whose changes can
affect it, or `"none"`.

```ts
export const notesInFolder = resource({
  id: "notes/notes-in-folder",
  key: (input: { folderId: string }) => input,
  lookup: (input, { signal }) => NotesApi.use((api) => api.list(input, signal)),
  result: Schema.Struct({ notes: Schema.Array(NoteRow), total: Schema.Number }),
  staleTime: "30 seconds",
  gcTime: "5 minutes",
  depends: (on) => [
    on(Note, {
      when: (note, input) => note.folderId === input.folderId,
      // the server sorts by pinned, then createdAt
      ignoreChanges: ["title", "body", "author", "revision"],
    }),
  ],
});

export const pinnedNoteCount = resource({
  id: "notes/pinned-count",
  key: () => ({}),
  lookup: (_input, { signal }) => NotesApi.use((api) => api.pinnedCount(signal)),
  result: Schema.Struct({ count: Schema.Number }), // holds no notes, but counts them
  staleTime: "1 minute",
  gcTime: "5 minutes",
  depends: (on) => [on(Note, { when: (note) => note.pinned })],
  // no ignoreChanges: any change to a pinned note refetches the count; correct, slightly chatty
});

export const featureFlags = resource({ …, depends: "none" }); // involves no entity
```

**Kept from resources:** `key` (with D25's partial-input `refetch`), `lookup`, `result`,
`staleTime`, `gcTime`, `persist`; the machine actions `subscribe` and `refetch`; the activity
option `placeholder`.

**There is one kind of answer.** A list, a search, a page, a count, a grouping and a summary differ
only in their `result` Schema. The loader is the one record; everything else is a question.

### 4.1 `depends`

`depends` is `"none"` or a function `(on) => [on(Entity, { when?, ignoreChanges?, place?,
refresh? })]`, with one entry per entity type.

- **Why a function.** The type spike showed that a bare array of `Note.changes({ when })` calls
  cannot type `when`'s `input`: it infers as `unknown`, and `record` silently widens to the full
  record. `on`, received after `key` and `result` are known, types both. The form matches
  `optimistic` and `affects` (section 5): every list of entity declarations is a function.
- **Required, with no default.** An answer that holds an entity anywhere except a nested pick needs
  an `on` entry for it, or `flow check` errors. A count, quote or summary that depends on records
  it does not hold needs an entry too; writing `"none"` is a visible decision, not an omission.
- `on(Note, {})` means every change to a note can matter: correct, only chatty.
- Two entries for one entity type are a static error.

### 4.2 `when`: which records can be in this answer

`when(record, input)` is true for every record of that type that can appear in, or count toward,
the answer.

- **Typed by the answer.** Its first parameter has the fields the answer holds for that entity
  (key and version fields included), or the full record when the answer holds none. Reading a field
  the answer does not hold is a type error, so `NoteRow` includes `folderId`. This guarantees the
  store has every field `when` reads, for hiding and for the self-check.
- **Broader is safe, narrower is a bug.** A broader `when` costs refetches; a narrower one hides
  real records.
- **The self-check** (development, Stories, and production as a diagnostic): every record of that
  type a lookup returns must satisfy `when`, tested on the response's own values. A violation is
  `WhenViolated`, naming the record, the answer and its input. A record that arrived violating
  `when` is not hidden in that entry until a later lookup of the entry returns it satisfying `when`,
  or omits it.
- **Omitted** means every record of the type can matter.
- **Searches, ranges and server ranking** use the broadest true scope. Do not ignore the fields the
  server searches or sorts by.

### 4.3 `ignoreChanges`: field changes that cannot move this answer

`ignoreChanges` lists fields of that entity whose change cannot alter the answer beyond what
coherence and hiding already show. A change to an ignored field updates the record in place, and
refetches only if it makes the record enter or leave the answer (section 6.4, rule 3).

- **Safe direction.** Omitted means no field is ignored, so every change refetches. Forgetting a
  field costs a refetch; it never leaves a stale screen.
- **What to list:** fields that are only displayed, and fields that matter only by deciding
  membership through `when`. A live map lists `lat` and `lng`: a moving driver refetches the
  viewport only when it crosses its edge. Never list a field the server sorts or groups by, nor one
  that feeds a context field such as `total`.
- The version field changes on every update. List it unless the answer sorts by it ("recently
  updated").
- The type restricts names to the entity's fields.

### 4.4 `refresh: "manual"`: answers that must not move under the user

A ranked feed, or search results being read, must not reorder while the user reads them. With
`refresh: "manual"`, changes that would refetch the entry only mark it stale; it refetches when the
machine runs `refetch` (a "new posts" button) or on its next subscription. Coherence and hiding
still apply, and `place` still inserts. Such an entry is outside guarantee 2 until it refetches,
and the repair audit skips it.

### 4.5 Leaving is immediate; entering waits

1. **Leaving.** A record whose **visible** value no longer satisfies its entry's `when` is hidden
   from the answer at once, in every array position of that entity type. Moving a note to another
   folder removes it from the old folder's list in the same publication as the optimistic patch. A
   single nullable position becomes `null`; a required single position cannot be hidden, so the
   answer gets a forced repair instead. An answer whose `on` entry has no `when` never hides.
2. **Entering.** A record that now satisfies `when` appears when the repair refetch lands, or at
   once with `place` (section 4.7).
3. **Context fields** (`total`, highlights, ranks) belong to the answer and become valid at its
   refetch. Between a change and the refetch, `total` can disagree with the visible list.
4. **Selectors** may sort, group and filter for presentation (a local "show only mine" toggle).
   They must not re-implement a server membership rule; leaving is the runtime's job.

### 4.6 Several entity types in one answer

An answer may hold several types, nested (`author`), as their own lists, or as a union in one array
(a file manager's `Array(Schema.Union(FileRow, FolderRow))`, a global search), and declares one `on`
entry per type that can move it:

```ts
depends: (on) => [
  on(Note, { when: (note, input) => note.workspaceId === input.workspaceId }),
  on(Folder, { when: (folder, input) => folder.workspaceId === input.workspaceId,
               ignoreChanges: ["color"] }),
],
```

There is no home entity: each type is declared the same way. The search result Schema must hold
`workspaceId` in both picks for these `when`s to type-check.

### 4.7 `place`: entering without waiting

For lists the client can extend itself (a chat channel, comments, an activity log, notifications),
the `on` entry declares where a newly matching record goes:

```ts
depends: (on) => [
  on(Message, { when: (m, input) => m.channelId === input.channelId, place: "start" }),
], // the server returns newest first
```

- It is the constant `"start"` or `"end"`. Paged answers follow section 4.8.
- It applies when a record enters: it is not in the entry, and its visible value now satisfies
  `when`. The source can be an optimistic insert, a command result or a feed upsert. A feed upsert
  is placed only if it carries every field the answer's shape needs.
- **A placement is an overlay on the entry,** like an optimistic operation. It survives lookups
  that started before the change, and ends when a lookup that started after the change lands; the
  server's membership is then authoritative.
- **A placement never suppresses repair.** The entering refetch still runs, coalesced, so order and
  context fields become correct. A wrong `place` is therefore a flicker, not a lasting error.
- It is allowed only when the result holds exactly one bare array of that entity, not inside a
  wrapper (`{ post, rank }`) or a grouping (static check). Such answers enter at the refetch.

### 4.8 Pages

Page-numbered lists are ordinary answers with `page` in their input; a repair refetches the active
page and marks other pages stale.

Infinite lists need one entry that grows, because memory holds keys and never copies. This is a
**resource change** decided separately (section 13.2):

```ts
pages: { next: (result) => (result.hasMore ? result.cursor : undefined), repair: "first" },
lookup: (input, { signal, cursor }) => ChatApi.use((api) => api.messages(input, cursor, signal)),
```

- Pages extend at the end, in fetch order. The lane's `data` is `{ pages: Result[] }`, and a record
  appears once at assembly even if two pages return it.
- `O.Messages.inChannel.fetchMore(inputFn)` loads the next page; it is a no-op without a `next`.
- **`repair`**: `"loaded"` (default) refetches the loaded pages in order, as TanStack Query does;
  `"first"` refetches the first page and drops the rest, which suits feeds and inboxes where 20
  loaded pages would mean 20 requests per change.
- A repair supersedes a `fetchMore` in flight. Each page is judged by its own start revision for
  the convergence rule.
- `place: "start"` inserts into the first page. `"end"` inserts into the last page only when it has
  no `next`; otherwise the record is not placed and waits for the refetch.

---

## 5. Commands: transactions that change entities

A command is an ordinary `transaction`. Every transaction field and behaviour applies: `commit`,
`concurrency` (required, D31), outcomes, `unknown`, `attempt.id`, `cancel`, `delay` and
`progress`. It becomes entity-aware through `result`, `optimistic` and `affects`.

```ts
export const renameNote = transaction({
  id: "notes/rename",
  input: { key: Note.Key, title: Schema.String },
  key: (input) => input.key,
  commit: ({ key, title }, { signal, attempt }) =>
    NotesApi.use((api) => api.rename(key, title, { signal, attempt })),
  result: Note,
  optimistic: (input) => [Note.patch(input.key, () => ({ title: input.title }))],
  concurrency: "serialize",
});

export const moveNote = transaction({
  id: "notes/move",
  input: { key: Note.Key, from: Folder.Key, to: Folder.Key },
  key: (input) => input.key,
  commit: …,
  result: Note,
  optimistic: (input) => [Note.patch(input.key, () => ({ folderId: input.to.folderId }))],
  // the folders' noteCount is not guessed: folder answers depend on Note and refetch on settle
  concurrency: "serialize",
});

export const toggleNotePin = transaction({
  id: "notes/toggle-pin",
  input: { key: Note.Key },
  key: (input) => input.key,
  commit: …,
  result: Note,
  optimistic: (input) => [Note.patch(input.key, (note) => ({ pinned: !note.pinned }))],
  concurrency: "serialize",
});

export const removeNote = transaction({
  id: "notes/remove",
  input: { key: Note.Key },
  key: (input) => input.key,
  commit: …,
  optimistic: (input) => [Note.remove(input.key)],
  concurrency: "serialize",
});

export const createNote = transaction({
  id: "notes/create",
  input: { note: Note.pick("noteId", "folderId", "title", "createdAt") },
  key: (input) => Note.keyOf(input.note),
  commit: …,
  result: Note,
  optimistic: (input) => [Note.insert({ ...input.note, body: "", pinned: false, … })],
  concurrency: "allow",
});

export const heartbeat = transaction({
  id: "session/heartbeat",
  input: {},
  key: () => ({}),
  commit: (_input, { signal }) => SessionApi.use((api) => api.ping(signal)),
  affects: "none", // involves no entity
  concurrency: "reject",
});
```

- **`input`** is a Schema field record, required on every transaction (`input: {}` for none):
  optimistic operations, `affects` and `key` are typed from it, and traces show it. This narrows
  D46.
- **`key`** is the concurrency key, as today. A bulk command keys on its scope (`{ workspaceId }`),
  not on its first record; `flow check` warns on a key that indexes into an input array.
- **`result`** is any Schema; every entity record in the response is written to the store.
- **A transaction states its relation to entities.** It names one through `result`, `optimistic` or
  `affects`, or it says `affects: "none"`. A transaction with none of these is a `flow check`
  error, so a bulk archive written as a bare commit cannot pass as a heartbeat.

### 5.1 Optimistic operations

`optimistic` is a function of the input. It returns a **fixed list** of operations on **one entity
type, at keys taken from the input**: the records the command acts on.

| Operation                           | Meaning                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| `E.patch(keys, (record) => fields)` | change fields of held records; absent records are skipped (traced) |
| `E.upsert(record)`                  | patch the record if held, insert it otherwise                      |
| `E.remove(keys)`                    | hide records everywhere                                            |
| `E.insert(record)`                  | add a record with a client-generated key                           |

- **`keys`** is one key or an array of keys; an empty array is allowed.
- **Only the command's own records.** Operations on a second entity type, or at keys read from the
  store, are a `flow check` error (section 1.3). Several records of the same type are fine: a
  transfer patches both accounts, a bulk archive patches every selected user. Records the command
  changes as a consequence (counts, other entities) are repaired through `depends` and `affects`
  when it settles. A screen that needs an instant count derives it in a selector from records it
  already holds.
- **Why a function.** The type spike showed that `[E.patch((input) => …, …)]` cannot be typed:
  TypeScript does not carry the transaction's inferred input into the nested call.
  `(input) => [...]` types fully, and rejects key fields, unknown fields and another entity's key.
- **Structure stays visible, through one declared exception to O1.** At construction the Runtime
  calls `optimistic` once with a recording probe and records the sequence of entity and operation
  kinds. An admission that returns a different sequence is a defect, so the list stays as static as
  decision 6's. `flow graph` reads the recorded sequence; the keys and fields each admission writes
  are in the trace. O1 says construction runs no user callbacks; this is the one place it does
  (section 13.1).
- **A patch reads only its own record** (the `record` argument). A patch whose record the store
  does not hold is skipped, and its key is still repaired when the command settles.
- **Pure.** `flow check` flags `Date.now`, `new Date`, `Math.random`, `crypto` and
  `URL.createObjectURL` in optimistic functions and commit input functions. **Ids and timestamps
  come from the event payload**: the UI mints them when it builds the event, and Stories pass them
  explicitly. Stories run each optimistic function twice per start and compare, as a determinism
  check.
- **Operations apply when the commit starts** (decision 6): at once for an unqueued commit, when a
  `serialize`d commit leaves its queue, and at admission for a `delay`ed commit (the undo window is
  part of the attempt). They are layered over the base, replayed in order whenever something
  beneath them changes, and end as in section 5.4.

### 5.2 Creates

- **With a client key:** `insert` adds a record whose key comes from the input. Answers with
  `place` show it at once; others after the entering refetch. On success the response replaces it.
- **Overlays belong to their attempt.** A retry of a create whose attempt is `unknown` re-sends the
  same key; its `insert` replaces the earlier attempt's operation, even if the record has entered
  the base since (the server did create it). A late response of the earlier attempt no longer ends
  the overlay. Any other `insert` of a key already in the store is a defect; use `upsert`.
- **With a server key:** no optimistic form in version 1 (section 14). A pending create is shown
  from the machine's memory (the draft it is sending), merged after the list in the view.

### 5.3 What a command affects

The keys a command affects are the union of records in its `result`, keys its optimistic
operations name, and `affects`:

```ts
affects: (input) => [Folder.keys(input.folder), AuditEntry.all],
```

- `Folder.keys(key | keys)` names records; `Folder.all` names every record of the type (after a
  permission change, an import, a bulk job). `affects` is a function for the same typing reason as
  `optimistic`.
- **Changed fields** decide `ignoreChanges` (section 4.3): the patched fields, the fields where the
  result differs from the base (a field the base lacked counts), and the version field. An
  `affects` target, a failure, a defect or an `unknown` ending changes every field.
- **Resources that involve no entity** are not refreshed by entity commands. If a report should
  change when notes change, it depends on `Note`. A transaction that names no entity keeps decision
  6's call-site `writes` for such resources (section 13.1).

### 5.4 How a command ends

| Ending                                               | Store                                                             | Repair                    |
| ---------------------------------------------------- | ----------------------------------------------------------------- | ------------------------- |
| success                                              | fields the response carries are promoted, then the result is written; deletes become permanent | per changed field |
| success, a patched field the response does not carry | the field stays as a **held** overlay (section 6.5)               | that record, forced       |
| failure or defect                                    | operations removed (decision 6)                                   | affected keys, all fields |
| rejected, or cancelled before sending                | operations removed                                                | none                      |
| cancelled after sending, abandoned, restored mid-flight | `unknown`: operations stay; records read `pending`             | affected keys, forced     |
| `unknown` resolved                                   | by `EntityChange.Confirm(attempt.id)` or `O.Notes.rename.settle(…)` | all fields                |

- **Only the server's fields become base.** A bulk resolve whose response omits a key that failed,
  or a command whose response omits a field it patched, holds that patch (no flicker back) and
  forces repair of the record, so the refetch shows the truth.
- **Every failure repairs.** The server may have rejected the command because the client's data was
  stale (`VersionConflict`, `OutOfStock`), so the affected records refetch. A validation failure
  costs one extra refetch.
- **An `unknown` overlay ends with the first read that started after the attempt became
  `unknown`.** The forced repair is that read: when it lands, the overlay is removed and the record
  shows what the server says, `pending` turns false, and the record is released if nothing else
  holds it. **The attempt itself stays unresolved for the machine**, which received its `unknown`
  outcome and may still `settle` it; a later `Confirm` or `settle` changes no data, only fires the
  optional `settled` outcome. Displayed data never waits on evidence that may never come.

### 5.5 Concurrency across actors

Concurrency stays actor-local and exact-key (Transactions D1, kept under D10). Two actors that
rename the same note both send. With a `version`, the store keeps the higher version whatever order
the responses arrive in. Without one, the order of the results cannot be trusted, so the field is
**contested** (section 6.3) and a forced repair reads the server's answer. When edits to one record
must queue, use one shared actor per record (`actorRef(EditorMachine, Note.keyString(key))`) in
every screen.

---

## 6. The store

### 6.1 Records

One record per key: the fields received so far, each with the version, start revision, landed
revision and landed time of the write that set it. A record has a **base** (what the server has
said) and a **visible** value (base plus active overlays: optimistic, held and placed). Answers
store their result with every entity position replaced by a reference and are assembled at
publication, with structural sharing, so an element keeps its identity while its projected fields
are unchanged.

A snapshot carries the store revision it was published with, as part of its plain frozen data (a
change to decision 8 and D22, section 13.1). `Note.get` and lanes read that revision, so
checkpoints show the truth of their own moment.

### 6.2 One write path

Every source changes records through `upsert(key, fields, meta)` and `delete(key, meta)`: a lookup
result, a command result, a promotion, a feed change and a restore. A write carries only the fields
its shape has; absent fields keep their values; `null` is a value.

### 6.3 Ordering

For each field, a write replaces the stored value when:

- **both carry a version:** its version is **strictly greater**. A lower version is rejected; an
  equal version falls through to the revision rule;
- **otherwise:** its start revision is at or after the stored field's landed revision.

Start revisions: a lookup when it started; a feed change when it arrived; a command result and its
promoted fields when the command **settled**; a restore at 0.

**Contested fields.** Without versions, start revisions order requests, not server truth. A field
becomes **contested** when a write carries a **different value** and either:

- it is a command result landing on a field that another write set after this command was sent; or
- it is skipped by the rule above.

A contested record gets a forced repair (section 6.4). The repair's lookup starts after both
writes, so it lands and ends the contest. A contested record that nothing holds is released, which
ends the contest too. Declaring `version` removes contests.

**Disagreeing sources.** If one field flips between two values from two different sources twice in
a row (A, then B, then A), the runtime stops read-triggered repair for that field and reports
`FieldDisagrees`, naming the field and both sources. It means two endpoints return different values
under one name (an excerpt and a full body, a price in two currencies): the fix is two fields, or
the context (currency, locale) in the key. Forced repairs of one record are capped per drain, and
exceeding the cap reports `ContestLoop`.

### 6.4 Repair

**Ordinary repair.** For each settled change to a record of entity `E` (a command ending in section
5.4, a feed write, or a read revealing newer base fields), each active answer is refetched when:

1. it holds the record, or has an `on(E, …)` entry;
2. its `when` for `E` holds for the base value just before or just after the write (an unknown
   field counts as a match, including for a delete of an unheld key), or it currently holds the
   record;
3. a changed field is not in its `ignoreChanges` for `E`, or the change makes the record enter or
   leave the answer;
4. its data **started before** the change (the convergence rule).

An entry with `refresh: "manual"` is marked stale instead. Inactive answers that match are marked
stale. A loader entry holding the record is refetched only if no command result or feed write
carried the changed fields.

**Forced repair** refetches a record's loader entry and every active answer holding it, regardless
of `ignoreChanges` (rule 4 still applies). It happens when the record has a held field, a contested
field or an `unknown` overlay, or when it is a deleted nested record (then its parents' answers
refetch).

**Coalescing.** Refetches are coalesced per answer until the Runtime has drained its current ready
work, so a bulk command or a burst of feed changes refetches each answer once. This needs no clock
or configuration, and a Story's `process()` drains it like any other work. A coalesced refetch uses
the latest change it covers for rule 4.

**The in-flight fence.** A lookup running when a matching change settled still writes fields, but
its entry is refetched once it lands, unless a lookup that **started after the change** is
scheduled, in flight or landed. An entry with no data is simply loaded.

**Repair reads base values**, never visible ones, so an overlay can neither trigger a refetch nor
hide a real server change.

### 6.5 Holding, staleness, held fields and feed writes

**Holding.** A record exists while something holds it: an answer that references it (until the
answer's `gcTime` after its last subscriber), an active loader subscription, or an active overlay.

**Staleness has one representation**: a stale floor per entity, a store revision. A field that
landed before the floor is stale. Raising the floor is how the runtime says "do not trust what you
have": active answers and loader entries holding the entity refetch; inactive ones, and store-first
reads, treat their data as stale. It is raised by `invalidate(Note.all)`, by a feed's first connect
and every reconnect, and by restore.

**Held fields.** A held field (section 5.4) stays visible until a base write to it lands from a read
that started after settlement. A store-first read that finds a held field runs its lookup. When
nothing holds the record any more, the held field is dropped with it.

**A feed write to a key nothing holds:**

1. is tested against every active answer with an `on` entry for the entity, with unknown fields
   matching;
2. is placed in each matching answer whose `place` applies and whose shape the write satisfies;
   that answer then holds it;
3. triggers an entering refetch of every other matching answer;
4. if it is a `Delete`, leaves a tombstone while any lookup that started before it is in flight, so
   that lookup cannot resurrect the record;
5. is otherwise dropped, and the trace records why.

### 6.6 Deletes

`remove` hides a record everywhere at admission: every array element holding it is left out at
assembly. Success makes it permanent. A loader subscription shows `Deleted { key, confirmed }`. A
tombstone stays while any read that started before the delete is in flight. A `notFound` failure, a
feed `Delete` and a successful `remove` all delete through the one write path.

**A `notFound` never deletes a record being created.** While an `insert` of that key is unsettled,
or for a lookup that started before such an insert settled, `notFound` fails the lookup and deletes
nothing. A command result always beats a tombstone created before the command settled.

A deleted singleton is reloaded by its next subscription, so "the cart was checked out" reads as an
empty cart from the server.

### 6.7 Persistence and restore

Persistence stores **base data only**: each persisted answer's references and context, and, for
each referenced record, only the fields that persisted answers project. A loader with `persist:
false` therefore keeps its full body out of storage even when a persisted list references the same
record. Optimistic overlays are never written. Restore writes at revision 0 and raises the stale
floor, so any live write wins. An attempt restored as `unknown` (D34) keeps `pending` true on its
keys until its forced repair lands. A different principal means a new Runtime (minimal-library
decision 10).

---

## 7. Machines and definitions

### 7.1 Definitions list operations, as today

```ts
export const Editor = definition({
  id: "notes/Editor",
  operations: { Notes, heartbeat },
  memory: {
    noteKey: Note.Key,
    draft: Schema.String,
    submitted: Schema.String,
    dirty: Schema.Boolean,
    changedElsewhere: Schema.Boolean,
  },
  …
});
```

Machines use `O.Notes.byId.subscribe`, `O.Notes.inFolder.subscribe`, `.refetch` and `.fetchMore`,
`O.Notes.changes.subscribe`, and `O.Notes.rename.commit`, `.cancel` and `.settle`, unchanged from
decisions 1–8a.

One action is added, beside `send` and `deny`: **`invalidate(Note.all)`** raises `Note`'s stale
floor (section 6.5), so every answer and loader holding notes refetches, as after a permission
change or a finished import. It names the entity as data, so `flow graph` draws the edge.

**Changed (decision 6):** for a transaction that names entities, the call site carries only
outcomes and timing (`delay`). `optimistic` moves to the transaction, and `result`, `affects` and
`depends` replace `writes`. A transaction that names no entity keeps decision 6 unchanged,
including call-site `writes` on resources that involve no entity. Section 13 has the table.

### 7.2 Memory holds keys and drafts

- `flow check` errors on memory whose Schema contains an entity shape. Keys are `Note.Key`.
- A draft records whether it is `dirty` and what was last `submitted`. A `value` outcome always
  updates what the machine knows of the server; it replaces the draft only when the draft is clean,
  and it is not a conflict when it carries what this machine submitted.
- Events may carry records as snapshots of a moment; machines read current data through lanes.
- Refs and inputs use keys:
  `editorRef = (key) => actorRef(EditorMachine, Note.keyString(key), …)`.
- Context exposes keys and primitives, never records: `Session.select(({ memory }) =>
  memory.userKey)`, and the consumer subscribes to `userById` by that key.

### 7.3 Reading in views and guards

Decision 8 stands: components read lanes through `useView`. One passive reader reads records:

```ts
Note.get(source, key, NoteRow) // { data, pending } | undefined: 8a's entry type; starts nothing
```

- **`source`** is a snapshot, in views, guards and Story assertions. It is the only way to read a
  record by key; `O.Notes.byId.get` is a type error that points to it. `O.x.get(s, input)` stays for
  answers (8a).
- **`pending`** is true while an optimistic or held overlay on the record awaits settlement, or an
  `unknown` overlay waits for its repair. It is 8a's name, kept. Per-row saving in a list reads
  `Note.get(s, row, NoteRow)?.pending`.
- `flow check` warns when a machine's guards or the components that render its snapshot `get` an
  entity that none of the machine's activities hold.

### 7.4 Records referenced by key

A list of notes with `assigneeId` needs user names. In order of preference:

1. the server embeds `assignee: User.pick("name")`, which stays coherent;
2. a resource that returns the users the view needs (`usersByIds`);
3. `User.get(s, key, UserChip)` when an activity of the same machine already holds them.

Subscribing to a loader over an array of keys, with a batched lookup, is version 2 (section 14).

---

## 8. Feeds: streams of entity changes

```ts
export const workspaceChanges = stream({
  id: "notes/workspace-changes",
  key: (input: { workspaceId: string }) => input,
  subscribe: (input) => NotesApi.use((api) => api.changes(input)),
  feeds: [Note, Folder.pick("name", "noteCount")], // the entities and fields each change carries
  gcTime: "1 minute",
});
```

- **`feeds`** names one entity, one pick, or several. A stream with `feeds` emits batches of
  `EntityChange.Upsert(entity, fields, { version? })`, `EntityChange.Delete(entity, key, {
  version? })` and `EntityChange.Confirm(attemptId)`; each batch is applied in one turn. One socket
  carrying several entity types is one feed.
- Each change is a write (section 6.2): it updates every copy, and repairs only when it changes a
  **base** field. A feed write to a key nothing holds follows section 6.5.
- A feed is a machine activity (`O.workspaceChanges.subscribe(…)`), shared by key across actors.
- **First connect and every reconnect** raise the stale floor of each fed entity (section 6.5), so
  changes made before the subscription or during a gap are never lost.
- The feed's lane `data` is `undefined`; its status says whether it is live. Machines react to
  records through loader and answer `value` outcomes, and to the feed's failures through its
  outcomes.
- **`flow check` errors** on a stream without `feeds` whose emitted Schema contains an entity pick.

A stream without `feeds` stays a stream of occurrences mapped to events: the user's own location,
typing, presence, a CRDT document session, toasts.

---

## 9. Operations that involve no entity

There is no separate layer: an operation that declares `depends: "none"` or `affects: "none"` simply
has nothing to repair.

| Need                                  | Form                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| keep-alive heartbeat                  | a `transaction` with `affects: "none"`, sent by a schedule                   |
| refresh an auth token                 | a schedule and a `transaction`; the token lives in a provider actor          |
| analytics events                      | a fire-and-forget `transaction` with `affects: "none"`                       |
| feature flags, app config             | a `resource` with `depends: "none"`, read by one provider actor              |
| reports and dashboards over no entity | `resource`s with `depends: "none"`                                           |
| poll a job until it finishes          | a schedule sends `PollDue`; the action is `O.job.refetch`; `value` moves on  |
| upload bytes to a signed URL          | a `transaction` with `progress`; the record it creates comes from a command  |
| presence, typing, own location        | a `stream` mapped to events                                                  |
| a collaborative document body         | a `stream` to the sync provider, owned by a document actor                   |

**When the job's result changes records,** the machine's `JobFinished` handler runs
`invalidate(Note.all)`, or the job is started by a transaction with `affects: () => [Note.all]`.

---

## 10. Stories and tools

### 10.1 Stories

- **Stateful fixtures.** A fixture Layer holding a `Ref` is a small in-memory server, so a lookup
  returns updated data after a command. Slow and failing responses are fixtures on the Runtime
  clock, as in minimal-library section 11.
- **Feeds are fixtures too.** A feed fixture scripts its changes on the Runtime clock (`at:
  "2 seconds"`), so `advance` delivers them at an exact step. No new Story command is needed, and
  decision 4's "no test-only escape" holds.
- **Assertions:** `Note.get(checkpoint.snapshot, key, Shape)` and the trace's refetch records.
- **Checkpoints** include the store revision they were published with: records, tombstones and
  overlays, serialised once per revision.

### 10.2 What catches a wrong declaration

| Wrong declaration                                  | Caught by                                                 |
| -------------------------------------------------- | --------------------------------------------------------- |
| `when` reads a field the answer lacks              | the type system                                           |
| `when` narrower than the server                    | `WhenViolated` on every lookup, in all environments       |
| `ignoreChanges` names a field the server sorts by  | the repair audit                                          |
| a wrong `place`                                    | self-correcting at the entering refetch; the repair audit |
| a missing `on` entry for a held entity             | `flow check` error                                        |
| a count that depends on nothing                    | `flow check` error (`depends` is required)                |
| a count that wrongly says `depends: "none"`        | the repair audit                                          |
| a transaction that states no relation              | `flow check` error                                        |
| a missing `affects` key                            | the repair audit                                          |
| an entity copied as a plain struct                 | `flow check` error, or warning for a partial copy         |
| a stream carrying entities without `feeds`         | `flow check` error                                        |
| two endpoints disagreeing on a field               | `FieldDisagrees`                                          |

### 10.3 The repair audit

At the end of every Story run with a stateful fixture, after `process()` drains, the runtime
refetches every active answer against the fixture **on a fork of the store**, and compares each with
the assembled value. A difference is `RepairMissed`, naming the answer and the first differing
record or field. The fork leaves the run's checkpoints and refetch counts untouched. Entries with
`refresh: "manual"` are skipped.

- A Story without a stateful fixture reports `AuditSkipped`.
- A Story that commits a transaction while its stateful fixture's state never changes reports
  `FixtureInert`, because the audit would then pass vacuously.
- `flow check` warns `RepairUnaudited` for an entity-aware operation that no audited Story runs.
- **Limit:** the fixture is written by the same author, so the audit checks the client against the
  author's idea of the server. It catches inconsistent declarations, not a misunderstood API.

### 10.4 `flow graph`

Entities are derived nodes. Edges:

- machine → operation (subscribes, commits), as today; machine → entity (`invalidate`);
- resource → entity (loads; holds, from the result Schema; depends);
- transaction → entity (changes, from the recorded optimistic sequence and the result Schema;
  affects);
- stream → entity (feeds);
- derived actor-level edges ("Editor affects Folder view through Note").

### 10.5 `flow check`

| Rule                                                                    | Level   |
| ----------------------------------------------------------------------- | ------- |
| a struct with an entity's key fields that is not a pick; a rebuilt pick | error   |
| a struct sharing two or more fields with an entity                      | warning |
| memory holds an entity shape                                            | error   |
| impurity in optimistic or commit input functions                        | error   |
| two loaders for one entity                                              | error   |
| in an app with entities, a resource that is not a loader without `depends` | error |
| a call-site `setData`, `invalidate` or `clear` on a resource holding an entity | error |
| optimistic operations on a second entity type                           | error   |
| an entity held outside a nested pick without an `on` entry              | error   |
| two `on` entries for one entity type                                    | error   |
| in an app with entities, a transaction with no `result`, `optimistic` or `affects` | error |
| a stream carrying entity picks without `feeds`                          | error   |
| `place` on a result without exactly one bare array of that entity       | error   |
| `notFound` tags absent from the lookup's failure Schema                 | error   |
| an entity cycle through nested picks; duplicate entity ids              | error   |
| a transaction `key` indexing into an input array                        | warning |
| a handler refetching an answer that `depends` already repairs           | warning |
| two resources returning the same key fields with no entity declared     | warning |
| an operation involving only one entity grouped outside that entity's group | warning |
| a loader subscription without a handler for `Deleted` or `notFound`     | warning |
| `get` on an entity no activity of the machine holds                     | warning |
| an entity-aware operation no audited Story runs (`RepairUnaudited`)     | warning |

### 10.6 Traces

Every branch of section 6.4 is a traced decision. The trace records:

- each record write: cause, fields, version, skipped fields, contests and disagreements;
- each refetch with its reason ("`moveNote` settled; `folderId` is not ignored; `when` matched the
  old value");
- each **suppressed** repair with its reason: `when` matched neither value, ignored field,
  convergence rule, coalesced, marked stale;
- each hidden record, placement, held field, stale-floor raise, tombstone, fenced lookup, dropped
  feed write, construction probe and self-check result.

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
        { outcomes: { failure: { PinRejected: E.PinFailed } } })],
    },
  },
}

// The badge
activities: { pinned: O.Notes.pinnedCount.subscribe(() => ({})) }

// The editor. NoteLoaded is an internal event; PinFailed, Saved and SaveUncertain carry no payload.
OPEN: {
  activities: {
    note: O.Notes.byId.subscribe(({ memory }) => memory.noteKey, {
      outcomes: { value: E.NoteLoaded.from((n) => ({ title: n.title })) },
    }),
  },
  on: {
    NoteLoaded: {
      target: "self",
      updateMemory: ({ memory, event }) =>
        !memory.dirty
          ? { draft: event.title }
          : event.title === memory.draft || event.title === memory.submitted
            ? {}
            : { changedElsewhere: true },
    },
    TitleChanged: {
      target: "self",
      updateMemory: ({ event }) => ({ draft: event.title, dirty: true }),
    },
    SaveRequested: {
      target: S.OPEN.SAVING,
      updateMemory: ({ memory }) => ({ submitted: memory.draft }),
      actions: [
        O.Notes.rename.commit(({ memory }) => ({ key: memory.noteKey, title: memory.draft }), {
          outcomes: { success: E.Saved, unknown: E.SaveUncertain },
        }),
      ],
    },
    Saved: {
      target: "self",
      updateMemory: ({ memory }) => ({ dirty: memory.draft !== memory.submitted }),
    },
  },
}
```

| Event                                    | What every screen shows, with no author code listing screens               |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| Rename admitted                          | the new title in the editor's lane and the folder's row, same publication  |
| Rename succeeds                          | the result is written; the list does not refetch (`title`, `revision` ignored); the count refetches only if the note is pinned |
| Pin toggled                              | the row flips at once; on success the list and the count refetch           |
| Note moved to another folder             | it leaves the old folder at once and enters the new one at its refetch; both folders' counts refetch when the move settles |
| A second editor, dirty                   | `value` fires with the new base; memory sets `changedElsewhere`; the draft is kept |
| The editor's own save, typing continued  | `value` carries the submitted title, which is not a conflict; `dirty` stays true |
| Two editors rename at once               | the higher `revision` wins in every copy, whatever order the responses arrive in |
| A save cancelled after sending           | `unknown`: the guess shows with `pending`; the forced repair replaces it with the server's title; the machine still holds `SaveUncertain` |
| Note deleted by another user (feed)      | every list drops it; the editor's lane is `Deleted { confirmed: true }` and `deleted` fires |

### 11.2 Many entities together: a board

`Board`, `Column`, `Card` and `User`; cards embed `assignee: User.pick("name", "avatarUrl")`.

```ts
export const cardsOnBoard = resource({
  id: "board/cards-on-board",
  key: (input: { boardId: string }) => input,
  lookup: …,
  result: Schema.Struct({ cards: Schema.Array(CardTile) }),
  staleTime: "30 seconds",
  gcTime: "5 minutes",
  depends: (on) => [
    on(Card, {
      when: (card, input) => card.boardId === input.boardId,
      // the view groups by columnId and sorts by position
      ignoreChanges: ["columnId", "position", "title", "assignee", "revision"],
    }),
  ],
});

export const moveCard = transaction({
  id: "board/move-card",
  input: { key: Card.Key, columnId: Schema.String, position: Schema.String },
  key: (input) => input.key,
  commit: …,
  result: Card,
  optimistic: (i) => [Card.patch(i.key, () => ({ columnId: i.columnId, position: i.position }))],
  concurrency: "serialize",
});
```

- Dragging patches one record; the selector groups by `columnId` and sorts by `position`; nothing
  refetches. Fractional positions come from the event payload.
- Renaming a user updates the avatar on every card through nesting, with no refetch.
- Deleting a column is `removeColumn` with `affects: () => [Card.all]`: cards repair by refetching
  `cardsOnBoard`.

### 11.3 Other applications

| App               | Entities                               | Notable use                                                            |
| ----------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| Chat              | `Channel`, `Message`, `User`           | `channelMessages` with `pages` (`repair: "first"`) and `place: "start"`; a workspace feed; sends `insert` with client ids; reactions ignored |
| Social feed       | `Post`, `User`                         | `homeFeed` with `refresh: "manual"` and a "new posts" refetch; likes stay coherent everywhere |
| Storefront        | `Product`, `Cart` (singleton), `Order` | `addCartLine` returns the whole cart; `shippingQuote` depends on `Cart`; an `OutOfStock` failure repairs the cart |
| Banking           | `Account`, `Txn`, `Payee`              | `transfer` patches both balances (held until the refetch) and `affects: () => [Txn.all]` |
| E-mail            | `Thread`, `Label`, `Contact`           | `archiveThread` patches the thread's `labelIds`; label counts and `unreadCounts` depend on `Thread` |
| Calendar          | `Event`, `Occurrence`                  | range answers with an overlap `when` that ignores `start` and `end`; series edits `affects: () => [Occurrence.all]` |
| Spreadsheet       | `Sheet`, `Cell`                        | a cell edit is `Cell.upsert`, so an empty cell is optimistic too        |
| Settings, profile | `Settings` (singleton), `User`         | `O.settings.subscribe(() => ({}))` on the singleton's loader; one transaction per section |
| Admin back-office | `User`, `Role`, `AuditEntry`           | filtered answers; bulk transactions keyed by scope with held per-key patches; `AuditEntry` has no loader |
| Maps, IoT         | `Driver`, `Device`, `Trip`             | `driversNear` ignores `lat`/`lng`, so it refetches only when a driver crosses the viewport's edge; the feed places entering drivers |
| File manager      | `Folder`, `File`                       | a folder's children are one union array with an `on` entry per type   |
| Global search     | `Note`, `Folder`, `User`               | one answer with three `on` entries; no entity is its home              |
| Analytics         | none                                   | resources with `depends: "none"`                                       |

---

## 12. Naming

- **`result`**, not `schema` or `data`: it names the role of the value. A transaction has two
  Schemas (`input` and `result`), so `schema` would be ambiguous. Whether resources rename `data`
  to `result` is decided separately (section 13.2).
- **`entity`:** an identity and nothing else. Operations keep their own names (`noteById`,
  `renameNote`), chosen by the author, as today; a group (`Notes`) gives them their entity-first
  names for machines (`O.Notes.byId`).
- **`loads`, `feeds`:** the two explicit markers of a resource's and a stream's entity role.
- **`depends` with `on`; `affects` with `keys` and `all`:** the answer's side and the command's
  side of repair. `"none"` is the explicit statement that an operation involves no entity.
- **`ignoreChanges`:** named for the safe direction; omitting it is never wrong.
- **`refresh: "manual"`:** a separate option, because deferring a refetch is not the same as
  ignoring a field.
- **`primaryKey`:** `key` already means the cache and concurrency key.

---

## 13. Changes to agreed decisions and to the base vocabulary

### 13.1 Agreed decisions

| Agreed                                                | Draft 5                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------- |
| decision 6: `optimistic`, `writes` at the commit call | entity-aware transactions: `optimistic` on the transaction; `result`, `affects` and `depends` replace `writes`; others unchanged |
| decision 6: optimistic writes as a static list        | `(input) => [...]` on one entity type, a fixed list recorded at construction (the types require it) |
| decision 6: call-site `writes`                        | kept for data that is not an entity; an error on resources holding one |
| O1: construction runs no user callbacks               | one exception: the optimistic probe at construction               |
| decision 6: `unknown` keeps the optimistic value      | until the forced repair lands; the attempt stays unresolved for the machine |
| decision 8, D22: snapshots carry no store revision    | a snapshot carries the revision it was published with, for `Note.get` |
| 8a lane `pending`                                     | kept; also on `Note.get` entries                                  |
| 8a "version 1 stitches pages in memory"               | `pages` proposed instead (13.2), since memory holds keys only     |
| D30 outcomes container                                | adds `deleted` for loader subscriptions                           |
| D46 Schemas only at boundaries                        | `input` required on every transaction                             |
| Transactions D1 actor-local concurrency               | kept; versions and contested fields cover cross-actor races       |
| definitions list operations                           | a value in `operations` may also be a group of operations (2.4)   |

**Probably affected, unverified:** decision 6's own form, `optimistic: [O.ticketById.setData(({
input }) => …)]`, nests a lambda the same way the spike showed cannot be typed.

### 13.2 Resources and streams

| Change                                   | Why                                                    |
| ---------------------------------------- | ------------------------------------------------------ |
| `loads`, `notFound`                      | the canonical loader and deletion                      |
| `depends` (required), `on`               | repair                                                 |
| `shape` on loader subscriptions          | store-first reads                                      |
| `feeds` on streams                       | feeds, including multiplexed ones                      |
| `pages`, `cursor`, `fetchMore`           | infinite lists without copies in memory; decided separately |
| `data` renamed `result`                  | optional; decided separately                           |

### 13.3 New exports, checks and diagnostics

| Kind              | Added                                                                          |
| ----------------- | ------------------------------------------------------------------------------ |
| exports           | `entity`, `EntityChange`, `invalidate`; on entities: `Key`, `keyOf`, `keyString`, `pick`, `detached`, `get`, `patch`, `upsert`, `remove`, `insert`, `keys`, `all` |
| diagnostics       | `WhenViolated`, `FieldDisagrees`, `ContestLoop`, `RepairMissed`, `AuditSkipped`, `FixtureInert`, `RepairUnaudited` |
| `flow check`      | the rules in section 10.5                                                      |
| CLI               | `flow trace entity`, `flow trace refetch`                                      |

The entity exports live at `flow-state/entities` (section 1.2).

### 13.4 What the core must decide now

Entities can be added after version 1 of the core only if the core does not close these doors.
Each is a decision for `minimal-library.md`, independent of entities:

| Core decision                          | Why entities need it                                             |
| -------------------------------------- | ---------------------------------------------------------------- |
| decision 6's `optimistic` as `(input) => [...]` | the spike found the nested-lambda array cannot be typed; both forms should share one shape |
| `pages`, `cursor`, `fetchMore`         | infinite lists without copies in memory, needed with or without entities |
| `data` or `result` for a resource's Schema | one name across both, chosen once                            |
| snapshots may carry a store revision   | `Note.get` and checkpoints read records at the snapshot's moment |
| lane statuses and `pending`            | loader lanes and `Note.get` entries reuse 8a's entry type        |
| outcome members can be added per family | `deleted` on loader subscriptions                               |
| operation groups in definitions        | the entity-first layout (`O.Notes.byId`); useful without entities too |

---

## 14. Version 2

| Deferred                                      | Version 1 instead                                    | Cost of waiting                              |
| --------------------------------------------- | ---------------------------------------------------- | -------------------------------------------- |
| loader subscriptions over key arrays          | embed picks, or a `usersByIds` resource              | one extra resource per view joining by key   |
| loader subscriptions for feed-only records    | a single-record resource that is not a loader        | no store-first reads for them                |
| entities with variant shapes (file or folder) | separate entities in a union array                   | one entity per variant                       |
| server-key creates and re-keying              | the pending create is shown from machine memory      | no instant row in other screens              |
| placement without the entering refetch        | placement plus a coalesced refetch                   | chat refetches the newest page per burst     |
| feed throttling options                       | feeds apply each batch in one turn                   | high-rate feeds publish often                |
| `forbidden` tags that evict like `notFound`    | one Runtime per principal                            | a revoked record stays until a refetch       |
| derived counts from declared relations        | counts refetch when the change settles               | a count lags one round trip                  |
| persisting overlays; offline queues           | a reload shows confirmed data and repairs unknowns   | no offline-first apps                        |
| sync engines with their own client store      | feeds and `Confirm` keep the door open (section 15.1) | no engine adapters                          |

## 15. Rules for agents

1. Start without entities. Declare one when the same server record shows in more than one place or
   changes under a command shown elsewhere, including the current user. Build every result that
   carries it from the entity or its picks.
2. Every read is a `resource`, every write a `transaction`, every feed a `stream`. Once the app has
   an entity, each states its relation to entities: a loader `loads`, an answer `depends`, a
   command `result`/`optimistic`/`affects`, a feed `feeds`; or `"none"`.
3. An `on` entry says which records can be in the answer (`when`). List in `ignoreChanges` only
   fields that are purely displayed or only decide membership; when unsure, leave a field out.
4. A command says what it changes. Its optimistic operations touch only the records it acts on;
   everything else repairs when it settles. Ids and times arrive in the event payload.
5. Machines decide; the store keeps copies true. Machines hold keys and drafts, never copies, and
   never refetch what `depends` repairs. Selectors may sort, group and filter for presentation;
   they never re-implement a server's membership rule.
6. Every entity-aware operation runs in a Story with a stateful fixture, so the repair audit checks
   it.
7. Lay the app out by entity: `note.entity.ts` for the identity, `notes.ts` for its operations
   grouped as `Notes` in the order loader, questions, commands, feed. Machines use `O.Notes.…`.
   Never wrap the builders in helpers of your own.

### 15.1 Sync engines: how the door stays open

| Constraint (`entities.md`)              | Met by                                                         |
| --------------------------------------- | -------------------------------------------------------------- |
| one path for entity changes             | `upsert`/`delete` with ordering metadata                       |
| answers maintained by a source          | internal: refetch today; an engine could maintain answers live |
| keys as records of primitives           | `primaryKey`                                                   |
| opaque comparable versions              | `version` (a `compare` option can be added for engines)        |
| reads propagate                         | section 6.2, and reads trigger repair (section 6.4)            |
| confirmation by the source              | `EntityChange.Confirm(attemptId)`                              |
| optimistic changes optional per command | `optimistic` is optional                                       |
| persistence owned by the source         | a future engine source would declare it                        |

## 16. Open questions

- **The optimistic probe and O1.** Running `optimistic` once at construction is the one exception to
  "construction runs no user callbacks". The alternative is declaring the sequence twice (a static
  list of entity kinds, plus the function for keys and fields). Is the exception acceptable?
- **The snapshot revision.** `Note.get` needs the snapshot to carry its store revision, which D22
  moved to inspection. Is that acceptable, or should records be read only through lanes?
- **Convergence proof.** A property test driving random interleavings of reads, pushes, commands,
  failures, `unknown`s, contests, placements, hiding and reconnects against a stateful fake server;
  every answer must equal the server's once it is quiet. `FieldDisagrees` and `ContestLoop` must
  never fire against a consistent server.
- **Hiding by `when` in production.** The self-check runs everywhere and never hides a record its
  own entry returned violating `when`. Is that enough?
- **`depends: "none"` noise.** Once an app has one entity, every entity-free resource writes it. It
  turns the most common silent failure into an error; is the token worth it, or should the
  requirement apply only to resources subscribed by machines that commit entity transactions?
- **Instant derived counts.** Counts now lag one round trip after a move. Is a selector over held
  records enough, or does version 2 need declared relations (section 14)?

## 17. The entity-centric proposal

`entity-centric-proposal.md` (draft 8) put every operation involving an entity on that entity's
members (`Note.members({ load, read, write })`), with a base layer for everything else. It was
written to the same scope as this proposal, and both were reviewed with the same lenses.

**Why this proposal was chosen.** Judged on correctness, ease of writing for agents, verification
with the CLI, Stories, and runtime orchestration:

- the runtime, Stories and CLI are the same in both, by construction;
- this proposal closes more silent mistakes, because every operation must state its relation to
  entities, while the entity-centric design depended on the agent choosing the right layer first
  (a count written as a base resource was silent there);
- the entity-centric design's advantages were its layout and its namespace, and section 2.4
  delivers both as a convention over one vocabulary;
- adopting an entity here adds fields; there it renamed operations in every machine.

**What was given up:** `when` written inline beside `key`, typed directly, instead of through
`depends: (on) => [on(Note, { when })]`.

**Still to verify.** The judgement above comes from reading. An experiment should confirm it:
several agents write the same features (comments with a live feed, a bulk archive with a count
badge, the current user's avatar, a board drag) in this design, and their mistakes are counted by
what catches them: types, `flow check`, the repair audit, or nothing.

## 18. Review record

**Draft 7** (after discussion with the user, no new reviews):

| Change                                                              | Section       |
| ------------------------------------------------------------------- | ------------- |
| the entity-centric design folded in as code organisation            | 2.4, 15       |
| operation groups in definitions, the one core addition              | 2.4, 13       |
| examples use `O.Notes.…`                                            | 3, 7, 11      |
| the entity-centric proposal superseded, with the reasons            | 17            |

**Draft 6** (after discussion with the user, no new reviews):

| Change                                                              | Section       |
| ------------------------------------------------------------------- | ------------- |
| entities are an optional extension, adopted one entity at a time    | 1.2           |
| call-site cache effects are an error on resources holding an entity | 1.2, 10.5     |
| machines coordinate; the store only keeps copies true               | 1.3           |
| optimistic operations touch one entity type at keys from the input  | 5.1           |
| the store accessor in `optimistic` is removed                       | 5.1, 7.3      |
| cross-entity count guesses removed; counts repair on settle         | 5, 11         |
| what the core must decide now so entities can be added later        | 13.4          |

**Draft 5** applied the reviews below.

Seven Sonnet reviews of draft 4: correctness, simplicity, agent experience compared head to head,
generality, consistency and tooling, a TypeScript spike, and a head-to-head judgement. Each finding
below was checked against the text; the spike was re-run.

**Accepted and applied** (✱ marks shared-runtime fixes, applied to both proposals):

| Review                   | Finding                                                            | Change                                       |
| ------------------------ | ------------------------------------------------------------------ | -------------------------------------------- |
| correctness ✱            | a lower version could overwrite a higher one                       | lower versions rejected; picks carry the version, 6.3 |
| correctness ✱            | an `unknown` overlay never ended                                   | ends at the forced repair, 5.4               |
| correctness ✱            | `notFound` racing a create deleted the new record                  | 6.6                                          |
| correctness ✱            | two shapes disagreeing on a field repaired each other forever      | `FieldDisagrees`, one meaning per field, 2 and 6.3 |
| correctness ✱            | reconnects and invalidation missed loaders and nested holders      | one stale floor, 6.5                         |
| correctness ✱            | deletes of unheld keys repaired nothing                            | unknown fields match, 6.4 and 6.5            |
| correctness ✱            | retrying an `unknown` create could be a defect                     | overlays belong to their attempt, 5.2        |
| correctness ✱            | contests fired on identical values and could not end               | values must differ; released when unheld, 6.3 |
| correctness ✱            | held fields could wait forever                                     | store-first reads look up; dropped with the record, 6.5 |
| correctness ✱            | "before" was the admission base, missing answers moved meanwhile   | the base just before the write, plus holders, 6.4 |
| correctness ✱            | single slots and several arrays were undefined for hiding          | 4.5                                          |
| correctness ✱            | pages: late `fetchMore`, duplicates, per-page judging              | 4.8                                          |
| correctness ✱            | the fence admitted lookups started before the change               | "started after the change", 6.4              |
| correctness ✱            | persisted lists leaked fields of non-persisted loaders             | only projected fields persist, 6.7           |
| types ✱                  | `depends: [Note.changes({ when })]` and `affects: [E.keys((i) => …)]` cannot be typed | `depends: (on) => [...]`, `affects: (input) => [...]` |
| simplicity, consistency  | a loader recognised by shape cannot be recognised at runtime      | `loads: Note`, 3                             |
| simplicity               | `notFound` on non-loaders had no defined target                    | loaders only                                 |
| simplicity               | stream `entity` plus `shape` was redundant                         | `feeds`, 8                                   |
| simplicity ✱             | `ignoreChanges: "all"` overloaded a field list                     | `refresh: "manual"`, 4.4                     |
| simplicity ✱             | `place` was a closure for a constant                               | `"start"` or `"end"`                         |
| simplicity ✱             | three `get`s with different argument orders                        | `Note.get(source, key, shape?)`, 7.3         |
| simplicity               | `Note.invalidate()` sat outside `O` and duplicated `affects`       | the action `invalidate(Note.all)`, 7.1       |
| simplicity               | conditional `input` requirement                                   | always required                              |
| agent UX, generality     | counts and bulk writes that name no entity were silent             | `depends` and the transaction relation are required, 4.1 and 5 |
| agent UX                 | a stream carrying entities could skip `feeds`                     | `flow check` error, 8                        |
| agent UX ✱               | the audit could pass vacuously                                     | `FixtureInert`, 10.3                         |
| generality ✱             | `WhenFieldIgnored` forbade the live-map case for no gain           | removed: an ignored `when` field refetches on enter or leave, 4.3 |
| generality               | real change streams carry several entity types                     | `feeds: [Note, Folder]`, 8                   |
| generality ✱             | sparse records (an empty cell) had no optimistic form              | `upsert`, 5.1                                |
| generality ✱             | unions in arrays were unspecified                                  | 4.6                                          |
| generality ✱             | "selectors never filter" over-reached                              | presentation filters allowed, 4.5            |
| consistency ✱            | defects kept optimistic values, against decision 6                 | defects revert and repair, 5.4               |
| consistency ✱            | optimistic writes applied at admission, against decision 6         | apply when the commit starts, 5.1            |
| consistency ✱            | the O1 exception and the snapshot revision were undeclared         | 13.1 and 16                                  |
| consistency ✱            | `.emit` was a test-only escape                                     | feed fixtures on the Runtime clock, 10.1     |
| consistency ✱            | ids "in `.from`" had no sanctioned source                          | ids arrive in the event payload, 5.1         |
| consistency ✱            | the coalescing window was an untestable clock setting              | coalesce per drain, 6.4                      |
| consistency ✱            | examples broke rules (bare failure events, missing fields, wrong claims) | fixed, 4.6 and 11                      |
| consistency ✱            | new exports, checks and CLI commands were unlisted                 | 13.3                                         |
| comparison               | section 17 overstated both sides                                   | corrected                                    |

**Rejected, with reasons:**

- **Simplicity: cut `pages` from the proposal.** Kept, marked as a shared resource change decided
  separately, because memory cannot hold copies and both proposals need it.
- **Simplicity: cut `place` to version 2 (function form).** The constant form is kept in version 1;
  conditional placement is not needed once paged placement is a fixed rule.
- **Consistency: make the optimistic sequence static data.** Declaring the kinds twice would be a
  second source of truth; the probe exception is put to the user instead (section 16).
- **Agent UX: `RepairUnaudited` as an error in CI.** Left to project configuration.
- **Generality: aggregates adjusted by optimistic resource writes.** The entity-field idiom covers
  it (`Label.unreadCount`); a resource write would reintroduce `setData`.
- **Generality: declared relations and polymorphic entities in version 1.** Kept in version 2.
- **Comparison: adopt the entity-centric home for counts.** Required `depends` closes the same hole
  without a home.
